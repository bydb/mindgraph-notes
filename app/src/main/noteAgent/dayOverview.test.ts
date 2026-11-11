// Tagesüberblick: was aus dem Vault gelesen wird — und was nicht (Verknüpfungen nach außen).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'

let userDataDir = ''
vi.mock('electron', () => ({ app: { getPath: () => userDataDir } }))

import { buildDayOverview } from './dayOverview'
import { recordNoteWrite } from '../dayLog'
import { localDayBounds } from '../../shared/dayLog'

const DAY = '2026-11-11'
const range = localDayBounds(DAY)!
const AT = range.from + 14 * 3600000
let tmp = ''
let vault = ''
let outside = ''

beforeEach(async () => {
  tmp = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'mg-overview-')))
  userDataDir = path.join(tmp, 'profil')
  vault = path.join(tmp, 'vault')
  outside = path.join(tmp, 'ausserhalb')
  await fs.mkdir(path.join(vault, 'brain', '2026', '11'), { recursive: true })
  await fs.mkdir(path.join(outside, '2026', '11'), { recursive: true })
  await fs.writeFile(path.join(outside, '2026', '11', '11.md'), 'fremd')
})

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true })
})

const overview = (brainFolder = 'brain') => buildDayOverview({ vaultPath: vault, isoDate: DAY, range, brainFolder })

describe('buildDayOverview', () => {
  it('findet Brain-Tagesnotizen samt Zweitfassung, keine Ordner und keine fremden Tage', async () => {
    const dir = path.join(vault, 'brain', '2026', '11')
    await fs.writeFile(path.join(dir, '11.md'), 'a')
    await fs.writeFile(path.join(dir, '11 (2).md'), 'b')
    await fs.writeFile(path.join(dir, '12.md'), 'c')
    await fs.mkdir(path.join(dir, '11 (3).md'))
    expect((await overview()).brainNotes).toEqual(['brain/2026/11/11 (2).md', 'brain/2026/11/11.md'])
  })

  it('listet nichts auf, wenn der Brain-Ordner per Verknüpfung aus dem Vault führt', async () => {
    await fs.symlink(outside, path.join(vault, 'extern'))
    expect((await overview('extern')).brainNotes).toBeNull()
    expect((await overview('../ausserhalb')).brainNotes).toBeNull()
    // Verknüpfung ins Leere ist „nicht prüfbar“, ein fehlender Ordner „keine da“.
    await fs.symlink(path.join(tmp, 'gibt-es-nicht'), path.join(vault, 'kaputt'))
    expect((await overview('kaputt')).brainNotes).toBeNull()
    expect((await overview('fehlt')).brainNotes).toEqual([])
    // Verknüpfung INNERHALB des Vaults ist erlaubt.
    await fs.writeFile(path.join(vault, 'brain', '2026', '11', '11.md'), 'a')
    await fs.symlink(path.join(vault, 'brain'), path.join(vault, 'intern'))
    expect((await overview('intern')).brainNotes).toEqual(['brain/2026/11/11.md'])
  })

  it('liest den Aufgabentext aus der Notiz — und sagt es, wenn er dort nicht mehr steht', async () => {
    await fs.writeFile(path.join(vault, 'a.md'), '- [x] Antrag senden\n- [x] Raum buchen')
    await recordNoteWrite({ vaultPath: vault, note: 'a.md', before: '- [ ] Antrag senden\n- [ ] Raum buchen', after: '- [x] Antrag senden\n- [x] Raum buchen', origin: 'tasks', at: AT })
    // Danach wird eine Aufgabe umformuliert: ihr Text ist nicht mehr auffindbar.
    await fs.writeFile(path.join(vault, 'a.md'), '- [x] Antrag senden\n- [x] Saal buchen')
    // Eine Notiz, die inzwischen per Verknüpfung nach außen zeigt, wird nicht gelesen.
    await fs.writeFile(path.join(outside, 'geheim.md'), '- [x] Fremde Aufgabe')
    await recordNoteWrite({ vaultPath: vault, note: 'link.md', before: '- [ ] Fremde Aufgabe', after: '- [x] Fremde Aufgabe', origin: 'tasks', at: AT + 1 })
    await fs.symlink(path.join(outside, 'geheim.md'), path.join(vault, 'link.md'))
    const data = await overview()
    expect(data.log.state).toBe('ok')
    if (data.log.state !== 'ok') return
    expect(data.log.summary.tasksChecked.map(t => t.note)).toEqual(['a.md', 'a.md', 'link.md'])
    expect(data.log.taskTexts).toEqual(['Antrag senden', null, null])
  })

  it('unterscheidet fehlendes und kaputtes Tätigkeitsprotokoll von einer Nullbilanz', async () => {
    expect((await overview()).activity).toEqual({ state: 'missing' })
    await recordNoteWrite({ vaultPath: vault, note: 'a.md', before: 'a', after: 'b', origin: 'app', at: AT })
    const key = (await fs.readdir(path.join(userDataDir, 'daylog')))[0]
    await fs.mkdir(path.join(userDataDir, 'activity'), { recursive: true })
    await fs.writeFile(path.join(userDataDir, 'activity', key), '{ kaputt')
    expect((await overview()).activity).toEqual({ state: 'broken' })
    await fs.writeFile(path.join(userDataDir, 'activity', key), '[]')
    expect((await overview()).activity).toMatchObject({ state: 'ok', accepted: 0 })
  })
})
