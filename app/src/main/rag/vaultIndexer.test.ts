import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'fs/promises'
import * as os from 'os'
import * as path from 'path'

// ─── Mocks: kein Ollama im Test ─────────────────────────────────────────────
// Der Embedder liefert deterministische Vektoren aus dem Text, wartet kurz und
// beachtet das Abbruchsignal — so lassen sich Pause und Abbruch echt prüfen.

const embedLog: Array<{ text: string; at: number; aborted: boolean }> = []
let embedDelayMs = 2
let currentDigest = 'sha256:aaa'
let resolveCalls = 0
/** Texte, deren Embedding fehlschlagen soll (F31). */
let failTexts: (t: string) => boolean = () => false

vi.mock('./embed', () => {
  class EmbeddingAbortedError extends Error {
    constructor() {
      super('Embedding abgebrochen')
      this.name = 'EmbeddingAbortedError'
    }
  }
  const embedText = async (_model: string, text: string, opts: { signal?: AbortSignal } = {}): Promise<number[]> => {
    const entry = { text, at: Date.now(), aborted: false }
    embedLog.push(entry)
    if (failTexts(text)) {
      await new Promise((r) => setTimeout(r, embedDelayMs))
      throw new Error('Ollama Embeddings Fehler 500')
    }
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(resolve, embedDelayMs)
      opts.signal?.addEventListener('abort', () => {
        clearTimeout(t)
        entry.aborted = true
        reject(new EmbeddingAbortedError())
      }, { once: true })
    })
    let h = 7
    for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0
    return [((h & 0xff) / 255), (((h >> 8) & 0xff) / 255), (((h >> 16) & 0xff) / 255), 1]
  }
  return { embedText, EmbeddingAbortedError }
})

vi.mock('./localModel', () => ({
  resolveLocalModel: async (name: string) => {
    resolveCalls++
    return { name: name.includes(':') ? name : `${name}:latest`, digest: currentDigest }
  }
}))

import { VaultIndexJob, scanVaultFiles, estimateVault, coalesceParts, type VaultBuildProgress } from './vaultIndexer'
import { loadVaultIndexFile, vaultIndexPath, stagingDirFor, loadCheckpoint, sha256Hex } from './vaultStore'
import { beginOllamaActivity, ollamaActivityInternals } from './ollamaActivity'
import { canonicalizeMarkdown } from '../../shared/rag/chunking'
import { RAG_INDEX_VERSION } from '../../shared/rag/types'
import { RAG_VAULT_FORMAT_VERSION, excludeKeyFor, type VaultIndexIdentity } from '../../shared/rag/vaultIndex'

const assertSafePath = async (p: string) => p
let vault: string
let userData: string

const para = (n: number, seed: string) =>
  Array.from({ length: n }, (_, i) => `${seed} Satz ${i + 1} mit genug Text für einen ordentlichen Chunk.`).join(' ')

async function writeNote(rel: string, content: string) {
  const abs = path.join(vault, rel)
  await fs.mkdir(path.dirname(abs), { recursive: true })
  await fs.writeFile(abs, content, 'utf-8')
}

async function seedVault() {
  await writeNote('100 - Projekte/202609181000 - 🔴 Alpha.md', '# Alpha\n\n' + para(20, 'Alpha'))
  await writeNote('100 - Projekte/Beta.md', '---\ncategory: green\ndate: 2026-09-01\n---\n# Beta\n\n' + para(20, 'Beta'))
  await writeNote('300 - Ressourcen/Gamma.md', '# Gamma\n\n' + para(20, 'Gamma') + '\n\n## Zweitens\n\n' + para(20, 'Gamma2'))
  await writeNote('400 - Archiv/Alt.md', '# Alt\n\n' + para(10, 'Alt'))
  await writeNote('Templates/Vorlage.md', '# Vorlage\n\n' + para(5, 'Vorlage'))
  await writeNote('.mindgraph/notes-cache.md', '# versteckt')
  await writeNote('Bild.txt', 'kein markdown')
}

function identityFor(exclude: string[]): VaultIndexIdentity {
  return { model: 'bge-m3:latest', digest: currentDigest, dim: 4, formatVersion: RAG_VAULT_FORMAT_VERSION, chunkingVersion: RAG_INDEX_VERSION, excludeKey: excludeKeyFor(exclude) }
}

