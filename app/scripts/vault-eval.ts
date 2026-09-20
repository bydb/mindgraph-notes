/**
 * Vault-Chat Eval-Harness (Phase 3, Entscheidung 17): misst Trefferqualität und Verweigerung
 * am ECHTEN Vault-Index, statt Schwellen blind zu drehen. Läuft headless in Node, alles lokal
 * über Ollama (localhost:11434).
 *
 *   npm run vault:eval -- --vault "<VAULT>" --cases "<VAULT>/.mindgraph/rag-eval/questions.tuning.json"
 *       [--sweep] [--answer] [--chatModel qwen3.8:27b-mlx] [--model bge-m3]
 *       [--topK 8] [--floor 0.30] [--cap 2] [--out <ordner>]
 *
 * Fragen-Datei (JSON):
 *   { "cases": [
 *       { "id": "hitzel-1", "kind": "positive", "question": "…",
 *         "expected": ["Neubewertung Stelle Hitzel"], "note": "frei formuliert, ohne Namen" },
 *       { "id": "neg-1", "kind": "negative", "question": "…" } ] }
 *
 * `expected` = Teilstrings des erwarteten Dateipfads (fileRel, ohne Groß/Klein). Positiv-Fälle
 * gelten als Treffer, wenn eine erwartete Datei unter den gelieferten Quellen ist; Negativ-
 * Fälle gelten als richtig, wenn die Abfrage unter dem Floor „nichts gefunden“ meldet.
 *
 * Kennzahlen je Konfiguration: Hit@K, MRR, mittlerer Rang der erwarteten Datei unter den
 * Kandidaten (Diagnose), Verweigerung: Precision/Recall (Negativ-Fälle verweigert vs. Positiv-
 * Fälle fälschlich verweigert). Mit --answer zusätzlich pro Frage: Antwort des Chat-Modells,
 * Prüfzeile (Sätze ohne Quelle, niedrige Deckung, ungültige Nummern, Zitate) und ein
 * Markdown-Protokoll mit Bewertungsfeld für die Handbewertung (falsch grün / falsch rot).
 *
 * Die Frage wird pro Fall EINMAL eingebettet; alle Konfigurationen rechnen auf demselben Vektor.
 */

import * as fs from 'fs/promises'
import * as os from 'os'
import * as path from 'path'
import { embedText } from '../src/main/rag/embed'
import { resolveLocalModel } from '../src/main/rag/localModel'
import { loadVaultIndexFile, listVaultIndexFiles, vaultRagDir } from '../src/main/rag/vaultStore'
import { rankCandidates, selectHits, verifyHits, DEFAULT_VAULT_TOP_K, DEFAULT_VAULT_MIN_SCORE, DEFAULT_PER_FILE_CAP, DEFAULT_OVERSAMPLE, type VaultHit } from '../src/main/rag/vaultRetrieve'
import { buildVaultPrompt } from '../src/main/rag/vaultPrompt'
import { analyzeCitations } from '../src/shared/rag/citations'
import type { VaultIndexContainer } from '../src/shared/rag/vaultIndex'

const OLLAMA = 'http://localhost:11434'

function arg(name: string, def?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  if (i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) return process.argv[i + 1]
  return def
}
const flag = (name: string): boolean => process.argv.includes(`--${name}`)

const vault = arg('vault')
const casesFile = arg('cases')
if (!vault || !casesFile) {
  console.error('usage: --vault <pfad> --cases <fragen.json> [--sweep] [--answer] [--chatModel m] [--model bge-m3] [--topK 8] [--floor 0.30] [--cap 2] [--out <ordner>]')
  process.exit(1)
}
const embedModel = arg('model', 'bge-m3')!
const chatModel = arg('chatModel', 'qwen3.8:27b-mlx')!
const answerMode = flag('answer')

interface EvalCase { id: string; kind: 'positive' | 'negative'; question: string; expected?: string[]; note?: string }
interface Config { name: string; topK: number; floor: number; cap: number }

let vaultReal = ''
const assertSafePath = async (p: string): Promise<string> => {
  const resolved = path.resolve(p)
  let real: string
  try { real = await fs.realpath(resolved) } catch { real = path.join(await fs.realpath(path.dirname(resolved)), path.basename(resolved)) }
  if (!real.startsWith(vaultReal + path.sep) && real !== vaultReal) throw new Error(`außerhalb des Vaults: ${p}`)
  return real
}

