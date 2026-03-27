import type { EmailMessage, AggregatedContact, Note, CalendarEvent } from '../../shared/types'

interface ContextOptions {
  maxLength?: number
  includeVaultNotes?: boolean
  includeEdooboxEvents?: boolean
  includeContactHistory?: boolean
  includeCalendar?: boolean
}

const STOP_WORDS_DE = new Set([
  'der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einer', 'eines', 'einem', 'einen',
  'und', 'oder', 'aber', 'doch', 'weil', 'wenn', 'als', 'dass', 'wird', 'ist', 'sind', 'war',
  'hat', 'haben', 'wird', 'werden', 'kann', 'muss', 'soll', 'darf', 'mag', 'mit', 'von', 'zu',
  'fuer', 'ueber', 'unter', 'nach', 'vor', 'bei', 'aus', 'auf', 'in', 'an', 'um', 'bis',
  'nicht', 'auch', 'noch', 'nur', 'schon', 'sehr', 'mehr', 'hier', 'dort', 'dann', 'wie',
  'ich', 'du', 'er', 'sie', 'es', 'wir', 'ihr', 'sie', 'mein', 'dein', 'sein', 'ihr',
  'the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'be', 'been', 'has',
  'have', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might',
  'this', 'that', 'these', 'those', 'for', 'from', 'with', 'not', 'all', 'can', 'her',
  'new', 'now', 'way', 'may', 'day', 'too', 'use', 'your', 'how', 'its', 'let', 'our'
])

function extractKeywords(text: string, maxCount = 15): string[] {
  const words = text
    .replace(/[^\w\saeoeue]/gi, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS_DE.has(w.toLowerCase()))
    .map(w => w.toLowerCase())

  // Count frequency
  const freq = new Map<string, number>()
  for (const w of words) {
    freq.set(w, (freq.get(w) || 0) + 1)
  }

  // Sort by frequency, take top
  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxCount)
    .map(([word]) => word)
}