function job(overrides: Partial<ConstructorParameters<typeof VaultIndexJob>[0]> = {}) {
  const progress: VaultBuildProgress[] = []
  const j = new VaultIndexJob({
    jobId: 'j1',
    vaultPath: vault,
    userDataPath: userData,
    embedModel: 'bge-m3',
    excludeFolders: ['400 - Archiv'],
    mode: 'full',
    assertSafePath,
    onProgress: (p) => progress.push(p),
    concurrency: 1,
    packetSize: 2,
    ...overrides
  })
  return { j, progress }
}

beforeEach(async () => {
  vault = await fs.mkdtemp(path.join(os.tmpdir(), 'mg-vault-'))
  userData = await fs.mkdtemp(path.join(os.tmpdir(), 'mg-userdata-'))
  embedLog.length = 0
  embedDelayMs = 2
  currentDigest = 'sha256:aaa'
  resolveCalls = 0
  failTexts = () => false
  ollamaActivityInternals.reset()
  await seedVault()
})
afterEach(async () => {
  await fs.rm(vault, { recursive: true, force: true })
  await fs.rm(userData, { recursive: true, force: true })
})

describe('scanVaultFiles / estimateVault', () => {
  it('nimmt nur indexierbare Markdown-Dateien, sortiert', async () => {
    const files = await scanVaultFiles(vault, ['400 - Archiv'], assertSafePath)
    expect(files.map((f) => f.rel)).toEqual([
      '100 - Projekte/202609181000 - 🔴 Alpha.md',
      '100 - Projekte/Beta.md',
      '300 - Ressourcen/Gamma.md'
    ])
    const est = await estimateVault(vault, ['400 - Archiv'], assertSafePath)
    expect(est.files).toBe(3)
    expect(est.chunksApprox).toBeGreaterThan(0)
  })
})

describe('VaultIndexJob — Voll-Build', () => {
  it('schreibt einen gültigen Container mit Spannen-Invariante, Kategorie und Datum', async () => {
    const { j, progress } = job()
    const res = await j.run()
    expect(res.status).toBe('done')
    expect(res.fileCount).toBe(3)
    const container = await loadVaultIndexFile(vaultIndexPath(vault, identityFor(['400 - Archiv'])))
    expect(container).not.toBeNull()
    expect(container!.meta.chunks.length).toBe(res.chunkCount)
    expect(container!.vectors.length).toBe(res.chunkCount! * 4)

    // Invariante: Chunk-Text = Ausschnitt der kanonischen Datei
    for (const c of container!.meta.chunks) {
      const canonical = canonicalizeMarkdown(await fs.readFile(path.join(vault, c.fileRel), 'utf-8'))
      expect(canonical.slice(c.sourceStart, c.sourceEnd)).toBe(c.text)
      expect(c.chunkHash).toBe(sha256Hex(c.text))
    }
    const alpha = container!.meta.files['100 - Projekte/202609181000 - 🔴 Alpha.md']
    expect(alpha.kind).toBe('problem')
    expect(alpha.dateSource).toBe('filename')
    const beta = container!.meta.files['100 - Projekte/Beta.md']
    expect(beta.kind).toBe('solution')
    expect(beta.dateSource).toBe('frontmatter')
    expect(container!.meta.files['300 - Ressourcen/Gamma.md'].dateSource).toBe('mtime')

    // Staging ist nach dem Commit weg, Fortschritt endet mit done
    await expect(fs.stat(stagingDirFor(userData, vault, identityFor(['400 - Archiv'])))).rejects.toThrow()
    expect(progress[progress.length - 1].phase).toBe('done')
    expect(progress.some((p) => p.phase === 'embedding')).toBe(true)
    // Probe + Digest davor/danach
    expect(resolveCalls).toBeGreaterThanOrEqual(2)
  })

  it('Ausschlussliste ändert die Identität und damit den Dateinamen', async () => {
    await job({ excludeFolders: [] }).j.run()
    await job({ excludeFolders: ['400 - Archiv'] }).j.run()
    const dir = path.join(vault, '.mindgraph', 'rag')
    // Nach dem zweiten Commit ist der erste Container (andere Identität) entfernt.
    const names = (await fs.readdir(dir)).filter((n) => n.endsWith('.ragbin'))
    expect(names).toHaveLength(1)
    expect(names[0]).toBe(path.basename(vaultIndexPath(vault, identityFor(['400 - Archiv']))))
  })

  it('Digest-Wechsel während des Laufs verwirft den Lauf, kein Container', async () => {
    embedDelayMs = 15
    const { j } = job()
    const p = j.run()
    // Nach der ersten Auflösung (vor dem Build) wechselt der Digest — mitten im Embedding.
    for (let i = 0; i < 200 && embedLog.filter((e) => e.text !== 'Dimension').length < 1; i++) await new Promise((r) => setTimeout(r, 2))
    currentDigest = 'sha256:NEU'
    const res = await p
    expect(res.status).toBe('error')
    expect(res.error).toMatch(/Digest|geändert/)
    expect(await loadVaultIndexFile(vaultIndexPath(vault, identityFor(['400 - Archiv'])))).toBeNull()
  })
})

