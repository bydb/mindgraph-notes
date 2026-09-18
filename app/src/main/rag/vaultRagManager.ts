/**
 * Vault-RAG-Manager: Zustand pro aktivem Vault — Opt-in-Konfiguration, laufender
 * Job, Watcher-Warteschlange, geladener Container für Abfragen. `index.ts` bindet
 * nur IPC und Watcher-Fanout an (Vault-Chat-Plan Rev. 3, Entscheidungen 1, 8).
 *
 * Konfiguration liegt als `vaultRag` in `<vault>/.mindgraph/vault-settings.json`
 * (Vault-Eigenschaft, Main-seitig gelesen und per Read-Modify-Write geschrieben);
 * Build-Fortschritt und Staging liegen in userData (gerätelokal).
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import { randomBytes } from 'crypto'
import type { VaultRagSettings } from '../../shared/types'
import { excludeKeyFor, isIndexable, normalizeRelPath, type VaultIndexContainer, type VaultQueryFilters } from '../../shared/rag/vaultIndex'
import { VaultIndexJob, estimateVault, type VaultBuildProgress } from './vaultIndexer'
import { queryVaultIndex, type VaultQueryResult } from './vaultRetrieve'
import { listVaultIndexFiles, loadVaultIndexFile, vaultRagDir, cleanupVaultIndexTemps } from './vaultStore'
import { describeLocalModelError } from './localModel'

type AssertSafePath = (p: string, op: string) => Promise<string>

export interface VaultRagStatus {
  vaultPath: string
  config: VaultRagSettings
  embedModel: string
  index: {
    exists: boolean
    file: string | null
    chunkCount: number
    fileCount: number
    generation: number
    createdAt: number | null
    model: string | null
    digest: string | null
    bytes: number
    /** Ausschlussliste weicht vom Index ab → Voll-Rebuild nötig. */
    excludeMismatch: boolean
  }
  build: VaultBuildProgress | null
  pendingChanges: number
}

export interface VaultRagManagerDeps {
  userDataPath: string
  assertSafePath: AssertSafePath
  /** Aktuelles Embedding-Modell aus den UI-Einstellungen (Main-seitig gelesen). */
  getEmbedModel: () => Promise<string>
  /** Modul „Notizen befragen (RAG)" — Main-seitig aus ui-settings.json (Codex F33). */
  isModuleEnabled: () => Promise<boolean>
  onProgress: (p: VaultBuildProgress) => void
  now?: () => number
  /** Entprellung der Watcher-Warteschlange (Tests verkürzen sie). */
  queueDebounceMs?: number
  /** Obergrenze: spätestens danach wird geflusht, auch wenn weiter Ereignisse kommen. */
  queueMaxWaitMs?: number
}

const DEFAULT_CONFIG: VaultRagSettings = { enabled: false, excludeFolders: [] }
const QUEUE_DEBOUNCE_MS = 30_000
const QUEUE_MAX_WAIT_MS = 5 * 60_000

function normalizeConfig(raw: unknown): VaultRagSettings {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_CONFIG }
  const r = raw as Partial<VaultRagSettings>
  return {
    enabled: r.enabled === true,
    excludeFolders: Array.isArray(r.excludeFolders) ? r.excludeFolders.filter((x): x is string => typeof x === 'string') : []
  }
}

export class VaultRagManager {
  private vaultPath: string | null = null
  private job: VaultIndexJob | null = null
  private jobPromise: Promise<void> | null = null
  private lastProgress: VaultBuildProgress | null = null
  private loaded: { file: string; mtime: number; container: VaultIndexContainer } | null = null
  private pendingChanged = new Set<string>()
  private queueTimer: ReturnType<typeof setTimeout> | null = null
  /** Wann das erste noch unverarbeitete Ereignis kam — Obergrenze gegen Verhungern. */
  private firstPendingAt: number | null = null
  /** Zuletzt gelesene Konfiguration des aktiven Vaults — für den Watcher-Fanout (synchron). */
  private configCache: VaultRagSettings | null = null
  /** Startphase eines Jobs (zwischen Prüfung und Zuweisung) — verhindert Doppelstart. */
  private starting = false
  /** Zuletzt bekanntes Modul-Flag; Watcher-Fanout entscheidet synchron. */
  private moduleOn = true
  /** Alle Schreibweisen des aktiven Vaults (resolve + realpath) — Symlink-sicherer Vergleich. */
  private vaultAliases = new Set<string>()
  private readonly now: () => number
  private readonly queueDebounceMs: number
  private readonly queueMaxWaitMs: number

