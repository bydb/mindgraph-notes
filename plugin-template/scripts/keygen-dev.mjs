// Erzeugt EINEN lokalen Ed25519-Dev-Schlüssel für Pack-/Verify-Tests.
//
// Sicherheitsregeln (siehe README + ADR):
//  - Niemals committen. Die Ausgabedatei (*.dev-key.json) ist git-ignoriert.
//  - Der Dev-Key wird NIE automatisch verwendet — Pack/Sign muss ihn explizit übergeben bekommen.
//  - Der Produktions-Key wird hiermit NICHT erzeugt (der lebt ausschließlich im geschützten
//    CI-Environment als Secret PLUGIN_SIGNING_KEY).
import { generateKeyPairSync } from 'node:crypto'
import { existsSync, writeFileSync } from 'node:fs'

const out = process.argv[2] ?? 'local.dev-key.json'
if (existsSync(out)) {
  console.error(`Abbruch: '${out}' existiert bereits — bestehenden Dev-Key nicht überschreiben.`)
  process.exit(1)
}

const keyId = `dev-${new Date().toISOString().slice(0, 10)}`
const { publicKey, privateKey } = generateKeyPairSync('ed25519')

writeFileSync(
  out,
  JSON.stringify(
    {
      keyId,
      algorithm: 'ed25519',
      privatePkcs8Pem: privateKey.export({ type: 'pkcs8', format: 'pem' }),
      publicSpkiPem: publicKey.export({ type: 'spki', format: 'pem' }),
    },
    null,
    2
  ) + '\n'
)

console.log(`Dev-Key geschrieben: ${out} (git-ignoriert). keyId=${keyId}`)
console.log('WARNUNG: niemals committen. Nur für lokale Pack-/Verify-Tests.')
