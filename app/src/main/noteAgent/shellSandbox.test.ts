import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { promises as fs } from 'fs'
import * as path from 'path'
import { tmpdir } from 'os'
import { spawn } from 'child_process'
import { buildSandboxProfile, sandboxAvailability, sandboxedCommand, verifySandbox, SANDBOX_EXEC } from './shellSandbox'

describe('Sandbox-Profil (pur)', () => {
  const base = { workDir: '/v/.mindgraph/agent-staging/r1/shell-work', vaultPath: '/v', readPaths: ['/v/anhang.csv'], network: false, home: '/Users/x' }

  it('sperrt Netz, Schreiben, Home, Temp und Vault — und gibt Anhänge, Arbeitsordner und Metadaten frei', () => {
    const p = buildSandboxProfile(base).split('\n')
    expect(p[0]).toBe('(version 1)')
    expect(p[1]).toBe('(allow default)')
    expect(p).toContain('(deny network*)')
    expect(p).toContain('(deny file-write*)')
    expect(p.find(l => l.startsWith('(allow file-write*'))).toContain('(subpath "/v/.mindgraph/agent-staging/r1/shell-work")')
    const denyRead = p.find(l => l.startsWith('(deny file-read* (subpath "/Users/x")'))!
    for (const d of ['/Volumes', '/private/tmp', '/tmp', '/private/var/folders', '/var/folders', '/v']) expect(denyRead).toContain(`(subpath "${d}")`)
    expect(p.find(l => l.includes('"/v/anhang.csv"'))).toMatch(/^\(allow file-read\*/)
    expect(p[p.length - 2]).toBe('(allow file-read-metadata)')
  })

  it('die Reihenfolge ist die Sicherheit: .mindgraph wird NACH der Vault-Freigabe gesperrt, der Arbeitsordner ZULETZT freigegeben', () => {
    const p = buildSandboxProfile({ ...base, readPaths: ['/v'] }).split('\n')
    const allowVault = p.findIndex(l => l.startsWith('(allow file-read*') && l.includes('(subpath "/v")'))
    const denyMindgraph = p.findIndex(l => l === '(deny file-read* (subpath "/v/.mindgraph"))')
    const allowWork = p.findIndex(l => l === '(allow file-read* (subpath "/v/.mindgraph/agent-staging/r1/shell-work"))')
    expect(allowVault).toBeGreaterThan(0)
    expect(denyMindgraph).toBeGreaterThan(allowVault)
    expect(allowWork).toBeGreaterThan(denyMindgraph)
  })

  it('Netz nur auf ausdrücklichen Wunsch', () => {
    expect(buildSandboxProfile({ ...base, network: true })).not.toContain('(deny network*)')
  })

  it('escaped Anführungszeichen und Backslashes, lehnt Zeilenumbrüche und relative Pfade ab', () => {
    const p = buildSandboxProfile({ ...base, readPaths: ['/v/Ordner "mit" Zeichen\\x'] })
    expect(p).toContain('(subpath "/v/Ordner \\"mit\\" Zeichen\\\\x")')
    expect(() => buildSandboxProfile({ ...base, readPaths: ['/v/a\nb'] })).toThrow(/Zeilenumbruch/)
    expect(() => buildSandboxProfile({ ...base, readPaths: ['relativ/pfad'] })).toThrow(/absolute/)
  })
})

describe('Verfügbarkeit (fail-closed)', () => {
  it('meldet auf Nicht-macOS keinen Schutz und verweigert das Umhüllen', () => {
    const a = sandboxAvailability()
    if (process.platform === 'darwin') {
      expect(a.ok).toBe(true)
      expect(sandboxedCommand('/p.sb', '/bin/bash', ['-c', 'x'])).toEqual({ executable: SANDBOX_EXEC, args: ['-f', '/p.sb', '/bin/bash', '-c', 'x'] })
    } else {
      expect(a.ok).toBe(false)
      expect(() => sandboxedCommand('/p.sb', '/bin/bash', [])).toThrow(/Schutz/)
    }
  })
})

// Echte Gegenproben — genau die Fälle aus dem Handoff: unerlaubte Datei lesen, überschreiben,
// löschen, per Symlink, aus einem Interpreter und dessen Kindprozess, Netz zu einem lokalen
// Port; dazu erlaubtes Schreiben im Arbeitsordner. Interpreter ist Node (läuft in jedem CI).
describe.skipIf(process.platform !== 'darwin')('Sandbox erzwingt die Grenzen (macOS, real)', () => {
  let base: string, work: string, attach: string, secret: string, profile: string
  const node = process.execPath
  beforeEach(async () => {
    base = await fs.realpath(await fs.mkdtemp(path.join(tmpdir(), 'mindgraph-sandbox-')))
    work = path.join(base, 'vault', '.mindgraph', 'agent-staging', 'r1', 'shell-work')
    attach = path.join(base, 'vault', 'anhang')
    await fs.mkdir(work, { recursive: true })
    await fs.mkdir(attach, { recursive: true })
    await fs.mkdir(path.join(base, 'secret'), { recursive: true })
    secret = path.join(base, 'secret', 'geheim.txt')
    await fs.writeFile(secret, 'geheim')
    await fs.writeFile(path.join(attach, 'daten.csv'), 'a;b')
    await fs.writeFile(path.join(base, 'vault', '.mindgraph', 'emails.json'), '{}')
    profile = path.join(base, 'sandbox.sb')
    await fs.writeFile(profile, buildSandboxProfile({
      workDir: work, vaultPath: path.join(base, 'vault'), readPaths: [attach], network: false, extraReadPaths: [path.dirname(node)]
    }))
  })
  afterEach(async () => { await fs.rm(base, { recursive: true, force: true }) })

  function run(cmd: string): Promise<{ out: string; code: number | null }> {
    const { executable, args } = sandboxedCommand(profile, '/bin/bash', ['--noprofile', '--norc', '-c', cmd])
    return new Promise(resolve => {
      const child = spawn(executable, args, { cwd: work, env: { PATH: '/usr/bin:/bin', HOME: process.env.HOME, TMPDIR: work } })
      let out = ''
      child.stdout.on('data', d => { out += d })
      child.stderr.on('data', d => { out += d })
      child.on('close', code => resolve({ out, code }))
    })
  }
  const q = (s: string) => `'${s.replace(/'/g, "'\\''")}'`
  const nodeRun = (js: string) => run(`${q(node)} -e ${q(js)}`)

  it('Selbsttest besteht mit diesem Profil', async () => {
    await expect(verifySandbox(profile, work)).resolves.toBeUndefined()
  })

  it('erlaubt: Anhang lesen, im Arbeitsordner schreiben — auch aus dem Interpreter', async () => {
    expect((await run(`cat ${q(path.join(attach, 'daten.csv'))}`)).out).toBe('a;b')
    const r = await nodeRun(`require('fs').writeFileSync(${JSON.stringify(path.join(work, 'ergebnis.txt'))}, 'ok'); console.log(require('fs').readFileSync(${JSON.stringify(path.join(work, 'ergebnis.txt'))}, 'utf8'))`)
    expect(r.out.trim()).toBe('ok')
  })

  it('verbietet: fremde Datei lesen, überschreiben, löschen — direkt, per Symlink, aus Node und dessen Kindprozess', async () => {
    expect((await run(`cat ${q(secret)}`)).out).toMatch(/Operation not permitted/)
    await fs.symlink(secret, path.join(work, 'link'))
    expect((await run(`cat ${q(path.join(work, 'link'))}`)).out).toMatch(/Operation not permitted/)
    expect((await run(`echo x > ${q(secret)}`)).out).toMatch(/Operation not permitted/)
    expect((await run(`rm ${q(secret)}`)).out).toMatch(/Operation not permitted/)
    expect((await nodeRun(`try { require('fs').unlinkSync(${JSON.stringify(secret)}); console.log('GELOESCHT') } catch (e) { console.log(e.code) }`)).out.trim()).toBe('EPERM')
    expect((await nodeRun(`console.log(require('child_process').spawnSync('rm', [${JSON.stringify(secret)}]).stderr.toString())`)).out).toMatch(/Operation not permitted/)
    expect(await fs.readFile(secret, 'utf8')).toBe('geheim')
  })

  it('verbietet .mindgraph-Daten des Vaults, Home und System-Temp — auch neben dem Arbeitsordner', async () => {
    expect((await run(`cat ${q(path.join(base, 'vault', '.mindgraph', 'emails.json'))}`)).out).toMatch(/Operation not permitted/)
    expect((await run(`echo x > ${q(path.join(base, 'vault', '.mindgraph', 'agent-staging', 'r1', 'daneben.txt'))}`)).out).toMatch(/Operation not permitted/)
    expect((await run(`ls ${q(path.join(process.env.HOME!, 'Library'))}`)).out).toMatch(/Operation not permitted/)
    expect((await run(`echo x > ${q(path.join(tmpdir(), 'mindgraph-sandbox-leak.txt'))}`)).out).toMatch(/Operation not permitted/)
  })

  it('verbietet Netz — auch zu lokalen Diensten', async () => {
    const r = await nodeRun(`const s = require('net').connect(11434, '127.0.0.1'); s.on('error', e => { console.log(e.code); process.exit(0) }); s.on('connect', () => { console.log('VERBUNDEN'); process.exit(0) })`)
    expect(r.out.trim()).toBe('EPERM')
  })

  it('lässt sich von innen nicht aufweichen', async () => {
    expect((await run(`${SANDBOX_EXEC} -p '(version 1)(allow default)' cat ${q(secret)}`)).out).toMatch(/not permitted/)
  })

  it('Selbsttest schlägt fehl, wenn das Profil nichts schützt', async () => {
    await fs.writeFile(profile, '(version 1)\n(allow default)\n')
    await expect(verifySandbox(profile, work)).rejects.toThrow(/Selbsttest/)
  })
})
