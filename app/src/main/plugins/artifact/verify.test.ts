import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { generateKeyPairSync, sign as cryptoSign, createHash, type KeyObject } from 'node:crypto'
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { packPluginArtifact } from './pack'
import { verifyPluginArtifact, type Keyring } from './verify'
import { ArtifactError, ARTIFACT_LIMITS } from './limits'
import {
  canonicalJsonBytes,
  INTEGRITY_FILE,
  SIG_FILE,
  MANIFEST_FILE,
  type IntegrityEntry,
} from './format'

const KEY_ID = 'mindgraph-test-2026-01'
let priv: KeyObject
let pub: KeyObject
let keyring: Keyring
let tmpDirs: string[] = []

beforeEach(() => {
  const kp = generateKeyPairSync('ed25519')
  priv = kp.privateKey
  pub = kp.publicKey
  keyring = { get: (id) => (id === KEY_ID ? pub : undefined) }
  tmpDirs = []
})
afterEach(() => {
  for (const d of tmpDirs) rmSync(d, { recursive: true, force: true })
})

function quarantine(): string {
  const d = mkdtempSync(join(tmpdir(), 'mgx-quar-'))
  tmpDirs.push(d)
  return d
}

const manifestBuf = (over: Record<string, unknown> = {}): Buffer =>
  canonicalJsonBytes({
    manifestVersion: 2,
    id: 'demo',
    version: '1.0.0',
    label: 'Demo',
    description: 'x',
    category: 'ai',
    apiVersion: '^0.2.0',
    minAppVersion: '0.8.14',
    author: { name: 'Test' },
    entrypoints: { main: 'main.js' },
    capabilities: [],
    ...over,
  })

const MAIN = Buffer.from('module.exports = { id: "demo", register() {} }\n', 'utf8')

const verifyOpts = (over: Partial<Parameters<typeof verifyPluginArtifact>[1]> = {}) => ({
  keyring,
  appVersion: '0.8.14',
  quarantineDir: quarantine(),
  ...over,
})

// — Low-level Archiv-Bau (für manipulierte Fälle): packt einen Verzeichnisinhalt deterministisch. —
async function buildArchive(dir: string, paths: string[]): Promise<Buffer> {
  const tar = await import('tar')
  const out = join(dir, '__a.tgz')
  await tar.create({ gzip: { level: 9 }, portable: true, cwd: dir, file: out }, [...paths].sort())
  return readFileSync(out)
}

/** Schreibt payload + integrity.json + .sig in einen frischen Tmp-Ordner; erlaubt gezielte Tampering-Hooks. */
function writeSignedSet(opts: {
  payload: { path: string; content: Buffer }[]
  signKey?: KeyObject
  keyId?: string
  integrityOverride?: (entries: IntegrityEntry[]) => IntegrityEntry[]
  mutateStoredIntegrity?: (canonical: Buffer) => Buffer
}): { dir: string; paths: string[] } {
  const dir = mkdtempSync(join(tmpdir(), 'mgx-craft-'))
  tmpDirs.push(dir)
  const write = (p: string, c: Buffer): void => {
    const abs = join(dir, p)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, c)
  }
  for (const f of opts.payload) write(f.path, f.content)

  let entries: IntegrityEntry[] = [...opts.payload]
    .map((f) => ({ path: f.path, size: f.content.length, sha256: createHash('sha256').update(f.content).digest('hex') }))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
  if (opts.integrityOverride) entries = opts.integrityOverride(entries)
  const integrityCanonical = canonicalJsonBytes({ formatVersion: 1, algorithm: 'sha256', files: entries })
  const stored = opts.mutateStoredIntegrity ? opts.mutateStoredIntegrity(integrityCanonical) : integrityCanonical
  write(INTEGRITY_FILE, stored)

  // Signiert wird die CANONICAL-Form (so wie ein ehrlicher Packer signiert); bei mutateStoredIntegrity
  // weicht der gespeicherte Inhalt davon ab → muss als sig-mismatch auffallen.
  const signature = cryptoSign(null, integrityCanonical, opts.signKey ?? priv)
  write(SIG_FILE, canonicalJsonBytes({ formatVersion: 1, algorithm: 'ed25519', keyId: opts.keyId ?? KEY_ID, signature: signature.toString('base64') }))

  return { dir, paths: [...opts.payload.map((f) => f.path), INTEGRITY_FILE, SIG_FILE] }
}

