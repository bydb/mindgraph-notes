// Rechner-Steuerung des Notiz-Agenten — Ausführungsseite.
//
// Ein ComputerState entsteht ausschließlich nach der nativen Freigabe für genau diesen Lauf.
// Wie bei der Shell gilt: der Renderer kann nur anfragen, die Einstellungen liest der Main
// aus seiner eigenen Kopie (ui-settings.json), und ohne Bestätigung bleibt run.computer leer.
//
// Der Unterschied zur Shell ist der wichtigere Teil: hier gibt es KEINE Sandbox, denn der
// Zweck ist gerade die Wirkung außerhalb. Der Schutz liegt deshalb in der Form des Zugriffs:
// das Modell wählt einen von fünf benannten Vorgängen und liefert Werte, die App baut den
// Aufruf. Es gibt keinen Weg, einen eigenen Befehl oder ein eigenes Skript unterzuschieben.
import { execFile } from 'child_process'
import { randomBytes } from 'crypto'
import { promises as fs, constants as fsConstants } from 'fs'
import * as path from 'path'
import type { AgentRun } from './runRegistry'
import { stagingDirFor } from './staging'
import {
  activeComputerVerbs, isOpenable, isPrintable, isValidEmailAddress, resolveAllowedApp,
  type ComputerApp, type ComputerControlSettings, type ComputerVerb
} from '../../shared/computerControl'

const MAX_ACTIONS_PER_RUN = 10
const ACTION_TIMEOUT_MS = 20_000
const MAX_SUBJECT_CHARS = 300
const MAX_BODY_CHARS = 20_000
const MAX_RECIPIENTS = 20
const MAX_ATTACHMENTS = 5
const SCRIPT_FILENAME = 'mail-draft.applescript'

type ProcessStarter = typeof execFile
let processStarter: ProcessStarter = execFile

/**
 * Nur für Tests: den Prozessstarter durch einen Aufzeichner ersetzen.
 *
 * Die erste Fassung lehnte unter `VITEST`/`NODE_ENV=test` pauschal jeden Aufruf ab — ein
 * Test hatte real drei Druckaufträge abgeschickt. Die Sperre verdeckte damit aber genau
 * die Grenze, die sie schützen sollte: Argumentreihenfolge, Binärpfad, Exitcode und
 * Zeitüberschreitung blieben ungeprüft (Codex Runde 2, F14). Und `NODE_ENV=test` hätte in
 * einem gebauten Programm die Rechner-Steuerung stillgelegt.
 *
 * Jetzt gilt: unter vitest läuft NICHTS, solange kein Fake gesetzt ist — und mit Fake
 * lassen sich die Aufrufe prüfen, ohne dass etwas den Rechner verlässt.
 */
export function setComputerProcessStarterForTests(fn: ProcessStarter | null): void {
  processStarter = fn ?? execFile
}

export interface ComputerState {
  settings: ComputerControlSettings
  verbs: ComputerVerb[]
  actions: number
  /**
   * Liegt im Run-Staging, aber NICHT im Arbeitsordner der Shell (.../shell-work) — eine
   * gleichzeitig freigegebene Shell kann das Skript also nicht überschreiben. Gleicher
   * Gedanke wie beim Sandbox-Profil: was den Aufruf bestimmt, darf der Lauf nicht ändern.
   */
  mailScriptPath: string
  /** Kopien der Lauf-Ergebnisse, die an Programme übergeben wurden (Anhänge, Öffnen, Drucken). */
  outboxDir: string
  /**
   * Signaturen bereits GESTARTETER Vorgänge (F03). Ein Vorgang mit Wirkung außerhalb der App
   * ist nicht rücknehmbar und sein Ausgang nicht immer feststellbar: `open`, `lp` und
   * übergeben an LaunchServices, CUPS bzw. Mail und kehren zurück,
   * bevor dort etwas fertig ist. Läuft der Aufruf in die Zeitüberschreitung oder in einen
   * Abbruch, heißt das NICHT „nichts passiert" — es heißt „Ausgang unbekannt". Eine Wiederholung
   * wäre dann ein zweiter Druckauftrag oder ein zweiter Entwurf. Deshalb
   * wird die Signatur VOR dem Aufruf eingetragen und eine Wiederholung abgelehnt.
   */
  attempted: Set<string>
}

