import { useState } from 'react'
import { useUIStore } from '../../stores/uiStore'
import { Details, IconTile, TILE_GLYPH } from './SettingsUI'
import {
  COMPUTER_VERBS, DEFAULT_COMPUTER_CONTROL, activeComputerVerbs, computerVerbLabel,
  describeComputerControl, describeExtensions,
  OPENABLE_EXTENSIONS, PRINTABLE_EXTENSIONS, type ComputerApp, type ComputerVerb
} from '../../../shared/computerControl'

// Freigaben der Rechner-Steuerung. Anders als bei der Agent-Shell gibt es hier keine
// Sandbox, die etwas einfängt — der Zweck ist gerade die Wirkung außerhalb der App.
// Die Grenze ist deshalb diese Liste: was hier nicht steht, kann der Agent nicht tun.
// Der Main liest sie aus seiner eigenen Kopie der Einstellungen, nie aus dem, was der
// Renderer beim Start mitschickt.
//
// Ehrlich zur Reichweite (Codex F04/F05): Die Namen SIEHT das Modell — sie stehen im
// Auftragstext eines freigegebenen Laufs, damit es nicht raten muss. Erweitern kann es die
// Liste nicht. Und gegen einen kompromittierten Renderer ist nicht diese Seite die Grenze,
// sondern der native Freigabedialog beim Start des Laufs.

const VERB_HINTS: Record<ComputerVerb, { de: string; en: string }> = {
  open: {
    de: 'Öffnet ein Ergebnis oder eine Vault-Datei — im Standardprogramm oder in einem der unten freigegebenen Programme. Ein Ergebnis wird als KOPIE geöffnet: Änderungen darin landen nicht in der Datei, die du danach übernimmst.',
    en: 'Opens a result or a vault file — in the default app or in one of the apps approved below. A result opens as a COPY: changes to it do not reach the file you accept afterwards.'
  },
  reveal: {
    de: 'Zeigt die Datei im Finder, ohne sie zu öffnen. Der harmloseste Vorgang.',
    en: 'Reveals the file in Finder without opening it. The most harmless operation.'
  },
  mail_draft: {
    de: 'Setzt in Apple Mail einen Entwurf mit Empfängern, Betreff, Text und Anhängen auf — nur dort, ein anderes Mail-Programm wird nicht angesprochen. Der Entwurf geht sichtbar auf und wird NIE gesendet. Grenzen: höchstens 20 Empfänger und 5 Anhänge; ein längerer Text wird gekürzt und die Kürzung im Lauf gemeldet.',
    en: 'Prepares a draft in Apple Mail with recipients, subject, body and attachments — only there, no other mail app is addressed. The draft opens visibly and is NEVER sent. Limits: at most 20 recipients and 5 attachments; longer text is truncated and the truncation is reported in the run.'
  },
  print: {
    de: 'Schickt an den Standarddrucker. Ein Word-Dokument geht nicht — der Agent müsste es vorher nach PDF wandeln. Voreingestellt aus: es ist der einzige Vorgang, der ohne weiteren Blick Papier verbraucht und sich nicht zurücknehmen lässt.',
    en: 'Sends to the default printer. A Word document will not work — the agent would have to convert it to PDF first. Off by default: it is the only operation that consumes paper unseen and cannot be undone.'
  }
}


/**
 * Programme werden AUSGEWÄHLT, nicht getippt. Grund steht in shared/computerControl.ts:
 * `open -a` kennt keine lokalisierten Namen — „Vorschau" scheitert, nur „Preview" trägt,
 * und es gibt keinen unterstützten Weg vom Anzeigenamen zur App. Ein Textfeld wäre eine
 * Falle, die erst mitten im Agent-Lauf zuschnappt.
 */
/**
 * `computerVerbLabel` ist für den Fließtext geschrieben („… , im Finder zeigen, drucken").
 * Als Überschrift einer Zeile gehört der erste Buchstabe gross — sonst steht „drucken"
 * unter „Mail-Entwurf" und die Liste sieht unfertig aus. Kein `text-transform`: das trifft
 * im Deutschen auch Wörter, die klein bleiben müssen.
 */
function asHeading(label: string): string {
  return label.charAt(0).toUpperCase() + label.slice(1)
}

function AppListField({ apps, onChange }: { apps: ComputerApp[]; onChange: (apps: ComputerApp[]) => void }) {
  const en = useUIStore(s => s.language) === 'en'
  const [error, setError] = useState('')

  const pick = async () => {
    setError('')
    const res = await window.electronAPI.computerControlPickApp()
    if (!res.success) {
      if (res.error) setError(res.error)
      return
    }
    const app = res.app!
    if (apps.some(a => a.id.toLowerCase() === app.id.toLowerCase())) return
    onChange([...apps, app])
  }

  return (
    <div className="settings-row settings-row-stacked">
      <div className="settings-row-info">
        <label>{en ? 'Programs for “open file”' : 'Programme für „Datei öffnen"'}</label>
        <span className="settings-hint">
          {en
            ? 'Empty means the agent can only use the default app for the file type — enough for most work. Approved programs are named to the model during an approved run so it does not have to guess.'
            : 'Leer heißt: der Agent kann nur das Standardprogramm des Dateityps benutzen — das reicht für die meiste Arbeit. Die freigegebenen Programme nennt die App dem Modell in einem freigegebenen Lauf, damit es nicht raten muss.'}
        </span>
      </div>
      <div className="settings-chip-list">
        {apps.map(app => (
          <span className="settings-chip" key={app.id}>
            {app.label}
            <button type="button" className="settings-chip-x" aria-label={en ? `Remove ${app.label}` : `${app.label} entfernen`}
              onClick={() => onChange(apps.filter(a => a.id !== app.id))}>×</button>
          </span>
        ))}
        <button type="button" onClick={() => { void pick() }}>
          {en ? 'Add program…' : 'Programm hinzufügen…'}
        </button>
      </div>
      {error && <span className="settings-hint settings-hint-warning">{error}</span>}
    </div>
  )
}

