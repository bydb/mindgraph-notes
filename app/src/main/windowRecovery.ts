// Erholung des Hauptfensters nach Ruhezustand, Renderer-Absturz und GPU-Neustart.
//
// Anlass (01.10.2026, real, macOS): nach dem Ruhezustand blieb das Fenster weiß, bis die App neu
// gestartet wurde. Die Entscheidungen (wann neu laden, wann fragen) stehen pur und getestet in
// `shared/windowRecovery.ts`; hier nur die Electron-Anbindung.
//
// Zusätzlich schreibt dieses Modul ein kleines Lebenszyklus-Protokoll
// (`~/Library/Logs/MindGraph Notes/window-lifecycle.log` auf macOS): Ruhezustand, Aufwachen,
// Renderer-/GPU-Ende, „reagiert nicht". Beim ersten Auftreten gab es keinerlei Spur — kein
// Absturzbericht, kein Eintrag im Systemprotokoll —, und die Konsole der gebauten App landet nirgends.
// Beim nächsten weißen Fenster steht dort, welcher der beiden Fälle es war.

import { app, dialog, powerMonitor, type BrowserWindow } from 'electron'
import { appendFile, mkdir, rename, stat } from 'fs/promises'
import path from 'path'
import {
  LIFECYCLE_LOG_MAX_BYTES,
  RESUME_CHECK_DELAY_MS,
  RESUME_PROBE_TIMEOUT_MS,
  UNRESPONSIVE_PROMPT_DELAY_MS,
  decideRendererRecovery,
  decideResumeAction,
  formatLifecycleLine
} from '../shared/windowRecovery'
import { getDisplayHealth } from './displayDiagnostics'

export interface WindowRecoveryOptions {
  getMainWindow: () => BrowserWindow | null
  isQuitting: () => boolean
  t: (key: string, params?: Record<string, string | number>) => string
}

let options: WindowRecoveryOptions | null = null
let recentReloads: number[] = []
let crashLoopDialogOpen = false
let logChain: Promise<void> = Promise.resolve()

function logFilePath(): string {
  return path.join(app.getPath('logs'), 'window-lifecycle.log')
}

/** Hängt eine Zeile an das Protokoll an. Fehler beim Schreiben dürfen die Erholung nie aufhalten. */
export function logLifecycle(event: string, detail?: string): void {
  const line = formatLifecycleLine(new Date(), event, detail)
  console.log(`[Window] ${line.trimEnd()}`)
  logChain = logChain
    .then(async () => {
      const file = logFilePath()
      await mkdir(path.dirname(file), { recursive: true })
      try {
        const st = await stat(file)
        if (st.size > LIFECYCLE_LOG_MAX_BYTES) await rename(file, `${file}.old`)
      } catch {
        // Datei existiert noch nicht
      }
      await appendFile(file, line, 'utf-8')
    })
    .catch(err => console.warn('[Window] Protokoll nicht schreibbar:', err))
}

function isAlive(win: BrowserWindow | null): win is BrowserWindow {
  return !!win && !win.isDestroyed() && !win.webContents.isDestroyed()
}

function reloadWindow(win: BrowserWindow, why: string): void {
  if (!isAlive(win)) return
  logLifecycle('reload', why)
  win.webContents.reload()
}

async function askAfterCrashLoop(win: BrowserWindow): Promise<void> {
  if (!options || crashLoopDialogOpen) return
  crashLoopDialogOpen = true
  const { t } = options
  try {
    const { response } = await dialog.showMessageBox(win, {
      type: 'error',
      message: t('window.crashLoop.message'),
      detail: t('window.crashLoop.detail'),
      buttons: [t('window.crashLoop.reload'), t('window.crashLoop.quit')],
      defaultId: 0,
      cancelId: 1,
      noLink: true
    })
    if (response === 0) {
      // Bewusste Entscheidung des Nutzers: Zähler zurücksetzen, sonst fragt die App beim
      // nächsten einzelnen Absturz sofort wieder.
      recentReloads = []
      reloadWindow(win, 'nach Rückfrage (Absturzschleife)')
    } else {
      app.quit()
    }
  } finally {
    crashLoopDialogOpen = false
  }
}

function handleRendererGone(win: BrowserWindow, reason: string): void {
  if (!options) return
  const decision = decideRendererRecovery(reason, recentReloads, Date.now(), options.isQuitting())
  recentReloads = decision.recentReloads
  if (decision.action === 'reload') reloadWindow(win, `nach render-process-gone (${reason})`)
  else if (decision.action === 'ask') {
    logLifecycle('crash-loop', `${recentReloads.length} Neuladungen im Zeitfenster — frage nach`)
    void askAfterCrashLoop(win)
  }
}

