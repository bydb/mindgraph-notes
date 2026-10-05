import { describe, expect, it } from 'vitest'
import { promises as fs } from 'fs'
import * as os from 'os'
import * as path from 'path'
import {
  clearContextAttachments,
  collectFolderTable,
  countFolderTables,
  listFolderManifest,
  readAttachmentRaw,
  readFolderFile,
  registerContextFolder
} from './contextFiles'

async function createFolder(root: string, parent: string, marker: string): Promise<string> {
  const folder = path.join(root, parent, 'Rückmeldungen')
  await fs.mkdir(folder, { recursive: true })
  await fs.writeFile(path.join(folder, `${marker}.md`), marker, 'utf8')
  return folder
}

describe('Kontextordner mit gleichem Basisnamen', () => {
  it('adressiert zwei Vault-Ordner über eindeutige vault-relative Namen', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mindgraph-context-folders-vault-'))
    const senderId = 731_001
    try {
      const firstPath = await createFolder(root, 'Projekt A', 'aus-a')
      const secondPath = await createFolder(root, 'Projekt B', 'aus-b')
      const first = await registerContextFolder(senderId, firstPath, true, root)
      const second = await registerContextFolder(senderId, secondPath, true, root)

      expect(first.ok).toBe(true)
      expect(second.ok).toBe(true)
      if (!first.ok || !second.ok) throw new Error('Testordner konnten nicht registriert werden')

      expect(first.attachment.name).toBe('Projekt A/Rückmeldungen')
      expect(second.attachment.name).toBe('Projekt B/Rückmeldungen')

      const ids = [first.attachment.id, second.attachment.id]
      const firstManifest = await listFolderManifest(senderId, ids, first.attachment.name)
      const secondManifest = await listFolderManifest(senderId, ids, second.attachment.name)
      expect(firstManifest.files.map(file => file.name)).toEqual(['aus-a.md'])
      expect(secondManifest.files.map(file => file.name)).toEqual(['aus-b.md'])
    } finally {
      clearContextAttachments(senderId)
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it('vergibt für externe gleichnamige Ordner eindeutige Namen ohne Pfadfreigabe', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mindgraph-context-folders-external-'))
    const senderId = 731_002
    try {
      const firstPath = await createFolder(root, 'Extern A', 'aus-a')
      const secondPath = await createFolder(root, 'Extern B', 'aus-b')
      const first = await registerContextFolder(senderId, firstPath, false)
      const second = await registerContextFolder(senderId, secondPath, false)

      expect(first.ok).toBe(true)
      expect(second.ok).toBe(true)
      if (!first.ok || !second.ok) throw new Error('Testordner konnten nicht registriert werden')

      expect(first.attachment.name).toBe('Rückmeldungen')
      expect(second.attachment.name).toBe('Rückmeldungen (2)')
      expect(second.attachment.name).not.toContain(root)

      const secondManifest = await listFolderManifest(
        senderId,
        [first.attachment.id, second.attachment.id],
        second.attachment.name
      )
      expect(secondManifest.files.map(file => file.name)).toEqual(['aus-b.md'])
    } finally {
      clearContextAttachments(senderId)
      await fs.rm(root, { recursive: true, force: true })
    }
  })
})

// Baustein A (docs/codex-collab/agent-rueckblick-unterordner.md): alle Ordner-Werkzeuge
// sehen denselben Baum samt Unterordnern.
describe('Kontextordner mit Unterordnern', () => {
  async function journal(root: string): Promise<string> {
    const folder = path.join(root, 'Journal')
    for (const month of ['01', '02', '03']) {
      for (const day of ['01', '15']) {
        const dir = path.join(folder, '2026', month)
        await fs.mkdir(dir, { recursive: true })
        await fs.writeFile(path.join(dir, `2026-${month}-${day}.md`), `Eintrag ${month}-${day}`, 'utf8')
      }
    }
    return folder
  }

  it('Ordner nur mit Unterordnern: read_attachment meldet sie statt eines Fehlers (F18)', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mindgraph-sub-only-'))
    const senderId = 731_101
    try {
      const reg = await registerContextFolder(senderId, await journal(root), false)
      if (!reg.ok) throw new Error(reg.error)
      const res = await readAttachmentRaw(senderId, reg.attachment.id, 'Jahreszusammenfassung')
      expect(res.content).toContain('UNTERORDNER: 6 weitere Dateien')
      expect(res.content).toContain('- 2026/ — 6 Dateien')
      expect(res.content).toContain('list_context_folder')
      expect(res.truncated).toBe(true)
    } finally {
      clearContextAttachments(senderId)
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it('Manifest listet kleine Bäume mit Pfaden, read_context_file liest per Pfad und per eindeutigem Namen', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mindgraph-sub-list-'))
    const senderId = 731_102
    try {
      const reg = await registerContextFolder(senderId, await journal(root), false)
      if (!reg.ok) throw new Error(reg.error)
      const ids = [reg.attachment.id]
      const manifest = await listFolderManifest(senderId, ids, 'Journal')
      expect(manifest.mode).toBe('list')
      expect(manifest.totalFiles).toBe(6)
      expect(manifest.files.map(f => f.name)).toContain('2026/02/2026-02-15.md')

      const byPath = await readFolderFile(senderId, ids, 'Journal', '2026/02/2026-02-15.md')
      expect(byPath.content).toBe('Eintrag 02-15')
      const byName = await readFolderFile(senderId, ids, 'Journal', '2026-03-01.md')
      expect(byName.fileName).toBe('2026/03/2026-03-01.md')
      await expect(readFolderFile(senderId, ids, 'Journal', '../geheim.md')).rejects.toThrow()
    } finally {
      clearContextAttachments(senderId)
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it('mehrdeutiger Dateiname verlangt den Pfad statt die erstbeste Datei zu nehmen', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mindgraph-sub-ambig-'))
    const senderId = 731_103
    try {
      const folder = path.join(root, 'Projekt')
      for (const sub of ['Schule A', 'Schule B']) {
        await fs.mkdir(path.join(folder, sub), { recursive: true })
        await fs.writeFile(path.join(folder, sub, 'Rückmeldung.csv'), `Name;Zusage\n${sub};ja\n`, 'utf8')
      }
      const reg = await registerContextFolder(senderId, folder, false)
      if (!reg.ok) throw new Error(reg.error)
      const ids = [reg.attachment.id]
      await expect(readFolderFile(senderId, ids, 'Projekt', 'Rückmeldung.csv')).rejects.toThrow(/mehrfach/)

      expect(await countFolderTables(senderId, ids, 'Projekt')).toBe(2)
      const table = await collectFolderTable(senderId, ids, 'Projekt', ['Name', 'Zusage'])
      expect(table.rows.map(r => r[r.length - 1]).sort()).toEqual(['Schule A/Rückmeldung.csv', 'Schule B/Rückmeldung.csv'])
      expect(table.truncated).toBe(false)
    } finally {
      clearContextAttachments(senderId)
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it('große Bäume kommen als Übersicht, mit subfolder hinein und mit offset weiter', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mindgraph-sub-overview-'))
    const senderId = 731_104
    try {
      const folder = path.join(root, 'Archiv')
      for (let m = 1; m <= 12; m++) {
        const dir = path.join(folder, String(m).padStart(2, '0'))
        await fs.mkdir(dir, { recursive: true })
        for (let d = 1; d <= 10; d++) await fs.writeFile(path.join(dir, `tag-${d}.md`), 'x', 'utf8')
      }
      await fs.writeFile(path.join(folder, 'index.md'), 'x', 'utf8')
      const reg = await registerContextFolder(senderId, folder, false)
      if (!reg.ok) throw new Error(reg.error)
      const ids = [reg.attachment.id]

      const overview = await listFolderManifest(senderId, ids, 'Archiv')
      expect(overview.mode).toBe('overview')
      expect(overview.totalFiles).toBe(121)
      expect(overview.dirs).toHaveLength(12)
      expect(overview.dirs[0]).toEqual({ relPath: '01', files: 10, tables: 0 })
      expect(overview.files.map(f => f.name)).toEqual(['index.md'])

      const march = await listFolderManifest(senderId, ids, 'Archiv', { subfolder: '03' })
      expect(march.mode).toBe('list')
      expect(march.files).toHaveLength(10)
      expect(march.files.every(f => f.name.startsWith('03/'))).toBe(true)
      await expect(listFolderManifest(senderId, ids, 'Archiv', { subfolder: '13' })).rejects.toThrow(/gibt es/)
    } finally {
      clearContextAttachments(senderId)
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it('blättert eine Übersicht mit mehr als 100 Einträgen', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mindgraph-sub-paging-'))
    const senderId = 731_105
    try {
      const folder = path.join(root, 'Viele')
      await fs.mkdir(path.join(folder, 'unter'), { recursive: true })
      await fs.writeFile(path.join(folder, 'unter', 'a.md'), 'x', 'utf8')
      for (let i = 0; i < 130; i++) await fs.writeFile(path.join(folder, `n-${String(i).padStart(3, '0')}.md`), 'x', 'utf8')
      const reg = await registerContextFolder(senderId, folder, false)
      if (!reg.ok) throw new Error(reg.error)
      const ids = [reg.attachment.id]
      const first = await listFolderManifest(senderId, ids, 'Viele')
      expect(first.mode).toBe('overview')
      expect(first.dirs.length + first.files.length).toBe(100)
      expect(first.nextOffset).toBe(101)
      const second = await listFolderManifest(senderId, ids, 'Viele', { offset: first.nextOffset })
      expect(second.files.length).toBe(31)
      expect(second.nextOffset).toBeUndefined()
    } finally {
      clearContextAttachments(senderId)
      await fs.rm(root, { recursive: true, force: true })
    }
  })
})

// Baustein B: read_context_file blättert passend zum Kontextbudget, statt abgelehnt zu werden.
describe('Lesen nach Kontextbudget', () => {
  it('liefert weniger Zeilen und verweist mit offset auf den Rest', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mindgraph-read-budget-'))
    const senderId = 731_201
    try {
      const folder = path.join(root, 'Texte')
      await fs.mkdir(folder, { recursive: true })
      const lines = Array.from({ length: 150 }, (_, i) => `Zeile ${i + 1}: Die Robotik-AG baut einen Linienfolger mit sieben Schülern.`)
      await fs.writeFile(path.join(folder, 'lang.md'), lines.join('\n'), 'utf8')
      const reg = await registerContextFolder(senderId, folder, false)
      if (!reg.ok) throw new Error(reg.error)
      const ids = [reg.attachment.id]

      const full = await readFolderFile(senderId, ids, 'Texte', 'lang.md')
      expect(full.truncated).toBe(false)
      const paged = await readFolderFile(senderId, ids, 'Texte', 'lang.md', { maxTokens: 1_000 })
      expect(paged.truncated).toBe(true)
      expect(paged.content).toMatch(/weiter mit offset=\d+/)
      expect(paged.content.length).toBeLessThan(full.content.length / 3)
    } finally {
      clearContextAttachments(senderId)
      await fs.rm(root, { recursive: true, force: true })
    }
  })
})
