import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'fs/promises'
import * as os from 'os'
import * as path from 'path'

// ─── Fake-Indexer: Läufe enden erst, wenn der Test es sagt ──────────────────
const fake = vi.hoisted(() => {
  interface FakeJob {
    opts: Record<string, unknown>
    finish: (r: { status: 'done' | 'cancelled' | 'error'; file?: string; error?: string }) => void
    pauseCalls: number
    resumeCalls: number
    cancelCalls: number
  }
  const jobs: FakeJob[] = []
  return { jobs }
})

vi.mock('./vaultIndexer', () => {
  class VaultIndexJob {
    opts: Record<string, unknown>
    private resolveRun!: (r: unknown) => void
    private readonly done: Promise<unknown>
    pauseCalls = 0
    resumeCalls = 0
    cancelCalls = 0
    constructor(opts: Record<string, unknown>) {
      this.opts = opts
      this.done = new Promise((r) => (this.resolveRun = r))
      const self = this
      fake.jobs.push({
        opts,
        finish: (r) => self.resolveRun({ ...r, durationMs: 1 }),
        get pauseCalls() { return self.pauseCalls },
        get resumeCalls() { return self.resumeCalls },
        get cancelCalls() { return self.cancelCalls }
      })
    }
    get snapshot() {
      return { jobId: String(this.opts.jobId), phase: 'embedding', paused: null }
    }
    pause() { this.pauseCalls++ }
    resume() { this.resumeCalls++ }
    cancel() {
      this.cancelCalls++
      this.resolveRun({ status: 'cancelled', durationMs: 1 })
    }
    run() { return this.done }
  }
  return { VaultIndexJob, estimateVault: async () => ({ files: 2, bytes: 100, chunksApprox: 1 }) }
})

vi.mock('./embed', () => ({
  embedText: async () => [1, 0, 0, 0]
}))
vi.mock('./localModel', () => ({
  resolveLocalModel: async () => ({ name: 'bge-m3:latest', digest: 'sha256:aaa' }),
  describeLocalModelError: (e: unknown) => (e instanceof Error ? e.message : String(e))
}))

import { VaultRagManager } from './vaultRagManager'
import { writeVaultIndexAtomic, vaultIndexPath, sha256Hex } from './vaultStore'
import { canonicalizeMarkdown, chunkMarkdown } from '../../shared/rag/chunking'
import { RAG_INDEX_VERSION } from '../../shared/rag/types'
import { excludeKeyFor, type VaultIndexIdentity, type VaultIndexMeta } from '../../shared/rag/vaultIndex'

const assertSafePath = async (p: string) => p
let vault: string
let userData: string
let progress: unknown[]
let moduleOn = true

/** Strenge Pfadprüfung wie assertSafePath im Main: realpath (Elternpfad bei neuen Dateien), nur im Vault. */
async function strictSafePath(root: string) {
  const real = await fs.realpath(root)
  return async (p: string): Promise<string> => {
    const resolved = path.resolve(p)
    let canonical: string
    try {
      canonical = await fs.realpath(resolved)
    } catch {
      canonical = path.join(await fs.realpath(path.dirname(resolved)), path.basename(resolved))
    }
    if (canonical !== real && !canonical.startsWith(real + path.sep)) throw new Error(`außerhalb: ${p}`)
    return canonical
  }
}

function manager(extra: Partial<ConstructorParameters<typeof VaultRagManager>[0]> = {}) {
  return new VaultRagManager({
    userDataPath: userData,
    assertSafePath,
    getEmbedModel: async () => 'bge-m3',
    isModuleEnabled: async () => moduleOn,
    onProgress: (p) => progress.push(p),
    queueDebounceMs: 40,
    queueMaxWaitMs: 150,
    ...extra
  })
}

async function waitFor(cond: () => boolean, ms = 2000): Promise<void> {
  const t0 = Date.now()
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error('waitFor: Bedingung nicht erreicht')
    await new Promise((r) => setTimeout(r, 5))
  }
}

