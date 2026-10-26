// Webantwort im Petrol-Chat (Stufe 1b, docs/codex-collab/chat-websuche.md, E3).
//
// Ziel geringe Halluzination heißt hier: die Anzeige klingt nie stärker als die Prüfung.
// Prüfwörter stehen am Satz, nicht an der Quelle (F07); die Quellenzeile sagt nur, ob die
// Seite zitiert wurde, ob sie gekürzt ging und dass sie von diesem Rechner abgerufen wurde.
// Klickbar sind nur die Quellen aus der eingefrorenen Liste (F15); `[n]` springt zur Zeile.

import React, { useMemo, useState } from 'react'
import { useTranslation, type TranslationKey } from '../../utils/translations'
import { sanitizeHtml } from '../../utils/sanitize'
import { createWebAnswerMarkdown, markWebAnswer, onlyNeutralFlags, sentenceFlags, type WebAnswerEnv, type WebSentenceFlag } from '../../utils/webAnswerMarkdown'
import type { CitationEnv } from '../../utils/citationMarkdown'
import type { CitationReport, SentenceCheck } from '../../../shared/rag/citations'
import type { SentenceExtra, WebChatProvenance, WebDeepHit, WebDeepInfo, WebDeepQueryOrigin, WebFetchFailReason, WebFetchFailure, WebSkipCategory, WebSkippedHit, WebSource, WebUnfetchedHit } from '../../../shared/webChat'

const md = createWebAnswerMarkdown()

const FLAG_KEYS: Record<WebSentenceFlag, TranslationKey> = {
  uncited: 'petrolChat.webStatusUncited',
  low: 'petrolChat.webStatusLow',
  invalid: 'petrolChat.webStatusInvalid',
  quote: 'petrolChat.webStatusQuoteMissing',
  heading: 'petrolChat.webStatusHeading',
  number: 'petrolChat.webStatusNumber',
  questionNumber: 'petrolChat.webStatusQuestionNumber',
  negation: 'petrolChat.webStatusNegation',
  gap: 'petrolChat.webStatusGap'
}

/** Warnung je Satz für Anzeige UND Export — dieselben Wörter an beiden Stellen (F22). */
export function webFlagLabel(
  report: CitationReport,
  extras: readonly SentenceExtra[] | undefined,
  k: number,
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string
): string | null {
  const s = report.sentences[k]
  if (!s) return null
  const extra = extras?.[k]
  const flags = sentenceFlags(s, extra)
  if (flags.length === 0) return null
  return flags.map(f => f === 'number' && extra ? t('petrolChat.webStatusNumber', { numbers: extra.missingNumbers.join(', ') })
    : f === 'questionNumber' && extra ? t('petrolChat.webStatusQuestionNumber', { numbers: (extra.questionNumbers ?? []).join(', ') })
    : t(FLAG_KEYS[f])).join(' · ')
}

export const REASON_KEYS: Record<WebFetchFailReason, TranslationKey> = {
  timeout: 'petrolChat.webReasonTimeout',
  stopped: 'petrolChat.webReasonStopped',
  empty: 'petrolChat.webReasonEmpty',
  'too-large': 'petrolChat.webReasonTooLarge',
  http: 'petrolChat.webReasonHttp',
  type: 'petrolChat.webReasonType',
  blocked: 'petrolChat.webReasonBlocked',
  error: 'petrolChat.webReasonError'
}

function openSource(url: string) {
  if (/^https?:/i.test(url)) void window.electronAPI.openExternal(url)
}

