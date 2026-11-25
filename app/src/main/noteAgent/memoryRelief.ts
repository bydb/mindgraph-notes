// „Platz schaffen“ für lokale Läufe: Programme auf Wunsch des Nutzers sauber beenden und danach
// wieder öffnen (Plan und Rechnung: shared/memoryPicture.ts `reliefPlan`).
//
// Was der Main erzwingt (Prüfung agy F01/F02, docs/codex-collab/speicherbild.md):
// - Beendet wird nur, was er dem Nutzer zuvor SELBST angeboten hat (`offerAppsForRelief`) und was
//   er jetzt noch als laufendes Programmbündel unter `/Applications`, `/System/Applications` oder
//   `~/Applications` sieht. Nie ein Pfad, den nur der Renderer nennt, nie die App selbst, nie
//   Ollama, nichts aus `~/Library`.
// - Jedes Ziel muss ein echtes Bündel sein: kein Symlink, kanonischer Pfad gleich dem genannten,
//   `Contents/Info.plist` vorhanden.
// - Vor dem Beenden fragt ein nativer Dialog mit Namen und Ort. Der Renderer schlägt nur vor.
// - Beendet wird über „quit“ (Apple-Event), nie über ein Signal: so fragt ein Programm mit
//   ungesicherten Änderungen selbst nach. Als beendet gilt nur, was danach wirklich nicht mehr läuft —
//   `osascript` meldet auch dann Erfolg, wenn das Programm gar nicht lief (gemessen 25.11.2026).
// - Wieder geöffnet wird nur, was in dieser Sitzung hier beendet wurde, und nur, wenn am Pfad
//   noch dasselbe Bündel liegt (Inode von Bündel und Info.plist).

import path from 'path'
import { promises as fs } from 'fs'
import { execFile } from 'child_process'
import { BrowserWindow, dialog } from 'electron'
import { groupProcesses, type ProcessGroup } from '../../shared/memoryPicture'

const QUIT_TIMEOUT_MS = 15_000
const GONE_WAIT_MS = 6_000
const MAX_TARGETS = 12

interface BundleIdentity { bundleIno: number; plistIno: number }
const closedHere = new Map<string, { name: string; identity: BundleIdentity }>()
let offered = new Map<string, string>()

type Runner = (file: string, args: string[], timeout: number) => Promise<{ ok: boolean; out: string }>