/**
 * Das feste Skript. Alle Werte kommen als argv — nichts davon wird in den Skripttext
 * eingesetzt, es gibt also keine Stelle, an der ein Anführungszeichen etwas anderes bedeuten
 * könnte. Der Entwurf geht sichtbar auf und wird NIE gesendet: `send` kommt hier nicht vor.
 * argv: 1 = Betreff, 2 = Text, 3 = Empfänger (je Zeile einer, leer = keine), 4.. = Anhänge.
 */
const MAIL_DRAFT_SCRIPT = `on run argv
	set theSubject to item 1 of argv
	set theBody to item 2 of argv
	set theRecipients to item 3 of argv
	set recipientList to {}
	if theRecipients is not "" then
		set savedDelimiters to AppleScript's text item delimiters
		set AppleScript's text item delimiters to linefeed
		set recipientList to text items of theRecipients
		set AppleScript's text item delimiters to savedDelimiters
	end if
	tell application "Mail"
		set newMessage to make new outgoing message with properties {subject:theSubject, content:theBody, visible:true}
		tell newMessage
			repeat with anAddress in recipientList
				make new to recipient at end of to recipients with properties {address:(anAddress as text)}
			end repeat
			if (count of argv) > 3 then
				repeat with i from 4 to (count of argv)
					make new attachment with properties {file name:(POSIX file (item i of argv))} at after the last paragraph of content
				end repeat
			end if
		end tell
		activate
	end tell
	return "ok"
end run
`

// Welches Systemwerkzeug ein Vorgang braucht. Vor der Freigabe wird geprüft, dass es da und
// ausführbar ist (F06) — sonst stünde im Dialog ein Vorgang, der später nur Budget verbrennt.
// NICHT vorab prüfbar sind die Einwilligung des Systems (TCC) und ein eingerichteter Drucker;
// das sagt die App dem Nutzer, statt es zu behaupten.
const VERB_BINARY: Record<ComputerVerb, string> = {
  open: '/usr/bin/open',
  reveal: '/usr/bin/open',
  print: '/usr/bin/lp',
  mail_draft: '/usr/bin/osascript'
}

export async function usableComputerVerbs(settings: ComputerControlSettings): Promise<{ usable: ComputerVerb[]; missing: ComputerVerb[] }> {
  return usableVerbs(activeComputerVerbs(settings))
}

/**
 * Gibt es ein konfiguriertes Standard-Druckziel? (Codex Runde 2, F17)
 *
 * „Verschiebt nur den Zeitpunkt der Enttäuschung" war als Ablehnung zu bequem: Ob Papier
 * herauskommt, lässt sich nicht vorhersagen — ob überhaupt ein Ziel eingerichtet ist, sehr
 * wohl. Fehlt es, ist der Fehlschlag schon vor der Freigabe sicher. Antwortet `lpstat`
 * nicht, wird NICHT ausgeschlossen: eine ungewisse Auskunft darf keinen Vorgang wegnehmen.
 */
async function hasDefaultPrinter(): Promise<boolean> {
  try {
    return await new Promise<boolean>(resolve => {
      execFile('/usr/bin/lpstat', ['-d'], { timeout: 4_000 }, (error, stdout) => {
        if (error) return resolve(true)
        const text = String(stdout)
        resolve(!/no system default destination|kein .*standard/i.test(text) && /:/.test(text))
      })
    })
  } catch {
    return true
  }
}

async function usableVerbs(verbs: ComputerVerb[]): Promise<{ usable: ComputerVerb[]; missing: ComputerVerb[] }> {
  const usable: ComputerVerb[] = []
  const missing: ComputerVerb[] = []
  for (const verb of verbs) {
    try {
      await fs.access(VERB_BINARY[verb], fsConstants.X_OK)
      if (verb === 'print' && !(await hasDefaultPrinter())) {
        missing.push(verb)
        continue
      }
      usable.push(verb)
    } catch {
      missing.push(verb)
    }
  }
  return { usable, missing }
}

