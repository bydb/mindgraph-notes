import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { promises as fs } from 'fs'
import * as os from 'os'
import * as path from 'path'
import { scanNotes, toNoteSet, recheckEntries, addSemanticNotes, FIND_NOTES_MAX_FILE_BYTES, FIND_NOTES_SEMANTIC_MAX } from './findNotes'

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

describe('addSemanticNotes', () => {
  const ac = (): AbortSignal => new AbortController().signal
  it('ergänzt nur Notizen ohne Suchwort aus dem angehängten Ordner und kennzeichnet sie', async () => {
    await write('Notes/a.md', 'Über ChatGPT.')
    await write('Notes/Unter/Lernende Maschinen.md', '# Notiz\n\nProgramme leiten Regeln aus Beispielen ab.')
    await write('Notes/schwach.md', 'Etwas anderes.')
    await write('Anderswo/fremd.md', 'Neuronale Netze.')
    await fs.symlink(path.join(vault, 'Anderswo'), path.join(vault, 'Notes', 'Link'))
    const scan = await scanNotes(root(), ['ChatGPT'])
    let asked: { q: string; folders: string[] } | null = null
    const out = await addSemanticNotes(scan, root(), vault, 'künstliche Intelligenz', async (q, folders) => {
      asked = { q, folders }
      return { hits: [
        { fileRel: 'Notes/a.md', text: 'Über ChatGPT.', score: 0.7 },
        { fileRel: 'Notes/Unter/Lernende Maschinen.md', text: '# Notiz\n\nProgramme leiten Regeln aus Beispielen ab.', score: 0.55 },
        { fileRel: 'Notes/schwach.md', text: 'Etwas anderes.', score: 0.4 },
        { fileRel: 'Anderswo/fremd.md', text: 'x', score: 0.9 },
        { fileRel: 'Notes/Link/fremd.md', text: 'x', score: 0.9 },
        { fileRel: '../draussen.md', text: 'x', score: 0.9 },
        { fileRel: 'Notes/fehlt.md', text: 'x', score: 0.9 }
      ] }
    }, ac())
    expect(asked).toEqual({ q: 'künstliche Intelligenz', folders: ['Notes'] })
    expect(out.semantic).toEqual({ state: 'used', topic: 'künstliche Intelligenz' })
    expect(out.entries.map(e => [e.relPath, !!e.semantic])).toEqual([['Notes/a.md', false], ['Notes/Unter/Lernende Maschinen.md', true]])
    expect(out.entries[1]).toMatchObject({ title: 'Lernende Maschinen', hit: 'Notiz Programme leiten Regeln aus Beispielen ab.' })
    const set = toNoteSet('m1', ['ChatGPT'], ['Notes'], out)
    expect(set.entries.map(e => e.n)).toEqual([1, 2])
    expect(set.semantic?.state).toBe('used')
  })
  it('begrenzt die Anzahl und zählt den Rest', async () => {
    const hits: Array<{ fileRel: string; text: string; score: number }> = []
    for (let i = 0; i < FIND_NOTES_SEMANTIC_MAX + 4; i++) { await write(`Notes/s${i}.md`, `Text ${i}`); hits.push({ fileRel: `Notes/s${i}.md`, text: `Text ${i}`, score: 0.6 - i / 1000 }) }
    const out = await addSemanticNotes(await scanNotes(root(), ['nichts']), root(), vault, 'x', async () => ({ hits }), ac())
    expect(out.entries).toHaveLength(FIND_NOTES_SEMANTIC_MAX)
    expect(out.entries[0].relPath).toBe('Notes/s0.md')
    expect(out.semantic).toEqual({ state: 'used', topic: 'x', cut: 4 })
  })
  it('meldet fehlenden Index und Fehler, ohne die Worttreffer zu verlieren', async () => {
    await write('Notes/a.md', 'Über ChatGPT.')
    const scan = await scanNotes(root(), ['ChatGPT'])
    const none = await addSemanticNotes(scan, root(), vault, 'x', undefined, ac())
    expect(none.entries).toHaveLength(1)
    expect(none.semantic?.state).toBe('unavailable')
    const failed = await addSemanticNotes(scan, root(), vault, 'x', async () => { throw new Error('Index wurde mit einer anderen Fassung gebaut') }, ac())
    expect(failed.entries).toHaveLength(1)
    expect(failed.semantic).toMatchObject({ state: 'failed', reason: 'Index wurde mit einer anderen Fassung gebaut' })
    const other = await addSemanticNotes(scan, [{ name: 'Notes', rootReal: path.join(vault, 'Notes'), vaultReal: '/anderer/vault' }], vault, 'x', async () => ({ hits: [] }), ac())
    expect(other.semantic?.state).toBe('unavailable')
  })
  it('wirft einen geänderten sinngemäßen Treffer beim Schreiben heraus', async () => {
    await write('Notes/s.md', 'Regeln aus Beispielen.')
    const out = await addSemanticNotes(await scanNotes(root(), ['nichts']), root(), vault, 'x', async () => ({ hits: [{ fileRel: 'Notes/s.md', text: 'Regeln aus Beispielen.', score: 0.6 }] }), ac())
    const set = toNoteSet('m1', ['nichts'], ['Notes'], out)
    expect((await recheckEntries(vault, set.entries, set.terms)).fresh).toHaveLength(1)
    await write('Notes/s.md', 'Ganz anderer Inhalt.')
    const again = await recheckEntries(vault, set.entries, set.terms)
    expect(again.fresh).toHaveLength(0)
    expect(again.stale[0].reason).toContain('sinngemäße Treffer')
  })
})

describe('addSemanticNotes — Schwelle aus den Worttreffern', () => {
  it('lässt bei niedrigen Werten zu, was so ähnlich ist wie die Notizen mit Suchwort', async () => {
    const hits: Array<{ fileRel: string; text: string; score: number }> = []
    for (let i = 0; i < 8; i++) { await write(`Notes/w${i}.md`, `Über ChatGPT ${i}.`); hits.push({ fileRel: `Notes/w${i}.md`, text: 'x', score: 0.40 + i / 100 }) }
    await write('Notes/nah.md', 'Regeln aus Beispielen.'); hits.push({ fileRel: 'Notes/nah.md', text: 'Regeln aus Beispielen.', score: 0.43 })
    await write('Notes/fern.md', 'Wandertag.'); hits.push({ fileRel: 'Notes/fern.md', text: 'Wandertag.', score: 0.39 })
    const out = await addSemanticNotes(await scanNotes(root(), ['ChatGPT']), root(), vault, 'x', async () => ({ hits }), new AbortController().signal)
    expect(out.entries.filter(e => e.semantic).map(e => e.relPath)).toEqual(['Notes/nah.md'])
  })
})
