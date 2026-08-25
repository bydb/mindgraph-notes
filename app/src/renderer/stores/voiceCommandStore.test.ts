import { describe, it, expect, vi, beforeEach } from 'vitest'

// Die bisherigen Sprachtests prüfen Erkennung und Rückfall — also reine Logik.
// Der Aufnahme-Lebenszyklus (Vorbereiten, Abbrechen, Fehler weiterreichen) lag
// ungeprüft, und genau dort steckte ein Fehler: eine abgebrochene Aufnahme startete
// hinterher trotzdem, unsichtbar, weil der Zustand schon auf idle stand.

const cancel = vi.fn()
const stop = vi.fn(async () => '')
let resolveStart: ((handle: { stop: typeof stop; cancel: typeof cancel }) => void) | null = null
let onErrorCb: ((message: string) => void) | null = null

vi.mock('../utils/voice/stt', () => ({
  startDictation: vi.fn((cb: { onError?: (m: string) => void }) => {
    onErrorCb = cb.onError ?? null
    return new Promise(resolve => { resolveStart = resolve as never })
  })
}))

vi.mock('../utils/voice/tts', () => ({
  speak: vi.fn(() => true),
  stopSpeaking: vi.fn()
}))

vi.mock('./uiStore', () => ({
  useUIStore: { getState: () => ({ speech: { enabled: false } }) }
}))

vi.mock('../voice/uiBridge', () => ({
  getVoiceUiBridge: () => ({
    openDashboard: vi.fn(),
    openQuickSearch: vi.fn(),
    openTasksPanel: vi.fn(),
    newNote: vi.fn(),
    runCommand: vi.fn(),
    isModuleEnabled: () => true,
    getAvailableCommands: () => []
  })
}))

const ranActions: string[] = []
// Wird beim Aufruf der Aktion gesetzt: hält sie an, bis der Test sie freigibt.
let releaseAction: (() => void) | null = null
vi.mock('../voice/actions', () => {
  const make = (id: string) => ({
    id,
    kind: 'answer' as const,
    run: async () => {
      ranActions.push(id)
      return { card: { title: id, lines: [], sources: [], followUps: [] }, speech: null, dataMs: 0 }
    }
  })
  return {
    ACTIONS: {
      'tasks.overdue': make('tasks.overdue'),
      'search.notes': make('search.notes'),
      'view.dashboard': make('view.dashboard'),
      'briefing.today': {
        id: 'briefing.today',
        kind: 'answer' as const,
        run: async () => {
          await new Promise<void>(resolve => { releaseAction = resolve })
          ranActions.push('briefing.today')
          return { card: { title: 'briefing', lines: [], sources: [], followUps: [] }, speech: 'gesprochen', dataMs: 0 }
        }
      }
    }
  }
})

import { useVoiceCommandStore } from './voiceCommandStore'

const t = ((key: string) => key) as never

beforeEach(() => {
  cancel.mockClear()
  stop.mockClear()
  ranActions.length = 0
  resolveStart = null
  onErrorCb = null
  releaseAction = null
  useVoiceCommandStore.getState().reset()
})

