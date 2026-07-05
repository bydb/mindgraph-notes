// EmailSetupStep — Onboarding-Schritt für Office-/Professional-Profile, der
// einen IMAP/SMTP-Account direkt im Onboarding aufnimmt und per
// emailConnect(...) testet. Office-User aus Outlook/Microsoft-365-Umgebungen
// erwarten, dass sie nach ein paar Klicks ihre Mails sehen — die Tour-Logik
// soll daran nicht scheitern, deshalb ist „Später einrichten" jederzeit sichtbar.

import React, { useMemo, useState } from 'react'
import { useUIStore } from '../../../stores/uiStore'
import { useTranslation } from '../../../utils/translations'
import { StepIndicator } from './StepIndicator'

interface EmailSetupStepProps {
  onBack: () => void
  onNext: () => void
  stepNumber: number
  totalSteps: number
}

interface Preset {
  id: string
  label: string
  imapHost: string
  imapPort: number
  imapTls: boolean
  smtpHost: string
  smtpPort: number
  smtpTls: boolean
}

// Häufige IMAP/SMTP-Server. Passwort wird hier nie eingetragen — der Office-
// User füllt es händisch. Werte beruhen auf den offiziellen Anbieter-Setups.
const PRESETS: Preset[] = [
  { id: 'gmail',    label: 'Gmail',                  imapHost: 'imap.gmail.com',          imapPort: 993, imapTls: true, smtpHost: 'smtp.gmail.com',         smtpPort: 465, smtpTls: true },
  { id: 'outlook',  label: 'Outlook / Microsoft 365', imapHost: 'outlook.office365.com',  imapPort: 993, imapTls: true, smtpHost: 'smtp.office365.com',     smtpPort: 587, smtpTls: true },
  { id: 'icloud',   label: 'iCloud',                 imapHost: 'imap.mail.me.com',        imapPort: 993, imapTls: true, smtpHost: 'smtp.mail.me.com',       smtpPort: 587, smtpTls: true },
  { id: 'webde',    label: 'web.de',                 imapHost: 'imap.web.de',             imapPort: 993, imapTls: true, smtpHost: 'smtp.web.de',            smtpPort: 587, smtpTls: true },
  { id: 'gmx',      label: 'GMX',                    imapHost: 'imap.gmx.net',            imapPort: 993, imapTls: true, smtpHost: 'mail.gmx.net',           smtpPort: 587, smtpTls: true },
  { id: 'strato',   label: 'Strato',                 imapHost: 'imap.strato.de',          imapPort: 993, imapTls: true, smtpHost: 'smtp.strato.de',         smtpPort: 465, smtpTls: true }
]

type TestStatus = 'idle' | 'testing' | 'success' | 'failed'