async function writeNote(rel: string, content: string) {
  const abs = path.join(vault, rel)
  await fs.mkdir(path.dirname(abs), { recursive: true })
  await fs.writeFile(abs, content, 'utf-8')
}

/** Echter Container auf der Platte: ein Chunk pro Datei, Vektor [1,0,0,0]. */
async function writeContainer(rels: string[], excludeFolders: string[] = []): Promise<string> {
  const identity: VaultIndexIdentity = {
    model: 'bge-m3:latest', digest: 'sha256:aaa', dim: 4, formatVersion: 1, chunkingVersion: RAG_INDEX_VERSION, excludeKey: excludeKeyFor(excludeFolders)
  }
  const meta: VaultIndexMeta = { identity, createdAt: 1, files: {}, chunks: [] }
  for (const rel of rels) {
    const content = `# ${path.basename(rel, '.md')}\n\nalpha text in ${rel}\n`
    await writeNote(rel, content)
    const canonical = canonicalizeMarkdown(content)
    const [c] = chunkMarkdown(canonical)
    meta.files[rel] = { sourceHash: sha256Hex(canonical), mtime: 1, size: content.length, kind: null, dateValue: null, dateSource: 'mtime' }
    meta.chunks.push({ fileRel: rel, chunkIndex: 0, heading: c.heading, sourceStart: c.sourceStart, sourceEnd: c.sourceEnd, startLine: c.startLine, chunkHash: sha256Hex(c.text), text: c.text })
  }
  const file = vaultIndexPath(vault, identity)
  await writeVaultIndexAtomic(file, meta, [new Float32Array(rels.flatMap(() => [1, 0, 0, 0]))], 1)
  return file
}

beforeEach(async () => {
  vault = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'mg-mgr-vault-')))
  userData = await fs.mkdtemp(path.join(os.tmpdir(), 'mg-mgr-ud-'))
  progress = []
  moduleOn = true
  fake.jobs.length = 0
})
afterEach(async () => {
  await fs.rm(vault, { recursive: true, force: true })
  await fs.rm(userData, { recursive: true, force: true })
})

describe('Konfiguration', () => {
  it('Default aus; setConfig schreibt vaultRag und erhält fremde Schlüssel der Datei', async () => {
    await fs.mkdir(path.join(vault, '.mindgraph'), { recursive: true })
    await fs.writeFile(path.join(vault, '.mindgraph', 'vault-settings.json'), JSON.stringify({ schemaVersion: 1, features: { email: true } }))
    const m = manager()
    expect((await m.getConfig(vault)).enabled).toBe(false)
    const cfg = await m.setConfig(vault, { enabled: true, excludeFolders: ['400 - Archiv/', 'x\\y'] })
    expect(cfg).toEqual({ enabled: true, excludeFolders: ['400 - Archiv', 'x/y'] })
    const raw = JSON.parse(await fs.readFile(path.join(vault, '.mindgraph', 'vault-settings.json'), 'utf-8'))
    expect(raw.features).toEqual({ email: true })
    expect(raw.vaultRag).toEqual(cfg)
  })
})

