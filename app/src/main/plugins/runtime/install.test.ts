import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { generateKeyPairSync, type KeyObject } from 'node:crypto'
import { mkdtempSync, rmSync, existsSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { packPluginArtifact } from '../artifact/pack'
import { canonicalJsonBytes } from '../artifact/format'
import { type Keyring } from '../artifact/verify'
import { installPluginArtifact } from './install'
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

describe('installPluginArtifact', () => {
  it('installiert, materialisiert und aktiviert atomar', async () => {
    const res = await installPluginArtifact(await archive(), env())
    expect(res).toMatchObject({ id: 'ext-plugin', version: '0.1.0', idempotent: false })
    expect(existsSync(join(res.versionDir, 'main.js'))).toBe(true)
    expect(existsSync(join(res.versionDir, 'integrity.json'))).toBe(true)
    expect(existsSync(join(res.versionDir, 'integrity.json.sig'))).toBe(true)
    expect(readActiveIndex(pluginPaths(root).activeIndexPath).active).toEqual({ 'ext-plugin': '0.1.0' })
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
    await installPluginArtifact(await archive(), env())
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
    const res = await installPluginArtifact(await archive(), env())
    writeFileSync(join(res.versionDir, 'main.js'), Buffer.from('GETAMPERT — anderer Inhalt', 'utf8'))
    const { sources, errors } = discoverInstalledPlugins(env())
    expect(sources).toEqual([])
    expect(errors).toHaveLength(1)
    expect(errors[0].code).toMatch(/hash-mismatch|size-mismatch/)
  })

  it('unbekannter Key beim Laden → fail-closed (sig-unknown-key)', async () => {
    await installPluginArtifact(await archive(), env())
    const emptyKeyring: Keyring = { get: () => undefined }
    const { sources, errors } = discoverInstalledPlugins(env({ keyring: emptyKeyring }))
    expect(sources).toEqual([])
    expect(errors[0].code).toBe('sig-unknown-key')
  })

  it('ID-Kollision wird auch beim Laden verworfen', async () => {
    await installPluginArtifact(await archive(), env())
    const { sources, errors } = discoverInstalledPlugins(env({ blockedIds: new Set(['ext-plugin']) }))
    expect(sources).toEqual([])
    expect(errors[0].code).toBe('id-collision')
  })
})
