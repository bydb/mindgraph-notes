// Command-Handler für den Telegram-Bot.
// Delegiert an vaultQueries / briefing / chatClient / agent.

import type { Context, InlineKeyboard } from 'grammy'
import { promises as fs } from 'fs'
import path from 'path'
import { tasksDueToday, tasksOverdue, tasksThisWeek, searchVault, formatTaskList, eventsForRange, formatEventList, loadPriorityNotes, formatPriorityNoteList } from './vaultQueries'
import { generateBriefing } from './briefing'
import { chat, type ChatBackend } from '../llm/chatClient'
import { runAgent } from './agent/loop'
import { ToolRegistry } from './agent/tools/registry'
import { noteSearchTool, noteReadTool, noteCreateTool, noteAppendTool } from './agent/tools/notes'
import { taskListTool, taskToggleTool } from './agent/tools/tasks'
import { calendarListTool } from './agent/tools/calendar'
import { registerPending } from './agent/confirm'

const DEFAULT_AGENT_INBOX_FOLDER = '000 - 📥 inbox/010 - 📥 Notes'

export interface CommandDeps {
  vaultPath: () => string | null
  excludedFolders: () => string[]
  backend: () => ChatBackend
  anthropicApiKey: () => string | null
  anthropicModel: () => string
  ollamaModel: () => string
  includeEmails: () => boolean
  includeOverdue: () => boolean
  priorityFolders: () => string[]
  agentEnabled: () => boolean
  agentMaxIterations: () => number
  agentInboxFolder: () => string
  agentAllowedTools: () => string[]
  agentConfirmTools: () => string[]
  /** Wird vom Bot bereitgestellt — baut einen Inline-Keyboard mit Approve/Deny-Buttons. */
  buildConfirmKeyboard: (confirmId: string) => InlineKeyboard
}

const HELP_TEXT = `*MindGraph Bot* — Befehle:

/today — heute fällige Tasks
/overdue — überfällige Tasks
/week — Tasks der nächsten 7 Tage
/agenda — Termine heute + morgen (macOS-Kalender)
/inbox — neueste Notizen aus priorisierten Ordnern
/briefing — kompaktes Morning-Briefing
/ask <frage> — Frage zum Vault stellen
/agent <auftrag> — Agent kann lesen + (mit Bestätigung) schreiben
/help — diese Hilfe

_Alle Daten bleiben lokal auf deinem Rechner._`

// Singleton-Registry — alle Tools einmalig registrieren.
const toolRegistry = new ToolRegistry()
toolRegistry.register(noteSearchTool)
toolRegistry.register(noteReadTool)
toolRegistry.register(noteCreateTool)
toolRegistry.register(noteAppendTool)
toolRegistry.register(taskListTool)
toolRegistry.register(taskToggleTool)
toolRegistry.register(calendarListTool)

export function getToolRegistry(): ToolRegistry {
  return toolRegistry
}

async function resolveAgentInboxFolder(vault: string, configuredFolder: string): Promise<string> {
  const folder = configuredFolder.trim().replace(/^[/\\]+|[/\\]+$/g, '')
  if (folder) return folder
  try {
    const stat = await fs.stat(path.join(vault, DEFAULT_AGENT_INBOX_FOLDER))
    if (stat.isDirectory()) return DEFAULT_AGENT_INBOX_FOLDER
  } catch {
    // Kein Standard-Inbox-Ordner vorhanden: leer bedeutet Vault-Root.
  }
  return ''
}

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

export async function handleInbox(ctx: Context, deps: CommandDeps): Promise<void> {
  const vault = await requireVault(ctx, deps)
  if (!vault) return
  const folders = deps.priorityFolders()
  if (folders.length === 0) {
    await ctx.reply('⚙️ Keine priorisierten Ordner konfiguriert.\n\nIn MindGraph → Einstellungen → Telegram → _Priorisierte Ordner_ einen Pfad eintragen (z. B. `000 - 📥 inbox/010 - 📥 Notes`).', { parse_mode: 'Markdown' })
    return
  }
  await ctx.replyWithChatAction('typing')
  const notes = await loadPriorityNotes({ vaultPath: vault, folders, maxNotes: 10 })
  const header = notes.length === 0 ? '📭 Keine Notizen in den priorisierten Ordnern.' : `📥 *Aktuelle Notizen* (${notes.length}):\n\n`
  await ctx.reply(header + formatPriorityNoteList(notes), { parse_mode: 'Markdown' })
}

