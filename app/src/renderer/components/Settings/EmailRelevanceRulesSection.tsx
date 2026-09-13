import React, { useEffect, useState, useCallback } from 'react'
import { useTranslation } from '../../utils/translations'
import {
  DEFAULT_VIP_WEIGHT, DEFAULT_DOMAIN_WEIGHT, DEFAULT_KEYWORD_BOOST, DEFAULT_REPLY_HISTORY,
  type VipSender, type DomainRule, type KeywordRule,
} from '../../../shared/emailRelevance'
import { Card, Row, Note, Button } from './SettingsUI'

// Settings-Sicht auf den email-relevance-config-Block der Instruktions-Notiz.
// Die Notiz bleibt Single-Source (synct mit + direkt editierbar); dieses Formular
// liest und schreibt denselben Block per IPC.
//
// Bewusst EIN Speichern-Knopf für alle drei Listen (kein Auto-Save pro Feld): ein halb
// getippter Domainname darf nicht sofort als Regel in die Notiz.

export const EmailRelevanceRulesSection: React.FC<{ vaultPath: string }> = ({ vaultPath }) => {
  const { t } = useTranslation()
  const [vip, setVip] = useState<VipSender[]>([])
  const [domains, setDomains] = useState<DomainRule[]>([])
  const [keywords, setKeywords] = useState<KeywordRule[]>([])
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle')

  useEffect(() => {
    if (!vaultPath) return
    let cancelled = false
    window.electronAPI.emailRelevanceConfigLoad(vaultPath).then(res => {
      if (cancelled || !res?.success || !res.config) return
      setVip(res.config.vipSenders || [])
      setDomains(res.config.domains || [])
      setKeywords(res.config.keywords || [])
    }).catch(() => { /* Notiz evtl. noch nicht vorhanden */ })
    return () => { cancelled = true }
  }, [vaultPath])

  const save = useCallback(async () => {
    setSaving(true); setStatus('idle')
    try {
      const res = await window.electronAPI.emailRelevanceConfigSave(vaultPath, {
        vipSenders: vip, domains, keywords, replyHistory: DEFAULT_REPLY_HISTORY,
      })
      setStatus(res?.success ? 'saved' : 'error')
      if (res?.success) setTimeout(() => setStatus('idle'), 2500)
    } catch { setStatus('error') } finally { setSaving(false) }
  }, [vaultPath, vip, domains, keywords])

  const removeBtn = (onClick: () => void) => (
    <button type="button" className="sui-rule-remove" title={t('settings.email.rules.remove')} aria-label={t('settings.email.rules.remove')} onClick={onClick}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
    </button>
  )

  return (
    <Card>
      <Row label={t('settings.email.rules.title')} hint={t('settings.email.rules.hint')} />

      <Row label={t('settings.email.rules.vip')} stacked>
        {vip.map((v, i) => (
          <div key={i} className="sui-rule-row">
            <input className="sui-input" placeholder={t('settings.email.rules.namePh')} value={v.name || ''}
              onChange={e => setVip(vip.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
            <input className="sui-input" placeholder={t('settings.email.rules.emailPh')} value={v.email || ''}
              onChange={e => setVip(vip.map((x, j) => j === i ? { ...x, email: e.target.value } : x))} />
            <input type="number" className="sui-input is-number" min={0} max={100} title={t('settings.email.rules.weight')} value={v.weight}
              onChange={e => setVip(vip.map((x, j) => j === i ? { ...x, weight: Number(e.target.value) } : x))} />
            {removeBtn(() => setVip(vip.filter((_, j) => j !== i)))}
          </div>
        ))}
        <div><Button variant="link" onClick={() => setVip([...vip, { name: '', email: '', weight: DEFAULT_VIP_WEIGHT }])}>{t('settings.email.rules.add')}</Button></div>
      </Row>

      <Row label={t('settings.email.rules.domains')} stacked>
        {domains.map((d, i) => (
          <div key={i} className="sui-rule-row">
            <input className="sui-input" placeholder={t('settings.email.rules.domainPh')} value={d.domain}
              onChange={e => setDomains(domains.map((x, j) => j === i ? { ...x, domain: e.target.value } : x))} />
            <input type="number" className="sui-input is-number" min={0} max={100} title={t('settings.email.rules.weight')} value={d.weight}
              onChange={e => setDomains(domains.map((x, j) => j === i ? { ...x, weight: Number(e.target.value) } : x))} />
            {removeBtn(() => setDomains(domains.filter((_, j) => j !== i)))}
          </div>
        ))}
        <div><Button variant="link" onClick={() => setDomains([...domains, { domain: '', weight: DEFAULT_DOMAIN_WEIGHT }])}>{t('settings.email.rules.add')}</Button></div>
      </Row>

      <Row label={t('settings.email.rules.keywords')} stacked>
        {keywords.map((k, i) => (
          <div key={i} className="sui-rule-row">
            <input className="sui-input" placeholder={t('settings.email.rules.keywordPh')} value={k.term}
              onChange={e => setKeywords(keywords.map((x, j) => j === i ? { ...x, term: e.target.value } : x))} />
            <input type="number" className="sui-input is-number" min={0} max={100} title="Boost" value={k.weight}
              onChange={e => setKeywords(keywords.map((x, j) => j === i ? { ...x, weight: Number(e.target.value) } : x))} />
            {removeBtn(() => setKeywords(keywords.filter((_, j) => j !== i)))}
          </div>
        ))}
        <div><Button variant="link" onClick={() => setKeywords([...keywords, { term: '', weight: DEFAULT_KEYWORD_BOOST }])}>{t('settings.email.rules.add')}</Button></div>
      </Row>

      <Note tone="muted">{t('settings.email.rules.replyAuto')}</Note>
      {status === 'error' && <Note tone="danger">{t('settings.email.rules.saveError')}</Note>}
      <Row label={t('settings.email.rules.save')}>
        {status === 'saved' && <span className="sui-saved">{t('settings.email.rules.saved')}</span>}
        <Button variant="primary" onClick={() => void save()} disabled={saving}>{t('settings.email.rules.save')}</Button>
      </Row>
    </Card>
  )
}
