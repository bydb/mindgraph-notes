// Telegram-Bot-Lifecycle im Electron-Main-Prozess.
// Dynamischer Import von grammy, damit die Electron-App beim Start nicht
// unnötig lädt, wenn der Bot deaktiviert ist.

import { handleStart, handleHelp, handleToday, handleOverdue, handleWeek, handleBriefing, handleAsk, handleAgenda, handleInbox, handleAgent, type CommandDeps } from './commands'
import { resolvePending, clearAllPending } from './agent/confirm'

export interface BotConfig {
  token: string
  getAllowedChatIds: () => string[]   // Live-Lookup — Updates greifen ohne Bot-Neustart
  // Deps ohne buildConfirmKeyboard — der Bot füllt das selbst, weil er den
  // grammy-InlineKeyboard-Konstruktor besitzt.
  deps: Omit<CommandDeps, 'buildConfirmKeyboard'>
}

export interface BotHandle {
  stop: () => Promise<void>
}

export async function startTelegramBot(config: BotConfig): Promise<BotHandle> {
  const { Bot, InlineKeyboard } = await import('grammy')
  const bot = new Bot(config.token)

  const buildConfirmKeyboard = (confirmId: string) =>
    new InlineKeyboard()
      .text('✅ Erlauben', `cf:approve:${confirmId}`)
      .text('❌ Abbrechen', `cf:deny:${confirmId}`)

  const fullDeps: CommandDeps = {
    ...config.deps,
    buildConfirmKeyboard
  }

  // Whitelist-Gate: nur Chat-IDs aus dem Live-Getter dürfen reden.
  bot.use(async (ctx, next) => {
    const chatId = ctx.chat?.id
    if (chatId === undefined) return
    const chatIdStr = String(chatId)
    const allowed = config.getAllowedChatIds()
    if (allowed.length === 0) {
      // Discovery-Mode: noch niemand freigeschaltet — User die eigene Chat-ID anzeigen
      console.log(`[Telegram] Discovery-Mode: chat id ${chatIdStr} angefragt`)
      await ctx.reply(
        `🔑 *Deine Chat-ID:* \`${chatIdStr}\`\n\nTrage diese Zahl in MindGraph unter *Einstellungen → Telegram → Freigeschaltete Chat-IDs* ein und starte den Bot neu.`,
        { parse_mode: 'Markdown' }
      )
      return
    }
    if (!allowed.includes(chatIdStr)) {
      console.warn(`[Telegram] Rejected chat id ${chatIdStr} (not in whitelist)`)
      await ctx.reply(
        `⛔ Chat-ID \`${chatIdStr}\` ist nicht autorisiert. In MindGraph unter Einstellungen → Telegram freischalten.`,
        { parse_mode: 'Markdown' }
      )
      return
    }
    await next()
  })

  bot.command('start', async (ctx) => handleStart(ctx))
  bot.command('help', async (ctx) => handleHelp(ctx))
  bot.command('today', async (ctx) => handleToday(ctx, fullDeps))
  bot.command('todos', async (ctx) => handleToday(ctx, fullDeps))
  bot.command('overdue', async (ctx) => handleOverdue(ctx, fullDeps))
  bot.command('week', async (ctx) => handleWeek(ctx, fullDeps))
  bot.command('agenda', async (ctx) => handleAgenda(ctx, fullDeps))
  bot.command('inbox', async (ctx) => handleInbox(ctx, fullDeps))
  bot.command('briefing', async (ctx) => handleBriefing(ctx, fullDeps))
  bot.command('ask', async (ctx) => handleAsk(ctx, fullDeps, ctx.match ?? ''))
  bot.command('agent', (ctx) => {
    void handleAgent(ctx, fullDeps, ctx.match ?? '').catch((err) => {
      console.error('[Telegram] /agent background failed:', err)
    })
  })

  // Confirm-Callbacks vom Agent-Loop verarbeiten.
  // Format: cf:approve:<id> oder cf:deny:<id>
  bot.callbackQuery(/^cf:(approve|deny):(.+)$/, async (ctx) => {
    const decision = ctx.match[1] as 'approve' | 'deny'
    const id = ctx.match[2]
    const ok = resolvePending(id, decision)
    console.log(`[Telegram] callback_query: decision=${decision} id=${id} resolved=${ok}`)
    try {
      await ctx.answerCallbackQuery({
        text: ok
          ? (decision === 'approve' ? '✅ Erlaubt' : '❌ Abgelehnt')
          : '⌛ Anfrage abgelaufen',
        show_alert: false
      })
    } catch (err) {
      console.warn('[Telegram] answerCallbackQuery failed:', err)
    }
    // Buttons aus der ursprünglichen Nachricht entfernen, damit man nicht
    // versehentlich nochmal klickt.
    try {
      await ctx.editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } })
    } catch (err) {
      console.warn('[Telegram] editMessageReplyMarkup failed:', err)
    }
  })

  // Freier Text (keine Command):
  // - Agent-Modus AN  → /agent (kann Tools nutzen, Schreib-Tools fragen via Confirm)
  // - Agent-Modus AUS → /ask (read-only Frage mit Vault-Kontext)
  bot.on('message:text', async (ctx) => {
    const text = ctx.message.text
    if (text.startsWith('/')) return // Commands werden oben verarbeitet
    if (config.deps.agentEnabled()) {
      void handleAgent(ctx, fullDeps, text).catch((err) => {
        console.error('[Telegram] text-agent background failed:', err)
      })
    } else {
      await handleAsk(ctx, fullDeps, text)
    }
  })

  bot.catch((err) => {
    console.error('[Telegram] bot error:', err)
  })

  // Long-polling start (nicht await — läuft im Hintergrund)
  bot.start({
    onStart: (me) => {
      console.log(`[Telegram] Bot gestartet: @${me.username}`)
    }
  }).catch((err) => {
    console.error('[Telegram] Bot-Start fehlgeschlagen:', err)
  })

  return {
    stop: async () => {
      try {
        clearAllPending()
        await bot.stop()
        console.log('[Telegram] Bot gestoppt')
      } catch (err) {
        console.error('[Telegram] Stop-Fehler:', err)
      }
    }
  }
}