export async function handleAgenda(ctx: Context, _deps: CommandDeps): Promise<void> {
  await ctx.replyWithChatAction('typing')
  const window = await eventsForRange(1) // heute + morgen
  if (window.needsPermission) {
    await ctx.reply('⛔ Kalender-Zugriff fehlt. Bitte in MindGraph → Dashboard → Kalender-Widget → „Zugriff erteilen" klicken und bestätigen.')
    return
  }
  if (window.error) {
    await ctx.reply(`❌ Kalender-Fehler: ${window.error}`)
    return
  }
  const header = window.events.length === 0 ? '📆 Keine Termine heute oder morgen.' : `📆 *Termine* (${window.events.length}):\n\n`
  await ctx.reply(header + formatEventList(window.events, { showDayHeader: true }), { parse_mode: 'Markdown' })
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
    await safeReplyMarkdown(ctx, briefing || '_Kein Briefing erstellbar._')
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
    const priorityFolders = deps.priorityFolders()
    const [notesHits, todayHits, overdueHits, agenda, priorityNotes] = await Promise.all([
      searchVault({ vaultPath: vault, query: question, maxResults: 4, maxChars: 6000 }),
      tasksDueToday({ vaultPath: vault, excludedFolders: deps.excludedFolders() }),
      tasksOverdue({ vaultPath: vault, excludedFolders: deps.excludedFolders() }),
      eventsForRange(7),
      priorityFolders.length > 0
        ? loadPriorityNotes({ vaultPath: vault, folders: priorityFolders, maxNotes: 8, maxCharsPerNote: 800 })
        : Promise.resolve([])
    ])

    const contextParts: string[] = []
    if (priorityNotes.length > 0) {
      const block = priorityNotes.map(n => `### ${n.relativePath}\n${n.excerpt}`).join('\n\n')
      contextParts.push('PRIORISIERTE NOTIZEN (z. B. Inbox — immer einbezogen):\n' + block)
    }
    if (agenda.events.length > 0) {
      contextParts.push('KALENDER-TERMINE (heute + 7 Tage):\n' + agenda.events.slice(0, 15).map(e => {
        const time = e.allDay ? 'ganztägig' : `${e.startDate.slice(11, 16)}`
        const loc = e.location ? ` @ ${e.location}` : ''
        return `- ${e.startDate.slice(0, 10)} ${time}: ${e.title}${loc}`
      }).join('\n'))
    }
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
    await safeReplyMarkdown(ctx, `${reply}\n\n_via ${result.backend}_`)
  } catch (err) {
    console.error('[Telegram] /ask failed:', err)
    await ctx.reply(`❌ Frage fehlgeschlagen: ${err instanceof Error ? err.message : 'unbekannt'}`)
  }
}

