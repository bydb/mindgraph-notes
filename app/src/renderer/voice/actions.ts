// Aktionsschicht der Sprachbefehle.
//
// Jede Aktion ruft die vorhandene Funktion auf — semantisch, nie über simulierte
// Eingaben. Parameter kommen bereits aufgelöst an (siehe shared/voiceCommands/types.ts);
// hier wird nicht mehr geraten.
//
// Stufe 1a: drei Aktionen, je eine Art. Keine schreibt.

import type { AnswerCard, ActionKind, ActionParams, AppActionId } from '../../shared/voiceCommands/types'
import type { Note } from '../../shared/types'
import { useNotesStore } from '../stores/notesStore'
import { useUIStore } from '../stores/uiStore'
import { getVoiceUiBridge } from './uiBridge'
import { computeNotesRevision, computeSettingsRevision, dashboardSnapshotProvider } from '../utils/dashboardSnapshotProvider'
import { collectFocusTasks } from '../utils/dashboardData'
import { useEmailStore } from '../stores/emailStore'
import {
  estimateSavedMinutes,
  localDayRange,
  type ActivityType,
  type ActivitySummary
} from '../../shared/activityLog'
import { ACTIVITY_TYPE_LABEL_KEY, acceptedLine, tasksLine, savedBasisLine, savedContextLine, sampleLine, unmeasuredLine, unpricedLine } from '../utils/impactText'

export type TFn = (key: any, params?: Record<string, string | number>) => string

export interface ActionOutcome {
  card: AnswerCard
  /** Höchstens zwei Sätze, nie die Liste — vorgelesene Aufzählungen merkt sich niemand. */
  speech: string | null
  /** Reine Messgröße für das Latenzbudget, nicht für den Nutzer. */
  dataMs: number
}

export interface ActionSpec<K extends AppActionId> {
  id: K
  kind: ActionKind
  run: (params: ActionParams[K], t: TFn) => Promise<ActionOutcome>
}

function moduleOffCard(t: TFn, moduleLabel: string): ActionOutcome {
  return {
    card: {
      title: t('voiceCommand.moduleOff.title'),
      lines: [{ text: t('voiceCommand.moduleOff.body', { module: moduleLabel }) }],
      sources: [],
      followUps: [{ kind: 'command', label: t('commandPalette.settingsModules'), commandId: 'open-settings-modules' }]
    },
    speech: t('voiceCommand.moduleOff.speech', { module: moduleLabel }),
    dataMs: 0
  }
}

const viewDashboard: ActionSpec<'view.dashboard'> = {
  id: 'view.dashboard',
  kind: 'navigate',
  run: async (_params, t) => {
    const bridge = getVoiceUiBridge()
    if (!bridge) throw new Error('voice ui bridge not registered')
    if (!bridge.isModuleEnabled('dashboard')) {
      return moduleOffCard(t, t('commandPalette.openDashboard'))
    }
    bridge.openDashboard()
    return {
      card: {
        title: t('voiceCommand.card.dashboardOpened'),
        lines: [],
        sources: [],
        followUps: [],
        navigated: t('voiceCommand.card.dashboardOpened')
      },
      speech: t('voiceCommand.card.dashboardOpened'),
      dataMs: 0
    }
  }
}

/**
 * Öffnet den Dialog für eine neue Notiz — dieselbe Stelle, die das Plus in der
 * Seitenleiste und Cmd+N ansteuern. Schreibt selbst nichts: Der Name wird im Dialog
 * eingegeben, angelegt wird erst beim Bestätigen.
 */
const noteCreate: ActionSpec<'note.create'> = {
  id: 'note.create',
  kind: 'navigate',
  run: async (_params, t) => {
    const bridge = getVoiceUiBridge()
    if (!bridge) throw new Error('voice ui bridge not registered')
    bridge.newNote()
    const navigated = t('voiceCommand.card.newNoteOpened')
    return {
      card: { title: navigated, lines: [], sources: [], followUps: [], navigated },
      speech: navigated,
      dataMs: 0
    }
  }
}

