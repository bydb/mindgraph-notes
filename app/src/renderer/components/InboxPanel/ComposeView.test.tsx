import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { parseHTML } from 'linkedom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  composeState: { accountId: 'test', to: [{ address: 'test@example.invalid', name: '' }], subject: '', body: 'Test' },
  setComposeState: vi.fn(),
  sendEmail: vi.fn().mockResolvedValue({ success: false, error: 'Simulierter Versand' }),
  isSending: false,
  setCurrentView: vi.fn()
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
  state.composeState.subject = ''
  vi.clearAllMocks()
})
afterEach(async () => {
  await act(async () => root.unmount())
  vi.unstubAllGlobals()
})
async function click(key: string) {
  const button = [...container.querySelectorAll('button')].find(b => b.textContent === `inbox.compose.${key}`)
  expect(button).toBeDefined()
  await act(async () => button!.click())
}

it.each(['', '   \t '])('warnt bei leerem Betreff %j und sendet erst nach ausdrücklicher Bestätigung', async subject => {
  state.composeState.subject = subject
  await act(async () => root.render(<ComposeView />))
  await click('send')
  expect(container.querySelector('[role="alert"]')).not.toBeNull()
  expect(state.sendEmail).not.toHaveBeenCalled()
  await click('send')
  expect(state.sendEmail).not.toHaveBeenCalled()
  await click('sendWithoutSubject')
  expect(state.sendEmail).toHaveBeenCalledExactlyOnceWith('/test')
})
it('behält beim Ergänzen den Entwurf und sendet nichts', async () => {
  await act(async () => root.render(<ComposeView />))
  const focus = vi.spyOn(container.querySelector<HTMLInputElement>('.inbox-compose-subject')!, 'focus')
  await click('send')
  await click('addSubject')
  expect(container.querySelector('[role="alert"]')).toBeNull()
  expect(focus).toHaveBeenCalledOnce()
  expect(state.sendEmail).not.toHaveBeenCalled()
  expect(state.setComposeState).not.toHaveBeenCalled()
})
it('sendet mit ausgefülltem Betreff ohne Rückfrage', async () => {
  state.composeState.subject = 'Termin'
  await act(async () => root.render(<ComposeView />))
  await click('send')
  expect(container.querySelector('[role="alert"]')).toBeNull()
  expect(state.sendEmail).toHaveBeenCalledExactlyOnceWith('/test')
})

function paste(input: HTMLInputElement, text: string) {
  const event = new window.Event('paste', { bubbles: true, cancelable: true }) as Event & { clipboardData: unknown }
  event.clipboardData = { getData: (type: string) => type === 'text/plain' ? text : '' }
  input.dispatchEvent(event)
  return event
}
const fieldInput = (field: string) =>
  container.querySelector<HTMLInputElement>(`input[aria-label="inbox.compose.${field}"]`)!

it('macht aus einer eingefügten Adressliste (eine pro Zeile) einzelne Empfänger', async () => {
  await act(async () => root.render(<ComposeView />))
  const list = 'manfred.dreier@gss-alsfeld.de\nmatthias.matzen@friedrich-magnus.de\nthomas@meisterknecht.de\n'
  let event!: Event
  await act(async () => { event = paste(fieldInput('to'), list) })
  expect(event.defaultPrevented).toBe(true)
  const next = state.setComposeState.mock.calls.at(-1)![0]
  expect(next.to.map((r: { address: string }) => r.address)).toEqual([
    'test@example.invalid',
    'manfred.dreier@gss-alsfeld.de',
    'matthias.matzen@friedrich-magnus.de',
    'thomas@meisterknecht.de'
  ])
})
it('sendet nicht, solange in einem Feld eine ungültige Adresse steht', async () => {
  state.composeState.subject = 'Termin'
  await act(async () => root.render(<ComposeView />))
  await act(async () => { paste(fieldInput('cc'), 'kaputt@\neva@example.invalid') })
  expect(fieldInput('cc').value).toBe('kaputt@')
  expect(container.querySelector('.inbox-compose-recipient-error')).not.toBeNull()
  await click('send')
  expect(state.sendEmail).not.toHaveBeenCalled()
})
