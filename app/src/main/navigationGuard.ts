// Navigationssperre für jedes Fenster mit dem vollen preload (electronAPI): Hauptfenster und
// Schnellerfassung (Codex F03). Entscheidung pur in shared/mainNavigation.ts.
import { shell, type WebContents } from 'electron'
import { decideMainNavigation } from '../shared/mainNavigation'

export function attachNavigationGuard(contents: WebContents, appUrl: string, label: string): void {
  const guard = (event: Electron.Event, url: string): void => {
    const decision = decideMainNavigation(url, appUrl)
    if (decision === 'allow') return
    event.preventDefault()
    if (decision === 'external') void shell.openExternal(url)
    else console.warn(`[Security] Navigation verworfen (${label}):`, url.slice(0, 200))
  }
  contents.on('will-navigate', guard)
  // Serverseitige Weiterleitungen laufen nicht über will-navigate.
  contents.on('will-redirect', guard)
}
