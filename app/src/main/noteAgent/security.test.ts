// PERMANENTE Sicherheits-Regressionstests für die Trust-Grenzen des Notiz-Agenten.
// Bewusste Ausnahme von der Konvention „main/ nicht in der Dauer-Suite": genau diese
// Containment-/Retention-/Atomaritäts-Grenzen (Codex-Re-Review R01–R05) regredieren
// still und verdienen dauerhafte Absicherung. Reine Unit-Ebene, kein Electron/IPC.

import { describe, it, expect, beforeAll } from 'vitest'
import { promises as fs } from 'fs'
import * as os from 'os'
import * as path from 'path'
import { startRun, registerResult, finishRun, takeResult, getRunForSender, pruneRunIfConsumed, consumeEvictedRuns } from './runRegistry'
import { reserveFreeName, sanitizeOutputFileName } from './staging'
import { readSkillBody, resolveSkillFile, listSkillFiles } from './skillsLoader'
import { registerContextAttachment, readAttachmentRaw, removeContextAttachment } from './contextFiles'

const ROOT = path.join(os.tmpdir(), 'mindgraph-noteagent-security-test')

function mkRunParams(senderId: number, overrides: Record<string, unknown> = {}) {
  return {
    senderId,
    noteId: 'note',
    vaultPath: ROOT,
    targetFolderRel: 'Ziel',
    targetFolderAbs: path.join(ROOT, 'Ziel'),
    attachmentIds: [],
    instruction: 'x',
    ...overrides
  }
}

beforeAll(async () => {
  await fs.rm(ROOT, { recursive: true, force: true })
  await fs.mkdir(path.join(ROOT, 'Ziel'), { recursive: true })
})

describe('R02 — beendete Läufe mit offenen Review-Karten bleiben adressierbar', () => {
  it('ein Folgelauf entwertet die Karten des Vorlaufs NICHT', () => {
    const a = startRun(mkRunParams(1))!
    const res = registerResult(a, { stagingPath: '/x', suggestedName: 'A.md', kind: 'md', summary: '', sources: [] })!
    finishRun(a, 'done')

    // Zweiter Lauf im selben Fenster startet — A ist beendet, hat aber offene Karte.
    const b = startRun(mkRunParams(1))!
    expect(b).not.toBeNull()
    // A muss weiterhin adressierbar sein (sonst „Unbekannter Lauf" beim Accept).
    expect(getRunForSender(1, a.runId)).toBe(a)
    // Accept der alten Karte funktioniert.
    expect(takeResult(1, a.runId, res.resultId)).not.toBeNull()
    // Nach Konsum aller Results wird A entfernt.
    pruneRunIfConsumed(a)
    expect(getRunForSender(1, a.runId)).toBeNull()
    finishRun(b, 'done')
    pruneRunIfConsumed(b)
  })

  it('vollständig konsumierter Vorlauf wird beim nächsten Start aufgeräumt', () => {
    const a = startRun(mkRunParams(2))!
    finishRun(a, 'done') // keine Results → sofort konsumiert
    const b = startRun(mkRunParams(2))!
    expect(getRunForSender(2, a.runId)).toBeNull() // A weg, keine offenen Karten
    finishRun(b, 'done')
    pruneRunIfConsumed(b)
  })

  it('aktiver Lauf blockiert einen zweiten Start (ein Run pro Fenster)', () => {
    const a = startRun(mkRunParams(3))!
    expect(startRun(mkRunParams(3))).toBeNull()
    finishRun(a, 'done')
    pruneRunIfConsumed(a)
  })

  it('Retention: max 8 beendete Läufe; evakuierte offene Läufe werden gemeldet (C02)', () => {
    consumeEvictedRuns() // Puffer aus Vortests leeren
    const ids: string[] = []
    for (let i = 0; i < 12; i++) {
      const r = startRun(mkRunParams(4))!
      registerResult(r, { stagingPath: '/x', suggestedName: `R${i}.md`, kind: 'md', summary: '', sources: [] })
      finishRun(r, 'done')
      ids.push(r.runId)
    }
    // Die ältesten sind evakuiert, die jüngsten noch da.
    expect(getRunForSender(4, ids[0])).toBeNull()
    expect(getRunForSender(4, ids[11])).not.toBeNull()
    // C02: die evakuierten Läufe (mit offenen Karten) wurden zum Aufräumen gemeldet,
    // damit der Renderer die toten Karten fallenlässt statt „Unbekannter Lauf".
    const evicted = consumeEvictedRuns().map(r => r.runId)
    expect(evicted).toContain(ids[0])
    expect(evicted).not.toContain(ids[11])
  })
})