// Spiegel von main/index.ts:sanitizeUntrustedText (dort nicht exportiert; headless identisch halten).
function sanitizeUntrustedText(text: string): string {
  return text
    .replace(/<[^>]*>/g, ' ')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/[\u200B-\u200F\u2028\u2029\u2060\uFEFF]/g, '')
    .replace(/[\u202A-\u202E\u2066-\u2069]/g, '')
    .replace(/BEGIN_EMAIL_DATA|END_EMAIL_DATA|BEGIN_UNTRUSTED_CONTEXT|END_UNTRUSTED_CONTEXT/g, '[MARKER]')
    .replace(/(?:ignore|ignoriere|vergiss|disregard|override|überschreibe)\s+(?:all\s+)?(?:previous|vorherige|obige|above|prior)\s+(?:instructions?|anweisungen?|instruktionen?)/gi, '[ENTFERNT]')
    .replace(/(?:system\s*prompt|systemnachricht|neue\s+rolle|new\s+role|change\s+(?:your\s+)?instructions?)/gi, '[ENTFERNT]')
    .replace(/```[\s\S]*?```/g, '[CODE-BLOCK]')
    .trim()
}

const matchesExpected = (fileRel: string, expected: string[]): boolean => {
  const f = fileRel.toLowerCase()
  return expected.some((e) => f.includes(e.toLowerCase()))
}

async function readExcludes(): Promise<string[]> {
  try {
    const raw = JSON.parse(await fs.readFile(path.join(vaultReal, '.mindgraph', 'vault-settings.json'), 'utf-8')) as { vaultRag?: { excludeFolders?: string[] } }
    return raw.vaultRag?.excludeFolders ?? []
  } catch { return [] }
}

async function chat(system: string, user: string): Promise<string> {
  const res = await fetch(`${OLLAMA}/api/chat`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: chatModel, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], stream: false, think: false })
  })
  if (!res.ok) throw new Error(`Ollama /api/chat ${res.status}`)
  const json = (await res.json()) as { message?: { content?: string } }
  return (json.message?.content ?? '').replace(/\r\n?/g, '\n').replace(/[\uE000-\uF8FF]/g, '')
}

interface CaseRun {
  id: string; kind: 'positive' | 'negative'; question: string; expected: string[]
  belowFloor: boolean; bestScore: number | null
  hits: Array<{ fileRel: string; score: number; heading: string; startLine: number }>
  hit: boolean | null; rank: number | null; candidateRank: number | null
  answer?: string; check?: string; sources?: string[]
}

async function runConfig(container: VaultIndexContainer, cfg: Config, cases: EvalCase[], vecs: Map<string, Float32Array>, excludes: string[]): Promise<CaseRun[]> {
  const out: CaseRun[] = []
  for (const c of cases) {
    const qv = vecs.get(c.id)!
    // Kandidatentiefe für die Diagnose fest (100), unabhängig von K — sonst wandert der
    // „Kandidatenrang“ mit der Konfiguration.
    const ranked = rankCandidates(container, qv, undefined, Math.max(cfg.topK * DEFAULT_OVERSAMPLE, 100), excludes)
    const bestScore = ranked.length ? ranked[0].score : null
    const expected = c.expected ?? []
    // Diagnose: Rang der erwarteten Datei unter ALLEN Kandidaten (nach Datei dedupliziert)
    let candidateRank: number | null = null
    if (expected.length) {
      const seen = new Set<string>()
      let r = 0
      for (const cand of ranked) {
        const rel = container.meta.chunks[cand.row].fileRel
        if (seen.has(rel)) continue
        seen.add(rel); r++
        if (matchesExpected(rel, expected)) { candidateRank = r; break }
      }
    }
    if (bestScore === null || bestScore < cfg.floor) {
      out.push({ id: c.id, kind: c.kind, question: c.question, expected, belowFloor: true, bestScore, hits: [], hit: c.kind === 'positive' ? false : null, rank: null, candidateRank })
      continue
    }
    const passing = ranked.slice(0, cfg.topK * DEFAULT_OVERSAMPLE).filter((r) => r.score >= cfg.floor)
    const selected = selectHits(container, passing, cfg.topK, cfg.cap)
    const { hits } = await verifyHits(vaultReal, container, selected, assertSafePath, undefined)
    const files: string[] = []
    for (const h of hits) if (!files.includes(h.fileRel)) files.push(h.fileRel)
    const rank = expected.length ? files.findIndex((f) => matchesExpected(f, expected)) + 1 || null : null
    out.push({
      id: c.id, kind: c.kind, question: c.question, expected, belowFloor: false, bestScore,
      hits: hits.map((h: VaultHit) => ({ fileRel: h.fileRel, score: h.score, heading: h.heading, startLine: h.startLine })),
      hit: c.kind === 'positive' ? rank !== null : null, rank, candidateRank
    })
  }
  return out
}

