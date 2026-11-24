// Feste Skill-Blöcke: Das Modell schreibt [[skill-block:name]], die App setzt den Wortlaut
// aus der SKILL.md ein (skillBlocks.ts). Anlass: Veranstaltungsjournal, 23.11.2026.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'fs'
import * as os from 'os'
import * as path from 'path'
import { parseSkillBlocks, applySkillBlocks } from './skillBlocks'
import { createNoteAgentRegistry, type NoteAgentContext } from './skills'
import { finishRun, peekContinuation, inheritContinuation, type AgentRun } from './runRegistry'

const SKILL = [
  '# Test', '', 'Text davor.', '',
  '```html skill-block=stil', '<style>.a{color:red}</style>', '```', '',
  '```html', '<p>Muster ohne Namen</p>', '```', '',
  '```html skill-block=ende', '<script>', 'var x = 1', '</script>', '```', ''
].join('\n')

describe('parseSkillBlocks', () => {
  it('liest nur benannte Blöcke, mehrzeilig und wortgetreu', () => {
    const blocks = parseSkillBlocks(SKILL)
    expect([...blocks.keys()]).toEqual(['stil', 'ende'])
    expect(blocks.get('stil')).toBe('<style>.a{color:red}</style>')
    expect(blocks.get('ende')).toBe('<script>\nvar x = 1\n</script>')
  })

  it('kommt mit Windows-Zeilenenden zurecht und nimmt bei doppeltem Namen den ersten', () => {
    const blocks = parseSkillBlocks('```html skill-block=a\r\neins\r\n```\r\n\r\n```html skill-block=a\r\nzwei\r\n```\r\n')
    expect(blocks.get('a')).toBe('eins')
  })
})

describe('applySkillBlocks', () => {
  const blocks = parseSkillBlocks(SKILL)

  it('setzt Blöcke ein, auch mit Backticks, Leerzeichen und Großschreibung', () => {
    const res = applySkillBlocks('`[[skill-block:stil]]`\n<section>Seite</section>\n[[ Skill-Block : ENDE ]]', blocks)
    expect(res.html).toBe('<style>.a{color:red}</style>\n<section>Seite</section>\n<script>\nvar x = 1\n</script>')
    expect(res.used).toEqual(['stil', 'ende'])
    expect(res.unknown).toEqual([])
  })

  it('meldet unbekannte Platzhalter und lässt sie stehen', () => {
    const res = applySkillBlocks('[[skill-block:gibtsnicht]]', blocks)
    expect(res.unknown).toEqual(['gibtsnicht'])
    expect(res.html).toBe('[[skill-block:gibtsnicht]]')
  })

  it('ein Dollarzeichen im Block wird nicht als Ersetzungsmuster gelesen', () => {
    const res = applySkillBlocks('[[skill-block:x]]', new Map([['x', "a $& b $1 c $$"]]))
    expect(res.html).toBe('a $& b $1 c $$')
  })

  it('lässt Seiten ohne Platzhalter unverändert, auch ohne Blöcke', () => {
    expect(applySkillBlocks('<p>[[Notiz]]</p>', undefined)).toEqual({ html: '<p>[[Notiz]]</p>', used: [], unknown: [] })
  })
})

