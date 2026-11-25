import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { promises as fs } from 'fs'
import * as os from 'os'
import * as path from 'path'
import { scanNotes, toNoteSet, recheckEntries, FIND_NOTES_MAX_FILE_BYTES } from './findNotes'

let vault = ''
const root = (): Array<{ name: string; rootReal: string; vaultReal: string }> => [{ name: 'Notes', rootReal: path.join(vault, 'Notes'), vaultReal: vault }]
const write = async (rel: string, text: string): Promise<void> => {
  const abs = path.join(vault, rel)
  await fs.mkdir(path.dirname(abs), { recursive: true })
  await fs.writeFile(abs, text, 'utf-8')
}

beforeEach(async () => { vault = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'mg-findnotes-'))) })
afterEach(async () => { await fs.rm(vault, { recursive: true, force: true }) })

describe('scanNotes', () => {
  it('findet Treffer in Unterordnern, mit Umlaut im Namen, und nur im gewählten Ordner', async () => {
    await write('Notes/a.md', '# Sprachmodelle\n\nÜber ChatGPT im Unterricht.')
    await write('Notes/Unter/Pädagogik und KI.md', 'Kein Stichwort im Text.')
    await write('Notes/Unter/kind.md', 'Die Kinder spielen mit der Kiste.')
    await write('Notes/bild.png', 'ChatGPT')
    await write('Anderswo/b.md', 'ChatGPT')
    const scan = await scanNotes(root(), ['ChatGPT', 'KI'])
    expect(scan.scanned).toBe(3)
    expect(scan.incomplete).toEqual([])
    expect(scan.entries.map(e => e.relPath.normalize('NFC')).sort()).toEqual(['Notes/Unter/Pädagogik und KI.md', 'Notes/a.md'])
    const set = toNoteSet('m1', ['ChatGPT', 'KI'], ['Notes'], scan)
    expect(set.complete).toBe(true)
    expect(set.entries.map(e => e.n)).toEqual([1, 2])
  })
  it('betritt keine Verknüpfungen und keine versteckten Ordner', async () => {
    await write('Notes/a.md', 'ChatGPT')
    await write('Notes/.mindgraph/x.md', 'ChatGPT')
    await write('Aussen/geheim.md', 'ChatGPT')
    await fs.symlink(path.join(vault, 'Aussen'), path.join(vault, 'Notes', 'link'))
    await fs.symlink(path.join(vault, 'Aussen', 'geheim.md'), path.join(vault, 'Notes', 'link.md'))
    const scan = await scanNotes(root(), ['ChatGPT'])
    expect(scan.entries.map(e => e.relPath)).toEqual(['Notes/a.md'])
  })
  it('meldet zu große Notizen und eine erreichte Zeitgrenze als unvollständig', async () => {
    await write('Notes/a.md', 'ChatGPT')
    await write('Notes/gross.md', 'ChatGPT ' + 'x'.repeat(FIND_NOTES_MAX_FILE_BYTES + 10))
    const scan = await scanNotes(root(), ['ChatGPT'])
    expect(scan.entries.map(e => e.relPath)).toEqual(['Notes/a.md'])
    expect(scan.incomplete.join(' ')).toContain('über 2 MB')
    expect(toNoteSet('m1', ['ChatGPT'], ['Notes'], scan).complete).toBe(false)
    let t = 0
    const slow = await scanNotes(root(), ['ChatGPT'], { maxMs: 5, now: () => (t += 10) })
    expect(slow.incomplete.join(' ')).toContain('Zeitgrenze')
  })
  it('bricht auf das Abbruchsignal hin ab', async () => {
    await write('Notes/a.md', 'ChatGPT')
    const c = new AbortController(); c.abort()
    const scan = await scanNotes(root(), ['ChatGPT'], { signal: c.signal })
    expect(scan.incomplete.join(' ')).toContain('abgebrochen')
  })
})

describe('recheckEntries', () => {
  it('trennt Unverändertes, Aktualisiertes und nicht mehr Passendes', async () => {
    await write('Notes/bleibt.md', 'ChatGPT bleibt.')
    await write('Notes/aendert.md', 'ChatGPT alt.')
    await write('Notes/passt-nicht.md', 'ChatGPT raus.')
    await write('Notes/weg.md', 'ChatGPT weg.')
    const set = toNoteSet('m1', ['ChatGPT'], ['Notes'], await scanNotes(root(), ['ChatGPT']))
    await write('Notes/aendert.md', '# Neu\n\nJetzt mit ChatGPT in neuer Zeile.')
    await write('Notes/passt-nicht.md', 'Ganz anderer Inhalt.')
    await fs.rm(path.join(vault, 'Notes/weg.md'))
    const { fresh, stale } = await recheckEntries(vault, set.entries, set.terms)
    expect(fresh.map(e => e.relPath).sort()).toEqual(['Notes/aendert.md', 'Notes/bleibt.md'])
    expect(fresh.find(e => e.relPath === 'Notes/aendert.md')!.hit).toContain('neuer Zeile')
    expect(stale.map(s => s.relPath).sort()).toEqual(['Notes/passt-nicht.md', 'Notes/weg.md'])
  })
  it('liest nichts außerhalb des Vaults', async () => {
    const { fresh, stale } = await recheckEntries(vault, [{ n: 1, relPath: '../etc/passwd', title: 'x', hit: 'x', score: 1, hash: 'h' }], ['x'])
    expect(fresh).toEqual([])
    expect(stale[0].reason).toContain('nicht im Vault')
  })
})