function summarize(runs: CaseRun[]): Record<string, number | string> {
  const pos = runs.filter((r) => r.kind === 'positive')
  const neg = runs.filter((r) => r.kind === 'negative')
  const hits = pos.filter((r) => r.hit).length
  const mrr = pos.length ? pos.reduce((s, r) => s + (r.rank ? 1 / r.rank : 0), 0) / pos.length : 0
  const ranks = pos.map((r) => r.candidateRank).filter((x): x is number => x !== null)
  const meanCandRank = ranks.length ? ranks.reduce((a, b) => a + b, 0) / ranks.length : NaN
  const refusedNeg = neg.filter((r) => r.belowFloor).length
  const refusedPos = pos.filter((r) => r.belowFloor).length
  const refusedAll = refusedNeg + refusedPos
  return {
    'Positiv': pos.length, 'Hit@K': pos.length ? `${hits}/${pos.length} (${Math.round((100 * hits) / pos.length)} %)` : '–',
    'MRR': mrr.toFixed(2), 'Ø Kandidatenrang': Number.isNaN(meanCandRank) ? '–' : meanCandRank.toFixed(1),
    'Negativ': neg.length, 'verweigert (neg)': neg.length ? `${refusedNeg}/${neg.length}` : '–',
    'fälschlich verweigert (pos)': `${refusedPos}/${pos.length}`,
    'Verweigerung Precision': refusedAll ? (refusedNeg / refusedAll).toFixed(2) : '–',
    'Verweigerung Recall': neg.length ? (refusedNeg / neg.length).toFixed(2) : '–'
  }
}