  constructor(private readonly deps: VaultRagManagerDeps) {
    this.now = deps.now ?? Date.now
    this.queueDebounceMs = deps.queueDebounceMs ?? QUEUE_DEBOUNCE_MS
    this.queueMaxWaitMs = deps.queueMaxWaitMs ?? QUEUE_MAX_WAIT_MS
  }

  // ─── Vault-Lebenszyklus ─────────────────────────────────────────────────────

  /** Synchron: bekannte Schreibweisen des aktiven Vaults. */
  private sameVault(vaultPath: string): boolean {
    return this.vaultPath !== null && this.vaultAliases.has(path.resolve(vaultPath))
  }

  /** Asynchron: löst Symlinks auf und merkt sich die Schreibweise, damit ein Klick aus dem
   *  Renderer (gespeicherter Pfad) den Job des Watchers (Realpath) nicht abbricht. */
  private async isSameVault(vaultPath: string): Promise<boolean> {
    if (this.sameVault(vaultPath)) return true
    if (this.vaultPath === null) return false
    try {
      const real = await fs.realpath(vaultPath)
      if (this.vaultAliases.has(real)) {
        this.vaultAliases.add(path.resolve(vaultPath))
        return true
      }
    } catch {
      /* nicht auflösbar → anderer Vault */
    }
    return false
  }

  async setVault(vaultPath: string | null): Promise<void> {
    if (vaultPath === null ? this.vaultPath === null : await this.isSameVault(vaultPath)) return
    await this.shutdown()
    this.vaultAliases.clear()
    this.configCache = null
    this.vaultPath = vaultPath ? path.resolve(vaultPath) : null
    if (vaultPath) {
      this.vaultAliases.add(path.resolve(vaultPath))
      try {
        this.vaultAliases.add(await fs.realpath(vaultPath))
      } catch {
        /* Vault existiert (noch) nicht */
      }
      // Konfiguration und Modul-Flag eifrig laden: der Watcher-Fanout entscheidet synchron.
      await this.getConfig(vaultPath)
      await this.moduleEnabled()
      const dir = await this.safeRagDir(vaultPath, 'vault-rag-cleanup')
      if (dir) await cleanupVaultIndexTemps(dir, this.deps.assertSafePath).catch(() => undefined)
    }
  }

  async shutdown(): Promise<void> {
    if (this.queueTimer) {
      clearTimeout(this.queueTimer)
      this.queueTimer = null
    }
    this.pendingChanged.clear()
    this.firstPendingAt = null
    if (this.job) {
      this.job.cancel()
      await this.jobPromise?.catch(() => undefined)
    }
    this.job = null
    this.jobPromise = null
    this.loaded = null
    this.lastProgress = null
  }

  // ─── Konfiguration (vault-settings.json, Main-seitig) ───────────────────────

  // Jeder Dateizugriff läuft durch assertSafePath (Codex F34): ein Symlink auf
  // `.mindgraph/rag` oder `vault-settings.json` darf nicht nach außen führen. Nur die
  // geprüften (kanonischen) Pfade werden weiterverwendet.
  private async safeSettingsFile(vaultPath: string, op: string): Promise<string> {
    const mindgraphDir = await this.deps.assertSafePath(path.join(vaultPath, '.mindgraph'), op)
    return this.deps.assertSafePath(path.join(mindgraphDir, 'vault-settings.json'), op)
  }

  private async safeRagDir(vaultPath: string, op: string): Promise<string | null> {
    try {
      return await this.deps.assertSafePath(vaultRagDir(vaultPath), op)
    } catch {
      return null // Ordner fehlt oder zeigt nach außen → wie „kein Index"
    }
  }

  /** Modul-Flag von außen (save-ui-settings): aus → Job stoppen, Warteschlange leeren. */
  async setModuleEnabled(on: boolean): Promise<void> {
    this.moduleOn = on
    if (!on) {
      this.pendingChanged.clear()
      this.firstPendingAt = null
      if (this.vaultPath) await this.cancel(this.vaultPath)
    }
  }

  private async moduleEnabled(): Promise<boolean> {
    this.moduleOn = await this.deps.isModuleEnabled().catch(() => false)
    return this.moduleOn
  }

