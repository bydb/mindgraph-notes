/** Task-Zählung: Ordner-Ausschluss mit „nächster Vorfahre entscheidet"-Semantik (wie .gitignore).
 *
 *  Zwei Listen vault-relativer Ordnerpfade: `excluded` nimmt einen Teilbaum aus der
 *  Task-Zählung, `included` nimmt einen Teilbaum DARUNTER wieder auf. Für jeden Pfad
 *  entscheidet der tiefste Treffer aus beiden Listen; kein Treffer = eingeschlossen.
 *  Steht derselbe Ordner in beiden Listen (sollte der Toggle verhindern), gewinnt included.
 */

/** Länge des tiefsten Listen-Treffers für einen Pfad, -1 ohne Treffer.
 *  matchSelf: Ordnerpfade matchen sich selbst, Notiz-Pfade nur echte Vorfahren. */
function deepestMatch(path: string, folders: string[], matchSelf: boolean): number {
  let deepest = -1
  for (const f of folders) {
    if (!f) continue
    if (((matchSelf && path === f) || path.startsWith(f + '/')) && f.length > deepest) {
      deepest = f.length
    }
  }
  return deepest
}

/** Ist eine Notiz unter diesem Pfad von der Task-Zählung ausgeschlossen? */
export function isTaskPathExcluded(notePath: string, excluded: string[], included: string[]): boolean {
  const ex = deepestMatch(notePath, excluded, false)
  if (ex < 0) return false
  return ex > deepestMatch(notePath, included, false)
}

/** Effektiver Zustand eines Ordners — für das Kontextmenü-Label im Dateibaum. */
export function isTaskFolderExcluded(folderPath: string, excluded: string[], included: string[]): boolean {
  const ex = deepestMatch(folderPath, excluded, true)
  if (ex < 0) return false
  return ex > deepestMatch(folderPath, included, true)
}

/** Kippt den effektiven Zustand eines Ordners und liefert die neuen Listen.
 *  Räumt dabei alle Einträge auf dem Ordner selbst und unterhalb aus BEIDEN Listen —
 *  der Klick definiert den Zustand des ganzen Teilbaums neu. Ein Listen-Eintrag
 *  entsteht nur, wenn der Zielzustand vom geerbten Zustand abweicht. */
export function toggleTaskFolder(
  folderPath: string,
  excluded: string[],
  included: string[]
): { excluded: string[]; included: string[] } {
  const targetExcluded = !isTaskFolderExcluded(folderPath, excluded, included)
  const clean = (list: string[]) => list.filter(f => f !== folderPath && !f.startsWith(folderPath + '/'))
  const nextExcluded = clean(excluded)
  const nextIncluded = clean(included)
  const inheritedExcluded = isTaskFolderExcluded(folderPath, nextExcluded, nextIncluded)
  if (targetExcluded !== inheritedExcluded) {
    (targetExcluded ? nextExcluded : nextIncluded).push(folderPath)
  }
  return { excluded: nextExcluded, included: nextIncluded }
}