export function computerControlAvailability(): { ok: true } | { ok: false; reason: string } {
  if (process.platform !== 'darwin') {
    return { ok: false, reason: 'Die Rechner-Steuerung gibt es derzeit nur auf macOS. Auf diesem System startet sie nicht — einen Ersatzweg ohne die Skriptschnittstellen des Systems gibt es nicht.' }
  }
  return { ok: true }
}

function assertActive(run: AgentRun): void {
  if (run.abort.signal.aborted || run.status !== 'running') throw new Error('Abgebrochen')
}

/**
 * Ohne echte Bestätigung bleibt run.computer leer. Zusätzlich muss mindestens ein Vorgang
 * wirklich nutzbar sein — sonst bekäme das Modell Werkzeuge, die bei jedem Aufruf ablehnen.
 */
export async function authorizeComputer(
  run: AgentRun,
  confirm: () => Promise<boolean>,
  settings: ComputerControlSettings
): Promise<{ verbs: ComputerVerb[]; missing: ComputerVerb[] }> {
  assertActive(run)
  if (run.web) throw new Error('Rechner-Steuerung und Webrecherche-Modus sind getrennte Laufarten.')
  const avail = computerControlAvailability()
  if (!avail.ok) throw new Error(avail.reason)
  const requested = activeComputerVerbs(settings)
  if (requested.length === 0) {
    throw new Error('Für die Rechner-Steuerung ist kein Vorgang freigegeben (Einstellungen → KI → Rechner-Steuerung).')
  }
  // Vor dem Dialog, nicht danach: der Nutzer soll nicht etwas erlauben, das gar nicht geht.
  const { usable: verbs, missing } = await usableVerbs(requested)
  if (verbs.length === 0) {
    throw new Error('Kein freigegebener Vorgang ist auf diesem System ausführbar — die nötigen Systemwerkzeuge fehlen.')
  }
  if (!await confirm()) throw new Error('Die Rechner-Steuerung wurde nicht erlaubt. Der Lauf wurde nicht ausgeführt.')
  assertActive(run)
  const runDir = stagingDirFor(run)
  await fs.mkdir(runDir, { recursive: true })
  const outboxDir = path.join(runDir, 'outbox')
  await fs.mkdir(outboxDir, { recursive: true })
  const mailScriptPath = path.join(runDir, SCRIPT_FILENAME)
  await fs.writeFile(mailScriptPath, MAIL_DRAFT_SCRIPT, { mode: 0o600 })
  assertActive(run)
  run.computer = { settings, verbs, actions: 0, mailScriptPath, outboxDir, attempted: new Set() }
  if (missing.length) {
    // Ehrlich melden statt still weglassen: sonst sucht der Nutzer den Fehler beim Modell.
    console.warn('[computer] Nicht ausführbar auf diesem System, deshalb weggelassen:', missing.join(', '))
  }
  return { verbs, missing }
}

export function requireComputer(run: AgentRun): ComputerState {
  assertActive(run)
  if (!run.computer || run.web) throw new Error('Die Rechner-Steuerung ist für diesen Lauf nicht freigegeben.')
  return run.computer
}

function requireVerb(run: AgentRun, verb: ComputerVerb): ComputerState {
  const state = requireComputer(run)
  if (!state.verbs.includes(verb)) {
    throw new Error(`Der Vorgang „${verb}" ist nicht freigegeben (Einstellungen → KI → Rechner-Steuerung).`)
  }
  if (state.actions >= MAX_ACTIONS_PER_RUN) {
    throw new Error(`Budget erreicht: höchstens ${MAX_ACTIONS_PER_RUN} Vorgänge am Rechner pro Lauf.`)
  }
  state.actions += 1
  return state
}

/**
 * Trägt einen Vorgang als GESTARTET ein, bevor er läuft (F03). Eine Wiederholung derselben
 * Wirkung wird danach abgelehnt — auch und gerade nach einer Zeitüberschreitung, denn die
 * beweist nicht, dass nichts passiert ist. Lieber ein fehlender zweiter Versuch als ein
 * zweiter Druckauftrag, den niemand bestellt hat.
 */