async function main(): Promise<void> {
  vaultReal = await fs.realpath(vault!)
  const raw = JSON.parse(await fs.readFile(casesFile!, 'utf-8')) as { cases: EvalCase[] }
  const cases = raw.cases
  if (!cases?.length) { console.error('keine Fälle in der Fragen-Datei'); process.exit(1) }
  const excludes = await readExcludes()
  const outDir = arg('out', path.join(vaultReal, '.mindgraph', 'rag-eval', 'results'))!
  await fs.mkdir(outDir, { recursive: true })

  const files = await listVaultIndexFiles(vaultRagDir(vaultReal), assertSafePath)
  const newest = files.sort((a, b) => b.mtime - a.mtime)[0]
  if (!newest) { console.error('kein Vault-Index — erst in der App „Vault-Index erstellen“'); process.exit(2) }
  const container = await loadVaultIndexFile(newest.file)
  if (!container) { console.error('Index nicht lesbar'); process.exit(3) }
  const identity = container.meta.identity
  const model = await resolveLocalModel(embedModel, { fresh: true })
  if (model.digest !== identity.digest) { console.error(`Index-Digest passt nicht zu ${embedModel} (${model.digest}) — Index neu aufbauen`); process.exit(4) }
  console.log(`Vault: ${vaultReal}\nIndex: ${path.basename(newest.file)} · ${container.meta.chunks.length} Chunks · Ausschlüsse: ${excludes.join(', ') || '–'}\nFälle: ${cases.length} (${cases.filter((c) => c.kind === 'positive').length} positiv, ${cases.filter((c) => c.kind === 'negative').length} negativ)\n`)

  const vecs = new Map<string, Float32Array>()
  const t0 = Date.now()
  for (const c of cases) vecs.set(c.id, Float32Array.from(await embedText(embedModel, c.question)))
  console.log(`Fragen eingebettet: ${cases.length} in ${Date.now() - t0} ms\n`)

  const base: Config = { name: 'aktuell', topK: Number(arg('topK', String(DEFAULT_VAULT_TOP_K))), floor: Number(arg('floor', String(DEFAULT_VAULT_MIN_SCORE))), cap: Number(arg('cap', String(DEFAULT_PER_FILE_CAP))) }
  const configs: Config[] = [base]
  if (flag('sweep')) {
    for (const floor of [0.3, 0.4, 0.45, 0.5, 0.55]) for (const topK of [5, 8, 12]) for (const cap of [1, 2, 3]) {
      if (floor === base.floor && topK === base.topK && cap === base.cap) continue
      configs.push({ name: `K${topK} floor${floor} cap${cap}`, topK, floor, cap })
    }
  }

  const results: Record<string, { config: Config; summary: Record<string, number | string>; runs: CaseRun[] }> = {}
  for (const cfg of configs) {
    const runs = await runConfig(container, cfg, cases, vecs, excludes)
    results[cfg.name] = { config: cfg, summary: summarize(runs), runs }
  }

  // Tabelle
  const keys = Object.keys(results[base.name].summary)
  const widths = keys.map((k) => Math.max(k.length, ...Object.values(results).map((r) => String(r.summary[k]).length)) + 2)
  console.log('Konfiguration'.padEnd(24) + keys.map((k, i) => k.padStart(widths[i])).join(''))
  for (const [name, r] of Object.entries(results)) {
    console.log(name.padEnd(24) + keys.map((k, i) => String(r.summary[k]).padStart(widths[i])).join(''))
  }
  console.log('\nPro Fall (aktuelle Konfiguration):')
  for (const r of results[base.name].runs) {
    const status = r.kind === 'negative' ? (r.belowFloor ? 'verweigert ✓' : `beantwortet ✗ (best ${r.bestScore?.toFixed(3)})`)
      : r.belowFloor ? `verweigert ✗ (best ${r.bestScore?.toFixed(3)})` : r.hit ? `Treffer Rang ${r.rank}` : `kein Treffer (Kandidatenrang ${r.candidateRank ?? '>100'})`
    console.log(`  ${r.id.padEnd(14)} ${status}`)
  }

  // Antworten + Protokoll für die Handbewertung
  if (answerMode) {
    const chatIdentity = await resolveLocalModel(chatModel, { fresh: true })
    console.log(`\nAntworten mit ${chatIdentity.name} …`)
    const lines: string[] = [`# Vault-Chat Eval — Handbewertung\n`, `Vault: ${vaultReal}  ·  Index: ${path.basename(newest.file)}  ·  Modell: ${chatIdentity.name}  ·  ${new Date().toLocaleString('de-DE')}\n`,
      `Bewertung je Fall: **richtig** (Antwort stimmt und ist belegt) · **teilweise** · **falsch** · **falsch grün** (Prüfzeile unauffällig, Aussage falsch) · **falsch rot** (Prüfzeile schlägt an, Aussage richtig)\n`]
    for (const r of results[base.name].runs) {
      if (r.belowFloor) {
        lines.push(`## ${r.id} — verweigert\n\n**Frage:** ${r.question}\n\nKeine Antwort (bester Score ${r.bestScore?.toFixed(3) ?? '–'} unter Floor ${base.floor}).\n\n**Bewertung:** [ ] richtig verweigert  [ ] hätte antworten sollen\n`)
        continue
      }
      const rehydrated: VaultHit[] = r.hits.map((h) => {
        const row = container.meta.chunks.findIndex((c) => c.fileRel === h.fileRel && c.startLine === h.startLine)
        const c = container.meta.chunks[row]
        return { fileRel: c.fileRel, chunkIndex: row, heading: c.heading, text: c.text, score: h.score, sourceStart: c.sourceStart, sourceEnd: c.sourceEnd, startLine: c.startLine, sourceHash: c.sourceHash, chunkHash: c.chunkHash, fresh: 'fresh', kind: c.kind ?? null, dateValue: c.dateValue ?? null } as VaultHit
      })
      const t1 = Date.now()
      const answer = await chat(buildVaultPrompt(rehydrated, 'de', sanitizeUntrustedText), r.question)
      const report = analyzeCitations(answer, rehydrated.map((h) => h.text))
      const s = report.summary
      r.answer = answer
      r.check = `${s.sentences} Sätze · ${s.uncited} ohne Quellenangabe · ${s.low} mit niedriger Wortdeckung · ${s.invalidRefs} ungültige Nummern · ${s.quotesNotFound} Zitate nicht im Original`
      r.sources = rehydrated.map((h, i) => `[${i + 1}] ${h.fileRel} › ${h.heading || '–'} (Zeile ${h.startLine})`)
      console.log(`  ${r.id.padEnd(14)} ${Math.round((Date.now() - t1) / 1000)} s · ${r.check}`)
      lines.push(`## ${r.id}${r.kind === 'positive' ? (r.hit ? ' — erwartete Quelle dabei' : ' — erwartete Quelle FEHLT') : ' — Negativfall, beantwortet'}\n\n**Frage:** ${r.question}\n\n${answer}\n\n**Quellen:**\n${r.sources.map((x) => `- ${x}`).join('\n')}\n\n**Prüfzeile:** ${r.check}\n\n**Bewertung:** [ ] richtig  [ ] teilweise  [ ] falsch  [ ] falsch grün  [ ] falsch rot\n**Anmerkung:** \n`)
    }
    const proto = path.join(outDir, `handbewertung-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.md`)
    await fs.writeFile(proto, lines.join('\n'), 'utf-8')
    console.log(`\nProtokoll für die Handbewertung: ${proto}`)
  }

  const resFile = path.join(outDir, `eval-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`)
  await fs.writeFile(resFile, JSON.stringify({ vault: vaultReal, index: path.basename(newest.file), chunks: container.meta.chunks.length, excludes, embedModel, chatModel: answerMode ? chatModel : null, results }, null, 2), 'utf-8')
  console.log(`Ergebnisse: ${resFile}`)
}

void main().catch((err) => { console.error(err); process.exit(9) })
