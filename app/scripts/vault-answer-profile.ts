/**
 * Wo gehen die Sekunden einer Vault-Antwort hin?
 *
 *   npm run vault:profile -- --vault "<VAULT>" [--query "Frage"]... [--chat-model X] [--embed-model bge-m3]
 *
 * Misst die Abschnitte EINER Antwort einzeln gegen echtes Ollama, in derselben
 * Reihenfolge wie `vault-rag-answer` in main/index.ts, mit denselben Funktionen:
 *
 *   Index laden (kalt/warm) → Digest prüfen → Frage einbetten → Digest prüfen
 *   → Kandidaten bewerten → Treffer gegenprüfen → Modell auflösen → Antwort erzeugen
 *
 * Zusätzlich die Kernfrage: **Verdrängen sich Einbettungs- und Antwortmodell?**
 * Dafür wird /api/ps vor und nach jedem Modellaufruf gelesen und am Ende noch einmal
 * eingebettet. Wird die zweite Einbettung wieder langsam, zahlt jede Frage einmal
 * Modell-Ladezeit — unabhängig davon, wie kurz die Antwort ist.
 *
 * Nur lesend: kein Index wird gebaut, keine Datei im Vault verändert.
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import { listVaultIndexFiles, loadVaultIndexFile } from '../src/main/rag/vaultStore'
import { embedText } from '../src/main/rag/embed'
import { resolveLocalModel, invalidateLocalModelCache, OLLAMA_LOCAL_URL } from '../src/main/rag/localModel'
import {
  selectForQuery,
  verifyHits,
  DEFAULT_VAULT_TOP_K,
  DEFAULT_VAULT_MIN_SCORE,
  DEFAULT_PER_FILE_CAP,
  DEFAULT_OVERSAMPLE,
  DEFAULT_LEXICAL_WEIGHT,
  DEFAULT_NEAR_DUP_COSINE,
} from '../src/main/rag/vaultRetrieve'
import { buildVaultPrompt } from '../src/main/rag/vaultPrompt'

// ── Argumente ───────────────────────────────────────────────────────────────

function arg(name: string, def?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : def
}
function argAll(name: string): string[] {
  const out: string[] = []
  process.argv.forEach((a, i) => {
    if (a === `--${name}` && process.argv[i + 1]) out.push(process.argv[i + 1])
  })
  return out
}

const vault = arg('vault')
if (!vault) {
  console.error('usage: --vault <pfad> [--query <frage>]... [--chat-model <name>] [--embed-model <name>]')
  process.exit(1)
}
const embedModel = arg('embed-model', 'bge-m3')!
const chatModel = arg('chat-model', 'qwen3.8:27b-mlx')!
const queries = argAll('query')
const QUERIES = queries.length
  ? queries
  : [
      'Was habe ich zuletzt über das Medienzentrum notiert?',
      'Welche offenen Aufgaben habe ich zum Digitaltag?',
    ]

let vaultReal = ''
const assertSafePath = async (p: string): Promise<string> => {
  const resolved = path.resolve(p)
  let real: string
  try {
    real = await fs.realpath(resolved)
  } catch {
    real = path.join(await fs.realpath(path.dirname(resolved)), path.basename(resolved))
  }
  if (!real.startsWith(vaultReal + path.sep) && real !== vaultReal) throw new Error(`außerhalb des Vaults: ${p}`)
  return real
}

// ── Messhilfen ──────────────────────────────────────────────────────────────

const ms = (v: number): string => (v >= 1000 ? `${(v / 1000).toFixed(2)} s` : `${Math.round(v)} ms`)

async function timed<T>(fn: () => Promise<T>): Promise<{ value: T; ms: number }> {
  const t0 = performance.now()
  const value = await fn()
  return { value, ms: performance.now() - t0 }
}

/** Welche Modelle hat Ollama gerade im Speicher? Das ist die eigentliche Diagnose. */
async function loadedModels(): Promise<string[]> {
  try {
    const r = await fetch(`${OLLAMA_LOCAL_URL}/api/ps`)
    if (!r.ok) return ['<api/ps nicht verfügbar>']
    const j = (await r.json()) as { models?: Array<{ name?: string; model?: string; size_vram?: number }> }
    return (j.models || []).map((m) => `${m.name || m.model}${m.size_vram ? ` (${(m.size_vram / 1e9).toFixed(1)} GB VRAM)` : ''}`)
  } catch {
    return ['<Ollama nicht erreichbar>']
  }
}

interface ChatTiming {
  firstTokenMs: number | null
  totalMs: number
  evalCount: number | null
  evalDurationMs: number | null
  promptEvalCount: number | null
  promptEvalDurationMs: number | null
  loadDurationMs: number | null
  answerChars: number
}