const searchNotes: ActionSpec<'search.notes'> = {
  id: 'search.notes',
  kind: 'navigate',
  run: async (params, t) => {
    const bridge = getVoiceUiBridge()
    if (!bridge) throw new Error('voice ui bridge not registered')
    bridge.openQuickSearch(params.query)
    const navigated = t('voiceCommand.card.searchOpened', { query: params.query })
    return {
      card: { title: navigated, lines: [], sources: [], followUps: [], navigated },
      speech: navigated,
      dataMs: 0
    }
  }
}

function dueInDays(due: Date | string | undefined | null): number | undefined {
  if (!due) return undefined
  const d = due instanceof Date ? due : new Date(due)
  if (Number.isNaN(d.getTime())) return undefined
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  return Math.round((d.getTime() - startOfToday.getTime()) / 86_400_000)
}

async function loadTasks(): Promise<{ snapshot: Awaited<ReturnType<typeof dashboardSnapshotProvider.get>> | null; dataMs: number }> {
  const started = performance.now()
  const notes: Note[] = useNotesStore.getState().notes
  const ui = useUIStore.getState()
  const vaultPath = useNotesStore.getState().vaultPath ?? null
  if (!vaultPath) return { snapshot: null, dataMs: 0 }

  const snapshot = await dashboardSnapshotProvider.get(
    {
      notes,
      vaultPath,
      excludedFolders: ui.taskExcludedFolders,
      includedFolders: ui.taskIncludedFolders,
      emails: [],
      dashboardOffers: [],
      bookingsSinceIso: null,
      calendarDaysAhead: 0,
      includeCalendar: false,
      taskLeadTime: ui.taskLeadTime
    },
    {
      scope: 'tasks',
      vaultPath,
      notesRev: computeNotesRevision(notes),
      emailsRev: 0,
      settingsRev: computeSettingsRevision({
        excludedFolders: ui.taskExcludedFolders,
        includedFolders: ui.taskIncludedFolders,
        taskLeadTime: ui.taskLeadTime
      }),
      includeCalendar: false
    }
  )
  return { snapshot, dataMs: Math.round(performance.now() - started) }
}

/**
 * „Welche Todos habe ich heute noch?" — überfällige und heute fällige Aufgaben zusammen.
 * Was gestern liegen blieb, gehört zu dem, was heute noch ansteht.
 *
 * Schaltet zusätzlich die rechte Leiste auf Aufgaben um: Wer danach fragt, will nicht nur
 * die Antwort lesen, sondern in dem Bereich weiterarbeiten.
 */
const tasksToday: ActionSpec<'tasks.today'> = {
  id: 'tasks.today',
  kind: 'answer',
  run: async (_params, t) => {
    const { snapshot, dataMs } = await loadTasks()
    if (!snapshot) {
      return {
        card: { title: t('voiceCommand.card.todayTitle'), lines: [], emptyText: t('voiceCommand.card.noVault'), sources: [], followUps: [] },
        speech: t('voiceCommand.card.noVault'),
        dataMs: 0
      }
    }
    getVoiceUiBridge()?.openTasksPanel()

    const overdueCount = snapshot.tasks.overdue.length
    const todayCount = snapshot.tasks.today.length
    const focus = collectFocusTasks(snapshot.tasks, 5)

    if (focus.length === 0) {
      return {
        card: {
          title: t('voiceCommand.card.todayTitle'),
          lines: [],
          emptyText: t('voiceCommand.card.todayNone'),
          sources: [],
          followUps: []
        },
        speech: t('voiceCommand.card.todayNone'),
        dataMs
      }
    }

    const total = todayCount + overdueCount
    return {
      card: {
        title: t('voiceCommand.card.todayTitle'),
        lines: focus.map(task => ({ text: task.text, noteId: task.noteId, dueIn: dueInDays(task.dueDate) })),
        footnote: total > focus.length ? t('voiceCommand.card.shownOf', { shown: focus.length, total }) : undefined,
        sources: [],
        followUps: [{ kind: 'command', label: t('commandPalette.panelTasks'), commandId: 'panel-tasks' }]
      },
      speech: t('voiceCommand.speech.today', { count: todayCount + overdueCount, overdue: overdueCount }),
      dataMs
    }
  }
}

/**
 * Tagesbriefing: Aufgaben, heutige Termine und Mails, die auf Antwort warten — in
 * einer Karte. Anders als `tasks.today` braucht es den vollen Snapshot, also auch
 * Kalender (ein IPC-Aufruf) und Mails. Deshalb steht `scope: 'full'` im Schlüssel:
 * ein ohne Mails gerechneter Stand darf hier nicht ausgeliefert werden.
 */
