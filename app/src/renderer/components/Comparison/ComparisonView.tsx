// Vergleichsmodus — eigener Tab (docs/comparison-mode-plan.md, Abschnitt 11.4).
//
// Eine Kampagne hat Anfang und Ende; das ist kein Dauer-Widget. Die Ansicht zeigt in
// dieser Reihenfolge: was gerade zu tun ist (offene Fälle), was herauskam (Bericht),
// und was schon gelaufen ist (Fallliste).
//
// Zwei Dinge tut die Oberfläche bewusst NICHT: Sie lässt den Weg nicht wählen, und sie
// zeigt keine Kennzahl, solange zu wenige Fälle abgeschlossen sind.

import { useEffect, useState } from 'react'
import { useNotesStore } from '../../stores/notesStore'
import { useComparisonStore, casesOfCampaign, QUALITY_LABEL_KEY } from '../../stores/comparisonStore'
import { useTranslation, type TranslationKey } from '../../utils/translations'
import { totalActiveMs } from '../../../shared/comparison/metrics'
import { QUALITY_LEVELS, type ComparisonCase, type Quality, type SessionKind } from '../../../shared/comparison/types'
import './ComparisonView.css'

const SESSION_KINDS: SessionKind[] = ['auftrag', 'vordergrund', 'pruefung', 'nacharbeit', 'rueckfallarbeit']

const SESSION_LABEL_KEY: Record<SessionKind, TranslationKey> = {
  auftrag: 'comparison.session.auftrag',
  vordergrund: 'comparison.session.vordergrund',
  pruefung: 'comparison.session.pruefung',
  nacharbeit: 'comparison.session.nacharbeit',
  rueckfallarbeit: 'comparison.session.rueckfallarbeit'
}

function minuten(ms: number | null): string {
  if (ms === null) return '—'
  const m = ms / 60_000
  return m < 1 && ms > 0 ? '<1' : String(Math.round(m))
}