/**
 * Kanonische Form einer Signatur (Codex Runde 2, F11). Ohne sie beschreiben zwei
 * Schreibweisen dieselbe Wirkung als zwei Vorgaenge: zwei Empfaengerlisten in anderer
 * Reihenfolge passierten die Sperre erneut. Kleinschreibung, sortierte Mehrfachwerte,
 * kein Leerraum.
 */
function signature(verb: string, parts: Array<string | string[]>): string {
  const flat = parts.map(part =>
    (Array.isArray(part) ? [...part].map(x => x.trim().toLowerCase()).sort().join(',') : String(part).trim().toLowerCase())
  )
  return [verb, ...flat].join('|')
}

function markAttempt(state: ComputerState, signature: string): void {
  if (state.attempted.has(signature)) {
    throw new Error('Dieser Vorgang wurde in diesem Lauf bereits gestartet. Er wird nicht wiederholt — auch dann nicht, wenn der erste Versuch keine klare Rückmeldung hatte. Prüfe das Ergebnis am Bildschirm.')
  }
  state.attempted.add(signature)
}

export type TargetMode = 'direct' | 'snapshot'

/**
 * Kopiert eine Quelle in die Outbox - objektgebunden und kollisionsfrei.
 *
 * Zwei Befunde aus Codex Runde 2 stecken hier drin:
 * - F12: `copyFile(pfad, ziel)` loest den Quellnamen ERNEUT auf. Zwischen Pruefung und
 *   Kopie konnte ein Symlink untergeschoben werden, und der Schnappschuss haette dann
 *   genau die Datei enthalten, die die Pruefung ausschliessen sollte. Jetzt wird die
 *   Quelle einmal geoeffnet und aus DIESEM Deskriptor gelesen; der Name spielt danach
 *   keine Rolle mehr.
 * - F13: Alle Schnappschuesse lagen unter `outbox/<basename>`. Zwei erlaubte Anhaenge
 *   `Kunde-A/Bericht.pdf` und `Kunde-B/Bericht.pdf` ergaben denselben Zielpfad, und beide
 *   argv-Eintraege zeigten auf die zuletzt kopierte Datei - ein falscher Mail-Anhang ohne
 *   Angreifer und ohne Wettlauf. Jeder Schnappschuss bekommt jetzt einen eigenen Ordner.
 */
async function snapshotInto(state: ComputerState, sourcePath: string, fileName: string): Promise<string> {
  const handle = await fs.open(sourcePath, 'r')
  try {
    const stat = await handle.stat()
    if (!stat.isFile()) throw new Error('Das Ziel ist keine Datei.')
    const data = await handle.readFile()
    const dir = path.join(state.outboxDir, randomBytes(8).toString('hex'))
    await fs.mkdir(dir, { recursive: true })
    const target = path.join(dir, fileName)
    // `wx`: der Zielname ist neu, es wird nie etwas ueberschrieben.
    await fs.writeFile(target, data, { flag: 'wx' })
    return target
  } finally {
    await handle.close()
  }
}

