/**
 * Entfernt alle Wikilinks (keine Einbettungen `![[…]]`), deren Ziel `resolvesToTarget`
 * bejaht — egal ob mit H1-Titel, Dateiname, Pfad, `#Überschrift` oder `|Alias` geschrieben.
 * Für „Verbindung löschen“ im Graphen: vorher wurden nur `[[H1]]` und `[[pfad]]` entfernt,
 * ein `[[Dateiname]]` aus der neuen Vervollständigung blieb stehen und die Kante kam
 * nach dem Neuberechnen zurück (Codex F30).
 */
const WIKILINK = /(?<!!)\[\[([^\]|#]+)(#[^\]|]*)?(\|[^\]]*)?\]\]/g

export function removeWikilinksTo(content: string, resolvesToTarget: (linkTarget: string) => boolean): string {
  return content.replace(WIKILINK, (match, target: string) => (resolvesToTarget(target.trim()) ? '' : match))
}