describe('Job-Lebenszyklus', () => {
  it('ohne Opt-in kein Build; mit Opt-in ein Job mit aufgelöstem Vault und Ausschlüssen', async () => {
    const m = manager()
    expect((await m.startBuild(vault)).ok).toBe(false)
    await m.setConfig(vault, { enabled: true, excludeFolders: ['ex'] })
    const res = await m.startBuild(vault)
    expect(res.ok).toBe(true)
    expect(fake.jobs).toHaveLength(1)
    expect(fake.jobs[0].opts.vaultPath).toBe(vault)
    expect(fake.jobs[0].opts.excludeFolders).toEqual(['ex'])
    expect(fake.jobs[0].opts.mode).toBe('full')
    fake.jobs[0].finish({ status: 'done' })
    await m.shutdown()
  })

  it('Doppelstart: zwei gleichzeitige Starts erzeugen genau einen Job', async () => {
    const m = manager()
    await m.setConfig(vault, { enabled: true })
    const [a, b] = await Promise.all([m.startBuild(vault), m.startBuild(vault)])
    expect([a.ok, b.ok].sort()).toEqual([false, true])
    expect(fake.jobs).toHaveLength(1)
    const c = await m.startBuild(vault)
    expect(c.ok).toBe(false)
    expect(c.error).toMatch(/bereits/)
    fake.jobs[0].finish({ status: 'done' })
    await m.shutdown()
  })

  it('Pause/Fortsetzen/Abbrechen werden durchgereicht; Abschalten bricht den Job ab', async () => {
    const m = manager()
    await m.setConfig(vault, { enabled: true })
    await m.startBuild(vault)
    expect(m.pause(vault)).toBe(true)
    expect(m.resume(vault)).toBe(true)
    expect(fake.jobs[0].pauseCalls).toBe(1)
    expect(fake.jobs[0].resumeCalls).toBe(1)
    await m.setConfig(vault, { enabled: false })
    expect(fake.jobs[0].cancelCalls).toBe(1)
    expect((await m.getStatus(vault)).build?.phase).not.toBe('embedding')
    expect(m.pause(vault)).toBe(false)
  })

  it('Vault-Wechsel bricht den laufenden Job ab und leert die Warteschlange', async () => {
    const other = await fs.mkdtemp(path.join(os.tmpdir(), 'mg-mgr-other-'))
    try {
      const m = manager()
      await m.setConfig(vault, { enabled: true })
      await m.setVault(vault)
      await m.startBuild(vault)
      m.noteFileEvent(vault, 'change', path.join(vault, 'a.md'))
      await m.setVault(other)
      expect(fake.jobs[0].cancelCalls).toBe(1)
      expect((await m.getStatus(other)).pendingChanges).toBe(0)
    } finally {
      await fs.rm(other, { recursive: true, force: true })
    }
  })

  it('derselbe Vault hinter einem Symlink gilt als derselbe Vault (kein Abbruch)', async () => {
    const link = path.join(os.tmpdir(), `mg-mgr-link-${Date.now()}`)
    await fs.symlink(vault, link)
    try {
      const m = manager()
      await m.setConfig(vault, { enabled: true })
      await m.setVault(vault)
      await m.startBuild(vault)
      const viaLink = await m.startBuild(link)
      expect(viaLink.ok).toBe(false)
      expect(viaLink.error).toMatch(/bereits/)
      expect(fake.jobs[0].cancelCalls).toBe(0)
      expect(fake.jobs).toHaveLength(1)
      fake.jobs[0].finish({ status: 'done' })
      await m.shutdown()
    } finally {
      await fs.unlink(link)
    }
  })
})

