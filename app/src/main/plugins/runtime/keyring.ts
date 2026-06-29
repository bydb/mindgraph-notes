// Verifier-Keyring (A1): offizielle Prod-Keys + (NUR Dev-Builds) Dev-Keys aus expliziter Datei.
// Kein stiller Fallback. Tests injizieren den Keyring per DI (nicht über diese Funktionen).
import { createPublicKey, type KeyObject } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import type { Keyring } from '../artifact/verify'

/** Offizielle Prod-Public-Keys (SPKI PEM je keyId). Ohne passenden Eintrag lässt sich real KEIN
 *  Fremd-Artefakt laden (sig-unknown-key). Rotation: neue keyId ZUSÄTZLICH pinnen, alte erst nach
 *  Auslauf entfernen. Der jeweilige PRIVATE Key liegt ausschließlich im geschützten GitHub-Environment
 *  `release-signing` (Secret `PLUGIN_SIGNING_KEY`) — nie im Repo. */
export const OFFICIAL_KEYS: Readonly<Record<string, string>> = {
  'mindgraph-release-2026-01':
    '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAotaSK1jNLSNryc7N5QkfsssLDx5Hs+9GU/frKGhCLSQ=\n-----END PUBLIC KEY-----\n',
}

/** Reservierte Kern-IDs, die externe Plugins niemals belegen dürfen (zusätzlich zu gebündelten). */
export const RESERVED_PLUGIN_IDS: ReadonlySet<string> = new Set(['core', 'mindgraph', 'app', 'system'])

/** Baut einen Keyring aus einer keyId→SPKI-PEM-Map; ungültige Keys werden übersprungen. */
export function keyringFromSpkiMap(map: Record<string, string>): Keyring {
  const keys = new Map<string, KeyObject>()
  for (const [keyId, pem] of Object.entries(map)) {
    try {
      keys.set(keyId, createPublicKey(pem))
    } catch {
      /* ungültiges PEM überspringen */
    }
  }
  return { get: (id) => keys.get(id) }
}

/**
 * Produktions-Keyring + optionaler Dev-Keyring. Dev-Keys NUR wenn `!isPackaged` UND `devKeyringPath`
 * (explizite Datei: JSON `{ keyId: spkiPem }`) gesetzt + vorhanden. In Produktions-Builds ignoriert.
 */
export function buildKeyring(opts: { isPackaged: boolean; devKeyringPath?: string }): Keyring {
  const map: Record<string, string> = { ...OFFICIAL_KEYS }
  if (!opts.isPackaged && opts.devKeyringPath && existsSync(opts.devKeyringPath)) {
    try {
      const parsed = JSON.parse(readFileSync(opts.devKeyringPath, 'utf8')) as Record<string, unknown>
      for (const [keyId, pem] of Object.entries(parsed)) {
        if (typeof pem === 'string') map[keyId] = pem
      }
    } catch {
      /* kaputte Dev-Keyring-Datei ignorieren — kein Fallback */
    }
  }
  return keyringFromSpkiMap(map)
}