describe('Aufnahme-Lebenszyklus', () => {
  it('eine während der Vorbereitung abgebrochene Aufnahme startet NICHT nachträglich', async () => {
    const store = useVoiceCommandStore.getState()
    const pending = store.startListening(t)
    expect(useVoiceCommandStore.getState().state.kind).toBe('preparing')

    // Palette wird geschlossen, solange macOS noch fragt.
    useVoiceCommandStore.getState().abort('blur')
    expect(useVoiceCommandStore.getState().state.kind).toBe('idle')

    // Die Freigabe kommt erst jetzt durch.
    resolveStart?.({ stop, cancel })
    await pending

    expect(cancel).toHaveBeenCalledTimes(1)
    expect(useVoiceCommandStore.getState().state.kind).toBe('idle')
  })

  it('gibt die ausführliche Mikrofonmeldung weiter statt sie zu überschreiben', async () => {
    const store = useVoiceCommandStore.getState()
    const pending = store.startListening(t)
    resolveStart?.({ stop, cancel })
    await pending

    const detail = 'Kein Ton erkannt (Pegel 0.000, Mikrofon: Studio Display)'
    // Reihenfolge wie in echt: die Aufnahmeschicht meldet den Fehler WÄHREND stop()
    // und liefert danach einen leeren Text. Genau dann greift die Überschreibung.
    stop.mockImplementationOnce(async () => {
      onErrorCb?.(detail)
      return ''
    })

    await useVoiceCommandStore.getState().stopListening(t)
    const state = useVoiceCommandStore.getState().state
    expect(state.kind).toBe('error')
    if (state.kind === 'error') expect(state.message).toBe(detail)
  })

  it('beantwortet eine gesprochene Ordnungszahl gegen die offene Auswahl', async () => {
    // Beide Muster treffen voll -> Abstand null -> Rückfrage mit zwei Optionen.
    await useVoiceCommandStore.getState().submit('suche nach überfälligen aufgaben', 'keyboard', t)
    const clarify = useVoiceCommandStore.getState().state
    expect(clarify.kind).toBe('clarify')

    // Erneut sprechen: der clarify-Zustand wird durch `preparing` ersetzt.
    const pending = useVoiceCommandStore.getState().startListening(t)
    resolveStart?.({ stop, cancel })
    await pending
    expect(useVoiceCommandStore.getState().state.kind).toBe('listening')

    stop.mockResolvedValueOnce('eins')
    await useVoiceCommandStore.getState().stopListening(t)

    // Die Auswahl wurde ausgeführt, nicht als neue Absicht erkannt.
    expect(ranActions).toHaveLength(1)
  })

  it('startet keine zweite Aufnahme, solange die erste vorbereitet wird', async () => {
    const store = useVoiceCommandStore.getState()
    const first = store.startListening(t)
    const second = store.startListening(t)
    resolveStart?.({ stop, cancel })
    await Promise.all([first, second])
    expect(useVoiceCommandStore.getState().state.kind).toBe('listening')
  })
})

/**
 * Der Generationsschutz deckte nur den Start der Aufnahme ab. Alles danach — die
 * Transkription (Sekunden auf schwacher Hardware) und die Datenbeschaffung der Aktion
 * (Kalender, Mails, alle Aufgaben) — lief nach einem Abbruch weiter bis zur Karte.
 * Sichtbar wurde das als Antwort, die aufpoppt und vorgelesen wird, nachdem der Nutzer
 * die Palette längst geschlossen hat.
 */
describe('Abbruch nach dem Start', () => {
  it('liefert nach einem Abbruch während der Transkription keine Karte nach', async () => {
    const store = useVoiceCommandStore.getState()
    const starting = store.startListening(t)
    resolveStart!({ stop, cancel })
    await starting

    let fertig: ((text: string) => void) | null = null
    stop.mockImplementationOnce(() => new Promise<string>(resolve => { fertig = resolve as never }))
    const stopping = store.stopListening(t)
    await Promise.resolve()
    expect(useVoiceCommandStore.getState().state.kind).toBe('transcribing')

    store.abort('escape')          // Nutzer schließt die Palette …
    fertig!('was ist überfällig')  // … und erst danach ist Whisper fertig
    await stopping

    expect(useVoiceCommandStore.getState().state.kind).toBe('idle')
    expect(ranActions).toEqual([])
  })

  it('liefert nach einem Abbruch während der Datenbeschaffung keine Karte nach', async () => {
    const store = useVoiceCommandStore.getState()
    const submitting = store.submit('was ist heute wichtig', 'voice', t)
    await Promise.resolve()
    await Promise.resolve()
    expect(useVoiceCommandStore.getState().state.kind).toBe('running')

    store.abort('escape')
    releaseAction!()
    await submitting

    expect(useVoiceCommandStore.getState().state.kind).toBe('idle')
  })
})
