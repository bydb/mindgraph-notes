// Welche Agent-Ergebnisse die App selbst NICHT darstellen kann.
//
// Markdown zeigt der Editor, HTML die eingebaute Vorschau, PDF und Bilder der Viewer.
// Office-Dateien erzeugt die App dagegen, ohne sie lesbar zu machen: ein DOCX landet im
// Zielordner und der Nutzer muss es im Finder suchen. Für genau diese Formate bekommt die
// Ergebniskarte den zweiten Knopf „Übernehmen und öffnen".
//
// Bewusst eine Allowlist der Ausnahmen statt einer Sperrliste des Darstellbaren: ein neues
// Format, das die App nicht kennt, soll keinen Knopf bekommen, den niemand geprüft hat.
export const FORMATS_NEEDING_EXTERNAL_APP = [
  '.docx', '.doc', '.xlsx', '.xls', '.pptx', '.ppt',
  '.odt', '.ods', '.odp', '.rtf',
  '.pages', '.numbers', '.key'
]

export function needsExternalApp(fileName: string): boolean {
  const lower = fileName.trim().toLowerCase()
  return FORMATS_NEEDING_EXTERNAL_APP.some(ext => lower.endsWith(ext))
}

// Formate, die ein Renderer-Plugin in der App öffnet (Excalidraw-Mindmap aus write_excalidraw).
// „Übernehmen und öffnen" führt hier in den Plugin-Tab, nie ins Systemprogramm — und ohne
// aktives Plugin bekommt die Karte einen Hinweis statt eines Knopfs (Codex F05).
export const PLUGIN_RESULT_FORMATS = ['.excalidraw']

export function isPluginResultFormat(fileName: string): boolean {
  const lower = fileName.trim().toLowerCase()
  return PLUGIN_RESULT_FORMATS.some(ext => lower.endsWith(ext))
}

export interface PluginEditorClaim {
  pluginId: string
  editorId: string
  /** Endung mit Punkt, klein geschrieben (`.excalidraw`). */
  extension: string
}

/** Das aktive Plugin, das die Endung des Dateinamens beansprucht — oder null. */
export function findPluginEditorClaim(fileName: string, claims: readonly PluginEditorClaim[]): PluginEditorClaim | null {
  const lower = fileName.trim().toLowerCase()
  return claims.find(c => c.extension && lower.endsWith(c.extension)) ?? null
}
