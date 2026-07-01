import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { generateKeyPairSync, type KeyObject } from 'node:crypto'
import { mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync, writeFileSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { packPluginArtifact } from '../artifact/pack'
import { canonicalJsonBytes } from '../artifact/format'
import { type Keyring } from '../artifact/verify'
import { installPluginArtifact, setActiveVersion } from './install'
import { discoverInstalledPlugins } from './discover'
import { keyringFromSpkiMap } from './keyring'
import { readActiveIndex } from './activeIndex'
import { pluginPaths, versionDir } from './paths'

const KEY_ID = 'dev-runtime-test'
let priv: KeyObject
let keyring: Keyring
let root: string
const tmpDirs: string[] = []

beforeEach(() => {
  const kp = generateKeyPairSync('ed25519')
  priv = kp.privateKey
  keyring = keyringFromSpkiMap({ [KEY_ID]: kp.publicKey.export({ type: 'spki', format: 'pem' }) as string })
  root = mkdtempSync(join(tmpdir(), 'mgx-store-'))
  tmpDirs.push(root)
})
afterEach(() => {
  for (const d of tmpDirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

const manifestBytes = (over: Record<string, unknown> = {}): Buffer =>
  canonicalJsonBytes({
    manifestVersion: 2,
    id: 'ext-plugin',
    version: '0.1.0',
    label: 'Ext',
    description: 'x',
    category: 'ai',
    apiVersion: '^0.2.0',
    minAppVersion: '0.8.14',
    author: { name: 'T' },
    entrypoints: { main: 'main.js' },
    capabilities: [],
    ...over,
  })

const mainJs = (id = 'ext-plugin', body = '') =>
  Buffer.from(`module.exports = { id: ${JSON.stringify(id)}, register: function () { ${body} } }\n`, 'utf8')

async function archive(opts: { manifest?: Buffer; main?: Buffer } = {}): Promise<Buffer> {
  return packPluginArtifact({
    files: [
      { path: 'manifest.json', content: opts.manifest ?? manifestBytes() },
      { path: 'main.js', content: opts.main ?? mainJs() },
    ],
    signKey: priv,
    keyId: KEY_ID,
  })
}

const env = (over: Record<string, unknown> = {}) => ({
  pluginsRoot: root,
  keyring,
  appVersion: '0.8.14',
  blockedIds: new Set<string>(),
  ...over,
})

/** Install + Index-Commit (wie es der Aufrufer `manage` nach erfolgreicher Aktivierung täte) —
 *  für die discover-Tests, die eine aktive Version in active.json brauchen. */
async function installCommitted(a: Buffer, e = env()) {
  const r = await installPluginArtifact(a, e)
  setActiveVersion(root, r.id, r.version)
  return r
}

describe('installPluginArtifact', () => {
  it('materialisiert + verifiziert, OHNE den Aktivierungsindex zu setzen', async () => {
    const res = await installPluginArtifact(await archive(), env())
    expect(res).toMatchObject({ id: 'ext-plugin', version: '0.1.0', idempotent: false })
    expect(existsSync(join(res.versionDir, 'main.js'))).toBe(true)
    expect(existsSync(join(res.versionDir, 'integrity.json'))).toBe(true)
    expect(existsSync(join(res.versionDir, 'integrity.json.sig'))).toBe(true)
    // Index-Commit ist Sache des Aufrufers (manage) NACH erfolgreicher Aktivierung — install setzt ihn NICHT.
    expect(readActiveIndex(pluginPaths(root).activeIndexPath).active).toEqual({})
  })

  it('ist idempotent bei byte-identischem Artefakt', async () => {
    const a = await archive()
    await installPluginArtifact(a, env())
    const res2 = await installPluginArtifact(a, env())
    expect(res2.idempotent).toBe(true)
  })

  it('lehnt abweichenden Inhalt unter gleicher Version ab (version-conflict)', async () => {
    await installPluginArtifact(await archive(), env())
    const other = await archive({ main: mainJs('ext-plugin', 'return 1;') })
    await expect(installPluginArtifact(other, env())).rejects.toMatchObject({ code: 'version-conflict' })
  })

  it('lehnt eine ID-Kollision mit gebündeltem/reserviertem Plugin ab (id-collision)', async () => {
    await expect(
      installPluginArtifact(await archive(), env({ blockedIds: new Set(['ext-plugin']) }))
    ).rejects.toMatchObject({ code: 'id-collision' })
    expect(existsSync(pluginPaths(root).storeDir)).toBe(false) // kein Teil-Install
  })

  it('lehnt inkompatible apiVersion ab und installiert nichts (Rollback)', async () => {
    await expect(
      installPluginArtifact(await archive({ manifest: manifestBytes({ apiVersion: '^9.9.9' }) }), env())
    ).rejects.toMatchObject({ code: 'incompatible-api' })
    expect(existsSync(versionDir(pluginPaths(root), 'ext-plugin', '0.1.0'))).toBe(false)
    expect(readActiveIndex(pluginPaths(root).activeIndexPath).active).toEqual({})
  })

  it('lehnt eine fremde Signatur ab (sig-mismatch), kein Install', async () => {
    const other = generateKeyPairSync('ed25519')
    const a = await packPluginArtifact({
      files: [{ path: 'manifest.json', content: manifestBytes() }, { path: 'main.js', content: mainJs() }],
      signKey: other.privateKey,
      keyId: KEY_ID,
    })
    await expect(installPluginArtifact(a, env())).rejects.toMatchObject({ code: 'sig-mismatch' })
  })
})

describe('discoverInstalledPlugins', () => {
  it('liefert die aktive Version als ladbare Quelle', async () => {
    await installCommitted(await archive())
    const { sources, errors } = discoverInstalledPlugins(env())
    expect(errors).toEqual([])
    expect(sources).toHaveLength(1)
    expect(sources[0].manifest.id).toBe('ext-plugin')
    const entry = await sources[0].loadEntry!()
    const e = (entry as { default?: unknown }).default ?? entry
    expect((e as { id: string }).id).toBe('ext-plugin')
  })

  it('ist leer ohne active.json', () => {
    const { sources, errors } = discoverInstalledPlugins(env())
    expect(sources).toEqual([])
    expect(errors).toEqual([])
  })

  it('Manipulation des installierten main.js → fail-closed (kein Source, Fehler gemeldet)', async () => {
    const res = await installCommitted(await archive())
    writeFileSync(join(res.versionDir, 'main.js'), Buffer.from('GETAMPERT — anderer Inhalt', 'utf8'))
    const { sources, errors } = discoverInstalledPlugins(env())
    expect(sources).toEqual([])
    expect(errors).toHaveLength(1)
    expect(errors[0].code).toMatch(/hash-mismatch|size-mismatch/)
  })

  it('unbekannter Key beim Laden → fail-closed (sig-unknown-key)', async () => {
    await installCommitted(await archive())
    const emptyKeyring: Keyring = { get: () => undefined }
    const { sources, errors } = discoverInstalledPlugins(env({ keyring: emptyKeyring }))
    expect(sources).toEqual([])
    expect(errors[0].code).toBe('sig-unknown-key')
  })

  it('ID-Kollision wird auch beim Laden verworfen', async () => {
    await installCommitted(await archive())
    const { sources, errors } = discoverInstalledPlugins(env({ blockedIds: new Set(['ext-plugin']) }))
    expect(sources).toEqual([])
    expect(errors[0].code).toBe('id-collision')
  })
})

describe('A1 P1-Fixes — Regressionen', () => {
  // P1.1: Symlink store/<id> + untrusted Indexwerte.
  it('lehnt einen Symlink als store/<id> ab (path-invalid)', async () => {
    const evil = mkdtempSync(join(tmpdir(), 'mgx-evil-'))
    tmpDirs.push(evil)
    mkdirSync(pluginPaths(root).storeDir, { recursive: true })
    symlinkSync(evil, join(pluginPaths(root).storeDir, 'ext-plugin'))
    await expect(installPluginArtifact(await archive(), env())).rejects.toMatchObject({ code: 'path-invalid' })
  })

  it('discover validiert untrusted active.json (böse id → path-invalid, kein Zugriff)', () => {
    const p = pluginPaths(root)
    mkdirSync(p.root, { recursive: true })
    writeFileSync(p.activeIndexPath, JSON.stringify({ formatVersion: 1, active: { '../evil': '0.1.0', 'BAD ID': '1.0.0' } }) + '\n')
    const { sources, errors } = discoverInstalledPlugins(env())
    expect(sources).toEqual([])
    expect(errors).toHaveLength(2)
    expect(errors.every((e) => e.code === 'path-invalid')).toBe(true)
  })

  // P1.2: manipulierte Installation darf nicht als idempotent durchgehen; inaktive Version wird aktiviert.
  it('Re-Install nach Manipulation ist NICHT idempotent (version-conflict)', async () => {
    const a = await archive()
    const res = await installPluginArtifact(a, env())
    const orig = readFileSync(join(res.versionDir, 'main.js'))
    writeFileSync(join(res.versionDir, 'main.js'), Buffer.alloc(orig.length, 0x41)) // gleiche Länge, anderer Hash
    await expect(installPluginArtifact(a, env())).rejects.toMatchObject({ code: 'version-conflict' })
  })

  it('idempotenter Re-Install lässt den Aktivierungsindex unverändert (Commit ist Aufrufer-Sache)', async () => {
    const a = await archive()
    await installPluginArtifact(a, env())
    expect(readActiveIndex(pluginPaths(root).activeIndexPath).active).toEqual({}) // install committet nie
    const res2 = await installPluginArtifact(a, env())
    expect(res2.idempotent).toBe(true)
    expect(readActiveIndex(pluginPaths(root).activeIndexPath).active).toEqual({}) // weiterhin nicht gesetzt
  })

  // P1.3: Installation führt KEINEN Plugin-Code aus; Laden erst im loadEntry-Pfad.
  it('führt main.js bei der Installation NICHT aus', async () => {
    const a = await archive({
      main: Buffer.from('throw new Error("boom-on-load")\nmodule.exports = { id: "ext-plugin", register: function () {} }\n', 'utf8'),
    })
    const res = await installCommitted(a) // darf NICHT werfen (kein require beim Install)
    expect(res.idempotent).toBe(false)
    const { sources } = discoverInstalledPlugins(env())
    await expect(sources[0].loadEntry!()).rejects.toThrow(/boom-on-load/) // erst hier wird ausgeführt
  })

  // P1.4: verifizierter Manifest-Entrypoint wird respektiert; renderer-only ist erlaubt (Renderer-Plugin-Host).
  it('respektiert den Manifest-Entrypoint dist/main.js', async () => {
    const a = await packPluginArtifact({
      files: [
        { path: 'manifest.json', content: manifestBytes({ entrypoints: { main: 'dist/main.js' } }) },
        { path: 'dist/main.js', content: mainJs() },
      ],
      signKey: priv,
      keyId: KEY_ID,
    })
    await installCommitted(a)
    const { sources, errors } = discoverInstalledPlugins(env())
    expect(errors).toEqual([])
    const entry = await sources[0].loadEntry!()
    expect((entry as { id: string }).id).toBe('ext-plugin')
  })

  it('installiert ein Renderer-only-Manifest (main optional, ADR plugin-renderer-host §5.1)', async () => {
    const a = await packPluginArtifact({
      files: [
        { path: 'manifest.json', content: manifestBytes({ entrypoints: { renderer: 'renderer.js' } }) },
        { path: 'renderer.js', content: Buffer.from('export default {}\n', 'utf8') },
      ],
      signKey: priv,
      keyId: KEY_ID,
    })
    const res = await installCommitted(a) // darf NICHT werfen — renderer-only ist gültig
    expect(res.idempotent).toBe(false)
    const { sources, errors } = discoverInstalledPlugins(env())
    expect(errors).toEqual([])
    expect(sources).toHaveLength(1)
    expect(sources[0].loadEntry).toBeUndefined() // renderer-only → kein Main-Loader (require)
  })
})
