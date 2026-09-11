// Weiterleiten: Senden ist gesperrt, solange Originalanhänge laden, und
// braucht eine bewusste Freigabe, wenn danach Dateien fehlen (F11).
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { parseHTML } from 'linkedom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { ComposeEmail } from '../../../shared/types'

const state = vi.hoisted(() => ({
  composeState: {
    accountId: 'test',
    to: [{ address: 'test@example.invalid', name: '' }],
    subject: 'Fwd: Bericht',
    body: 'Test',
    draftId: 'd1'
  } as ComposeEmail,
  setComposeState: vi.fn(),
  sendEmail: vi.fn().mockResolvedValue({ success: false, error: 'Simulierter Versand' }),
  isSending: false,
  closeCompose: vi.fn(),
  discardDraft: vi.fn(),
  draftSaveError: null as string | null
}))
vi.mock('../../stores/emailStore', () => ({ useEmailStore: Object.assign(() => state, { getState: () => state }) }))
vi.mock('../../stores/uiStore', () => ({ useUIStore: () => ({
  email: { accounts: [{ id: 'test', smtpHost: 'smtp.example.invalid' }] }, languageTool: { enabled: false }
}) }))
vi.mock('../../stores/notesStore', () => ({ useNotesStore: () => ({ vaultPath: '/test' }) }))
vi.mock('../../stores/contactStore', () => ({ useContactStore: Object.assign(
  () => ({ searchContacts: () => [] }), { getState: () => ({ buildContacts: vi.fn() }) }
) }))
vi.mock('../../utils/translations', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('../../utils/sanitize', () => ({ sanitizeHtml: (html: string) => html }))
import { ComposeView } from './ComposeView'

let root: Root
let container: HTMLElement
beforeEach(() => {
  const { window } = parseHTML('<html><body><div id="root"></div></body></html>')
  vi.stubGlobal('window', window)
  vi.stubGlobal('document', window.document)
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  container = document.getElementById('root')!
  root = createRoot(container)
  state.draftSaveError = null
  vi.clearAllMocks()
})
afterEach(async () => {
  await act(async () => root.unmount())
  vi.unstubAllGlobals()
})
function button(key: string) {
  return [...container.querySelectorAll('button')].find(b => b.textContent === `inbox.compose.${key}`)
}
async function click(key: string) {
  const b = button(key)
  expect(b).toBeDefined()
  await act(async () => b!.click())
}

it('sperrt Senden, solange Originalanhänge laden', async () => {
  state.composeState.forwardAttachments = { status: 'loading', sourceEmailId: 'm1' }
  await act(async () => root.render(<ComposeView />))
  expect(button('send')!.disabled).toBe(true)
  await act(async () => button('send')!.click())
  expect(state.sendEmail).not.toHaveBeenCalled()
})

it('verlangt eine bewusste Freigabe, wenn Anhänge fehlen', async () => {
  state.composeState.forwardAttachments = { status: 'done', names: ['a.pdf'], skipped: ['gross.zip'] }
  await act(async () => root.render(<ComposeView />))
  expect(button('send')!.disabled).toBe(false)
  await click('send')
  expect(state.sendEmail).not.toHaveBeenCalled()
  expect(container.textContent).toContain('inbox.compose.missingAttachmentsWarning')
  await click('keep')
  expect(state.sendEmail).not.toHaveBeenCalled()
  await click('send')
  await click('sendWithoutAttachments')
  expect(state.sendEmail).toHaveBeenCalledExactlyOnceWith('/test')
})

it('sendet ohne Rückfrage, wenn alle Anhänge übernommen wurden', async () => {
  state.composeState.forwardAttachments = { status: 'done', names: ['a.pdf'], skipped: [] }
  await act(async () => root.render(<ComposeView />))
  await click('send')
  expect(state.sendEmail).toHaveBeenCalledExactlyOnceWith('/test')
})

it('zeigt einen fehlgeschlagenen Entwurfs-Speichervorgang an', async () => {
  state.composeState.forwardAttachments = undefined
  state.draftSaveError = 'QuotaExceededError'
  await act(async () => root.render(<ComposeView />))
  expect(container.textContent).toContain('inbox.compose.draftSaveFailed')
})