const briefingToday: ActionSpec<'briefing.today'> = {
  id: 'briefing.today',
  kind: 'answer',
  run: async (_params, t) => {
    const started = performance.now()
    const notes: Note[] = useNotesStore.getState().notes
    const ui = useUIStore.getState()
    const vaultPath = useNotesStore.getState().vaultPath ?? null
    const emails = useEmailStore.getState().emails

    if (!vaultPath) {
      return {
        card: { title: t('voiceCommand.card.briefingTitle'), lines: [], emptyText: t('voiceCommand.card.noVault'), sources: [], followUps: [] },
        speech: t('voiceCommand.card.noVault'),
        dataMs: 0
      }
    }

    // Zählt nur, was die Karte auch benutzt: offene Antwort-Mails. Ändert sich ein
    // Häkchen "erledigt", ist der Stand sofort ungültig — ohne dafür den ganzen
    // Mailbestand zu hashen.
    const openReplies = emails.reduce(
      (n, mail) => (!mail.sent && mail.analysis?.needsReply && !mail.analysis?.replyHandled ? n + 1 : n),
      0
    )

    const snapshot = await dashboardSnapshotProvider.get(
      {
        notes,
        vaultPath,
        excludedFolders: ui.taskExcludedFolders,
        includedFolders: ui.taskIncludedFolders,
        emails,
        dashboardOffers: [],
        bookingsSinceIso: null,
        calendarDaysAhead: 1,
        includeCalendar: true,
        taskLeadTime: ui.taskLeadTime
      },
      {
        scope: 'full',
        vaultPath,
        notesRev: computeNotesRevision(notes),
        emailsRev: emails.length * 31 + openReplies,
        settingsRev: computeSettingsRevision({
        excludedFolders: ui.taskExcludedFolders,
        includedFolders: ui.taskIncludedFolders,
        taskLeadTime: ui.taskLeadTime
      }),
        includeCalendar: true
      }
    )
    const dataMs = Math.round(performance.now() - started)

    const tasks = collectFocusTasks(snapshot.tasks, 3)
    const todayEvents = snapshot.calendar.filter(item => item.dayOffset === 0).slice(0, 3)
    const mails = snapshot.emails.slice(0, 3)

    const lines = [
      ...tasks.map(task => ({
        group: t('voiceCommand.card.groupTasks'),
        text: task.text,
        noteId: task.noteId,
        dueIn: dueInDays(task.dueDate)
      })),
      ...todayEvents.map(item => ({
        group: t('voiceCommand.card.groupCalendar'),
        text: formatEvent(item.event)
      })),
      ...mails.map(item => ({
        group: t('voiceCommand.card.groupMails'),
        text: `${item.email.from.name || item.email.from.address}: ${item.email.subject}`
      }))
    ]

    // Fehlende Kalenderfreigabe nicht verschweigen — sonst sieht ein leerer Tag aus
    // wie ein freier Tag.
    const footnote = snapshot.calendarNeedsPermission
      ? t('voiceCommand.card.calendarBlocked')
      : undefined

    if (lines.length === 0) {
      return {
        card: {
          title: t('voiceCommand.card.briefingTitle'),
          lines: [],
          emptyText: t('voiceCommand.card.briefingNone'),
          footnote,
          sources: [],
          followUps: []
        },
        speech: t('voiceCommand.card.briefingNone'),
        dataMs
      }
    }

    return {
      card: {
        title: t('voiceCommand.card.briefingTitle'),
        lines,
        footnote,
        sources: [],
        followUps: [{ kind: 'command', label: t('commandPalette.panelTasks'), commandId: 'panel-tasks' }]
      },
      speech: t('voiceCommand.speech.briefing', {
        tasks: snapshot.tasks.overdue.length + snapshot.tasks.today.length,
        events: todayEvents.length,
        mails: snapshot.emails.length
      }),
      dataMs
    }
  }
}

function formatEvent(event: { title: string; startDate: string; allDay?: boolean }): string {
  if (event.allDay) return event.title
  const start = new Date(event.startDate)
  if (Number.isNaN(start.getTime())) return event.title
  const time = start.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  return `${time} ${event.title}`
}

