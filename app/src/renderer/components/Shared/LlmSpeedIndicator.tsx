// Geschwindigkeit des letzten Modell-Laufs in der Statusleiste.
//
// Die Zahlen liefert Ollama in jeder Antwort ohnehin mit — diese Anzeige kostet
// keinen zusätzlichen Aufruf. Sie aktualisiert sich einmal pro Modell-Anfrage,
// NICHT pro Token: Ein Live-Ticker pro Chunk würde während jeder Antwort
// dutzendfach pro Sekunde neu rendern, und genau das soll er nicht.

import { useLlmTelemetryStore } from '../../stores/llmTelemetryStore'
import {
  outputTokensPerSecond, promptTokensPerSecond, isColdStart, formatTps, summarize
} from '../../../shared/llmTelemetry'
import { useTranslation } from '../../utils/translations'
import { useTabStore } from '../../stores/tabStore'

export function LlmSpeedIndicator() {
  const { t } = useTranslation()
  // Beide Selektoren liefern STABILE Referenzen aus dem Store. Gefiltert und
  // gerechnet wird erst im Render — ein Selektor, der ein neues Array oder Objekt
  // zurückgibt, löst die dokumentierte „Maximum update depth"-Schleife aus.
  const lastRun = useLlmTelemetryStore(s => s.lastRun)
  const runs = useLlmTelemetryStore(s => s.runs)
  const openLlmPerformanceTab = useTabStore(s => s.openLlmPerformanceTab)

  if (!lastRun) return null

  const tps = outputTokensPerSecond(lastRun)
  if (tps === null) return null

  const promptTps = promptTokensPerSecond(lastRun)
  const cold = isColdStart(lastRun)

  const summary = summarize(runs.filter(r => r.model === lastRun.model))

  const lines = [
    `${t('statusbar.speed.title')}: ${lastRun.model}`,
    `${t('statusbar.speed.output')}: ${formatTps(tps)} ${t('statusbar.speed.label')}`,
    promptTps !== null ? `${t('statusbar.speed.prompt')}: ${formatTps(promptTps)} ${t('statusbar.speed.label')}` : null,
    typeof lastRun.firstTokenMs === 'number' ? `${t('statusbar.speed.firstToken')}: ${(lastRun.firstTokenMs / 1000).toFixed(1)} s` : null,
    summary.outputTps !== null && summary.runs > 1
      ? `${t('statusbar.speed.median')}: ${formatTps(summary.outputTps)} ${t('statusbar.speed.label')} (${summary.runs} ${t('statusbar.speed.runs')})`
      : null,
    cold ? t('statusbar.speed.coldStart') : null,
    lastRun.hiddenThinking ? t('statusbar.speed.hiddenThinking') : null,
  ].filter(Boolean)

  return (
    <button
      type="button"
      className="status-item status-llm-speed"
      title={`${lines.join('\n')}\n\n${t('statusbar.speed.openPanel')}`}
      onClick={openLlmPerformanceTab}
    >
      {formatTps(tps)} {t('statusbar.speed.label')}
      {(cold || lastRun.hiddenThinking) && <span className="status-llm-speed-caveat">*</span>}
      <span className="status-llm-speed-module">{lastRun.module}</span>
    </button>
  )
}
