// Regressionstests für die symlink-sichere Vault-Pfad-Auflösung.
// Kernszenario: ein Symlink IM Vault zeigt nach AUSSEN — die alte rein
// lexikalische Prüfung ließ das durch, readFile/writeFile folgten dem Link.
// Echte Dateien/Symlinks in temporären Verzeichnissen, keine Mocks.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { resolveInVaultSafe, ensureAbsInVaultSafe, isAppInternalRealPath } from './vaultPaths'

let base: string
let vault: string
let vaultReal: string
let outside: string

beforeEach(async () => {
  base = await fs.mkdtemp(path.join(os.tmpdir(), 'mg-vaultpaths-'))
  vault = path.join(base, 'vault')
  outside = path.join(base, 'outside')
  await fs.mkdir(path.join(vault, 'ordner'), { recursive: true })
  await fs.mkdir(outside, { recursive: true })
  await fs.writeFile(path.join(vault, 'notiz.md'), '# ok', 'utf-8')
  await fs.writeFile(path.join(vault, 'ordner', 'tief.md'), '# tief', 'utf-8')
  await fs.writeFile(path.join(outside, 'geheim.md'), 'geheim', 'utf-8')
  // os.tmpdir() ist auf macOS selbst ein Symlink (/var → /private/var) —
  // Vergleiche laufen deshalb gegen den kanonischen Vault-Pfad.
  vaultReal = await fs.realpath(vault)
})

afterEach(async () => {
  await fs.rm(base, { recursive: true, force: true })
})

describe('resolveInVaultSafe', () => {
  it('normale relative Pfade werden kanonisch aufgelöst', async () => {
    expect(await resolveInVaultSafe(vault, 'notiz.md')).toBe(path.join(vaultReal, 'notiz.md'))
    expect(await resolveInVaultSafe(vault, 'ordner/tief.md')).toBe(path.join(vaultReal, 'ordner', 'tief.md'))
  })

  it('noch nicht existierende Ziele (note_create) sind erlaubt', async () => {
    expect(await resolveInVaultSafe(vault, 'neu/tiefer/datei.md')).toBe(
      path.join(vaultReal, 'neu', 'tiefer', 'datei.md')
    )
  })

  it('absolute Pfade werden abgewiesen', async () => {
    await expect(resolveInVaultSafe(vault, path.join(outside, 'geheim.md'))).rejects.toThrow(/Absoluter Pfad/)
  })

  it('../-Traversal wird abgewiesen', async () => {
    await expect(resolveInVaultSafe(vault, '../outside/geheim.md')).rejects.toThrow(/außerhalb/)
    await expect(resolveInVaultSafe(vault, 'ordner/../../outside/geheim.md')).rejects.toThrow(/außerhalb/)
  })

  it('REGRESSION: Symlink-Datei im Vault → außerhalb wird abgewiesen', async () => {
    await fs.symlink(path.join(outside, 'geheim.md'), path.join(vault, 'link.md'))
    await expect(resolveInVaultSafe(vault, 'link.md')).rejects.toThrow(/Symlink/)
  })

  it('REGRESSION: Pfad durch Symlink-Ordner → außerhalb wird abgewiesen (Lesen)', async () => {
    await fs.symlink(outside, path.join(vault, 'extern-link'))
    await expect(resolveInVaultSafe(vault, 'extern-link/geheim.md')).rejects.toThrow(/Symlink/)
  })

  it('REGRESSION: neue Datei unter Symlink-Ordner → außerhalb wird abgewiesen (Erstellen)', async () => {
    await fs.symlink(outside, path.join(vault, 'extern-link'))
    await expect(resolveInVaultSafe(vault, 'extern-link/neu.md')).rejects.toThrow(/Symlink/)
  })

  it('Symlink, der INNERHALB des Vaults bleibt, ist erlaubt', async () => {
    await fs.symlink(path.join(vault, 'ordner'), path.join(vault, 'alias'))
    expect(await resolveInVaultSafe(vault, 'alias/tief.md')).toBe(path.join(vaultReal, 'ordner', 'tief.md'))
  })

  it('Vault-Root darf selbst ein Symlink sein', async () => {
    const rootLink = path.join(base, 'vault-link')
    await fs.symlink(vault, rootLink)
    expect(await resolveInVaultSafe(rootLink, 'notiz.md')).toBe(path.join(vaultReal, 'notiz.md'))
  })
})