  async getConfig(vaultPath: string): Promise<VaultRagSettings> {
    let config: VaultRagSettings
    try {
      const file = await this.safeSettingsFile(vaultPath, 'vault-rag-config-read')
      const raw = JSON.parse(await fs.readFile(file, 'utf-8')) as { vaultRag?: unknown }
      config = normalizeConfig(raw?.vaultRag)
    } catch {
      config = { ...DEFAULT_CONFIG }
    }
    if (this.sameVault(vaultPath)) this.configCache = config
    return config
  }

  async setConfig(vaultPath: string, patch: Partial<VaultRagSettings>): Promise<VaultRagSettings> {
    const mindgraphDir = await this.deps.assertSafePath(path.join(vaultPath, '.mindgraph'), 'vault-rag-config-write')
    await fs.mkdir(mindgraphDir, { recursive: true })
    const file = await this.deps.assertSafePath(path.join(mindgraphDir, 'vault-settings.json'), 'vault-rag-config-write')
    let current: Record<string, unknown> = {}
    try {
      current = JSON.parse(await fs.readFile(file, 'utf-8')) as Record<string, unknown>
    } catch {
      current = { schemaVersion: 1, features: {} }
    }
    const merged: VaultRagSettings = normalizeConfig({ ...normalizeConfig(current.vaultRag), ...patch })
    if (patch.excludeFolders) merged.excludeFolders = patch.excludeFolders.map((f) => normalizeRelPath(f)).filter(Boolean)
    await fs.writeFile(file, JSON.stringify({ ...current, vaultRag: merged }, null, 2), 'utf-8')
    if (this.sameVault(vaultPath)) this.configCache = merged
    if (!merged.enabled) {
      // Abschalten stoppt den Job, nicht nur die Anzeige.
      await this.cancel(vaultPath)
      this.pendingChanged.clear()
    }
    return merged
  }

  // ─── Status ─────────────────────────────────────────────────────────────────

  async getStatus(vaultPath: string): Promise<VaultRagStatus> {
    const config = await this.getConfig(vaultPath)
    const embedModel = await this.deps.getEmbedModel()
    const index: VaultRagStatus['index'] = {
      exists: false, file: null, chunkCount: 0, fileCount: 0, generation: 0, createdAt: null, model: null, digest: null, bytes: 0, excludeMismatch: false
    }
    const dir = await this.safeRagDir(vaultPath, 'vault-rag-status')
    const files = dir ? await listVaultIndexFiles(dir, this.deps.assertSafePath) : []
    if (files.length > 0) {
      // Der jüngste Container ist der gültige (nach einem Commit werden ältere entfernt).
      const newest = files.sort((a, b) => b.mtime - a.mtime)[0]
      const container = await this.loadContainer(newest.file)
      if (container) {
        index.exists = true
        index.file = newest.file
        index.chunkCount = container.meta.chunks.length
        index.fileCount = Object.keys(container.meta.files).length
        index.generation = container.generation
        index.createdAt = container.meta.createdAt
        index.model = container.meta.identity.model
        index.digest = container.meta.identity.digest
        index.bytes = newest.bytes
        index.excludeMismatch = container.meta.identity.excludeKey !== excludeKeyFor(config.excludeFolders)
      }
    }
    return {
      vaultPath,
      config,
      embedModel,
      index,
      build: this.job && this.sameVault(vaultPath) ? this.job.snapshot : this.lastProgress,
      pendingChanges: this.pendingChanged.size
    }
  }

  async estimate(vaultPath: string): Promise<{ files: number; bytes: number; chunksApprox: number }> {
    const config = await this.getConfig(vaultPath)
    return estimateVault(vaultPath, config.excludeFolders, this.deps.assertSafePath)
  }

  private async loadContainer(file: string): Promise<VaultIndexContainer | null> {
    try {
      const st = await fs.stat(file)
      if (this.loaded && this.loaded.file === file && this.loaded.mtime === st.mtimeMs) return this.loaded.container
      const container = await loadVaultIndexFile(file)
      if (container) this.loaded = { file, mtime: st.mtimeMs, container }
      return container
    } catch {
      return null
    }
  }

  // ─── Build ──────────────────────────────────────────────────────────────────