/**
 * Was der Agent einem Programm übergeben darf. Genau zwei Quellen, beide dieses Laufs:
 * ein Ergebnis, das er selbst erzeugt hat (über den Dateinamen, den er zurückbekommen hat),
 * oder eine Datei, die im Vault liegt. Alles andere — Benutzerordner, andere Laufwerke,
 * die internen .mindgraph-Daten (E-Mails, Kontakte, Sync) — ist kein gültiges Ziel.
 *
 * `mode` entscheidet über die Form der Übergabe:
 * - `snapshot` (Drucken, Mail-Anhang): es wird eine Kopie in den Outbox-Ordner übergeben,
 *   gelesen über einen offenen Deskriptor der geprüften Datei (siehe snapshotInto). Damit
 *   hängt der übergebene Inhalt am geprüften Objekt und nicht mehr an einem Namen, der sich
 *   zwischendurch ändern lässt. Richtig ist die Kopie hier ohnehin: ein Anhang soll den
 *   Stand zeigen, den der Agent gemeint hat.
 * - `direct` (Öffnen, im Finder zeigen): die echte Datei, denn genau die soll der Nutzer
 *   vor sich haben und weiterbearbeiten können. Eine Kopie wäre hier ein Datenverlust.
 *   RESTRISIKO, bewusst getragen und NICHT durch die Formatliste aufgehoben: zwischen der
 *   Prüfung und dem Öffnen kann ein anderer Prozess den Pfad durch einen Symlink ersetzen.
 *   Geprüft wird der Pfadstring, geöffnet wird das, worauf er dann zeigt — die Endung des
 *   geprüften Namens sagt über das tatsächliche Ziel nichts aus (Codex Runde 2, F12).
 *   Voraussetzung sind Schreibrechte im Vault; wer die hat, kann die Datei auch direkt
 *   austauschen. Wer das nicht tragen will, nutzt „Datei öffnen" nicht.
 *
 * Ergebnisse werden immer kopiert. Die Ergebniskarte bleibt unberührt: ein Mail-Entwurf
 * ersetzt die Übernahme in den Vault nicht, er hängt eine Kopie an.
 */
export async function resolveComputerTarget(
  run: AgentRun,
  raw: unknown,
  mode: TargetMode = 'snapshot'
): Promise<{ path: string; label: string; isCopy: boolean }> {
  const state = requireComputer(run)
  if (typeof raw !== 'string' || !raw.trim()) throw new Error('Es fehlt der Dateiname.')
  const name = raw.trim()
  if (name.includes('\0')) throw new Error('Ungültiger Dateiname.')

  const matches = [...run.results.values()].filter(r => r.suggestedName.toLowerCase() === name.toLowerCase())
  if (matches.length > 1) {
    throw new Error(`Mehrere Ergebnisse dieses Laufs heißen „${name}". Benenne sie beim Schreiben unterschiedlich.`)
  }

  // Vault-Kandidat immer mit auflösen, auch wenn es einen Ergebnistreffer gibt (F07): eine
  // stille Vorrangregel würde bei Namensgleichheit die falsche Datei drucken oder anhängen.
  const vaultReal = await fs.realpath(run.vaultPath)
  let vaultCandidate: string | null = null
  if (!path.isAbsolute(name)) {
    try {
      const real = await fs.realpath(path.join(vaultReal, name))
      const stat = await fs.stat(real)
      if (stat.isFile() && real.startsWith(vaultReal + path.sep)) {
        const relative = path.relative(vaultReal, real)
        if (!relative.split(path.sep).includes('.mindgraph')) vaultCandidate = real
      }
    } catch {
      vaultCandidate = null
    }
  }

  if (matches.length === 1 && vaultCandidate) {
    throw new Error(`„${name}" ist mehrdeutig: es gibt ein Ergebnis dieses Laufs UND eine Datei im Vault mit diesem Namen. Benenne das Ergebnis anders oder gib den Vault-Pfad mit Ordner an.`)
  }

  if (matches.length === 1) {
    const result = matches[0]
    const target = await snapshotInto(state, result.stagingPath, result.suggestedName)
    // Immer eine Kopie: das Ergebnis selbst liegt im Staging und wird erst bei der
    // Übernahme in den Zielordner geschrieben. Wer die Kopie bearbeitet, verliert die
    // Änderungen — das muss in jeder Rückmeldung stehen (Codex F04).
    return { path: target, label: `Ergebnis „${result.suggestedName}"`, isCopy: true }
  }

  if (path.isAbsolute(name)) {
    throw new Error('Gib den Namen eines Ergebnisses aus diesem Lauf an oder einen Pfad relativ zum Vault — keine absoluten Pfade.')
  }
  if (!vaultCandidate) {
    // Bewusst ohne Angabe, WORAN es lag (nicht vorhanden / außerhalb / .mindgraph / Ordner):
    // sonst wird die Fehlermeldung zum Werkzeug, mit dem das Modell den Vault abtastet.
    throw new Error(`Nicht verwendbar: „${name}". Erwartet wird der Dateiname eines Ergebnisses aus diesem Lauf oder der Pfad einer Datei im Vault.`)
  }
  const relative = path.relative(vaultReal, vaultCandidate)
  if (mode === 'direct') return { path: vaultCandidate, label: relative, isCopy: false }
  const target = await snapshotInto(state, vaultCandidate, path.basename(vaultCandidate))
  return { path: target, label: relative, isCopy: true }
}

