import { describe, it, expect, vi, beforeEach } from 'vitest'

// Die Zeitmessung des Agent-Laufs ist die Grundlage der Zeitbilanz. Zwei Wege
// verschluckten sie: Nach der ERSTEN Entscheidung lief kein Prüftimer mehr (bei zwei
// Ergebniskarten fehlte damit die halbe Prüfzeit), und ein gescheiterter Aufruf
// verbrauchte die Messwerte trotzdem.

type Timings = { reviewMs?: number; waitingMs?: number }
type Antwort = { success: boolean; error?: string }
const acceptResult = vi.fn(async (..._a: [string, string, Timings?]): Promise<Antwort> => ({ success: true }))
const discardResult = vi.fn(async (..._a: [string, string, Timings?]): Promise<Antwort> => ({ success: true }))
// Der Prüftimer startet im done-Ereignis — der Test muss es also wirklich auslösen.
let doneCallback: ((p: unknown) => void) | null = null

vi.stubGlobal('window', {
  electronAPI: {
    noteAgentAcceptResult: (...a: unknown[]) => acceptResult(...(a as [string, string, Timings?])),
    noteAgentDiscardResult: (...a: unknown[]) => discardResult(...(a as [string, string, Timings?])),
    onNoteAgentProgress: () => () => {},
    onNoteAgentDone: (cb: (p: unknown) => void) => { doneCallback = cb; return () => {} },
    onNoteAgentRunEvicted: () => () => {},
    onNoteAgentMemorySuggestion: () => () => {}
  },
  addEventListener: () => {},
  removeEventListener: () => {}
})
vi.stubGlobal('document', { visibilityState: 'visible', addEventListener: () => {} })

const { useNoteAgentStore, initNoteAgentEvents } = await import('./noteAgentStore')
initNoteAgentEvents()

const SCOPE = 'notiz-1'

function scopeMitZweiKarten(): void {
  useNoteAgentStore.setState({
    scopes: {
      [SCOPE]: {
        ...useNoteAgentStore.getState().getScope(SCOPE),
        run: {
          ...useNoteAgentStore.getState().getScope(SCOPE).run,
          runId: 'run-1',
          phase: 'review',
          results: [
            { resultId: 'r1', suggestedName: 'a.md', kind: 'md', summary: '', sources: [], state: 'pending' },
            { resultId: 'r2', suggestedName: 'b.xlsx', kind: 'xlsx', summary: '', sources: [], state: 'pending' }
          ]
        }
      }
    },
    runScope: { 'run-1': SCOPE }
  } as never)
}

beforeEach(() => {
  acceptResult.mockClear().mockResolvedValue({ success: true })
  discardResult.mockClear().mockResolvedValue({ success: true })
  scopeMitZweiKarten()
  // Ergebnisse treffen ein → ab hier läuft die Prüfzeit, wie in der echten App.
  doneCallback?.({
    runId: 'run-1',
    ok: true,
    results: [
      { resultId: 'r1', suggestedName: 'a.md', kind: 'md', summary: '', sources: [] },
      { resultId: 'r2', suggestedName: 'b.xlsx', kind: 'xlsx', summary: '', sources: [] }
    ]
  })
  scopeMitZweiKarten()
})

describe('Zeitmessung über mehrere Ergebnisse', () => {
  it('misst nach der ersten Entscheidung weiter, solange Karten offen sind', async () => {
    await useNoteAgentStore.getState().discardResult(SCOPE, 'r1')
    expect(discardResult).toHaveBeenCalledTimes(1)

    // Zweite Entscheidung: Es MUSS wieder eine Prüfzeit mitkommen — vorher war sie
    // undefined, weil der einzige Timer beim ersten Klick verbraucht wurde.
    await useNoteAgentStore.getState().acceptResult(SCOPE, 'r2')
    const timings = acceptResult.mock.calls[0]?.[2]
    expect(timings).toBeDefined()
    expect(typeof timings?.reviewMs).toBe('number')
  })

  it('verliert die Messwerte nicht, wenn die Übernahme scheitert', async () => {
    acceptResult.mockResolvedValueOnce({ success: false, error: 'Zielordner weg' })
    await useNoteAgentStore.getState().acceptResult(SCOPE, 'r1')
    const ersterVersuch = acceptResult.mock.calls[0]?.[2]

    await useNoteAgentStore.getState().acceptResult(SCOPE, 'r1')
    const zweiterVersuch = acceptResult.mock.calls[1]?.[2]

    // Der zweite Versuch darf nicht ohne Prüfzeit dastehen.
    expect(typeof zweiterVersuch?.reviewMs).toBe('number')
    expect(zweiterVersuch?.reviewMs).toBe(ersterVersuch?.reviewMs)
  })
})