describe('ensureAbsInVaultSafe', () => {
  it('absoluter Pfad im Vault ist erlaubt und wird kanonisiert', async () => {
    expect(await ensureAbsInVaultSafe(vault, path.join(vault, 'notiz.md'))).toBe(
      path.join(vaultReal, 'notiz.md')
    )
  })

  it('absoluter Pfad außerhalb wird abgewiesen', async () => {
    await expect(ensureAbsInVaultSafe(vault, path.join(outside, 'geheim.md'))).rejects.toThrow(/außerhalb/)
  })

  it('REGRESSION: Symlink im Vault → außerhalb wird abgewiesen', async () => {
    await fs.symlink(outside, path.join(vault, 'extern-link'))
    await expect(ensureAbsInVaultSafe(vault, path.join(vault, 'extern-link', 'geheim.md'))).rejects.toThrow(/Symlink/)
  })
})

// Codex F03 (Fortbildungs-Review 10.10.2026): `.mindgraph` ist interner App-Speicher
// (Entwürfe anderer Läufe, Backups, Indizes) — kein Agent-Werkzeug darf dort lesen
// oder schreiben, auch nicht über einen Symlink oder eine andere Schreibweise.
describe('resolveInVaultSafe — .mindgraph gesperrt', () => {
  beforeEach(async () => {
    await fs.mkdir(path.join(vault, '.mindgraph', 'agent-staging', 'run-1'), { recursive: true })
    await fs.writeFile(path.join(vault, '.mindgraph', 'agent-staging', 'run-1', 'entwurf.md'), 'intern', 'utf-8')
  })

  it('direkter Pfad wird abgewiesen', async () => {
    await expect(resolveInVaultSafe(vault, '.mindgraph/agent-staging/run-1/entwurf.md')).rejects.toThrow(/\.mindgraph/)
  })

  it('Umweg über ../ wird abgewiesen', async () => {
    await expect(resolveInVaultSafe(vault, 'ordner/../.mindgraph/agent-staging/run-1/entwurf.md')).rejects.toThrow(/\.mindgraph/)
  })

  it('andere Schreibweise wird abgewiesen', async () => {
    await expect(resolveInVaultSafe(vault, '.MindGraph/agent-staging/run-1/entwurf.md')).rejects.toThrow(/\.mindgraph/)
  })

  it('noch nicht existierende Datei darin (note_create) wird abgewiesen', async () => {
    await expect(resolveInVaultSafe(vault, '.mindgraph/neu.md')).rejects.toThrow(/\.mindgraph/)
  })

  it('vault-interner Symlink auf .mindgraph wird abgewiesen', async () => {
    await fs.symlink(path.join(vault, '.mindgraph'), path.join(vault, 'harmlos'))
    await expect(resolveInVaultSafe(vault, 'harmlos/agent-staging/run-1/entwurf.md')).rejects.toThrow(/\.mindgraph/)
  })

  it('normale Notizen und andere Punkt-Ordner bleiben erreichbar', async () => {
    await fs.mkdir(path.join(vault, '.trash'), { recursive: true })
    await fs.writeFile(path.join(vault, '.trash', 'alt.md'), 'alt', 'utf-8')
    expect(await resolveInVaultSafe(vault, 'notiz.md')).toBe(path.join(vaultReal, 'notiz.md'))
    expect(await resolveInVaultSafe(vault, '.trash/alt.md')).toBe(path.join(vaultReal, '.trash', 'alt.md'))
    expect(await resolveInVaultSafe(vault, 'ordner/mindgraph-notizen.md')).toBe(path.join(vaultReal, 'ordner', 'mindgraph-notizen.md'))
  })
})

describe('isAppInternalRealPath (Zielordner, Projektordner)', () => {
  it('erkennt .mindgraph direkt, in anderer Schreibweise und per Symlink', async () => {
    await fs.mkdir(path.join(vault, '.mindgraph', 'sub'), { recursive: true })
    await fs.symlink(path.join(vault, '.mindgraph'), path.join(vault, 'tarnung'))
    expect(await isAppInternalRealPath(vault, path.join(vault, '.mindgraph'))).toBe(true)
    expect(await isAppInternalRealPath(vault, path.join(vault, '.MindGraph', 'sub'))).toBe(true)
    expect(await isAppInternalRealPath(vault, path.join(vault, 'tarnung', 'sub'))).toBe(true)
  })

  it('normale Ordner sind nicht intern', async () => {
    expect(await isAppInternalRealPath(vault, path.join(vault, 'ordner'))).toBe(false)
    expect(await isAppInternalRealPath(vault, vault)).toBe(false)
  })
})