describe('use_skill und write_html zusammen', () => {
  let vault = ''
  beforeEach(async () => {
    vault = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'mindgraph-blocks-')))
    await fs.mkdir(path.join(vault, 'Skills', 'test'), { recursive: true })
    await fs.mkdir(path.join(vault, 'Ziel'), { recursive: true })
    await fs.writeFile(path.join(vault, 'Skills', 'test', 'SKILL.md'), `---\nname: Test\ndescription: x\n---\n\n${SKILL}`, 'utf8')
  })
  afterEach(async () => { await fs.rm(vault, { recursive: true, force: true }) })

  function makeRun(): AgentRun {
    return {
      runId: `blocks-${Date.now()}`, senderId: 1, status: 'running', vaultPath: vault, abort: new AbortController(), seq: 0,
      targetFolderRel: 'Ziel', targetFolderAbs: path.join(vault, 'Ziel'), attachmentIds: [],
      skills: [{ name: 'Test', description: '', folderName: 'test' }], skillsUsed: [],
      sources: new Set<string>(), results: new Map(), toolsUsed: new Set(), model: 'testmodell'
    } as unknown as AgentRun
  }

  it('nennt die Blöcke beim Lesen und setzt sie beim Schreiben ein', async () => {
    const run = makeRun()
    const ctx = { senderId: 1, run } as NoteAgentContext
    const reg = createNoteAgentRegistry()
    const read = await reg.get('use_skill')!.run({ name: 'Test' }, ctx)
    expect(read.content).toContain('Feste Blöcke dieses Skills: stil, ende')
    expect(read.content).toContain('[[skill-block:stil]]')

    const written = await reg.get('write_html')!.run({ file_name: 'seite.html', title: 'Seite', body_html: '[[skill-block:stil]]\n<section>Inhalt der Seite</section>\n[[skill-block:ende]]' }, ctx)
    expect(written.ok, written.content).toBe(true)
    const staged = Array.from(run.results.values())[0]
    const html = await fs.readFile(staged.stagingPath, 'utf8')
    expect(html).toContain('<style>.a{color:red}</style>')
    expect(html).toContain('var x = 1')
    expect(html).not.toContain('skill-block')
    expect(staged.summary).toContain('feste Blöcke des Skills eingesetzt: stil, ende')
  })

  it('lehnt einen unbekannten Platzhalter ab und nennt die vorhandenen', async () => {
    const run = makeRun()
    const ctx = { senderId: 1, run } as NoteAgentContext
    const reg = createNoteAgentRegistry()
    await reg.get('use_skill')!.run({ name: 'Test' }, ctx)
    const res = await reg.get('write_html')!.run({ file_name: 's.html', title: 'S', body_html: '[[skill-block:still]]<p>x</p>' }, ctx)
    expect(res.ok).toBe(false)
    expect(res.content).toContain('Vorhanden sind: stil, ende')
    expect(run.results.size).toBe(0)
  })

  // Gegenprüfung N02: Bei „Antworten und weitermachen“ liest das Modell den Skill nicht neu
  // (loop.ts sagt es ihm ausdrücklich) — die Blöcke müssen aus dem Vorgänger mitkommen.
  it('ein Folgeauftrag kennt die Blöcke des Vorgängers, ohne den Skill neu zu lesen', async () => {
    const reg = createNoteAgentRegistry()
    const first = { ...makeRun(), runId: 'blocks-erst', senderId: 4711, datasets: new Map(), folderReads: new Map(), collectedFolders: new Set<string>() } as unknown as AgentRun
    await reg.get('use_skill')!.run({ name: 'Test' }, { senderId: 4711, run: first } as NoteAgentContext)
    first.transcript = [{ role: 'user', content: 'Auftrag' }]
    finishRun(first, 'done')
    const prev = peekContinuation(4711, 'blocks-erst')!
    expect([...(prev.skillBlocks?.keys() ?? [])]).toEqual(['stil', 'ende'])

    const next = { ...makeRun(), runId: 'blocks-folge', senderId: 4711, datasets: new Map(), folderReads: new Map(), collectedFolders: new Set<string>() } as unknown as AgentRun
    inheritContinuation(next, prev)
    expect(next.skillBlocks).not.toBe(first.skillBlocks)
    const written = await reg.get('write_html')!.run({ file_name: 'korrektur.html', title: 'Korrektur', body_html: '[[skill-block:stil]]\n<section>Korrigierte Seite</section>' }, { senderId: 4711, run: next } as NoteAgentContext)
    expect(written.ok, written.content).toBe(true)
    const html = await fs.readFile(Array.from(next.results.values())[0].stagingPath, 'utf8')
    expect(html).toContain('<style>.a{color:red}</style>')
  })
})

describe('Starter-Skill Veranstaltungsjournal', () => {
  it('trägt Stil- und Broschüren-Block als feste Blöcke und verweist per Platzhalter darauf', async () => {
    const md = await fs.readFile(path.resolve(__dirname, '../../../resources/starter-skills/veranstaltungsjournal/SKILL.md'), 'utf8')
    const blocks = parseSkillBlocks(md)
    expect([...blocks.keys()]).toEqual(['journal-stil', 'journal-broschuere'])
    expect(blocks.get('journal-stil')).toMatch(/^<style>[\s\S]*@page\{size:148mm 210mm[\s\S]*<\/style>$/)
    expect(blocks.get('journal-broschuere')).toMatch(/<script>[\s\S]*mgBroschuere[\s\S]*<\/script>$/)
    expect(md).toContain('`[[skill-block:journal-stil]]`')
    expect(md).toContain('`[[skill-block:journal-broschuere]]`')
  })
})
