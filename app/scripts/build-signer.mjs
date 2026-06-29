// Baut den offiziellen Signierer zu EINEM self-contained CJS-Bundle (scripts/sign-plugin.cjs).
// Deterministisch + ohne Laufzeit-npm-Deps → der geschützte Signierjob führt nur `node sign-plugin.cjs`
// aus (keine Dependency-Angriffsfläche). Der Drift-Check in der CI baut neu + vergleicht mit dem
// committeten Bundle, damit Quelle und Bundle nachweislich nicht auseinanderlaufen.
import { build } from 'esbuild'

await build({
  entryPoints: ['src/main/plugins/artifact/signCli.main.ts'],
  outfile: 'scripts/sign-plugin.cjs',
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'node20',
  legalComments: 'none',
  banner: { js: '// GENERIERT aus src/main/plugins/artifact/signCli*.ts — nicht von Hand editieren. Build: npm run build:signer' },
})

console.log('Signierer-Bundle gebaut → scripts/sign-plugin.cjs')
