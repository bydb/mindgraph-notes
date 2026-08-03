/**
 * Display-Gesundheit: erkennt Bildschirm-Konstellationen, in denen Chromium (und damit die
 * ganze App) spürbar einbricht — typischerweise am Beamer, per HDMI oder über AirPlay.
 *
 * Hintergrund (real aufgetreten, 29.07.2026, Präsentation über Apple TV am Beamer):
 * Beim Spiegeln taktet macOS die Bildausgabe auf den langsamsten Schirm herunter und Chromium
 * hängt seine Render-Schleife an diesen Takt — die Maus bleibt flüssig, aber die App zeichnet
 * nur noch 30-mal pro Sekunde. Kippt zusätzlich der GPU-Prozess auf Software-Rendering (passiert
 * bei der Display-Rekonfiguration beim An-/Abstecken), rechnet die CPU jedes Pixel selbst.
 * Ganzflächige `backdrop-filter`-Overlays kosten dann ein Vielfaches.
 *
 * Dieses Modul ist bewusst pur (keine Electron-Imports), damit es testbar bleibt.
 * Die Electron-Anbindung liegt in `main/displayDiagnostics.ts`.
 */

/** Unterhalb dieser Bildwiederholrate fühlt sich die Oberfläche merklich zäh an. */
export const LOW_REFRESH_HZ_THRESHOLD = 50

export interface DisplayInfo {
  id: number
  /** true = eingebauter Laptop-Schirm */
  internal: boolean
  width: number
  height: number
  /** 2 = Retina, 1 = klassisch. Gemischte Werte zwingen Chromium zum Neu-Rastern. */
  scaleFactor: number
  /** 0 bedeutet „vom Betriebssystem nicht gemeldet", NICHT „0 Hz". */
  refreshHz: number
}

export type DisplayRiskReason =
  | 'software-rendering'
  | 'low-refresh-rate'
  | 'mixed-scale-factors'
  | 'likely-mirroring'

export interface DisplayHealth {
  displayCount: number
  externalConnected: boolean
  likelyMirroring: boolean
  mixedScaleFactors: boolean
  /** Niedrigste *gemeldete* Rate; null, wenn kein Display eine Rate meldet. */
  lowestRefreshHz: number | null
  /** null = unbekannt (Status nicht gemeldet). Nur explizites `false` gilt als Befund. */
  hardwareAccelerated: boolean | null
  /** true, sobald mindestens ein Risiko-Grund vorliegt. */
  risky: boolean
  reasons: DisplayRiskReason[]
}

export interface DisplayHealthInput {
  displays: DisplayInfo[]
  /**
   * Rohwert aus `app.getGPUFeatureStatus().gpu_compositing`, z.B. 'enabled',
   * 'disabled_software', 'unavailable_software'. undefined = nicht gemeldet.
   */
  gpuCompositing?: string
}

/**
 * Übersetzt den Chromium-Status-String in „läuft das auf der GPU?".
 *
 * Fail-open by design: unbekannte oder fehlende Werte ergeben `null` (unbekannt), nicht `false`.
 * Ein Fehlalarm „Ihre Grafik ist kaputt" wäre schlimmer als ein verpasster Hinweis.
 */
export function isHardwareAccelerated(gpuCompositing?: string): boolean | null {
  if (!gpuCompositing) return null
  const status = gpuCompositing.trim().toLowerCase()
  if (status.startsWith('enabled')) return true
  // Chromium meldet Software-Fallbacks konsistent mit dem Suffix `_software`.
  if (status.includes('software') || status.startsWith('disabled') || status.startsWith('unavailable')) {
    return false
  }
  return null
}

/**
 * Erkennt Spiegelung anhand deckungsgleicher Bildschirmflächen.
 *
 * Grenze: macOS meldet einen gespiegelten Verbund häufig als EIN Display — dann ist Spiegelung
 * von hier aus nicht sichtbar. Der Name sagt „likely", weil das bewusst eine Heuristik ist und
 * die Abwesenheit des Flags nichts beweist.
 */
export function detectLikelyMirroring(displays: DisplayInfo[]): boolean {
  const seen = new Set<string>()
  for (const d of displays) {
    const key = `${d.width}x${d.height}`
    if (seen.has(key)) return true
    seen.add(key)
  }
  return false
}

export function analyzeDisplayHealth(input: DisplayHealthInput): DisplayHealth {
  const displays = input.displays ?? []
  const hardwareAccelerated = isHardwareAccelerated(input.gpuCompositing)

  const externalConnected = displays.some(d => !d.internal) || displays.length > 1
  const likelyMirroring = detectLikelyMirroring(displays)

  const scaleFactors = new Set(displays.map(d => d.scaleFactor))
  const mixedScaleFactors = scaleFactors.size > 1

  // 0 heißt „nicht gemeldet" — solche Displays dürfen das Minimum nicht auf 0 ziehen.
  const reportedRates = displays.map(d => d.refreshHz).filter(hz => hz > 0)
  const lowestRefreshHz = reportedRates.length > 0 ? Math.min(...reportedRates) : null

  const reasons: DisplayRiskReason[] = []
  if (hardwareAccelerated === false) reasons.push('software-rendering')
  if (lowestRefreshHz !== null && lowestRefreshHz < LOW_REFRESH_HZ_THRESHOLD) {
    reasons.push('low-refresh-rate')
  }
  // Gemischte Skalierung und Spiegelung tun nur weh, wenn überhaupt ein zweiter Schirm hängt.
  if (externalConnected && mixedScaleFactors) reasons.push('mixed-scale-factors')
  if (externalConnected && likelyMirroring) reasons.push('likely-mirroring')

  return {
    displayCount: displays.length,
    externalConnected,
    likelyMirroring,
    mixedScaleFactors,
    lowestRefreshHz,
    hardwareAccelerated,
    risky: reasons.length > 0,
    reasons
  }
}

/** Einzeiler fürs Log — bewusst kompakt, damit er bei jedem Display-Wechsel erträglich bleibt. */
export function formatDisplayHealthLine(health: DisplayHealth): string {
  const parts = [
    `${health.displayCount} Display(s)`,
    health.externalConnected ? 'extern' : 'nur intern',
    `GPU=${health.hardwareAccelerated === null ? 'unbekannt' : health.hardwareAccelerated ? 'hardware' : 'SOFTWARE'}`,
    `min=${health.lowestRefreshHz === null ? 'n/a' : `${health.lowestRefreshHz}Hz`}`
  ]
  if (health.reasons.length > 0) parts.push(`Risiko: ${health.reasons.join(', ')}`)
  return parts.join(' | ')
}