const tasksOverdue: ActionSpec<'tasks.overdue'> = {
  id: 'tasks.overdue',
  kind: 'answer',
  run: async (_params, t) => {
    const { snapshot, dataMs } = await loadTasks()
    if (!snapshot) {
      return {
        card: { title: t('voiceCommand.card.overdueTitle'), lines: [], emptyText: t('voiceCommand.card.noVault'), sources: [], followUps: [] },
        speech: t('voiceCommand.card.noVault'),
        dataMs: 0
      }
    }
    getVoiceUiBridge()?.openTasksPanel()

    const overdue = snapshot.tasks.overdue
    const shown = collectFocusTasks({ ...snapshot.tasks, today: [], soon: [], later: [], noDate: [] }, 5)

    if (overdue.length === 0) {
      return {
        card: {
          title: t('voiceCommand.card.overdueTitle'),
          lines: [],
          emptyText: t('voiceCommand.card.overdueNone'),
          sources: [],
          followUps: [{ kind: 'command', label: t('commandPalette.panelTasks'), commandId: 'panel-tasks' }]
        },
        speech: t('voiceCommand.card.overdueNone'),
        dataMs
      }
    }

    const oldest = Math.min(...overdue.map(task => dueInDays(task.dueDate) ?? 0))
    return {
      card: {
        title: t('voiceCommand.card.overdueTitle'),
        lines: shown.map(task => ({
          text: task.text,
          noteId: task.noteId,
          dueIn: dueInDays(task.dueDate)
        })),
        footnote: overdue.length > shown.length
          ? t('voiceCommand.card.shownOf', { shown: shown.length, total: overdue.length })
          : undefined,
        sources: [],
        followUps: [{ kind: 'command', label: t('commandPalette.panelTasks'), commandId: 'panel-tasks' }],
        navigated: undefined
      },
      // Zusammenfassen statt aufzählen: die Liste steht auf der Karte.
      speech: t(overdue.length === 1 ? 'voiceCommand.speech.overdueOne' : 'voiceCommand.speech.overdueMany', {
        count: overdue.length,
        days: Math.abs(oldest)
      }),
      dataMs
    }
  }
}

/**
 * „Was hat MindGraph heute übernommen?" — Tagesbilanz aus dem Tätigkeitsprotokoll.
 *
 * Zwei Ebenen, streng getrennt:
 *  1. Zähler. Die stehen immer, sie sind gemessen.
 *  2. Zeitersparnis. Nur, wenn der Nutzer für die Tätigkeitsart selbst eine
 *     Referenzzeit hinterlegt hat — und mit sichtbarer Rechengrundlage. Ohne
 *     Referenzzeit sagt die Karte, dass sie nichts sagen kann, statt zu schätzen.
 */