  async startBuild(vaultPath: string, mode: 'full' | 'incremental' = 'full', changed?: Set<string>): Promise<{ ok: boolean; jobId?: string; error?: string }> {
    if (!(await this.isSameVault(vaultPath))) await this.setVault(vaultPath)
    if (!(await this.moduleEnabled())) return { ok: false, error: 'Modul „Notizen befragen (RAG)" ist ausgeschaltet' }
    // Sperre über die GESAMTE Startphase: zwischen der Prüfung „läuft schon?" und der
    // Zuweisung liegen Wartepunkte — zwei schnelle Klicks starteten sonst zwei Jobs.
    if (this.job || this.starting) {
      return { ok: false, error: 'Es läuft bereits ein Index-Aufbau', jobId: this.job?.snapshot.jobId }
    }
    this.starting = true
    try {
      return await this.startBuildLocked(vaultPath, mode, changed)
    } finally {
      this.starting = false
    }
  }

  private async startBuildLocked(vaultPath: string, mode: 'full' | 'incremental', changed?: Set<string>): Promise<{ ok: boolean; jobId?: string; error?: string }> {
    const config = await this.getConfig(vaultPath)
    if (!config.enabled) return { ok: false, error: 'Vault-Index ist für diesen Vault nicht eingeschaltet' }

    let embedModel: string
    try {
      embedModel = await this.deps.getEmbedModel()
    } catch (err) {
      return { ok: false, error: describeLocalModelError(err) }
    }
    const jobId = `build-${randomBytes(6).toString('hex')}`
    const existing = this.loaded?.container ?? null
    const job = new VaultIndexJob({
      jobId,
      vaultPath,
      userDataPath: this.deps.userDataPath,
      embedModel,
      excludeFolders: config.excludeFolders,
      mode,
      changed,
      existing,
      assertSafePath: this.deps.assertSafePath,
      onProgress: (p) => {
        this.lastProgress = p
        this.deps.onProgress(p)
      },
      now: this.now
    })
    this.job = job
    this.jobPromise = job
      .run()
      .then(async (result) => {
        if (result.status === 'done' && result.file) {
          // Alten Snapshot freigeben und den frischen Container aus der Datei laden
          // (Validierung inklusive) — spart die Vollkopie im Job-Ergebnis.
          this.loaded = null
          await this.loadContainer(result.file)
        }
      })
      .catch((err) => {
        console.error('[VaultRAG] Job-Fehler:', err)
      })
      .finally(() => {
        if (this.job === job) {
          this.job = null
          this.jobPromise = null
        }
        // Während des Laufs gesammelte Änderungen jetzt nachziehen.
        if (this.pendingChanged.size > 0) this.scheduleFlush(0)
      })
    return { ok: true, jobId }
  }

  pause(vaultPath: string): boolean {
    if (!this.job || !this.sameVault(vaultPath)) return false
    this.job.pause()
    return true
  }

  resume(vaultPath: string): boolean {
    if (!this.job || !this.sameVault(vaultPath)) return false
    this.job.resume()
    return true
  }

  async cancel(vaultPath: string): Promise<boolean> {
    if (!this.job || !this.sameVault(vaultPath)) return false
    this.job.cancel()
    await this.jobPromise?.catch(() => undefined)
    return true
  }

  // ─── Watcher-Warteschlange ──────────────────────────────────────────────────

  /** Fanout des bestehenden Datei-Watchers; gesammelt und 30 s entprellt (F16). */
  noteFileEvent(vaultRoot: string, eventName: string, absPath: string): void {
    if (!this.vaultPath || !this.sameVault(vaultRoot)) return
    if (eventName !== 'add' && eventName !== 'change' && eventName !== 'unlink') return
    // Ohne (bekanntes) Opt-in und ohne Modul keine Warteschlange — sonst sammelt sich hier still ein Backlog.
    if (!this.moduleOn || !this.configCache?.enabled) return
    const rel = normalizeRelPath(path.relative(vaultRoot, absPath))
    if (!rel || rel.startsWith('..')) return
    // Gelöschte Dateien gehen auch durch: der inkrementelle Lauf scannt frisch und
    // lässt sie weg. Nicht indexierbare Pfade interessieren nur, wenn sie im Index waren.
    const exclude = this.configCache?.excludeFolders ?? []
    if (!isIndexable(rel, exclude) && !this.loaded?.container.meta.files[rel]) return
    this.pendingChanged.add(rel)
    if (this.firstPendingAt === null) this.firstPendingAt = this.now()
    this.scheduleFlush(this.queueDebounceMs)
  }