describe('Watcher-Warteschlange', () => {
  it('ohne Opt-in nichts; mit Opt-in nur indexierbare Pfade; Flush nach Entprellung als inkrementeller Lauf', async () => {
    const m = manager()
    await m.setVault(vault)
    m.noteFileEvent(vault, 'change', path.join(vault, 'a.md'))
    expect((await m.getStatus(vault)).pendingChanges).toBe(0)

    await m.setConfig(vault, { enabled: true, excludeFolders: ['ex'] })
    await writeContainer(['a.md'], ['ex'])
    m.noteFileEvent(vault, 'change', path.join(vault, 'a.md'))
    m.noteFileEvent(vault, 'add', path.join(vault, 'ex', 'b.md'))
    m.noteFileEvent(vault, 'change', path.join(vault, 'bild.png'))
    m.noteFileEvent(vault, 'change', path.join(vault, '.mindgraph', 'x.md'))
    m.noteFileEvent(path.join(os.tmpdir(), 'fremd'), 'change', path.join(os.tmpdir(), 'fremd', 'c.md'))
    expect((await m.getStatus(vault)).pendingChanges).toBe(1)

    await waitFor(() => fake.jobs.length === 1)
    expect(fake.jobs[0].opts.mode).toBe('incremental')
    expect([...(fake.jobs[0].opts.changed as Set<string>)]).toEqual(['a.md'])
    fake.jobs[0].finish({ status: 'done' })
    await m.shutdown()
  })

  it('Obergrenze: bei dauerndem Schreiben wird trotzdem geflusht', async () => {
    const m = manager()
    await m.setConfig(vault, { enabled: true })
    await m.setVault(vault)
    await writeContainer(['a.md'])
    const t0 = Date.now()
    const ticker = setInterval(() => m.noteFileEvent(vault, 'change', path.join(vault, `n${Date.now()}.md`)), 15)
    try {
      await waitFor(() => fake.jobs.length === 1, 1000)
      expect(Date.now() - t0).toBeLessThan(400)
    } finally {
      clearInterval(ticker)
    }
    fake.jobs[0].finish({ status: 'done' })
    await m.shutdown()
  })

  it('Ereignisse während eines Laufs werden gesammelt und danach nachgezogen', async () => {
    const m = manager()
    await m.setConfig(vault, { enabled: true })
    await m.setVault(vault)
    await writeContainer(['a.md'])
    await m.startBuild(vault)
    m.noteFileEvent(vault, 'change', path.join(vault, 'a.md'))
    m.noteFileEvent(vault, 'unlink', path.join(vault, 'b.md'))
    await new Promise((r) => setTimeout(r, 120))
    expect(fake.jobs).toHaveLength(1) // während des Laufs kein zweiter Job
    expect((await m.getStatus(vault)).pendingChanges).toBe(2)
    fake.jobs[0].finish({ status: 'done' })
    await waitFor(() => fake.jobs.length === 2)
    expect([...(fake.jobs[1].opts.changed as Set<string>)].sort()).toEqual(['a.md', 'b.md'])
    fake.jobs[1].finish({ status: 'done' })
    await m.shutdown()
  })

  it('kein Erstaufbau aus der Warteschlange: Schalter an + Dateiänderung ohne Klick startet nichts (F33)', async () => {
    const m = manager()
    await m.setConfig(vault, { enabled: true })
    await m.setVault(vault)
    m.noteFileEvent(vault, 'change', path.join(vault, 'a.md'))
    await new Promise((r) => setTimeout(r, 150))
    expect(fake.jobs).toHaveLength(0)
    expect((await m.getStatus(vault)).pendingChanges).toBe(0)
    await m.shutdown()
  })

  it('Modul aus: kein Start, laufender Job wird abgebrochen, keine Ereignisse mehr (F33)', async () => {
    const m = manager()
    await m.setConfig(vault, { enabled: true })
    await m.setVault(vault)
    await writeContainer(['a.md'])
    expect((await m.startBuild(vault)).ok).toBe(true)
    await m.setModuleEnabled(false)
    expect(fake.jobs[0].cancelCalls).toBe(1)
    m.noteFileEvent(vault, 'change', path.join(vault, 'a.md'))
    expect((await m.getStatus(vault)).pendingChanges).toBe(0)
    moduleOn = false
    const res = await m.startBuild(vault)
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/Modul/)
    await expect(m.query(vault, 'alpha', undefined, {})).rejects.toThrow(/Modul/)
  })
})

