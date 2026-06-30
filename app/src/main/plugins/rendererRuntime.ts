// RendererRuntime — main-seitige Autoritätsgrenze für externe Renderer-Plugins
// (ADR plugin-renderer-host §5.1/§5.3/§5.4). Spiegelt das Muster von ExternalWidgetRuntime
// (widgets.ts), hält aber die VERIFIZIERTEN Renderer-Bytes (VerifiedRendererPayload) und mintet
// pro aktiver Version eine `generation` + eine zufällige `rendererInstanceId`.
//
// Bytes-Eigentum (R1-impl-F03): das Modul gibt NIE seine internen Einträge/Buffer heraus. Externe
// Caller bekommen ausschließlich schmale, kopierte Abfragen: `servePayload` (utf8-Strings + geklonte
// fileEditors), `resolveInstance` (nur Metadaten) und `list` (byte-freie Descriptoren).
//
// Die `rendererInstanceId` ist Routing-/Lifecycle-Mechanik (I-S1), KEINE Trust-Grenze: signierte
// Renderer-Plugins laufen voll vertraut im Haupt-Renderer (§4). Der Renderer nennt in `plugin:host`
// nie eine pluginId — Main löst instanceId→pluginId aus DIESER Map auf.
//
// HINWEIS (Task 5): der strikte §5.5-Lifecycle (Call-Gate, In-Flight-Zähler, Drain-vor-Unload) wird
// hier ergänzt, sobald die Renderer-Seite (Task 8) den Aktivierungs-Ack liefert — er ist ohne die
// Renderer-Gegenstelle nicht ausübbar. Aktuell: atomarer Ersatz + Generation als Naht dafür.

import { randomUUID } from 'node:crypto'
import type { FileEditorDecl } from '@mindgraph/plugin-api'
import type { VerifiedRendererPayload } from './artifact/verify'

/** Main-interner Eintrag inkl. der verifizierten Bytes (verlässt das Modul NIE als Referenz). */
interface RendererRuntimeEntry {
  pluginId: string
  pluginLabel: string
  version: string
  generation: number
  rendererInstanceId: string
  payload: VerifiedRendererPayload
  fileEditors: FileEditorDecl[]
}

/** Die an den Renderer gereichte Beschreibung — OHNE Bytes (die holt der Renderer per
 *  `plugin:rendererEntry`/`servePayload`). */
export interface RendererDescriptor {
  pluginId: string
  pluginLabel: string
  version: string
  rendererInstanceId: string
  fileEditors: FileEditorDecl[]
}

/** Serve-Ergebnis für `plugin:rendererEntry`: Code/Styles als utf8-String (kein Buffer entkommt). */
export interface RendererServe {
  rendererInstanceId: string
  pluginId: string
  pluginLabel: string
  version: string
  code: string
  styles?: string
  fileEditors: FileEditorDecl[]
}

/** Auflösung instanceId→Metadaten für `plugin:host` (I-S1) — KEINE Bytes. */
export interface RendererInstanceRef {
  pluginId: string
  version: string
  generation: number
}

export interface RendererActivation {
  pluginId: string
  pluginLabel: string
  version: string
  payload: VerifiedRendererPayload
  fileEditors: FileEditorDecl[]
}

const cloneFileEditors = (fe: FileEditorDecl[]): FileEditorDecl[] =>
  fe.map((f) => ({ editorId: f.editorId, extensions: [...f.extensions], ...(f.label ? { label: f.label } : {}) }))

/**
 * Hält die aktiven Renderer-Beiträge. `activate` ersetzt einen vorhandenen Eintrag desselben Plugins
 * **atomar** (neuen Eintrag erst vollständig bauen, dann beide Indizes in einem Schritt umsetzen — die
 * alte `rendererInstanceId` wird dabei ungültig). Reiner Zustand, keine I/O.
 */
export class RendererRuntime {
  private byPlugin = new Map<string, RendererRuntimeEntry>()
  private byInstance = new Map<string, RendererRuntimeEntry>()
  private generationCounter = 0

  constructor(private readonly mintId: () => string = randomUUID) {}