export async function handleAgent(ctx: Context, deps: CommandDeps, instruction: string): Promise<void> {
  if (!deps.agentEnabled()) {
    await ctx.reply('🤖 Agent-Modus ist deaktiviert. In MindGraph → Einstellungen → Telegram → _Agent-Modus aktivieren_ einschalten.', { parse_mode: 'Markdown' })
    return
  }
  const vault = await requireVault(ctx, deps)
  if (!vault) return
  if (!instruction.trim()) {
    await ctx.reply('Nach `/agent` bitte einen Auftrag schreiben, z. B.:\n`/agent leg eine Notiz „Idee — Foo Bar" mit drei Punkten an`', { parse_mode: 'Markdown' })
    return
  }

  await ctx.replyWithChatAction('typing')

  const allowedTools = new Set(deps.agentAllowedTools())
  const confirmTools = new Set(deps.agentConfirmTools())
  if (allowedTools.size === 0) {
    await ctx.reply('🤖 Keine Tools für den Agenten freigegeben. In den Telegram-Settings unter _Agent-Tools_ mindestens eines aktivieren.', { parse_mode: 'Markdown' })
    return
  }

  try {
    const result = await runAgent(instruction, {
      registry: toolRegistry,
      toolContext: {
        vaultPath: vault,
        excludedFolders: deps.excludedFolders(),
        inboxFolder: await resolveAgentInboxFolder(vault, deps.agentInboxFolder())
      },
      allowedTools,
      confirmRequiredTools: confirmTools,
      maxIterations: Math.max(1, Math.min(15, deps.agentMaxIterations())),
      chatOptions: {
        backend: deps.backend(),
        anthropicApiKey: deps.anthropicApiKey() ?? undefined,
        anthropicModel: deps.anthropicModel(),
        ollamaModel: deps.ollamaModel(),
        maxTokens: 1500
      },
      onProgress: async (message) => {
        await safeReplyMarkdown(ctx, message)
      },
      requestConfirm: async (toolName, args) => {
        const { id, promise } = registerPending(300_000)
        console.log(`[Telegram] requestConfirm: tool=${toolName} id=${id}`)
        const argsBlock = formatArgsForConfirm(args)
        const text = `⚠️ *Bestätigung erforderlich*\n\nTool: \`${toolName}\`\n\n${argsBlock}\n\nAusführen?`
        try {
          await ctx.reply(text, {
            parse_mode: 'Markdown',
            reply_markup: deps.buildConfirmKeyboard(id)
          })
        } catch {
          await ctx.reply(`Bestätigung erforderlich: Tool ${toolName}. ${argsBlock}`, {
            reply_markup: deps.buildConfirmKeyboard(id)
          })
        }
        const decision = await promise
        console.log(`[Telegram] requestConfirm result: tool=${toolName} id=${id} decision=${decision}`)
        if (decision === 'timeout') {
          await ctx.reply('⏰ Keine Antwort innerhalb von 5 Min — abgelehnt.')
        }
        return decision === 'approve'
      }
    })

    const footer = []
    footer.push(`_${result.iterations} Iterationen · ${result.toolCallsExecuted} Tools ausgeführt_`)
    if (result.toolCallsDenied > 0) footer.push(`_${result.toolCallsDenied} abgelehnt_`)
    if (result.hitMaxIterations) footer.push(`_⚠️ Iterations-Limit erreicht_`)
    footer.push(`_via ${result.backend}_`)

    const reply = (result.text.trim() || '_Keine Antwort._') + '\n\n' + footer.join(' · ')
    await safeReplyMarkdown(ctx, reply)
  } catch (err) {
    console.error('[Telegram] /agent failed:', err)
    await ctx.reply(`❌ Agent fehlgeschlagen: ${err instanceof Error ? err.message : 'unbekannt'}`)
  }
}

/**
 * Sendet eine Nachricht erst mit Markdown-Parsing, fällt bei Telegram-Parse-Fehlern
 * automatisch auf Plain-Text zurück. LLM-generierte Outputs enthalten oft
 * unbalancierte Sonderzeichen (`*`, `_`, `` ` ``, `[`), die Telegram strikt ablehnt.
 */
async function safeReplyMarkdown(ctx: Context, text: string): Promise<void> {
  try {
    await ctx.reply(text, { parse_mode: 'Markdown' })
  } catch (err) {
    const msg = err instanceof Error ? err.message : ''
    // Nur bei klassischen Markdown-Parse-Fehlern auf Plain zurückfallen,
    // andere Fehler (z. B. Network) durchreichen.
    if (msg.includes("can't parse entities") || msg.includes('Bad Request: can\'t parse')) {
      const stripped = text
        .replace(/```[\s\S]*?```/g, (m) => m.replace(/`/g, ''))     // code-blocks entschärfen
        .replace(/`([^`]*)`/g, '$1')
        .replace(/\*([^*]*)\*/g, '$1')
        .replace(/_([^_]*)_/g, '$1')
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      await ctx.reply(stripped)
    } else {
      throw err
    }
  }
}

function formatArgsForConfirm(args: Record<string, unknown>): string {
  const lines: string[] = []
  for (const [key, value] of Object.entries(args)) {
    let display: string
    if (typeof value === 'string') {
      display = value.length > 200 ? value.slice(0, 200) + '…' : value
    } else {
      const json = JSON.stringify(value)
      display = json.length > 200 ? json.slice(0, 200) + '…' : json
    }
    lines.push(`*${key}*: ${display}`)
  }
  return lines.join('\n')
}
