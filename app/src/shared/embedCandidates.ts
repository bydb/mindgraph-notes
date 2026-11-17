/**
 * Reihenfolge, in der ein Einbettungs-/Dateiziel im Vault gesucht wird (vault-relativ).
 *
 * - Ziel MIT Ordnerpfad (`Projekt/bild.png`): zuerst ab der Vault-Wurzel. So meinen es die
 *   Vervollständigung und das Ziehen aus dem Dateibaum, die bei Namensdopplung genau diesen
 *   Pfad einfügen. Vorher gewann der gleich lautende Unterpfad neben der Notiz
 *   (filetree-drag-link.md, F27). Neben der Notiz wird danach weiter gesucht.
 * - Ziel OHNE Ordner (`bild.png`): wie bisher zuerst neben der Notiz, dann an der Wurzel.
 * Danach die üblichen Anhangordner. Ein Unterschied entsteht nur, wenn beide Dateien existieren.
 */
export function embedCandidatePaths(target: string, noteDir: string, extraFolders: readonly string[] = []): string[] {
  const clean = target.replace(/^\/+/, '')
  const nextToNote = noteDir ? `${noteDir}/${clean}` : null
  const ordered = clean.includes('/') ? [clean, nextToNote] : [nextToNote, clean]
  const all = [...ordered, ...extraFolders.map(f => `${f}/${clean}`)].filter((p): p is string => !!p)
  return [...new Set(all)]
}