/**
 * Ein Systembefehl mit Argumentliste — nie über eine Shell, nie mit zusammengebautem Text.
 * Zeitüberschreitung und Abbruch werden als „Ausgang unbekannt" gemeldet, nicht als
 * Fehlschlag (F03): der aufgerufene Prozess ist beendet, die Wirkung beim Zielprogramm
 * möglicherweise nicht.
 */
function runTool(run: AgentRun, file: string, args: string[], timeoutMs = ACTION_TIMEOUT_MS): Promise<string> {
  // Sicherheitsnetz gegen den eigenen Testlauf. Am 20.09.2026 hat ein Test dieser Datei real
  // drei Druckaufträge an den Drucker des Entwicklers geschickt. Unter vitest startet
  // deshalb kein echter Prozess — wer die Aufrufe prüfen will, setzt einen Fake über
  // setComputerProcessStarterForTests. Nur `VITEST`, nicht `NODE_ENV`: sonst legte eine mit
  // NODE_ENV=test gestartete gebaute App die Rechner-Steuerung still.
  if (process.env.VITEST && processStarter === execFile) {
    return Promise.reject(new Error('Vorgänge am Rechner werden im Testlauf nicht ausgeführt.'))
  }
  // Fail-closed unmittelbar vor dem Start (Codex Runde 2, F16): zwischen der Pruefung in
  // requireVerb und hier liegen mehrere Dateisystemschritte. Wurde in dieser Zeit
  // abgebrochen, darf der Vorgang gar nicht erst anlaufen - ein einmal an LaunchServices,
  // CUPS oder Mail uebergebener Auftrag laesst sich nicht zurueckholen.
  assertActive(run)
  return new Promise((resolve, reject) => {
    const child = processStarter(file, args, { timeout: timeoutMs, maxBuffer: 256 * 1024 }, (error, stdout, stderr) => {
      run.abort.signal.removeEventListener('abort', stop)
      if (run.abort.signal.aborted) {
        return reject(new Error('Abgebrochen. Ein bereits übergebener Vorgang läuft im Zielprogramm möglicherweise weiter — die App kann ihn dort nicht zurücknehmen.'))
      }
      if (error) {
        const timedOut = (error as NodeJS.ErrnoException & { killed?: boolean }).killed === true
        if (timedOut) {
          return reject(new Error('Zeitüberschreitung. Ob das Zielprogramm den Vorgang trotzdem übernommen hat, lässt sich nicht feststellen — nicht wiederholen, sondern am Bildschirm nachsehen.'))
        }
        const detail = String(stderr || error.message).trim().slice(0, 300)
        return reject(new Error(detail || 'Der Vorgang ist fehlgeschlagen.'))
      }
      resolve(String(stdout).trim())
    })
    function stop(): void { child.kill('SIGKILL') }
    run.abort.signal.addEventListener('abort', stop, { once: true })
    if (run.abort.signal.aborted) stop()
  })
}