describe('verifyPluginArtifact — Happy Path (pack → verify)', () => {
  it('verifiziert ein korrektes Artefakt und schreibt die Quarantäne', async () => {
    const archive = await packPluginArtifact({
      files: [{ path: MANIFEST_FILE, content: manifestBuf() }, { path: 'main.js', content: MAIN }],
      signKey: priv,
      keyId: KEY_ID,
    })
    const opts = verifyOpts()
    const result = await verifyPluginArtifact(archive, opts)
    expect(result.id).toBe('demo')
    expect(result.version).toBe('1.0.0')
    expect(result.files.map((f) => f.path).sort()).toEqual(['main.js', 'manifest.json'])
    expect(readFileSync(join(opts.quarantineDir, 'main.js'))).toEqual(MAIN)
    expect(readFileSync(join(opts.quarantineDir, 'manifest.json'))).toEqual(manifestBuf())
  })
})

describe('verifyPluginArtifact — Signatur', () => {
  it('lehnt eine fremde Signatur ab (sig-mismatch)', async () => {
    const other = generateKeyPairSync('ed25519')
    const archive = await packPluginArtifact({
      files: [{ path: MANIFEST_FILE, content: manifestBuf() }, { path: 'main.js', content: MAIN }],
      signKey: other.privateKey, // mit fremdem Key signiert, Keyring hat aber pub
      keyId: KEY_ID,
    })
    await expect(verifyPluginArtifact(archive, verifyOpts())).rejects.toMatchObject({ code: 'sig-mismatch' })
  })

  it('lehnt eine unbekannte keyId ab (sig-unknown-key)', async () => {
    const archive = await packPluginArtifact({
      files: [{ path: MANIFEST_FILE, content: manifestBuf() }, { path: 'main.js', content: MAIN }],
      signKey: priv,
      keyId: 'fremde-key-id',
    })
    await expect(verifyPluginArtifact(archive, verifyOpts())).rejects.toMatchObject({ code: 'sig-unknown-key' })
  })

  it('erkennt nachträglich getamperte integrity.json (sig-mismatch)', async () => {
    const { dir, paths } = writeSignedSet({
      payload: [{ path: MANIFEST_FILE, content: manifestBuf() }, { path: 'main.js', content: MAIN }],
      mutateStoredIntegrity: (b) => Buffer.from(b.toString('utf8').replace('"sha256"', '"sha256"') + ' ', 'utf8'),
    })
    const archive = await buildArchive(dir, paths)
    await expect(verifyPluginArtifact(archive, verifyOpts())).rejects.toMatchObject({ code: 'sig-mismatch' })
  })
})

describe('verifyPluginArtifact — Integrität / Dateimenge', () => {
  it('erkennt einen Hash-Mismatch (gleiche Länge, anderer Inhalt)', async () => {
    const { dir, paths } = writeSignedSet({ payload: [{ path: MANIFEST_FILE, content: manifestBuf() }, { path: 'main.js', content: MAIN }] })
    // main.js längen-gleich überschreiben → size passt, Hash nicht.
    writeFileSync(join(dir, 'main.js'), Buffer.alloc(MAIN.length, 0x41))
    const archive = await buildArchive(dir, paths)
    await expect(verifyPluginArtifact(archive, verifyOpts())).rejects.toMatchObject({ code: 'hash-mismatch' })
  })

  it('erkennt einen Size-Mismatch (Länge geändert)', async () => {
    const { dir, paths } = writeSignedSet({ payload: [{ path: MANIFEST_FILE, content: manifestBuf() }, { path: 'main.js', content: MAIN }] })
    writeFileSync(join(dir, 'main.js'), Buffer.from('kurz', 'utf8'))
    const archive = await buildArchive(dir, paths)
    await expect(verifyPluginArtifact(archive, verifyOpts())).rejects.toMatchObject({ code: 'size-mismatch' })
  })

  it('erkennt eine zusätzliche, nicht gelistete Datei (fileset-mismatch)', async () => {
    const { dir, paths } = writeSignedSet({ payload: [{ path: MANIFEST_FILE, content: manifestBuf() }, { path: 'main.js', content: MAIN }] })
    writeFileSync(join(dir, 'extra.js'), Buffer.from('// schmuggel', 'utf8'))
    const archive = await buildArchive(dir, [...paths, 'extra.js'])
    await expect(verifyPluginArtifact(archive, verifyOpts())).rejects.toMatchObject({ code: 'fileset-mismatch' })
  })

  it('lehnt einen Symlink-Eintrag ab (entry-type)', async () => {
    const { dir, paths } = writeSignedSet({ payload: [{ path: MANIFEST_FILE, content: manifestBuf() }, { path: 'main.js', content: MAIN }] })
    symlinkSync('main.js', join(dir, 'link.js'))
    const archive = await buildArchive(dir, [...paths, 'link.js'])
    await expect(verifyPluginArtifact(archive, verifyOpts())).rejects.toMatchObject({ code: 'entry-type' })
  })
})