function searchNotes(
  notes: Record<string, Note>,
  keywords: string[],
  maxResults = 5
): Note[] {
  if (keywords.length === 0) return []

  const scored: Array<{ note: Note; score: number }> = []

  for (const note of Object.values(notes)) {
    if (!note.path || note.path.includes('.mindgraph/')) continue
    let score = 0
    const titleLower = (note.title || note.path.split('/').pop() || '').toLowerCase()
    const contentLower = (note.content || '').toLowerCase()
    const tags = (note.tags || []).map(t => t.toLowerCase())

    for (const kw of keywords) {
      // Title match = high value
      if (titleLower.includes(kw)) score += 5
      // Tag match = high value
      if (tags.some(t => t.includes(kw))) score += 4
      // Content match
      if (contentLower.includes(kw)) score += 1
    }

    // Recency bonus
    if (note.modifiedAt) {
      const modTime = note.modifiedAt instanceof Date ? note.modifiedAt.getTime() : new Date(note.modifiedAt).getTime()
      const daysSinceModified = (Date.now() - modTime) / (1000 * 60 * 60 * 24)
      if (daysSinceModified < 7) score += 3
      else if (daysSinceModified < 30) score += 1
    }

    if (score > 0) scored.push({ note, score })
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
    .map(s => s.note)
}

export async function fetchCalendarEvents(daysAhead = 30): Promise<CalendarEvent[]> {
  try {
    const today = new Date()
    const end = new Date(today)
    end.setDate(end.getDate() + daysAhead)
    const startDate = today.toISOString().split('T')[0]
    const endDate = end.toISOString().split('T')[0]
    const result = await window.electronAPI.calendarGetEvents(startDate, endDate)
    if (result.success) return result.events
    return []
  } catch {
    return []
  }
}

export function buildEmailContext(
  email: EmailMessage,
  allEmails: EmailMessage[],
  contact: AggregatedContact | undefined,
  notes: Record<string, Note>,
  dashboardOffers: Array<{
    id: number | string
    name: string
    dateStart?: string
    dateEnd?: string
    location?: string
    leaders?: string[]
    bookings?: Array<{ userName: string; userEmail: string; status: string }>
  }>,
  calendarEvents?: CalendarEvent[],
  options: ContextOptions = {}
): string {
  const maxLength = options.maxLength || 30000
  const parts: string[] = []
  let currentLength = 0

  const addSection = (title: string, content: string) => {
    const section = `\n## ${title}\n${content}\n`
    if (currentLength + section.length > maxLength) return false
    parts.push(section)
    currentLength += section.length
    return true
  }

  // 1. Email content (highest priority)
  const emailContent = [
    `**Von:** ${email.from.name} <${email.from.address}>`,
    `**An:** ${email.to.map(r => `${r.name} <${r.address}>`).join(', ')}`,
    `**Betreff:** ${email.subject}`,
    `**Datum:** ${new Date(email.date).toLocaleDateString('de-DE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`,
    '',
    email.bodyText.substring(0, 3000)
  ].join('\n')
  addSection('AKTUELLE E-MAIL', emailContent)

  // 2. Analysis
  if (email.analysis) {
    const analysisContent = [
      `**Relevanz:** ${email.analysis.relevanceScore}%`,
      `**Sentiment:** ${email.analysis.sentiment}`,
      email.analysis.summary ? `**Zusammenfassung:** ${email.analysis.summary}` : '',
      email.analysis.extractedInfo?.length
        ? `**Extrahierte Infos:**\n${email.analysis.extractedInfo.map(i => `- ${i}`).join('\n')}`
        : '',
      email.analysis.categories?.length
        ? `**Kategorien:** ${email.analysis.categories.join(', ')}`
        : ''
    ].filter(Boolean).join('\n')
    addSection('ANALYSE', analysisContent)
  }

  // 3. Contact history
  if (options.includeContactHistory !== false) {
    const contactEmails = allEmails.filter(e =>
      e.id !== email.id &&
      (e.from.address === email.from.address || e.to.some(r => r.address === email.from.address))
    ).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 10)

    if (contactEmails.length > 0) {
      const historyLines = contactEmails.map(e => {
        const dir = e.sent ? 'Gesendet' : 'Empfangen'
        const summary = e.analysis?.summary ? ` — ${e.analysis.summary.substring(0, 150)}` : ''
        return `- ${dir}: "${e.subject}" (${new Date(e.date).toLocaleDateString('de-DE')})${summary}`
      })
      addSection('KONTAKT-HISTORIE', historyLines.join('\n'))
    }
  }

  // 4. Contact profile
  if (contact) {
    const profileLines = [
      `**Name:** ${contact.name}`,
      contact.aliases.length > 0 ? `**Auch bekannt als:** ${contact.aliases.join(', ')}` : '',
      `**E-Mails ausgetauscht:** ${contact.emailCount}`,
      contact.lastEmailDate ? `**Letzte E-Mail:** ${new Date(contact.lastEmailDate).toLocaleDateString('de-DE')}` : '',
      `**Quellen:** ${contact.sources.join(', ')}`
    ].filter(Boolean)

    if (contact.edooboxBookings?.length) {
      profileLines.push(`**edoobox-Buchungen:**`)
      for (const b of contact.edooboxBookings) {
        profileLines.push(`- ${b.offerName} (${b.status})`)
      }
    }
    if (contact.vaultMentions?.length) {
      profileLines.push(`**Erwaehnt in Notizen:**`)
      for (const path of contact.vaultMentions.slice(0, 5)) {
        const title = path.split('/').pop()?.replace('.md', '') || path
        profileLines.push(`- [[${title}]]`)
      }
    }
    addSection('KONTAKT-PROFIL', profileLines.join('\n'))
  }

  // 5. Relevant vault notes
  if (options.includeVaultNotes !== false) {
    const keywords = extractKeywords(
      `${email.subject} ${email.from.name} ${email.bodyText.substring(0, 500)}`,
      15
    )
    const relevantNotes = searchNotes(notes, keywords)

    if (relevantNotes.length > 0) {
      const noteLines = relevantNotes.map(note => {
        const title = note.title || note.path.split('/').pop()?.replace('.md', '') || 'Notiz'
        const content = (note.content || '').substring(0, 2000)
        return `### ${title}\n${content}`
      })
      addSection('RELEVANTE NOTIZEN', noteLines.join('\n\n'))
    }
  }

  // 6. edoobox events
  if (options.includeEdooboxEvents !== false && dashboardOffers.length > 0) {
    const emailKeywords = extractKeywords(`${email.subject} ${email.bodyText.substring(0, 300)}`, 10)
    const contactEmail = email.from.address.toLowerCase()

    const relevantOffers = dashboardOffers.filter(offer => {
      // Contact has booking in this offer
      if (offer.bookings?.some(b => b.userEmail?.toLowerCase() === contactEmail)) return true
      // Keyword match on offer name
      const offerNameLower = offer.name.toLowerCase()
      if (emailKeywords.some(kw => offerNameLower.includes(kw))) return true
      return false
    }).slice(0, 5)

    if (relevantOffers.length > 0) {
      const offerLines = relevantOffers.map(offer => {
        const lines = [`**${offer.name}**`]
        if (offer.dateStart) lines.push(`Zeitraum: ${offer.dateStart}${offer.dateEnd ? ` bis ${offer.dateEnd}` : ''}`)
        if (offer.location) lines.push(`Ort: ${offer.location}`)
        if (offer.leaders?.length) lines.push(`Leitung: ${offer.leaders.join(', ')}`)
        const contactBooking = offer.bookings?.find(b => b.userEmail?.toLowerCase() === contactEmail)
        if (contactBooking) lines.push(`Buchungsstatus Kontakt: ${contactBooking.status}`)
        return lines.join('\n')
      })
      addSection('RELEVANTE VERANSTALTUNGEN', offerLines.join('\n\n'))
    }
  }

  // 7. Tasks from vault
  if (options.includeVaultNotes !== false) {
    const taskLines: string[] = []
    for (const note of Object.values(notes)) {
      if (!note.content) continue
      const tasks = note.content.match(/- \[ \] .+/g)
      if (!tasks) continue
      for (const task of tasks.slice(0, 5)) {
        const keywords = extractKeywords(`${email.subject} ${email.from.name}`, 5)
        const taskLower = task.toLowerCase()
        if (keywords.some(kw => taskLower.includes(kw))) {
          const noteTitle = note.title || note.path.split('/').pop()?.replace('.md', '') || ''
          taskLines.push(`${task} (aus: ${noteTitle})`)
        }
      }
    }
    if (taskLines.length > 0) {
      addSection('OFFENE AUFGABEN (RELEVANT)', taskLines.slice(0, 10).join('\n'))
    }
  }

  // 8. Calendar events — only dates mentioned in the email + surrounding days
  if (calendarEvents && calendarEvents.length > 0) {
    // Extract dates mentioned in email (YYYY-MM-DD, DD.MM.YYYY, DD.MM.)
    const emailText = `${email.subject} ${email.bodyText}`
    const dateMatches = new Set<string>()

    // Match DD.MM.YYYY or DD.MM.YY
    for (const m of emailText.matchAll(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})/g)) {
      const year = m[3].length === 2 ? `20${m[3]}` : m[3]
      dateMatches.add(`${year}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`)
    }
    // Match YYYY-MM-DD
    for (const m of emailText.matchAll(/(\d{4})-(\d{2})-(\d{2})/g)) {
      dateMatches.add(`${m[1]}-${m[2]}-${m[3]}`)
    }

    // Filter events: those on mentioned dates (+/- 1 day) + next 7 days for general context
    const mentionedDates = Array.from(dateMatches)
    const now = new Date()
    const weekFromNow = new Date(now)
    weekFromNow.setDate(weekFromNow.getDate() + 7)

    const relevantEvents = calendarEvents.filter(evt => {
      const evtDate = evt.startDate.split(' ')[0] // "YYYY-MM-DD"
      // Event is within next 7 days (general availability)
      if (evtDate >= now.toISOString().split('T')[0] && evtDate <= weekFromNow.toISOString().split('T')[0]) return true
      // Event is on/near a date mentioned in the email
      for (const md of mentionedDates) {
        const mentioned = new Date(md)
        const dayBefore = new Date(mentioned); dayBefore.setDate(dayBefore.getDate() - 1)
        const dayAfter = new Date(mentioned); dayAfter.setDate(dayAfter.getDate() + 1)
        if (evtDate >= dayBefore.toISOString().split('T')[0] && evtDate <= dayAfter.toISOString().split('T')[0]) return true
      }
      return false
    })

    if (relevantEvents.length > 0) {
      const calLines = relevantEvents.slice(0, 20).map(evt => {
        const start = evt.startDate
        const end = evt.endDate
        const loc = evt.location ? ` (${evt.location})` : ''
        const cal = evt.calendar ? ` [${evt.calendar}]` : ''
        if (evt.allDay) {
          return `- **${evt.title}** — ganztaegig ${start.split(' ')[0]}${loc}${cal}`
        }
        return `- **${evt.title}** — ${start} bis ${end}${loc}${cal}`
      })
      const datesInfo = mentionedDates.length > 0
        ? `\nIn der E-Mail genannte Termine: ${mentionedDates.join(', ')}`
        : ''
      addSection('MEINE KALENDER-TERMINE — Pruefe ob Konflikte mit den genannten Terminen bestehen!', datesInfo + '\n' + calLines.join('\n'))
    }
  }

  return parts.join('')
}
