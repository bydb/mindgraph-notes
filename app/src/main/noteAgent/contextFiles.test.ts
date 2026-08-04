import { describe, expect, it } from 'vitest'
import { promises as fs } from 'fs'
import * as os from 'os'
import * as path from 'path'
import {
  clearContextAttachments,
  listFolderManifest,
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
