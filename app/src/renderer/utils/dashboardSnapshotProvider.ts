// Eine Bezugsquelle für den Dashboard-Snapshot.
//
// `collectTasks` lädt über `readFilesBatch` den Inhalt ALLER Notizen mit Aufgaben nach.
// Ohne gemeinsame Stelle würde jeder Sprachbefehl den gesamten Aufgabenbestand neu
// rechnen und das Latenzbudget von 300 ms warm sofort reißen.
//
// Drei Eigenschaften, die ein einfacher 60-Sekunden-Modulcache nicht hat:
//   1. Schlüssel statt Zeit — nach einer Notizänderung ist der Stand sofort ungültig.
//   2. Ein gemeinsames laufendes Promise — zwei gleichzeitige Anfragen rechnen einmal.
//   3. Getrennte Einträge je Kalender-Einstellung, damit ein Lauf ohne Kalender keinen
//      Stand mit Kalender überschreibt (der Kalender kostet einen IPC-Aufruf).
//
// Bekannte Grenze: DashboardView hält vorerst weiter seinen eigenen Modulcache
// (`lastSnapshotCache`). Beide zusammenzuführen ist Schritt 3 im Plan, nicht Teil des
// vertikalen Prototyps.

import { buildDashboardSnapshot, type DashboardSnapshot, type SnapshotInputs } from './dashboardData'
import type { Note } from '../../shared/types'

export interface SnapshotKey {
  vaultPath: string
  notesRev: number
  emailsRev: number
  settingsRev: number
  includeCalendar: boolean
  /**
   * Was der Aufrufer tatsächlich braucht. 'tasks' lässt Mails und Buchungen leer —
   * ein so gerechneter Stand darf niemandem geliefert werden, der Mails erwartet,
   * deshalb steht der Umfang IM Schlüssel und nicht nur in den Eingaben.
   */
  scope: 'tasks' | 'full'
}

export interface DashboardSnapshotProvider {
  get(inputs: SnapshotInputs, key: SnapshotKey): Promise<DashboardSnapshot>
  invalidate(reason: string): void
}

/** Rückfall-Alter für alles, was der Schlüssel nicht sieht (Kalender, externe Dateiänderungen). */
const MAX_AGE_MS = 60_000
const MAX_ENTRIES = 4

interface CacheEntry {
  key: string
  at: number
  inFlight: Promise<DashboardSnapshot> | null
  value: DashboardSnapshot | null
}

function serializeKey(key: SnapshotKey): string {
  return [key.scope, key.vaultPath, key.notesRev, key.emailsRev, key.settingsRev, key.includeCalendar].join('|')
}

/**
 * Behelfs-Revision, solange notesStore/emailStore keinen monotonen Zähler führen.
 * Über 4000 Notizen kostet das deutlich unter einer Millisekunde. Ein echter Zähler
 * je Store ist verlässlicher (er sieht auch Änderungen ohne neue Änderungszeit) und
 * kommt später — die Signatur hier ändert sich dadurch nicht.
 */
export function computeNotesRevision(notes: Note[]): number {
  let newest = 0
  for (const note of notes) {
    const ts = note.modifiedAt ? new Date(note.modifiedAt).getTime() : 0
    if (ts > newest) newest = ts
  }
  return notes.length * 31 + newest
}

/**
 * Kennzahl der aufgabenrelevanten Einstellungen.
 *
 * Vorher stand hier die reine ANZAHL der ein- und ausgeschlossenen Ordner. Damit blieb
 * der Schlüssel gleich, wenn ein Ordner gegen einen anderen getauscht wurde — und die
 * Vorlaufzeit ging gar nicht ein. Der Nutzer änderte also eine Einstellung und bekam bis
 * zu 60 Sekunden lang die alte Antwort, ohne dass etwas darauf hindeutete.
 *
 * Bewusst ein Hash über die Inhalte und keine Zähler im Store: Der Hash ist billig
 * (wenige Dutzend Zeichen) und kann nicht vergessen werden, wenn eine neue Einstellung
 * dazukommt — man muss sie nur hier anhängen.
 */
export function computeSettingsRevision(input: {
  excludedFolders: string[]
  includedFolders: string[]
  /** Vorlaufzeiten je Dringlichkeit (uiStore `taskLeadTime`) — strukturell getypt,
   *  damit dieses Modul nicht am Store hängt. */
  taskLeadTime: { critical: number; high: number; normal: number }
}): number {
  const lead = input.taskLeadTime
  const text = [
    input.excludedFolders.join('|'),
    input.includedFolders.join('|'),
    `${lead.critical}/${lead.high}/${lead.normal}`
  ].join('#')
  // djb2 — klein, stabil, ohne Abhängigkeit. Kollisionen sind hier folgenlos teuer
  // (ein überflüssiger Neuberechnungslauf), nicht gefährlich.
  let hash = 5381
  for (let i = 0; i < text.length; i++) hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0
  return hash
}

class SnapshotProvider implements DashboardSnapshotProvider {
  private entries: CacheEntry[] = []

  get(inputs: SnapshotInputs, key: SnapshotKey): Promise<DashboardSnapshot> {
    const serialized = serializeKey(key)
    const now = Date.now()
    const existing = this.entries.find(e => e.key === serialized)

    if (existing) {
      // Ein laufender Aufruf wird geteilt, auch wenn er älter als MAX_AGE_MS ist —
      // zweimal gleichzeitig zu rechnen wäre in jedem Fall falsch.
      if (existing.inFlight) return existing.inFlight
      if (existing.value && now - existing.at < MAX_AGE_MS) return Promise.resolve(existing.value)
    }

    const entry: CacheEntry = existing ?? { key: serialized, at: now, inFlight: null, value: null }
    const promise = buildDashboardSnapshot(inputs)
      .then(snapshot => {
        entry.value = snapshot
        entry.at = Date.now()
        entry.inFlight = null
        return snapshot
      })
      .catch(err => {
        // Fehlversuche nicht zwischenspeichern, sonst bleibt ein Aussetzer eine Minute stehen.
        entry.inFlight = null
        entry.value = null
        throw err
      })

    entry.inFlight = promise
    if (!existing) {
      this.entries.push(entry)
      if (this.entries.length > MAX_ENTRIES) this.entries.shift()
    }
    return promise
  }

  invalidate(reason: string): void {
    if (this.entries.length > 0) console.log(`[snapshotProvider] verworfen: ${reason}`)
    this.entries = []
  }
}

export const dashboardSnapshotProvider: DashboardSnapshotProvider = new SnapshotProvider()