describe('Lebenszyklus-Generation und Änderungsmenge (F30, F32)', () => {
  it('Vault-Wechsel während der Startphase verwirft den Start (F30)', async () => {
    const other = await fs.mkdtemp(path.join(os.tmpdir(), 'mg-mgr-other-'))
    try {
      let releaseModel: (m: string) => void = () => undefined
      const m = manager({ getEmbedModel: () => new Promise<string>((r) => { releaseModel = r }) })
      await m.setConfig(vault, { enabled: true })
      await m.setVault(vault)
      const startA = m.startBuild(vault)
      await new Promise((r) => setTimeout(r, 20))
      await m.setVault(other)
      releaseModel('bge-m3')
      const res = await startA
      expect(res.ok).toBe(false)
      expect(res.error).toMatch(/gewechselt|verworfen/)
      expect(fake.jobs).toHaveLength(0)
    } finally {
      await fs.rm(other, { recursive: true, force: true })
    }
  })

  it('Vault-Wechsel während der Modulprüfung verwirft den Start (F30)', async () => {
    const other = await fs.mkdtemp(path.join(os.tmpdir(), 'mg-mgr-other-'))
    try {
      // Nur die Modulprüfung des Starts (zweiter Aufruf) hängt; setVault-Aufrufe laufen sofort durch.
      let calls = 0
      let releaseA: () => void = () => undefined
      const m = manager({
        isModuleEnabled: () => {
          calls++
          if (calls === 2) return new Promise<boolean>((r) => { releaseA = () => r(true) })
          return Promise.resolve(true)
        }
      })
      await m.setConfig(vault, { enabled: true })
      await m.setVault(vault)
      const startA = m.startBuild(vault)
      await new Promise((r) => setTimeout(r, 20))
      await m.setVault(other)
      releaseA()
      const res = await startA
      expect(res.ok).toBe(false)
      expect(fake.jobs).toHaveLength(0)
    } finally {
      await fs.rm(other, { recursive: true, force: true })
    }
  })

  it('Opt-out während der Modellauflösung verwirft den Start (F30)', async () => {
    let releaseModel: (m: string) => void = () => undefined
    const m = manager({ getEmbedModel: () => new Promise<string>((r) => { releaseModel = r }) })
    await m.setConfig(vault, { enabled: true })
    await m.setVault(vault)
    const startA = m.startBuild(vault)
    await new Promise((r) => setTimeout(r, 20))
    await m.setConfig(vault, { enabled: false })
    releaseModel('bge-m3')
    const res = await startA
    expect(res.ok).toBe(false)
    expect(fake.jobs).toHaveLength(0)
  })

  it('Vault-Wechsel verwirft die Änderungsmenge des abgebrochenen Laufs (F32)', async () => {
    const other = await fs.mkdtemp(path.join(os.tmpdir(), 'mg-mgr-other-'))
    try {
      const m = manager()
      await m.setConfig(vault, { enabled: true })
      await m.setVault(vault)
      await writeContainer(['only-A.md'])
      m.noteFileEvent(vault, 'change', path.join(vault, 'only-A.md'))
      await waitFor(() => fake.jobs.length === 1)
      await m.setVault(other)
      expect(fake.jobs[0].cancelCalls).toBe(1)
      expect((await m.getStatus(other)).pendingChanges).toBe(0)
      // Ein B-Ereignis trägt keine A-Pfade
      await m.setConfig(other, { enabled: true })
      await fs.mkdir(path.join(other, '.mindgraph', 'rag'), { recursive: true })
      m.noteFileEvent(other, 'change', path.join(other, 'b.md'))
      expect((await m.getStatus(other)).pendingChanges).toBeLessThanOrEqual(1)
    } finally {
      await fs.rm(other, { recursive: true, force: true })
    }
  })

  it('Laufzeitfehler legt die Änderungsmenge zurück; nächster Lauf trägt A und B (F32)', async () => {
    const m = manager()
    await m.setConfig(vault, { enabled: true })
    await m.setVault(vault)
    await writeContainer(['a.md', 'b.md'])
    m.noteFileEvent(vault, 'change', path.join(vault, 'a.md'))
    await waitFor(() => fake.jobs.length === 1)
    expect([...(fake.jobs[0].opts.changed as Set<string>)]).toEqual(['a.md'])
    fake.jobs[0].finish({ status: 'error', error: 'Ollama weg' })
    await new Promise((r) => setTimeout(r, 30))
    m.noteFileEvent(vault, 'change', path.join(vault, 'b.md'))
    await waitFor(() => fake.jobs.length === 2, 3000)
    expect([...(fake.jobs[1].opts.changed as Set<string>)].sort()).toEqual(['a.md', 'b.md'])
    fake.jobs[1].finish({ status: 'done' })
    await m.shutdown()
  })

  it('Nutzer-Abbruch startet keinen neuen Lauf aus der Warteschlange; Änderungen bleiben erhalten (F32)', async () => {
    const m = manager()
    await m.setConfig(vault, { enabled: true })
    await m.setVault(vault)
    await writeContainer(['a.md'])
    await m.startBuild(vault)
    m.noteFileEvent(vault, 'change', path.join(vault, 'a.md'))
    await m.cancel(vault)
    await new Promise((r) => setTimeout(r, 200))
    expect(fake.jobs).toHaveLength(1)
    expect((await m.getStatus(vault)).pendingChanges).toBe(1)
    await m.shutdown()
  })
})

