// Wie riskant ist ein lokaler Modelllauf auf diesem Rechner? Für Hinweise VOR dem Start,
// nie als Sperre (Nutzer entscheidet).
//
// `checkModelRamFit` warnt erst, wenn das Modell gar nicht in den RAM passt (Reserve 2 GB).
// Das reicht für schwache Rechner nicht: qwen3.5:4b (~4 GB) „passt" auf 8 GB, aber neben
// Betriebssystem, Electron und Mail-Kontext bleibt praktisch nichts frei — ohne Grafikkarte
// lagert das System aus und wird minutenlang unbedienbar (Nutzerbericht 28.10.2026).
// Deshalb die zweite Stufe „knapp": Modell + LOCAL_RUN_HEADROOM_GB reicht an den RAM heran.

import { checkModelRamFit } from './modelCompatibility'

/** Was neben dem Modell realistisch belegt ist: Betriebssystem, MindGraph, Browser-Reste. */
export const LOCAL_RUN_HEADROOM_GB = 4

export type LocalRunRisk = 'ok' | 'tight' | 'too-big'

export interface LocalRunAssessment {
  risk: LocalRunRisk
  /** null = Größe unbekannt oder Cloud-Modell → keine Aussage. */
  modelRamGb: number | null
  totalRamGb: number
}

export function assessLocalRunRisk(model: string, totalRamGb: number | null | undefined): LocalRunAssessment {
  const fit = checkModelRamFit(model, totalRamGb)
  if (fit.modelRamGb == null || !fit.totalRamGb) return { risk: 'ok', modelRamGb: fit.modelRamGb, totalRamGb: fit.totalRamGb }
  if (!fit.fits) return { risk: 'too-big', modelRamGb: fit.modelRamGb, totalRamGb: fit.totalRamGb }
  const risk = fit.modelRamGb + LOCAL_RUN_HEADROOM_GB >= fit.totalRamGb ? 'tight' : 'ok'
  return { risk, modelRamGb: fit.modelRamGb, totalRamGb: fit.totalRamGb }
}
