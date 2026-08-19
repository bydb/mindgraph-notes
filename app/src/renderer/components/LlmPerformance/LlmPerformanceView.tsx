// Leistungsfenster: Was die Modelle in dieser Sitzung tatsächlich geleistet haben.
//
// Die Zahlen kommen aus dem Ringpuffer im Main-Prozess und werden hier nur
// ausgewertet — keine eigene Messung, keine Modellanfrage, kein Dateizugriff.
//
// Drei Entscheidungen prägen die Darstellung, alle aus real gemachten Fehlern:
//
//   1. MEDIAN statt Mittelwert. Ein einzelner Ausreißer soll die Zahl nicht
//      kippen; gemessen wurden über sechs aufeinanderfolgende Läufe Schwankungen
//      um den Faktor 2, allein weil die Gewichte warm wurden.
//   2. KALTSTARTS getrennt. Sie messen das Laden der Gewichte (bei großen
//      Modellen zweistellige Sekunden), nicht das Modell. Sie fließen nicht in
//      die Geschwindigkeit ein, werden aber gezählt — wer sie verschweigt,
//      verschweigt genau die Wartezeit, die Nutzer erleben.
//   3. JE MODELL UND MODUL, nicht nur je Modell. Dasselbe Modell schreibt beim
//      Mail-Zusammenfassen lange Fließtexte und bei der Aufgaben-Extraktion
//      kurzes JSON. Ein gemeinsamer Wert beschriebe keine der beiden Aufgaben.

import { useMemo, useState } from 'react'
import { useLlmTelemetryStore } from '../../stores/llmTelemetryStore'
import {
  buildComparisonRows, toMarkdownTable, toCsv, formatTps, type LlmComparisonRow
} from '../../../shared/llmTelemetry'
import { useTranslation } from '../../utils/translations'
import './LlmPerformanceView.css'

function seconds(ms: number | null): string {
  return ms === null || !Number.isFinite(ms) ? '—' : `${(ms / 1000).toFixed(1)} s`
}

export function LlmPerformanceView() {
  const { t } = useTranslation()
  // Stabile Referenz selektieren, im Render rechnen — ein Selektor, der die
  // Auswertung zurückgibt, liefert bei jedem Aufruf ein neues Array und löst die
  // dokumentierte „Maximum update depth"-Schleife aus.
  const runs = useLlmTelemetryStore(s => s.runs)
  const rows = useMemo(() => buildComparisonRows(runs), [runs])
  const [copied, setCopied] = useState<'md' | 'csv' | null>(null)

  const copy = async (kind: 'md' | 'csv') => {
    const text = kind === 'md' ? toMarkdownTable(rows) : toCsv(rows)
    await window.electronAPI.clipboardWriteText(text)
    setCopied(kind)
    window.setTimeout(() => setCopied(null), 2000)
  }

  const fastest = rows.find(r => r.summary.outputTps !== null)

  return (
    <div className="llmperf">
      <header className="llmperf-header">
        <h1>{t('llmPerf.title')}</h1>
        <p className="llmperf-sub">{t('llmPerf.subtitle')}</p>
      </header>

      {rows.length === 0 ? (
        <div className="llmperf-empty">
          <p>{t('llmPerf.empty')}</p>
          <p className="llmperf-empty-hint">{t('llmPerf.emptyHint')}</p>
        </div>
      ) : (
        <>
          {fastest && (
            <div className="llmperf-headline">
              <span className="llmperf-headline-value">{formatTps(fastest.summary.outputTps)}</span>
              <span className="llmperf-headline-unit">{t('llmPerf.unit')}</span>
              <span className="llmperf-headline-model">{fastest.model}</span>
              <span className="llmperf-headline-module">{fastest.module}</span>
            </div>
          )}

          <div className="llmperf-tablewrap">
            <table className="llmperf-table">
              <thead>
                <tr>
                  <th>{t('llmPerf.col.model')}</th>
                  <th>{t('llmPerf.col.module')}</th>
                  <th className="num">{t('llmPerf.col.output')}</th>
                  <th className="num">{t('llmPerf.col.prompt')}</th>
                  <th className="num">{t('llmPerf.col.firstToken')}</th>
                  <th className="num">{t('llmPerf.col.runs')}</th>
                  <th className="num">{t('llmPerf.col.cold')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r: LlmComparisonRow) => (
                  <tr key={`${r.model}|${r.module}`}>
                    <td className="llmperf-model">{r.model}</td>
                    <td className="llmperf-module">{r.module}</td>
                    <td className="num llmperf-strong">
                      {formatTps(r.summary.outputTps)}
                      {r.summary.hiddenThinkingRuns > 0 && (
                        <span className="llmperf-caveat" title={t('llmPerf.hiddenThinking')}>*</span>
                      )}
                    </td>
                    <td className="num">{formatTps(r.summary.promptTps)}</td>
                    <td className="num">{seconds(r.summary.firstTokenMs)}</td>
                    <td className="num">{r.summary.runs}</td>
                    <td className="num">{r.summary.coldRuns > 0 ? r.summary.coldRuns : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="llmperf-actions">
            <button onClick={() => copy('md')}>
              {copied === 'md' ? t('llmPerf.copied') : t('llmPerf.copyMarkdown')}
            </button>
            <button onClick={() => copy('csv')}>
              {copied === 'csv' ? t('llmPerf.copied') : t('llmPerf.copyCsv')}
            </button>
          </div>
        </>
      )}

      <section className="llmperf-notes">
        <h2>{t('llmPerf.howToRead')}</h2>
        <ul>
          <li>{t('llmPerf.noteMedian')}</li>
          <li>{t('llmPerf.noteCold')}</li>
          <li>{t('llmPerf.notePrompt')}</li>
          <li>{t('llmPerf.noteThinking')}</li>
          <li>{t('llmPerf.noteSession')}</li>
        </ul>
      </section>
    </div>
  )
}
