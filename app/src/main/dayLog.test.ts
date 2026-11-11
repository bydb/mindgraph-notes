// Ablage des Tagesprotokolls: was die Schreibgrenze vermerkt und was nicht.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'

let userDataDir = ''
vi.mock('electron', () => ({ app: { getPath: () => userDataDir } }))

import { recordNoteWrite, recordNoteMove, readDayLog } from './dayLog'
import { taskKey } from '../shared/dayLog'

const NOW = new Date(2026, 10, 11, 14, 0, 0).getTime()
let vault = ''

beforeEach(async () => {
  userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mg-daylog-'))
  // Eigener Vault-Schlüssel je Test: der „heute schon vermerkt“-Speicher lebt im Modul.
  vault = `/tmp/vault-${Math.random().toString(36).slice(2)}`
})

afterEach(async () => {
  await fs.rm(userDataDir, { recursive: true, force: true })
})

const write = (over: Partial<Parameters<typeof recordNoteWrite>[0]>) =>
  recordNoteWrite({ vaultPath: vault, note: 'a.md', before: 'alt', after: 'neu', origin: 'renderer', at: NOW, ...over })

describe('recordNoteWrite', () => {
  it('vermerkt eine Notiz höchstens einmal je Tag, auch bei vielen Autosaves', async () => {
    await Promise.all(Array.from({ length: 20 }, (_, i) => write({ before: `v${i}`, after: `v${i + 1}`, at: NOW + i })))
    await write({ before: 'x', after: 'y', at: NOW + 86400000 })
    const log = await readDayLog(vault)
    expect(log.state).toBe('ok')
    expect(log.events.filter(e => e.kind === 'note-saved')).toHaveLength(2)
    expect(log.since).toBe(NOW)
  })

  it('vermerkt abgehakte Aufgaben einzeln, auch wenn die Notiz heute schon gespeichert war', async () => {
    await write({ before: '- [ ] A\n- [ ] B', after: '- [ ] A\n- [ ] B\nText' })
    await write({ before: '- [ ] A\n- [ ] B\nText', after: '- [x] A\n- [ ] B\nText', origin: 'tasks', at: NOW + 5 })
    await write({ before: '- [x] A\n- [ ] B\nText', after: '- [x] A\n- [ ] B (@[[2026-11-12]])\nText', at: NOW + 9 })
    const log = await readDayLog(vault)
    const checked = log.events.filter(e => e.kind === 'task-checked')
    expect(checked).toHaveLength(1)
    expect(checked[0]).toMatchObject({ key: taskKey('A'), note: 'a.md', origin: 'tasks' })
  })

  it('unterscheidet angelegt von gespeichert', async () => {
    await write({ note: 'neu.md', before: null, after: '# Neu' })
    await write({ note: 'alt.md' })
    const log = await readDayLog(vault)
    expect(log.events.find(e => e.note === 'neu.md')).toMatchObject({ kind: 'note-saved', created: true })
    expect(log.events.find(e => e.note === 'alt.md')).toMatchObject({ kind: 'note-saved', created: false })
  })

  it('lässt Unverändertes, App-Interna und Brain-Tagesnotizen weg', async () => {
    await write({ before: 'gleich', after: 'gleich' })
    await write({ note: '.mindgraph/backups/x.md' })
    await write({ note: '800/2026/11/11.md', before: null, after: '---\ntype: brain-day\n---\n## Heute im Fokus' })
    expect((await readDayLog(vault)).state).toBe('missing')
  })

  it('überschreibt eine beschädigte Datei nicht und meldet sie als unlesbar', async () => {
    await write({})
    const dir = path.join(userDataDir, 'daylog')
    const file = path.join(dir, (await fs.readdir(dir))[0])
    await fs.writeFile(file, '{ kaputt', 'utf-8')
    await write({ note: 'b.md' })
    expect(await fs.readFile(file, 'utf-8')).toBe('{ kaputt')
    expect((await readDayLog(vault)).state).toBe('broken')
  })

  it('liefert nur den gefragten Zeitraum', async () => {
    await write({ at: NOW })
    await write({ note: 'b.md', at: NOW + 86400000 })
    const log = await readDayLog(vault, { from: NOW - 1, to: NOW + 1000 })
    expect(log.events.map(e => e.note)).toEqual(['a.md'])
  })

  it('speichert keinen Aufgabentext und entfernt den Klartext der ersten Fassung', async () => {
    await write({ before: '- [ ] Geheimer Antrag', after: '- [x] Geheimer Antrag' })
    const dir = path.join(userDataDir, 'daylog')
    const file = path.join(dir, (await fs.readdir(dir))[0])
    expect(await fs.readFile(file, 'utf-8')).not.toContain('Geheimer')
    // Datei der ersten Fassung mit Klartext unterschieben:
    await fs.writeFile(file, JSON.stringify({ since: NOW, events: [{ at: NOW, kind: 'task-checked', note: 'a.md', text: 'Alter Klartext', origin: 'tasks' }] }), 'utf-8')
    // Auch eine liegengebliebene Zwischendatei mit Klartext — im frischen Programmlauf (anderer Vault-Schlüssel hier nicht nötig: die Datei wird beim Schreiben ersetzt).
    const log = await readDayLog(vault)
    expect(log.events).toEqual([{ at: NOW, kind: 'task-checked', note: 'a.md', key: taskKey('Alter Klartext'), origin: 'tasks' }])
    // Schon nach diesem EINEN Lesen steht kein Klartext mehr auf der Platte.
    expect(await fs.readFile(file, 'utf-8')).not.toContain('Klartext')
    expect((await fs.readdir(dir)).filter(n => n.endsWith('.tmp'))).toEqual([])
  })

  it('unbekannte Vorfassung ist weder Neuanlage noch Checkbox-Wechsel', async () => {
    await write({ before: undefined, after: '- [x] A' })
    const log = await readDayLog(vault)
    expect(log.events).toEqual([{ at: NOW, kind: 'note-saved', note: 'a.md', created: false, origin: 'renderer' }])
  })

  it('reservierte leere Datei kann als Neuanlage vermerkt werden; „angelegt“ nur einmal je Tag', async () => {
    await Promise.all([
      write({ note: 'agent.md', before: null, after: '# Ergebnis', created: true, origin: 'agent' }),
      write({ note: 'agent.md', before: null, after: '# Ergebnis 2', created: true, origin: 'agent', at: NOW + 1 })
    ])
    const log = await readDayLog(vault)
    expect(log.events.filter(e => e.kind === 'note-saved' && e.created)).toHaveLength(1)
  })

  it('wirft auch bei kaputten Eingaben nie', async () => {
    await expect(recordNoteWrite({ vaultPath: vault, note: undefined as unknown as string, before: 'a', after: 'b', origin: 'app' })).resolves.toBeUndefined()
    await expect(recordNoteWrite({ vaultPath: undefined as unknown as string, note: 'a.md', before: 'a', after: 'b', origin: 'app' })).resolves.toBeUndefined()
  })

  it('ein gescheiterter Eintrag gilt nicht als vermerkt und hinterlässt eine Lücke', async () => {
    await write({ note: 'vorher.md' })
    const dir = path.join(userDataDir, 'daylog')
    const file = path.join(dir, (await fs.readdir(dir))[0])
    // Schreiben scheitern lassen: an der Stelle der Zwischendatei liegt ein Ordner.
    await fs.mkdir(`${file}.tmp`)
    await write({ note: 'a.md', at: NOW + 1000 })
    expect((await readDayLog(vault)).events.map(e => e.note)).toEqual(['vorher.md'])
    await fs.rmdir(`${file}.tmp`)
    // Der nächste Autosave derselben Notiz versucht es erneut — der Tageseintrag geht nicht verloren.
    await write({ note: 'a.md', before: 'neu', after: 'neuer', at: NOW + 5000 })
    const log = await readDayLog(vault)
    expect(log.events.map(e => e.note)).toEqual(['vorher.md', 'a.md'])
    expect(log.gaps).toEqual([{ from: NOW + 1000, to: NOW + 5000 }])
  })

  it('zieht beim Umbenennen die Pfade nach und vermerkt den Wechsel', async () => {
    await write({ note: 'Inbox/a.md', before: '- [ ] A', after: '- [x] A' })
    await recordNoteMove({ vaultPath: vault, from: 'Inbox/a.md', to: 'Projekte/a.md', isDirectory: false, origin: 'renderer', at: NOW + 10 })
    await recordNoteMove({ vaultPath: vault, from: 'Projekte', to: 'Archiv/Projekte', isDirectory: true, origin: 'renderer', at: NOW + 20 })
    await recordNoteMove({ vaultPath: vault, from: 'bild.png', to: 'neu.png', isDirectory: false, origin: 'renderer', at: NOW + 30 })
    await recordNoteMove({ vaultPath: vault, from: 'Archiv/Projekte/a.md', to: 'Archiv/Projekte/b.md', isDirectory: false, origin: 'renderer', at: NOW + 86400000 })
    await recordNoteMove({ vaultPath: vault, from: 'Archiv/Projekte/b.md', to: 'Archiv/Projekte/a.md', isDirectory: false, origin: 'renderer', at: NOW + 86400001 })
    const log = await readDayLog(vault)
    // Speicher- und Checkbox-Einträge folgen der Notiz …
    expect(log.events.filter(e => e.kind !== 'note-moved').every(e => e.note === 'Archiv/Projekte/a.md')).toBe(true)
    // … die Umbenennungen selbst bleiben, wie sie geschahen (kein rückwirkendes A → C).
    expect(log.events.filter(e => e.kind === 'note-moved').map(e => e.kind === 'note-moved' && `${e.from} → ${e.note}`)).toEqual([
      'Inbox/a.md → Projekte/a.md',
      'Archiv/Projekte/a.md → Archiv/Projekte/b.md',
      'Archiv/Projekte/b.md → Archiv/Projekte/a.md'
    ])
    // Nach der Pfadänderung gilt die Notiz unter dem neuen Namen weiter als heute vermerkt.
    await write({ note: 'Archiv/Projekte/a.md', before: 'x', after: 'y', at: NOW + 40 })
    expect((await readDayLog(vault)).events.filter(e => e.kind === 'note-saved')).toHaveLength(1)
  })

  it('trägt neu ein, wenn die Protokolldatei nach dem ersten Speichern entfernt wurde', async () => {
    await write({})
    const dir = path.join(userDataDir, 'daylog')
    await fs.rm(path.join(dir, (await fs.readdir(dir))[0]))
    await write({ before: 'neu', after: 'neuer', at: NOW + 50 })
    const log = await readDayLog(vault)
    expect(log.events.map(e => e.note)).toEqual(['a.md'])
    expect(log.since).toBe(NOW + 50)
  })

  it('hält einen Ausfall neben der Datei fest, solange er andauert', async () => {
    await write({ note: 'vorher.md' })
    const dir = path.join(userDataDir, 'daylog')
    const file = path.join(dir, (await fs.readdir(dir))[0])
    await fs.mkdir(`${file}.tmp`)
    await write({ note: 'a.md', at: NOW + 1000 })
    expect(await fs.readFile(`${file}.gap`, 'utf-8')).toBe(String(NOW + 1000))
    // Solange der Ausfall andauert, meldet das Lesen eine offene Lücke.
    expect((await readDayLog(vault)).gaps[0]?.from).toBe(NOW + 1000)
    await fs.rmdir(`${file}.tmp`)
    await write({ note: 'b.md', at: NOW + 2000 })
    expect(await fs.access(`${file}.gap`).then(() => true, () => false)).toBe(false)
    expect((await readDayLog(vault)).gaps).toEqual([{ from: NOW + 1000, to: NOW + 2000 }])
  })
})