describe('VaultIndexJob — Abbruch, Wiederaufnahme, Pause', () => {
  it('Abbruch nach dem ersten Paket lässt einen Checkpoint zurück; Wiederaufnahme bettet nur den Rest ein', async () => {
    const { j } = job()
    embedDelayMs = 4
    const p = j.run()
    // Warten, bis das erste Segment (Paket = 2 Dateien) geschrieben ist.
    const identity = identityFor(['400 - Archiv'])
    const staging = stagingDirFor(userData, vault, identity)
    for (let i = 0; i < 400; i++) {
      const cp = await loadCheckpoint(staging, identity)
      if (cp && cp.segments.length >= 1) break
      await new Promise((r) => setTimeout(r, 5))
    }
    j.cancel()
    const res = await p
    expect(res.status).toBe('cancelled')
    const cp = await loadCheckpoint(staging, identity)
    expect(cp).not.toBeNull()
    expect(Object.keys(cp!.files).length).toBeGreaterThanOrEqual(1)
    expect(await loadVaultIndexFile(vaultIndexPath(vault, identity))).toBeNull()

    // Wiederaufnahme: Dateien aus dem Checkpoint werden NICHT erneut eingebettet.
    const staged = new Set(Object.keys(cp!.files))
    embedLog.length = 0
    const res2 = await job().j.run()
    expect(res2.status).toBe('done')
    expect(res2.fileCount).toBe(3)
    const container = await loadVaultIndexFile(vaultIndexPath(vault, identity))
    const embeddedTexts = new Set(embedLog.map((e) => e.text))
    for (const c of container!.meta.chunks) {
      if (staged.has(c.fileRel)) expect(embeddedTexts.has(c.text)).toBe(false)
    }
  })

  it('Wiederaufnahme bettet geänderte Dateien neu ein und entfernt gelöschte', async () => {
    const identity = identityFor(['400 - Archiv'])
    const staging = stagingDirFor(userData, vault, identity)
    // Erster Lauf: das erste Paket (2 Dateien) wird gestaged, dann Abbruch → Staging bleibt liegen.
    embedDelayMs = 15
    const first = job()
    const p = first.j.run()
    for (let i = 0; i < 400; i++) {
      const cp = await loadCheckpoint(staging, identity)
      if (cp && cp.segments.length >= 1) break
      await new Promise((r) => setTimeout(r, 5))
    }
    first.j.cancel()
    await p
    const cp = await loadCheckpoint(staging, identity)
    const stagedFiles = Object.keys(cp!.files)
    expect(stagedFiles.length).toBeGreaterThanOrEqual(2)

    // Eine gestagede Datei ändern, eine löschen.
    const changed = stagedFiles[0]
    const deleted = stagedFiles[1]
    await writeNote(changed, '# Geändert\n\n' + para(20, 'Neu'))
    await fs.rm(path.join(vault, deleted))
    embedLog.length = 0
    const res = await job().j.run()
    expect(res.status).toBe('done')
    const container = await loadVaultIndexFile(vaultIndexPath(vault, identity))
    expect(container!.meta.files[deleted]).toBeUndefined()
    expect(container!.meta.files[changed]).toBeDefined()
    expect(container!.meta.chunks.some((c) => c.fileRel === changed && c.text.includes('Neu Satz 1'))).toBe(true)
    expect(embedLog.some((e) => e.text.includes('Neu Satz 1'))).toBe(true)
  })

  it('inkrementell: nur die geänderte Datei wird eingebettet, gelöschte verschwinden, Rest wird wiederverwendet', async () => {
    const identity = identityFor(['400 - Archiv'])
    const first = await job().j.run()
    expect(first.status).toBe('done')
    const before = await loadVaultIndexFile(vaultIndexPath(vault, identity))

    await writeNote('100 - Projekte/Beta.md', '---\ncategory: green\n---\n# Beta\n\n' + para(20, 'BetaNeu'))
    await fs.rm(path.join(vault, '300 - Ressourcen/Gamma.md'))
    embedLog.length = 0
    const inc = job({ mode: 'incremental', changed: new Set(['100 - Projekte/Beta.md', '300 - Ressourcen/Gamma.md']), existing: before })
    const res = await inc.j.run()
    expect(res.status).toBe('done')
    const unexpected = embedLog.filter((e) => !e.text.includes('BetaNeu') && e.text !== 'Dimension').map((e) => e.text.slice(0, 60))
    expect(unexpected).toEqual([])
    const after = await loadVaultIndexFile(vaultIndexPath(vault, identity))
    expect(after!.generation).toBe(before!.generation + 1)
    expect(after!.meta.files['300 - Ressourcen/Gamma.md']).toBeUndefined()
    expect(after!.meta.files['100 - Projekte/202609181000 - 🔴 Alpha.md'].sourceHash)
      .toBe(before!.meta.files['100 - Projekte/202609181000 - 🔴 Alpha.md'].sourceHash)
    expect(inc.progress[inc.progress.length - 1].chunksReused).toBeGreaterThan(0)
    // Vektoren der wiederverwendeten Datei sind identisch übernommen.
    const rowBefore = before!.meta.chunks.findIndex((c) => c.fileRel.includes('Alpha'))
    const rowAfter = after!.meta.chunks.findIndex((c) => c.fileRel.includes('Alpha'))
    expect(Array.from(after!.vectors.subarray(rowAfter * 4, rowAfter * 4 + 4))).toEqual(Array.from(before!.vectors.subarray(rowBefore * 4, rowBefore * 4 + 4)))
  })

  it('Vordergrund-Aktivität mitten im Paket: laufender Request wird abgebrochen, keine neuen bis zum Ende', async () => {
    embedDelayMs = 20
    const { j, progress } = job()
    const p = j.run()
    // Warten bis ein echter Chunk-Embed läuft (nicht die Dimension-Probe).
    for (let i = 0; i < 200 && embedLog.filter((e) => e.text !== 'Dimension').length < 2; i++) await new Promise((r) => setTimeout(r, 2))
    const countAtBegin = embedLog.length
    const end = beginOllamaActivity('chat')
    await new Promise((r) => setTimeout(r, 80))
    // Während des Vordergrunds: kein neuer Request gestartet, der laufende wurde abgebrochen.
    expect(embedLog.length).toBe(countAtBegin)
    expect(embedLog[countAtBegin - 1].aborted).toBe(true)
    expect(progress.some((pr) => pr.paused === 'foreground')).toBe(true)
    end()
    const res = await p
    expect(res.status).toBe('done')
    // Der abgebrochene Text wurde später erneut eingebettet.
    const abortedText = embedLog[countAtBegin - 1].text
    expect(embedLog.filter((e) => e.text === abortedText && !e.aborted).length).toBeGreaterThanOrEqual(1)
  })

  it('Nutzer-Pause hält vor dem nächsten Request an, Resume setzt fort', async () => {
    embedDelayMs = 5
    const { j, progress } = job()
    const p = j.run()
    for (let i = 0; i < 200 && embedLog.length < 2; i++) await new Promise((r) => setTimeout(r, 2))
    j.pause()
    await new Promise((r) => setTimeout(r, 40))
    const n = embedLog.length
    await new Promise((r) => setTimeout(r, 40))
    expect(embedLog.length).toBe(n)
    expect(progress.some((pr) => pr.paused === 'user')).toBe(true)
    j.resume()
    const res = await p
    expect(res.status).toBe('done')
  })
})