describe('Nutzer-Abbruch eines inkrementellen Laufs (F32, Nachprüfung)', () => {
  it('Abbruch behält die laufende Änderungsmenge; nächster Lauf trägt A und B, kein Selbststart', async () => {
    const m = manager()
    await m.setConfig(vault, { enabled: true })
    await m.setVault(vault)
    await writeContainer(['a.md', 'b.md'])
    m.noteFileEvent(vault, 'change', path.join(vault, 'a.md'))
    await waitFor(() => fake.jobs.length === 1)
    expect([...(fake.jobs[0].opts.changed as Set<string>)]).toEqual(['a.md'])
    await m.cancel(vault)
    expect(fake.jobs[0].cancelCalls).toBe(1)
    // A liegt zurück in der Warteschlange, aber ohne Ereignis startet nichts von selbst.
    expect((await m.getStatus(vault)).pendingChanges).toBe(1)
    await new Promise((r) => setTimeout(r, 200))
    expect(fake.jobs).toHaveLength(1)
    // Ein neues Ereignis für B plant wieder — der Lauf trägt A UND B.
    m.noteFileEvent(vault, 'change', path.join(vault, 'b.md'))
    await waitFor(() => fake.jobs.length === 2, 3000)
    expect([...(fake.jobs[1].opts.changed as Set<string>)].sort()).toEqual(['a.md', 'b.md'])
    fake.jobs[1].finish({ status: 'done' })
    await m.shutdown()
  })

  it('Opt-out während eines inkrementellen Laufs verwirft die Änderungsmenge weiterhin', async () => {
    const m = manager()
    await m.setConfig(vault, { enabled: true })
    await m.setVault(vault)
    await writeContainer(['a.md'])
    m.noteFileEvent(vault, 'change', path.join(vault, 'a.md'))
    await waitFor(() => fake.jobs.length === 1)
    await m.setConfig(vault, { enabled: false })
    expect(fake.jobs[0].cancelCalls).toBe(1)
    expect((await m.getStatus(vault)).pendingChanges).toBe(0)
    await m.shutdown()
  })
})

describe('Warteschlangen-Obergrenze (F32)', () => {
  it('sehr viele Pfade verdichten sich zu einem Rescan-Lauf', async () => {
    const m = manager()
    await m.setConfig(vault, { enabled: true })
    await m.setVault(vault)
    await writeContainer(['a.md'])
    for (let i = 0; i < 2100; i++) m.noteFileEvent(vault, 'change', path.join(vault, `n${i}.md`))
    expect((await m.getStatus(vault)).pendingChanges).toBe(1)
    await waitFor(() => fake.jobs.length === 1)
    expect(fake.jobs[0].opts.rescanAll).toBe(true)
    expect(fake.jobs[0].opts.changed).toBeUndefined()
    fake.jobs[0].finish({ status: 'done' })
    await m.shutdown()
  })
})