export function ComputerControlSection() {
  const en = useUIStore(s => s.language) === 'en'
  const settings = useUIStore(s => s.agentComputer) ?? DEFAULT_COMPUTER_CONTROL
  const setAgentComputer = useUIStore(s => s.setAgentComputer)
  const supported = navigator.platform.toLowerCase().includes('mac')
  const active = activeComputerVerbs(settings)

  return (
    <section className="settings-guard-card" aria-labelledby="agent-computer-title">
      <div className="settings-guard-head">
        {/* Kachel wie bei den Dienst-Karten: ohne sie war dies die einzige Karte im KI-Tab
            ohne Symbol und fiel zwischen den anderen nicht auf. Dasselbe Zeichen wie der
            „Rechner"-Schalter an der Auftragsleiste. */}
        <IconTile bg="#b5761f">{TILE_GLYPH.monitor}</IconTile>
        <div className="settings-guard-head-body">
          <h4 id="agent-computer-title" className="settings-guard-title">
            {en ? 'Computer control' : 'Rechner-Steuerung'}
          </h4>
          <p className="settings-guard-summary">
            {en
              ? 'The agent hands a result on: open it, reveal it, attach it to a draft, print it. It never writes a script, and every run needs its own approval.'
              : 'Der Agent reicht ein Ergebnis weiter: öffnen, im Finder zeigen, an einen Entwurf hängen, drucken. Er schreibt nie ein Skript, und jeder Lauf braucht eine eigene Freigabe.'}
          </p>
        </div>
        <span className={`settings-guard-pill ${supported ? 'is-on' : 'is-off'}`}>
          {supported
            ? (en ? `${active.length} of ${COMPUTER_VERBS.length} enabled` : `${active.length} von ${COMPUTER_VERBS.length} frei`)
            : (en ? 'Not available here' : 'Hier nicht verfügbar')}
        </span>
      </div>

      <div className="settings-guard-active">
        <span className="settings-guard-active-label">{en ? 'Active operations' : 'Freigegebene Vorgänge'}</span>
        <span className="settings-guard-active-value">{describeComputerControl(settings, en ? 'en' : 'de')}</span>
      </div>

      {/* Der Weg war nirgends zusammenhängend beschrieben (Codex F02): Modul, Schalter am
          Lauf und Systemdialog sind drei getrennte Handlungen an drei Orten. */}
      <div className="settings-guard-steps">
        <span className="settings-guard-fixed-title">{en ? 'How a run gets computer access' : 'So bekommt ein Lauf Zugriff'}</span>
        <ol>
          <li>{en ? 'Here: choose which operations are allowed at all (below).' : 'Hier: festlegen, welche Vorgänge überhaupt erlaubt sind (unten).'}</li>
          <li>{en ? 'At the run: switch on “Computer” next to the instruction field. Without it, nothing is available.' : 'Am Lauf: den Schalter „Rechner" neben dem Auftragsfeld einschalten. Ohne ihn steht nichts zur Verfügung.'}</li>
          <li>{en ? 'At the start: confirm the system dialog. It lists what is possible in that run.' : 'Beim Start: den Systemdialog bestätigen. Er zählt auf, was in diesem Lauf möglich ist.'}</li>
          <li>{en ? 'During the run: the model decides from your instruction whether it uses any of it. Say in the instruction what should happen.' : 'Im Lauf: das Modell entscheidet aus deinem Auftrag, ob es etwas davon nutzt. Schreib also in den Auftrag, was passieren soll.'}</li>
        </ol>
      </div>

      {COMPUTER_VERBS.map(verb => (
        <div className="settings-row" key={verb}>
          <div className="settings-row-info">
            <label htmlFor={`agent-computer-${verb}`}>{asHeading(computerVerbLabel(verb, en ? 'en' : 'de'))}</label>
            <span className="settings-hint">{VERB_HINTS[verb][en ? 'en' : 'de']}</span>
          </div>
          <input
            id={`agent-computer-${verb}`}
            type="checkbox"
            checked={settings.verbs[verb]}
            onChange={e => setAgentComputer({ verbs: { ...settings.verbs, [verb]: e.target.checked } })}
          />
        </div>
      ))}

      {/* 21 Endungen in einem Zeilen-Hinweis waren eine Wand aus Grossbuchstaben und haben
          den wichtigen Satz darüber (KOPIE) begraben. Beide Listen stehen jetzt beieinander
          im Aufklapper — erzeugt aus den Konstanten, also nie veraltet. */}
      <Details title={en ? 'Which file formats?' : 'Welche Dateiformate?'}>
        <p className="sui-hint">
          <strong>{en ? 'Open' : 'Öffnen'}:</strong> {describeExtensions(OPENABLE_EXTENSIONS)}.{' '}
          {en
            ? 'Deliberately not HTML pages or executables, and not CSV or the old macro-capable Office formats.'
            : 'HTML-Seiten und ausführbare Dateien bewusst nicht, ebenso wenig CSV und die alten makrofähigen Office-Formate.'}
        </p>
        <p className="sui-hint">
          <strong>{en ? 'Print' : 'Drucken'}:</strong> {describeExtensions(PRINTABLE_EXTENSIONS)}.{' '}
          {en ? 'Printing goes through CUPS, which renders nothing else reliably.' : 'Gedruckt wird über CUPS, und das stellt nichts anderes zuverlässig dar.'}
        </p>
      </Details>

      <AppListField apps={settings.apps} onChange={apps => setAgentComputer({ apps })} />


      <div className="settings-guard-fixed">
        <span className="settings-guard-fixed-title">{en ? 'Fixed, not configurable' : 'Fest, nicht einstellbar'}</span>
        <ul>
          <li>{en
            ? 'The agent picks one of these named operations and supplies values; the app builds the call. What is not listed here does not exist for it.'
            : 'Der Agent wählt einen dieser benannten Vorgänge und liefert Werte, den Aufruf baut die App. Was hier nicht steht, gibt es für ihn nicht.'}</li>
          <li>{en
            ? 'Email is only ever prepared as a visible draft. There is no send operation, and none will be added.'
            : 'E-Mail entsteht ausschließlich als sichtbarer Entwurf. Einen Vorgang „senden" gibt es nicht und wird es nicht geben.'}</li>
          <li>{en
            ? 'There is no “run this script” operation, and no way to run a macOS Shortcut. Nothing here fetches data from outside or sends any out.'
            : 'Es gibt keinen Vorgang „führe dieses Skript aus" und keinen, der einen Kurzbefehl startet. Nichts hier holt Daten von aussen herein oder gibt welche nach draussen.'}</li>
          <li>{en
            ? 'Only results of the current run and files inside the vault can be handed to a program — never the vault’s internal .mindgraph data, never absolute paths.'
            : 'Übergeben werden nur Ergebnisse des laufenden Auftrags und Dateien im Vault — nie die internen .mindgraph-Daten, nie absolute Pfade.'}</li>
          <li>{en
            ? 'A result is always handed over as a copy in the run’s work folder. What the agent opens is therefore not the file you accept afterwards — edit the accepted file, not the copy.'
            : 'Ein Ergebnis wird immer als Kopie im Arbeitsordner des Laufs übergeben. Was der Agent öffnet, ist also nicht die Datei, die du danach übernimmst — weiterarbeiten am übernommenen Ergebnis, nicht an der Kopie.'}</li>
          <li>{en
            ? 'The program list above applies to “open file” only. Email always goes to Apple Mail, printing always to the default printer — neither can be chosen here.'
            : 'Die Programmliste oben gilt nur für „Datei öffnen". Mail geht immer an Apple Mail, Drucken immer an den Standarddrucker — beides ist hier nicht wählbar.'}</li>
          <li>{en
            ? 'At most ten operations per run — rejected attempts count too. Every run needs a separate approval that lists them. The same operation is never run twice: after an unclear outcome it is not repeated, because the effect may already have happened.'
            : 'Höchstens zehn Vorgänge pro Lauf — abgelehnte Versuche zählen mit. Jeder Lauf braucht eine eigene Freigabe, die sie aufzählt. Derselbe Vorgang läuft nie zweimal: nach einer unklaren Rückmeldung wird nicht wiederholt, denn die Wirkung kann schon eingetreten sein.'}</li>
          <li>{en
            ? 'Whether a print job really produces paper, and whether macOS grants control of a program at all, only shows at the moment it happens — the app does not promise it in advance.'
            : 'Ob ein Druckauftrag wirklich Papier erzeugt und ob macOS die Steuerung eines Programms überhaupt erlaubt, zeigt sich erst im Moment selbst — die App sagt es nicht vorher zu.'}</li>
          <li>{en
            ? 'Not combinable with web research: a prepared web page must not be able to dictate a mail target.'
            : 'Nicht mit der Webrecherche kombinierbar: eine präparierte Webseite darf kein Mail-Ziel vorgeben können.'}</li>
        </ul>
      </div>

      {!supported && (
        <div className="settings-guard-warning">
          {en
            ? 'This system is not macOS. Computer control does not start here — the operations rely on the scripting interfaces of macOS.'
            : 'Dieses System ist nicht macOS. Die Rechner-Steuerung startet hier nicht — die Vorgänge hängen an den Skriptschnittstellen von macOS.'}
        </div>
      )}
    </section>
  )
}
