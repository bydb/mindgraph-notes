// Zugangsschlüssel in ui-settings.json nicht im Klartext ablegen (Prüfung 22.11.2026).
//
// Readwise und LanguageTool halten ihren API-Schlüssel im uiStore des Renderers — viele
// Stellen lesen ihn dort. Statt diese Wege umzubauen, verschlüsselt der Main-Prozess das
// Feld an der Dateigrenze: beim Schreiben wird `apiKey` zu `apiKeyEnc` (safeStorage, base64)
// und `apiKey` leer; beim Laden für den Renderer umgekehrt. Auf der Platte steht damit kein
// Schlüssel mehr, im laufenden Renderer bleibt alles wie gehabt.
//
// Regeln (Codex F01, F05, F06):
// - Ein gewöhnliches Speichern LÖSCHT NIE. Ein leeres `apiKey` heißt „unbekannt“, nicht
//   „gelöscht“ — der Renderer bekommt bei gesperrtem Schlüsselbund ein leeres Feld und schickt
//   es beim nächsten Autosave zurück; jedes Fenster (Hauptfenster, Schnellerfassung) tut das
//   unabhängig. Eine vorhandene Chiffre bleibt deshalb stehen.
// - Ein neuer, nicht leerer Schlüssel ersetzt die alte Chiffre.
// - Löschen ist ein eigener Befehl (`clearUiSecret`, IPC `ui-secret-clear`) und wirkt auch,
//   wenn die Chiffre gerade unlesbar ist.
// - `uiSecretStatus` meldet den Zustand auf der Platte, nicht die Fähigkeit des Systems (F07).
//
// Ohne verfügbare Verschlüsselung (Linux ohne Schlüsselbund) bleibt ein neuer Schlüssel im
// Klartext — derselbe Zustand wie vorher; der Status meldet das als `plaintext`.
//
// Pur und ohne Electron-Import: Verschlüsselung wird hineingereicht (testbar).

export interface SecretCipher {
  available: () => boolean
  encrypt: (plain: string) => string // base64
  decrypt: (sealed: string) => string // wirft bei unlesbaren Daten
}

/** Einstellungsgruppen mit einem `apiKey`-Feld, das nicht im Klartext auf die Platte darf. */
export const SEALED_KEY_GROUPS = ['readwise', 'languageTool'] as const
export type SealedKeyGroup = typeof SEALED_KEY_GROUPS[number]

/** Zustand eines Schlüssels auf der Platte. */
export type UiSecretState = 'encrypted' | 'unreadable' | 'plaintext' | 'none'

export function isSealedKeyGroup(v: unknown): v is SealedKeyGroup {
  return typeof v === 'string' && (SEALED_KEY_GROUPS as readonly string[]).includes(v)
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v)

/** Liegt in den Einstellungen noch ein Schlüssel im Klartext, der versiegelt werden könnte? */
export function hasPlaintextSecrets(settings: Record<string, unknown>): boolean {
  return SEALED_KEY_GROUPS.some(group => {
    const g = settings[group]
    return isRecord(g) && typeof g.apiKey === 'string' && g.apiKey !== ''
  })
}

/**
 * Vor dem Schreiben: Klartext-Schlüssel verschlüsseln, vorhandene Chiffre nie verwerfen.
 *
 * @param merged   was geschrieben werden soll (Bestand flach gemischt mit dem Renderer-Stand)
 * @param existing Bestand auf der Platte vor dem Mischen
 */
export function sealUiSecrets(
  merged: Record<string, unknown>,
  existing: Record<string, unknown>,
  cipher: SecretCipher
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...merged }
  for (const group of SEALED_KEY_GROUPS) {
    const g = out[group]
    if (!isRecord(g)) continue
    const plain = typeof g.apiKey === 'string' ? g.apiKey : ''
    if (plain === '') {
      // Leeres Feld = unbekannt. Hat der flache Merge die Chiffre mit der Renderer-Gruppe
      // überschrieben, aus dem Bestand zurückholen.
      const old = existing[group]
      if (typeof g.apiKeyEnc !== 'string' && isRecord(old) && typeof old.apiKeyEnc === 'string') {
        out[group] = { ...g, apiKey: '', apiKeyEnc: old.apiKeyEnc }
      }
      continue
    }
    const { apiKey: _drop, apiKeyEnc: _old, ...rest } = g
    out[group] = cipher.available()
      ? { ...rest, apiKey: '', apiKeyEnc: cipher.encrypt(plain) }
      // Ohne Verschlüsselung: neuer Schlüssel im Klartext, die alte Chiffre ist überholt.
      : { ...rest, apiKey: plain }
  }
  return out
}

/** Ausdrückliches Löschen eines Schlüssels — auch einer gerade unlesbaren Chiffre (F06). */
export function clearUiSecret(settings: Record<string, unknown>, group: SealedKeyGroup): Record<string, unknown> {
  const g = settings[group]
  if (!isRecord(g)) return settings
  const { apiKeyEnc: _drop, ...rest } = g
  return { ...settings, [group]: { ...rest, apiKey: '' } }
}

/** Nach dem Lesen, bevor es an den Renderer geht: Schlüssel entschlüsseln, `apiKeyEnc` entfernen. */
export function openUiSecrets(settings: Record<string, unknown>, cipher: SecretCipher): Record<string, unknown> {
  const out: Record<string, unknown> = { ...settings }
  for (const group of SEALED_KEY_GROUPS) {
    const g = out[group]
    if (!isRecord(g) || typeof g.apiKeyEnc !== 'string') continue
    const { apiKeyEnc, ...rest } = g
    // Unlesbar (Schlüsselbund gesperrt/gewechselt): leeres Feld; die Chiffre bleibt auf der
    // Platte, weil sealUiSecrets ein leeres Feld nie als Löschen wertet.
    out[group] = { ...rest, apiKey: tryDecrypt(apiKeyEnc, cipher) ?? '' }
  }
  return out
}

/** Zustand je Schlüssel, so wie er in der Datei liegt (F07). */
export function uiSecretStatus(settings: Record<string, unknown>, cipher: SecretCipher): Record<SealedKeyGroup, UiSecretState> {
  const out = {} as Record<SealedKeyGroup, UiSecretState>
  for (const group of SEALED_KEY_GROUPS) {
    const g = settings[group]
    if (isRecord(g) && typeof g.apiKey === 'string' && g.apiKey !== '') out[group] = 'plaintext'
    else if (isRecord(g) && typeof g.apiKeyEnc === 'string') out[group] = tryDecrypt(g.apiKeyEnc, cipher) === null ? 'unreadable' : 'encrypted'
    else out[group] = 'none'
  }
  return out
}

function tryDecrypt(sealed: string, cipher: SecretCipher): string | null {
  try {
    return cipher.available() ? cipher.decrypt(sealed) : null
  } catch {
    return null
  }
}