describe('Pfadschutz (F34)', () => {
  it('Symlink auf .mindgraph/rag und vault-settings.json nach außen wird weder gelesen noch beschrieben noch aufgeräumt', async () => {
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'mg-mgr-outside-'))
    try {
      // Fremder Ordner mit Container + Temp-Datei, fremde Settings-Datei
      const foreignIdentity: VaultIndexIdentity = { model: 'bge-m3:latest', digest: 'sha256:aaa', dim: 4, formatVersion: 1, chunkingVersion: RAG_INDEX_VERSION, excludeKey: '' }
      const foreignRag = path.join(outside, 'rag')
      await fs.mkdir(foreignRag, { recursive: true })
      const foreignMeta: VaultIndexMeta = { identity: foreignIdentity, createdAt: 1, files: {}, chunks: [] }
      await writeVaultIndexAtomic(path.join(foreignRag, 'vault-bge-m3-latest--aaaaaaaaaaaa.ragbin'), foreignMeta, [new Float32Array(0)], 1)
      const foreignTemp = path.join(foreignRag, 'vault-x--000000000000.ragbin.tmp-1-ab')
      await fs.writeFile(foreignTemp, 'x')
      const foreignSettings = path.join(outside, 'vault-settings.json')
      await fs.writeFile(foreignSettings, JSON.stringify({ schemaVersion: 1, features: {}, vaultRag: { enabled: true, excludeFolders: [] } }))

      await fs.mkdir(path.join(vault, '.mindgraph'), { recursive: true })
      await fs.symlink(foreignRag, path.join(vault, '.mindgraph', 'rag'))
      await fs.symlink(foreignSettings, path.join(vault, '.mindgraph', 'vault-settings.json'))

      const m = manager({ assertSafePath: await strictSafePath(vault) })
      await m.setVault(vault)
      // Konfiguration: nicht gelesen (Default aus), nicht geschrieben
      expect((await m.getConfig(vault)).enabled).toBe(false)
      await expect(m.setConfig(vault, { enabled: true })).rejects.toThrow(/außerhalb/)
      expect(JSON.parse(await fs.readFile(foreignSettings, 'utf-8')).vaultRag.enabled).toBe(true)
      // Index: nicht gelesen, Temp nicht aufgeräumt
      const st = await m.getStatus(vault)
      expect(st.index.exists).toBe(false)
      await expect(fs.stat(foreignTemp)).resolves.toBeDefined()
      await m.shutdown()
    } finally {
      await fs.rm(outside, { recursive: true, force: true })
    }
  })
})

describe('Abfrage', () => {
  it('neu ausgeschlossene Ordner fallen sofort weg, excludeMismatch meldet den nötigen Neuaufbau', async () => {
    const m = manager()
    await m.setConfig(vault, { enabled: true })
    await m.setVault(vault)
    await writeContainer(['a/x.md', 'ex/y.md'])
    const before = await m.query(vault, 'alpha', undefined, {})
    expect(before.hits.map((h) => h.fileRel).sort()).toEqual(['a/x.md', 'ex/y.md'])
    expect(before.excludeMismatch).toBe(false)

    await m.setConfig(vault, { excludeFolders: ['ex'] })
    const after = await m.query(vault, 'alpha', undefined, {})
    expect(after.hits.map((h) => h.fileRel)).toEqual(['a/x.md'])
    expect(after.excludeMismatch).toBe(true)
    expect((await m.getStatus(vault)).index.excludeMismatch).toBe(true)
    await m.shutdown()
  })

  it('veraltete Treffer landen in der Warteschlange', async () => {
    const m = manager()
    await m.setConfig(vault, { enabled: true })
    await m.setVault(vault)
    await writeContainer(['a/x.md'])
    await writeNote('a/x.md', '# x\n\nganz anderer Inhalt\n')
    const r = await m.query(vault, 'alpha', undefined, {})
    expect(r.hits).toHaveLength(0)
    expect(r.noFreshSource).toBe(true)
    expect(r.staleFiles).toEqual(['a/x.md'])
    await waitFor(() => fake.jobs.length === 1)
    expect([...(fake.jobs[0].opts.changed as Set<string>)]).toEqual(['a/x.md'])
    fake.jobs[0].finish({ status: 'done' })
    await m.shutdown()
  })

  it('ohne Opt-in oder ohne Index: klare Fehler', async () => {
    const m = manager()
    await expect(m.query(vault, 'alpha', undefined, {})).rejects.toThrow(/nicht eingeschaltet/)
    await m.setConfig(vault, { enabled: true })
    await expect(m.query(vault, 'alpha', undefined, {})).rejects.toThrow(/Kein Vault-Index/)
  })
})