export const EmailSetupStep: React.FC<EmailSetupStepProps> = ({ onBack, onNext, stepNumber, totalSteps }) => {
  const { t } = useTranslation()
  const emailSettings = useUIStore(s => s.email)
  const setEmail = useUIStore(s => s.setEmail)

  const [presetId, setPresetId] = useState<string>('outlook')
  const [name, setName] = useState('')
  const [user, setUser] = useState('')
  const [password, setPassword] = useState('')
  const [fromAddress, setFromAddress] = useState('')
  const [imapHost, setImapHost] = useState(PRESETS[1].imapHost)
  const [imapPort, setImapPort] = useState(PRESETS[1].imapPort)
  const [smtpHost, setSmtpHost] = useState(PRESETS[1].smtpHost)
  const [smtpPort, setSmtpPort] = useState(PRESETS[1].smtpPort)
  const [tls, setTls] = useState(true)
  const [smtpTls, setSmtpTls] = useState(true)
  const [advanced, setAdvanced] = useState(false)
  const [status, setStatus] = useState<TestStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const applyPreset = (id: string) => {
    setPresetId(id)
    const preset = PRESETS.find(p => p.id === id)
    if (!preset) return
    setImapHost(preset.imapHost)
    setImapPort(preset.imapPort)
    setTls(preset.imapTls)
    setSmtpHost(preset.smtpHost)
    setSmtpPort(preset.smtpPort)
    setSmtpTls(preset.smtpTls)
  }

  const canTest = useMemo(() => {
    return user.trim().length > 0 && password.length > 0 && imapHost.trim().length > 0
  }, [user, password, imapHost])

  const buildAccount = () => ({
    id: `email-${Date.now()}`,
    name: name.trim() || user.trim() || 'Mein Postfach',
    host: imapHost.trim(),
    port: imapPort,
    user: user.trim(),
    tls,
    smtpHost: smtpHost.trim(),
    smtpPort,
    smtpTls,
    fromAddress: (fromAddress.trim() || user.trim())
  })

  const handleTestAndSave = async () => {
    if (!canTest || status === 'testing') return
    setStatus('testing')
    setError(null)
    const account = buildAccount()
    try {
      // Passwort muss VOR dem Connect-Versuch gespeichert sein, weil
      // emailConnect das Passwort aus safeStorage anhand der accountId zieht.
      await window.electronAPI.emailSavePassword(account.id, password)
      const result = await window.electronAPI.emailConnect(account)
      if (result.success) {
        setEmail({
          enabled: true,
          accounts: [...emailSettings.accounts, account]
        })
        setStatus('success')
        setSaved(true)
      } else {
        setStatus('failed')
        setError(result.error || t('onboarding.emailSetup.testFailed'))
      }
    } catch (err) {
      setStatus('failed')
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="onboarding-step onboarding-ai-setup">
      <StepIndicator current={stepNumber} total={totalSteps} />

      <h2 className="onboarding-step-title">{t('onboarding.emailSetup.title')}</h2>
      <p className="onboarding-step-desc">{t('onboarding.emailSetup.subtitle')}</p>

      <section className="onboarding-ai-setup-card">
        <header className="onboarding-ai-setup-card-head">
          <h3>{t('onboarding.emailSetup.providerHeading')}</h3>
        </header>

        <div className="onboarding-ai-setup-os-tabs" role="tablist">
          {PRESETS.map(p => (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={presetId === p.id}
              className={`onboarding-ai-setup-os-tab ${presetId === p.id ? 'active' : ''}`}
              onClick={() => applyPreset(p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '12px' }}>
          <input
            type="text"
            placeholder={t('onboarding.emailSetup.accountNamePlaceholder')}
            value={name}
            onChange={e => setName(e.target.value)}
            disabled={saved}
          />
          <input
            type="email"
            placeholder={t('onboarding.emailSetup.userPlaceholder')}
            value={user}
            onChange={e => {
              setUser(e.target.value)
              if (!fromAddress) setFromAddress(e.target.value)
            }}
            disabled={saved}
            autoComplete="username"
          />
          <input
            type="password"
            placeholder={t('onboarding.emailSetup.passwordPlaceholder')}
            value={password}
            onChange={e => setPassword(e.target.value)}
            disabled={saved}
            autoComplete="current-password"
          />
        </div>

        <button
          type="button"
          className="onboarding-btn-text"
          onClick={() => setAdvanced(v => !v)}
          style={{ marginTop: '8px' }}
        >
          {advanced ? t('onboarding.emailSetup.hideAdvanced') : t('onboarding.emailSetup.showAdvanced')}
        </button>

        {advanced && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '8px' }}>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ minWidth: '50px', fontSize: '12px', color: 'var(--text-muted)' }}>IMAP</span>
              <input type="text" value={imapHost} onChange={e => setImapHost(e.target.value)} placeholder="imap.example.com" style={{ flex: 1, minWidth: '180px' }} disabled={saved} />
              <input type="number" value={imapPort} onChange={e => setImapPort(parseInt(e.target.value) || 993)} placeholder="993" style={{ width: '70px' }} disabled={saved} />
              <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
                <input type="checkbox" checked={tls} onChange={e => setTls(e.target.checked)} disabled={saved} />
                TLS
              </label>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ minWidth: '50px', fontSize: '12px', color: 'var(--text-muted)' }}>SMTP</span>
              <input type="text" value={smtpHost} onChange={e => setSmtpHost(e.target.value)} placeholder="smtp.example.com" style={{ flex: 1, minWidth: '180px' }} disabled={saved} />
              <input type="number" value={smtpPort} onChange={e => setSmtpPort(parseInt(e.target.value) || 587)} placeholder="587" style={{ width: '70px' }} disabled={saved} />
              <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
                <input type="checkbox" checked={smtpTls} onChange={e => setSmtpTls(e.target.checked)} disabled={saved} />
                TLS
              </label>
            </div>
            <input
              type="email"
              placeholder={t('onboarding.emailSetup.fromAddressPlaceholder')}
              value={fromAddress}
              onChange={e => setFromAddress(e.target.value)}
              disabled={saved}
            />
          </div>
        )}

        <div style={{ display: 'flex', gap: '8px', marginTop: '12px', alignItems: 'center' }}>
          <button
            type="button"
            className="onboarding-btn-primary onboarding-btn-small"
            onClick={handleTestAndSave}
            disabled={!canTest || status === 'testing' || saved}
          >
            {status === 'testing' ? t('onboarding.emailSetup.testing')
              : saved ? t('onboarding.emailSetup.saved')
              : t('onboarding.emailSetup.testAndSave')}
          </button>
          {status === 'success' && <span className="onboarding-ai-setup-status detected"><span className="dot dot-green" /> {t('onboarding.emailSetup.testSuccess')}</span>}
          {status === 'failed' && <span style={{ fontSize: '12px', color: 'var(--color-danger)' }}>{t('onboarding.emailSetup.testFailed')}</span>}
        </div>

        {error && <p className="onboarding-ai-setup-error">{error}</p>}
      </section>

      <section className="onboarding-ai-setup-card onboarding-ai-setup-card-skip">
        <header className="onboarding-ai-setup-card-head">
          <h3>{t('onboarding.emailSetup.skipHeading')}</h3>
        </header>
        <p className="onboarding-ai-setup-os-hint">{t('onboarding.emailSetup.skipHint')}</p>
      </section>

      <div className="onboarding-nav">
        <button type="button" className="onboarding-btn-secondary" onClick={onBack}>
          {t('onboarding.back')}
        </button>
        <div style={{ display: 'flex', gap: '8px' }}>
          {!saved && (
            <button type="button" className="onboarding-btn-text" onClick={onNext}>
              {t('onboarding.emailSetup.skipButton')}
            </button>
          )}
          <button type="button" className="onboarding-btn-primary" onClick={onNext}>
            {saved ? t('onboarding.next') : t('onboarding.emailSetup.continueButton')}
          </button>
        </div>
      </div>
    </div>
  )
}
