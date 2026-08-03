/**
 * Display- und GPU-Diagnose.
 *
 * Zweck: Wenn die App am Beamer plötzlich zäh wird, soll man hinterher NICHT raten müssen,
 * woran es lag. Dieses Modul schreibt bei jedem Bildschirm-Wechsel und bei jedem Absturz des
 * GPU-Prozesses eine Zeile ins Log und meldet den Zustand an den Renderer, der daraufhin den
 * Präsentationsmodus anbieten kann.
 *
 * Die eigentliche Bewertung liegt pur (und getestet) in `shared/displayHealth.ts`.
 */
import { app, screen, type BrowserWindow, type Display } from 'electron'
import {
  analyzeDisplayHealth,
  formatDisplayHealthLine,
  type DisplayHealth,
  type DisplayInfo
} from '../shared/displayHealth'

/** `display-metrics-changed` feuert beim Anstecken in Serie — erst nach Ruhe auswerten. */
const RECHECK_DEBOUNCE_MS = 500

/**
 * Nach dem Tod des GPU-Prozesses meldet Chromium den neuen Feature-Status nicht sofort.
 * Kurz warten, sonst protokollieren wir den veralteten „alles gut"-Stand.
 */
const GPU_GONE_RECHECK_MS = 1500

/**
 * Chromium meldet `gpu_compositing` erst als 'enabled', wenn der GPU-Prozess hochgefahren ist.
 * Direkt nach `createWindow()` steht dort noch der Software-Stand — beim Test gemessen:
 * unmittelbar nach ready 'disabled_software', ~1 s nach `did-finish-load` dann 'enabled'.
 * Ohne dieses Warmup würde die App bei JEDEM normalen Start einen GPU-Ausfall melden.
 */
const GPU_WARMUP_SETTLE_MS = 1000

/** Notbremse, falls `did-finish-load` nie kommt (Ladefehler, Fenster schon fertig geladen). */
const GPU_WARMUP_TIMEOUT_MS = 5000

let currentHealth: DisplayHealth | null = null
let getMainWindow: (() => BrowserWindow | null) | null = null
let debounceTimer: NodeJS.Timeout | null = null
/** Erst ab hier ist `gpu_compositing` aussagekräftig. Siehe GPU_WARMUP_SETTLE_MS. */
let gpuWarmedUp = false

function toDisplayInfo(display: Display): DisplayInfo {
  return {
    id: display.id,
    internal: display.internal,
    width: display.size.width,
    height: display.size.height,
    scaleFactor: display.scaleFactor,
    // Electron liefert 0, wenn das OS die Rate nicht meldet — der Analyzer behandelt das
    // ausdrücklich als „unbekannt" und nicht als 0 Hz.
    refreshHz: Math.round(display.displayFrequency ?? 0)
  }
}

function readGpuCompositing(): string | undefined {
  // Vor dem Warmup ist der Wert nachweislich unbrauchbar (siehe GPU_WARMUP_SETTLE_MS).
  // `undefined` heißt für den Analyzer „unbekannt" — das ist genau die richtige Aussage und
  // verhindert, dass ein früher IPC-Aufruf aus dem Renderer den Fehlalarm einfängt.
  if (!gpuWarmedUp) return undefined
  try {
    return app.getGPUFeatureStatus()?.gpu_compositing
  } catch (err) {
    // Auf manchen Plattformen/Startzeitpunkten nicht verfügbar. Kein Grund, irgendetwas
    // abzubrechen — `undefined` bedeutet für den Analyzer schlicht „unbekannt".
    console.warn('[Display] GPU-Status nicht lesbar:', err instanceof Error ? err.message : err)
    return undefined
  }
}

function computeHealth(): DisplayHealth {
  return analyzeDisplayHealth({
    displays: screen.getAllDisplays().map(toDisplayInfo),
    gpuCompositing: readGpuCompositing()
  })
}

function sameHealth(a: DisplayHealth | null, b: DisplayHealth): boolean {
  if (!a) return false
  return (
    a.displayCount === b.displayCount &&
    a.externalConnected === b.externalConnected &&
    a.likelyMirroring === b.likelyMirroring &&
    a.mixedScaleFactors === b.mixedScaleFactors &&
    a.lowestRefreshHz === b.lowestRefreshHz &&
    a.hardwareAccelerated === b.hardwareAccelerated
  )
}

