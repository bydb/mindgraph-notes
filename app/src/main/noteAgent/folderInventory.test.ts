// Ordner-Anhänge mit Unterordnern: Anhang-Grenze, Inventur, Lesen über Deskriptor.
// Plan: docs/codex-collab/agent-rueckblick-unterordner.md (Baustein A, F05/F26/F32/F33).

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { promises as fs } from 'fs'
import * as os from 'os'
import * as path from 'path'
import {
  captureFolderRoot, inventoryFolder, parseFolderRelPath, readFileInFolder, MAX_INVENTORY_DEPTH
} from './folderInventory'

const kindOf = (name: string): string | null => (/\.(md|csv|xlsx)$/i.test(name) ? name.split('.').pop()!.toLowerCase() : null)

let tmp: string

beforeEach(async () => {
  tmp = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'mindgraph-inventory-')))
})

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true })
})

async function write(rel: string, content = 'x'): Promise<string> {
  const abs = path.join(tmp, rel)
  await fs.mkdir(path.dirname(abs), { recursive: true })
  await fs.writeFile(abs, content, 'utf8')
  return abs
}

describe('parseFolderRelPath', () => {
  it('nimmt relative Pfade an, auch mit Rückwärtsstrich', () => {
    expect(parseFolderRelPath('2026/03/eintrag.md')).toEqual(['2026', '03', 'eintrag.md'])
    expect(parseFolderRelPath('2026\\03\\eintrag.md')).toEqual(['2026', '03', 'eintrag.md'])
  })

  it.each(['', '/etc/passwd', 'C:\\Windows', '..', 'a/../b', './a', 'a//b', '.mindgraph/x.md', 'a/.versteckt/b.md'])(
    'lehnt "%s" ab',
    bad => {
      expect(() => parseFolderRelPath(bad)).toThrow()
    }
  )
})

describe('captureFolderRoot', () => {
  it('lehnt einen versteckten Ordner als Anhang ab', async () => {
    await fs.mkdir(path.join(tmp, '.geheim'))
    await expect(captureFolderRoot(path.join(tmp, '.geheim'), false)).rejects.toThrow(/Versteckte Ordner/)
  })

  it('lehnt Ordner unter .mindgraph im Vault ab', async () => {
    await fs.mkdir(path.join(tmp, '.mindgraph', 'backups'), { recursive: true })
    await expect(captureFolderRoot(path.join(tmp, '.mindgraph', 'backups'), true, tmp)).rejects.toThrow(/versteckten Vault-Bereichen/)
  })

  it('erlaubt externe Ordner unter versteckten Vorfahren — der Nutzer hat sie im Dialog gewählt', async () => {
    await fs.mkdir(path.join(tmp, '.config', 'projekt'), { recursive: true })
    const root = await captureFolderRoot(path.join(tmp, '.config', 'projekt'), false)
    expect(root.rootReal).toBe(path.join(tmp, '.config', 'projekt'))
  })
})

