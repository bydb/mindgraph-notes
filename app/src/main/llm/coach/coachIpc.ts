// IPC-Glue für den Coach. Registriert drei Handler:
//   coach:precheck — gibt verfügbares Backend zurück (oder 'none')
//   coach:start    — liefert Begrüßungsfrage
//   coach:respond  — User-Turn → {text, actions, backend, warnings}
//
// Wird einmalig aus app/src/main/index.ts beim Main-Boot registriert.

import { ipcMain } from 'electron'
import { coachPrecheck, coachStart, coachTurn, coachAsk } from './coachOrchestrator'
import type { ChatMessage } from '../chatClient'
import type { Language } from './coachPrompt'

interface CoachRespondPayload {
  userText: string
  history: ChatMessage[]
  vaultReady: boolean
  acceptedActionIds: string[]
  acceptedActionTypes: string[]
  language: Language
}

let registered = false

export function registerCoachIpc(): void {
  if (registered) return
  registered = true

  ipcMain.handle('coach:precheck', async () => {
    return await coachPrecheck()
  })

  ipcMain.handle('coach:start', async (_event, args: { language: Language; isRestart?: boolean }) => {
    const language: Language = args?.language === 'en' ? 'en' : 'de'
    return await coachStart(language, !!args?.isRestart)
  })

  ipcMain.handle('coach:ask', async (_event, args: {
    question: string
    history: ChatMessage[]
    language: Language
  }) => {
    try {
      const result = await coachAsk({
        question: args.question,
        history: args.history ?? [],
        language: args?.language === 'en' ? 'en' : 'de'
      })
      return { ok: true as const, text: result.text, backend: result.backend }
    } catch (err) {
      console.error('[coach:ask] failed:', err)
      return {
        ok: false as const,
        error: err instanceof Error ? err.message : String(err)
      }
    }
  })

  ipcMain.handle('coach:respond', async (_event, payload: CoachRespondPayload) => {
    try {
      const result = await coachTurn({
        userText: payload.userText,
        history: payload.history ?? [],
        vaultReady: !!payload.vaultReady,
        acceptedActionIds: payload.acceptedActionIds ?? [],
        acceptedActionTypes: payload.acceptedActionTypes ?? [],
        language: payload.language === 'en' ? 'en' : 'de'
      })
      return {
        ok: true as const,
        text: result.text,
        actions: result.actions,
        backend: result.backend,
        warnings: result.parseWarnings
      }
    } catch (err) {
      console.error('[coach:respond] failed:', err)
      return {
        ok: false as const,
        error: err instanceof Error ? err.message : String(err)
      }
    }
  })
}
