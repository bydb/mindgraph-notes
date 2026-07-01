import { describe, it, expect } from 'vitest'
import { generateKeyPairSync } from 'node:crypto'
import { findEsmViolations, assertSelfContainedEsm } from './esmCheck'
import { packPluginArtifact } from './pack'

describe('findEsmViolations (Single-File-ESM-Vertrag, F12)', () => {
  it('akzeptiert ein selbstenthaltenes Bundle (nur export default)', () => {
    expect(findEsmViolations('const x = 1; export default { id: "demo", activate() {} }')).toEqual([])
  })

  it('erlaubt data:-Inline-Importe', () => {
    expect(findEsmViolations('import wasm from "data:application/wasm;base64,AAA"; export default {}')).toEqual([])
  })

  it('lehnt relativen statischen Import ab', () => {
    const v = findEsmViolations('import x from "./chunk.js"\nexport default {}')
    expect(v).toContainEqual({ kind: 'static-import', detail: './chunk.js' })
  })

  it('lehnt bare Re-Export ab', () => {
    const v = findEsmViolations('export { x } from "react"\nexport default {}')
    expect(v).toContainEqual({ kind: 'static-import', detail: 'react' })
  })

  it('lehnt Seiteneffekt-Import ab', () => {
    const v = findEsmViolations('import "./styles.css"\nexport default {}')
    expect(v).toContainEqual({ kind: 'side-effect-import', detail: './styles.css' })
  })

  it('lehnt dynamischen relativen Import ab', () => {
    const v = findEsmViolations('const m = import("./lazy.js"); export default {}')
    expect(v).toContainEqual({ kind: 'dynamic-import', detail: './lazy.js' })
  })

  it('lehnt import.meta.url ab (Asset-/Worker-Pfade)', () => {
    const v = findEsmViolations('const u = new URL("./w.js", import.meta.url); export default {}')
    expect(v.some((x) => x.kind === 'import.meta.url')).toBe(true)
  })

  it('lehnt eval und new Function ab', () => {
    expect(findEsmViolations('eval("1")').some((x) => x.kind === 'eval')).toBe(true)
    expect(findEsmViolations('new Function("return 1")').some((x) => x.kind === 'new Function')).toBe(true)
  })

  it('assertSelfContainedEsm wirft mit Label + Detail', () => {
    expect(() => assertSelfContainedEsm('import x from "./a.js"', 'renderer.js')).toThrow(/renderer\.js.*static-import.*a\.js/)
    expect(() => assertSelfContainedEsm('export default {}', 'renderer.js')).not.toThrow()
  })
})

describe('packPluginArtifact erzwingt Single-File-ESM für den renderer-Entry (F12/F20)', () => {
  const signKey = generateKeyPairSync('ed25519').privateKey
  const manifest = (renderer: string): Buffer => Buffer.from(JSON.stringify({ id: 'demo', entrypoints: { renderer } }), 'utf8')

  it('akzeptiert ein selbstenthaltenes renderer.js', async () => {
    const archive = await packPluginArtifact({
      files: [
        { path: 'manifest.json', content: manifest('renderer.js') },
        { path: 'renderer.js', content: Buffer.from('export default { id: "demo", activate() {} }', 'utf8') },
      ],
      signKey,
      keyId: 'dev',
    })
    expect(archive).toBeInstanceOf(Buffer)
  })

  it('lehnt ein gesplittetes Bundle (relativer Sub-Import) terminal ab', async () => {
    await expect(
      packPluginArtifact({
        files: [
          { path: 'manifest.json', content: manifest('renderer.js') },
          { path: 'renderer.js', content: Buffer.from('import x from "./chunk.js"\nexport default { id: "demo", activate() {} }', 'utf8') },
          { path: 'chunk.js', content: Buffer.from('export const x = 1\n', 'utf8') },
        ],
        signKey,
        keyId: 'dev',
      }),
    ).rejects.toThrow(/Single-File-ESM/)
  })
})
