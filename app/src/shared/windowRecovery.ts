// Erholung des Hauptfensters nach Ruhezustand / Renderer-Absturz — reine Entscheidungslogik.
//
// Anlass (01.10.2026, real, macOS): Nach dem Ruhezustand des Rechners blieb das MindGraph-Fenster
// weiß. Weiß heißt: Chromium zeigt keine Seite mehr — entweder ist der Renderer-Prozess weg
// (vom System beendet, abgestürzt, Speicher) oder er lebt, hat aber nach dem Aufwachen kein neues
// Bild an die Grafikschicht geliefert. Bis dahin hatte die App für keinen der beiden Fälle eine
// Antwort: `render-process-gone` wurde nur protokolliert, das Fenster blieb leer bis zum Neustart.
//
// Hier steht nur, WAS zu tun ist; die Electron-Anbindung liegt in `main/windowRecovery.ts`.

/** Gründe aus Electrons `render-process-gone` (RenderProcessGoneDetails.reason). */
export type RendererGoneReason =
  | 'clean-exit'
  | 'abnormal-exit'
  | 'killed'
  | 'crashed'
  | 'oom'
  | 'launch-failed'
  | 'integrity-failure'
  | 'memory-eviction'

/** Zeitfenster, in dem automatische Neuladungen gezählt werden. */
export const AUTO_RELOAD_WINDOW_MS = 5 * 60_000
/** Höchstens so viele automatische Neuladungen pro Zeitfenster — danach fragt die App. */
export const MAX_AUTO_RELOADS = 3

export type RecoveryAction =
  /** Nichts tun (App wird beendet, Renderer hat sich regulär verabschiedet). */
  | 'none'
  /** Seite still neu laden. */
  | 'reload'
  /** Absturzschleife: nicht mehr automatisch laden, den Nutzer fragen. */
  | 'ask'

export interface RecoveryDecision {
  action: RecoveryAction
  /** Zeitstempel der automatischen Neuladungen im Fenster, inklusive einer jetzt beschlossenen. */
  recentReloads: number[]
}

/**
 * Entscheidet, was nach dem Ende des Renderer-Prozesses passiert.
 *
 * - `clean-exit` oder App beendet sich gerade → nichts (sonst lädt das Fenster beim Beenden neu).
 * - Sonst neu laden — der Prozess ist ohnehin weg, ungespeicherte Eingaben sind damit nicht mehr
 *   zu retten; ein weißes Fenster rettet sie auch nicht.
 * - Mehr als `MAX_AUTO_RELOADS` im Zeitfenster → fragen statt laden. Ein Renderer, der direkt
 *   nach dem Laden wieder stirbt (z. B. eine Notiz, die ihn jedes Mal abschießt), darf keine
 *   endlose Neulade-Schleife mit Volllast auslösen.
 */
export function decideRendererRecovery(
  reason: string,
  previousReloads: readonly number[],
  now: number,
  isQuitting: boolean
): RecoveryDecision {
  const recent = previousReloads.filter(t => now - t >= 0 && now - t < AUTO_RELOAD_WINDOW_MS)
  if (isQuitting || reason === 'clean-exit') return { action: 'none', recentReloads: recent }
  if (recent.length >= MAX_AUTO_RELOADS) return { action: 'ask', recentReloads: recent }
  return { action: 'reload', recentReloads: [...recent, now] }
}

/** Wartezeit nach dem Aufwachen, bevor das Fenster geprüft wird (Grafikschicht kommt verzögert zurück). */
export const RESUME_CHECK_DELAY_MS = 1500
/** So lange darf der Renderer nach dem Aufwachen für eine triviale Antwort brauchen. */
export const RESUME_PROBE_TIMEOUT_MS = 10_000
/** So lange muss das Fenster ununterbrochen „reagiert nicht" melden, bevor die App fragt. */
export const UNRESPONSIVE_PROMPT_DELAY_MS = 30_000

export type ResumeAction =
  /** Fenster existiert nicht (mehr) — nichts zu tun. */
  | 'none'
  /** Renderer ist weg → über `decideRendererRecovery` neu laden. */
  | 'recover'
  /** Renderer lebt → Neuzeichnen erzwingen (weißes Bild nach dem Aufwachen). */
  | 'repaint'

export function decideResumeAction(state: { windowAlive: boolean; rendererCrashed: boolean }): ResumeAction {
  if (!state.windowAlive) return 'none'
  if (state.rendererCrashed) return 'recover'
  return 'repaint'
}

/** Protokolldatei kappen: ab dieser Größe wird sie einmal nach `.old` rotiert. */
export const LIFECYCLE_LOG_MAX_BYTES = 256 * 1024

/** Eine Protokollzeile — lokale Zeit, damit sie neben `pmset -g log` lesbar ist. */
export function formatLifecycleLine(date: Date, event: string, detail?: string): string {
  const pad = (n: number, w = 2) => String(n).padStart(w, '0')
  const offsetMin = -date.getTimezoneOffset()
  const sign = offsetMin >= 0 ? '+' : '-'
  const abs = Math.abs(offsetMin)
  const stamp =
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())} ` +
    `${sign}${pad(Math.floor(abs / 60))}${pad(abs % 60)}`
  const clean = (detail ?? '').replace(/[\r\n]+/g, ' ').trim()
  return clean ? `${stamp} ${event} ${clean}\n` : `${stamp} ${event}\n`
}