/** Antworttext mit Hochzahlen und Prüfmarken; Modell-Links bleiben Text. */
export function WebAnswerText({ answer, report, extras, anchor }: { answer: string; report?: CitationReport; extras?: SentenceExtra[]; anchor: string }) {
  const { t } = useTranslation()
  const html = useMemo(() => {
    if (!report) return sanitizeHtml(md.render(answer.replace(/[\uE000-\uF8FF]/g, '')))
    const env: CitationEnv & WebAnswerEnv = {
      cites: { resolve: () => null },
      flags: {
        label: (k) => webFlagLabel(report, extras, k, t),
        isNeutral: (k) => onlyNeutralFlags(sentenceFlags(report.sentences[k], extras?.[k]))
      }
    }
    return sanitizeHtml(md.render(markWebAnswer(answer, report, extras), env))
  }, [answer, report, extras, t])
  const onClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const cite = (e.target as HTMLElement).closest('[data-cite]')
    if (!cite) return
    const row = document.getElementById(`${anchor}-${cite.getAttribute('data-cite')}`)
    if (!row) return
    row.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    row.classList.add('is-flash')
    setTimeout(() => row.classList.remove('is-flash'), 1200)
  }
  return <div className="petrol-turn-a petrol-web-answer" onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />
}

function statusLabel(s: SentenceCheck, t: (k: TranslationKey) => string): string {
  const parts: string[] = []
  switch (s.status) {
    case 'cited-high': parts.push(t('petrolChat.webStatusHigh')); break
    case 'cited-low': parts.push(t('petrolChat.webStatusLow')); break
    case 'cited-unchecked': parts.push(t('petrolChat.webStatusUnchecked')); break
    case 'cited-invalid': parts.push(t('petrolChat.webStatusInvalid')); break
    case 'uncited': parts.push(t('petrolChat.webStatusUncited')); break
    case 'unchecked': parts.push(t('petrolChat.webStatusHeading')); break
    case 'transition': parts.push(t('petrolChat.webStatusTransition')); break
  }
  for (const q of s.quotes) parts.push(t(q.found ? 'petrolChat.webStatusQuoteFound' : 'petrolChat.webStatusQuoteMissing'))
  return parts.join(' · ')
}

