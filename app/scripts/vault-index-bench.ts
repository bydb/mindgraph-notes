/**
 * Vault-Index-Messlauf (Phase-1-Abnahme, Vault-Chat-Plan Rev. 3):
 *   npm run vault:bench -- --vault "<VAULT>" [--userData <dir>] [--exclude "400 - Archiv"]... [--query "Frage"]
 *
 * Misst gegen echtes Ollama: Dauer des Voll-Builds, Peak-RSS des Prozesses,
 * Event-Loop-Verzögerung (max/p95 eines 50-ms-Tickers) während des Laufs,
 * Ladezeit des Containers, Abfragezeit ohne und mit Frage-Embedding.
 * Läuft headless in Node (kein Electron); assertSafePath wird durch einen
 * Realpath-Vault-Guard ersetzt.
 */

import * as fs from 'fs/promises'
import * as os from 'os'
import * as path from 'path'
import { VaultIndexJob } from '../src/main/rag/vaultIndexer'
import { loadVaultIndexFile, listVaultIndexFiles, vaultRagDir } from '../src/main/rag/vaultStore'
import { queryVaultIndex, rankCandidates } from '../src/main/rag/vaultRetrieve'

function arg(name: string, def?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : def
}
function args(name: string): string[] {
  const out: string[] = []
  process.argv.forEach((a, i) => {
    if (a === `--${name}` && process.argv[i + 1]) out.push(process.argv[i + 1])
  })
  return out
}

const vault = arg('vault')
if (!vault) {
  console.error('usage: --vault <pfad> [--userData <dir>] [--exclude <ordner>]... [--query <frage>] [--model bge-m3]')
  process.exit(1)
}
const userData = arg('userData', path.join(os.tmpdir(), 'mg-vault-bench-userdata'))!
const exclude = args('exclude')
const model = arg('model', 'bge-m3')!
const query = arg('query', 'Was war beim letzten Termin mit dem Schulamt besprochen?')!

let vaultReal = ''
const assertSafePath = async (p: string): Promise<string> => {
  const real = await fs.realpath(p)
  if (!real.startsWith(vaultReal + path.sep) && real !== vaultReal) throw new Error(`außerhalb des Vaults: ${p}`)
  return real
}

function fmtMs(ms: number): string {
  const s = Math.round(ms / 1000)
  return s >= 60 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${(ms / 1000).toFixed(1)} s`
}
const mb = (b: number) => `${(b / 1024 / 1024).toFixed(0)} MB`

async function main(): Promise<void> {
  vaultReal = await fs.realpath(vault!)
  await fs.mkdir(userData, { recursive: true })
  console.log(`Vault: ${vaultReal}\nuserData: ${userData}\nModell: ${model}\nAusschlüsse: ${exclude.join(', ') || '(keine)'}\n`)

  // Messfühler: RSS und Event-Loop-Lag
  let peakRss = process.memoryUsage().rss
  const lags: number[] = []
  let last = Date.now()
  const ticker = setInterval(() => {
    const now = Date.now()
    lags.push(now - last - 50)
    last = now
    const rss = process.memoryUsage().rss
    if (rss > peakRss) peakRss = rss
  }, 50)

  let lastLine = ''
  const job = new VaultIndexJob({
    jobId: 'bench',
    vaultPath: vaultReal,
    userDataPath: userData,
    embedModel: model,
    excludeFolders: exclude,
    mode: 'full',
    assertSafePath,
    onProgress: (p) => {
      const line = `${p.phase}${p.paused ? ` (${p.paused})` : ''} · Dateien ${p.filesDone}/${p.filesTotal} · eingebettet ${p.chunksEmbedded} · übernommen ${p.chunksReused}${p.etaMs !== null ? ` · noch ~${fmtMs(p.etaMs)}` : ''}${p.error ? ` · FEHLER ${p.error}` : ''}`
      if (line !== lastLine) {
        process.stdout.write(`\r${line.padEnd(120)}`)
        lastLine = line
      }
    }
  })

  const t0 = Date.now()
  const result = await job.run()
  const buildMs = Date.now() - t0
  clearInterval(ticker)
  process.stdout.write('\n\n')

  lags.sort((a, b) => a - b)
  const p95 = lags[Math.floor(lags.length * 0.95)] ?? 0
  const max = lags[lags.length - 1] ?? 0

  console.log('── Build ──')
  console.log(`Status: ${result.status}${result.error ? ` (${result.error})` : ''}`)
  console.log(`Dauer: ${fmtMs(buildMs)} · Dateien: ${result.fileCount ?? '–'} · Chunks: ${result.chunkCount ?? '–'}`)
  console.log(`Peak-RSS: ${mb(peakRss)} · Event-Loop-Lag p95: ${p95} ms · max: ${max} ms (Ticker 50 ms, ${lags.length} Messungen)`)
  if (result.status !== 'done') process.exit(2)

  const files = await listVaultIndexFiles(vaultRagDir(vaultReal))
  const newest = files.sort((a, b) => b.mtime - a.mtime)[0]
  console.log(`Container: ${path.basename(newest.file)} · ${mb(newest.bytes)}`)

  console.log('\n── Laden ──')
  const tl = Date.now()
  const container = await loadVaultIndexFile(newest.file)
  console.log(`Ladezeit: ${Date.now() - tl} ms · RSS danach: ${mb(process.memoryUsage().rss)}`)
  if (!container) process.exit(3)

  console.log('\n── Abfrage ──')
  const dim = container.meta.identity.dim
  const probeVec = container.vectors.subarray(0, dim)
  const tr = Date.now()
  const ranked = rankCandidates(container, Float32Array.from(probeVec), undefined, 32)
  console.log(`Cosine über ${container.meta.chunks.length} Chunks (ohne Embedding): ${Date.now() - tr} ms · bester Score ${ranked[0]?.score.toFixed(3)}`)

  const tq = Date.now()
  const r = await queryVaultIndex(container, vaultReal, { query, embedModel: model }, assertSafePath)
  console.log(`Volle Abfrage „${query}“: ${Date.now() - tq} ms · Treffer ${r.hits.length} · belowFloor ${r.belowFloor} · bester Score ${r.bestScore?.toFixed(3)} · stale ${r.staleFiles.length}`)
  for (const h of r.hits.slice(0, 5)) {
    console.log(`  ${h.score.toFixed(3)} ${h.fresh} ${h.fileRel} › ${h.heading || '(ohne Überschrift)'} (Zeile ${h.startLine})`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
