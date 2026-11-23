// Skill-Lader: Kappung sichtbar machen (Codex F01, docs/codex-collab/petrol-agent-bewertung-2026-11.md).
// Ein zu langer Skill kam vorher still gekürzt beim Modell an; zu große Dateien und Ordner
// hinter der Obergrenze verschwanden ohne Meldung; Windows-Zeilenenden brachen den Kopf.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'fs'
import * as os from 'os'
import * as path from 'path'
import { listVaultSkillsDetailed, listVaultSkills, readSkillBody, readSkillBodyDetailed, MAX_SKILL_BODY_CHARS, fmtChars } from './skillsLoader'
import { MAX_CHARS_PER_FILE } from './contextFiles'
import { createNoteAgentRegistry, type NoteAgentContext } from './skills'
import type { AgentRun } from './runRegistry'
import { estimateTokens, TOOL_RESULT_SHARE } from '../../shared/contextBudget'
import { AGENT_NUM_CTX } from '../../shared/contextGuard'

let vault = ''
async function skill(folder: string, content: string): Promise<void> {
  const dir = path.join(vault, 'Skills', folder)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(path.join(dir, 'SKILL.md'), content, 'utf8')
}
const head = (name: string): string => `---\nname: ${name}\ndescription: Testet etwas.\n---\n\n`

beforeEach(async () => {
  vault = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'mindgraph-skills-')))
})
afterEach(async () => {
  await fs.rm(vault, { recursive: true, force: true })
})

describe('Kappung', () => {
  it('Liste und Leser urteilen gleich: genau an der Grenze nicht gekürzt, ein Zeichen darüber gekürzt', async () => {
    await skill('passt', head('Passt') + 'a'.repeat(MAX_SKILL_BODY_CHARS))
    await skill('lang', head('Lang') + 'a'.repeat(MAX_SKILL_BODY_CHARS + 1))
    const { skills } = await listVaultSkillsDetailed(vault)
    const passt = skills.find(s => s.folderName === 'passt')!
    const lang = skills.find(s => s.folderName === 'lang')!
    expect([passt.bodyChars, passt.truncated]).toEqual([MAX_SKILL_BODY_CHARS, false])
    expect([lang.bodyChars, lang.truncated]).toEqual([MAX_SKILL_BODY_CHARS + 1, true])
    expect((await readSkillBodyDetailed(vault, 'passt')).truncated).toBe(false)
    expect((await readSkillBodyDetailed(vault, 'lang')).truncated).toBe(true)
  })

  it('der Leser nennt dem Modell, wie viel fehlt, und behält den vollen Text für Prüfungen', async () => {
    await skill('lang', head('Lang') + 'a'.repeat(MAX_SKILL_BODY_CHARS) + 'ENDE-DER-ANLEITUNG')
    const res = await readSkillBodyDetailed(vault, 'lang')
    expect(res.body).not.toContain('ENDE-DER-ANLEITUNG')
    expect(res.body).toContain(`${fmtChars(MAX_SKILL_BODY_CHARS)} von ${fmtChars(res.totalChars)} Zeichen gelesen`)
    expect(res.fullBody).toContain('ENDE-DER-ANLEITUNG')
    expect(await readSkillBody(vault, 'lang')).toBe(res.body)
  })

  it('fmtChars gliedert in Dreiergruppen', () => {
    expect([fmtChars(999), fmtChars(12000), fmtChars(1234567)]).toEqual(['999', '12 000', '1 234 567'])
  })
})

describe('Windows-Zeilenenden und BOM', () => {
  it('erkennt Name und Beschreibung, der Kopf landet nicht im Anleitungstext', async () => {
    await skill('win', '﻿---\r\nname: Aus Windows\r\ndescription: Mit CRLF gespeichert.\r\n---\r\n\r\n# Anleitung\r\nText.\r\n')
    const [s] = await listVaultSkills(vault)
    expect(s.name).toBe('Aus Windows')
    expect(s.description).toBe('Mit CRLF gespeichert.')
    const body = await readSkillBody(vault, 'win')
    expect(body.startsWith('# Anleitung')).toBe(true)
    expect(body).not.toContain('description:')
  })
})

describe('Übersprungene Skills', () => {
  it('meldet eine SKILL.md über 512 KB mit Ordnernamen', async () => {
    await skill('riesig', head('Riesig') + 'x'.repeat(513 * 1024))
    await skill('normal', head('Normal') + 'Text.')
    const { skills, skipped } = await listVaultSkillsDetailed(vault)
    expect(skills.map(s => s.folderName)).toEqual(['normal'])
    expect(skipped).toEqual({ tooLarge: ['riesig'], overLimit: 0 })
  })

  it('meldet, wie viele Skill-Ordner hinter der Obergrenze von 50 fehlen — Ordner ohne SKILL.md zählen nicht', async () => {
    for (let i = 0; i < 53; i++) await skill(`s${String(i).padStart(2, '0')}`, head(`S${i}`) + 'Text.')
    await fs.mkdir(path.join(vault, 'Skills', 'leer'), { recursive: true })
    const { skills, skipped } = await listVaultSkillsDetailed(vault)
    expect(skills).toHaveLength(50)
    expect(skipped.overLimit).toBe(3)
  })

  it('ohne Skills-Ordner: leere Liste, nichts übersprungen', async () => {
    expect(await listVaultSkillsDetailed(vault)).toEqual({ skills: [], skipped: { tooLarge: [], overLimit: 0 } })
  })
})

