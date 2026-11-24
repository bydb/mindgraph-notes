import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { createHash } from 'crypto'
import * as fs from 'fs/promises'
import * as os from 'os'
import * as path from 'path'
import { applySkillUpdates, checkSkillUpdates, previewSkillUpdate, readSkillVersionsManifest } from './skillUpdates'
import { SKILL_VERSIONS_FILE, fingerprintText } from '../../shared/skillUpdate'

const hash = (text: string, keepLine?: string): string => createHash('sha256').update(fingerprintText(text, keepLine), 'utf8').digest('hex')
const KEEP = '^- Vorlage: '
const V1 = '---\nname: Vorlage\n---\n- Vorlage: `Skills/vorlage/Muster.pptx`\nErste Fassung\n'
const V2 = '---\nname: Vorlage\n---\n- Vorlage: `Skills/vorlage/Muster.pptx`\nZweite Fassung\n'
const P1 = '---\nname: Protokoll\n---\nAlt\n'
const P2 = '---\nname: Protokoll\n---\nNeu\n'

let tmp: string, vault: string, starter: string
const backups: Array<{ file: string; next: string }> = []
const deps = { backup: async (file: string, next: string) => { backups.push({ file, next }) } }

async function put(base: string, rel: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(path.join(base, rel)), { recursive: true })
  await fs.writeFile(path.join(base, rel), content)
}
const inVault = (rel: string): Promise<string> => fs.readFile(path.join(vault, 'Skills', rel), 'utf-8')

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'skillupd-'))
  vault = path.join(tmp, 'vault'); starter = path.join(tmp, 'starter')
  backups.length = 0
  await put(starter, 'vorlage/SKILL.md', V2)
  await put(starter, 'vorlage/Muster.pptx', 'PPTX-NEU')
  await put(starter, 'vorlage/references/neu.md', 'Nachschlag')
  await put(starter, 'protokoll/SKILL.md', P2)
  await put(starter, SKILL_VERSIONS_FILE, JSON.stringify({
    version: 1,
    skills: {
      vorlage: { keepLine: KEEP, hashes: [hash(V1, KEEP), hash(V2, KEEP)] },
      protokoll: { hashes: [hash(P1), hash(P2)] }
    }
  }))
})
afterEach(async () => { await fs.rm(tmp, { recursive: true, force: true }) })

describe('checkSkillUpdates', () => {
  it('meldet veraltet und angepasst, nicht aber aktuelle, fehlende oder fremde Skills', async () => {
    await put(vault, 'Skills/vorlage/SKILL.md', V1)
    await put(vault, 'Skills/protokoll/SKILL.md', P1 + 'eigene Zeile\n')
    await put(vault, 'Skills/eigener/SKILL.md', 'meins')
    expect(await checkSkillUpdates(vault, starter)).toEqual([
      { folderName: 'protokoll', state: 'modified' }, { folderName: 'vorlage', state: 'outdated' }
    ])
    await put(vault, 'Skills/protokoll/SKILL.md', P2.replace(/\n/g, '\r\n'))
    expect(await checkSkillUpdates(vault, starter)).toEqual([{ folderName: 'vorlage', state: 'outdated' }])
  })

  it('wer nur seinen Vorlagenpfad eingetragen hat, gilt nicht als angepasst', async () => {
    await put(vault, 'Skills/vorlage/SKILL.md', V1.replace('Skills/vorlage/Muster.pptx', 'Vorlagen/Haus.potx'))
    expect(await checkSkillUpdates(vault, starter)).toEqual([{ folderName: 'vorlage', state: 'outdated' }])
    await put(vault, 'Skills/vorlage/SKILL.md', V2.replace('Skills/vorlage/Muster.pptx', 'Vorlagen/Haus.potx'))
    expect(await checkSkillUpdates(vault, starter)).toEqual([])
  })

  it('ohne Manifest gibt es kein Angebot', async () => {
    await put(vault, 'Skills/vorlage/SKILL.md', V1)
    await fs.rm(path.join(starter, SKILL_VERSIONS_FILE))
    expect(await checkSkillUpdates(vault, starter)).toEqual([])
  })

  it('eine Verknüpfung als Skill-Ordner oder SKILL.md wird übergangen', async () => {
    await put(tmp, 'aussen/SKILL.md', V1)
    await fs.mkdir(path.join(vault, 'Skills'), { recursive: true })
    await fs.symlink(path.join(tmp, 'aussen'), path.join(vault, 'Skills', 'vorlage'))
    await fs.mkdir(path.join(vault, 'Skills', 'protokoll'))
    await fs.symlink(path.join(tmp, 'aussen', 'SKILL.md'), path.join(vault, 'Skills', 'protokoll', 'SKILL.md'))
    expect(await checkSkillUpdates(vault, starter)).toEqual([])
    const res = await applySkillUpdates(vault, starter, ['vorlage', 'protokoll'], ['vorlage', 'protokoll'], deps)
    expect(res.updated).toEqual([])
    expect(await fs.readFile(path.join(tmp, 'aussen', 'SKILL.md'), 'utf-8')).toBe(V1)
  })
})

