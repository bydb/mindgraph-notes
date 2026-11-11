// Daten für das Werkzeug day_overview einsammeln (Formatierung: shared/dayOverview.ts).
// Liest: Tagesprotokoll, Tätigkeitsprotokoll, die Dateinamen im Brain-Ordner des Tages und — nur
// um zu einer abgehakten Checkbox den Text zu finden — die betroffenen Notizen selbst.

import { promises as fs, constants as fsConstants } from 'fs'
import path from 'path'
import { readDayLog } from '../dayLog'
import { readActivitySummary, activityLedgerState } from '../activityLedger'
import { findTaskText, summarizeDayLog } from '../../shared/dayLog'
import type { DayOverviewData } from '../../shared/dayOverview'

const MAX_NOTE_BYTES = 2 * 1024 * 1024

/**
 * Wirklicher Ort eines Vault-relativen Pfads — null, wenn er (auch über eine Verknüpfung) aus dem
 * Vault herausführt oder nicht auflösbar ist. Die lexikalische Prüfung allein genügt nicht:
 * `readdir`/`readFile` folgen Verknüpfungen (Codex F21).
 */
async function realInsideVault(vaultPath: string, rel: string): Promise<{ real: string; root: string } | 'missing' | null> {
  let root: string
  try {
    root = await fs.realpath(vaultPath)
  } catch {
    return null
  }
  const lexical = path.resolve(root, rel)
  if (lexical !== root && !lexical.startsWith(root + path.sep)) return null
  try {
    const real = await fs.realpath(lexical)
    if (real !== root && !real.startsWith(root + path.sep)) return null
    return { real, root }
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') return null
    // Fehlt der Pfad wirklich — oder hängt unterwegs eine Verknüpfung, die ins Leere oder nach
    // außen zeigt? Nur das Erste ist „nicht da“: den nächsten vorhandenen Vorfahren prüfen.
    for (let p = lexical; p !== root && p.startsWith(root + path.sep); p = path.dirname(p)) {
      const st = await fs.lstat(p).catch(() => null)
      if (!st) continue
      const realParent = await fs.realpath(p).catch(() => null)
      if (!realParent || (realParent !== root && !realParent.startsWith(root + path.sep))) return null
      break
    }
    return 'missing'
  }
}

/**
 * Brain-Tagesnotizen eines Tages: `<ordner>/JJJJ/MM/TT.md` und Zweitfassungen `TT (2).md`.
 * null = nicht prüfbar (Ordner führt aus dem Vault, Verknüpfung ins Leere, Lesefehler), [] = geprüft, keine da.
 */
async function findBrainNotes(vaultPath: string, brainFolder: string, isoDate: string): Promise<string[] | null> {
  const [y, m, d] = isoDate.split('-')
  const loc = await realInsideVault(vaultPath, path.join(brainFolder, y, m))
  if (loc === null) return null
  // Kein Monatsordner heißt: für diesen Tag gibt es keine Tagesnotiz.
  if (loc === 'missing') return []
  try {
    const entries = await fs.readdir(loc.real, { withFileTypes: true })
    // Nach dem Lesen erneut prüfen: wurde der Ordner zwischen Prüfung und Auflistung gegen eine
    // Verknüpfung getauscht, stammt die Liste womöglich von außerhalb — dann verwerfen (Codex F34).
    const again = await realInsideVault(vaultPath, path.join(brainFolder, y, m))
    if (again === null || again === 'missing' || again.real !== loc.real) return null
    const pattern = new RegExp(`^${d}( \\(\\d+\\))?\\.md$`)
    return entries
      .filter(e => e.isFile() && pattern.test(e.name))
      .map(e => e.name)
      .sort()
      .map(n => path.relative(loc.root, path.join(loc.real, n)).split(path.sep).join('/'))
  } catch {
    return null
  }
}

/**
 * Eine Notiz über EINEN geöffneten Dateizugriff lesen und danach prüfen, dass unter dem geprüften
 * Pfad noch genau diese Datei liegt (Codex F34). `O_NOFOLLOW`: der letzte Pfadteil darf keine
 * Verknüpfung sein. Wurde zwischen Prüfung und Öffnen getauscht, wird der Inhalt verworfen.
 */
async function readVerified(vaultPath: string, rel: string, real: string): Promise<string | null> {
  const handle = await fs.open(real, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW)
  try {
    const st = await handle.stat()
    if (!st.isFile() || st.size > MAX_NOTE_BYTES) return null
    const content = await handle.readFile('utf-8')
    const again = await realInsideVault(vaultPath, rel)
    if (again === null || again === 'missing' || again.real !== real) return null
    const now = await fs.stat(again.real)
    return now.ino === st.ino && now.dev === st.dev ? content : null
  } finally {
    await handle.close().catch(() => undefined)
  }
}

/** Aufgabentexte zu den Prüfsummen aus dem heutigen Stand der Notizen lesen (je Notiz einmal). */
async function resolveTaskTexts(vaultPath: string, tasks: Array<{ key: string; note: string }>): Promise<Array<string | null>> {
  const contents = new Map<string, string | null>()
  for (const note of new Set(tasks.map(t => t.note))) {
    let content: string | null = null
    try {
      const loc = /\.md$/i.test(note) ? await realInsideVault(vaultPath, note) : null
      if (loc && loc !== 'missing') content = await readVerified(vaultPath, note, loc.real)
    } catch { /* Notiz weg oder nicht lesbar: Text bleibt unbekannt */ }
    contents.set(note, content)
  }
  return tasks.map(t => {
    const content = contents.get(t.note)
    return content ? findTaskText(content, t.key) : null
  })
}

export async function buildDayOverview(args: {
  vaultPath: string
  isoDate: string
  range: { from: number; to: number }
  brainFolder: string
}): Promise<DayOverviewData> {
  const { vaultPath, isoDate, range } = args
  const weekday = new Date(range.from).toLocaleDateString('de-DE', { weekday: 'long' })

  const read = await readDayLog(vaultPath, range)
  let log: DayOverviewData['log']
  if (read.state === 'ok' && read.since !== null) {
    const summary = summarizeDayLog(read.events, range)
    log = { state: 'ok', since: read.since, summary, taskTexts: await resolveTaskTexts(vaultPath, summary.tasksChecked), gaps: read.gaps }
  } else {
    log = read.state === 'broken' ? { state: 'broken' } : { state: 'missing' }
  }

  // `readActivitySummary` liefert bei fehlender oder kaputter Datei eine Nullbilanz — der Zustand
  // der Datei wird deshalb eigens erhoben, sonst hieße „nicht lesbar“ hier „0“ (Codex F22).
  let activity: DayOverviewData['activity'] = { state: 'broken' }
  try {
    const state = await activityLedgerState(vaultPath)
    if (state !== 'ok') activity = { state }
    else {
      const s = await readActivitySummary(vaultPath, range)
      activity = {
        state: 'ok',
        accepted: s.acceptedTotal,
        runsFinished: s.runsFinished,
        runsFailed: s.runsFailed,
        emailTasks: s.emailTasks,
        emailsAnalyzed: s.emailsAnalyzed,
        tasksCreatedViaApp: s.tasksCreated,
        pluginChannelsCompleted: s.jobs.completedTotal
      }
    }
  } catch { /* bleibt 'broken' = nicht lesbar */ }

  return { date: isoDate, weekday, range, log, activity, brainNotes: await findBrainNotes(vaultPath, args.brainFolder, isoDate) }
}
