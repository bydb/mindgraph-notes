// Zustandsmaschine der Sprachbefehle.
//
// Absichtlich ein eigener Store und nicht ein weiterer useState in App.tsx: Aufnahme,
// Transkription, Rückfrage und Ergebnis sind EIN Ablauf mit klaren Übergängen. Verteilt
// auf lokale Zustände ließe sich nicht mehr garantieren, dass ein Abbruch das Mikrofon
// wirklich freigibt oder dass eine gesprochene „Eins" zur offenen Auswahl gehört.
//
// Die Palette rendert nur diesen Zustand und ruft die Methoden hier auf.

import { create } from 'zustand'
import { matchIntent, matchOrdinal } from '../../shared/voiceCommands/match'
import { buildFallback, type FallbackEntry } from '../../shared/voiceCommands/fallback'
import type { ActionKind, AnswerCard, AnyAction, AppActionId, ClarifyReason } from '../../shared/voiceCommands/types'
import { ACTIONS, type ActionOutcome, type TFn } from '../voice/actions'
import { getVoiceUiBridge } from '../voice/uiBridge'
import { startDictation, type DictationHandle } from '../utils/voice/stt'
import { speak, stopSpeaking } from '../utils/voice/tts'
import { useUIStore } from './uiStore'
import { useNotesStore } from './notesStore'

export const VOICE_CONTEXT_ID = 'voice-command'

export interface ClarifyOption {
  label: string
  id: AppActionId
  /** null = Absicht klar, Parameter fehlt noch. */
  action: AnyAction | null
}

export type VoiceCommandState =
  | { kind: 'idle' }
  /** Zwischen Klick und erteilter Freigabe. Eigener Zustand, weil hier noch NICHTS
   *  aufgenommen wird — „Ich höre zu" an dieser Stelle wäre schlicht gelogen. */
  | { kind: 'preparing' }
  | { kind: 'listening'; startedAt: number }
  | { kind: 'transcribing' }
  | { kind: 'clarify'; transcript: string; reason: ClarifyReason; options: ClarifyOption[]; missingParam?: string }
  | { kind: 'running'; transcript: string }
  | { kind: 'answer'; transcript: string; card: AnswerCard; actionKind: ActionKind; timings: Timings }
  | { kind: 'fallback'; transcript: string; entries: FallbackEntry[] }
  | { kind: 'error'; message: string; transcript?: string }

export interface Timings {
  sttMs?: number
  matchMs: number
  dataMs: number
}

interface VoiceCommandStore {
  state: VoiceCommandState
  /** Nur für die Anzeige der Absichtsnamen; wird beim Öffnen der Palette gesetzt. */
  submit: (raw: string, source: 'keyboard' | 'voice', t: TFn, sttMs?: number) => Promise<void>
  startListening: (t: TFn) => Promise<void>
  stopListening: (t: TFn) => Promise<void>
  chooseOption: (index: number, t: TFn) => Promise<void>
  /** Folgeaktion von der Karte aus starten. */
  runDirect: (action: AnyAction, t: TFn) => Promise<void>
  abort: (reason: 'escape' | 'blur' | 'user') => void
  reset: () => void
}

// Aufnahme-Handle und Startzeit stehen bewusst NICHT im State: sie sind nicht
// serialisierbar und dürfen kein Rendern auslösen.
let dictation: DictationHandle | null = null
let listeningStartedAt = 0
let starting = false

// Generationszähler wie im Telegram-Scheduler: jeder Abbruch erhöht ihn. Ein noch
// laufender startDictation() vergleicht nach dem await seine eigene Generation und
// gibt das Mikrofon sofort wieder frei, wenn inzwischen abgebrochen wurde. Ohne das
// startete die Aufnahme NACH dem Schließen der Palette weiter — unsichtbar, weil der
// Zustand längst auf idle stand.
let generation = 0

// Offene Auswahl, die eine gesprochene Antwort ("Eins") noch beantworten können muss.
// Der Zustand selbst wird beim Aufnehmen durch `preparing` überschrieben; ohne diese
// Zwischenablage hätte die Ordnungszahl nach dem Sprechen keinen Bezugspunkt mehr.
let pendingClarify: Extract<VoiceCommandState, { kind: 'clarify' }> | null = null

// Letzte ausführliche Fehlermeldung aus der Aufnahmeschicht (z. B. "Kein Ton erkannt,
// Pegel 0.000, Mikrofon: ..."). Sie ist deutlich brauchbarer als "Ich habe nichts
// verstanden" und darf davon nicht überschrieben werden.
let lastMicError: string | null = null

const INTENT_LABEL_KEY: Record<AppActionId, string> = {
  'view.dashboard': 'voiceCommand.intent.viewDashboard',
  'note.create': 'voiceCommand.intent.noteCreate',
  'tasks.overdue': 'voiceCommand.intent.tasksOverdue',
  'tasks.today': 'voiceCommand.intent.tasksToday',
  'search.notes': 'voiceCommand.intent.searchNotes',
  'briefing.today': 'voiceCommand.intent.briefingToday',
  'week.focus': 'voiceCommand.intent.weekFocus',
  'activity.today': 'voiceCommand.intent.activityToday',
  'project.open': 'voiceCommand.intent.projectOpen',
  'note.current': 'voiceCommand.intent.noteCurrent'
}