describe('inventoryFolder', () => {
  it('erfasst Unterordner, überspringt Verknüpfungen und Verstecktes, direkte Dateien zuerst', async () => {
    const outside = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'mindgraph-outside-')))
    try {
      await fs.writeFile(path.join(outside, 'geheim.md'), 'fremd', 'utf8')
      await write('Journal/zz-direkt.md')
      await write('Journal/2026/03/2026-03-14.md')
      await write('Journal/2026/01/2026-01-02.md')
      await write('Journal/2026/01/bild.png')
      await write('Journal/.obsidian/config.md')
      await fs.symlink(path.join(outside, 'geheim.md'), path.join(tmp, 'Journal', 'link.md'))
      await fs.symlink(outside, path.join(tmp, 'Journal', 'link-ordner'))

      const root = await captureFolderRoot(path.join(tmp, 'Journal'), false)
      const inv = await inventoryFolder(root, 'Journal', kindOf)

      expect(inv.files.map(f => f.relPath)).toEqual(['zz-direkt.md', '2026/01/2026-01-02.md', '2026/03/2026-03-14.md'])
      expect(inv.files[1]).toMatchObject({ name: '2026-01-02.md', dir: '2026/01', kind: 'md' })
      expect(inv.dirs.map(d => d.relPath)).toEqual(['2026', '2026/01', '2026/03'])
      expect(inv.symlinkCount).toBe(2)
      expect(inv.hiddenCount).toBe(1)
      expect(inv.unsupportedCount).toBe(1)
      expect(inv.incomplete).toBeUndefined()
      expect(inv.files.some(f => f.relPath.includes('geheim'))).toBe(false)
    } finally {
      await fs.rm(outside, { recursive: true, force: true })
    }
  })

  it('markiert die Inventur als unvollständig, wenn die Tiefen-Grenze greift — mit Ort', async () => {
    const deep = Array.from({ length: MAX_INVENTORY_DEPTH + 1 }, (_, i) => `e${i + 1}`).join('/')
    await write(`Tief/${deep}/ganz-unten.md`)
    await write('Tief/oben.md')
    const root = await captureFolderRoot(path.join(tmp, 'Tief'), false)
    const inv = await inventoryFolder(root, 'Tief', kindOf)
    expect(inv.incomplete?.reason).toBe('depth')
    expect(inv.incomplete?.at.split('/').length).toBe(MAX_INVENTORY_DEPTH + 1)
    expect(inv.files.map(f => f.relPath)).toEqual(['oben.md'])
  })
})

describe('readFileInFolder', () => {
  it('liest eine Datei im Unterordner', async () => {
    await write('Ordner/a/b/datei.md', 'Inhalt')
    const root = await captureFolderRoot(path.join(tmp, 'Ordner'), false)
    const buf = await readFileInFolder(root, 'a/b/datei.md', 1024, 'Ordner')
    expect(buf.toString('utf8')).toBe('Inhalt')
  })

  it('lehnt einen Zwischenordner ab, der nachträglich zur Verknüpfung nach außen wurde', async () => {
    const outside = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'mindgraph-outside-')))
    try {
      await fs.writeFile(path.join(outside, 'datei.md'), 'fremd', 'utf8')
      await write('Ordner/a/datei.md', 'eigen')
      const root = await captureFolderRoot(path.join(tmp, 'Ordner'), false)
      await fs.rm(path.join(tmp, 'Ordner', 'a'), { recursive: true })
      await fs.symlink(outside, path.join(tmp, 'Ordner', 'a'))
      await expect(readFileInFolder(root, 'a/datei.md', 1024, 'Ordner')).rejects.toThrow(/Verknüpfung/)
    } finally {
      await fs.rm(outside, { recursive: true, force: true })
    }
  })

  it('lehnt eine Datei-Verknüpfung ab', async () => {
    await write('Ordner/echt.md', 'eigen')
    await fs.symlink(path.join(tmp, 'Ordner', 'echt.md'), path.join(tmp, 'Ordner', 'link.md'))
    const root = await captureFolderRoot(path.join(tmp, 'Ordner'), false)
    await expect(readFileInFolder(root, 'link.md', 1024, 'Ordner')).rejects.toThrow(/Verknüpfung/)
  })

  it('erkennt einen ersetzten Anhang-Ordner (gleicher Pfad, anderer Ordner)', async () => {
    await write('Ordner/datei.md', 'alt')
    const root = await captureFolderRoot(path.join(tmp, 'Ordner'), false)
    await fs.rename(path.join(tmp, 'Ordner'), path.join(tmp, 'Ordner-alt'))
    await write('Ordner/datei.md', 'untergeschoben')
    await expect(readFileInFolder(root, 'datei.md', 1024, 'Ordner')).rejects.toThrow(/verschoben oder ersetzt/)
    await expect(inventoryFolder(root, 'Ordner', kindOf)).rejects.toThrow(/verschoben oder ersetzt/)
  })

  it('lehnt zu große Dateien vor dem Lesen ab', async () => {
    await write('Ordner/gross.md', 'x'.repeat(2048))
    const root = await captureFolderRoot(path.join(tmp, 'Ordner'), false)
    await expect(readFileInFolder(root, 'gross.md', 1024, 'Ordner')).rejects.toThrow(/zu groß/)
  })
})