const realRun: Runner = (file, args, timeout) => new Promise(resolve => {
  execFile(file, args, { timeout, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => resolve({ ok: !err, out: err ? String(stderr || err.message) : stdout }))
})

let run: Runner = realRun
let goneWaitMs = GONE_WAIT_MS

/** Nur für Tests: Prozessstarter (und Wartezeit) ersetzen. Ohne gesetzten Ersatz startet unter VITEST nichts. */
export function setReliefRunnerForTests(fake: Runner | null, waitMs = GONE_WAIT_MS): void {
  run = fake ?? realRun
  goneWaitMs = waitMs
}

/** Bündel der App selbst (`…/Name.app`), leer außerhalb eines Bündels. */
export function ownBundlePath(): string {
  return /^(.*?\.app)\//.exec(process.execPath)?.[1] ?? ''
}

/** Vom Speicherbild aufgerufen: genau diese Programme darf der Renderer danach zum Beenden nennen. */
export function offerAppsForRelief(apps: ProcessGroup[]): void {
  offered = new Map(apps.filter(a => a.path).map(a => [a.path as string, a.name]))
}

/** Echtes Bündel am genannten Ort? Liefert dessen Kennung, sonst null. */
export async function bundleIdentity(bundlePath: string): Promise<BundleIdentity | null> {
  try {
    const link = await fs.lstat(bundlePath)
    if (link.isSymbolicLink() || !link.isDirectory()) return null
    if (await fs.realpath(bundlePath) !== bundlePath) return null
    const plist = await fs.lstat(path.join(bundlePath, 'Contents', 'Info.plist'))
    if (!plist.isFile()) return null
    return { bundleIno: link.ino, plistIno: plist.ino }
  } catch {
    return null
  }
}

/** Programme, die gerade laufen und sich beenden lassen (Bündelpfad → Name), frisch gelesen. */
async function runningNow(): Promise<Map<string, string>> {
  const ps = await run('/bin/ps', ['-axo', 'pid=,rss=,comm='], 4000)
  const found = new Map<string, string>()
  if (!ps.ok) return found
  for (const group of groupProcesses(ps.out, ownBundlePath()).apps) {
    if (group.path) found.set(group.path, group.name)
  }
  return found
}

/** Name fürs Fenster: außerhalb der Programmordner des Systems oder bei gleichem Namen mit Ort. */
function label(target: string, name: string, names: string[]): string {
  const standard = /^\/(Applications|System\/Applications)\/[^/]+\.app$/.test(target)
  return standard && names.filter(n => n === name).length === 1 ? name : `${name} — ${target}`
}

export interface ReliefResult {
  /** Namen der Programme, die danach wirklich nicht mehr liefen. */
  closed: string[]
  /** Namen, die noch laufen (Rückfrage abgelehnt, Beenden verweigert) oder kein echtes Bündel sind. */
  failed: string[]
  cancelled?: boolean
}

export async function quitAppsForRelief(paths: unknown, window: BrowserWindow | null, en: boolean): Promise<ReliefResult> {
  if (process.platform !== 'darwin') return { closed: [], failed: [] }
  if (process.env.VITEST && run === realRun) throw new Error('quitAppsForRelief: im Testlauf nur mit gesetztem Prozessstarter')
  const wanted = [...new Set(Array.isArray(paths) ? paths.filter((p): p is string => typeof p === 'string') : [])]
  const running = await runningNow()
  const targets: Array<{ path: string; name: string; identity: BundleIdentity }> = []
  for (const candidate of wanted) {
    if (targets.length >= MAX_TARGETS) break
    const name = running.get(candidate)
    if (!name || !offered.has(candidate)) continue
    const identity = await bundleIdentity(candidate)
    if (identity) targets.push({ path: candidate, name, identity })
  }
  if (targets.length === 0) return { closed: [], failed: [] }
  const names = targets.map(t => t.name)
  const options = {
    type: 'question' as const,
    buttons: en ? ['Quit apps', 'Cancel'] : ['Programme beenden', 'Abbrechen'],
    defaultId: 0,
    cancelId: 1,
    message: en ? 'Quit these apps to make room for the local model?' : 'Diese Programme beenden, um Platz für das lokale Modell zu schaffen?',
    detail: `${targets.map(t => label(t.path, t.name, names)).join('\n')}\n\n${en
      ? 'Apps with unsaved changes ask before they quit. As long as MindGraph stays open, you can reopen them from the memory picture.'
      : 'Programme mit ungesicherten Änderungen fragen selbst nach, bevor sie schließen. Solange MindGraph geöffnet bleibt, lassen sie sich über das Speicherbild wieder öffnen.'}`
  }
  const answer = window ? await dialog.showMessageBox(window, options) : await dialog.showMessageBox(options)
  if (answer.response !== 0) return { closed: [], failed: [], cancelled: true }

  for (const target of targets) {
    // Fester Skripttext, der Pfad kommt als Argument — nie in den Skripttext eingesetzt.
    await run('/usr/bin/osascript', ['-e', 'on run argv', '-e', 'tell application (item 1 of argv) to quit', '-e', 'end run', target.path], QUIT_TIMEOUT_MS)
  }
  // Nachsehen statt glauben: was nach der Wartezeit noch läuft, ist nicht beendet.
  let still = await runningNow()
  const deadline = Date.now() + goneWaitMs
  while (Date.now() < deadline && targets.some(t => still.has(t.path))) {
    await new Promise(resolve => setTimeout(resolve, 500))
    still = await runningNow()
  }
  const closed: string[] = []
  const failed: string[] = []
  for (const target of targets) {
    if (still.has(target.path)) { failed.push(target.name); continue }
    closed.push(target.name)
    closedHere.set(target.path, { name: target.name, identity: target.identity })
  }
  return { closed, failed }
}

/** Namen der Programme, die hier beendet wurden und sich wieder öffnen lassen. */
export function reopenableApps(): string[] {
  return [...closedHere.values()].map(entry => entry.name)
}

export async function reopenAppsAfterRelief(): Promise<{ reopened: string[]; skipped: string[] }> {
  if (process.env.VITEST && run === realRun) throw new Error('reopenAppsAfterRelief: im Testlauf nur mit gesetztem Prozessstarter')
  const reopened: string[] = []
  const skipped: string[] = []
  const running = await runningNow()
  for (const [target, entry] of [...closedHere]) {
    // Schon wieder offen (von Hand gestartet): nichts zu tun, aus der Liste nehmen.
    if (running.has(target)) { closedHere.delete(target); continue }
    // Liegt am Pfad noch dasselbe Bündel? Sonst wird nichts gestartet.
    const now = await bundleIdentity(target)
    if (!now || now.bundleIno !== entry.identity.bundleIno || now.plistIno !== entry.identity.plistIno) {
      skipped.push(entry.name)
      closedHere.delete(target)
      continue
    }
    // -g: im Hintergrund öffnen, der Nutzer bleibt, wo er ist.
    const res = await run('/usr/bin/open', ['-g', '-a', target], 10_000)
    if (res.ok) { reopened.push(entry.name); closedHere.delete(target) }
  }
  return { reopened, skipped }
}

/** Nur für Tests. */
export function resetReliefStateForTests(): void {
  closedHere.clear()
  offered = new Map()
}
