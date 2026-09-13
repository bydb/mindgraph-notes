// Einstellungen → E-Mail (Redesign 09/2026): Konten als Dienst-Karten, Abruf & Analyse,
// Notizen & Versand. Passwörter liegen in safeStorage (emailSavePassword) und werden hier nur
// als „gespeichert" angezeigt.

import React, { useEffect, useState } from 'react'
import { useUIStore } from '../../stores/uiStore'
import { useNotesStore } from '../../stores/notesStore'
import { setModuleEnabled, useIsModuleEnabled } from '../../utils/modules'
import { getModelVerdict } from '../../../shared/modelCompatibility'
import { isCloudProviderReady, cloudProviderForSentinel, CLOUD_PROVIDER_META, type CloudProviderId } from '../../../shared/llmBackend'
import type { TranslationKey } from '../../utils/translations'
import { ModelPicker } from '../Shared/ModelPicker'
import { ModelRamWarning } from '../Shared/ModelRamWarning'
import { VERDICT_COLOR } from './ModelCompatibilitySection'
import { EmailRelevanceRulesSection } from './EmailRelevanceRulesSection'
import type { TabTFn } from './settingsTypes'
import {
  PageHeader, SectionTitle, Card, ServiceHead, IconTile, Row, Note, Details, Toggle, Select, Button,
  NumberInput, TextInput, SecretField, Textarea, ModuleOffCard, StatusChip
} from './SettingsUI'

type Account = ReturnType<typeof useUIStore.getState>['email']['accounts'][number]

const MAIL_ICON = <IconTile bg="#2f7af5">{glyphMail()}</IconTile>
function glyphMail() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 6-10 7L2 6" />
    </svg>
  )
}

const SignatureImagePreview: React.FC<{ imagePath: string }> = ({ imagePath }) => {
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  useEffect(() => {
    if (imagePath) window.electronAPI.emailLoadSignatureImage(imagePath).then(url => setDataUrl(url))
  }, [imagePath])
  if (!dataUrl) return null
  return <img src={dataUrl} alt="Signatur" className="sui-signature-preview" />
}