  /** Aktiviert/ersetzt den Renderer-Beitrag eines Plugins; liefert den (byte-freien) Descriptor. */
  activate(a: RendererActivation): RendererDescriptor {
    const generation = ++this.generationCounter
    const rendererInstanceId = this.mintUniqueId()
    const entry: RendererRuntimeEntry = {
      pluginId: a.pluginId,
      pluginLabel: a.pluginLabel,
      version: a.version,
      generation,
      rendererInstanceId,
      // Eigene Kopie der verifizierten Bytes (R1-impl-F03): externe Mutation der Eingabe darf die
      // Serve-Bytes nicht mehr ändern. Das Modul ist ab hier alleiniger Eigentümer.
      payload: {
        code: Buffer.from(a.payload.code),
        styles: a.payload.styles ? Buffer.from(a.payload.styles) : undefined,
        hash: a.payload.hash,
      },
      fileEditors: cloneFileEditors(a.fileEditors),
    }
    // Atomarer Swap: alten Eintrag (falls vorhanden) erst JETZT entfernen, dann neuen setzen —
    // der neue Eintrag ist bereits vollständig + ID-kollisionsfrei gebaut (kein Zwischenzustand
    // „weder alt noch neu"; kein Überschreiben einer fremden instanceId).
    const prev = this.byPlugin.get(a.pluginId)
    if (prev) this.byInstance.delete(prev.rendererInstanceId)
    this.byPlugin.set(a.pluginId, entry)
    this.byInstance.set(rendererInstanceId, entry)
    return describe(entry)
  }

  /**
   * Gleicht den aktiven Bestand an die übergebene Liste an — **instanceId-stabil**: ein unveränderter
   * Eintrag (gleiche `version` + `payload.hash`) BEHÄLT seine `rendererInstanceId`. Entfernte Plugins
   * werden deaktiviert, geänderte/neue (re-)aktiviert. Liefert `changed`.
   */
  syncActive(activations: readonly RendererActivation[]): { changed: boolean } {
    const want = new Map(activations.map((a) => [a.pluginId, a]))
    let changed = false
    for (const id of [...this.byPlugin.keys()]) {
      if (!want.has(id)) {
        this.deactivate(id)
        changed = true
      }
    }
    for (const a of activations) {
      const prev = this.byPlugin.get(a.pluginId)
      if (prev && prev.version === a.version && prev.payload.hash === a.payload.hash) {
        prev.pluginLabel = a.pluginLabel // Anzeige aktualisieren, Identität (instanceId) erhalten
        prev.fileEditors = cloneFileEditors(a.fileEditors)
        continue
      }
      this.activate(a)
      changed = true
    }
    return { changed }
  }

  /** Entfernt den Renderer-Beitrag eines Plugins (Disable/Uninstall/Upgrade-Vorbereitung). */
  deactivate(pluginId: string): void {
    const prev = this.byPlugin.get(pluginId)
    if (!prev) return
    this.byPlugin.delete(pluginId)
    this.byInstance.delete(prev.rendererInstanceId)
  }

  /** Serve-Gate (I-L2) für `plugin:rendererEntry`: Code/Styles als utf8-Strings + geklonte Metadaten,
   *  oder `undefined`, wenn das Plugin nicht aktiv ist. Kein Buffer/kein interner Eintrag entkommt. */
  servePayload(pluginId: unknown): RendererServe | undefined {
    if (typeof pluginId !== 'string') return undefined
    const e = this.byPlugin.get(pluginId)
    if (!e) return undefined
    return {
      rendererInstanceId: e.rendererInstanceId,
      pluginId: e.pluginId,
      pluginLabel: e.pluginLabel,
      version: e.version,
      code: e.payload.code.toString('utf8'),
      styles: e.payload.styles?.toString('utf8'),
      fileEditors: cloneFileEditors(e.fileEditors),
    }
  }

  /** Auflösung instanceId→Metadaten für `plugin:host` (I-S1); `undefined` nach Invalidierung. */
  resolveInstance(rendererInstanceId: unknown): RendererInstanceRef | undefined {
    if (typeof rendererInstanceId !== 'string') return undefined
    const e = this.byInstance.get(rendererInstanceId)
    if (!e) return undefined
    return { pluginId: e.pluginId, version: e.version, generation: e.generation }
  }

  /** Byte-freie Liste für den `plugin:renderers-changed`-Push an den Renderer. */
  list(): RendererDescriptor[] {
    return [...this.byPlugin.values()].map(describe)
  }

  /** Mintet eine ID, die garantiert noch nicht vergeben ist (Kollisions-Guard). */
  private mintUniqueId(): string {
    for (let i = 0; i < 8; i++) {
      const id = this.mintId()
      if (!this.byInstance.has(id)) return id
    }
    throw new Error('RendererRuntime: konnte keine eindeutige rendererInstanceId minten')
  }
}

function describe(e: RendererRuntimeEntry): RendererDescriptor {
  return {
    pluginId: e.pluginId,
    pluginLabel: e.pluginLabel,
    version: e.version,
    rendererInstanceId: e.rendererInstanceId,
    fileEditors: cloneFileEditors(e.fileEditors),
  }
}
