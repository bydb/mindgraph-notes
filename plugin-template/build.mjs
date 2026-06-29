// Plugin-Build (Main-only): bundelt src/main.ts → dist/main.js (CJS) und schreibt eine kanonische
// dist/manifest.json. Packen + Signieren übernimmt die Build-/Signier-Pipeline (siehe README).
import { build } from 'esbuild'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { PLUGIN_BUILD_OPTIONS, banBuiltins } from './esbuild.config.mjs'

mkdirSync('dist', { recursive: true })

// Kanonische manifest.json (JSON.stringify(v,null,2)+LF) — deterministische Bytes (ADR).
const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'))
writeFileSync('dist/manifest.json', JSON.stringify(manifest, null, 2) + '\n')

await build({
  ...PLUGIN_BUILD_OPTIONS,
  entryPoints: ['src/main.ts'],
  outfile: 'dist/main.js',
  plugins: [banBuiltins()],
})

console.log('Build fertig → dist/main.js + dist/manifest.json')