/**
 * Pro Fenster: „reagiert nicht"-Rückfrage (von `unresponsive` und von der Aufwachprobe) und die
 * Renderer-Generation. Die Generation zählt bei jedem Renderer-Ende und jeder Hauptframe-Navigation
 * hoch — eine Probe, die über so einen Wechsel hinweg lief, gilt der ALTEN Seite und darf keine
 * Rückfrage auslösen (sonst ließe sich ein frisch geladener, gesunder Renderer beenden).
 */
interface WindowHang {
  ask: (trigger: string, since: number) => void
  generation: () => number
}
const hangFor = new WeakMap<BrowserWindow, WindowHang>()

/** Pro Hauptfenster einmal aufrufen (in `createWindow`). */
export function attachWindowRecovery(win: BrowserWindow): void {
  const wc = win.webContents
  let unresponsiveTimer: NodeJS.Timeout | null = null
  let unresponsiveDialog: AbortController | null = null
  let unresponsiveSince = 0
  // Nutzer hat im „reagiert nicht"-Dialog „Neu laden" gewählt: Das darauf folgende
  // render-process-gone ist gewollt und zählt nicht gegen das Absturz-Kontingent.
  let userRequestedReload = false
  let generation = 0

  const clearUnresponsive = (): void => {
    if (unresponsiveTimer) clearTimeout(unresponsiveTimer)
    unresponsiveTimer = null
    unresponsiveDialog?.abort()
    unresponsiveDialog = null
  }

  // Ein lebender, aber hängender Renderer wird NIE ungefragt neu geladen — dabei gingen
  // ungespeicherte Eingaben verloren. Der Nutzer entscheidet: warten oder neu laden.
  const askUnresponsive = (trigger: string, since: number): void => {
    if (!options || !isAlive(win) || options.isQuitting() || unresponsiveDialog) return
    // Beide Hänger-Wege (unresponsive-Timer, Aufwachprobe) sind EIN Vorfall: Wer fragt, räumt den
    // anderen ab — sonst käme nach „Warten" derselbe Dialog vom zweiten Weg gleich noch einmal.
    if (unresponsiveTimer) clearTimeout(unresponsiveTimer)
    unresponsiveTimer = null
    const { t } = options
    const controller = new AbortController()
    unresponsiveDialog = controller
    const seconds = Math.max(1, Math.round((Date.now() - since) / 1000))
    logLifecycle('unresponsive-ask', trigger)
    dialog.showMessageBox(win, {
      type: 'warning',
      message: t('window.unresponsive.message'),
      detail: t('window.unresponsive.detail', { seconds }),
      buttons: [t('window.unresponsive.wait'), t('window.unresponsive.reload')],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
      signal: controller.signal
    }).then(({ response }) => {
      if (unresponsiveDialog === controller) unresponsiveDialog = null
      if (controller.signal.aborted || response !== 1 || !isAlive(win) || options?.isQuitting()) return
      logLifecycle('unresponsive-reload', `vom Nutzer gewählt (${trigger})`)
      userRequestedReload = true
      // Ein hängender Renderer verarbeitet keinen normalen reload() — erst beenden, die
      // Neuladung übernimmt der render-process-gone-Handler unten.
      wc.forcefullyCrashRenderer()
    }).catch(() => {
      if (unresponsiveDialog === controller) unresponsiveDialog = null
    })
  }
  hangFor.set(win, { ask: askUnresponsive, generation: () => generation })

  wc.on('did-navigate', () => { generation++ })

  wc.on('render-process-gone', (_event, details) => {
    generation++
    logLifecycle('render-process-gone', `reason=${details.reason} exitCode=${details.exitCode}`)
    clearUnresponsive()
    if (userRequestedReload) {
      userRequestedReload = false
      if (!options?.isQuitting()) reloadWindow(win, 'auf Wunsch (reagierte nicht)')
      return
    }
    handleRendererGone(win, details.reason)
  })

  win.on('unresponsive', () => {
    if (unresponsiveTimer || unresponsiveDialog) return
    unresponsiveSince = Date.now()
    logLifecycle('unresponsive')
    unresponsiveTimer = setTimeout(() => {
      unresponsiveTimer = null
      askUnresponsive('unresponsive', unresponsiveSince)
    }, UNRESPONSIVE_PROMPT_DELAY_MS)
  })

  win.on('responsive', () => {
    if (!unresponsiveTimer && !unresponsiveDialog) return
    logLifecycle('responsive', `nach ${Math.round((Date.now() - unresponsiveSince) / 1000)} s`)
    clearUnresponsive()
  })

  win.on('closed', clearUnresponsive)
}

