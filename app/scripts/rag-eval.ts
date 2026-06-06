/**
 * Projekt-RAG Eval-Harness — misst Trefferqualität, statt blind zu tunen.
 *
 *   npm run rag:eval -- --vault "<VAULT>" --project "100 - ✅ Projekte/<Projekt>" \
 *       --tests scripts/rag-eval.example.json [--rerank --chatModel qwen3.5:4b]
 *
 * Ohne --project listet es die markierten Projekte. Ohne --tests erklärt es das
 * Test-Format. Mit --tests baut es den Index (inkrementell) und vergleicht mehrere
 * Retrieval-Konfigurationen über dein Test-Set:
 *
 *   Test-Datei (JSON):
 *   { "model": "bge-m3",
 *     "cases": [ { "query": "Frage…", "expected": ["Dateiname-Fragment", "pfad/teil"] } ] }
 *
 * `expected` = Liste von Teilstrings, die im erwarteten Datei-Pfad (fileRel)
 * vorkommen sollen (case-insensitive). Ein Treffer = die erwartete Datei taucht
 * in den Top-k auf. Metriken: Hit@1/3/5, Recall@5, MRR.
 *
 * Privacy: alles lokal über Ollama (localhost:11434).
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import { buildOrUpdateIndex } from '../src/main/rag/index'
import { embedText } from '../src/main/rag/embed'
import { cosineSimilarity, keywordOverlapScore } from '../src/shared/rag/similarity'
import { discoverProjects } from '../src/main/projectStatus/discovery'
import type { RagChunk } from '../src/shared/rag/types'

const OLLAMA_LOCAL_URL = 'http://localhost:11434'

// ── Argument-Parsing ────────────────────────────────────────────────────────
function parseArgs(argv: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) continue
    const key = a.slice(2)
    const next = argv[i + 1]
    if (next && !next.startsWith('--')) { out[key] = next; i++ } else { out[key] = true }
  }
  return out
}

// ── Vault-Guard (ersetzt assertSafePath headless) ───────────────────────────
function makeGuard(vault: string) {
  const root = path.resolve(vault)
  return async (p: string): Promise<string> => {
    const resolved = path.resolve(p)
    if (resolved !== root && !resolved.startsWith(root + path.sep)) {
      throw new Error(`Pfad außerhalb des Vaults: ${p}`)
    }
    return resolved
  }
}

// ── Test-Typen ──────────────────────────────────────────────────────────────
interface TestCase { query: string; expected: string[] }
interface TestFile { model?: string; cases: TestCase[] }

function matchesExpected(fileRel: string, expected: string[]): boolean {
  const f = fileRel.toLowerCase()
  return expected.some(e => f.includes(e.toLowerCase()))
}

/** Rangliste der Chunks → deduplizierte Datei-Rangliste (erste Vorkommen). */
function rankFiles(scored: Array<{ chunk: RagChunk; score: number }>): string[] {
  const ordered = [...scored].sort((a, b) => b.score - a.score)
  const files: string[] = []
  const seen = new Set<string>()
  for (const s of ordered) {
    if (!seen.has(s.chunk.fileRel)) { seen.add(s.chunk.fileRel); files.push(s.chunk.fileRel) }
  }
  return files
}

function firstHitRank(files: string[], expected: string[]): number {
  for (let i = 0; i < files.length; i++) if (matchesExpected(files[i], expected)) return i + 1
  return 0
}
function recallAtK(files: string[], expected: string[], k: number): number {
  const top = files.slice(0, k)
  let found = 0
  for (const e of expected) if (top.some(f => f.toLowerCase().includes(e.toLowerCase()))) found++
  return expected.length ? found / expected.length : 0
}

