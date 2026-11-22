// Wohin darf das Hauptfenster navigieren? (`will-navigate` in main/index.ts)
//
// Das Hauptfenster lädt den preload und damit `window.electronAPI`. Jede Seite, die dort
// als Hauptdokument landet, darf also alles, was die App darf — Notizen lesen und
// schreiben, ein Terminal öffnen. Deshalb: nur das App-Dokument selbst bleibt im Fenster,
// Web- und Mail-Adressen gehen an das Betriebssystem, ALLES andere wird verworfen.
//
// Vorher ließ der Handler alles durch, was nicht http(s) war. Ein relativer Link in einer
// nicht editierbaren Markdown-Ansicht (Vault-Chat) wurde zu `file:///…` und lud fremdes
// HTML mit electronAPI; unter Windows wird `//server/x` zu `file://server/x`, also einer
// Datei von einem fremden Netzlaufwerk (Prüfung 22.11.2026).

import { isOpenableExternalUrl } from './externalUrl'

export type MainNavigationDecision = 'allow' | 'external' | 'block'

/**
 * @param url    Ziel der Navigation
 * @param appUrl Adresse des App-Dokuments: im Build die file:-URL von index.html,
 *               in der Entwicklung der Vite-Server (http://localhost:5173).
 */
export function decideMainNavigation(url: string, appUrl: string): MainNavigationDecision {
  let target: URL
  let app: URL
  try {
    target = new URL(url)
    app = new URL(appUrl)
  } catch {
    return 'block'
  }

  if (app.protocol === 'file:') {
    // Nur exakt dasselbe Dokument (Anker/Query egal), ohne Host — `file://server/…` ist UNC.
    if (target.protocol === 'file:' && target.host === '' && target.pathname === app.pathname) return 'allow'
  } else if (target.origin === app.origin) {
    // Entwicklung: alles vom eigenen Vite-Server.
    return 'allow'
  }

  return isOpenableExternalUrl(url) ? 'external' : 'block'
}
