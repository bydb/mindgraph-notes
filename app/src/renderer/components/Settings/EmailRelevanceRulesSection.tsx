import React, { useEffect, useState, useCallback } from 'react'
import { useTranslation } from '../../utils/translations'
import {
  DEFAULT_VIP_WEIGHT, DEFAULT_DOMAIN_WEIGHT, DEFAULT_KEYWORD_BOOST, DEFAULT_REPLY_HISTORY,
  type VipSender, type DomainRule, type KeywordRule,
} from '../../../shared/emailRelevance'

// Settings-Sicht auf den email-relevance-config-Block der Instruktions-Notiz.
// Die Notiz bleibt Single-Source (synct mit + direkt editierbar); dieses Formular
// liest und schreibt denselben Block per IPC.

const inputStyle: React.CSSProperties = { padding: '4px 8px', fontSize: '13px' }
const weightStyle: React.CSSProperties = { ...inputStyle, width: '52px', textAlign: 'center' }
const rowStyle: React.CSSProperties = { display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '4px', flexWrap: 'wrap' }
const removeBtn: React.CSSProperties = {
  border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-muted)',
  borderRadius: '4px', width: '24px', height: '24px', cursor: 'pointer', lineHeight: '1', flexShrink: 0,
}
const addBtn: React.CSSProperties = {
  border: '1px dashed var(--border-color)', background: 'transparent', color: 'var(--text-secondary, var(--text-muted))',
  borderRadius: '4px', padding: '3px 10px', fontSize: '12px', cursor: 'pointer', marginTop: '2px',
}
const groupLabel: React.CSSProperties = { fontSize: '12px', fontWeight: 600, marginTop: '12px', marginBottom: '4px', color: 'var(--text-secondary, var(--text-normal))' }

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

  return (
    <div style={{ marginTop: '8px', paddingTop: '12px', borderTop: '1px solid var(--border-color)' }}>
      <div style={{ fontWeight: 600, marginBottom: '2px' }}>{t('settings.email.rules.title')}</div>
      <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: '8px' }}>
        {t('settings.email.rules.hint')}
      </div>

      {/* VIP-Absender */}
      <div style={groupLabel}>{t('settings.email.rules.vip')}</div>
      {vip.map((v, i) => (
        <div key={i} style={rowStyle}>
          <input style={{ ...inputStyle, flex: '1 1 130px' }} placeholder={t('settings.email.rules.namePh')}
            value={v.name || ''} onChange={e => setVip(vip.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
          <input style={{ ...inputStyle, flex: '1 1 170px' }} placeholder={t('settings.email.rules.emailPh')}
            value={v.email || ''} onChange={e => setVip(vip.map((x, j) => j === i ? { ...x, email: e.target.value } : x))} />
          <input type="number" min={0} max={100} style={weightStyle} title="Gewicht"
            value={v.weight} onChange={e => setVip(vip.map((x, j) => j === i ? { ...x, weight: Number(e.target.value) } : x))} />
          <button style={removeBtn} title="Entfernen" onClick={() => setVip(vip.filter((_, j) => j !== i))}>×</button>
        </div>
      ))}
      <button style={addBtn} onClick={() => setVip([...vip, { name: '', email: '', weight: DEFAULT_VIP_WEIGHT }])}>{t('settings.email.rules.add')}</button>

      {/* Domains */}
      <div style={groupLabel}>{t('settings.email.rules.domains')}</div>
      {domains.map((d, i) => (
        <div key={i} style={rowStyle}>
          <input style={{ ...inputStyle, flex: '1 1 220px' }} placeholder={t('settings.email.rules.domainPh')}
            value={d.domain} onChange={e => setDomains(domains.map((x, j) => j === i ? { ...x, domain: e.target.value } : x))} />
          <input type="number" min={0} max={100} style={weightStyle} title="Gewicht"
            value={d.weight} onChange={e => setDomains(domains.map((x, j) => j === i ? { ...x, weight: Number(e.target.value) } : x))} />
          <button style={removeBtn} title="Entfernen" onClick={() => setDomains(domains.filter((_, j) => j !== i))}>×</button>
        </div>
      ))}
      <button style={addBtn} onClick={() => setDomains([...domains, { domain: '', weight: DEFAULT_DOMAIN_WEIGHT }])}>{t('settings.email.rules.add')}</button>

      {/* Schlüsselwörter */}
      <div style={groupLabel}>{t('settings.email.rules.keywords')}</div>
      {keywords.map((k, i) => (
        <div key={i} style={rowStyle}>
          <input style={{ ...inputStyle, flex: '1 1 220px' }} placeholder={t('settings.email.rules.keywordPh')}
            value={k.term} onChange={e => setKeywords(keywords.map((x, j) => j === i ? { ...x, term: e.target.value } : x))} />
          <input type="number" min={0} max={100} style={weightStyle} title="Boost"
            value={k.weight} onChange={e => setKeywords(keywords.map((x, j) => j === i ? { ...x, weight: Number(e.target.value) } : x))} />
          <button style={removeBtn} title="Entfernen" onClick={() => setKeywords(keywords.filter((_, j) => j !== i))}>×</button>
        </div>
      ))}
      <button style={addBtn} onClick={() => setKeywords([...keywords, { term: '', weight: DEFAULT_KEYWORD_BOOST }])}>{t('settings.email.rules.add')}</button>

      <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.5, margin: '12px 0 8px' }}>
        {t('settings.email.rules.replyAuto')}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <button onClick={save} disabled={saving} className="settings-btn-primary"
          style={{ padding: '5px 14px', fontSize: '13px', cursor: saving ? 'default' : 'pointer' }}>
          {t('settings.email.rules.save')}
        </button>
        {status === 'saved' && <span style={{ fontSize: '12px', color: 'var(--success-color, #4caf50)' }}>{t('settings.email.rules.saved')}</span>}
        {status === 'error' && <span style={{ fontSize: '12px', color: 'var(--error-color, #e57373)' }}>{t('settings.email.rules.saveError')}</span>}
      </div>
    </div>
  )
}