/**
 * Sprachbefehl im Tätigkeitsprotokoll vermerken — inhaltsfrei: Aktion, Status und die
 * gemessenen Zeiten, NIE das Transkript. Fehler bleiben still; ein nicht geschriebener
 * Zähler darf einen Befehl nicht scheitern lassen.
 */
function logVoiceCommand(
  actionId: AppActionId | null,
  status: 'ok' | 'clarified' | 'rejected',
  timings?: { sttMs?: number; matchMs?: number; dataMs?: number }
): void {
  const vaultPath = useNotesStore.getState().vaultPath
  if (!vaultPath) return
  void window.electronAPI?.activityAppend(vaultPath, {
    at: Date.now(),
    kind: 'voice-command',
    actionId,
    status,
    ...timings
  }).catch(() => undefined)
}

function speakIfVoice(text: string | null, source: 'keyboard' | 'voice'): void {
  if (!text || source !== 'voice') return
  const speech = useUIStore.getState().speech
  if (!speech.enabled) return
  // forceLocal: selbst erzeugte Antworten aus Vault-Daten verlassen das Gerät nicht.
  speak(text, { contextId: VOICE_CONTEXT_ID, forceLocal: true })
}


/**
 * Eine verweigerte Mikrofonfreigabe ist der wahrscheinlichste Fehler beim ersten
 * Versuch — und die rohe Browsermeldung ("Permission denied") sagt niemandem, wo er
 * etwas ändern kann. Im Entwicklungslauf kommt hinzu, dass macOS die Freigabe an
 * "Electron" vergibt und nicht an MindGraph Notes; wer nach dem Produktnamen sucht,
 * findet nichts.
 */
function describeMicError(err: unknown, t: TFn): string {
  const raw = err instanceof Error ? `${err.name} ${err.message}` : String(err)
  if (/notallowed|permission|denied|verweigert/i.test(raw)) return t('voiceCommand.error.micDenied')
  if (/notfound|no device|devices/i.test(raw)) return t('voiceCommand.error.micMissing')
  return raw
}

