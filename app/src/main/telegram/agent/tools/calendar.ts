// Calendar-Tool für den Telegram-Agent.
// calendar_list — listet macOS-Kalender-Termine in einem Datums-Range.
// (Schreiben bleibt vorerst UI-Only; Read-Only-Tool reicht für Briefing-Zwecke.)

import { eventsForRange } from '../../vaultQueries'
import type { AppTool, ToolContext } from './registry'

export const calendarListTool: AppTool = {
  name: 'calendar_list',
  description: 'Listet Kalender-Termine aus dem macOS-Kalender. days_ahead steuert das Fenster: 0 = nur heute, 1 = heute+morgen, 7 = nächste Woche.',
  isWrite: false,
  parameters: {
    type: 'object',
    properties: {
      days_ahead: { type: 'integer', description: 'Anzahl Tage ab heute. 0 = nur heute, 1 = heute + morgen. Default: 0.' }
    }
  },
  async run(args, _ctx: ToolContext) {
    const days = Math.min(31, Math.max(0, Number(args.days_ahead ?? 0)))
    const window = await eventsForRange(days)
    if (window.needsPermission) {
      return { ok: false, content: 'Kein Kalender-Zugriff. In MindGraph → Dashboard → Kalender → „Zugriff erteilen" klicken.' }
    }
    if (window.error) {
      return { ok: false, content: `Kalender-Fehler: ${window.error}` }
    }
    const events = window.events.map(e => ({
      title: e.title,
      start: e.startDate,
      end: e.endDate,
      allDay: e.allDay,
      location: e.location ?? null
    }))
    return {
      ok: true,
      content: JSON.stringify({ days_ahead: days, count: events.length, events }, null, 2),
      display: `📆 _${events.length} Termine geladen (${days}d)._`
    }
  }
}