const activityToday: ActionSpec<'activity.today'> = {
  id: 'activity.today',
  kind: 'answer',
  run: async (_params, t) => {
    const started = performance.now()
    const vaultPath = useNotesStore.getState().vaultPath ?? null
    if (!vaultPath) {
      return {
        card: { title: t('voiceCommand.card.activityTitle'), lines: [], emptyText: t('voiceCommand.card.noVault'), sources: [], followUps: [] },
        speech: t('voiceCommand.card.noVault'),
        dataMs: 0
      }
    }

    const today = localDayRange(Date.now())
    // Zwei Abfragen: heute für die Bilanz, der ganze Bestand für die Stichprobengröße.
    // „Grundlage: deine Referenzzeit, 6 vergleichbare Vorgänge" ist der Unterschied
    // zwischen einer Zahl aus einem Lauf und einer aus zwanzig — und den muss die Karte
    // benennen, sonst wirkt eine einmalige Messung wie ein Erfahrungswert.
    const [res, history] = await Promise.all([
      window.electronAPI.activitySummary(vaultPath, today),
      window.electronAPI.activitySummary(vaultPath, { from: 0, to: today.to })
    ])
    const dataMs = Math.round(performance.now() - started)
    if (!res.success || !res.summary) {
      throw new Error(res.error || t('voiceCommand.card.activityUnavailable'))
    }
    const summary: ActivitySummary = res.summary
    const sampleByType = new Map<string, number>()
    for (const run of history.summary?.acceptedRuns ?? []) {
      sampleByType.set(run.activityType, (sampleByType.get(run.activityType) ?? 0) + 1)
    }
    const saved = estimateSavedMinutes(summary, useUIStore.getState().impact.referenceMinutes)

    const doneGroup = t('voiceCommand.card.groupDone')
    const lines: AnswerCard['lines'] = []
    if (summary.acceptedTotal > 0) {
      lines.push({ group: doneGroup, text: acceptedLine(summary, t) })
    }
    // Nach Tätigkeitsart aufschlüsseln — aber nur Läufe, deren Ergebnis übernommen wurde.
    const runsByType = new Map<ActivityType, number>()
    for (const run of summary.acceptedRuns) runsByType.set(run.activityType, (runsByType.get(run.activityType) ?? 0) + 1)
    for (const [type, count] of runsByType) {
      lines.push({ group: doneGroup, text: `${t(ACTIVITY_TYPE_LABEL_KEY[type])}: ${count}` })
    }
    if (summary.tasksCreated > 0) {
      lines.push({ group: doneGroup, text: tasksLine(summary, t) })
    }

    if (saved.lines.length > 0) {
      const savedGroup = t('voiceCommand.card.groupSaved')
      lines.push({ group: savedGroup, text: t('voiceCommand.card.savedTotal', { minutes: saved.totalMinutes }) })
      // Die Rechengrundlage steht auf der Karte, nicht im Kleingedruckten: Die Zahl
      // ist eine Ableitung aus einer Angabe des Nutzers, keine Messung.
      for (const line of saved.lines) {
        lines.push({ group: savedGroup, text: savedBasisLine(line, t) })
        lines.push({ group: savedGroup, text: savedContextLine(line, t) })
        lines.push({ group: savedGroup, text: sampleLine(sampleByType.get(line.activityType) ?? line.runs, t) })
      }
    }

    // Läufe ohne hinterlegte Referenzzeit sind kein Nullwert, sondern nicht bewertbar —
    // und der Unterschied gehört sichtbar gemacht, sonst wirkt eine fehlende Angabe
    // wie „nichts gespart".
    // Beide Gründe können zugleich gelten: eine Art ohne Referenzzeit UND Läufe ohne
    // gemessene Arbeitszeit. Sie getrennt zu benennen ist der Unterschied zwischen
    // „nichts gespart" und „nicht bewertbar".
    const footnotes = [
      saved.unpricedTypes.length > 0 ? unpricedLine(saved.unpricedTypes, t) : null,
      saved.unmeasuredRuns > 0 ? unmeasuredLine(saved.unmeasuredRuns, t) : null
    ].filter(Boolean) as string[]
    const footnote = footnotes.length > 0 ? footnotes.join(' ') : undefined

    if (lines.length === 0) {
      return {
        card: {
          title: t('voiceCommand.card.activityTitle'),
          lines: [],
          emptyText: t('voiceCommand.card.activityNone'),
          sources: [],
          followUps: []
        },
        speech: t('voiceCommand.card.activityNone'),
        dataMs
      }
    }

    const speech = saved.lines.length > 0
      ? t('voiceCommand.speech.activityWithMinutes', {
          accepted: summary.acceptedTotal,
          tasks: summary.tasksCreated,
          minutes: saved.totalMinutes
        })
      : t('voiceCommand.speech.activity', { accepted: summary.acceptedTotal, tasks: summary.tasksCreated })

    return {
      card: {
        title: t('voiceCommand.card.activityTitle'),
        lines,
        footnote,
        sources: [],
        followUps: [{ kind: 'command', label: t('commandPalette.settings'), commandId: 'open-settings' }]
      },
      speech,
      dataMs
    }
  }
}

/**
 * Nur gebaute Absichten stehen hier. Fehlt eine ID, meldet der Controller das als
 * „noch nicht verfügbar" — statt still nichts zu tun.
 */
export const ACTIONS: Partial<{ [K in AppActionId]: ActionSpec<K> }> = {
  'view.dashboard': viewDashboard,
  'note.create': noteCreate,
  'search.notes': searchNotes,
  'tasks.overdue': tasksOverdue,
  'tasks.today': tasksToday,
  'briefing.today': briefingToday,
  'activity.today': activityToday
}