  /**
   * Entprellt, aber mit Obergrenze: Wer eine Stunde durchgehend schreibt, setzt sonst
   * den Timer jedes Mal zurück und bekommt nie eine Aktualisierung.
   */
  private scheduleFlush(delayMs: number): void {
    if (this.queueTimer) clearTimeout(this.queueTimer)
    let delay = delayMs
    if (this.firstPendingAt !== null) {
      const untilMax = this.firstPendingAt + this.queueMaxWaitMs - this.now()
      delay = Math.max(0, Math.min(delayMs, untilMax))
    }
    this.queueTimer = setTimeout(() => {
      this.queueTimer = null
      void this.flushQueue()
    }, delay)
  }

  private async flushQueue(): Promise<void> {
    const vaultPath = this.vaultPath
    if (!vaultPath || this.pendingChanged.size === 0) return
    if (this.job) return // wird nach Jobende erneut geplant
    const config = await this.getConfig(vaultPath)
    if (!config.enabled) {
      this.pendingChanged.clear()
      return
    }
    if (!(await this.moduleEnabled())) {
      this.pendingChanged.clear()
      this.firstPendingAt = null
      return
    }
    // Der Watcher aktualisiert NUR einen bereits autorisierten Bestand (Codex F33): Ohne
    // vorhandenen Index gibt es keinen Erstaufbau aus der Warteschlange — den startet
    // ausschließlich der Klick „Vault-Index erstellen".
    const dir = await this.safeRagDir(vaultPath, 'vault-rag-flush')
    const hasIndex = dir ? (await listVaultIndexFiles(dir, this.deps.assertSafePath)).length > 0 : false
    if (!hasIndex) {
      this.pendingChanged.clear()
      this.firstPendingAt = null
      return
    }
    const changed = new Set(this.pendingChanged)
    this.pendingChanged.clear()
    this.firstPendingAt = null
    const res = await this.startBuild(vaultPath, 'incremental', changed)
    if (!res.ok) {
      // Zurücklegen, damit nichts verloren geht (z.B. Ollama gerade nicht erreichbar).
      for (const rel of changed) this.pendingChanged.add(rel)
      if (this.firstPendingAt === null) this.firstPendingAt = this.now()
      this.scheduleFlush(this.queueDebounceMs * 2)
    }
  }

  // ─── Abfrage ────────────────────────────────────────────────────────────────

  async query(
    vaultPath: string,
    query: string,
    filters: VaultQueryFilters | undefined,
    opts: { topK?: number; minScore?: number; perFileCap?: number; signal?: AbortSignal } = {}
  ): Promise<VaultQueryResult & { excludeMismatch: boolean }> {
    if (!(await this.moduleEnabled())) throw new Error('Modul „Notizen befragen (RAG)" ist ausgeschaltet')
    const config = await this.getConfig(vaultPath)
    if (!config.enabled) throw new Error('Vault-Index ist für diesen Vault nicht eingeschaltet')
    const dir = await this.safeRagDir(vaultPath, 'vault-rag-query')
    const files = dir ? await listVaultIndexFiles(dir, this.deps.assertSafePath) : []
    if (files.length === 0) throw new Error('Kein Vault-Index vorhanden — bitte zuerst „Vault-Index erstellen"')
    const newest = files.sort((a, b) => b.mtime - a.mtime)[0]
    const container = await this.loadContainer(newest.file)
    if (!container) throw new Error('Vault-Index unlesbar — bitte neu aufbauen')
    const embedModel = await this.deps.getEmbedModel()
    // Die AKTUELLE Ausschlussliste gilt sofort als Vorfilter; ein neu ausgeschlossener
    // Ordner erscheint nicht bis zum Neuaufbau weiter als Quelle. Neu freigegebene
    // Ordner kommen erst mit dem Neuaufbau in den Index — `excludeMismatch` sagt das.
    const result = await queryVaultIndex(
      container,
      vaultPath,
      { query, embedModel, filters, excludeFolders: config.excludeFolders, ...opts },
      this.deps.assertSafePath
    )
    const excludeMismatch = container.meta.identity.excludeKey !== excludeKeyFor(config.excludeFolders)
    if (result.staleFiles.length > 0 && (await this.isSameVault(vaultPath))) {
      for (const rel of result.staleFiles) this.pendingChanged.add(rel)
      if (this.firstPendingAt === null) this.firstPendingAt = this.now()
      this.scheduleFlush(this.queueDebounceMs)
    }
    return { ...result, excludeMismatch }
  }
}
