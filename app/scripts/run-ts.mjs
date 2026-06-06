// Headless TS-Runner ohne tsx/ts-node: bundelt eine TS-Entry mit esbuild (bereits
// via vite vorhanden) zu einer temporären CJS-Datei und führt sie in einem
// Kind-Node-Prozess aus (stdio durchgereicht → korrekte Ausgabe + Exit-Code).
// Node-Builtins bleiben extern, `fetch` ist global (Node 18+).
//
//   node scripts/run-ts.mjs scripts/rag-eval.ts -- <args…>
//
import { build } from 'esbuild'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { spawn } from 'child_process'

const entry = process.argv[2]
if (!entry) {
  console.error('usage: node scripts/run-ts.mjs <entry.ts> [args…]')
  process.exit(1)
}

const outdir = mkdtempSync(join(tmpdir(), 'mg-runts-'))
const outfile = join(outdir, 'bundle.cjs')

await build({
  entryPoints: [entry],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  outfile,
  logLevel: 'warning'
})

const child = spawn(process.execPath, [outfile, ...process.argv.slice(3)], { stdio: 'inherit' })
child.on('exit', (code) => process.exit(code ?? 0))