describe('R04 — atomare Namensreservierung', () => {
  it('zwei parallele Reservierungen belegen nie denselben Namen', async () => {
    const dir = path.join(ROOT, 'race')
    await fs.mkdir(dir, { recursive: true })
    const [x, y] = await Promise.all([
      reserveFreeName(dir, 'Report.md'),
      reserveFreeName(dir, 'Report.md')
    ])
    expect(x.finalName).not.toBe(y.finalName)
    expect(new Set([x.finalName, y.finalName])).toEqual(new Set(['Report.md', 'Report (2).md']))
    await expect(fs.access(x.destPath)).resolves.toBeUndefined()
    await expect(fs.access(y.destPath)).resolves.toBeUndefined()
  })

  it('sanitizeOutputFileName wehrt Traversal ab und erzwingt Endungs-Allowlist', () => {
    expect(sanitizeOutputFileName('../../etc/passwd', '.md')).toBe('passwd.md')
    expect(sanitizeOutputFileName('böse.exe', '.md')).toBe('böse.exe.md')
    expect(sanitizeOutputFileName('', '.xlsx')).toBe('Ergebnis.xlsx')
  })
})

describe('R03 — Skill-Reads mit realpath-Containment (Symlink-Ausbruch)', () => {
  let secret: string
  beforeAll(async () => {
    secret = path.join(ROOT, 'geheim.md')
    await fs.writeFile(secret, 'GEHEIM ausserhalb des Vaults')
    const skill = path.join(ROOT, 'Skills', 'evil')
    await fs.mkdir(path.join(skill, 'references'), { recursive: true })
    await fs.writeFile(path.join(skill, 'SKILL.md'), '---\nname: Evil\ndescription: x\n---\nAnleitung.')
    // references/leak.md ist ein Symlink auf eine Datei außerhalb des Skill-Ordners.
    await fs.symlink(secret, path.join(skill, 'references', 'leak.md'))
    // brave/ mit normaler Zusatzdatei
    const brave = path.join(ROOT, 'Skills', 'brave')
    await fs.mkdir(path.join(brave, 'references'), { recursive: true })
    await fs.writeFile(path.join(brave, 'SKILL.md'), '---\nname: Brave\ndescription: y\n---\nText.')
    await fs.writeFile(path.join(brave, 'references', 'ok.md'), '# ok')
  })

  it('resolveSkillFile lehnt einen references-Symlink nach außen ab', async () => {
    await expect(resolveSkillFile(ROOT, 'evil', 'references/leak.md')).rejects.toThrow('außerhalb des Skill-Ordners')
  })

  it('resolveSkillFile erlaubt eine echte Datei im Skill-Ordner', async () => {
    const abs = await resolveSkillFile(ROOT, 'brave', 'references/ok.md')
    expect(abs).toContain(path.join('Skills', 'brave'))
  })

  it('listSkillFiles bietet den Symlink gar nicht erst an', async () => {
    expect(await listSkillFiles(ROOT, 'evil')).not.toContain('references/leak.md')
    expect(await listSkillFiles(ROOT, 'brave')).toContain('references/ok.md')
  })

  it('readSkillBody eines normalen Skills funktioniert', async () => {
    expect(await readSkillBody(ROOT, 'brave')).toContain('Text.')
  })
})

describe('C01 — Vault-Anhang: Read prüft realpath erneut (Attach→Symlink-Swap)', () => {
  const SENDER = 77
  it('liest einen internen Anhang, lehnt ihn nach Symlink-Swap nach außen ab', async () => {
    const dir = path.join(ROOT, 'attach-toctou')
    await fs.mkdir(dir, { recursive: true })
    const inside = path.join(dir, 'daten.csv')
    await fs.writeFile(inside, 'Name;Wert\nA;1\n')
    const secret = path.join(ROOT, 'aussen.csv')
    await fs.writeFile(secret, 'GEHEIM;extern\n')

    // Registrierung mit gebundenem Vault-Root (wie im IPC-Handler nach assertSafePath).
    const reg = await registerContextAttachment(SENDER, inside, true, dir)
    expect(reg.ok).toBe(true)
    if (!reg.ok) return
    // Erster Read: ok.
    expect((await readAttachmentRaw(SENDER, reg.attachment.id)).content).toContain('A;1')

    // Datei zwischen Attach und Read gegen einen Symlink nach außen tauschen.
    await fs.rm(inside)
    await fs.symlink(secret, inside)
    await expect(readAttachmentRaw(SENDER, reg.attachment.id)).rejects.toThrow('nicht mehr im Vault')
    removeContextAttachment(SENDER, reg.attachment.id)
  })

  it('externer OS-Dialog-Anhang (insideVault=false) bleibt lesbar', async () => {
    const ext = path.join(ROOT, 'extern-erlaubt.txt')
    await fs.writeFile(ext, 'extern ok')
    const reg = await registerContextAttachment(SENDER, ext, false)
    expect(reg.ok).toBe(true)
    if (!reg.ok) return
    expect((await readAttachmentRaw(SENDER, reg.attachment.id)).content).toContain('extern ok')
    removeContextAttachment(SENDER, reg.attachment.id)
  })
})