describe('applySkillUpdates', () => {
  it('ersetzt eine veraltete Fassung, sichert vorher und übernimmt den Pfad des Nutzers', async () => {
    const mine = V1.replace('Skills/vorlage/Muster.pptx', 'Vorlagen/Haus.potx')
    await put(vault, 'Skills/vorlage/SKILL.md', mine)
    await put(vault, 'Skills/vorlage/Muster.pptx', 'PPTX-MEINS')
    const res = await applySkillUpdates(vault, starter, ['vorlage'], [], deps)
    expect(res).toEqual({ updated: ['vorlage'], needsConfirm: [], failed: [] })
    const now = await inVault('vorlage/SKILL.md')
    expect(now).toBe(V2.replace('Skills/vorlage/Muster.pptx', 'Vorlagen/Haus.potx'))
    expect(backups).toEqual([{ file: path.join(vault, 'Skills', 'vorlage', 'SKILL.md'), next: now }])
    // Zusatzdateien: Vorhandenes bleibt, Fehlendes kommt dazu.
    expect(await inVault('vorlage/Muster.pptx')).toBe('PPTX-MEINS')
    expect(await inVault('vorlage/references/neu.md')).toBe('Nachschlag')
    expect(await checkSkillUpdates(vault, starter)).toEqual([])
  })

  it('ein angepasster Skill wird ohne Bestätigung nicht angefasst, mit Bestätigung ersetzt', async () => {
    const mine = P1 + 'eigene Zeile\n'
    await put(vault, 'Skills/protokoll/SKILL.md', mine)
    expect(await applySkillUpdates(vault, starter, ['protokoll'], [], deps)).toEqual({ updated: [], needsConfirm: ['protokoll'], failed: [] })
    expect(await inVault('protokoll/SKILL.md')).toBe(mine)
    expect(backups).toEqual([])
    expect((await applySkillUpdates(vault, starter, ['protokoll'], ['protokoll'], deps)).updated).toEqual(['protokoll'])
    expect(await inVault('protokoll/SKILL.md')).toBe(P2)
    expect(backups).toHaveLength(1)
  })

  it('schlägt die Sicherung fehl, bleibt die Datei unverändert', async () => {
    await put(vault, 'Skills/protokoll/SKILL.md', P1)
    const res = await applySkillUpdates(vault, starter, ['protokoll'], [], { backup: async () => { throw new Error('Platte voll') } })
    expect(res.updated).toEqual([])
    expect(res.failed).toEqual([{ folderName: 'protokoll', error: 'Platte voll' }])
    expect(await inVault('protokoll/SKILL.md')).toBe(P1)
  })

  it('fremde Namen und Pfadtricks ändern nichts', async () => {
    await put(vault, 'Skills/eigener/SKILL.md', 'meins')
    await put(vault, 'Skills/protokoll/SKILL.md', P2)
    const res = await applySkillUpdates(vault, starter, ['eigener', '../protokoll', 'protokoll', 'gibtsnicht'], [], deps)
    expect(res.updated).toEqual([])
    expect(res.failed.map(f => f.folderName).sort()).toEqual(['eigener', 'gibtsnicht'])
    expect(await inVault('eigener/SKILL.md')).toBe('meins')
  })
})

describe('previewSkillUpdate', () => {
  it('liefert beide Fassungen und nennt die übernommene Zeile', async () => {
    await put(vault, 'Skills/vorlage/SKILL.md', V1.replace('Skills/vorlage/Muster.pptx', 'Vorlagen/Haus.potx'))
    const p = await previewSkillUpdate(vault, starter, 'vorlage')
    expect(p?.state).toBe('outdated')
    expect(p?.carried).toBe('- Vorlage: `Vorlagen/Haus.potx`')
    expect(p?.newText).toContain('Zweite Fassung')
    expect(p?.newText).toContain('Vorlagen/Haus.potx')
    expect(await previewSkillUpdate(vault, starter, 'eigener')).toBeNull()
  })
})

// Hält das ausgelieferte Manifest ehrlich: Nach einer Änderung an einem mitgelieferten Skill
// muss `node scripts/skill-versions.mjs` gelaufen sein, sonst gälte die Fassung dieser App bei
// der nächsten Änderung als „vom Nutzer angepasst“.
describe('ausgeliefertes skill-versions.json', () => {
  const STARTER = path.resolve(__dirname, '../../../resources/starter-skills')

  it('kennt jeden mitgelieferten Skill und dessen aktuelle Fassung', async () => {
    const manifest = await readSkillVersionsManifest(STARTER)
    const folders = (await fs.readdir(STARTER, { withFileTypes: true })).filter(d => d.isDirectory()).map(d => d.name).sort()
    expect(Object.keys(manifest.skills).sort()).toEqual(folders)
    for (const name of folders) {
      const entry = manifest.skills[name]
      const text = await fs.readFile(path.join(STARTER, name, 'SKILL.md'), 'utf-8')
      expect(entry.hashes, `${name}: node scripts/skill-versions.mjs laufen lassen`).toContain(hash(text, entry.keepLine))
      if (entry.keepLine) expect(text.split('\n').some(l => new RegExp(entry.keepLine!).test(l)), `${name}: keepLine trifft keine Zeile`).toBe(true)
    }
  })
})