describe('use_skill bei gekürztem Skill', () => {
  async function use(folder: string): Promise<{ res: { ok: boolean; content: string; display?: string }; run: AgentRun }> {
    const run = {
      runId: 'r', senderId: 1, vaultPath: vault, abort: new AbortController(),
      skills: [{ name: 'Lang', description: '', folderName: folder }], skillsUsed: [], sources: new Set<string>()
    } as unknown as AgentRun
    const res = await createNoteAgentRegistry().get('use_skill')!.run({ name: 'Lang' }, { senderId: 1, run } as NoteAgentContext)
    return { res, run }
  }

  it('erkennt das verlangte Format auch hinter der Lese-Grenze und nennt die Kürzung im Protokollschritt', async () => {
    await skill('lang', head('Lang') + 'a'.repeat(MAX_SKILL_BODY_CHARS + 500) + '\nAm Ende: write_pptx aufrufen.')
    await fs.mkdir(path.join(vault, 'Skills', 'lang', 'references'), { recursive: true })
    await fs.writeFile(path.join(vault, 'Skills', 'lang', 'references', 'vorlage.md'), 'Vorlage', 'utf8')
    const { res, run } = await use('lang')
    expect(res.ok).toBe(true)
    expect(run.expectedPptxSkill).toBe('Lang')
    expect(res.display).toBe(`use_skill: Lang — gekürzt, ${fmtChars(MAX_SKILL_BODY_CHARS)} von ${fmtChars(MAX_SKILL_BODY_CHARS + 500 + '\nAm Ende: write_pptx aufrufen.'.length)} Zeichen gelesen`)
    expect(res.content).not.toContain('write_pptx aufrufen')
    expect(res.content).toContain('nur gekürzt bei dir an')
    expect(res.content).toContain('Zusatzdateien unten')
    expect(res.content).toContain('references/vorlage.md')
  })

  it('ein kurzer Skill bleibt ohne Hinweis', async () => {
    await skill('kurz', head('Lang') + 'Kurze Anleitung.')
    const { res, run } = await use('kurz')
    expect(res.display).toBe('use_skill: Lang')
    expect(res.content).not.toContain('gekürzt')
    expect(run.expectedPptxSkill).toBeUndefined()
  })
})

// Wächter für die mitgelieferten Skills: „Veranstaltungsjournal“ wurde bis 23.11.2026 bei
// jedem Lauf um 4 808 Zeichen gekappt — Regeln und Abschluss kamen nie beim Modell an.
// Seither liegt die Grenze bei 18 000 Zeichen und der Skill passt ganz hinein.
describe('Mitgelieferte Starter-Skills', () => {
  const STARTER = path.resolve(__dirname, '../../../resources/starter-skills')

  it('jede SKILL.md passt ungekürzt in die Lese-Grenze', async () => {
    // listVaultSkillsDetailed erwartet <vault>/Skills — der Starter-Ordner wird dorthin gespiegelt.
    await fs.symlink(STARTER, path.join(vault, 'Skills'), 'dir')
    const { skills, skipped } = await listVaultSkillsDetailed(vault)
    expect(skills.length).toBeGreaterThan(10)
    expect(skipped).toEqual({ tooLarge: [], overLimit: 0 })
    expect(skills.filter(s => s.truncated).map(s => `${s.folderName}: ${s.bodyChars}`)).toEqual([])
  })

  it('jede SKILL.md passt als EIN Werkzeugergebnis in den lokalen Kontext', async () => {
    // Der Lauf lehnt ein Leseergebnis über einem Viertel des Kontexts ganz ab — das wäre
    // schlimmer als die Kappung. Maßstab ist der kleinste Kontext eines lokalen Laufs.
    const cap = Math.floor(AGENT_NUM_CTX * TOOL_RESULT_SHARE)
    const tooBig: string[] = []
    for (const d of await fs.readdir(STARTER, { withFileTypes: true })) {
      if (!d.isDirectory()) continue
      const tokens = estimateTokens(await fs.readFile(path.join(STARTER, d.name, 'SKILL.md'), 'utf8'))
      if (tokens > cap) tooBig.push(`${d.name}: ${tokens} von ${cap} Token`)
    }
    expect(tooBig).toEqual([])
  })

  it('jede Textdatei unter references/ passt in die Lese-Grenze von read_skill_file', async () => {
    const tooLong: string[] = []
    for (const d of await fs.readdir(STARTER, { withFileTypes: true })) {
      if (!d.isDirectory()) continue
      const refs = path.join(STARTER, d.name, 'references')
      const files = await fs.readdir(refs).catch(() => [] as string[])
      for (const f of files.filter(n => /\.(md|txt)$/i.test(n))) {
        const len = (await fs.readFile(path.join(refs, f), 'utf8')).length
        if (len > MAX_CHARS_PER_FILE) tooLong.push(`${d.name}/references/${f}: ${len}`)
      }
    }
    expect(tooLong).toEqual([])
  })
})
