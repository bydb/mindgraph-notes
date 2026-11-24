// Lese-Abdeckung eines angehängten Ordners bei angehobenem Kontextfenster (24.11.2026).
//
// Anlass: Mit 262 144 Token Fenster las das Modell aus einem Ordner mit 17 Dateien fünf bis
// sechs und schrieb dann — auch mit ausdrücklicher Anweisung im Prompt („lies JEDE Datei“).
// Deshalb erzwingt die App eine einzige Rückfrage: Der erste Schreibversuch wird zurückgestellt
// und nennt die ungelesenen Dateien beim Namen. Der zweite geht durch — der Auftrag kann ja
// wirklich nur einen Teil meinen. Pur, damit die Regel testbar ist.

/** Bis zu dieser Zahl lesbarer Dateien gilt „alles lesen“; darüber ist folder_digest der Weg. */
export const COVERAGE_MAX_FILES = 30

export interface CoverageFile { name: string; kind: string }
export interface CoverageFolder { folder: string; files: CoverageFile[] }
export interface UnreadFile { folder: string; name: string; kind: string }

const norm = (s: string): string => s.normalize('NFC').toLowerCase().replace(/\\/g, '/').replace(/^\.?\//, '')
const base = (s: string): string => { const n = norm(s); const i = n.lastIndexOf('/'); return i < 0 ? n : n.slice(i + 1) }

/**
 * Ungelesene Dateien. null = die Regel greift nicht (kein Ordner, zu viele Dateien).
 * `read` je Ordner: Pfade, wie die Lesewerkzeuge sie gemeldet haben, oder wie das Modell sie
 * angab — verglichen wird lose (Groß/Klein, reiner Dateiname).
 */
export function unreadFolderFiles(
  folders: CoverageFolder[],
  read: Map<string, Set<string>>,
  opts: { imagesReadable: boolean; skipFolders?: Set<string> }
): UnreadFile[] | null {
  const relevant = folders
    .filter(f => !opts.skipFolders?.has(f.folder))
    .map(f => ({ folder: f.folder, files: f.files.filter(x => opts.imagesReadable || x.kind !== 'image') }))
  const total = relevant.reduce((n, f) => n + f.files.length, 0)
  if (total === 0 || total > COVERAGE_MAX_FILES) return null
  const unread: UnreadFile[] = []
  for (const f of relevant) {
    const seen = read.get(f.folder) ?? new Set<string>()
    const full = new Set([...seen].map(norm))
    const bases = new Set([...seen].map(base))
    for (const file of f.files) {
      if (full.has(norm(file.name)) || bases.has(base(file.name))) continue
      unread.push({ folder: f.folder, name: file.name, kind: file.kind })
    }
  }
  return unread
}

/** Antwort an das Modell auf den zurückgestellten Schreibversuch. */
export function coverageMessage(unread: UnreadFile[], canViewImages: boolean): string {
  const lines = unread.map(u => `- ${u.folder}/${u.name}${u.kind === 'image' ? (canViewImages ? ' (Bild: describe_image)' : ' (Bild: read_context_file erkennt den Text)') : ''}`)
  return [
    `Noch nicht geschrieben — eine Rückfrage der App, sie kommt nur dieses eine Mal.`,
    `Der Nutzer hat ein großes Kontextfenster eingestellt, damit du den angehängten Ordner ganz lesen kannst. Diese ${unread.length} ${unread.length === 1 ? 'Datei hast' : 'Dateien hast'} du noch nicht gelesen:`,
    ...lines,
    `Lies sie jetzt mit read_context_file (mehrere Aufrufe in einer Runde sind erlaubt) und schreibe danach das Ergebnis aus ALLEM, was du gelesen hast.`,
    `Meint der Auftrag ausdrücklich nur die schon gelesenen Dateien, rufe das Schreibwerkzeug unverändert noch einmal auf und nenne im Abschlusstext, welche Dateien du nicht gelesen hast.`
  ].join('\n')
}
