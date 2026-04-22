// Command-Handler für den Telegram-Bot.
// Delegiert an vaultQueries / briefing / chatClient.

import type { Context } from 'grammy'
import { tasksDueToday, tasksOverdue, tasksThisWeek, searchVault, formatTaskList } from './vaultQueries'
import { generateBriefing } from './briefing'
import { chat, type ChatBackend } from '../llm/chatClient'

export interface CommandDeps {
  vaultPath: () => string | null
  excludedFolders: () => string[]
  backend: () => ChatBackend
  anthropicApiKey: () => string | null
  anthropicModel: () => string
  ollamaModel: () => string
  includeEmails: () => boolean
  includeOverdue: () => boolean
}

const HELP_TEXT = `*MindGraph Bot* — Befehle:

/today — heute fällige Tasks
/overdue — überfällige Tasks
/week — Tasks der nächsten 7 Tage
/briefing — kompaktes Morning-Briefing
/ask <frage> — Frage zum Vault stellen
/help — diese Hilfe

_Alle Daten bleiben lokal auf deinem Rechner._`

async function requireVault(ctx: Context, deps: CommandDeps): Promise<string | null> {
  const vault = deps.vaultPath()
  if (!vault) {
    await ctx.reply('Kein Vault geladen. Öffne zuerst MindGraph Notes und lade einen Vault.')
    return null
  }
  return vault
}

export async function handleStart(ctx: Context): Promise<void> {
  await ctx.reply(`👋 Hi! Ich bin dein MindGraph-Bot.\n\n${HELP_TEXT}`, { parse_mode: 'Markdown' })
}

export async function handleHelp(ctx: Context): Promise<void> {
  await ctx.reply(HELP_TEXT, { parse_mode: 'Markdown' })
}

export async function handleToday(ctx: Context, deps: CommandDeps): Promise<void> {
  const vault = await requireVault(ctx, deps)
  if (!vault) return
  await ctx.replyWithChatAction('typing')
  const hits = await tasksDueToday({ vaultPath: vault, excludedFolders: deps.excludedFolders() })
  const header = hits.length === 0 ? '✅ Heute keine fälligen Tasks.' : `📋 *Heute fällig* (${hits.length}):\n\n`
  await ctx.reply(header + formatTaskList(hits, { showTime: true }), { parse_mode: 'Markdown' })
}

export async function handleOverdue(ctx: Context, deps: CommandDeps): Promise<void> {
  const vault = await requireVault(ctx, deps)
  if (!vault) return
  await ctx.replyWithChatAction('typing')
  const hits = await tasksOverdue({ vaultPath: vault, excludedFolders: deps.excludedFolders() })
  const capped = hits.slice(0, 20)
  const more = hits.length > capped.length ? `\n\n_… und ${hits.length - capped.length} weitere._` : ''
  const header = hits.length === 0 ? '✅ Nichts überfällig.' : `⚠️ *Überfällig* (${hits.length}):\n\n`
  await ctx.reply(header + formatTaskList(capped) + more, { parse_mode: 'Markdown' })
}

export async function handleWeek(ctx: Context, deps: CommandDeps): Promise<void> {
  const vault = await requireVault(ctx, deps)
  if (!vault) return
  await ctx.replyWithChatAction('typing')
  const hits = await tasksThisWeek({ vaultPath: vault, excludedFolders: deps.excludedFolders() })
  const header = hits.length === 0 ? '✅ Keine Tasks in den nächsten 7 Tagen.' : `📅 *Nächste 7 Tage* (${hits.length}):\n\n`
  await ctx.reply(header + formatTaskList(hits, { showTime: true }), { parse_mode: 'Markdown' })
}

export async function handleBriefing(ctx: Context, deps: CommandDeps): Promise<void> {
  const vault = await requireVault(ctx, deps)
  if (!vault) return
  await ctx.replyWithChatAction('typing')
  try {
    const briefing = await generateBriefing({
      vaultPath: vault,
      excludedFolders: deps.excludedFolders(),
      backend: deps.backend(),
      anthropicApiKey: deps.anthropicApiKey() ?? undefined,
      anthropicModel: deps.anthropicModel(),
      ollamaModel: deps.ollamaModel(),
      includeEmails: deps.includeEmails(),
      includeOverdue: deps.includeOverdue()
    })
    await ctx.reply(briefing || '_Kein Briefing erstellbar._', { parse_mode: 'Markdown' })
  } catch (err) {
    console.error('[Telegram] briefing failed:', err)
    await ctx.reply(`❌ Briefing fehlgeschlagen: ${err instanceof Error ? err.message : 'unbekannt'}`)
  }
}

export async function handleAsk(ctx: Context, deps: CommandDeps, question: string): Promise<void> {
  const vault = await requireVault(ctx, deps)
  if (!vault) return
  if (!question.trim()) {
    await ctx.reply('Nach `/ask` bitte die Frage schreiben, z. B.:\n`/ask was steht nächste Woche Mittwoch an?`', {
      parse_mode: 'Markdown'
    })
    return
  }
  await ctx.replyWithChatAction('typing')
  try {
    const [notesHits, todayHits, overdueHits] = await Promise.all([
      searchVault({ vaultPath: vault, query: question, maxResults: 4, maxChars: 6000 }),
      tasksDueToday({ vaultPath: vault, excludedFolders: deps.excludedFolders() }),
      tasksOverdue({ vaultPath: vault, excludedFolders: deps.excludedFolders() })
    ])

    const contextParts: string[] = []
    if (todayHits.length > 0) {
      contextParts.push('HEUTE FÄLLIGE TASKS:\n' + todayHits.slice(0, 10).map(h => `- ${h.task.text} (in "${h.noteTitle}")`).join('\n'))
    }
    if (overdueHits.length > 0) {
      contextParts.push('ÜBERFÄLLIGE TASKS:\n' + overdueHits.slice(0, 5).map(h => `- ${h.task.text} (in "${h.noteTitle}")`).join('\n'))
    }
    if (notesHits.length > 0) {
      const notesBlock = notesHits.map(n => `### ${n.notePath}\n${n.excerpt}`).join('\n\n')
      contextParts.push('RELEVANTE NOTIZ-AUSZÜGE:\n' + notesBlock)
    }

    const context = contextParts.join('\n\n') || '(kein passender Kontext gefunden)'

    const systemPrompt = `Du bist Jochens MindGraph-Assistent. Beantworte seine Fragen präzise auf Deutsch, basierend AUSSCHLIESSLICH auf dem folgenden Vault-Kontext. Wenn die Antwort nicht im Kontext steht, sag das ehrlich.

Kein Gendern. Keine langen Überschriften. Telegram-Format: kurz, konkret, max 250 Wörter. Fette Schrift via *Stern*.

VAULT-KONTEXT:
${context}`

    const result = await chat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: question }
      ],
      {
        backend: deps.backend(),
        anthropicApiKey: deps.anthropicApiKey() ?? undefined,
        anthropicModel: deps.anthropicModel(),
        ollamaModel: deps.ollamaModel(),
        maxTokens: 800
      }
    )

    const reply = result.text.trim() || '_Keine Antwort._'
    await ctx.reply(`${reply}\n\n_via ${result.backend}_`, { parse_mode: 'Markdown' })
  } catch (err) {
    console.error('[Telegram] /ask failed:', err)
    await ctx.reply(`❌ Frage fehlgeschlagen: ${err instanceof Error ? err.message : 'unbekannt'}`)
  }
}
