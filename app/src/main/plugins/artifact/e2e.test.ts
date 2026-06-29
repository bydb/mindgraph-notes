import { describe, it, expect, afterAll } from 'vitest'
import { generateKeyPairSync } from 'node:crypto'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { packPluginArtifact } from './pack'
import { verifyPluginArtifact, type Keyring } from './verify'
import { canonicalJsonBytes } from './format'
import type { PluginMainEntry } from '@mindgraph/plugin-api'

// End-to-End-Pipeline (ADR docs/plugin-artifact-format-plan.md): das Main-only-Template wird mit
// derselben esbuild-Konfiguration gebaut wie im echten Repo, mit einem Dev-Key signiert, verifiziert
// und das verifizierte main.js per createRequire aus einem Ordner OHNE package.json geladen. Deckt
// die ADR-Akzeptanzkriterien 2–4 ab (build → sign → verify → CJS-Lade-Test).

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '../../../../..')
const templateDir = join(repoRoot, 'plugin-template')
const apiSrc = join(repoRoot, 'app/packages/plugin-api/src/index.ts')

const tmpDirs: string[] = []
afterAll(() => {
  for (const d of tmpDirs) rmSync(d, { recursive: true, force: true })
})

async function loadBuildConfig(): Promise<{
  PLUGIN_BUILD_OPTIONS: Record<string, unknown>
  banBuiltins: () => unknown
}> {
  return (await import(pathToFileURL(join(templateDir, 'esbuild.config.mjs')).href)) as never
}

async function bundleTemplateMain(): Promise<Buffer> {
  const esbuild = await import('esbuild')
  const cfg = await loadBuildConfig()
  const result = await esbuild.build({
    ...cfg.PLUGIN_BUILD_OPTIONS,
    entryPoints: [join(templateDir, 'src/main.ts')],
    bundle: true,
    write: false,
    alias: { '@mindgraph/plugin-api': apiSrc },
    plugins: [cfg.banBuiltins() as never],
  })
  return Buffer.from(result.outputFiles![0].contents)
}

describe('A0/3 E2E — Template: build → sign → verify → createRequire', () => {
  it('baut, signiert (Dev-Key), verifiziert und lädt main.js als CommonJS ohne package.json', async () => {
    const mainJs = await bundleTemplateMain()
    const manifestBytes = canonicalJsonBytes(JSON.parse(readFileSync(join(templateDir, 'manifest.json'), 'utf8')))

    const kp = generateKeyPairSync('ed25519')
    const keyId = 'dev-e2e'
    const archive = await packPluginArtifact({
      files: [
        { path: 'manifest.json', content: manifestBytes },
        { path: 'main.js', content: mainJs },
      ],
      signKey: kp.privateKey,
      keyId,
    })

    const quarantineDir = mkdtempSync(join(tmpdir(), 'mgx-e2e-'))
    tmpDirs.push(quarantineDir)
    const keyring: Keyring = { get: (id) => (id === keyId ? kp.publicKey : undefined) }

    const result = await verifyPluginArtifact(archive, { keyring, appVersion: '0.8.14', quarantineDir })
    expect(result.id).toBe('example-plugin')
    expect(result.files.map((f) => f.path).sort()).toEqual(['main.js', 'manifest.json'])

    // ADR-Kriterium: verifiziertes main.js aus einem Ordner OHNE package.json via createRequire laden.
    const req = createRequire(join(quarantineDir, 'loader.cjs'))
    const entry = req(join(quarantineDir, 'main.js')) as PluginMainEntry
    expect(entry.id).toBe('example-plugin')
    expect(typeof entry.register).toBe('function')
  })

  it('der Build verbietet Node-/Electron-Built-ins', async () => {
    const esbuild = await import('esbuild')
    const cfg = await loadBuildConfig()
    await expect(
      esbuild.build({
        ...cfg.PLUGIN_BUILD_OPTIONS,
        stdin: { contents: "import 'node:fs'\nexport default {}", resolveDir: templateDir, loader: 'ts' },
        bundle: true,
        write: false,
        plugins: [cfg.banBuiltins() as never],
      })
    ).rejects.toThrow(/Built-in/)
  })
})