/** Zusammenfassung + aufklappbare Prüfung je Satz. */
export function WebCheck({ answer, report, extras }: { answer: string; report: CitationReport; extras?: SentenceExtra[] }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const s = report.summary
  const parts = [t('petrolChat.webCheckSummary', { sentences: s.sentences })]
  if (s.unchecked) parts.push(t('petrolChat.webCheckHeadings', { n: s.unchecked }))
  const gaps = extras?.filter(x => x.gap).length ?? 0
  if (s.uncited - gaps > 0) parts.push(t('petrolChat.webCheckUncited', { n: s.uncited - gaps }))
  if (gaps) parts.push(t('petrolChat.webCheckGaps', { n: gaps }))
  if (s.low) parts.push(t('petrolChat.webCheckLow', { n: s.low }))
  if (s.invalidRefs) parts.push(t('petrolChat.webCheckInvalid', { n: s.invalidRefs }))
  if (s.quotesNotFound) parts.push(t('petrolChat.webCheckQuotes', { n: s.quotesNotFound }))
  const numbers = extras?.filter(x => x.missingNumbers.length > 0 || (x.questionNumbers?.length ?? 0) > 0).length ?? 0
  const negations = extras?.filter(x => x.negation).length ?? 0
  if (numbers) parts.push(t('petrolChat.webCheckNumbers', { n: numbers }))
  if (negations) parts.push(t('petrolChat.webCheckNegations', { n: negations }))
  return (
    <div className="petrol-web-check">
      <div className="petrol-web-check-head">
        <span>{parts.join(' · ')}</span>
        <button type="button" className="agent-card-link-btn" aria-expanded={open} onClick={() => setOpen(o => !o)}>
          {t(open ? 'petrolChat.webCheckHide' : 'petrolChat.webCheckShow')}
        </button>
      </div>
      {open && (
        <ol className="petrol-web-check-list">
          {report.sentences.map((sn, k) => ({ sn, k })).filter(({ sn }) => sn.status !== 'transition').map(({ sn, k }) => {
            const text = answer.slice(sn.start, sn.end).replace(/\s+/g, ' ')
            const extra = extras?.[k]
            const flags = sentenceFlags(sn, extra)
            const weak = flags.length > 0 && !onlyNeutralFlags(flags)
            const extraLabels = [
              extra?.missingNumbers.length ? t('petrolChat.webStatusNumber', { numbers: extra.missingNumbers.join(', ') }) : '',
              extra?.questionNumbers?.length ? t('petrolChat.webStatusQuestionNumber', { numbers: extra.questionNumbers.join(', ') }) : '',
              extra?.negation ? t('petrolChat.webStatusNegation') : ''
            ].filter(Boolean)
            return (
              <li key={k} className={weak ? 'is-weak' : ''}>
                <span className="petrol-web-check-text">{text.length > 200 ? `${text.slice(0, 200)}…` : text}</span>
                <span className="petrol-web-check-status">{[statusLabel(sn, t), ...extraLabels].join(' · ')}{sn.refs.length ? ` · [${sn.refs.join('][')}]` : ''}</span>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}

/** Abgerufene Quellen mit Verwendung; Fehlversuche ohne Nummer darunter. */
export function WebSourceList({ sources, used, failures, notFetched, anchor }: {
  sources: WebSource[]
  /** null = keine Prüfung (Stopp) — dann ohne „zitiert/nicht zitiert“. */
  used: Set<number> | null
  failures: WebFetchFailure[]
  notFetched: number
  anchor: string
}) {
  const { t } = useTranslation()
  const failText = failures.map(f => `${f.host} (${t(REASON_KEYS[f.reason])})`).join(', ')
  return (
    <div className="petrol-web-sources">
      <span className="agent-card-eyebrow">{t('petrolChat.webSources')}</span>
      <ol>
        {sources.map(s => {
          const tags = [
            used ? t(used.has(s.n) ? 'petrolChat.webCited' : 'petrolChat.webNotCited') : '',
            s.truncated ? t('petrolChat.webTruncated') : ''
          ].filter(Boolean).join(' · ')
          return (
            <li key={s.n} id={`${anchor}-${s.n}`} className={used && !used.has(s.n) ? 'is-unused' : ''}>
              <span className="petrol-web-src-n">[{s.n}]</span>
              <button type="button" className="petrol-web-src-link" title={s.url} onClick={() => openSource(s.url)}>{s.title}</button>
              <span className="petrol-web-src-host">{s.host}</span>
              {tags && <span className="petrol-web-src-tags">{tags}</span>}
            </li>
          )
        })}
      </ol>
      {failures.length > 0 && <div className="petrol-web-muted">{t('petrolChat.webNotFetched', { list: failText })}</div>}
      {notFetched > 0 && <div className="petrol-web-muted">{t('petrolChat.webMoreHits', { n: notFetched })}</div>}
      <div className="petrol-web-muted">{t('petrolChat.webDisclaimer')}</div>
    </div>
  )
}

/** K = 0: Treffer klar als nicht abgerufen und nicht geprüft, ohne Nummern (F18). */
export function WebUnfetchedHits({ hits, failures }: { hits: WebUnfetchedHit[]; failures: WebFetchFailure[] }) {
  const { t } = useTranslation()
  const failText = failures.map(f => `${f.host} (${t(REASON_KEYS[f.reason])})`).join(', ')
  return (
    <div className="petrol-web-sources is-unchecked">
      <div className="petrol-web-nothing">{t('petrolChat.webNothing')}</div>
      {failures.length > 0 && <div className="petrol-web-muted">{t('petrolChat.webNotFetched', { list: failText })}</div>}
      {hits.length > 0 && (
        <>
          <span className="agent-card-eyebrow">{t('petrolChat.webHitsUnchecked')}</span>
          <ul>
            {hits.map(h => (
              <li key={h.url}>
                <button type="button" className="petrol-web-src-link" title={h.url} onClick={() => openSource(h.url)}>{h.title}</button>
                <span className="petrol-web-src-host">{h.host}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

/** Treffer, die nicht abgerufen wurden, weil sie keine Sachquelle sind — sichtbar, nie still. */
export function WebSkippedLine({ skipped }: { skipped: WebSkippedHit[] | undefined }) {
  const { t } = useTranslation()
  if (!skipped || skipped.length === 0) return null
  const kinds = [...new Set(skipped.map(s => t(SKIP_KEYS[s.category])))].join(', ')
  const n = skipped.reduce((sum, s) => sum + (s.count || 1), 0)
  const hosts = skipped.map(s => ((s.count || 1) > 1 ? `${s.host} (${s.count}×)` : s.host)).join(', ')
  return <div className="petrol-web-muted">{t('petrolChat.webSkipped', { n, kinds, hosts })}</div>
}

const DEEP_LIMIT_KEYS: Record<WebDeepInfo['limited'][number], TranslationKey> = {
  'plan-failed': 'petrolChat.webDeepLimitedPlan',
  'retry-plan-failed': 'petrolChat.webDeepLimitedRetryPlan',
  'pick-failed': 'petrolChat.webDeepLimitedPick',
  'no-search': 'petrolChat.webDeepLimitedNoSearch',
  'guard-skipped': 'petrolChat.webDeepLimitedGuardSkipped',
  timeout: 'petrolChat.webDeepLimitedTimeout',
  budget: 'petrolChat.webDeepLimitedBudget',
  window: 'petrolChat.webDeepLimitedWindow'
}

const SKIP_KEYS: Record<WebSkipCategory, TranslationKey> = {
  translator: 'petrolChat.webSkipTranslator',
  social: 'petrolChat.webSkipSocial',
  adult: 'petrolChat.webSkipAdult'
}

const DEEP_REJECT_KEYS: Record<WebDeepInfo['rejected'][number]['reason'], TranslationKey> = {
  empty: 'petrolChat.webDeepRejectEmpty',
  'too-long': 'petrolChat.webDeepRejectTooLong',
  duplicate: 'petrolChat.webDeepRejectDuplicate',
  'over-limit': 'petrolChat.webDeepRejectOverLimit'
}

/** Je Herkunft eine Zeile — der Rückfall sagt genau, womit gesucht wurde (Codex F29). */
const DEEP_ORIGIN_KEYS: Record<WebDeepQueryOrigin, TranslationKey> = {
  plan: 'petrolChat.webDeepSearched',
  guard: 'petrolChat.webDeepGuard',
  fallback: 'petrolChat.webDeepFallback',
  'fallback-words': 'petrolChat.webDeepFallbackWords',
  retry: 'petrolChat.webDeepRetry'
}

const DEEP_HIT_KEYS: Record<WebDeepHit['status'], TranslationKey> = {
  read: 'petrolChat.webDeepHitRead',
  unused: 'petrolChat.webDeepHitUnused',
  duplicate: 'petrolChat.webDeepHitDuplicate',
  failed: 'petrolChat.webDeepHitFailed',
  'not-tried': 'petrolChat.webDeepHitNotTried',
  'not-picked': 'petrolChat.webDeepHitNotPicked'
}

/**
 * Gründliche Suche (chat-gruendliche-suche.md, R1/S2): jede GESENDETE Anfrage, Verworfenes mit
 * Grund, Einschränkungen, nicht Verwendetes, die Trefferliste mit Ausgang (F26) und der
 * Wörterabgleich — nie „abgedeckt“.
 */
export function WebDeepLine({ deep }: { deep: WebDeepInfo | undefined }) {
  const { t } = useTranslation()
  if (!deep) return null
  const quote = (q: string) => `„${q}“`
  const origins = (Object.keys(DEEP_ORIGIN_KEYS) as WebDeepQueryOrigin[]).filter(o => deep.queries.some(q => q.origin === o))
  const limited = [...new Set(deep.limited)].map(l => t(DEEP_LIMIT_KEYS[l]))
  const hits = deep.hits ?? []
  return (
    <div className="petrol-web-deep">
      {deep.numbersNotInQueries && deep.numbersNotInQueries.length > 0 && (
        <div className="petrol-web-muted petrol-web-warn">{t('petrolChat.webDeepNumbersNotInQueries', { numbers: deep.numbersNotInQueries.join(', ') })}</div>
      )}
      {origins.map(o => (
        <div key={o} className="petrol-web-muted">
          {t(DEEP_ORIGIN_KEYS[o], { queries: deep.queries.filter(q => q.origin === o).map(q => quote(q.text) + (q.withoutNumbers?.length ? ` (${t('petrolChat.webDeepWithout', { numbers: q.withoutNumbers.join(', ') })})` : '') + (q.ok ? '' : ` (${t('petrolChat.webDeepQueryFailed')})`)).join(', ') })}
        </div>
      ))}
      {hits.length > 0 ? (
        <details className="petrol-web-deep-hits">
          <summary className="petrol-web-muted">{t('petrolChat.webDeepCounts', { picked: deep.picked, candidates: deep.candidates, searches: deep.searches, fetches: deep.fetches })}</summary>
          <ol>
            {hits.map((h, i) => (
              <li key={`${h.round}-${i}`} className={`petrol-web-muted is-${h.status}`}>
                <span>{h.title || h.host}</span> · <span>{h.host}</span> · <span>{t(DEEP_HIT_KEYS[h.status])}</span>
                {h.round === 2 && <> · <span>{t('petrolChat.webDeepHitRetry')}</span></>}
              </li>
            ))}
          </ol>
        </details>
      ) : (
        <div className="petrol-web-muted">{t('petrolChat.webDeepCounts', { picked: deep.picked, candidates: deep.candidates, searches: deep.searches, fetches: deep.fetches })}</div>
      )}
      {deep.rejected.length > 0 && <div className="petrol-web-muted">{t('petrolChat.webDeepRejected', { list: deep.rejected.map(r => `${r.text ? quote(r.text) : '—'} (${t(DEEP_REJECT_KEYS[r.reason])})`).join(', ') })}</div>}
      {limited.length > 0 && <div className="petrol-web-muted petrol-web-warn">{t('petrolChat.webDeepLimited', { reasons: limited.join(' · ') })}</div>}
      {deep.unused.length > 0 && <div className="petrol-web-muted">{t('petrolChat.webDeepUnused', { hosts: deep.unused.join(', ') })}</div>}
      {deep.terms.missing.length > 0 && <div className="petrol-web-muted petrol-web-warn">{t('petrolChat.webDeepMissing', { terms: deep.terms.missing.join(', ') })}</div>}
      {deep.terms.similar.length > 0 && <div className="petrol-web-muted">{t('petrolChat.webDeepSimilar', { terms: deep.terms.similar.join(', ') })}</div>}
    </div>
  )
}

/** Datenweg dieses Laufs aus Main-Provenienz (F11): Suchanbieter, Hosts, Modellweg. */
export function WebProvenanceLine({ p }: { p: WebChatProvenance }) {
  const { t } = useTranslation()
  const parts = [
    p.searchProvider ? t('petrolChat.webProvSearch', { provider: p.searchProvider }) : t('petrolChat.webProvNoSearch'),
    p.contactedHosts.length ? t('petrolChat.webProvPages', { hosts: [...new Set(p.contactedHosts)].join(', ') }) : t('petrolChat.webProvNoPages'),
    p.route === 'local' ? t('petrolChat.webProvModelLocal')
      : p.route === 'cloud' ? t('petrolChat.webProvModelCloud', { provider: p.routeLabel })
      : p.route ? t('petrolChat.webProvModelUnverified', { provider: p.routeLabel }) : ''
  ].filter(Boolean)
  return <div className="petrol-web-muted petrol-web-prov">{parts.join(' · ')}</div>
}
