// Webrecherche — Provider-Konfiguration + Linkup-Key MAIN-seitig (0d). Der Renderer
// liefert die Such-Instanz NIE pro Lauf mit; er speichert sie hier und die Run-Params
// enthalten nur `{ enabled: true }`. Damit kann ein kompromittierter Renderer keinen frei
// parametrisierbaren Main-Netzwerkzugriff auslösen (Bedrohungsmodell wie approvedVaultRoots).

import { app, safeStorage } from 'electron'
import * as fs from 'fs/promises'
import * as path from 'path'
import { type WebResearchConfig, type WebSearchProviderId, normalizeWebUrl } from '../../shared/webResearch'

const CONFIG_FILE = 'webresearch.json'
const LINKUP_KEY_FILE = 'webresearch-linkup.enc'

function configPath(): string {
  return path.join(app.getPath('userData'), CONFIG_FILE)
}
function linkupKeyPath(): string {
  return path.join(app.getPath('userData'), LINKUP_KEY_FILE)
}

const DEFAULT_CONFIG: WebResearchConfig = { provider: 'searxng', searxngUrl: '' }

/** Origin einer URL oder null. Für den exakten Freigabe-Abgleich. */
function originOf(rawUrl: string): string | null {
  try {
    return new URL(rawUrl).origin
  } catch {
    return null
  }
}

export async function loadWebResearchConfig(): Promise<WebResearchConfig> {
  try {
    const raw = JSON.parse(await fs.readFile(configPath(), 'utf8'))
    const provider: WebSearchProviderId = raw?.provider === 'linkup' ? 'linkup' : 'searxng'
    const searxngUrl = typeof raw?.searxngUrl === 'string' ? raw.searxngUrl : ''
    // Freigabe nur akzeptieren, wenn sie exakt zum Origin der gespeicherten URL passt —
    // eine manipulierte/veraltete Datei kann so keine fremde private Adresse freischalten.
    const stored = typeof raw?.approvedPrivateOrigin === 'string' ? raw.approvedPrivateOrigin : undefined
    const approvedPrivateOrigin = stored && searxngUrl && originOf(searxngUrl) === stored ? stored : undefined
    return { provider, searxngUrl, approvedPrivateOrigin }
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

export async function saveWebResearchConfig(
  input: Partial<WebResearchConfig> & { approvedPrivateOrigin?: string }
): Promise<WebResearchConfig> {
  const current = await loadWebResearchConfig()
  const provider: WebSearchProviderId = input.provider === 'linkup' ? 'linkup' : input.provider === 'searxng' ? 'searxng' : current.provider

  // SearXNG-URL nur übernehmen, wenn leer (= löschen) oder eine gültige http(s)-URL.
  let searxngUrl = current.searxngUrl
  let approvedPrivateOrigin = current.approvedPrivateOrigin
  if (input.searxngUrl !== undefined) {
    const trimmed = input.searxngUrl.trim()
    if (trimmed === '') {
      searxngUrl = ''
      approvedPrivateOrigin = undefined
    } else {
      const norm = normalizeWebUrl(trimmed)
      if (!norm) throw new Error('SearXNG-URL ist keine gültige http(s)-Adresse.')
      searxngUrl = norm
      // Neue URL setzt jede alte Freigabe außer Kraft; die neue gilt nur, wenn sie exakt
      // zum Origin passt (der Aufrufer setzt sie erst nach Nutzerfreigabe, index.ts).
      const wantOrigin = originOf(norm)
      approvedPrivateOrigin = input.approvedPrivateOrigin && input.approvedPrivateOrigin === wantOrigin ? input.approvedPrivateOrigin : undefined
    }
  }

  const next: WebResearchConfig = { provider, searxngUrl, ...(approvedPrivateOrigin ? { approvedPrivateOrigin } : {}) }
  await fs.writeFile(configPath(), JSON.stringify(next, null, 2), 'utf8')
  return next
}

export async function loadLinkupKey(): Promise<string | null> {
  try {
    if (!safeStorage.isEncryptionAvailable()) return null
    const encrypted = await fs.readFile(linkupKeyPath())
    return safeStorage.decryptString(encrypted)
  } catch {
    return null
  }
}

// Löscht die Key-Datei. Ein NICHT vorhandener Key (ENOENT) ist Erfolg; jeder ANDERE Fehler
// (z.B. Rechte) wird durchgereicht — sonst würde „entfernt" gemeldet, obwohl der Key blieb.
async function unlinkKeyFile(): Promise<void> {
  try {
    await fs.unlink(linkupKeyPath())
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
  }
}

export async function saveLinkupKey(apiKey: string): Promise<{ hasKey: boolean }> {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('safeStorage nicht verfügbar')
  const trimmed = (apiKey || '').trim()
  if (!trimmed) {
    await unlinkKeyFile()
    return { hasKey: false }
  }
  await fs.writeFile(linkupKeyPath(), safeStorage.encryptString(trimmed))
  return { hasKey: true }
}

export async function clearLinkupKey(): Promise<void> {
  await unlinkKeyFile()
}
