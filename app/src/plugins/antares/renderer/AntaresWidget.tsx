// Antares-Dashboard-Widget — die Renderer-Hälfte der Antares-Vertikale.
//
// War früher inline in DashboardView.tsx; jetzt im Plugin und über den Renderer-Slot
// `dashboard.widget.antares` gemountet (siehe ./index.tsx). Zieht seine Daten aus dem
// (vorerst geteilten) antaresStore, der intern über `invokePlugin('antares', …)` lädt.
// Self-Gating: bei deaktiviertem Modul zeigt es den Hinweis statt zu laden.

import React, { useEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { usePluginEnabled } from '../../../renderer/plugins/config'
import { useAntaresStore } from '../../../renderer/stores/antaresStore'
import { useTranslation } from '../../../renderer/utils/translations'
import type { AntaresVerleihRow as AntaresVerleihRowData } from '../../../shared/types'
import './antares-widget.css'

export default function AntaresWidget() {
  const { t } = useTranslation()
  const antaresEnabled = usePluginEnabled('antares')
  const {
    counts,
    offeneRegistrierungen,
    mahnungenGeraete,
    mahnungenMedien,
    lizenzenAblauf365,
    loading,
    lastError,
    lastFetchedAt,
    loadAll
  } = useAntaresStore(useShallow(s => ({
    counts: s.counts,
    offeneRegistrierungen: s.offeneRegistrierungen,
    mahnungenGeraete: s.mahnungenGeraete,
    mahnungenMedien: s.mahnungenMedien,
    lizenzenAblauf365: s.lizenzenAblauf365,
    loading: s.loading,
    lastError: s.lastError,
    lastFetchedAt: s.lastFetchedAt,
    loadAll: s.loadAll
  })))

  useEffect(() => {
    if (antaresEnabled && lastFetchedAt === null) {
      loadAll()
    }
  }, [antaresEnabled, lastFetchedAt, loadAll])

  if (!antaresEnabled) {
    return (
      <section className="dv-widget dv-widget-antares">
        <header className="dv-widget-header">
          <h3 className="dv-widget-title">{t('dashboard.widgets.antares')}</h3>
        </header>
        <p className="dv-empty">{t('dashboard.antares.disabled')}</p>
      </section>
    )
  }

  const fetchedAgo = lastFetchedAt
    ? new Date(lastFetchedAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <section className="dv-widget dv-widget-antares">
      <header className="dv-widget-header">
        <h3 className="dv-widget-title">{t('dashboard.widgets.antares')}</h3>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {fetchedAgo && <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{fetchedAgo}</span>}
          <button
            className="dv-widget-refresh"
            onClick={() => loadAll()}
            disabled={loading}
            title={t('dashboard.refresh')}
          >
            <svg className={loading ? 'spinning' : undefined} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10"/>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
            </svg>
          </button>
        </div>
      </header>

      {lastError && (
        <p style={{ color: 'var(--color-red, #c0392b)', fontSize: '12px', margin: '4px 0 8px' }}>
          {lastError}
        </p>
      )}

      {/* Drei-Spalten-Layout wie das Antares-Original-Dashboard */}
      <div className="dv-antares-columns">
        <div className="dv-antares-column">
          <h4 className="dv-antares-coltitle">{t('dashboard.antares.colNutzer')}</h4>
          <AntaresStatusButton label={t('dashboard.antares.offeneRegistrierungen')} count={counts.offeneRegistrierungen} />
        </div>

        <div className="dv-antares-column">
          <h4 className="dv-antares-coltitle">{t('dashboard.antares.colTechnik')}</h4>
          <AntaresStatusButton label={t('dashboard.antares.offeneAnfragen')} count={counts.offeneAnfragenGeraete} />
          <AntaresStatusButton label={t('dashboard.antares.offeneVorbestellungen')} count={counts.offeneVorbestellungenGeraete} />
          <AntaresStatusButton label={t('dashboard.antares.stornierteVorbestellungen')} count={counts.stornierteVorbestellungen} />
          <AntaresStatusButton label={t('dashboard.antares.ueberfaelligeRueckgaben')} count={counts.ueberfaelligeGeraete} />
        </div>

        <div className="dv-antares-column">
          <h4 className="dv-antares-coltitle">{t('dashboard.antares.colMedien')}</h4>
          <AntaresStatusButton label={t('dashboard.antares.offeneVorbestellung')} count={counts.offeneVorbestellungenMedien} />
          <AntaresStatusButton label={t('dashboard.antares.ueberfaelligeRueckgaben')} count={counts.ueberfaelligeMedien} />
        </div>
      </div>

      {/* Details: offene Registrierungen + Mahnungen + ablaufende Lizenzen */}
      {(offeneRegistrierungen.length > 0 || mahnungenGeraete.length > 0 || mahnungenMedien.length > 0 || lizenzenAblauf365.length > 0) && (
        <div className="dv-antares-details">
          {offeneRegistrierungen.length > 0 && (
            <details open>
              <summary className="dv-antares-summary">
                {t('dashboard.antares.offeneRegistrierungen')} ({offeneRegistrierungen.length})
              </summary>
              <table className="dv-antares-table">
                <thead>
                  <tr>
                    <th>{t('dashboard.antares.colName')}</th>
                    <th>{t('dashboard.antares.colEntleihernr')}</th>
                    <th>{t('dashboard.antares.colSchule')}</th>
                    <th>{t('dashboard.antares.colKlasse')}</th>
                  </tr>
                </thead>
                <tbody>
                  {offeneRegistrierungen.map(e => (
                    <tr key={e.identifier}>
                      <td>{(e.fn_vorname || '').trim()} {e.fn_ename}</td>
                      <td className="dv-antares-leihnr">{e.fn_enr}</td>
                      <td>{e.fn_schulname}</td>
                      <td>{e.class}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}
          {mahnungenGeraete.length > 0 && (
            <details open>
              <summary className="dv-antares-summary">
                {t('dashboard.antares.mahnungenGeraete')} ({mahnungenGeraete.length})
              </summary>
              <table className="dv-antares-table">
                <thead>
                  <tr>
                    <th>{t('dashboard.antares.colLeihnr')}</th>
                    <th>{t('dashboard.antares.colTitel')}</th>
                    <th>{t('dashboard.antares.colEntleiher')}</th>
                    <th>{t('dashboard.antares.colSchule')}</th>
                    <th>{t('dashboard.antares.colRueck')}</th>
                  </tr>
                </thead>
                <tbody>
                  {mahnungenGeraete.map(v => <AntaresVerleihRow key={v.identifier} row={v} />)}
                </tbody>
              </table>
            </details>
          )}

          {mahnungenMedien.length > 0 && (
            <details>
              <summary className="dv-antares-summary">
                {t('dashboard.antares.mahnungenMedien')} ({mahnungenMedien.length})
              </summary>
              <table className="dv-antares-table">
                <thead>
                  <tr>
                    <th>{t('dashboard.antares.colLeihnr')}</th>
                    <th>{t('dashboard.antares.colTitel')}</th>
                    <th>{t('dashboard.antares.colEntleiher')}</th>
                    <th>{t('dashboard.antares.colSchule')}</th>
                    <th>{t('dashboard.antares.colRueck')}</th>
                  </tr>
                </thead>
                <tbody>
                  {mahnungenMedien.map(v => <AntaresVerleihRow key={v.identifier} row={v} />)}
                </tbody>
              </table>
            </details>
          )}

          {lizenzenAblauf365.length > 0 && (
            <details>
              <summary className="dv-antares-summary">
                {t('dashboard.antares.lizenzenAblauf')} ({lizenzenAblauf365.length})
              </summary>
              <table className="dv-antares-table">
                <thead>
                  <tr>
                    <th>{t('dashboard.antares.colTitel')}</th>
                    <th>{t('dashboard.antares.colQuelle')}</th>
                    <th>{t('dashboard.antares.colLizenznr')}</th>
                    <th>{t('dashboard.antares.colAblauf')}</th>
                  </tr>
                </thead>
                <tbody>
                  {lizenzenAblauf365.map(l => (
                    <tr key={l.identifier}>
                      <td className="dv-antares-titel" title={l.fn_titel}>{l.fn_titel}</td>
                      <td>{l.fn_prod}</td>
                      <td className="dv-antares-leihnr">{l.fn_nnr}</td>
                      <td className="dv-antares-leihnr">{l.fn_enddat}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}
        </div>
      )}
    </section>
  )
}

const AntaresStatusButton: React.FC<{ label: string; count: number }> = ({ label, count }) => {
  const accent = count > 0
  return (
    <div className={`dv-antares-statusbtn ${accent ? 'dv-antares-statusbtn-accent' : ''}`}>
      <span className="dv-antares-statusbtn-count">{count}</span>
      <span className="dv-antares-statusbtn-label">{label}</span>
    </div>
  )
}

const AntaresVerleihRow: React.FC<{ row: AntaresVerleihRowData }> = ({ row }) => {
  const overdue = row.fn_rueckdatum && row.fn_rueckdatum < new Date().toISOString().slice(0, 10)
  return (
    <tr>
      <td className="dv-antares-leihnr">{row.fn_leihnr}</td>
      <td className="dv-antares-titel" title={row.fn_titel}>{row.fn_titel}</td>
      <td>{(row.fn_vorname || '').trim()} {row.fn_ename}</td>
      <td className="dv-antares-schule">{row.fn_schulname}</td>
      <td className={overdue ? 'dv-antares-overdue' : ''}>{row.fn_rueckdatum}</td>
    </tr>
  )
}