async function probeRenderer(win: BrowserWindow): Promise<number | null> {
  const started = Date.now()
  let timer: NodeJS.Timeout | null = null
  try {
    const answered = await Promise.race([
      win.webContents.executeJavaScript('1', false).then(() => true),
      new Promise<false>(resolve => { timer = setTimeout(() => resolve(false), RESUME_PROBE_TIMEOUT_MS) })
    ])
    return answered ? Date.now() - started : null
  } catch {
    return null
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function checkAfterWake(trigger: string): Promise<void> {
  if (!options || options.isQuitting()) return
  const win = options.getMainWindow()
  const alive = isAlive(win)
  const action = decideResumeAction({ windowAlive: alive, rendererCrashed: alive && win.webContents.isCrashed() })
  if (action === 'none' || !alive) return
  if (action === 'recover') {
    logLifecycle('wake-check', `${trigger}: Renderer nicht mehr da`)
    handleRendererGone(win, 'crashed')
    return
  }
  // Renderer lebt. Ein weißes Fenster heißt dann: kein neues Bild nach dem Aufwachen.
  // invalidate() erzwingt einen frischen Frame — billig, ohne Wirkung, wenn alles stimmt.
  // Ob danach wirklich ein Bild auf dem Schirm steht, kann der Main-Prozess NICHT feststellen
  // (eine weiße Notizfläche ist auch ein gültiges Bild). Die Zeile behauptet deshalb nur, was
  // gemessen ist: JS antwortet, Neuzeichnen angestoßen, Grafikzustand laut Chromium.
  win.webContents.invalidate()
  const probeStarted = Date.now()
  const hang = hangFor.get(win)
  const generationAtStart = hang?.generation()
  const ms = await probeRenderer(win)
  const gpu = describeGpu()
  if (ms === null) {
    logLifecycle('wake-check', `${trigger}: Renderer antwortet NICHT binnen ${RESUME_PROBE_TIMEOUT_MS / 1000} s; ${gpu}`)
    // Electrons `unresponsive` braucht unbeantwortete Eingaben — ein hängendes Fenster, das
    // niemand anklickt, meldet es nie. Deshalb hier selbst fragen.
    if (!isAlive(win) || !hang) return
    if (hang.generation() !== generationAtStart) {
      logLifecycle('wake-check', `${trigger}: Probe veraltet (Renderer inzwischen neu) — keine Rückfrage`)
      return
    }
    hang.ask(`wake-check ${trigger}`, probeStarted)
    return
  }
  logLifecycle('wake-check', `${trigger}: JS antwortet (${ms} ms), Neuzeichnen angestoßen, Sichtbarkeit nicht messbar; ${gpu}`)
}

function describeGpu(): string {
  try {
    const h = getDisplayHealth()
    const hw = h.hardwareAccelerated === null ? 'unbekannt' : h.hardwareAccelerated ? 'an' : 'AUS (Software-Rendering)'
    return `gpu=${hw} displays=${h.displayCount} risiko=${h.reasons.join(',') || 'keins'}`
  } catch {
    return 'gpu=unbekannt'
  }
}

/** Einmal nach `app.whenReady()` aufrufen. */
export function initWindowRecovery(opts: WindowRecoveryOptions): void {
  options = opts
  logLifecycle('start', `version=${app.getVersion()} pid=${process.pid}`)

  // `resume` und `unlock-screen` folgen oft dicht aufeinander. Pro Aufwachphase läuft nur EINE
  // Prüfung — sonst fragt die zweite Probe nach „Warten" sofort noch einmal (Codex F06).
  let wakeCheckPending = false
  const scheduleCheck = (trigger: string): void => {
    if (wakeCheckPending) {
      logLifecycle('wake-check', `${trigger}: Prüfung läuft bereits — zusammengeführt`)
      return
    }
    wakeCheckPending = true
    setTimeout(() => {
      void checkAfterWake(trigger).finally(() => { wakeCheckPending = false })
    }, RESUME_CHECK_DELAY_MS)
  }
  powerMonitor.on('suspend', () => logLifecycle('suspend'))
  powerMonitor.on('resume', () => { logLifecycle('resume'); scheduleCheck('resume') })
  // Bildschirmsperre ohne Systemschlaf (Display aus, Rechner wach) kann dasselbe Bild hinterlassen.
  powerMonitor.on('unlock-screen', () => { logLifecycle('unlock-screen'); scheduleCheck('unlock-screen') })

  // Startet der GPU-Prozess neu (typisch beim Aufwachen und bei Bildschirmwechseln), zeichnet ein
  // lebender Renderer nicht zwingend neu. Ein erzwungener Frame kurz danach schließt die Lücke.
  app.on('child-process-gone', (_event, details) => {
    if (details.type !== 'GPU') return
    logLifecycle('gpu-process-gone', `reason=${details.reason} exitCode=${details.exitCode}`)
    setTimeout(() => {
      const win = options?.getMainWindow() ?? null
      if (isAlive(win) && !win.webContents.isCrashed()) win.webContents.invalidate()
    }, RESUME_CHECK_DELAY_MS)
  })
}