export const EmailSettingsTab: React.FC<{ t: TabTFn; ollamaModels: Array<{ name: string; size: number }> }> = ({ t, ollamaModels }) => {
  const enabled = useIsModuleEnabled('email')
  const email = useUIStore(s => s.email)
  const setEmail = useUIStore(s => s.setEmail)
  const ollama = useUIStore(s => s.ollama)
  const setOllama = useUIStore(s => s.setOllama)
  const language = useUIStore(s => s.language)
  const vaultPath = useNotesStore(s => s.vaultPath)

  const [passwords, setPasswords] = useState<Record<string, string>>({})
  const [testStatus, setTestStatus] = useState<Record<string, 'idle' | 'testing' | 'success' | 'failed'>>({})

  // Passwörter aus safeStorage laden — nur, um „gespeichert" anzuzeigen und den Test zu füttern.
  useEffect(() => {
    if (email.accounts.length === 0) return
    let cancelled = false
    ;(async () => {
      const next: Record<string, string> = {}
      for (const account of email.accounts) {
        try {
          const pw = await window.electronAPI.emailLoadPassword(account.id)
          if (pw) next[account.id] = pw
        } catch { /* ignore */ }
      }
      if (!cancelled && Object.keys(next).length > 0) setPasswords(prev => ({ ...prev, ...next }))
    })()
    return () => { cancelled = true }
  }, [email.accounts.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const updateAccount = (idx: number, patch: Partial<Account>) => {
    const updated = [...email.accounts]
    updated[idx] = { ...updated[idx], ...patch }
    setEmail({ accounts: updated })
  }

  const testAccount = async (account: Account) => {
    const pw = passwords[account.id]
    if (pw) await window.electronAPI.emailSavePassword(account.id, pw)
    setTestStatus(prev => ({ ...prev, [account.id]: 'testing' }))
    const result = await window.electronAPI.emailConnect(account)
    setTestStatus(prev => ({ ...prev, [account.id]: result.success ? 'success' : 'failed' }))
    setTimeout(() => setTestStatus(prev => ({ ...prev, [account.id]: 'idle' })), 3000)
  }

  const cloudProvider = cloudProviderForSentinel(email.analysisModel)
  const analysisVerdict = !cloudProvider && email.analysisModel ? getModelVerdict(email.analysisModel, 'task-extraction') : null

  return (
    <div className="settings-section">
      <PageHeader title={t('settings.email.title')} subtitle={t('settings.email.subtitle')} />
      {!enabled ? (
        <ModuleOffCard icon={MAIL_ICON} name={t('settings.email.title')} onEnable={() => { void setModuleEnabled('email', true).catch(err => console.error('[settings] email:', err)) }} />
      ) : (
        <>
          <Card><Note tone="warn">{t('settings.email.warning')}</Note></Card>

          <SectionTitle title={t('settings.email.groupAccounts')} meta={t('settings.email.accountsMeta', { n: email.accounts.length })} />
          {email.accounts.map((account, idx) => {
            const st = testStatus[account.id] ?? 'idle'
            return (
              <Card key={account.id}>
                <ServiceHead
                  icon={MAIL_ICON}
                  name={account.name || t('settings.email.accountUnnamed')}
                  desc={[account.host && `${account.host}:${account.port}`, account.tls ? 'TLS' : null, account.user].filter(Boolean).join(' · ')}
                  status={
                    st === 'testing' ? { tone: 'checking', label: t('settings.checkingConnection') }
                      : st === 'success' ? { tone: 'ok', label: t('settings.email.testSuccess') }
                        : st === 'failed' ? { tone: 'off', label: t('settings.email.testFailed') }
                          : passwords[account.id] ? null : { tone: 'warn', label: t('settings.email.noPassword') }
                  }
                  actions={
                    <>
                      <Button onClick={() => void testAccount(account)} disabled={st === 'testing'}>{t('settings.email.testConnection')}</Button>
                      <Button variant="link" onClick={() => setEmail({ accounts: email.accounts.filter((_, i) => i !== idx) })}>{t('settings.email.removeAccount')}</Button>
                    </>
                  }
                />
                <Row label={t('settings.email.accountName')}>
                  <TextInput value={account.name} onCommit={v => updateAccount(idx, { name: v })} placeholder={t('settings.email.accountName')} />
                </Row>
                <Row label={t('settings.email.imapServer')}>
                  <div className="sui-pair">
                    <TextInput value={account.host} onCommit={v => updateAccount(idx, { host: v })} placeholder={t('settings.email.host')} />
                    <NumberInput value={account.port} min={1} max={65535} onCommit={v => updateAccount(idx, { port: v || 993 })} />
                  </div>
                </Row>
                <Row label={t('settings.email.tls')} htmlFor={`mail-tls-${account.id}`}>
                  <Toggle id={`mail-tls-${account.id}`} checked={account.tls} onChange={v => updateAccount(idx, { tls: v })} />
                </Row>
                <Row label={t('settings.email.user')}>
                  <TextInput value={account.user} onCommit={v => updateAccount(idx, { user: v })} placeholder={t('settings.email.user')} />
                </Row>
                <Row label={t('settings.email.password')} hint={t('settings.email.passwordHint')}>
                  <SecretField
                    saved={!!passwords[account.id]}
                    onSave={async pw => { setPasswords(prev => ({ ...prev, [account.id]: pw })); await window.electronAPI.emailSavePassword(account.id, pw) }}
                    onRemove={() => setPasswords(prev => { const { [account.id]: _drop, ...rest } = prev; return rest })}
                    placeholder={t('settings.email.password')}
                  />
                </Row>
                <Row label={t('settings.email.fromAddress')} hint={t('settings.email.fromAddressHint')}>
                  <TextInput type="email" value={account.fromAddress || ''} onCommit={v => updateAccount(idx, { fromAddress: v })} placeholder="name@domain.de" />
                </Row>
                <Row label={t('settings.email.smtpServer')}>
                  <div className="sui-pair">
                    <TextInput value={account.smtpHost || ''} onCommit={v => updateAccount(idx, { smtpHost: v })} placeholder={t('settings.email.smtpHost')} />
                    <NumberInput value={account.smtpPort || 587} min={1} max={65535} onCommit={v => updateAccount(idx, { smtpPort: v || 587 })} />
                  </div>
                </Row>
                <Row label={t('settings.email.smtpTls')} htmlFor={`mail-smtptls-${account.id}`}>
                  <Toggle id={`mail-smtptls-${account.id}`} checked={account.smtpTls !== false} onChange={v => updateAccount(idx, { smtpTls: v })} />
                </Row>
              </Card>
            )
          })}
          <Card>
            <Row label={t('settings.email.addAccount')} hint={t('settings.email.gmailHint')}>
              <Button
                variant="primary"
                onClick={() => {
                  const id = `email-${Date.now()}`
                  setEmail({ accounts: [...email.accounts, { id, name: '', host: '', port: 993, user: '', tls: true, smtpHost: '', smtpPort: 587, smtpTls: true, fromAddress: '' }] })
                }}
              >
                + {t('settings.email.addAccount')}
              </Button>
            </Row>
          </Card>

          <SectionTitle title={t('settings.email.groupFetch')} />
          <Card>
            <Row label={t('settings.email.fetchInterval')}>
              <Select value={email.fetchIntervalMinutes} onChange={e => setEmail({ fetchIntervalMinutes: parseInt(e.target.value, 10) })}>
                {[5, 15, 30, 60].map(m => <option key={m} value={m}>{m} {t('settings.email.minutes')}</option>)}
              </Select>
            </Row>
            <Row label={t('settings.email.maxPerFetch')}>
              <NumberInput value={email.maxEmailsPerFetch} min={1} max={200} onCommit={v => setEmail({ maxEmailsPerFetch: v || 2 })} unit={t('settings.email.perFetch')} />
            </Row>
            <Row label={t('settings.email.retainDays')}>
              <NumberInput value={email.retainDays} min={7} max={365} onCommit={v => setEmail({ retainDays: v || 30 })} unit={t('settings.email.days')} />
            </Row>
            <Row label={t('settings.email.autoAnalyze')} htmlFor="mail-autoanalyze">
              <Toggle id="mail-autoanalyze" checked={email.autoAnalyze} onChange={v => setEmail({ autoAnalyze: v })} />
            </Row>
            <Row label={t('settings.email.analysisModel')} hint={t('settings.email.analysisModelHint')} anchor="email-analysis-model" stacked>
              <ModelPicker
                // SENTINEL nur als value zeigen, wenn der Cloud-Provider wirklich verfügbar ist —
                // sonst (deaktiviert) würde der Picker den Rohwert „__openrouter__" anzeigen.
                value={cloudProvider && !isCloudProviderReady(ollama[cloudProvider]) ? '' : email.analysisModel}
                placeholder={{ value: '', label: t('settings.email.analysisModelDefault') }}
                models={[
                  ...(['openrouter', 'llmbase'] as CloudProviderId[]).filter(p => isCloudProviderReady(ollama[p])).map(p => ({ name: CLOUD_PROVIDER_META[p].sentinel })),
                  ...ollamaModels
                ]}
                getLabel={name => {
                  const p = cloudProviderForSentinel(name)
                  return p ? `${CLOUD_PROVIDER_META[p].label} · ${ollama[p].model.trim()}` : name
                }}
                renderMeta={name => {
                  if (cloudProviderForSentinel(name)) return null
                  const v = getModelVerdict(name, 'task-extraction')
                  return <span title={v.reasons.join(' · ') || t(`settings.integrations.compatibility.verdict.${v.verdict}` as TranslationKey)} className="sui-dot-inline" style={{ background: VERDICT_COLOR[v.verdict] }} />
                }}
                onChange={val => {
                  // `analysisModel` ist die EINZIGE autoritative Routing-Quelle (siehe emailStore).
                  // `cloudModules` dient hier NUR als „schon bestätigt"-Merker fürs Confirm.
                  const p = cloudProviderForSentinel(val)
                  if (p && !ollama[p].cloudModules.includes('task-extraction')) {
                    const label = CLOUD_PROVIDER_META[p].label
                    const warn = language === 'en'
                      ? `Email analysis via ${label}: email content is sent to ${label} (cloud) and leaves your computer. Continue?`
                      : `E-Mail-Analyse über ${label}: Mailinhalte werden an ${label} (Cloud) gesendet und verlassen deinen Rechner. Fortfahren?`
                    // eslint-disable-next-line no-alert
                    if (!window.confirm(warn)) return
                    setOllama({ [p]: { ...ollama[p], cloudModules: [...ollama[p].cloudModules, 'task-extraction'] } })
                  }
                  setEmail({ analysisModel: val })
                }}
                ariaLabel={t('settings.email.analysisModel')}
                maxWidth="none"
              />
              <div className="sui-pair">
                {cloudProvider ? (
                  <StatusChip tone="warn" label={t('settings.email.cloudNote', { label: CLOUD_PROVIDER_META[cloudProvider].label })} />
                ) : analysisVerdict && (
                  <StatusChip
                    tone={analysisVerdict.verdict === 'green' ? 'ok' : analysisVerdict.verdict === 'red' ? 'off' : 'warn'}
                    label={<>{t(`settings.integrations.compatibility.verdict.${analysisVerdict.verdict}` as TranslationKey)}{analysisVerdict.reasons.length > 0 && ` — ${analysisVerdict.reasons[0]}`}</>}
                  />
                )}
                {!cloudProvider && <ModelRamWarning model={email.analysisModel || ollama.selectedModel} />}
              </div>
            </Row>
            <Row label={t('settings.email.relevanceThreshold')} hint={t('settings.email.thresholdHint')}>
              <input type="range" className="sui-range" min={0} max={100} value={email.relevanceThreshold} onChange={e => setEmail({ relevanceThreshold: parseInt(e.target.value, 10) })} />
              <span className="sui-unit">{email.relevanceThreshold}</span>
            </Row>
            <Row label={t('settings.email.lowPowerMode')} hint={t('settings.email.lowPowerModeHint')} htmlFor="mail-lowpower">
              <Toggle id="mail-lowpower" checked={email.lowPowerMode} onChange={v => setEmail({ lowPowerMode: v })} />
            </Row>
            <Row label={t('settings.email.markSeenOnOpen')} hint={t('settings.email.markSeenOnOpenHint')} htmlFor="mail-markseen">
              <Toggle id="mail-markseen" checked={email.markSeenOnOpen} onChange={v => setEmail({ markSeenOnOpen: v })} />
            </Row>
          </Card>

          <SectionTitle title={t('settings.email.groupNotes')} />
          <Card>
            <Row label={t('settings.email.inboxFolder')} hint={t('settings.email.inboxFolderHint')}>
              <TextInput value={email.inboxFolderName} onCommit={v => setEmail({ inboxFolderName: v })} placeholder="‼️📧 - emails" />
            </Row>
            <Row label={t('settings.email.instructionNote')} hint={t('settings.email.instructionNoteHint')}>
              <TextInput value={email.instructionNotePath} onCommit={v => setEmail({ instructionNotePath: v })} placeholder="Email-Instruktionen.md" />
            </Row>
            <Details title={t('settings.email.instructionTipsTitle')}>
              <p className="sui-prewrap">{t('settings.email.instructionTips')}</p>
            </Details>
          </Card>
          {vaultPath && <EmailRelevanceRulesSection vaultPath={vaultPath} />}
          <Card anchor="email-signature">
            <Row label={t('settings.email.signatureImage')}>
              {email.signatureImagePath && <SignatureImagePreview imagePath={email.signatureImagePath} />}
              <Button
                onClick={async () => {
                  if (!vaultPath) return
                  const result = await window.electronAPI.emailSelectSignatureImage(vaultPath)
                  if (result.success && result.path) setEmail({ signatureImagePath: result.path })
                }}
              >
                {t('settings.email.selectImage')}
              </Button>
              {email.signatureImagePath && <Button variant="link" onClick={() => setEmail({ signatureImagePath: '' })}>{t('settings.email.removeImage')}</Button>}
            </Row>
            <Row label={t('settings.email.signatureText')} hint={t('settings.email.signatureHint')} stacked>
              <Textarea value={email.signature || ''} onCommit={v => setEmail({ signature: v })} placeholder={t('settings.email.signaturePlaceholder')} rows={4} />
            </Row>
            <Details title={t('settings.email.howTitle')}>
              <p><b>E-Mail</b> {t('settings.email.description')}</p>
              <p>{t('settings.email.gmailHint')}</p>
            </Details>
          </Card>
        </>
      )}
    </div>
  )
}