export async function openWithApp(run: AgentRun, fileName: unknown, appName: unknown): Promise<string> {
  const state = requireVerb(run, 'open')
  const target = await resolveComputerTarget(run, fileName, 'direct')
  // F01: nur passive Formate. Was hier nicht steht, wird nicht geöffnet — unabhängig davon,
  // ob es aus dem Vault kommt oder der Agent es selbst geschrieben hat.
  if (!isOpenable(target.path)) {
    throw new Error('Dieses Dateiformat wird nicht geöffnet. Die Liste lässt nur Formate durch, die kein eigenes Programm mitbringen — PDF, Text, Markdown, RTF, die neuen Office-Formate und Bilder. HTML-Seiten, ausführbare Dateien, CSV und die alten makrofähigen Office-Formate bewusst nicht. Eine HTML-Seite sieht der Nutzer über die eingebaute Vorschau der App.')
  }
  const args: string[] = []
  let app: ComputerApp | null = null
  if (appName !== undefined && appName !== null && String(appName).trim() !== '') {
    // F05: die Freigabeliste steht im System-Prompt, nicht in dieser Fehlermeldung. Sonst wäre
    // ein absichtlich falscher Name das Mittel, sich die ganze Liste ausgeben zu lassen.
    app = resolveAllowedApp(state.settings.apps, appName)
    if (!app) {
      throw new Error(`Das Programm „${String(appName).trim()}" ist für diesen Lauf nicht freigegeben. Nutze eines der im Auftrag genannten Programme oder lass die Angabe weg — dann entscheidet das System.`)
    }
    // `-a` mit dem PFAD des ausgewählten Bundles (Codex Runde 2, F15). Ein Name scheidet
    // aus, weil `open -a` lokalisierte Namen nicht kennt; die Bundle-Kennung scheidet aus,
    // weil sie aus der Selbstauskunft des Bundles stammt und LaunchServices damit irgendeine
    // App auflösen kann. Der Pfad ist das, was der Nutzer im Dialog bestätigt hat.
    args.push('-a', app.path)
  }
  // `label`, nicht `path`: seit jeder Schnappschuss einen eigenen Zufallsordner bekommt
  // (Codex Runde 2, F13), waere der Pfad bei jedem Aufruf neu und die Wiederholungssperre
  // liefe ins Leere. `label` bezeichnet die gemeinte Datei, nicht die Kopie davon.
  // Das Programm gehoert ebenfalls nicht hinein: dieselbe Datei wird einmal je Lauf
  // geoeffnet, mit oder ohne Programmangabe.
  markAttempt(state, signature('open', [target.label]))
  args.push(target.path)
  await runTool(run, '/usr/bin/open', args)
  const how = app ? ` mit ${app.label}` : ' (Standardprogramm)'
  return target.isCopy
    ? `${target.label} als Kopie zur Ansicht geöffnet${how}. Änderungen an dieser Kopie landen NICHT in der Datei, die der Nutzer übernimmt — dafür muss er das Ergebnis erst übernehmen und die übernommene Datei öffnen.`
    : `${target.label} im Original geöffnet${how}. Änderungen daran wirken direkt im Vault.`
}

export async function revealInFinder(run: AgentRun, fileName: unknown): Promise<string> {
  const state = requireVerb(run, 'reveal')
  const target = await resolveComputerTarget(run, fileName, 'direct')
  markAttempt(state, signature('reveal', [target.label]))
  await runTool(run, '/usr/bin/open', ['-R', target.path])
  return target.isCopy
    ? `${target.label} im Finder gezeigt — die Kopie im Arbeitsordner, nicht die spätere Datei im Zielordner.`
    : `${target.label} im Finder gezeigt.`
}

export async function printFile(run: AgentRun, fileName: unknown): Promise<string> {
  const state = requireVerb(run, 'print')
  const target = await resolveComputerTarget(run, fileName, 'snapshot')
  if (!isPrintable(target.path)) {
    throw new Error('Gedruckt werden nur PDF, Text, Markdown und Bilder. Wandle die Datei vorher nach PDF um oder öffne sie und drucke aus dem Programm.')
  }
  markAttempt(state, signature('print', [target.label]))
  const out = await runTool(run, '/usr/bin/lp', [target.path])
  return `${target.label} an den Standarddrucker geschickt.${out ? ` ${out}` : ''} Ob wirklich Papier herauskommt, hängt am eingerichteten Drucker — das kann die App nicht feststellen.`
}


/**
 * Betreff und Text auf die Grenzen bringen UND melden, wenn dabei gekürzt wurde.
 *
 * Stilles Abschneiden wäre eine unsichtbare Inhaltsänderung an einer Handlung, die nach
 * draussen wirkt (Codex F10): Der Nutzer sähe einen fertig aussehenden Entwurf und würde
 * nicht merken, dass der letzte Absatz fehlt. Rein und getestet, weil der Weg über das
 * Werkzeug selbst im Testlauf gesperrt ist.
 */
