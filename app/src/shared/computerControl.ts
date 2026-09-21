// Rechner-Steuerung des Notiz-Agenten: der Agent darf nach Freigabe andere Programme
// über die Skriptschnittstellen des Betriebssystems ansprechen (macOS).
//
// Die tragende Entscheidung steht hier, nicht im Prompt: DAS MODELL SCHREIBT KEIN SKRIPT.
// Es wählt einen benannten Vorgang aus dieser Liste und liefert Werte. Den Aufruf baut
// die App. Vier der fünf Vorgänge sind gar kein AppleScript, sondern Systembefehle mit
// Argumenten (`open`, `lp`); der vierte (Mail-Entwurf) ist ein FESTES Skript,
// dessen Werte als `argv` übergeben und nie in den Skripttext eingesetzt werden.
//
// Der Grund ist derselbe wie bei der Agent-Shell: eine Sperrliste gefährlicher Befehle
// ist kein Schutz. Freies AppleScript wäre Vollzugriff auf den Rechner — `do shell script`
// steht in jedem AppleScript zur Verfügung und keine Prüfung des Skripttextes hält das auf.
//
// Was hier bewusst NICHT vorkommt und auch nicht nachgerüstet wird:
// - Mail SENDEN. Es gibt nur den Entwurf, der sichtbar aufgeht. Der Mensch drückt ab.
// - Ein Vorgang "beliebiges Skript ausführen".
// - Kurzbefehle. Es gab sie einmal (bis 21.09.2026) als Erweiterungspunkt für alles, was
//   diese Liste nicht abdeckt. Entfernt auf Entscheidung des Nutzers: Ein Kurzbefehl war der
//   EINZIGE Vorgang, über den Daten hereinkommen, und die einzige Stelle, an der die Zusage
//   "nichts verlässt den Rechner" aushebelbar war (ein Kurzbefehl darf ins Netz). Der Nutzen
//   rechtfertigte dieses Risiko nur für jemanden, der genau weiss, was in seinen Kurzbefehlen
//   steht. Übrig bleibt, was ohne Erklärung trägt. Begründung: docs/rechner-bedienen-plan.md.

export type ComputerVerb = 'open' | 'reveal' | 'mail_draft' | 'print'

export const COMPUTER_VERBS: ComputerVerb[] = ['open', 'reveal', 'mail_draft', 'print']

/**
 * Ein freigegebenes Programm. `id` ist die Bundle-Kennung (com.apple.Preview), `label` der
 * Name, den der Nutzer sieht und das Modell nennt.
 *
 * Warum beides und warum nicht einfach der Name: `open -a` kennt **keine lokalisierten
 * Namen**. Im Programme-Ordner steht „Vorschau", aufrufbar ist die App nur als „Preview" —
 * `open -a Vorschau` scheitert mit „Unable to find application named", und AppleScript
 * (`id of app "Vorschau"`) ebenso. Es gibt keinen unterstützten Weg vom Anzeigenamen zur
 * App; Spotlight liefert ihn auch nicht. Ein getippter Name ist deshalb eine Falle, die erst
 * mitten im Lauf zuschnappt (real aufgetreten bei der Gegenprobe, 20.09.2026). Der Nutzer
 * wählt das Programm jetzt aus, gespeichert wird die eindeutige Bundle-Kennung.
 */
export interface ComputerApp {
  id: string
  label: string
  /**
   * Der kanonische Pfad des Bundles, das der Nutzer im Dialog ausgewählt hat.
   *
   * Entscheidend für die Bindung (Codex Runde 2, F15): Gespeichert war zuerst nur die
   * Bundle-Kennung, und `open -b` lässt LaunchServices irgendeine App mit dieser Kennung
   * auflösen. Die Kennung stammt aber aus der `Info.plist` des gewählten Bundles — also aus
   * einer Selbstauskunft, die ein präpariertes `.app`-Verzeichnis beliebig setzen kann.
   * Damit war die spätere Wirkung nicht mehr an das Objekt gebunden, das der Nutzer
   * ausgesucht hat. Geöffnet wird deshalb mit `open -a <Pfad>`.
   */
  path: string
}

export interface ComputerControlSettings {
  /** Welche Vorgänge der Agent überhaupt anbieten darf. */
  verbs: Record<ComputerVerb, boolean>
  /**
   * Programme, die der Agent zum Öffnen verwenden darf. Leer = nur das Standardprogramm
   * des Dateityps. Der Agent kann die Liste nicht erweitern.
   */
  apps: ComputerApp[]
}

// Drucken ist voreingestellt AUS: es ist der einzige Vorgang, der ohne weiteren Blick des
// Nutzers Papier verbraucht. Alle anderen öffnen nur ein Fenster, das sichtbar ist.
export const DEFAULT_COMPUTER_CONTROL: ComputerControlSettings = {
  verbs: { open: true, reveal: true, mail_draft: true, print: false },
  apps: []
}