/** Gleicher Aufruf wie im Handler: stream, think:false, System-Prompt + Frage. */
async function streamChat(model: string, systemPrompt: string, query: string): Promise<ChatTiming> {
  const startedAt = performance.now()
  let firstTokenMs: number | null = null
  let answer = ''
  let timings: Record<string, number> = {}
  const response = await fetch(`${OLLAMA_LOCAL_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: query },
      ],
      stream: true,
      think: false,
    }),
  })
  if (!response.ok || !response.body) throw new Error(`Ollama API Fehler: ${response.status}`)
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) {
      const t = line.trim()
      if (!t) continue
      try {
        const json = JSON.parse(t) as { message?: { content?: string }; done?: boolean } & Record<string, number>
        if (json.message?.content) {
          if (firstTokenMs === null) firstTokenMs = performance.now() - startedAt
          answer += json.message.content
        }
        if (json.done) timings = json
      } catch {
        /* unvollständige Zeile */
      }
    }
  }
  const nsToMs = (v: number | undefined): number | null => (typeof v === 'number' ? v / 1e6 : null)
  return {
    firstTokenMs,
    totalMs: performance.now() - startedAt,
    evalCount: typeof timings.eval_count === 'number' ? timings.eval_count : null,
    evalDurationMs: nsToMs(timings.eval_duration),
    promptEvalCount: typeof timings.prompt_eval_count === 'number' ? timings.prompt_eval_count : null,
    promptEvalDurationMs: nsToMs(timings.prompt_eval_duration),
    loadDurationMs: nsToMs(timings.load_duration),
    answerChars: answer.length,
  }
}

// ── Hauptlauf ───────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  vaultReal = await fs.realpath(vault as string)
  console.log('# Vault-Antwort — Abschnittsmessung')
  console.log('')
  console.log(`Vault: ${vaultReal}`)
  console.log(`Einbettung: \`${embedModel}\` · Antwort: \`${chatModel}\``)
  console.log(`Ollama zu Beginn geladen: ${(await loadedModels()).join(', ') || '(nichts)'}`)
  console.log('')

  // ── Index laden ───────────────────────────────────────────────────────────
  const ragDir = path.join(vaultReal, '.mindgraph', 'rag')
  const files = await listVaultIndexFiles(ragDir, assertSafePath)
  if (files.length === 0) throw new Error('Kein Vault-Index gefunden')
  const newest = files.sort((a, b) => b.mtime - a.mtime)[0]
  const sizeMb = (newest.bytes / 1024 / 1024).toFixed(0)

  const cold = await timed(() => loadVaultIndexFile(newest.file))
  const warm = await timed(() => loadVaultIndexFile(newest.file))
  const container = cold.value
  if (!container) throw new Error('Index unlesbar')

  console.log('## Index')
  console.log('')
  console.log(`- Datei: \`${path.basename(newest.file)}\` · ${sizeMb} MB · ${container.meta.chunks.length} Chunks aus ${Object.keys(container.meta.files).length} Dateien`)
  console.log(`- Laden kalt: **${ms(cold.ms)}** · noch einmal von Platte: ${ms(warm.ms)}`)
  console.log('- Im laufenden Programm wird der Container zwischengespeichert (Datei + mtime); er wird erst nach einem Index-Schreibvorgang neu geladen.')
  console.log('')

  // ── Je Frage ──────────────────────────────────────────────────────────────
  for (let qi = 0; qi < QUERIES.length; qi++) {
    const query = QUERIES[qi]
    console.log(`## Frage ${qi + 1}: „${query}"`)
    console.log('')
    invalidateLocalModelCache()

    const digestBefore = await timed(() => resolveLocalModel(embedModel, { fresh: true }))
    const psBeforeEmbed = await loadedModels()
    const embed = await timed(() => embedText(embedModel, query))
    const psAfterEmbed = await loadedModels()
    const digestAfter = await timed(() => resolveLocalModel(embedModel, { fresh: true }))

    // Exakt die Parameter aus `queryVaultIndex` — sonst misst das Werkzeug etwas anderes
    // als die App.
    const select = await timed(async () =>
      selectForQuery(container, Float32Array.from(embed.value), query, {
        topK: DEFAULT_VAULT_TOP_K,
        minScore: DEFAULT_VAULT_MIN_SCORE,
        perFileCap: DEFAULT_PER_FILE_CAP,
        oversample: DEFAULT_OVERSAMPLE,
        excludeFolders: [],
        filters: undefined,
        lexicalWeight: DEFAULT_LEXICAL_WEIGHT,
        nearDupCosine: DEFAULT_NEAR_DUP_COSINE,
      }),
    )
    const verify = await timed(() => verifyHits(vaultReal, container, select.value.selected, assertSafePath, undefined))

    const prompt = buildVaultPrompt(verify.value.hits, 'de', (t) => t)
    const resolveChat = await timed(() => resolveLocalModel(chatModel, { fresh: true }))
    const psBeforeChat = await loadedModels()
    const chat = await streamChat(chatModel, prompt, query)
    const psAfterChat = await loadedModels()

    // Die entscheidende Gegenprobe: noch einmal einbetten, nachdem das große Modell lief.
    const embedAgain = await timed(() => embedText(embedModel, query))
    const psAfterSecondEmbed = await loadedModels()

    const retrievalTotal = digestBefore.ms + embed.ms + digestAfter.ms + select.ms + verify.ms
    const wall = retrievalTotal + resolveChat.ms + chat.totalMs

    console.log('| Abschnitt | Dauer | Anteil |')
    console.log('|---|---:|---:|')
    const row = (name: string, v: number): void =>
      console.log(`| ${name} | ${ms(v)} | ${((v / wall) * 100).toFixed(1)} % |`)
    row('Digest prüfen (vor Einbettung)', digestBefore.ms)
    row('**Frage einbetten**', embed.ms)
    row('Digest prüfen (nach Einbettung)', digestAfter.ms)
    row('Kandidaten bewerten + auswählen (Kosinus, lexikalisch, Dedupe)', select.ms)
    row('Treffer gegenprüfen (Dateien lesen)', verify.ms)
    row('Antwortmodell auflösen', resolveChat.ms)
    row('**Antwort erzeugen (gesamt)**', chat.totalMs)
    console.log(`| — davon bis zum ersten Zeichen | ${chat.firstTokenMs === null ? 'kein Token' : ms(chat.firstTokenMs)} | |`)
    console.log(`| **Summe** | **${ms(wall)}** | |`)
    console.log('')
    console.log(
      `- Treffer: ${verify.value.hits.length} von ${select.value.candidatesConsidered} geprüften Kandidaten · ` +
        `bester Score ${select.value.bestScore?.toFixed(3) ?? '—'} · Prompt: ${prompt.length} Zeichen · Antwort: ${chat.answerChars} Zeichen`,
    )
    if (select.value.belowFloor) console.log('- Unter der Mindestähnlichkeit — die App würde hier „nichts gefunden" sagen und KEIN Modell aufrufen.')
    if (chat.loadDurationMs !== null) console.log(`- Ollama meldet Modell-Ladezeit in diesem Aufruf: **${ms(chat.loadDurationMs)}**`)
    if (chat.promptEvalCount && chat.promptEvalDurationMs) {
      console.log(`- Prompt-Verarbeitung: ${chat.promptEvalCount} Token in ${ms(chat.promptEvalDurationMs)} (${(chat.promptEvalCount / (chat.promptEvalDurationMs / 1000)).toFixed(0)} Token/s)`)
    }
    if (chat.evalCount && chat.evalDurationMs) {
      console.log(`- Erzeugung: ${chat.evalCount} Token in ${ms(chat.evalDurationMs)} (${(chat.evalCount / (chat.evalDurationMs / 1000)).toFixed(1)} Token/s)`)
    }
    console.log('')
    console.log('**Modelle im Speicher:**')
    console.log('')
    console.log(`- vor der Einbettung: ${psBeforeEmbed.join(', ') || '(nichts)'}`)
    console.log(`- nach der Einbettung: ${psAfterEmbed.join(', ') || '(nichts)'}`)
    console.log(`- vor der Antwort: ${psBeforeChat.join(', ') || '(nichts)'}`)
    console.log(`- nach der Antwort: ${psAfterChat.join(', ') || '(nichts)'}`)
    console.log(`- nach erneuter Einbettung: ${psAfterSecondEmbed.join(', ') || '(nichts)'}`)
    console.log('')
    const factor = embed.ms > 0 ? embedAgain.ms / embed.ms : 0
    console.log(
      `**Gegenprobe Verdrängung:** erste Einbettung ${ms(embed.ms)}, zweite nach dem großen Modell ${ms(embedAgain.ms)}` +
        (embedAgain.ms > 1500 && factor > 0.5
          ? ' — das Einbettungsmodell wurde verdrängt und musste neu laden. **Jede Frage zahlt diese Ladezeit.**'
          : ' — kein Hinweis auf Verdrängung.'),
    )
    console.log('')
  }
}

main().catch((err) => {
  console.error(`Fehler: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
})
