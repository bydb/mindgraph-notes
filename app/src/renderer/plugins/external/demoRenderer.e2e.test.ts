// E2E-Beleg des Demo-Renderer-Plugins (ADR plugin-renderer-host §11, R1a). Fährt das ECHTE
// `resources/demo-plugins/mgx-demo-renderer/` durch den vollen Artefakt-Pfad (pack → install → verify →
// Serve der verifizierten Bytes) UND lädt seine echte `renderer.js` über den Registry-Lade-/Ack-Pfad
// (data:-URL-`import()` = reale Modulausführung, analog zum Blob-Import im Renderer). Das Live-DOM-Mount
// bleibt der manuelle `npm run dev`-Lauf (kein DOM im node-Test).

import { describe, it, expect, afterAll } from 'vitest'
import { generateKeyPairSync } from 'node:crypto'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { packPluginArtifact } from '../../../main/plugins/artifact/pack'
import { verifyInstalledRendererPayload } from '../../../main/plugins/artifact/verify'
import { assertSelfContainedEsm } from '../../../main/plugins/artifact/esmCheck'
import { installPluginArtifact } from '../../../main/plugins/runtime/install'
import { keyringFromSpkiMap } from '../../../main/plugins/runtime/keyring'
import type { RendererActivateAck, RendererDescriptor } from '../../../shared/plugins/renderer'
import { ExternalRendererRegistry, type RendererLoaderEnv } from './rendererRegistry'

const DEMO_DIR = join(process.cwd(), 'resources/demo-plugins/mgx-demo-renderer')
const manifestBytes = readFileSync(join(DEMO_DIR, 'manifest.json'))
const rendererCode = readFileSync(join(DEMO_DIR, 'renderer.js'), 'utf8')
const KEY_ID = 'dev-demo'

const tmpDirs: string[] = []
afterAll(() => { for (const d of tmpDirs.splice(0)) rmSync(d, { recursive: true, force: true }) })

describe('Demo-Renderer-Plugin — E2E (R1a-Beleg)', () => {
  it('die ausgelieferte renderer.js erfüllt den Single-File-ESM-Vertrag (F12)', () => {
    expect(() => assertSelfContainedEsm(rendererCode, 'renderer.js')).not.toThrow()
  })

  it('pack (Dev-Key) → install → verifyInstalledRendererPayload serviert EXAKT die verifizierten Bytes', async () => {
    const kp = generateKeyPairSync('ed25519')
    const keyring = keyringFromSpkiMap({ [KEY_ID]: kp.publicKey.export({ type: 'spki', format: 'pem' }) as string })
    const archive = await packPluginArtifact({
      files: [
        { path: 'manifest.json', content: manifestBytes },
        { path: 'renderer.js', content: Buffer.from(rendererCode, 'utf8') },
      ],
      signKey: kp.privateKey,
      keyId: KEY_ID,
    })

    const root = mkdtempSync(join(tmpdir(), 'mgx-demo-'))
    tmpDirs.push(root)
    const result = await installPluginArtifact(archive, { pluginsRoot: root, keyring, appVersion: '0.8.14', blockedIds: new Set<string>() })
    expect(result.id).toBe('mgx-demo-renderer')

    const { manifest, payload } = verifyInstalledRendererPayload(result.versionDir, { keyring, appVersion: '0.8.14' })
    expect(manifest.id).toBe('mgx-demo-renderer')
    expect(payload?.code.toString('utf8')).toBe(rendererCode) // exakt die verifizierten Bytes (I-L5)
  })

  it('lädt die echte renderer.js über den Registry-Pfad (data:-import), ackt ok und registriert den Editor', async () => {
    const descriptor: RendererDescriptor = {
      pluginId: 'mgx-demo-renderer',
      pluginLabel: 'Demo Renderer',
      version: '0.1.0',
      rendererInstanceId: 'demo-i1',
      fileEditors: [{ editorId: 'demo-text', extensions: ['.mgxdemo'], label: 'Demo-Text' }],
    }
    const acks: RendererActivateAck[] = []
    const env: RendererLoaderEnv = {
      fetchList: async () => ({ ok: true, data: [descriptor] }),
      fetchEntry: async () => ({
        ok: true,
        data: {
          rendererInstanceId: 'demo-i1',
          pluginId: 'mgx-demo-renderer',
          pluginLabel: 'Demo Renderer',
          version: '0.1.0',
          code: rendererCode,
          fileEditors: descriptor.fileEditors,
        },
      }),
      invokeHost: async () => ({ ok: true, data: '' }),
      ackActivated: async (ack) => { acks.push(ack) },
      // data:-URL = reale Modulausführung im node-Test (analog Blob-Import im Renderer).
      createModuleUrl: (code) => 'data:text/javascript;base64,' + Buffer.from(code, 'utf8').toString('base64'),
      importUrl: (url) => import(/* @vite-ignore */ url),
      revokeModuleUrl: () => {},
      applyStyles: () => {},
      removeStyles: () => {},
      getTheme: () => 'light',
      onThemeChange: () => () => {},
    }

    const reg = new ExternalRendererRegistry(env)
    await reg.sync()

    expect(acks).toEqual([{ ok: true, rendererInstanceId: 'demo-i1' }]) // strikter Export + activate + Staging ok
    expect(reg.isLoaded('mgx-demo-renderer', 'demo-text')).toBe(true) // deklarierte editorId registriert
  })
})