export const useVoiceCommandStore = create<VoiceCommandStore>((set, get) => ({
  state: { kind: 'idle' },

  submit: async (raw, source, t, sttMs) => {
    const transcript = String(raw ?? '').trim()
    if (!transcript) {
      set({ state: { kind: 'idle' } })
      return
    }

    // Steht eine Auswahl offen, ist "Eins" eine Antwort darauf und keine neue Absicht.
    // Beim Sprechen ist der clarify-Zustand durch `preparing` ersetzt worden — deshalb
    // zählt hier auch die zwischengelegte Auswahl.
    const current = get().state
    const openClarify = current.kind === 'clarify' ? current : pendingClarify
    if (openClarify && openClarify.options.length > 0) {
      const ordinal = matchOrdinal(transcript, openClarify.options.length)
      if (ordinal !== null) {
        if (current.kind !== 'clarify') set({ state: openClarify })
        pendingClarify = null
        await get().chooseOption(ordinal, t)
        return
      }
    }
    pendingClarify = null

    const matchStarted = performance.now()
    const outcome = matchIntent(transcript)
    const matchMs = Math.round(performance.now() - matchStarted)

    if (outcome.kind === 'fallback') {
      const commands = getVoiceUiBridge()?.getAvailableCommands() ?? []
      logVoiceCommand(null, 'rejected', { sttMs, matchMs })
      set({ state: { kind: 'fallback', transcript, entries: buildFallback(outcome.query, commands) } })
      return
    }

    if (outcome.kind === 'clarify') {
      logVoiceCommand(outcome.reason === 'missing-param' ? outcome.id : null, 'clarified', { sttMs, matchMs })
      if (outcome.reason === 'missing-param') {
        set({
          state: {
            kind: 'clarify',
            transcript,
            reason: 'missing-param',
            options: [],
            missingParam: outcome.param
          }
        })
        return
      }
      set({
        state: {
          kind: 'clarify',
          transcript,
          reason: 'ambiguous-intent',
          options: outcome.candidates.map(c => ({
            label: t(INTENT_LABEL_KEY[c.id]),
            id: c.id,
            action: c.action
          }))
        }
      })
      return
    }

    await runAction(outcome.action, transcript, source, t, { sttMs, matchMs }, set)
  },

  chooseOption: async (index, t) => {
    const state = get().state
    if (state.kind !== 'clarify') return
    const option = state.options[index]
    if (!option) return
    if (!option.action) {
      // Absicht gewählt, Parameter fehlt weiterhin — zweite Rückfrage statt Raten.
      set({
        state: {
          kind: 'clarify',
          transcript: state.transcript,
          reason: 'missing-param',
          options: [],
          missingParam: 'query'
        }
      })
      return
    }
    await runAction(option.action, state.transcript, 'keyboard', t, { matchMs: 0 }, set)
  },

  runDirect: async (action, t) => {
    await runAction(action, get().state.kind === 'idle' ? '' : (get().state as { transcript?: string }).transcript ?? '', 'keyboard', t, { matchMs: 0 }, set)
  },

  startListening: async (t) => {
    // `dictation` ist während der Freigabe noch null — ohne das zweite Flag würde ein
    // zweiter Klick eine zweite Aufnahme starten.
    if (dictation || starting) return
    const myGeneration = generation
    starting = true
    lastMicError = null
    // Eine offene Auswahl überdauert die Aufnahme, damit "Eins" gesprochen zählt.
    const current = get().state
    pendingClarify = current.kind === 'clarify' ? current : null
    stopSpeaking()
    set({ state: { kind: 'preparing' } })
    try {
      const handle = await startDictation({
        contextId: VOICE_CONTEXT_ID,
        onError: (message) => {
          dictation = null
          lastMicError = describeMicError(message, t)
          set({ state: { kind: 'error', message: lastMicError } })
        }
      })
      if (myGeneration !== generation) {
        // Zwischenzeitlich abgebrochen: Aufnahme sofort verwerfen, Zustand nicht anfassen.
        handle.cancel()
        return
      }
      // Erst JETZT wird wirklich aufgenommen. Die Zeitmessung beginnt hier, sonst
      // stünde die Wartezeit auf die Systemfreigabe in der Transkriptionsdauer.
      dictation = handle
      listeningStartedAt = performance.now()
      set({ state: { kind: 'listening', startedAt: Date.now() } })
    } catch (err) {
      dictation = null
      if (myGeneration !== generation) return
      set({ state: { kind: 'error', message: describeMicError(err, t) } })
    } finally {
      starting = false
    }
  },

  stopListening: async (t) => {
    const handle = dictation
    if (!handle) return
    dictation = null
    set({ state: { kind: 'transcribing' } })
    try {
      const transcript = await handle.stop()
      const sttMs = Math.round(performance.now() - listeningStartedAt)
      if (!transcript.trim()) {
        // Die Aufnahmeschicht weiß mehr als wir: sie nennt Pegel und Mikrofonnamen.
        // "Ich habe nichts verstanden" ist nur die Notlösung, wenn nichts vorliegt.
        set({ state: { kind: 'error', message: lastMicError ?? t('voiceCommand.error.emptyTranscript') } })
        return
      }
      await get().submit(transcript, 'voice', t, sttMs)
    } catch (err) {
      set({ state: { kind: 'error', message: err instanceof Error ? err.message : String(err) } })
    }
  },

  abort: (reason) => {
    // Ohne diese Wache stoppt jedes Schließen der Palette JEDE laufende Sprachausgabe
    // der App — auch das Vorlesen einer Karteikarte, das mit Sprachbefehlen nichts zu
    // tun hat. Der Effekt in CommandPalette feuert beim Schließen immer.
    generation++
    pendingClarify = null
    if (!dictation && !starting && get().state.kind === 'idle') return
    if (dictation) {
      dictation.cancel()
      dictation = null
    }
    stopSpeaking()
    if (reason !== 'user') console.log(`[voiceCommand] abgebrochen: ${reason}`)
    set({ state: { kind: 'idle' } })
  },

  reset: () => {
    generation++
    pendingClarify = null
    lastMicError = null
    if (dictation) {
      dictation.cancel()
      dictation = null
    }
    stopSpeaking()
    set({ state: { kind: 'idle' } })
  }
}))

type SetState = (partial: Partial<VoiceCommandStore>) => void

async function runAction(
  action: AnyAction,
  transcript: string,
  source: 'keyboard' | 'voice',
  t: TFn,
  timings: { sttMs?: number; matchMs: number },
  set: SetState
): Promise<void> {
  const spec = ACTIONS[action.id]
  if (!spec) {
    // Erkannt, aber in dieser Stufe nicht gebaut — sagen statt schweigen.
    set({
      state: {
        kind: 'error',
        transcript,
        message: t('voiceCommand.error.notBuiltYet', { intent: t(INTENT_LABEL_KEY[action.id]) })
      }
    })
    return
  }
  set({ state: { kind: 'running', transcript } })
  try {
    // Der Cast ist nötig, weil TypeScript die Verbindung zwischen action.id und
    // action.params über die Map hinweg nicht mitführt. matchIntent baut beide
    // gemeinsam (buildAction), deshalb können sie nicht auseinanderlaufen.
    const run = spec.run as (p: unknown, t: TFn) => Promise<ActionOutcome>
    const outcome = await run(action.params, t)
    set({
      state: {
        kind: 'answer',
        transcript,
        card: outcome.card,
        actionKind: spec.kind,
        timings: { sttMs: timings.sttMs, matchMs: timings.matchMs, dataMs: outcome.dataMs }
      }
    })
    logVoiceCommand(action.id, 'ok', { sttMs: timings.sttMs, matchMs: timings.matchMs, dataMs: outcome.dataMs })
    speakIfVoice(outcome.speech, source)
  } catch (err) {
    set({ state: { kind: 'error', transcript, message: err instanceof Error ? err.message : String(err) } })
  }
}