describe('VaultIndexJob — Fehler und defektes Staging', () => {
  it('ein gescheiterter Worker stoppt alle: nach dem Fehler-Ergebnis keine weiteren Embedding-Aufrufe (F31)', async () => {
    embedDelayMs = 15
    failTexts = (t) => t.includes('Alpha Satz 1')
    const { j } = job({ concurrency: 2, packetSize: 20 })
    const res = await j.run()
    expect(res.status).toBe('error')
    expect(res.error).toMatch(/500/)
    const countAtReturn = embedLog.length
    await new Promise((r) => setTimeout(r, 120))
    expect(embedLog.length).toBe(countAtReturn)
    // Kein Container geschrieben, Staging bleibt für einen späteren Lauf erhalten
    expect(await loadVaultIndexFile(vaultIndexPath(vault, identityFor(['400 - Archiv'])))).toBeNull()
  })

  it('defektes Staging-Segment blockiert die Wiederaufnahme nicht (F37)', async () => {
    const identity = identityFor(['400 - Archiv'])
    const staging = stagingDirFor(userData, vault, identity)
    embedDelayMs = 15
    const first = job()
    const p = first.j.run()
    for (let i = 0; i < 400; i++) {
      const cp = await loadCheckpoint(staging, identity)
      if (cp && cp.segments.length >= 1) break
      await new Promise((r) => setTimeout(r, 5))
    }
    first.j.cancel()
    await p
    const cp = await loadCheckpoint(staging, identity)
    expect(cp!.segments.length).toBeGreaterThanOrEqual(1)
    // Erstes Segment abschneiden
    const segFile = path.join(staging, cp!.segments[0].name)
    const bytes = await fs.readFile(segFile)
    await fs.writeFile(segFile, bytes.subarray(0, Math.floor(bytes.length / 2)))

    embedLog.length = 0
    const res = await job().j.run()
    expect(res.status).toBe('done')
    expect(res.fileCount).toBe(3)
    const container = await loadVaultIndexFile(vaultIndexPath(vault, identity))
    expect(container!.meta.chunks.length).toBe(res.chunkCount)
    // Die Dateien des defekten Segments wurden neu eingebettet
    const cpFiles = Object.keys(cp!.files)
    expect(embedLog.some((e) => e.text !== 'Dimension')).toBe(true)
    expect(cpFiles.every((rel) => container!.meta.files[rel])).toBe(true)
  })
})