describe('verifyPluginArtifact — Manifest, Gates, Entrypoints', () => {
  it('lehnt ein ungültiges Manifest ab (manifest-invalid)', async () => {
    const archive = await packPluginArtifact({
      files: [{ path: MANIFEST_FILE, content: manifestBuf({ apiVersion: undefined }) }, { path: 'main.js', content: MAIN }],
      signKey: priv,
      keyId: KEY_ID,
    })
    await expect(verifyPluginArtifact(archive, verifyOpts())).rejects.toMatchObject({ code: 'manifest-invalid' })
  })

  it('lehnt inkompatible apiVersion ab (incompatible-api)', async () => {
    const archive = await packPluginArtifact({
      files: [{ path: MANIFEST_FILE, content: manifestBuf({ apiVersion: '^9.9.9' }) }, { path: 'main.js', content: MAIN }],
      signKey: priv,
      keyId: KEY_ID,
    })
    await expect(verifyPluginArtifact(archive, verifyOpts())).rejects.toMatchObject({ code: 'incompatible-api' })
  })

  it('lehnt zu hohe minAppVersion ab (incompatible-app)', async () => {
    const archive = await packPluginArtifact({
      files: [{ path: MANIFEST_FILE, content: manifestBuf({ minAppVersion: '999.0.0' }) }, { path: 'main.js', content: MAIN }],
      signKey: priv,
      keyId: KEY_ID,
    })
    await expect(verifyPluginArtifact(archive, verifyOpts())).rejects.toMatchObject({ code: 'incompatible-app' })
  })

  it('lehnt fehlendes entrypoint-Ziel ab (entrypoint-missing)', async () => {
    // entrypoints.main = 'main.js', aber main.js nicht im Paket (nur manifest.json).
    const archive = await packPluginArtifact({
      files: [{ path: MANIFEST_FILE, content: manifestBuf() }],
      signKey: priv,
      keyId: KEY_ID,
    })
    await expect(verifyPluginArtifact(archive, verifyOpts())).rejects.toMatchObject({ code: 'entrypoint-missing' })
  })
})

describe('verifyPluginArtifact — Limits', () => {
  it('lehnt ein zu großes Archiv ab (archive-too-large)', async () => {
    const archive = await packPluginArtifact({
      files: [{ path: MANIFEST_FILE, content: manifestBuf() }, { path: 'main.js', content: MAIN }],
      signKey: priv,
      keyId: KEY_ID,
    })
    const opts = verifyOpts({ limits: { ...ARTIFACT_LIMITS, maxArchiveBytes: 10 } })
    await expect(verifyPluginArtifact(archive, opts)).rejects.toMatchObject({ code: 'archive-too-large' })
  })

  it('lehnt zu viele Dateien ab (limit-files)', async () => {
    const archive = await packPluginArtifact({
      files: [{ path: MANIFEST_FILE, content: manifestBuf() }, { path: 'main.js', content: MAIN }, { path: 'a.js', content: Buffer.from('a') }],
      signKey: priv,
      keyId: KEY_ID,
    })
    const opts = verifyOpts({ limits: { ...ARTIFACT_LIMITS, maxFiles: 2 } })
    await expect(verifyPluginArtifact(archive, opts)).rejects.toMatchObject({ code: 'limit-files' })
  })

  it('wirft ArtifactError-Instanzen (kein generischer Error)', async () => {
    const archive = await packPluginArtifact({
      files: [{ path: MANIFEST_FILE, content: manifestBuf() }, { path: 'main.js', content: MAIN }],
      signKey: priv,
      keyId: 'unbekannt',
    })
    await expect(verifyPluginArtifact(archive, verifyOpts())).rejects.toBeInstanceOf(ArtifactError)
  })
})