// Namen aus den Einstellungen sind Nutzereingaben, keine Modellausgaben — trotzdem eng
// geprüft, damit ein versehentlich eingefügter Zeilenumbruch oder Anführungsstrich nicht
// später als zweites Argument auftaucht. Buchstaben (inkl. Umlauten), Ziffern und die
// Zeichen, die in echten Programmnamen vorkommen.
const NAME_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} .,_&+()'’\-]{0,63}$/u

export function isValidComputerName(raw: unknown): boolean {
  return typeof raw === 'string' && NAME_PATTERN.test(raw.trim())
}

// Bundle-Kennung, wie LaunchServices sie vergibt. Eng gefasst: was hier durchkommt, wird
// später als Argument an `open -b` gereicht.
const BUNDLE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9.\-]{0,127}$/

export function isValidBundleId(raw: unknown): boolean {
  return typeof raw === 'string' && BUNDLE_ID_PATTERN.test(raw.trim())
}

const MAX_LIST = 25

/** Ein Programmpfad, wie der Auswahldialog ihn liefert: absolut und auf ein .app-Bundle. */
export function isValidAppPath(raw: unknown): boolean {
  return typeof raw === 'string'
    && raw.startsWith('/')
    && raw.toLowerCase().endsWith('.app')
    && !raw.includes('\0')
    && raw.length <= 1024
}

function normalizeAppList(raw: unknown): ComputerApp[] {
  if (!Array.isArray(raw)) return []
  const out: ComputerApp[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const { id, label, path: appPath } = item as Record<string, unknown>
    // Ohne bestätigten Pfad keine Freigabe: ein Eintrag aus einer älteren Fassung (nur
    // Kennung) fällt fail-closed heraus und muss neu ausgewählt werden.
    if (!isValidBundleId(id) || !isValidComputerName(label) || !isValidAppPath(appPath)) continue
    const app = { id: (id as string).trim(), label: (label as string).trim(), path: (appPath as string).trim() }
    if (out.some(a => a.path === app.path || a.label.toLowerCase() === app.label.toLowerCase())) continue
    out.push(app)
    if (out.length >= MAX_LIST) break
  }
  return out
}


/** Aus gespeicherten Einstellungen (unbekannte Form) — alles Unklare fällt auf den Standard. */
export function normalizeComputerControl(raw: unknown): ComputerControlSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const v = (r.verbs && typeof r.verbs === 'object' ? r.verbs : {}) as Record<string, unknown>
  const verbs = {} as Record<ComputerVerb, boolean>
  for (const verb of COMPUTER_VERBS) {
    verbs[verb] = typeof v[verb] === 'boolean' ? (v[verb] as boolean) : DEFAULT_COMPUTER_CONTROL.verbs[verb]
  }
  return { verbs, apps: normalizeAppList(r.apps) }
}

/** Welche Vorgänge eingeschaltet sind. Ob dieser Rechner sie kann, prüft der Main. */
export function activeComputerVerbs(s: ComputerControlSettings): ComputerVerb[] {
  return COMPUTER_VERBS.filter(verb => s.verbs[verb])
}

const VERB_LABELS: Record<ComputerVerb, { de: string; en: string }> = {
  open: { de: 'Datei öffnen', en: 'open file' },
  reveal: { de: 'im Finder zeigen', en: 'reveal in Finder' },
  mail_draft: { de: 'Mail-Entwurf', en: 'mail draft' },
  print: { de: 'drucken', en: 'print' }
}

export function computerVerbLabel(verb: ComputerVerb, lang: 'de' | 'en' = 'de'): string {
  return VERB_LABELS[verb][lang]
}

/** Werkzeugname je Vorgang. Hier, nicht im Main: das Lauf-Protokoll im Renderer braucht ihn auch. */
export const COMPUTER_TOOL_BY_VERB: Record<ComputerVerb, string> = {
  open: 'computer_open',
  reveal: 'computer_reveal',
  mail_draft: 'computer_mail_draft',
  print: 'computer_print'
}

const VERB_BY_TOOL: Record<string, ComputerVerb> = Object.fromEntries(
  (Object.entries(COMPUTER_TOOL_BY_VERB) as Array<[ComputerVerb, string]>).map(([verb, tool]) => [tool, verb])
)

/**
 * Lesbare Bezeichnung für das Lauf-Protokoll. Ohne sie stehen dort die internen
 * Werkzeugnamen (`computer_mail_draft`), und der Nutzer soll nach dem Lauf erkennen
 * können, was wirklich passiert ist — nicht Implementierungsnamen entziffern.
 */
export function computerStepLabel(skill: string, lang: 'de' | 'en' = 'de'): string | null {
  if (skill === 'computer_access') return lang === 'en' ? 'computer control approved' : 'Rechner-Steuerung freigegeben'
  const verb = VERB_BY_TOOL[skill]
  return verb ? computerVerbLabel(verb, lang) : null
}