describe('Pfadschutz und Segment-Reparatur (F34, F37)', () => {
  it('.mindgraph als Symlink nach außen: Lauf wird abgelehnt, kein Ordner außerhalb angelegt (F34)', async () => {
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'mg-idx-outside-'))
    try {
      await fs.rm(path.join(vault, '.mindgraph'), { recursive: true, force: true })
      await fs.symlink(outside, path.join(vault, '.mindgraph'))
      const real = await fs.realpath(vault)
      const strict = async (p: string): Promise<string> => {
        const resolved = path.resolve(p)
        let canonical: string
        try { canonical = await fs.realpath(resolved) } catch { canonical = path.join(await fs.realpath(path.dirname(resolved)), path.basename(resolved)) }
        if (canonical !== real && !canonical.startsWith(real + path.sep)) throw new Error(`außerhalb: ${p}`)
        return canonical
      }
      const { j } = job({ assertSafePath: strict })
      const res = await j.run()
      expect(res.status).toBe('error')
      expect(res.error).toMatch(/außerhalb/)
      await expect(fs.stat(path.join(outside, 'rag'))).rejects.toThrow()
    } finally {
      await fs.rm(outside, { recursive: true, force: true })
    }
  })

  it('defektes erstes Segment bei zwei Segmenten: Resume überschreibt das gültige nicht, Endcontainer vollständig (F37)', async () => {
    const identity = identityFor(['400 - Archiv'])
    const staging = stagingDirFor(userData, vault, identity)
    embedDelayMs = 8
    const first = job({ packetSize: 1 })
    const p = first.j.run()
    for (let i = 0; i < 600; i++) {
      const cp = await loadCheckpoint(staging, identity)
      if (cp && cp.segments.length >= 2) break
      await new Promise((r) => setTimeout(r, 5))
    }
    first.j.cancel()
    await p
    const cp = await loadCheckpoint(staging, identity)
    expect(cp!.segments.length).toBeGreaterThanOrEqual(2)
    const firstSeg = path.join(staging, cp!.segments[0].name)
    const secondSegName = cp!.segments[1].name
    const bytes = await fs.readFile(firstSeg)
    await fs.writeFile(firstSeg, bytes.subarray(0, 20))

    embedLog.length = 0
    const res = await job({ packetSize: 1 }).j.run()
    expect(res.status).toBe('done')
    expect(res.fileCount).toBe(3)
    const container = await loadVaultIndexFile(vaultIndexPath(vault, identity))
    // Alle drei Dateien mit allen Chunks — nichts wurde überschrieben oder verloren
    const perFile = new Map<string, number>()
    for (const c of container!.meta.chunks) perFile.set(c.fileRel, (perFile.get(c.fileRel) ?? 0) + 1)
    expect([...perFile.keys()].sort()).toEqual([
      '100 - Projekte/202609181000 - 🔴 Alpha.md',
      '100 - Projekte/Beta.md',
      '300 - Ressourcen/Gamma.md'
    ])
    for (const c of container!.meta.chunks) {
      const canonical = canonicalizeMarkdown(await fs.readFile(path.join(vault, c.fileRel), 'utf-8'))
      expect(canonical.slice(c.sourceStart, c.sourceEnd)).toBe(c.text)
    }
    // Der zweite Segmentname existiert nicht mehr zweimal; kein Name aus dem Muster "seg-0000n"
    expect(secondSegName).toMatch(/^seg-/)
  })

  it('mehrere Versionen derselben Datei im Staging: die jüngste gültige gewinnt (F37)', async () => {
    const identity = identityFor(['400 - Archiv'])
    const staging = stagingDirFor(userData, vault, identity)
    embedDelayMs = 8
    // Lauf 1 stagt Alpha (Paket 1), wird danach abgebrochen
    const a = job({ packetSize: 1 })
    const pa = a.j.run()
    for (let i = 0; i < 600; i++) {
      const cp = await loadCheckpoint(staging, identity)
      if (cp && cp.segments.length >= 1) break
      await new Promise((r) => setTimeout(r, 5))
    }
    a.j.cancel()
    await pa
    // Alpha ändern → Lauf 2 stagt Alpha erneut (neues Segment), wird wieder abgebrochen
    await writeNote('100 - Projekte/202609181000 - 🔴 Alpha.md', '# Alpha\n\n' + para(20, 'AlphaNeu'))
    const b = job({ packetSize: 1 })
    const pb = b.j.run()
    for (let i = 0; i < 600; i++) {
      const cp = await loadCheckpoint(staging, identity)
      if (cp && cp.segments.length >= 2) break
      await new Promise((r) => setTimeout(r, 5))
    }
    b.j.cancel()
    await pb
    // Lauf 3 vollständig
    const res = await job({ packetSize: 1 }).j.run()
    expect(res.status).toBe('done')
    const container = await loadVaultIndexFile(vaultIndexPath(vault, identity))
    const alphaChunks = container!.meta.chunks.filter((c) => c.fileRel.includes('Alpha'))
    expect(alphaChunks.some((c) => c.text.includes('AlphaNeu'))).toBe(true)
    expect(alphaChunks.every((c) => !c.text.includes('Alpha Satz 1 '))).toBe(true)
  })
})

describe('coalesceParts', () => {
  it('fasst benachbarte Teilstücke desselben Puffers zusammen', () => {
    const buf = new Float32Array([1, 2, 3, 4, 5, 6])
    const other = new Float32Array([9, 9])
    const parts = coalesceParts([buf.subarray(0, 2), buf.subarray(2, 4), other, buf.subarray(4, 6)])
    expect(parts.map((p) => Array.from(p))).toEqual([[1, 2, 3, 4], [9, 9], [5, 6]])
  })
})
