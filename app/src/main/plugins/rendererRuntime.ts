// RendererRuntime — main-seitige Autoritätsgrenze für externe Renderer-Plugins
// (ADR plugin-renderer-host §5.1/§5.3/§5.4). Spiegelt das Muster von ExternalWidgetRuntime
// (widgets.ts), hält aber die VERIFIZIERTEN Renderer-Bytes (VerifiedRendererPayload) und mintet
// pro aktiver Version eine `generation` + eine zufällige `rendererInstanceId`.
//
// Die `rendererInstanceId` ist Routing-/Lifecycle-Mechanik (I-S1), KEINE Trust-Grenze: signierte
// Renderer-Plugins laufen voll vertraut im Haupt-Renderer (§4). Der Renderer nennt in `plugin:host`
// nie eine pluginId — Main löst instanceId→pluginId aus DIESER Map auf.

import { randomUUID } from 'node:crypto'
import type { FileEditorDecl } from '@mindgraph/plugin-api'
import type { VerifiedRendererPayload } from './artifact/verify'

/** Main-interner Eintrag inkl. der verifizierten Bytes (verlässt den Main-Prozess NIE als Ganzes). */
export interface RendererRuntimeEntry {
  pluginId: string
  pluginLabel: string
  version: string
  /** Monoton steigend; identifiziert eine konkrete Aktivierung (Drain-/Invalidierungs-Generation). */
  generation: number
  /** Main-gemintet, bindet pluginId unveränderlich für `plugin:host`-Scoping. */
  rendererInstanceId: string
  payload: VerifiedRendererPayload
  fileEditors: FileEditorDecl[]
}

/** Die an den Renderer gereichte Beschreibung — OHNE Bytes (die holt der Renderer per
 *  `plugin:rendererEntry`, das den Code separat liefert). */
export interface RendererDescriptor {
  pluginId: string
  pluginLabel: string
  version: string
  rendererInstanceId: string
  fileEditors: FileEditorDecl[]
}

export interface RendererActivation {
  pluginId: string
  pluginLabel: string
  version: string
  payload: VerifiedRendererPayload
  fileEditors: FileEditorDecl[]
}

/**
 * Hält die aktiven Renderer-Beiträge. `activate` ersetzt einen vorhandenen Eintrag desselben Plugins
 * atomar (die alte `rendererInstanceId` wird sofort ungültig → in-flight `plugin:host`-Calls der alten
 * Generation finden ihre Instanz nicht mehr; siehe §5.5-Drain im Aufrufer). Reiner Zustand, keine I/O.
 */
export class RendererRuntime {
  private byPlugin = new Map<string, RendererRuntimeEntry>()
  private byInstance = new Map<string, RendererRuntimeEntry>()
  private generationCounter = 0

  constructor(private readonly mintId: () => string = randomUUID) {}

  /** Aktiviert/ersetzt den Renderer-Beitrag eines Plugins; liefert den (byte-freien) Descriptor. */
  activate(a: RendererActivation): RendererDescriptor {
    this.deactivate(a.pluginId)
    const generation = ++this.generationCounter
    const rendererInstanceId = this.mintId()
    const entry: RendererRuntimeEntry = {
      pluginId: a.pluginId,
      pluginLabel: a.pluginLabel,
      version: a.version,
      generation,
      rendererInstanceId,
      payload: a.payload,
      fileEditors: a.fileEditors,
    }
    this.byPlugin.set(a.pluginId, entry)
    this.byInstance.set(rendererInstanceId, entry)
    return describe(entry)
  }

  /** Entfernt den Renderer-Beitrag eines Plugins (Disable/Uninstall/Upgrade-Vorbereitung). */
  deactivate(pluginId: string): void {
    const prev = this.byPlugin.get(pluginId)
    if (!prev) return
    this.byPlugin.delete(pluginId)
    this.byInstance.delete(prev.rendererInstanceId)
  }

  /** Serve-Gate (I-L2): der aktive Eintrag eines Plugins inkl. Bytes, oder undefined. */
  getByPluginId(pluginId: string): RendererRuntimeEntry | undefined {
    return this.byPlugin.get(pluginId)
  }

  /** Auflösung instanceId→Eintrag für `plugin:host` (I-S1); undefined nach Invalidierung. */
  getByInstanceId(rendererInstanceId: unknown): RendererRuntimeEntry | undefined {
    if (typeof rendererInstanceId !== 'string') return undefined
    return this.byInstance.get(rendererInstanceId)
  }

  /** Byte-freie Liste für den `plugin:renderers-changed`-Push an den Renderer. */
  list(): RendererDescriptor[] {
    return [...this.byPlugin.values()].map(describe)
  }
}

function describe(e: RendererRuntimeEntry): RendererDescriptor {
  return {
    pluginId: e.pluginId,
    pluginLabel: e.pluginLabel,
    version: e.version,
    rendererInstanceId: e.rendererInstanceId,
    fileEditors: e.fileEditors,
  }
}