/** Eine Zeile für Einstellungen, Freigabedialog und Laufprotokoll — überall dieselbe Formulierung. */
export function describeComputerControl(s: ComputerControlSettings, lang: 'de' | 'en' = 'de'): string {
  const active = activeComputerVerbs(s)
  if (active.length === 0) return lang === 'en' ? 'no operations enabled' : 'kein Vorgang freigegeben'
  const list = active.map(v => computerVerbLabel(v, lang)).join(', ')
  const appLabels = s.apps.map(a => a.label).join(', ')
  const apps = s.apps.length
    ? (lang === 'en' ? ` · apps: ${appLabels}` : ` · Programme: ${appLabels}`)
    : (lang === 'en' ? ' · default app only' : ' · nur Standardprogramm')
  return `${list}${apps}`
}


/**
 * Findet das freigegebene Programm zu dem Namen, den das Modell nennt. Der Name kommt aus
 * dem Auftragstext (dort steht `label`); die Bundle-Kennung wird ebenfalls akzeptiert, falls
 * ein Modell sie aus einer früheren Rückmeldung übernimmt.
 */
export function resolveAllowedApp(list: ComputerApp[], candidate: unknown): ComputerApp | null {
  if (typeof candidate !== 'string') return null
  const c = candidate.trim().toLowerCase()
  if (!c) return null
  return list.find(a => a.label.toLowerCase() === c || a.id.toLowerCase() === c) ?? null
}

// Was „Datei öffnen" übergeben darf — eine ALLOWLIST passiver Formate, keine Sperrliste (F01).
//
// Der Grund ist die Kernbehauptung selbst: „das Modell schreibt kein Skript" hält nur, solange
// nichts geöffnet wird, dessen Standardprogramm den Inhalt AUSFÜHRT. Genau das war offen:
// `.html` ist ein erlaubtes Agent-Ergebnis, und `write_html` baut den Rumpf ungeprüft aus der
// Modellausgabe — ein `<script>` darin hätte beim Öffnen im Browser laufen können, samt Netz.
// Ebenso führt macOS `.command`, `.scpt`, `.terminal`, `.workflow` und `.webloc` aus bzw. ruft
// eine Adresse auf. Eine Sperrliste dieser Endungen wäre wieder nur eine Sperrliste; deshalb
// zählt hier auf, was wirklich harmlos angezeigt wird.
//
// HTML-Ergebnisse sieht der Nutzer über die eingebaute Vorschau (mindgraph-preview://, ohne
// externe Hosts, in einer Sandbox) — dafür braucht es den Systembrowser nicht.
//
// NACHGESCHÄRFT (Codex Runde 2): Die erste Fassung enthielt `.csv`, `.doc`, `.xls` und `.ppt`
// und behauptete dazu „Formate, die ein Programm anzeigt, ohne ihren Inhalt auszuführen".
// Das war falsch: Tabellenprogramme werten CSV-Zellen als Formeln aus, und die alten binären
// Office-Formate tragen VBA-Makros. Die vier sind raus.
//
// Und die Zusage ist heruntergeschraubt, weil sie auch danach nicht absolut gilt: Ein DOCX
// kann externe Verknüpfungen nachladen, und bei einem ausdrücklich gewählten Programm
// entscheidet ohnehin dieses Programm, wie es mit der Datei umgeht. Was die Liste leistet,
// ist der Ausschluss der Formate, die von sich aus Code mitbringen — nicht mehr.
export const OPENABLE_EXTENSIONS = [
  '.pdf', '.txt', '.md', '.rtf',
  '.docx', '.xlsx', '.pptx', '.pages', '.numbers', '.key',
  '.png', '.jpg', '.jpeg', '.gif', '.heic', '.tiff', '.webp'
]

/** Endungen als Fließtext („PDF, Text, Markdown …") — aus der echten Liste, nie handgeschrieben. */
export function describeExtensions(list: string[]): string {
  return list.map(e => e.replace(/^\./, '').toUpperCase()).join(', ')
}

export function isOpenable(fileName: string): boolean {
  const lower = fileName.toLowerCase()
  return OPENABLE_EXTENSIONS.some(ext => lower.endsWith(ext))
}

// Drucken geht über CUPS (`lp`). CUPS rendert zuverlässig nur diese Formate; ein .docx
// käme als Zeichensalat oder gar nicht heraus. Ehrliche Grenze statt stiller Fehlausgabe:
// der Agent soll vorher nach PDF wandeln.
export const PRINTABLE_EXTENSIONS = ['.pdf', '.txt', '.md', '.png', '.jpg', '.jpeg']

export function isPrintable(fileName: string): boolean {
  const lower = fileName.toLowerCase()
  return PRINTABLE_EXTENSIONS.some(ext => lower.endsWith(ext))
}

// Eine E-Mail-Adresse, wie sie im Entwurf stehen darf. Bewusst streng: kein Komma, kein
// Semikolon, kein Zeilenumbruch — mehrere Empfänger kommen als Liste, nicht als ein Feld.
const ADDRESS_PATTERN = /^[^\s,;<>"'@]+@[^\s,;<>"'@]+\.[A-Za-z]{2,}$/

export function isValidEmailAddress(raw: unknown): boolean {
  return typeof raw === 'string' && raw.trim().length <= 254 && ADDRESS_PATTERN.test(raw.trim())
}
