import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { promises as fs, realpathSync } from 'fs'
import * as path from 'path'
import { tmpdir, homedir } from 'os'
import { spawn } from 'child_process'
import { buildMcpSandboxProfile, programReadPaths, verifyMcpSandbox, mcpSandboxedCommand, type McpSandboxSpec } from './sandbox'

describe('MCP-Sandbox-Profil (rein)', () => {
  const spec: McpSandboxSpec = {
    workDir: '/w/work', programDir: '/p', command: '/opt/homebrew/bin/node', script: '/p/index.js',
    extraReadPaths: [], vaultPath: '/v', vaultRead: true, network: false, home: '/Users/x'
  }
  it('übernimmt die Home-Ausnahmen der Shell NICHT (F13)', () => {
    const profile = buildMcpSandboxProfile(spec)
    expect(profile).not.toMatch(/\.nvm|\.pyenv|Library\/Python|\.local\/bin/)
  })
  it('macht nur die Installation eines Interpreters unter ~ lesbar', () => {
    expect(programReadPaths({ ...spec, command: '/Users/x/.nvm/versions/node/v22/bin/node' })).toContain('/Users/x/.nvm/versions/node/v22')
    expect(programReadPaths(spec)).toEqual(['/p'])
  })
  it('sperrt .mindgraph nach der Vault-Freigabe und Netz ohne Freigabe', () => {
    const profile = buildMcpSandboxProfile(spec)
    expect(profile.indexOf('(deny file-read* (subpath "/v/.mindgraph"))')).toBeGreaterThan(profile.indexOf('(allow file-read* (subpath "/v"))'))
    expect(profile).toContain('(deny network*)')
    expect(buildMcpSandboxProfile({ ...spec, network: true })).not.toContain('(deny network*)')
  })
  it('sperrt den Vault ohne Freigabe ausdrücklich — auch wenn ein Zusatzpfad ihn umfasst (F03)', () => {
    const profile = buildMcpSandboxProfile({ ...spec, vaultRead: false, extraReadPaths: ['/data'], vaultPath: '/data/vault' })
    const allowExtra = profile.indexOf('(allow file-read* (subpath "/p") (subpath "/data"))')
    const denyVault = profile.lastIndexOf('(deny file-read* (subpath "/data/vault"))')
    expect(allowExtra).toBeGreaterThan(-1)
    expect(denyVault).toBeGreaterThan(allowExtra)
    expect(profile).not.toContain('(allow file-read* (subpath "/data/vault"))')
  })
  it('hält einen Vault IM freigegebenen Vault gesperrt (F16)', () => {
    const profile = buildMcpSandboxProfile({ ...spec, vaultPath: '/daten/A', vaultRead: true, knownVaults: ['/daten/A', '/daten/A/B', '/daten/C'] })
    const allowA = profile.indexOf('(allow file-read* (subpath "/daten/A"))')
    const denyB = profile.lastIndexOf('(deny file-read* (subpath "/daten/A/B"))')
    expect(allowA).toBeGreaterThan(-1)
    expect(denyB).toBeGreaterThan(allowA)
    expect(profile).not.toContain('(allow file-read* (subpath "/daten/C"))')
  })
  it('lehnt ein Programm im Vault ohne Lesefreigabe ab', () => {
    expect(() => buildMcpSandboxProfile({ ...spec, vaultRead: false, programDir: '/v/tools', script: '/v/tools/s.js' })).toThrow(/im Vault/)
  })
  it('lehnt einen Arbeitsordner im Programmordner ab', () => {
    expect(() => buildMcpSandboxProfile({ ...spec, workDir: '/p/work' })).toThrow(/Programmordner/)
  })
})

const onMac = process.platform === 'darwin'

