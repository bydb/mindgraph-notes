import { describe, it, expect } from 'vitest'
import { generateKeyPairSync } from 'node:crypto'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { signPlugin, SIGNER_KEY_ID } from './signCli'
import { verifyPluginArtifact } from './verify'
import { keyringFromSpkiMap } from '../runtime/keyring'

// Testschlüsselpaar — NICHT der Prod-Key (der berührt die Session nie). Via DI als OFFICIAL_KEYS.
const { publicKey, privateKey } = generateKeyPairSync('ed25519')
const officialKeys = { [SIGNER_KEY_ID]: publicKey.export({ type: 'spki', format: 'pem' }).toString() }

function validManifest(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    manifestVersion: 2,
    id: 'demo-x',
    version: '0.1.0',
    label: 'Demo X',
    description: 'Test-Plugin.',
    category: 'ai',
    apiVersion: '^0.2.0',
    minAppVersion: '0.8.14',
    repo: 'https://github.com/o/r',
    author: { name: 'T' },
    entrypoints: { main: 'main.js' },
    capabilities: [],
    actions: [{ id: 'demo-x.ping', label: 'Ping', requiredCapabilities: [] }],
    ...over,
  }
}

function makeArtifact(manifest: Record<string, unknown>, extra: Record<string, string> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), 'mgxart-'))
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  writeFileSync(join(dir, 'main.js'), 'module.exports = {}\n')
  for (const [name, content] of Object.entries(extra)) writeFileSync(join(dir, name), content)
  return dir
}

const base = { expectedRepo: 'o/r', expectedVersion: '0.1.0', signKey: privateKey }

describe('signPlugin — offizieller Signierer (adversarial)', () => {
  it('signiert ein gültiges Artefakt; der echte Verifier akzeptiert es', async () => {
    const dir = makeArtifact(validManifest())
    const archive = await signPlugin({ artifactDir: dir, ...base }, { officialKeys })
    const q = mkdtempSync(join(tmpdir(), 'mgxq-'))
    const v = await verifyPluginArtifact(archive, { keyring: keyringFromSpkiMap(officialKeys), appVersion: '9999.0.0', quarantineDir: q })
    expect(v.id).toBe('demo-x')
    expect(v.version).toBe('0.1.0')
    rmSync(dir, { recursive: true, force: true })
    rmSync(q, { recursive: true, force: true })
  })

  it('falscher Schlüssel (Public ≠ OFFICIAL_KEYS) → Abbruch', async () => {
    const dir = makeArtifact(validManifest())
    const other = generateKeyPairSync('ed25519').privateKey
    await expect(signPlugin({ artifactDir: dir, ...base, signKey: other }, { officialKeys })).rejects.toThrow(/falscher Signierschlüssel/)
  })

  it('manifest.version ≠ Tag → Abbruch', async () => {
    const dir = makeArtifact(validManifest({ version: '0.2.0' }))
    await expect(signPlugin({ artifactDir: dir, ...base }, { officialKeys })).rejects.toThrow(/Tag-Version/)
  })

  it('manifest.repo ≠ Input-Repo → Abbruch', async () => {
    const dir = makeArtifact(validManifest({ repo: 'https://github.com/evil/x' }))
    await expect(signPlugin({ artifactDir: dir, ...base }, { officialKeys })).rejects.toThrow(/Input-Repo/)
  })

  it('Extra-Datei im Artefakt → Abbruch', async () => {
    const dir = makeArtifact(validManifest(), { 'extra.js': 'x' })
    await expect(signPlugin({ artifactDir: dir, ...base }, { officialKeys })).rejects.toThrow(/Unerwartete Datei/)
  })

  it('fehlender deklarierter Entrypoint → Abbruch', async () => {
    const dir = makeArtifact(validManifest({ entrypoints: { main: 'main.js', renderer: 'renderer.js' } }))
    await expect(signPlugin({ artifactDir: dir, ...base }, { officialKeys })).rejects.toThrow(/fehlt/)
  })

  it('nicht-reguläre Datei (Symlink) → Abbruch', async () => {
    const dir = makeArtifact(validManifest())
    symlinkSync('/etc/hosts', join(dir, 'evil.js'))
    await expect(signPlugin({ artifactDir: dir, ...base }, { officialKeys })).rejects.toThrow(/Symlink/)
  })

  it('verschachtelter Entrypoint (dist/main.js) wird signiert; der echte Verifier akzeptiert', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mgxart-'))
    writeFileSync(join(dir, 'manifest.json'), JSON.stringify(validManifest({ entrypoints: { main: 'dist/main.js' } }), null, 2) + '\n')
    mkdirSync(join(dir, 'dist'))
    writeFileSync(join(dir, 'dist', 'main.js'), 'module.exports = {}\n')
    const archive = await signPlugin({ artifactDir: dir, ...base }, { officialKeys })
    const q = mkdtempSync(join(tmpdir(), 'mgxq-'))
    const v = await verifyPluginArtifact(archive, { keyring: keyringFromSpkiMap(officialKeys), appVersion: '9999.0.0', quarantineDir: q })
    expect(v.id).toBe('demo-x')
    expect(v.files.map((f) => f.path).sort()).toEqual(['dist/main.js', 'manifest.json'])
    rmSync(dir, { recursive: true, force: true })
    rmSync(q, { recursive: true, force: true })
  })

  it('verschachtelte unerwartete Datei (dist/extra.js) → Abbruch', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mgxart-'))
    writeFileSync(join(dir, 'manifest.json'), JSON.stringify(validManifest(), null, 2) + '\n')
    writeFileSync(join(dir, 'main.js'), 'module.exports = {}\n')
    mkdirSync(join(dir, 'dist'))
    writeFileSync(join(dir, 'dist', 'extra.js'), 'x')
    await expect(signPlugin({ artifactDir: dir, ...base }, { officialKeys })).rejects.toThrow(/Unerwartete Datei.*dist\/extra\.js/)
    rmSync(dir, { recursive: true, force: true })
  })

  it('ungültiges Manifest → Abbruch', async () => {
    const dir = makeArtifact(validManifest({ id: 'INVALID UPPER' }))
    await expect(signPlugin({ artifactDir: dir, ...base }, { officialKeys })).rejects.toThrow(/Manifest/)
  })
})
