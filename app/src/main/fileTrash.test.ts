import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { trashPath, moveIntoVaultTrash, VAULT_TRASH_DIR } from './fileTrash'

let vault: string

beforeEach(async () => {
  vault = await fs.mkdtemp(path.join(os.tmpdir(), 'mg-trash-'))
})

afterEach(async () => {
  await fs.rm(vault, { recursive: true, force: true })
})

const write = async (rel: string, content: string): Promise<string> => {
  const abs = path.join(vault, rel)
  await fs.mkdir(path.dirname(abs), { recursive: true })
  await fs.writeFile(abs, content)
  return abs
}

const exists = async (p: string): Promise<boolean> => {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

const failingTrash = async (): Promise<void> => {
  throw new Error('trash unavailable')
}

describe('trashPath', () => {
  it('nutzt den OS-Papierkorb, wenn er verfügbar ist', async () => {
    const abs = await write('Notizen/a.md', 'hallo')
    const seen: string[] = []

    const where = await trashPath({
      absPath: abs,
      vaultRoot: vault,
      trashItem: async p => {
        seen.push(p)
        await fs.rm(p) // shell.trashItem entfernt den Pfad
      }
    })

    expect(where).toBe('os-trash')
    expect(seen).toEqual([abs])
    expect(await exists(path.join(vault, VAULT_TRASH_DIR))).toBe(false)
  })

  it('weicht auf den Vault-Papierkorb aus und behält die Ordnerstruktur', async () => {
    const abs = await write('Notizen/Unterordner/a.md', 'hallo')

    const where = await trashPath({ absPath: abs, vaultRoot: vault, trashItem: failingTrash })

    expect(where).toBe('vault-trash')
    expect(await exists(abs)).toBe(false)
    const parked = path.join(vault, VAULT_TRASH_DIR, 'Notizen/Unterordner/a.md')
    expect(await fs.readFile(parked, 'utf-8')).toBe('hallo')
  })

  it('verschiebt auch ganze Ordner samt Inhalt', async () => {
    await write('Ordner/tief/a.md', 'A')
    await write('Ordner/b.md', 'B')

    const where = await trashPath({
      absPath: path.join(vault, 'Ordner'),
      vaultRoot: vault,
      trashItem: failingTrash
    })

    expect(where).toBe('vault-trash')
    expect(await exists(path.join(vault, 'Ordner'))).toBe(false)
    const parked = path.join(vault, VAULT_TRASH_DIR, 'Ordner')
    expect(await fs.readFile(path.join(parked, 'tief/a.md'), 'utf-8')).toBe('A')
    expect(await fs.readFile(path.join(parked, 'b.md'), 'utf-8')).toBe('B')
  })

  it('löscht NICHT hart, wenn beide Wege scheitern', async () => {
    const abs = await write('a.md', 'wichtig')
    // Kein Vault-Root bekannt → kein Ersatzweg
    await expect(
      trashPath({ absPath: abs, vaultRoot: null, trashItem: failingTrash })
    ).rejects.toThrow('trash unavailable')

    expect(await fs.readFile(abs, 'utf-8')).toBe('wichtig')
  })

  it('nimmt den Ersatzweg nicht für Pfade außerhalb des Vaults', async () => {
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'mg-outside-'))
    const abs = path.join(outside, 'fremd.md')
    await fs.writeFile(abs, 'fremd')

    await expect(
      trashPath({ absPath: abs, vaultRoot: vault, trashItem: failingTrash })
    ).rejects.toThrow('trash unavailable')

    expect(await exists(abs)).toBe(true)
    await fs.rm(outside, { recursive: true, force: true })
  })
})

describe('moveIntoVaultTrash', () => {
  it('überschreibt eine gleichnamige Datei im Papierkorb nicht', async () => {
    await write('a.md', 'erste')
    await moveIntoVaultTrash(vault, 'a.md', new Date(2026, 7, 13, 22, 45, 0))

    await write('a.md', 'zweite')
    const second = await moveIntoVaultTrash(vault, 'a.md', new Date(2026, 7, 13, 22, 46, 30))

    const first = path.join(vault, VAULT_TRASH_DIR, 'a.md')
    expect(await fs.readFile(first, 'utf-8')).toBe('erste')
    expect(await fs.readFile(second, 'utf-8')).toBe('zweite')
    expect(path.basename(second)).toBe('a.trashed-20260813-224630.md')
  })

  it('hängt einen Zähler an, wenn auch der Zeitstempel schon belegt ist', async () => {
    const stamp = new Date(2026, 7, 13, 22, 45, 0)
    await write('a.md', 'erste')
    await moveIntoVaultTrash(vault, 'a.md', stamp)
    await write('a.md', 'zweite')
    await moveIntoVaultTrash(vault, 'a.md', stamp)
    await write('a.md', 'dritte')
    const third = await moveIntoVaultTrash(vault, 'a.md', stamp)

    expect(path.basename(third)).toBe('a.trashed-20260813-224500-2.md')
    expect(await fs.readFile(third, 'utf-8')).toBe('dritte')
  })
})
