// Geteilte esbuild-Optionen für den Plugin-Main-Bundle (A0/3 Main-only-ABI).
// Wird von build.mjs (Template) UND vom In-Repo-E2E-Test importiert, damit beide IDENTISCH bauen.
//
// ABI (verbindlich): self-contained CommonJS, `module.exports = pluginEntry`. Eine heruntergeladene
// .js unter userData/plugins/ hat keine nahe package.json mit "type":"module" → Node lädt sie als
// CJS. Der footer wandelt esbuilds `export default` in ein direktes `module.exports = entry`.

import { builtinModules } from 'node:module'

const BANNED = new Set([
  ...builtinModules,
  ...builtinModules.map((m) => `node:${m}`),
  'electron',
])

/**
 * esbuild-Plugin: verbietet Node-/Electron-Built-ins im Plugin-Bundle. Leitplanke (Lint), KEINE
 * Isolation — Sicherheit kommt in Phase A aus Signatur + Autorvertrauen (siehe ADR). Der einzige
 * vorgesehene Draht nach außen ist `ctx.host`.
 */
export function banBuiltins() {
  return {
    name: 'ban-node-builtins',
    setup(build) {
      build.onResolve({ filter: /.*/ }, (args) => {
        if (args.kind !== 'import-statement' && args.kind !== 'require-call') return undefined
        if (BANNED.has(args.path)) {
          return {
            errors: [
              {
                text: `Node-/Electron-Built-in '${args.path}' ist im Plugin-Bundle verboten (nur ctx.host).`,
              },
            ],
          }
        }
        return undefined
      })
    },
  }
}

/** Basis-Optionen; Aufrufer ergänzt entryPoints/outfile (+ im Test: alias auf die Workspace-Quelle). */
export const PLUGIN_BUILD_OPTIONS = {
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'node20',
  legalComments: 'none',
  // esbuild emittiert bei `export default` ein `exports.default`; hier auf `module.exports = entry`
  // umbiegen, damit `require(main.js)` direkt den PluginMainEntry liefert (ABI-Vertrag).
  footer: {
    js: '\nif (module.exports && module.exports.default !== undefined) { module.exports = module.exports.default }\n',
  },
}
