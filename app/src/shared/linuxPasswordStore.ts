/**
 * Welchen Passwortspeicher die App unter Linux selbst vorgibt.
 *
 * Chromium wählt den Speicher anhand von `XDG_CURRENT_DESKTOP` (Fallback
 * `DESKTOP_SESSION`). Kennt es den Desktop nicht — Hyprland, Sway, i3, niri … —,
 * landet es bei 'basic_text', und dafür meldet Electron
 * `safeStorage.isEncryptionAvailable() === false`. Dann speichert die App KEIN
 * Geheimnis: Sync-Passphrase, Mail-Passwörter, LLMBase-/OpenRouter-Schlüssel gehen
 * still verloren, obwohl meist ein gnome-keyring über D-Bus erreichbar wäre
 * (real: Omarchy/Hyprland, 09/2026 Sync, 10/2026 LLMBase).
 *
 * Für genau diesen Fall geben wir `gnome-libsecret` vor. Ist dort kein Secret
 * Service erreichbar, fällt Chromium von selbst auf 'basic_text' zurück — schlechter
 * als vorher wird es also nicht. Auf bekannten Desktops (GNOME, KDE, XFCE, …) und
 * wenn der Nutzer `--password-store` selbst setzt, mischen wir uns nicht ein.
 */

/** Desktop-Kennungen, für die Chromium selbst einen echten Speicher wählt. */
const KNOWN_DESKTOP_TOKENS = [
  'gnome', 'unity', 'x-cinnamon', 'cinnamon', 'kde', 'pantheon',
  'xfce', 'deepin', 'ukui', 'lxqt'
]

/** Teilstrings in `DESKTOP_SESSION`, die Chromium als Rückfall auswertet. */
const KNOWN_SESSION_PARTS = ['gnome', 'kde', 'xfce', 'deepin', 'ukui']

export function passwordStoreOverride(
  platform: string,
  env: Record<string, string | undefined>,
  argv: readonly string[]
): 'gnome-libsecret' | null {
  if (platform !== 'linux') return null
  if (argv.some(arg => arg === '--password-store' || arg.startsWith('--password-store='))) return null

  const tokens = (env.XDG_CURRENT_DESKTOP ?? '')
    .split(':')
    .map(t => t.trim().toLowerCase())
    .filter(Boolean)
  if (tokens.some(t => KNOWN_DESKTOP_TOKENS.includes(t))) return null

  const session = (env.DESKTOP_SESSION ?? '').toLowerCase()
  if (KNOWN_SESSION_PARTS.some(part => session.includes(part))) return null
  if (env.KDE_FULL_SESSION) return null

  return 'gnome-libsecret'
}