// ── LLM-Reranker (spiegelt main ollama-rerank-pair) ─────────────────────────
async function rerankPair(chatModel: string, query: string, doc: string): Promise<number> {
  const system = 'Du bewertest die Relevanz eines Dokuments für eine Suchanfrage. Antworte AUSSCHLIESSLICH mit JSON: {"relevance": <Zahl 0..1>}. Keine Erklärung.'
  const user = `Suchanfrage: ${query}\n\nDokument:\n${doc.slice(0, 1500)}`
  try {
    const res = await fetch(`${OLLAMA_LOCAL_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: chatModel,
        messages: [{ role: 'system', content: system }, { role: 'user', content: `/no_think\n${user}` }],
        stream: false,
        think: false,
        options: { temperature: 0 }
      }),
      signal: AbortSignal.timeout(30000)
    })
    if (!res.ok) return 0
    const data = await res.json() as { message?: { content?: string } }
    const content = data.message?.content || ''
    const m = content.match(/"?relevance"?\s*:\s*([01](?:\.\d+)?)/i) || content.match(/\b([01](?:\.\d+)?)\b/)
    return m ? Math.max(0, Math.min(1, parseFloat(m[1]))) : 0
  } catch {
    return 0
  }
}

// ── Konfigurationen ─────────────────────────────────────────────────────────
interface Config { name: string; weight: number; rerank?: boolean }

async function scoreConfig(
  cfg: Config,
  queryVec: number[],
  query: string,
  chunks: RagChunk[],
  chatModel: string
): Promise<string[]> {
  // Basis: Hybrid (cosine + keyword), exakt wie retrieve().
  const base = chunks.map(c => ({
    chunk: c,
    score: cosineSimilarity(queryVec, c.embedding) * (1 - cfg.weight) + keywordOverlapScore(query, c.text) * cfg.weight
  }))
  if (!cfg.rerank) return rankFiles(base)

  // Reranker: Top-Pool per Basis-Score → LLM-Judge bewertet jeden Chunk.
  const POOL = 15
  const pool = [...base].sort((a, b) => b.score - a.score).slice(0, POOL)
  const reranked: Array<{ chunk: RagChunk; score: number }> = []
  for (const p of pool) {
    const rel = await rerankPair(chatModel, query, p.chunk.text)
    reranked.push({ chunk: p.chunk, score: rel })
  }
  return rankFiles(reranked)
}

// ── Hauptlauf ─────────────────────────────────────────────────────────────
async function main() {
  const args = parseArgs(process.argv.slice(2))
  const vault = typeof args.vault === 'string' ? args.vault : ''
  if (!vault) {
    console.error('Fehlt: --vault "<VAULT-Pfad>"')
    process.exit(1)
  }
  const guard = makeGuard(vault)
  const projectsRoot = typeof args.projectsRoot === 'string' ? args.projectsRoot : '100 - ✅ Projekte'

  // Ohne --project: Projekte auflisten.
  const project = typeof args.project === 'string' ? args.project : ''
  if (!project) {
    const projects = await discoverProjects(vault, projectsRoot)
    console.log(`\nMarkierte Projekte unter „${projectsRoot}":\n`)
    for (const p of projects) console.log(`  --project "${p.folderRel}"   (${p.marker.keywords.join(', ')})`)
    if (projects.length === 0) console.log('  (keine — _STATUS.md-Marker fehlen)')
    console.log('\nDann: ... --project "<obiges>" --tests scripts/rag-eval.example.json\n')
    return
  }

  // Index bauen/aktualisieren.
  const tests = typeof args.tests === 'string' ? args.tests : ''
  const embedModel = typeof args.model === 'string'
    ? args.model
    : (tests ? (JSON.parse(await fs.readFile(tests, 'utf-8')) as TestFile).model || 'bge-m3' : 'bge-m3')

  console.log(`\n[Index] baue/aktualisiere „${project}" (Modell ${embedModel}) …`)
  const index = await buildOrUpdateIndex(vault, project, embedModel, guard, (done, total) => {
    if (total > 0 && done % 10 === 0) process.stdout.write(`\r[Index] embed ${done}/${total}`)
  })
  const fileCount = new Set(index.chunks.map(c => c.fileRel)).size
  console.log(`\n[Index] ${index.chunks.length} Chunks aus ${fileCount} Datei(en).`)

  if (!tests) {
    console.log('\nKein --tests angegeben. Lege eine JSON-Datei an:')
    console.log('  { "model": "bge-m3", "cases": [ { "query": "…", "expected": ["Dateiname"] } ] }')
    console.log('Dann erneut mit --tests <pfad> aufrufen.\n')
    return
  }

  const testData = JSON.parse(await fs.readFile(tests, 'utf-8')) as TestFile
  const cases = testData.cases || []
  if (cases.length === 0) { console.error('Test-Datei hat keine cases.'); process.exit(1) }

  // Query-Embeddings einmal berechnen.
  console.log(`[Eval] embedde ${cases.length} Test-Queries …`)
  const queryVecs: number[][] = []
  for (const c of cases) queryVecs.push(await embedText(embedModel, c.query))

  // Konfigurationen.
  const chatModel = typeof args.chatModel === 'string' ? args.chatModel : 'qwen3.5:4b'
  const configs: Config[] = [
    { name: 'cosine-only', weight: 0 },
    { name: 'hybrid-0.25 (live)', weight: 0.25 },
    { name: 'hybrid-0.50', weight: 0.5 }
  ]
  if (args.rerank) {
    configs.push({ name: `rerank(${chatModel})`, weight: 0.25, rerank: true })
  }

  // Auswerten.
  interface Agg { hit1: number; hit3: number; hit5: number; recall5: number; rr: number }
  const results: Array<{ cfg: Config; agg: Agg; ranks: number[] }> = []
  for (const cfg of configs) {
    const agg: Agg = { hit1: 0, hit3: 0, hit5: 0, recall5: 0, rr: 0 }
    const ranks: number[] = []
    for (let i = 0; i < cases.length; i++) {
      const files = await scoreConfig(cfg, queryVecs[i], cases[i].query, index.chunks, chatModel)
      const rank = firstHitRank(files, cases[i].expected)
      ranks.push(rank)
      if (rank === 1) agg.hit1++
      if (rank >= 1 && rank <= 3) agg.hit3++
      if (rank >= 1 && rank <= 5) agg.hit5++
      agg.recall5 += recallAtK(files, cases[i].expected, 5)
      agg.rr += rank > 0 ? 1 / rank : 0
    }
    const n = cases.length
    agg.hit1 /= n; agg.hit3 /= n; agg.hit5 /= n; agg.recall5 /= n; agg.rr /= n
    results.push({ cfg, agg, ranks })
  }

  // Tabelle.
  const pct = (x: number) => `${(x * 100).toFixed(0)}%`.padStart(5)
  console.log(`\n=== Eval-Ergebnis (${cases.length} Queries, Projekt „${project}") ===\n`)
  console.log('Konfiguration'.padEnd(24) + 'Hit@1  Hit@3  Hit@5  Rec@5   MRR')
  console.log('-'.repeat(60))
  for (const r of results) {
    console.log(
      r.cfg.name.padEnd(24) +
      pct(r.agg.hit1) + '  ' + pct(r.agg.hit3) + '  ' + pct(r.agg.hit5) + '  ' +
      pct(r.agg.recall5) + '  ' + r.agg.rr.toFixed(2).padStart(5)
    )
  }

  // Pro-Query erste-Treffer-Ränge der Live-Config (Misses sichtbar machen).
  const live = results.find(r => r.cfg.weight === 0.25 && !r.cfg.rerank)
  if (live) {
    console.log(`\nPro-Query (Config „${live.cfg.name}", Rang der ersten erwarteten Datei; 0 = nicht in Liste):`)
    for (let i = 0; i < cases.length; i++) {
      const r = live.ranks[i]
      const flag = r === 0 ? ' ❌ MISS' : r > 5 ? ' ⚠️ tief' : ''
      console.log(`  [${String(r).padStart(2)}] ${cases[i].query.slice(0, 70)}${flag}`)
    }
  }
  console.log('')
}

main().catch(err => { console.error('\n[rag-eval] Fehler:', err instanceof Error ? err.message : err); process.exit(1) })
