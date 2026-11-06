import { useEffect, useState } from 'react'
import { useTranslation } from '../../utils/translations'
import type { TranslationKey } from '../../utils/translations'
import { FETCH_STAT_KINDS, type FetchStatKind, type WebFetchStatsSummary } from '../../../shared/webFetchStats'
import { Button, Details, Note, Row } from './SettingsUI'

// Zählung der Webabrufe (shared/webFetchStats.ts): zeigt, woran Abrufe im Alltag scheitern,
// damit über einen Browser in der App mit Zahlen entschieden wird (06.11.2026).

const KIND_KEYS: Record<FetchStatKind, TranslationKey> = {
  ok: 'petrolChat.fetchStatsOk',
  'browser-only': 'petrolChat.fetchStatsBrowserOnly',
  http: 'petrolChat.fetchStatsHttp',
  timeout: 'petrolChat.fetchStatsTimeout',
  'too-large': 'petrolChat.fetchStatsTooLarge',
  type: 'petrolChat.fetchStatsType',
  blocked: 'petrolChat.fetchStatsBlocked',
  empty: 'petrolChat.fetchStatsEmpty',
  stopped: 'petrolChat.fetchStatsStopped',
  error: 'petrolChat.fetchStatsError'
}

export function WebFetchStatsSection() {
  const { t } = useTranslation()
  const [summary, setSummary] = useState<WebFetchStatsSummary | null>(null)
  const [confirm, setConfirm] = useState(false)
  const [clearFailed, setClearFailed] = useState(false)

  const load = () => { void window.electronAPI.webFetchStatsGet().then(setSummary).catch(() => setSummary(null)) }
  useEffect(load, [])

  const line = (counts: WebFetchStatsSummary['chat']): string | null => {
    const total = FETCH_STAT_KINDS.reduce((n, k) => n + (counts[k] ?? 0), 0)
    if (total === 0) return null
    const parts = FETCH_STAT_KINDS.filter(k => counts[k]).map(k => `${counts[k]} ${t(KIND_KEYS[k])}`)
    return t('petrolChat.fetchStatsLine', { total, parts: parts.join(' · ') })
  }

  const chat = summary ? line(summary.chat) : null
  const agent = summary ? line(summary.agent) : null
  const hostReasons = summary ? FETCH_STAT_KINDS.filter(k => k !== 'ok' && (summary.topHosts[k as Exclude<FetchStatKind, 'ok'>]?.length ?? 0) > 0) : []
  const since = summary?.since ? new Date(`${summary.since}T12:00:00`).toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' }) : null

  const clear = async () => {
    if (!confirm) { setConfirm(true); return }
    setConfirm(false)
    const ok = await window.electronAPI.webFetchStatsClear().catch(() => false)
    setClearFailed(!ok)
    load()
  }

  return (
    <>
      <Row
        label={t('petrolChat.fetchStatsLabel')}
        hint={
          <>
            {!chat && !agent && t('petrolChat.fetchStatsNone')}
            {since && <span>{t('petrolChat.fetchStatsSince', { date: since })}</span>}
            {chat && <><br />{t('petrolChat.fetchStatsChat')}: {chat}</>}
            {agent && <><br />{t('petrolChat.fetchStatsAgent')}: {agent}</>}
            <br />{t('petrolChat.fetchStatsPrivacy')}
          </>
        }
      >
        <Button variant="link" onClick={load}>{t('petrolChat.fetchStatsRefresh')}</Button>
        {(chat || agent) && (
          <Button variant="link" danger={confirm} onClick={() => void clear()}>
            {confirm ? t('petrolChat.fetchStatsClearConfirm') : t('petrolChat.fetchStatsClear')}
          </Button>
        )}
      </Row>
      {clearFailed && <Note tone="warn">{t('petrolChat.fetchStatsClearFailed')}</Note>}
      {hostReasons.length > 0 && (
        <Details title={t('petrolChat.fetchStatsHosts')}>
          <div>{t('petrolChat.fetchStatsHostsNote')}</div>
          {hostReasons.map(k => (
            <div key={k}>
              <strong>{t(KIND_KEYS[k])}:</strong>{' '}
              {summary!.topHosts[k as Exclude<FetchStatKind, 'ok'>]!.map(h => `${h.host} (${h.count})`).join(', ')}
            </div>
          ))}
        </Details>
      )}
    </>
  )
}