export function prepareMailText(rawSubjectInput: unknown, rawBodyInput: unknown): { subject: string; body: string; trimmed: string[] } {
  const rawSubject = String(rawSubjectInput ?? '').replace(/[\r\n]+/g, ' ').trim()
  const rawBody = String(rawBodyInput ?? '')
  const trimmed: string[] = []
  if (rawSubject.length > MAX_SUBJECT_CHARS) trimmed.push(`Betreff auf ${MAX_SUBJECT_CHARS} Zeichen`)
  if (rawBody.length > MAX_BODY_CHARS) trimmed.push(`Text auf ${MAX_BODY_CHARS} Zeichen`)
  return { subject: rawSubject.slice(0, MAX_SUBJECT_CHARS), body: rawBody.slice(0, MAX_BODY_CHARS), trimmed }
}

export interface MailDraftInput {
  to?: unknown
  subject?: unknown
  body?: unknown
  attach?: unknown
}

/**
 * Baut die argv-Liste für das feste Skript. Rein und getestet: hier entscheidet sich, ob
 * eine Adresse aus einem Anhang je als zweiter Empfänger auftauchen kann (sie kann nicht —
 * jede Adresse wird einzeln geprüft, und Zeilenumbrüche sind in Adressen ausgeschlossen).
 */
export function buildMailDraftArgs(input: { to: string[]; subject: string; body: string; attachments: string[] }): string[] {
  return [input.subject, input.body, input.to.join('\n'), ...input.attachments]
}

export async function createMailDraft(run: AgentRun, input: MailDraftInput): Promise<string> {
  const state = requireVerb(run, 'mail_draft')

  const rawTo = Array.isArray(input.to) ? input.to : (input.to === undefined || input.to === null ? [] : [input.to])
  if (rawTo.length > MAX_RECIPIENTS) throw new Error(`Höchstens ${MAX_RECIPIENTS} Empfänger.`)
  const to: string[] = []
  for (const address of rawTo) {
    if (!isValidEmailAddress(address)) throw new Error(`Keine gültige E-Mail-Adresse: „${String(address).slice(0, 80)}". Gib Adressen einzeln in einer Liste an, nicht durch Komma getrennt.`)
    to.push(String(address).trim())
  }

  const { subject, body, trimmed } = prepareMailText(input.subject, input.body)
  if (!subject && !body) throw new Error('Ein Entwurf braucht mindestens einen Betreff oder einen Text.')

  const rawAttach = Array.isArray(input.attach) ? input.attach : (input.attach === undefined || input.attach === null ? [] : [input.attach])
  if (rawAttach.length > MAX_ATTACHMENTS) throw new Error(`Höchstens ${MAX_ATTACHMENTS} Anhänge.`)
  const attachments: string[] = []
  const labels: string[] = []
  for (const item of rawAttach) {
    const target = await resolveComputerTarget(run, item, 'snapshot')
    attachments.push(target.path)
    labels.push(target.label)
  }

  // Anhaenge gehoeren in die Signatur: derselbe Betreff an dieselben Empfaenger, aber mit
  // anderer Anlage, ist ein anderer Entwurf. Vertauschte Empfaenger sind derselbe.
  markAttempt(state, signature('mail', [to, subject, labels]))
  await runTool(run, '/usr/bin/osascript', [state.mailScriptPath, ...buildMailDraftArgs({ to, subject, body, attachments })])
  const recipients = to.length ? to.join(', ') : 'ohne Empfänger'
  const cut = trimmed.length ? ` ACHTUNG: gekürzt — ${trimmed.join(' und ')}. Sage das dem Nutzer, er muss den Entwurf vor dem Senden ergänzen.` : ''
  return `Mail-Entwurf in Apple Mail geöffnet an ${recipients}${labels.length ? ` mit ${labels.length} Anhang/Anhängen (${labels.join(', ')})` : ''}. Der Entwurf wurde NICHT gesendet — der Nutzer prüft und sendet selbst.${cut}`
}
