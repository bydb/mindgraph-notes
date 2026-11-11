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

// ── Bilder ablegen / einfügen ──
function stubStaging() {
  const stage = vi.fn().mockResolvedValue({
    success: true,
    attachments: [{ path: '/userData/forward-attachments/x/Bildschirmfoto.png', filename: 'Bildschirmfoto.png', size: 4, inlineId: 'a1b2c3d4e5f6', width: 800 }],
    skipped: []
  })
  ;(window as unknown as { electronAPI: unknown }).electronAPI = { emailStageComposeFiles: stage, emailDiscardStagedAttachments: vi.fn() }
  vi.stubGlobal('requestAnimationFrame', () => 0) // linkedom kennt setSelectionRange nicht
  return stage
}
const imageFile = () => ({ name: 'image.png', size: 4, arrayBuffer: async () => new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer })
const flush = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })

it('setzt ein eingefügtes Bild als Platzhalter in den Text und merkt es als Anhang', async () => {
  const stage = stubStaging()
  await act(async () => root.render(<ComposeView />))
  const event = new window.Event('paste', { bubbles: true, cancelable: true }) as Event & { clipboardData: unknown }
  event.clipboardData = { files: [imageFile()], types: ['Files'], getData: () => '' }
  await act(async () => { container.querySelector('textarea')!.dispatchEvent(event) })
  await flush()
  expect(event.defaultPrevented).toBe(true)
  expect(stage).toHaveBeenCalledOnce()
  expect(stage.mock.calls[0][0][0].name).toBe('image.png')
  const next = state.setComposeState.mock.calls.at(-1)![0]
  expect(next.body).toBe('![Bildschirmfoto.png](bild:a1b2c3d4e5f6)\nTest')
  expect(next.attachments).toHaveLength(1)
})
it('lässt eingefügten Text mit beiliegendem Bild (Word, Excel) als Text durch', async () => {
  const stage = stubStaging()
  await act(async () => root.render(<ComposeView />))
  const event = new window.Event('paste', { bubbles: true, cancelable: true }) as Event & { clipboardData: unknown }
  event.clipboardData = { files: [imageFile()], types: ['text/plain', 'Files'], getData: () => 'Zelle' }
  await act(async () => { container.querySelector('textarea')!.dispatchEvent(event) })
  await flush()
  expect(event.defaultPrevented).toBe(false)
  expect(stage).not.toHaveBeenCalled()
})
it('übernimmt eine abgelegte Datei und überspringt zu große, ohne sie zu lesen', async () => {
  const stage = stubStaging()
  await act(async () => root.render(<ComposeView />))
  const tooBig = { name: 'film.mov', size: 31 * 1024 * 1024, arrayBuffer: vi.fn() }
  const event = new window.Event('drop', { bubbles: true, cancelable: true }) as Event & { dataTransfer: unknown }
  event.dataTransfer = { files: [imageFile(), tooBig], types: ['Files'] }
  await act(async () => { container.querySelector('.inbox-compose')!.dispatchEvent(event) })
  await flush()
  expect(event.defaultPrevented).toBe(true)
  expect(tooBig.arrayBuffer).not.toHaveBeenCalled()
  expect(stage.mock.calls[0][0]).toHaveLength(1)
  expect(container.querySelector('[role="status"]')!.textContent).toContain('inbox.compose.dropSkipped')
})