describe.skipIf(!onMac)('MCP-Sandbox gegen sandbox-exec (macOS)', () => {
  let base: string
  let spec: McpSandboxSpec
  let profile: string
  const node = realpathSync(process.execPath)

  beforeAll(async () => {
    base = realpathSync(await fs.mkdtemp(path.join(tmpdir(), 'mg-mcp-sb-')))
    await fs.mkdir(path.join(base, 'program'))
    await fs.mkdir(path.join(base, 'work'))
    await fs.mkdir(path.join(base, 'vault', '.mindgraph'), { recursive: true })
    await fs.writeFile(path.join(base, 'vault', 'Notiz.md'), 'Inhalt')
    await fs.writeFile(path.join(base, 'vault', '.mindgraph', 'emails.json'), 'geheim')
    await fs.writeFile(path.join(base, 'program', 'server.js'), 'console.log("start")')
    spec = { workDir: path.join(base, 'work'), programDir: path.join(base, 'program'), command: node, script: path.join(base, 'program', 'server.js'), extraReadPaths: [], vaultPath: path.join(base, 'vault'), vaultRead: true, network: false }
    profile = path.join(base, 'mcp.sb')
    await fs.writeFile(profile, buildMcpSandboxProfile(spec))
  })
  afterAll(async () => { await fs.rm(base, { recursive: true, force: true }) })

  const nodeRun = (code: string) => new Promise<string>((resolve) => {
    const { command, args } = mcpSandboxedCommand(profile, node, ['-e', code])
    const child = spawn(command, args, { cwd: spec.workDir })
    let out = ''
    child.stdout.on('data', d => { out += d })
    child.stderr.on('data', d => { out += d })
    child.on('close', () => resolve(out.trim()))
  })
  const tryRead = (p: string) => `try { require('fs').readFileSync(${JSON.stringify(p)}); console.log('GELESEN') } catch (e) { console.log(e.code) }`

  it('besteht den Selbsttest mit dem echten Profil', async () => {
    await expect(verifyMcpSandbox(profile, spec)).resolves.toBeUndefined()
  })
  it('startet das Programm und liest den Vault, aber nicht .mindgraph, Home oder System-Temp', async () => {
    expect(await nodeRun(`console.log(require('fs').readFileSync(${JSON.stringify(spec.script)}, 'utf8').length > 0)`)).toBe('true')
    expect(await nodeRun(tryRead(path.join(base, 'vault', 'Notiz.md')))).toBe('GELESEN')
    expect(await nodeRun(tryRead(path.join(base, 'vault', '.mindgraph', 'emails.json')))).toBe('EPERM')
    expect(await nodeRun(tryRead(path.join(homedir(), '.zshrc')))).toMatch(/EPERM|ENOENT/)
  })
  it('sperrt einen Vault außerhalb des Benutzerordners ohne Lesefreigabe (F03)', async () => {
    const closed = path.join(base, 'closed.sb')
    const closedSpec = { ...spec, vaultRead: false }
    await fs.writeFile(closed, buildMcpSandboxProfile(closedSpec))
    await expect(verifyMcpSandbox(closed, closedSpec)).resolves.toBeUndefined()
    const { command, args } = mcpSandboxedCommand(closed, node, ['-e', tryRead(path.join(base, 'vault', 'Notiz.md'))])
    const out = await new Promise<string>(resolve => {
      const child = spawn(command, args, { cwd: spec.workDir })
      let o = ''
      child.stdout.on('data', d => { o += d })
      child.on('close', () => resolve(o.trim()))
    })
    expect(out).toBe('EPERM')
  })
  it('lässt den Programmordner nicht verändern (E22)', async () => {
    expect(await nodeRun(`try { require('fs').writeFileSync(${JSON.stringify(spec.script)}, 'x'); console.log('GESCHRIEBEN') } catch (e) { console.log(e.code) }`)).toBe('EPERM')
  })
  it('Selbsttest erkennt ein Profil ohne Netzsperre (F14)', async () => {
    const weak = path.join(base, 'weak.sb')
    await fs.writeFile(weak, buildMcpSandboxProfile({ ...spec, network: true }))
    await expect(verifyMcpSandbox(weak, spec)).rejects.toThrow(/net=ALLOWED|Netzverbindung/)
  })
  it('Selbsttest erkennt ein wirkungsloses Profil', async () => {
    const empty = path.join(base, 'empty.sb')
    await fs.writeFile(empty, '(version 1)\n(allow default)\n')
    await expect(verifyMcpSandbox(empty, spec)).rejects.toThrow(/Selbsttest/)
  })
})
