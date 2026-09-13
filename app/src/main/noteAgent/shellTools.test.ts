import { beforeEach, afterEach, describe, it, expect } from 'vitest'
import { promises as fs } from 'fs'
import * as path from 'path'
import { tmpdir } from 'os'
import { shellStageFileTool } from './shellTools'
import { authorizeShell, executeShell } from './shellExecution'
import { startRun, finishRun, type AgentRun } from './runRegistry'
import { importSkillFromPath } from './skillsCatalog'
import { listSkillFiles } from './skillsLoader'
import { stagingDirFor, assertInsideRunStaging } from './staging'

// Die Werkzeuge brauchen eine freigegebene Shell, und die gibt es nur mit erzwungenem Schutz (derzeit macOS).
let root: string
let run: AgentRun
let sender = 710_000
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(tmpdir(), 'mindgraph-shell-tools-'))
  run = startRun({ senderId: sender++, noteId: 'test', vaultPath: root, targetFolderRel: '.', targetFolderAbs: root, attachmentIds: [], instruction: 'Test', model: 'test' })!
})
afterEach(async () => {
  run.abort.abort()
  finishRun(run, 'cancelled')
  await fs.rm(root, { recursive: true, force: true })
})
async function prepare(): Promise<string> {
  const cwd = path.join(stagingDirFor(run), 'shell-work')
  await fs.mkdir(cwd, { recursive: true })
  await authorizeShell(run, async () => true, async () => cwd, { extraReadPaths: [path.dirname(process.execPath)] })
  return cwd
}
const stage = (file: string) => shellStageFileTool.run({ file }, { senderId: run.senderId, run })

describe.skipIf(process.platform !== 'darwin')('Shell-Ergebnisse', () => {
  it('braucht auch beim direkten Aufruf eine Freigabe', async () => {
    await expect(stage('test.csv')).rejects.toThrow(/nicht freigegeben/)
  })
  it('erzeugt per Shell CSV und bietet eine unabhängige Kopie im Staging an', async () => {
    const cwd = await prepare()
    await executeShell(run, process.platform === 'win32' ? "Set-Content -Path 'ergebnis.csv' -Value 'Name,Wert'" : "printf 'Name,Wert\nTest,42\n' > ergebnis.csv")
    expect((await stage('ergebnis.csv')).ok).toBe(true)
    const entry = [...run.results.values()][0]
    expect(entry.kind).toBe('csv')
    expect(entry.suggestedName).toBe('ergebnis.csv')
    expect(await assertInsideRunStaging(run, entry.stagingPath)).toBe(await fs.realpath(entry.stagingPath))
    const original = await fs.readFile(entry.stagingPath, 'utf8')
    await fs.writeFile(path.join(cwd, 'ergebnis.csv'), 'geändert')
    expect(await fs.readFile(entry.stagingPath, 'utf8')).toBe(original)
    expect(original).toContain('Name,Wert')
  })
  it('weist Traversal, Symlinks nach außen und ausführbare Ergebnisdateien ab', async () => {
    const cwd = await prepare()
    const outside = path.join(root, 'a.txt')
    await fs.writeFile(outside, 'außerhalb')
    await fs.writeFile(path.join(cwd, 'script.sh'), 'echo test')
    await fs.symlink(outside, path.join(cwd, 'link.txt'))
    await expect(stage('../../a.txt')).rejects.toThrow(/außerhalb/)
    await expect(stage('link.txt')).rejects.toThrow(/außerhalb/)
    await expect(stage('script.sh')).rejects.toThrow(/Ergebnisformat/)
    expect(run.results.size).toBe(0)
  })
  it('weist leere und übergroße Dateien ab', async () => {
    const cwd = await prepare()
    await fs.writeFile(path.join(cwd, 'leer.txt'), '')
    await expect(stage('leer.txt')).rejects.toThrow(/nicht leere/)
    const file = await fs.open(path.join(cwd, 'gross.pdf'), 'w')
    await file.truncate(26 * 1024 * 1024)
    await file.close()
    await expect(stage('gross.pdf')).rejects.toThrow(/25 MB/)
  })
})

describe.skipIf(process.platform !== 'darwin')('Importierte Skill-Skripte', () => {
  it('bewahrt Skripte als Dateien, bietet sie standardmäßig nicht an und führt nichts aus', async () => {
    const source = path.join(root, 'import', 'beispiel')
    await fs.mkdir(path.join(source, 'scripts'), { recursive: true })
    await fs.mkdir(path.join(source, 'references'))
    await fs.writeFile(path.join(source, 'SKILL.md'), '---\nname: Beispiel\n---\nTest')
    await fs.writeFile(path.join(source, 'scripts', 'auswertung.py'), 'print(42)')
    await fs.writeFile(path.join(source, 'references', 'schema.md'), 'Schema')
    const result = await importSkillFromPath(root, source)
    expect(result.includedScripts).toBe(true)
    expect(await fs.readFile(path.join(root, 'Skills', 'beispiel', 'scripts', 'auswertung.py'), 'utf8')).toBe('print(42)')
    expect(await listSkillFiles(root, 'beispiel')).toEqual(['references/schema.md'])
    expect(await listSkillFiles(root, 'beispiel', true)).toContain('scripts/auswertung.py')
    expect(run.shell).toBeUndefined()
  })
})
