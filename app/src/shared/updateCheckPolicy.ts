// Update-Prüfung zentral abschalten (Prüfung 22.11.2026): Firmen-IT verteilt Updates oft selbst
// und will keine ungefragte Verbindung zu GitHub. Die Umgebungsvariable gilt im Main-Prozess
// (Prüfung und Download werden dort verweigert) — der Schalter in den Einstellungen ist nur die
// Wahl des einzelnen Nutzers.

export const UPDATE_CHECK_ENV = 'MINDGRAPH_DISABLE_UPDATE_CHECK'

export function isUpdateCheckDisabledByEnv(env: Record<string, string | undefined>): boolean {
  const v = (env[UPDATE_CHECK_ENV] ?? '').trim().toLowerCase()
  return v === '1' || v === 'true' || v === 'yes' || v === 'ja'
}
