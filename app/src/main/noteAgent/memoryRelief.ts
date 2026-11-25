// „Platz schaffen“ für lokale Läufe: Programme auf Wunsch des Nutzers sauber beenden und danach
// wieder öffnen (Plan und Rechnung: shared/memoryPicture.ts `reliefPlan`).
//
// Was der Main erzwingt:
// - Beendet wird nur, was er SELBST gerade als laufendes Programmbündel unter /Applications oder
//   im Benutzerordner sieht — nie ein Pfad, den nur der Renderer nennt, nie die App selbst, nie Ollama.
// - Vor dem Beenden fragt ein nativer Dialog mit den Programmnamen. Der Renderer schlägt nur vor.
// - Beendet wird über „quit“ (Apple-Event), nie über ein Signal: so fragt ein Programm mit
//   ungesicherten Änderungen selbst nach, statt sie zu verlieren.
// - Wieder geöffnet wird nur, was in dieser Sitzung hier beendet wurde.

import { execFile } from 'child_process'
import { BrowserWindow, dialog } from 'electron'
import { groupProcesses } from '../../shared/memoryPicture'

const QUIT_TIMEOUT_MS = 15_000
const closedHere = new Map<string, string>()

function run(file: string, args: string[], timeout: number): Promise<{ ok: boolean; out: string }> {
  return new Promise(resolve => {
    execFile(file, args, { timeout, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => resolve({ ok: !err, out: err ? String(stderr || err.message) : stdout }))
  })
}

function ownAppName(): string {
  return /\/([^/]+)\.app\//.exec(process.execPath)?.[1] ?? ''
}

/** Programme, die sich gerade beenden lassen (Name → Bündelpfad), frisch gelesen. */
async function closableNow(): Promise<Map<string, string>> {
  const ps = await run('/bin/ps', ['-axo', 'rss=,comm='], 4000)
  const found = new Map<string, string>()
  if (!ps.ok) return found
  for (const group of groupProcesses(ps.out, ownAppName()).apps) {
    if (group.path) found.set(group.path, group.name)
  }
  return found
}

export interface ReliefResult {
  /** Namen der beendeten Programme. */
  closed: string[]
  /** Namen, bei denen das Beenden nicht geklappt hat (z. B. Rückfrage des Programms abgelehnt). */
  failed: string[]
  cancelled?: boolean
}

export async function quitAppsForRelief(paths: unknown, window: BrowserWindow | null, en: boolean): Promise<ReliefResult> {
  if (process.platform !== 'darwin') return { closed: [], failed: [] }
  const wanted = Array.isArray(paths) ? paths.filter((p): p is string => typeof p === 'string') : []
  const running = await closableNow()
  const targets = wanted.filter(p => running.has(p)).slice(0, 12)
  if (targets.length === 0) return { closed: [], failed: [] }
  const names = targets.map(p => running.get(p) as string)
  const options = {
    type: 'question' as const,
    buttons: en ? ['Quit apps', 'Cancel'] : ['Programme beenden', 'Abbrechen'],
    defaultId: 0,
    cancelId: 1,
    message: en ? 'Quit these apps to make room for the local model?' : 'Diese Programme beenden, um Platz für das lokale Modell zu schaffen?',
    detail: `${names.join('\n')}\n\n${en
      ? 'Apps with unsaved changes ask before they quit. You can reopen them afterwards from the memory picture.'
      : 'Programme mit ungesicherten Änderungen fragen selbst nach, bevor sie schließen. Über das Speicherbild lassen sie sich danach wieder öffnen.'}`
  }
  const answer = window ? await dialog.showMessageBox(window, options) : await dialog.showMessageBox(options)
  if (answer.response !== 0) return { closed: [], failed: [], cancelled: true }

  const closed: string[] = []
  const failed: string[] = []
  for (const target of targets) {
    const name = running.get(target) as string
    // Fester Skripttext, der Pfad kommt als Argument — nie in den Skripttext eingesetzt.
    const res = await run('/usr/bin/osascript', ['-e', 'on run argv', '-e', 'tell application (item 1 of argv) to quit', '-e', 'end run', target], QUIT_TIMEOUT_MS)
    if (res.ok) { closed.push(name); closedHere.set(target, name) } else failed.push(name)
  }
  return { closed, failed }
}

/** Namen der Programme, die hier beendet wurden und sich wieder öffnen lassen. */
export function reopenableApps(): string[] {
  return [...closedHere.values()]
}

export async function reopenAppsAfterRelief(): Promise<{ reopened: string[] }> {
  const reopened: string[] = []
  for (const [target, name] of [...closedHere]) {
    // -g: im Hintergrund öffnen, der Nutzer bleibt, wo er ist.
    const res = await run('/usr/bin/open', ['-g', '-a', target], 10_000)
    if (res.ok) { reopened.push(name); closedHere.delete(target) }
  }
  return { reopened }
}
