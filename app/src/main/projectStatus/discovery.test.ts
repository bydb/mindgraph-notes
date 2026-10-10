// Codex F26 (10.10.2026): Projektordner im internen App-Ordner `.mindgraph` dürfen
// nicht entdeckt werden — sonst läse project_ask (Telegram) dort Quellen ein.
// Echte Dateien und Symlinks in temporären Verzeichnissen.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { discoverProjects } from './discovery'

const MARKER = '---\nproject: Test\nkeywords: alpha, beta\n---\n'
let base: string
let vault: string

async function project(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(path.join(dir, '_STATUS.md'), MARKER, 'utf-8')
}

beforeEach(async () => {
  base = await fs.mkdtemp(path.join(os.tmpdir(), 'mg-discovery-'))
  vault = path.join(base, 'vault')
  await project(path.join(vault, 'Projekte', 'Echt'))
  await project(path.join(vault, '.mindgraph', 'versteckt'))
})

afterEach(async () => {
  await fs.rm(base, { recursive: true, force: true })
})

describe('discoverProjects — .mindgraph ausgeschlossen', () => {
  it('findet normale Projekte', async () => {
    const found = await discoverProjects(vault, 'Projekte')
    expect(found.map(p => p.folderName)).toEqual(['Echt'])
  })

  it('Symlink-Einträge im Projektordner werden schon als Nicht-Ordner übersprungen', async () => {
    await fs.symlink(path.join(vault, '.mindgraph', 'versteckt'), path.join(vault, 'Projekte', 'Link'))
    const found = await discoverProjects(vault, 'Projekte')
    expect(found.map(p => p.folderName)).toEqual(['Echt'])
  })

  it('Projekt-Wurzel als Symlink auf .mindgraph liefert nichts (Codex F34)', async () => {
    await fs.symlink(path.join(vault, '.mindgraph'), path.join(vault, 'Tarnung'))
    expect(await discoverProjects(vault, 'Tarnung')).toEqual([])
  })

  it('Projekt-Wurzel .mindgraph liefert nichts', async () => {
    expect(await discoverProjects(vault, '.mindgraph')).toEqual([])
    expect(await discoverProjects(vault, '.MindGraph')).toEqual([])
  })

  it('Projekt-Wurzel = Vault-Wurzel überspringt den Ordner .mindgraph selbst', async () => {
    await fs.writeFile(path.join(vault, '.mindgraph', '_STATUS.md'), MARKER, 'utf-8')
    const found = await discoverProjects(vault, '')
    expect(found.map(p => p.folderName)).toEqual([])
  })
})