function publish(reason: string): void {
  const health = computeHealth()

  // Nur bei echter Änderung loggen/senden — sonst rauscht jedes Fensterschieben zwischen
  // Bildschirmen das Log voll und der Renderer rendert grundlos neu.
  if (sameHealth(currentHealth, health)) {
    currentHealth = health
    return
  }
  currentHealth = health

  const line = formatDisplayHealthLine(health)
  if (health.risky) {
    console.warn(`[Display] (${reason}) ${line}`)
  } else {
    console.log(`[Display] (${reason}) ${line}`)
  }

  try {
    const win = getMainWindow?.()
    if (win && !win.isDestroyed()) {
      win.webContents.send('display-health-changed', health)
    }
  } catch (err) {
    console.warn('[Display] Senden an Renderer fehlgeschlagen:', err instanceof Error ? err.message : err)
  }
}

function scheduleRecheck(reason: string, delay = RECHECK_DEBOUNCE_MS): void {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    debounceTimer = null
    publish(reason)
  }, delay)
}

/**
 * Aktueller Stand für den IPC-Handler — bewusst bei JEDEM Aufruf frisch berechnet.
 *
 * Der Renderer fragt genau dann, wenn jemand wissen will, wie es GERADE steht: Die Einstellungen
 * werden geöffnet, weil die App zickt. Ein gecachter Stand vom Programmstart wäre dort die
 * falsche Antwort — er würde „Grafikbeschleunigung: aktiv" behaupten, obwohl sie längst
 * weggebrochen ist. Real aufgetreten am 03.08.2026 (Cinema Display): Der Zustand kippte, ohne
 * dass ein `display-*`-Event oder `child-process-gone` gefeuert hätte; nur ein frischer
 * Abruf hätte es zeigen können.
 *
 * `currentHealth` bleibt absichtlich unberührt (außer beim allerersten Mal): Es dient der
 * Änderungserkennung in `publish()` — würde es hier mitgeschrieben, verschluckte das Log den
 * nächsten echten Wechsel, weil er dann nicht mehr als Änderung gälte.
 */
export function getDisplayHealth(): DisplayHealth {
  const health = computeHealth()
  if (!currentHealth) currentHealth = health
  return health
}

/**
 * Erste Auswertung erst nach dem GPU-Warmup, sonst ist der Befund garantiert falsch.
 * Feuert genau einmal — entweder kurz nach `did-finish-load` oder spätestens per Timeout.
 */
function publishAfterGpuWarmup(): void {
  let fired = false
  const fire = (): void => {
    if (fired) return
    fired = true
    gpuWarmedUp = true
    // Den vor dem Warmup evtl. gecachten „unbekannt"-Stand verwerfen, damit `publish`
    // den echten ersten Befund auch dann sendet, wenn er zufällig gleich aussieht.
    currentHealth = null
    publish('start')
  }

  const win = getMainWindow?.()
  if (win && !win.isDestroyed()) {
    win.webContents.once('did-finish-load', () => setTimeout(fire, GPU_WARMUP_SETTLE_MS))
  }
  setTimeout(fire, GPU_WARMUP_TIMEOUT_MS)
}

/**
 * Muss nach `app.whenReady()` laufen — vorher liefert weder `screen` noch
 * `getGPUFeatureStatus()` brauchbare Werte.
 */
export function initDisplayDiagnostics(options: { getMainWindow: () => BrowserWindow | null }): void {
  getMainWindow = options.getMainWindow

  publishAfterGpuWarmup()

  screen.on('display-added', () => scheduleRecheck('display-added'))
  screen.on('display-removed', () => scheduleRecheck('display-removed'))
  screen.on('display-metrics-changed', () => scheduleRecheck('display-metrics-changed'))

  // Der wichtigste Befund überhaupt: Wenn der GPU-Prozess bei der Display-Rekonfiguration
  // stirbt, rendert Chromium danach still auf der CPU weiter. Die App wirkt dann „einfach
  // langsam", ohne dass irgendwo ein Fehler auftaucht.
  app.on('child-process-gone', (_event, details) => {
    if (details.type === 'GPU') {
      console.error(
        `[Display] GPU-Prozess beendet (reason=${details.reason}, exitCode=${details.exitCode}). ` +
        'Ab jetzt droht Software-Rendering — App-Neustart stellt die Hardware-Beschleunigung wieder her.'
      )
      scheduleRecheck('gpu-process-gone', GPU_GONE_RECHECK_MS)
    } else {
      console.warn(`[Display] Kindprozess beendet: type=${details.type}, reason=${details.reason}`)
    }
  })

  app.on('render-process-gone', (_event, _webContents, details) => {
    console.error(`[Display] Render-Prozess beendet (reason=${details.reason}, exitCode=${details.exitCode})`)
  })
}
