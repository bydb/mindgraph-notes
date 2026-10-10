// Codex F25 (10.10.2026): write_docx (Vorlagen-Modus) und fill_docx_form lasen die
// Vorlage über eine rein lexikalische Pfadprüfung — ein Vault-interner Symlink nach
// außen oder eine Datei in .mindgraph kam so in das Ergebnis. Echte Dateien und
// Symlinks in temporären Verzeichnissen; die Vorlage muss gar keine gültige DOCX
// sein, denn abgewiesen wird schon beim Lesen.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { createNoteAgentRegistry, type NoteAgentContext } from './skills'
import type { AgentRun } from './runRegistry'
import { markdownToDocxBuffer } from '../office/officeService'
import { Document, Packer, Paragraph, Table, TableRow, TableCell } from 'docx'

const registry = createNoteAgentRegistry()
const writeDocx = registry.get('write_docx')!
const fillForm = registry.get('fill_docx_form')!

let base: string
let vault: string

function ctx(): NoteAgentContext {
  const run = {
    abort: new AbortController(),
    sources: new Set<string>(),
    status: 'running',
    instruction: 'Brief schreiben',
    vaultPath: vault,
    runId: 'run-test',
    results: new Map()
  } as unknown as AgentRun
  return { senderId: 1, run, allowedTools: new Set(['write_docx', 'fill_docx_form']) }
}

const callDocx = (template: string) =>
  writeDocx.run({ file_name: 'brief.docx', markdown: 'Hallo', template }, ctx())
const callForm = (template: string) =>
  fillForm.run({ file_name: 'formular.docx', template, entries: [{ table: 0, row: 0, cell: 0, text: 'x' }] }, ctx())

beforeEach(async () => {
  base = await fs.mkdtemp(path.join(os.tmpdir(), 'mg-docxtpl-'))
  vault = path.join(base, 'vault')
  await fs.mkdir(path.join(vault, '.mindgraph'), { recursive: true })
  await fs.mkdir(path.join(base, 'outside'), { recursive: true })
  await fs.writeFile(path.join(base, 'outside', 'fremd.docx'), 'GEHEIM-AUSSEN')
  await fs.writeFile(path.join(vault, '.mindgraph', 'intern.docx'), 'GEHEIM-INTERN')
  await fs.symlink(path.join(base, 'outside', 'fremd.docx'), path.join(vault, 'link.docx'))
})

afterEach(async () => {
  await fs.rm(base, { recursive: true, force: true })
})

for (const [name, call] of [['write_docx', callDocx], ['fill_docx_form', callForm]] as const) {
  describe(`${name} — Vorlagenpfad`, () => {
    it('Symlink im Vault auf eine Datei außerhalb wird nicht gelesen', async () => {
      const res = await call('link.docx')
      expect(res.ok).toBe(false)
      expect(res.content).toMatch(/nicht gelesen/)
    })

    it('Vorlage in .mindgraph wird nicht gelesen', async () => {
      const res = await call('.mindgraph/intern.docx')
      expect(res.ok).toBe(false)
      expect(res.content).toMatch(/\.mindgraph/)
    })
  })
}

describe('Vorlage im Vault bleibt lesbar', () => {
  it('normale Datei wird gelesen (scheitert erst am Inhalt, nicht am Pfad)', async () => {
    await fs.writeFile(path.join(vault, 'briefkopf.docx'), 'kein zip')
    for (const res of [await callDocx('briefkopf.docx'), await callForm('briefkopf.docx')]) {
      expect(res.ok).toBe(false)
      expect(res.content).not.toMatch(/nicht gelesen/)
      expect(res.content).toMatch(/zip/i)
    }
  })
})

describe('gültige Vorlage im Vault wird weiterhin gefüllt (Codex F31)', () => {
  it('write_docx setzt den Text in eine echte Vorlage mit {{INHALT}} ein', async () => {
    await fs.writeFile(path.join(vault, 'briefkopf.docx'), await markdownToDocxBuffer('{{INHALT}}'))
    const c = ctx()
    const res = await writeDocx.run({ file_name: 'brief.docx', markdown: 'Hallo', template: 'briefkopf.docx' }, c)
    expect(res.ok, res.content).toBe(true)
    expect(c.run.results.size).toBe(1)
  })

  it('fill_docx_form füllt eine Tabellenzelle einer echten Vorlage', async () => {
    const cell = (t: string) => new TableCell({ children: [new Paragraph(t)] })
    const table = new Table({ rows: [new TableRow({ children: [cell('Name'), cell('Wert')] }), new TableRow({ children: [cell('a'), cell('')] })] })
    await fs.writeFile(path.join(vault, 'formular.docx'), await Packer.toBuffer(new Document({ sections: [{ children: [table] }] })))
    const c = ctx()
    const res = await fillForm.run({ file_name: 'aus.docx', template: 'formular.docx', entries: [{ table: 0, row: 1, cell: 1, text: 'x' }] }, c)
    expect(res.ok, res.content).toBe(true)
    expect(c.run.results.size).toBe(1)
  })
})