export function ComparisonView(): React.ReactElement {
  const { t } = useTranslation()
  const vaultPath = useNotesStore(s => s.vaultPath)
  const store = useComparisonStore()
  const [taskClass, setTaskClass] = useState('')
  const [inclusion, setInclusion] = useState('')
  const [acceptance, setAcceptance] = useState('')
  const [label, setLabel] = useState('')
  const [zuletztGezogen, setZuletztGezogen] = useState<ComparisonCase | null>(null)

  useEffect(() => {
    if (vaultPath) void store.load(vaultPath)
    // Absichtlich nur beim Vaultwechsel: Ein Neuladen bei jeder Store-Änderung liefe
    // gegen sich selbst — jede Aktion lädt bereits nach.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vaultPath])

  if (!vaultPath) {
    return <div className="comparison-view"><p className="comparison-hint">{t('comparison.noVault')}</p></div>
  }

  const campaign = store.campaigns.find(c => c.id === store.activeCampaignId) ?? null
  const faelle = casesOfCampaign(store.cases, store.activeCampaignId)
  const offene = faelle.filter(c => c.state === 'offen')

  const anlegen = async (): Promise<void> => {
    await store.createCampaign(vaultPath, { taskClass, inclusionRules: inclusion, acceptanceDefinition: acceptance })
    setTaskClass(''); setInclusion(''); setAcceptance('')
  }

  const fallAnlegen = async (): Promise<void> => {
    const neu = await store.createCase(vaultPath, label)
    if (neu) { setZuletztGezogen(neu); setLabel('') }
  }

  return (
    <div className="comparison-view">
      <div className="comparison-inner">
        <header className="comparison-head">
          <h2>{t('comparison.title')}</h2>
          <p className="comparison-sub">{t('comparison.subtitle')}</p>
        </header>

        {store.error && <p className="comparison-error">{store.error}</p>}

        <PendingStopwatch vaultPath={vaultPath} />

        {!campaign ? (
          <section className="comparison-card">
            <h3>{t('comparison.newCampaign')}</h3>
            <p className="comparison-hint">{t('comparison.newCampaignHint')}</p>
            <label className="comparison-field">
              <span>{t('comparison.taskClass')}</span>
              <input value={taskClass} onChange={e => setTaskClass(e.target.value)} placeholder={t('comparison.taskClassPlaceholder')} />
            </label>
            <label className="comparison-field">
              <span>{t('comparison.inclusion')}</span>
              <input value={inclusion} onChange={e => setInclusion(e.target.value)} placeholder={t('comparison.inclusionPlaceholder')} />
            </label>
            <label className="comparison-field">
              <span>{t('comparison.acceptance')}</span>
              <input value={acceptance} onChange={e => setAcceptance(e.target.value)} placeholder={t('comparison.acceptancePlaceholder')} />
            </label>
            <p className="comparison-hint">{t('comparison.acceptanceWhy')}</p>
            <button className="btn-primary" disabled={!taskClass.trim() || !acceptance.trim()} onClick={() => void anlegen()}>
              {t('comparison.startCampaign')}
            </button>
          </section>
        ) : (
          <>
            <section className="comparison-card">
              <div className="comparison-campaign-head">
                <div>
                  <h3>{campaign.taskClass}</h3>
                  <p className="comparison-hint">{t('comparison.acceptanceLabel')}: {campaign.acceptanceDefinition}</p>
                </div>
                {campaign.endedAt === undefined && (
                  <button onClick={() => void store.endCampaign(vaultPath)}>{t('comparison.endCampaign')}</button>
                )}
              </div>

              {campaign.endedAt === undefined && (
                <div className="comparison-new-case">
                  <input
                    value={label}
                    onChange={e => setLabel(e.target.value)}
                    placeholder={t('comparison.casePlaceholder')}
                    onKeyDown={e => { if (e.key === 'Enter' && label.trim()) void fallAnlegen() }}
                  />
                  <button className="btn-primary" disabled={!label.trim()} onClick={() => void fallAnlegen()}>
                    {t('comparison.addCase')}
                  </button>
                </div>
              )}
              <p className="comparison-hint">{t('comparison.assignmentHint')}</p>

              {zuletztGezogen && (
                <div className={`comparison-draw comparison-draw-${zuletztGezogen.arm}`}>
                  {t('comparison.drawResult', {
                    label: zuletztGezogen.label,
                    arm: t(`comparison.arm.${zuletztGezogen.arm}` as TranslationKey)
                  })}
                </div>
              )}
            </section>

            {offene.length > 0 && (
              <section className="comparison-card">
                <h3>{t('comparison.openCases')}</h3>
                {offene.map(fall => <OpenCase key={fall.id} fall={fall} vaultPath={vaultPath} />)}
              </section>
            )}

            <ReportBlock />

            {faelle.length > 0 && (
              <section className="comparison-card">
                <h3>{t('comparison.allCases', { count: faelle.length })}</h3>
                <table className="comparison-table">
                  <thead>
                    <tr>
                      <th>{t('comparison.col.case')}</th>
                      <th>{t('comparison.col.arm')}</th>
                      <th>{t('comparison.col.state')}</th>
                      <th>{t('comparison.col.active')}</th>
                      <th>{t('comparison.col.quality')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {faelle.map(c => (
                      <tr key={c.id}>
                        <td>{c.label || c.id}</td>
                        <td><span className={`comparison-arm comparison-arm-${c.arm}`}>{t(`comparison.arm.${c.arm}` as TranslationKey)}</span></td>
                        <td>
                          {t(`comparison.state.${c.state}` as TranslationKey)}
                          {c.stateReason ? <span className="comparison-hint"> · {c.stateReason}</span> : null}
                        </td>
                        <td className="comparison-num">{minuten(totalActiveMs(c))} min</td>
                        <td>{c.quality ? t(QUALITY_LABEL_KEY[c.quality] as TranslationKey) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function OpenCase({ fall, vaultPath }: { fall: ComparisonCase; vaultPath: string }): React.ReactElement {
  const { t } = useTranslation()
  const store = useComparisonStore()
  const [kind, setKind] = useState<SessionKind>(fall.arm === 'konventionell' ? 'nacharbeit' : 'rueckfallarbeit')
  const [grund, setGrund] = useState('')
  const [nachtrag, setNachtrag] = useState('')
  const laeuft = store.stopwatch?.caseId === fall.id
  const istAktiverFall = store.activeCaseId === fall.id

  return (
    <div className="comparison-case">
      <div className="comparison-case-head">
        <strong>{fall.label || fall.id}</strong>
        <span className={`comparison-arm comparison-arm-${fall.arm}`}>{t(`comparison.arm.${fall.arm}` as TranslationKey)}</span>
        <span className="comparison-num">{minuten(totalActiveMs(fall))} min</span>
      </div>

      <div className="comparison-case-actions">
        <select value={kind} onChange={e => setKind(e.target.value as SessionKind)} disabled={laeuft}>
          {SESSION_KINDS.map(k => <option key={k} value={k}>{t(SESSION_LABEL_KEY[k])}</option>)}
        </select>
        {laeuft ? (
          <>
            <button className="btn-primary" onClick={() => void store.stopStopwatch(vaultPath, true)}>{t('comparison.stopKeep')}</button>
            <button onClick={() => void store.stopStopwatch(vaultPath, false)}>{t('comparison.stopDiscard')}</button>
          </>
        ) : (
          <button onClick={() => store.startStopwatch(vaultPath, fall.id, kind)} disabled={!!store.stopwatch}>
            {t('comparison.start')}
          </button>
        )}

        {fall.arm === 'mindgraph' && (
          <button
            className={istAktiverFall ? 'btn-primary' : ''}
            onClick={() => store.setActiveCase(istAktiverFall ? null : fall.id)}
          >
            {istAktiverFall ? t('comparison.agentLinked') : t('comparison.linkAgent')}
          </button>
        )}
      </div>

      <div className="comparison-case-actions">
        {QUALITY_LEVELS.map(q => (
          <button key={q} onClick={() => void store.update(vaultPath, fall.id, { type: 'close', quality: q as Quality })}>
            {t('comparison.closeWith', { quality: t(QUALITY_LABEL_KEY[q as Quality] as TranslationKey) })}
          </button>
        ))}
      </div>

      <div className="comparison-case-actions">
        <input
          className="comparison-minutes"
          type="number"
          min={1}
          value={nachtrag}
          onChange={e => setNachtrag(e.target.value)}
          placeholder={t('comparison.manualPlaceholder')}
        />
        <button
          disabled={!Number(nachtrag)}
          onClick={() => { void store.addManualTime(vaultPath, fall.id, kind, Number(nachtrag)); setNachtrag('') }}
        >
          {t('comparison.addManual')}
        </button>
      </div>

      {fall.sessions.length > 0 && (
        <ul className="comparison-sessions">
          {fall.sessions.map((sitzung, i) => (
            <li key={i}>
              <span>{t(SESSION_LABEL_KEY[sitzung.kind])}</span>
              <span className="comparison-num">{minuten(sitzung.to - sitzung.from)} min</span>
              <span className="comparison-hint">{t(`comparison.origin.${sitzung.origin}` as TranslationKey)}</span>
              <button
                onClick={() => {
                  const wert = window.prompt(t('comparison.correctPrompt'))
                  if (!wert) return
                  const grundText = window.prompt(t('comparison.correctReasonPrompt'))
                  if (!grundText?.trim()) return
                  void store.correctSessionTime(vaultPath, fall.id, i, Number(wert), grundText)
                }}
              >
                {t('comparison.correct')}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="comparison-case-actions">
        <input value={grund} onChange={e => setGrund(e.target.value)} placeholder={t('comparison.reasonPlaceholder')} />
        <button disabled={!grund.trim()} onClick={() => void store.update(vaultPath, fall.id, { type: 'abort', reason: grund })}>
          {t('comparison.abort')}
        </button>
        <button disabled={!grund.trim()} onClick={() => void store.update(vaultPath, fall.id, { type: 'not-measurable', reason: grund })}>
          {t('comparison.notMeasurable')}
        </button>
      </div>
    </div>
  )
}

/**
 * Angebot für eine Uhr, die beim letzten Mal nicht beendet wurde.
 *
 * Bewusst kein automatisches Weiterlaufen: Der Endzeitpunkt wurde nie beobachtet. Was
 * hier eingetragen wird, ist eine Behauptung des Nutzers — und wird als `nachgetragen`
 * gespeichert, nicht als `gestoppt`.
 */
function PendingStopwatch({ vaultPath }: { vaultPath: string }): React.ReactElement | null {
  const { t } = useTranslation()
  const store = useComparisonStore()
  const offen = store.pendingStopwatch
  const fall = store.cases.find(c => c.id === offen?.caseId)
  const [minutenWert, setMinutenWert] = useState('')

  useEffect(() => {
    if (offen) setMinutenWert(String(Math.max(1, Math.round((Date.now() - offen.startedAt) / 60_000))))
  }, [offen])

  if (!offen || !fall) return null

  return (
    <section className="comparison-card comparison-pending">
      <h3>{t('comparison.pendingTitle')}</h3>
      <p className="comparison-hint">
        {t('comparison.pendingBody', {
          label: fall.label || fall.id,
          kind: t(SESSION_LABEL_KEY[offen.kind]),
          since: new Date(offen.startedAt).toLocaleString()
        })}
      </p>
      <div className="comparison-case-actions">
        <input
          className="comparison-minutes"
          type="number"
          min={1}
          value={minutenWert}
          onChange={e => setMinutenWert(e.target.value)}
        />
        <span className="comparison-hint">{t('comparison.minutes')}</span>
        <button className="btn-primary" onClick={() => void store.resolvePendingStopwatch(vaultPath, Number(minutenWert))}>
          {t('comparison.pendingKeep')}
        </button>
        <button onClick={() => void store.resolvePendingStopwatch(vaultPath, null)}>{t('comparison.pendingDiscard')}</button>
      </div>
      <p className="comparison-hint">{t('comparison.pendingWhy')}</p>
    </section>
  )
}

function ReportBlock(): React.ReactElement | null {
  const { t } = useTranslation()
  const report = useComparisonStore(s => s.report)
  const campaignId = useComparisonStore(s => s.activeCampaignId)
  const vaultPath = useNotesStore(s => s.vaultPath)
  const [hinweis, setHinweis] = useState<string | null>(null)

  // Die Beschriftungen kommen von hier — der Bericht soll in der Sprache der Oberfläche
  // stehen, ohne dass der Renderer die Zahlen liefert.
  const exportieren = async (format: 'md' | 'csv'): Promise<void> => {
    if (!vaultPath || !campaignId) return
    const labels = {
      arm: { konventionell: t('comparison.arm.konventionell'), mindgraph: t('comparison.arm.mindgraph') },
      state: {
        offen: t('comparison.state.offen'),
        abgeschlossen: t('comparison.state.abgeschlossen'),
        abgebrochen: t('comparison.state.abgebrochen'),
        'nicht-messbar': t('comparison.state.nicht-messbar')
      },
      quality: {
        1: t('comparison.quality.unusable'),
        2: t('comparison.quality.majorFlaws'),
        3: t('comparison.quality.minorFlaws'),
        4: t('comparison.quality.usable')
      },
      origin: {
        'vordergrund-automatisch': t('comparison.origin.vordergrund-automatisch'),
        gestoppt: t('comparison.origin.gestoppt'),
        nachgetragen: t('comparison.origin.nachgetragen'),
        korrigiert: t('comparison.origin.korrigiert')
      }
    }
    const res = await window.electronAPI.comparisonExport(vaultPath, campaignId, format, labels)
    if (res.cancelled) return
    setHinweis(res.success ? t('comparison.exportDone', { path: res.path ?? '' }) : res.error ?? '')
  }

  if (!report) return null

  return (
    <section className="comparison-card">
      <h3>{t('comparison.report')}</h3>
      {!report.comparable && (
        // Ein Median aus zwei Werten ist deren Mittel und täuscht Verlässlichkeit vor.
        <p className="comparison-hint">
          {t('comparison.notEnough', { missing: report.arms.reduce((sum, a) => sum + a.missingForMetrics, 0) })}
        </p>
      )}
      <table className="comparison-table">
        <thead>
          <tr>
            <th>{t('comparison.col.arm')}</th>
            <th>{t('comparison.col.cases')}</th>
            <th>{t('comparison.col.median')}</th>
            <th>{t('comparison.col.iqr')}</th>
            <th>{t('comparison.col.accepted')}</th>
          </tr>
        </thead>
        <tbody>
          {report.arms.map(a => (
            <tr key={a.arm}>
              <td><span className={`comparison-arm comparison-arm-${a.arm}`}>{t(`comparison.arm.${a.arm}` as TranslationKey)}</span></td>
              {/* Nenner immer neben der Zahl — sonst entsteht Überlebensbias. */}
              <td>{t('comparison.completedOf', { completed: a.completed, assigned: a.assigned })}</td>
              <td className="comparison-num">{report.comparable ? `${minuten(a.medianTotalActiveMs)} min` : '—'}</td>
              <td className="comparison-num">{a.iqrTotalActiveMs !== null ? `${minuten(a.iqrTotalActiveMs)} min` : '—'}</td>
              <td className="comparison-num">{a.acceptedOfCompleted !== null ? `${a.acceptedOfCompleted}/${a.completed}` : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="comparison-hint">{t('comparison.reportLimits')}</p>
      <div className="comparison-case-actions">
        <button onClick={() => void exportieren('md')}>{t('comparison.exportMd')}</button>
        <button onClick={() => void exportieren('csv')}>{t('comparison.exportCsv')}</button>
        {hinweis && <span className="comparison-hint">{hinweis}</span>}
      </div>
    </section>
  )
}
