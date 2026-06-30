// FileEditorResolver — tiefes, prozessübergreifendes Modul (ADR plugin-renderer-host §8, R1-F09).
//
// EINE Quelle der Wahrheit für „welche Dateiendung gehört welchem Plugin-Editor". Genutzt von
// Discovery, Install/Upgrade (Kollisions-Gate VOR active.json-Commit), der plugin-bewussten
// Datei-Seam (FileTree-Klassifikation + Vault-Watcher) und dem Tab-Routing.
//
// Reine Logik, keine I/O. Das Kern-Endungs-Set wird per Dependency Injection übergeben, weil die
// volle Liste (md/pdf/Bilder/Office/Code/Spezialnamen) am Aufrufort lebt (`getFileType` im Main) —
// so gibt es kein dupliziertes, driftendes Zweit-Verzeichnis. `WELL_KNOWN_CORE_EXTENSIONS` ist nur
// die Basis der nicht-Code-Kerntypen (für Tests + als Ausgangspunkt).

import type { FileEditorDecl } from '@mindgraph/plugin-api'

/** Ein aufgelöster Editor-Anspruch: welches Plugin + welche deklarierte editorId eine Endung bedient. */
export interface FileEditorClaim {
  pluginId: string
  editorId: string
}

/** Die fileEditors-Deklarationen EINES (aktiven/kandidierenden) Plugins. */
export interface PluginFileEditors {
  pluginId: string
  fileEditors: FileEditorDecl[]
}

export type ResolverErrorKind = 'invalid-extension' | 'core-collision' | 'plugin-collision'

export interface ResolverError {
  kind: ResolverErrorKind
  extension: string
  pluginId: string
  editorId: string
  /** Bei `plugin-collision`: die ID des Plugins, das die Endung bereits beansprucht. */
  otherPluginId?: string
}

export interface ResolvedFileEditors {
  /** normalisierte Endung → Anspruch. Enthält nur kollisionsfreie Einträge (erste Quelle gewinnt). */
  byExtension: Map<string, FileEditorClaim>
  /** Jede Kollision/Ungültigkeit ist TERMINAL — der Aufrufer aktiviert ein Plugin mit Fehlern NICHT. */
  errors: ResolverError[]
}

/** Basis der nicht-Code-Kerntypen. Der Main-Aufrufer ergänzt Code-Endungen + Spezialnamen aus
 *  `getFileType`/`CODE_FILE_EXTENSIONS_MAIN` und übergibt das vereinigte Set an `resolveFileEditors`. */
export const WELL_KNOWN_CORE_EXTENSIONS: readonly string[] = [
  '.md', '.pdf', '.pdf.md', '.canvas', '.base',
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.avif',
  '.docx', '.doc', '.xlsx', '.xls', '.pptx', '.ppt',
]

const LEADING_DOTS = /^\.+/
const FORBIDDEN_IN_EXT = /[\s/\\]/ // Whitespace + Pfadtrenner; Bindestrich/Unterstrich sind erlaubt

/**
 * Normalisiert eine beanspruchte Endung: NFC, kleingeschrieben, genau EIN führender Punkt; innere
 * Punkte (Mehrfachendung `.pdf.md`) bleiben erhalten. Gibt `null` für ungültige Eingaben zurück
 * (leer, nur Punkte, Whitespace, Pfadtrenner).
 */
export function normalizeExtension(raw: string): string | null {
  if (typeof raw !== 'string') return null
  const s = raw.normalize('NFC').trim().toLowerCase().replace(LEADING_DOTS, '')
  if (s === '') return null
  if (FORBIDDEN_IN_EXT.test(s)) return null
  return '.' + s
}

/**
 * Die Endungs-Kandidaten eines echten Dateinamens, **längste zuerst** (für `.pdf.md` vor `.md`).
 * Klassifikation matcht den längsten beanspruchten Suffix.
 */
export function extensionCandidates(fileName: string): string[] {
  const base = fileName.normalize('NFC').toLowerCase().split(/[/\\]/).pop() ?? ''
  const parts = base.split('.')
  const out: string[] = []
  for (let i = 1; i < parts.length; i++) {
    const cand = '.' + parts.slice(i).join('.')
    if (cand.length > 1) out.push(cand)
  }
  return out // i=1 ist der längste Suffix → bereits längste zuerst
}

/**
 * Baut die vollständige Endung→Anspruch-Abbildung über ALLE übergebenen (aktiven + kandidierenden)
 * Plugins und meldet jede Kollision. Der Aufrufer validiert damit den **vollständigen nächsten
 * Zustand VOR dem `active.json`-Commit**: gibt es Fehler, wird das kandidierende Plugin terminal
 * abgelehnt (kein still-degradiertes Routing).
 */
export function resolveFileEditors(
  plugins: PluginFileEditors[],
  coreExtensions: Iterable<string>,
): ResolvedFileEditors {
  const core = new Set<string>()
  for (const c of coreExtensions) {
    const n = normalizeExtension(c)
    if (n) core.add(n)
  }

  const byExtension = new Map<string, FileEditorClaim>()
  const errors: ResolverError[] = []

  for (const { pluginId, fileEditors } of plugins) {
    for (const fe of fileEditors ?? []) {
      for (const rawExt of fe.extensions ?? []) {
        const ext = normalizeExtension(rawExt)
        if (!ext) {
          errors.push({ kind: 'invalid-extension', extension: rawExt, pluginId, editorId: fe.editorId })
          continue
        }
        if (core.has(ext)) {
          errors.push({ kind: 'core-collision', extension: ext, pluginId, editorId: fe.editorId })
          continue
        }
        const existing = byExtension.get(ext)
        if (existing) {
          if (existing.pluginId !== pluginId || existing.editorId !== fe.editorId) {
            errors.push({
              kind: 'plugin-collision',
              extension: ext,
              pluginId,
              editorId: fe.editorId,
              otherPluginId: existing.pluginId,
            })
          }
          continue // erste Quelle bleibt deterministisch erhalten
        }
        byExtension.set(ext, { pluginId, editorId: fe.editorId })
      }
    }
  }

  return { byExtension, errors }
}

/** Schlägt den (längsten passenden) Editor-Anspruch für einen Dateinamen nach, sonst `null`. */
export function lookupFileEditor(fileName: string, resolved: ResolvedFileEditors): FileEditorClaim | null {
  for (const cand of extensionCandidates(fileName)) {
    const claim = resolved.byExtension.get(cand)
    if (claim) return claim
  }
  return null
}
