// Morning-Briefing-Generator für den Telegram-Bot.
// Sammelt heute fällige Tasks + Überfällige + (optional) ungelesene Emails
// und lässt das LLM eine kurze Zusammenfassung erstellen.

import { chat, type ChatBackend } from '../llm/chatClient'
import { tasksDueToday, tasksOverdue, eventsForRange, type VaultTaskHit } from './vaultQueries'
import { promises as fs } from 'fs'
import path from 'path'

export interface BriefingContext {
  vaultPath: string
  excludedFolders?: string[]
  backend: ChatBackend
  anthropicApiKey?: string
  anthropicModel?: string
  ollamaModel?: string
  includeEmails?: boolean
  includeOverdue?: boolean
  includeCalendar?: boolean
}

export interface EmailSummary {
  from: string
  subject: string
  summary: string
  needsReply: boolean
  urgency?: string
}

async function loadRelevantEmails(vaultPath: string, limit = 5): Promise<EmailSummary[]> {
  try {
    const emailFile = path.join(vaultPath, '.mindgraph', 'emails.json')
    const raw = await fs.readFile(emailFile, 'utf-8')
    const data = JSON.parse(raw) as {
      emails?: Array<{
        from?: string
        subject?: string
        analysis?: { summary?: string; needsReply?: boolean; replyUrgency?: string; relevance?: number }
        sent?: boolean
      }>
    }
    const emails = (data.emails ?? [])
      .filter(e => !e.sent && e.analysis && (e.analysis.relevance ?? 0) >= 60)
      .sort((a, b) => (b.analysis?.relevance ?? 0) - (a.analysis?.relevance ?? 0))
      .slice(0, limit)

    return emails.map(e => ({
      from: e.from ?? 'unbekannt',
      subject: e.subject ?? '(kein Betreff)',
      summary: e.analysis?.summary ?? '',
      needsReply: e.analysis?.needsReply ?? false,
      urgency: e.analysis?.replyUrgency
    }))
  } catch {
    return []
  }
}

function tasksToPromptLines(hits: VaultTaskHit[]): string {
  return hits.map(h => {
    const t = h.task
    let when = ''
    if (t.dueDate) {
      const hh = String(t.dueDate.getHours()).padStart(2, '0')
      const mm = String(t.dueDate.getMinutes()).padStart(2, '0')
      if (hh !== '00' || mm !== '00') when = ` um ${hh}:${mm}`
    }
    return `- ${t.text}${when} (in "${h.noteTitle}")`
  }).join('\n')
}

export async function generateBriefing(ctx: BriefingContext): Promise<string> {
  const [today, overdue, emails, agenda] = await Promise.all([
    tasksDueToday({ vaultPath: ctx.vaultPath, excludedFolders: ctx.excludedFolders }),
    ctx.includeOverdue !== false
      ? tasksOverdue({ vaultPath: ctx.vaultPath, excludedFolders: ctx.excludedFolders })
      : Promise.resolve([] as VaultTaskHit[]),
    ctx.includeEmails !== false
      ? loadRelevantEmails(ctx.vaultPath)
      : Promise.resolve([] as EmailSummary[]),
    ctx.includeCalendar !== false
      ? eventsForRange(1) // heute + morgen
      : Promise.resolve({ events: [] as Array<{ title: string; startDate: string; endDate: string; location?: string; allDay: boolean }> })
  ])

  const now = new Date()
  const weekday = now.toLocaleDateString('de-DE', { weekday: 'long' })
  const dateStr = now.toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' })

  const promptSections: string[] = []
  promptSections.push(`Heute ist ${weekday}, der ${dateStr}.`)

  if (agenda.events.length > 0) {
    const todayYmd = now.toISOString().slice(0, 10)
    const tomorrowYmd = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const todayEvents = agenda.events.filter(e => e.startDate.startsWith(todayYmd))
    const tomorrowEvents = agenda.events.filter(e => e.startDate.startsWith(tomorrowYmd))
    const formatEv = (e: { title: string; startDate: string; endDate: string; location?: string; allDay: boolean }) => {
      const time = e.allDay ? 'ganztägig' : `${e.startDate.slice(11, 16)}-${e.endDate.slice(11, 16)}`
      const loc = e.location ? ` @ ${e.location}` : ''
      return `- ${time}: ${e.title}${loc}`
    }
    if (todayEvents.length > 0) {
      promptSections.push(`\nKalender-Termine heute (${todayEvents.length}):\n${todayEvents.map(formatEv).join('\n')}`)
    }
    if (tomorrowEvents.length > 0) {
      promptSections.push(`\nKalender-Termine morgen (${tomorrowEvents.length}):\n${tomorrowEvents.map(formatEv).join('\n')}`)
    }
  }

  if (today.length > 0) {
    promptSections.push(`\nHeute fällige Tasks (${today.length}):\n${tasksToPromptLines(today)}`)
  } else {
    promptSections.push('\nHeute stehen keine fälligen Tasks an.')
  }

  if (overdue.length > 0) {
    promptSections.push(`\nÜberfällige Tasks (${overdue.length}):\n${tasksToPromptLines(overdue.slice(0, 10))}`)
  }

  if (emails.length > 0) {
    const emailBlock = emails.map(e => {
      const reply = e.needsReply ? ` [Antwort erwartet${e.urgency ? ', ' + e.urgency : ''}]` : ''
      return `- ${e.from}: "${e.subject}"${reply}\n  ${e.summary}`
    }).join('\n')
    promptSections.push(`\nRelevante ungelesene Emails (${emails.length}):\n${emailBlock}`)
  }

  const systemPrompt = `Du bist Jochens persönlicher Assistent. Erstelle ein kompaktes Morning-Briefing auf Deutsch.

REGELN:
- Maximal 200 Wörter insgesamt
- Struktur: kurze Begrüßung → wichtigste 3-5 Punkte heute → optional ein motivierender Satz am Ende
- Nutze Emojis sparsam (max 3-4)
- Priorisiere: Überfällige > Termingebundene Tasks > Emails mit Antwortpflicht
- Keine Markdown-Überschriften (#, ##), nur fette Schrift via *Stern* für Telegram
- Kein Gendern (keine Sternchen oder Doppelpunkte bei Personenbezeichnungen)`

  const userPrompt = promptSections.join('\n')

  const result = await chat(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    {
      backend: ctx.backend,
      anthropicApiKey: ctx.anthropicApiKey,
      anthropicModel: ctx.anthropicModel,
      ollamaModel: ctx.ollamaModel,
      maxTokens: 600
    }
  )

  return result.text.trim()
}
