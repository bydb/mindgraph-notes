// Übergänge der Entwurfsablage im echten Store (F12, F13):
// Vault-Wechsel innerhalb der Entprellung, Schließen während des Anhang-Downloads.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const uiState = vi.hoisted(() => ({
  email: {
    enabled: true,
    accounts: [{ id: 'acc', name: 'A', host: 'imap', port: 993, user: 'u', tls: true, smtpHost: 'smtp', smtpPort: 587, smtpTls: true, fromAddress: 'u@x' }],
    signature: '',
    signatureImagePath: '',
    activeFolders: {},
    relevanceThreshold: 30,
    retainDays: 30,
    autoAnalyze: false,
    maxEmailsPerFetch: 2,
    markSeenOnOpen: false
  }
}))
vi.mock('./uiStore', () => ({ useUIStore: Object.assign(() => uiState, { getState: () => uiState }) }))
vi.mock('./notesStore', () => ({ useNotesStore: Object.assign(() => ({ notes: [], vaultPath: '/A' }), { getState: () => ({ notes: [], vaultPath: '/A' }) }) }))
vi.mock('../utils/activeTimeTracker', () => ({ createActiveMeasurement: () => ({ stop: () => 0, activeMs: () => 0 }) }))

import { useEmailStore } from './emailStore'
import { loadDrafts } from '../utils/emailDrafts'

function memoryStorage() {
  const map = new Map<string, string>()
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v) },
    removeItem: (k: string) => { map.delete(k) },
    keys: () => [...map.keys()]
  }
}

let storage: ReturnType<typeof memoryStorage>
let stageResolve: ((v: unknown) => void) | null
const api = {
  emailLoad: vi.fn(async () => ({ emails: [], lastFetchedAt: {}, revision: 'r1' })),
  emailStageForwardAttachments: vi.fn(() => new Promise(resolve => { stageResolve = resolve })),
  emailDiscardStagedAttachments: vi.fn(async () => ({ success: true, removed: 0 }))
}

beforeEach(() => {
  vi.useFakeTimers()
  storage = memoryStorage()
  stageResolve = null
  vi.stubGlobal('window', { localStorage: storage, electronAPI: api })
  vi.clearAllMocks()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('Entwürfe im Store', () => {
  it('F13: Vault-Wechsel innerhalb der Entprellung sichert den Entwurf unter dem ALTEN Vault', async () => {
    const s = useEmailStore.getState()
    await s.loadEmails('/A', true)
    s.startNewEmail()
    s.setComposeState({ ...useEmailStore.getState().composeState!, subject: 'Aus A' })
    await useEmailStore.getState().loadEmails('/B', true)
    vi.runAllTimers()
    expect(loadDrafts(storage, '/A').map(d => d.compose.subject)).toEqual(['Aus A'])
    expect(loadDrafts(storage, '/B')).toEqual([])
    expect(useEmailStore.getState().composeState).toBeNull()
  })

  it('F12: Schließen während des Anhang-Downloads — Ergebnis landet im gesicherten Entwurf', async () => {
    const s = useEmailStore.getState()
    await s.loadEmails('/A', true)
    useEmailStore.setState({
      emails: [{
        id: 'm1', uid: 7, accountId: 'acc', folder: 'INBOX', from: { name: 'X', address: 'x@y.z' }, to: [],
        subject: 'Bericht', date: '2026-09-11T08:00:00.000Z', snippet: '', bodyText: 'Text', flags: [],
        fetchedAt: '2026-09-11T08:00:00.000Z', hasAttachments: true, attachmentNames: ['a.pdf', 'gross.zip']
      }]
    })
    s.startForward(useEmailStore.getState().emails[0])
    expect(api.emailStageForwardAttachments).toHaveBeenCalledOnce()
    const open = useEmailStore.getState().composeState!
    expect(open.forwardAttachments?.status).toBe('loading')
    s.setComposeState({ ...open, to: [{ name: '', address: 'ziel@example.org' }] })
    s.closeCompose()
    expect(useEmailStore.getState().composeState).toBeNull()
    expect(loadDrafts(storage, '/A')[0].compose.forwardAttachments).toEqual({ status: 'loading', sourceEmailId: 'm1' })

    stageResolve!({ success: true, attachments: [{ path: '/tmp/forward-attachments/x/a.pdf', filename: 'a.pdf', size: 10 }], skipped: ['gross.zip'] })
    await vi.runAllTimersAsync()

    const stored = loadDrafts(storage, '/A')[0].compose
    expect(stored.attachments?.map(a => a.filename)).toEqual(['a.pdf'])
    expect(stored.forwardAttachments).toEqual({ status: 'done', names: ['a.pdf'], skipped: ['gross.zip'], sourceEmailId: 'm1' })
    expect(api.emailDiscardStagedAttachments).not.toHaveBeenCalled()
  })

  it('F12: verworfener Entwurf — nachträglich geladene Dateien werden weggeräumt', async () => {
    const s = useEmailStore.getState()
    await s.loadEmails('/A', true)
    useEmailStore.setState({
      emails: [{
        id: 'm1', uid: 7, accountId: 'acc', folder: 'INBOX', from: { name: 'X', address: 'x@y.z' }, to: [],
        subject: 'Bericht', date: '2026-09-11T08:00:00.000Z', snippet: '', bodyText: 'Text', flags: [],
        fetchedAt: '2026-09-11T08:00:00.000Z', hasAttachments: true
      }]
    })
    s.startForward(useEmailStore.getState().emails[0])
    s.closeCompose() // unangefasst → still verworfen
    expect(loadDrafts(storage, '/A')).toEqual([])
    stageResolve!({ success: true, attachments: [{ path: '/tmp/forward-attachments/x/a.pdf', filename: 'a.pdf', size: 10 }], skipped: [] })
    await vi.runAllTimersAsync()
    expect(api.emailDiscardStagedAttachments).toHaveBeenCalledWith(['/tmp/forward-attachments/x/a.pdf'])
  })

  it('openDraft setzt einen unterbrochenen Download fort', async () => {
    const s = useEmailStore.getState()
    await s.loadEmails('/A', true)
    useEmailStore.setState({
      emails: [{
        id: 'm1', uid: 7, accountId: 'acc', folder: 'INBOX', from: { name: 'X', address: 'x@y.z' }, to: [],
        subject: 'Bericht', date: '2026-09-11T08:00:00.000Z', snippet: '', bodyText: 'Text', flags: [],
        fetchedAt: '2026-09-11T08:00:00.000Z', hasAttachments: true
      }],
      drafts: [{ id: 'd9', updatedAt: '2026-09-11T08:00:00.000Z', compose: {
        to: [], subject: 'Fwd: Bericht', body: 'x', accountId: 'acc', draftId: 'd9',
        forwardAttachments: { status: 'loading', sourceEmailId: 'm1' }
      } }]
    })
    s.openDraft('d9')
    expect(api.emailStageForwardAttachments).toHaveBeenCalledOnce()
  })
})
