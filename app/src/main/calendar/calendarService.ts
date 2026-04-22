// Kalender-Service für Main-Prozess-Komponenten.
// Kapselt den Apple-EventKit-Zugriff via Swift, damit sowohl der IPC-Handler
// (Dashboard) als auch der Telegram-Bot die gleiche Logik nutzen können.

import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

export interface CalendarEvent {
  title: string
  startDate: string   // "yyyy-MM-dd HH:mm" in Local-TZ
  endDate: string
  location?: string
  calendar?: string
  allDay: boolean
}

export type CalendarResult =
  | { success: true; events: CalendarEvent[] }
  | { success: false; events: []; needsPermission?: boolean; neverAsked?: boolean; error: string }

// Liest Events zwischen startDate und endDate (beide inklusiv, yyyy-MM-dd).
// Prüft Permission, liefert klare NO_ACCESS-Information falls nicht erteilt.
export async function getCalendarEvents(startDate: string, endDate: string): Promise<CalendarResult> {
  if (process.platform !== 'darwin') {
    return { success: false, events: [], error: 'macOS only' }
  }

  const dateRegex = /^\d{4}-\d{2}-\d{2}$/
  if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
    return { success: false, events: [], error: 'Ungültiges Datumsformat' }
  }

  const swiftCode = `
import EventKit
import Foundation

let store = EKEventStore()
let status = EKEventStore.authorizationStatus(for: .event)

var hasAccess = false
if #available(macOS 14.0, *) {
    if status == .fullAccess || status.rawValue == 2 /* .authorized (legacy) */ {
        hasAccess = true
    }
} else {
    if status.rawValue == 2 /* .authorized */ {
        hasAccess = true
    }
}

guard hasAccess else {
    print("NO_ACCESS|||\\(status.rawValue)")
    exit(0)
}

let df = DateFormatter()
df.dateFormat = "yyyy-MM-dd"
df.timeZone = TimeZone.current
guard let startD = df.date(from: "${startDate}"),
      let endD = df.date(from: "${endDate}") else { exit(0) }
let endDPlus = Calendar.current.date(byAdding: .day, value: 1, to: endD)!

let outDF = DateFormatter()
outDF.dateFormat = "yyyy-MM-dd HH:mm"
outDF.timeZone = TimeZone.current

let pred = store.predicateForEvents(withStart: startD, end: endDPlus, calendars: nil)
let events = store.events(matching: pred)

for event in events {
    let loc = event.location ?? ""
    let cal = event.calendar.title
    let allDay = event.isAllDay
    print("\\(event.title ?? "")|||\\(outDF.string(from: event.startDate))|||\\(outDF.string(from: event.endDate))|||\\(loc)|||\\(cal)|||\\(allDay)")
}
`

  try {
    const { stdout } = await execFileAsync('swift', ['-e', swiftCode], { timeout: 15000 })
    const trimmed = stdout.trim()

    if (trimmed.startsWith('NO_ACCESS')) {
      const parts = trimmed.split('|||')
      const statusCode = parseInt(parts[1] ?? '0', 10)
      const neverAsked = statusCode === 0
      return {
        success: false,
        events: [],
        needsPermission: true,
        neverAsked,
        error: neverAsked
          ? 'Kalender-Zugriff wurde noch nicht erteilt.'
          : 'Kalender-Zugriff wurde verweigert.'
      }
    }

    const events: CalendarEvent[] = trimmed.split('\n').filter(Boolean).map(line => {
      const [title, start, end, location, calendar, allDay] = line.split('|||')
      return {
        title: title?.trim() || '',
        startDate: start?.trim() || '',
        endDate: end?.trim() || '',
        location: location?.trim() || undefined,
        calendar: calendar?.trim() || undefined,
        allDay: allDay?.trim() === 'true'
      }
    }).filter(e => e.title)

    return { success: true, events }
  } catch (error) {
    console.error('[Calendar] Failed:', error)
    return {
      success: false,
      events: [],
      error: error instanceof Error ? error.message : 'Kalender konnte nicht gelesen werden'
    }
  }
}
