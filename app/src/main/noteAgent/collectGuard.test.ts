// Leitplanke gegen das Einzellesen ganzer Ordner.
//
// Anlass: zwei Praxisläufe am 04./05.08.2026 mit 34 gleichartigen Schul-Tabellen.
// Beide endeten in der Zeitüberschreitung, weil das Modell 25 bzw. 31 Dateien
// einzeln in seinen Kontext lud statt sie mit EINEM collect_table-Aufruf
// zusammenzuführen — obwohl der System-Prompt genau das vorschreibt. Der Hinweis
// im Prompt reicht nicht; hier wird geprüft, dass die App es erzwingt.

import { describe, expect, it } from 'vitest'
import { promises as fs } from 'fs'
import * as os from 'os'
import * as path from 'path'
import { registerContextFolder, clearContextAttachments, countFolderTables, resolveFolderName } from './contextFiles'

async function makeTableFolder(fileCount: number): Promise<{ root: string; folder: string }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mindgraph-collect-guard-'))
  const folder = path.join(root, 'Rückmeldungen')
  await fs.mkdir(folder, { recursive: true })
  for (let i = 0; i < fileCount; i++) {
    // CSV reicht: countFolderTables zählt Tabellen, ohne sie zu parsen.
    await fs.writeFile(path.join(folder, `schule-${i}.csv`), 'Vorname;Nachname\nAnna;Meier\n', 'utf8')
  }
  await fs.writeFile(path.join(folder, 'hinweis.md'), 'keine Tabelle', 'utf8')
  return { root, folder }
}

describe('Leitplanke: Einzellesen aus Tabellen-Ordnern', () => {
  it('zählt Tabellen im Ordner, aber keine anderen Dateien', async () => {
    const senderId = 941_001
    const { root, folder } = await makeTableFolder(12)
    try {
      const reg = await registerContextFolder(senderId, folder, false)
      expect(reg.ok).toBe(true)
      if (!reg.ok) throw new Error('Ordner nicht registrierbar')
      const ids = [reg.attachment.id]
      // 12 CSV + 1 Markdown → nur die 12 Tabellen zählen.
      expect(await countFolderTables(senderId, ids, reg.attachment.name)).toBe(12)
    } finally {
      clearContextAttachments(senderId)
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it('löst den Ordnernamen auf, auch wenn das Modell ihn anders schreibt', async () => {
    const senderId = 941_002
    const { root, folder } = await makeTableFolder(2)
    try {
      const reg = await registerContextFolder(senderId, folder, false)
      if (!reg.ok) throw new Error('Ordner nicht registrierbar')
      const ids = [reg.attachment.id]
      // Kleinschreibung — das Modell tippt Namen selten exakt ab.
      expect(resolveFolderName(senderId, ids, 'rückmeldungen')).toBe(reg.attachment.name)
      // Bei genau EINEM angehängten Ordner ist auch ein falscher Name eindeutig.
      expect(resolveFolderName(senderId, ids, 'irgendwas')).toBe(reg.attachment.name)
    } finally {
      clearContextAttachments(senderId)
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it('verweist auf den Anhängen-Weg, wenn gar kein Ordner angehängt ist', () => {
    const senderId = 941_003
    expect(() => resolveFolderName(senderId, [], 'Rückmeldungen')).toThrowError(/Kontext-Button|angehängt/i)
  })
})

// Der eigentliche Beweis: das Werkzeug selbst verweigert ab der vierten Datei.
describe('read_context_file sperrt nach drei Dateien', () => {
  it('liefert drei Dateien und verweist danach auf collect_table', async () => {
    const { createNoteAgentRegistry } = await import('./skills')
    const senderId = 941_010
    const { root, folder } = await makeTableFolder(12)
    try {
      const reg = await registerContextFolder(senderId, folder, false)
      if (!reg.ok) throw new Error('Ordner nicht registrierbar')
      const run = {
        vaultPath: root,
        attachmentIds: [reg.attachment.id],
        folderReads: new Map<string, number>(),
        collectedFolders: new Set<string>(),
        sources: new Set<string>(),
        datasets: new Map()
      } as never
      const registry = createNoteAgentRegistry()
      const tool = registry.get('read_context_file')!
      const ctx = { senderId, run } as never

      for (let i = 0; i < 3; i++) {
        const res = await tool.run({ folder: reg.attachment.name, file: `schule-${i}.csv` }, ctx)
        expect(res.ok, `Datei ${i} sollte lesbar sein`).toBe(true)
      }
      const blocked = await tool.run({ folder: reg.attachment.name, file: 'schule-3.csv' }, ctx)
      expect(blocked.ok).toBe(false)
      expect(blocked.content).toMatch(/STOPP/)
      expect(blocked.content).toMatch(/collect_table/)
      expect(blocked.content).toMatch(/12 Tabellen/)
    } finally {
      clearContextAttachments(senderId)
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it('lässt kleine Ordner in Ruhe', async () => {
    const { createNoteAgentRegistry } = await import('./skills')
    const senderId = 941_011
    const { root, folder } = await makeTableFolder(4)
    try {
      const reg = await registerContextFolder(senderId, folder, false)
      if (!reg.ok) throw new Error('Ordner nicht registrierbar')
      const run = {
        vaultPath: root,
        attachmentIds: [reg.attachment.id],
        folderReads: new Map<string, number>(),
        collectedFolders: new Set<string>(),
        sources: new Set<string>(),
        datasets: new Map()
      } as never
      const tool = createNoteAgentRegistry().get('read_context_file')!
      const ctx = { senderId, run } as never
      for (let i = 0; i < 4; i++) {
        const res = await tool.run({ folder: reg.attachment.name, file: `schule-${i}.csv` }, ctx)
        expect(res.ok, `Datei ${i} bei nur 4 Tabellen`).toBe(true)
      }
    } finally {
      clearContextAttachments(senderId)
      await fs.rm(root, { recursive: true, force: true })
    }
  })
})
