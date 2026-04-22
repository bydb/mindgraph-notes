// Telegram-Bot-Lifecycle im Electron-Main-Prozess.
// Dynamischer Import von grammy, damit die Electron-App beim Start nicht
// unnötig lädt, wenn der Bot deaktiviert ist.

import { handleStart, handleHelp, handleToday, handleOverdue, handleWeek, handleBriefing, handleAsk, handleAgenda, type CommandDeps } from './commands'

export interface BotConfig {
  token: string
  getAllowedChatIds: () => string[]   // Live-Lookup — Updates greifen ohne Bot-Neustart
  deps: CommandDeps
}

export interface BotHandle {
  stop: () => Promise<void>
}

export async function startTelegramBot(config: BotConfig): Promise<BotHandle> {
  const { Bot } = await import('grammy')
  const bot = new Bot(config.token)

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
  bot.command('today', async (ctx) => handleToday(ctx, config.deps))
  bot.command('todos', async (ctx) => handleToday(ctx, config.deps))
  bot.command('overdue', async (ctx) => handleOverdue(ctx, config.deps))
  bot.command('week', async (ctx) => handleWeek(ctx, config.deps))
  bot.command('agenda', async (ctx) => handleAgenda(ctx, config.deps))
  bot.command('briefing', async (ctx) => handleBriefing(ctx, config.deps))
  bot.command('ask', async (ctx) => handleAsk(ctx, config.deps, ctx.match ?? ''))

  // Freier Text (keine Command) → als /ask behandeln
  bot.on('message:text', async (ctx) => {
    const text = ctx.message.text
    if (text.startsWith('/')) return // Commands werden oben verarbeitet
    await handleAsk(ctx, config.deps, text)
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
        await bot.stop()
        console.log('[Telegram] Bot gestoppt')
      } catch (err) {
        console.error('[Telegram] Stop-Fehler:', err)
      }
    }
  }
}
