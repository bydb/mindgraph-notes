// Einstellungen → E-Mail: Microsoft-365-Konten.
//
// Die Anmeldung läuft im Main (main/email/microsoftAuth.ts) und im Systembrowser.
// Hier kommen nur Kontoname und Zustand an, nie eine Zugangsmarke. Ein Microsoft-Konto
// hat keine Server-, Port- oder Passwortfelder: die Verbindungsdaten legt der Main fest.
// Plan: docs/codex-collab/microsoft-365-anbindung.md, Abschnitt 4.

import React, { useCallback, useEffect, useState } from 'react'
import { useUIStore } from '../../stores/uiStore'
import type { MicrosoftMailStatus } from '../../../shared/types'
import type { TabTFn } from './settingsTypes'
import { Card, ServiceHead, IconTile, Row, Note, Details, Button, TextInput, StatusChip } from './SettingsUI'

type Account = ReturnType<typeof useUIStore.getState>['email']['accounts'][number]

const MICROSOFT_ICON = (
  <IconTile bg="#0f6cbd">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 6-10 7L2 6" />
    </svg>
  </IconTile>
)

/** Anmeldung auslösen und das Konto in die Einstellungen übernehmen (anlegen oder auffrischen). */
export function useMicrosoftSignIn(): {
  pending: boolean
  error: string | null
  notice: string | null
  signIn: (expectedAccountId?: string) => Promise<string | null>
  cancel: () => void
  clearMessages: () => void
} {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const signIn = useCallback(async (expectedAccountId?: string): Promise<string | null> => {
    setPending(true)
    setError(null)
    setNotice(null)
    try {
      const { email } = useUIStore.getState()
      const result = await window.electronAPI.emailMicrosoftLogin({ clientId: email.microsoftClientId, tenant: email.microsoftTenant })
      if (!result.success) {
        // Ein eigener Abbruch ist keine Fehlermeldung wert.
        if (result.errorCode !== 'cancelled') setError(result.error)
        return null
      }
      const { id, username, displayName } = result.account
      const current = useUIStore.getState().email.accounts
      const existing = current.find(a => a.id === id)
      const entry: Account = {
        // Host/Port/TLS/Benutzer stehen nur zur Anzeige hier — der Main nimmt für
        // Microsoft-Konten seine eigenen Werte und ignoriert diese.
        id,
        name: existing?.name || displayName || username,
        host: 'outlook.office365.com',
        port: 993,
        user: username,
        tls: true,
        smtpHost: '',
        smtpPort: 587,
        smtpTls: true,
        fromAddress: username,
        auth: 'microsoft'
      }
      useUIStore.getState().setEmail({ accounts: existing ? current.map(a => (a.id === id ? entry : a)) : [...current, entry] })
      if (expectedAccountId && expectedAccountId !== id) setNotice('other-account')
      return id
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      return null
    } finally {
      setPending(false)
    }
  }, [])

  const cancel = useCallback(() => { void window.electronAPI.emailMicrosoftCancelLogin() }, [])
  const clearMessages = useCallback(() => { setError(null); setNotice(null) }, [])
  return { pending, error, notice, signIn, cancel, clearMessages }
}

export const MicrosoftAccountCard: React.FC<{
  t: TabTFn
  account: Account
  onRename: (name: string) => void
  onRemoved: () => void
}> = ({ t, account, onRename, onRemoved }) => {
  const [status, setStatus] = useState<MicrosoftMailStatus | null>(null)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const signIn = useMicrosoftSignIn()

  const refresh = useCallback(async () => {
    const result = await window.electronAPI.emailMicrosoftStatus(account.id)
    if (result.success) { setStatus(result.status); setStatusError(null) } else { setStatus(null); setStatusError(result.error) }
  }, [account.id])

  useEffect(() => { void refresh() }, [refresh])

  const signOut = async (): Promise<void> => {
    setBusy(true)
    const result = await window.electronAPI.emailMicrosoftLogout(account.id)
    if (!result.success) setStatusError(result.error)
    await refresh()
    setBusy(false)
  }

  const remove = async (): Promise<void> => {
    setBusy(true)
    // Erst abmelden, damit keine Marke für ein entferntes Konto liegen bleibt.
    const result = await window.electronAPI.emailMicrosoftLogout(account.id)
    setBusy(false)
    if (!result.success) { setStatusError(result.error); return }
    onRemoved()
  }

  const chip = signIn.pending ? { tone: 'checking' as const, label: t('settings.email.ms.waiting') }
    : status === null && !statusError ? { tone: 'checking' as const, label: t('settings.email.ms.statusChecking') }
      : status?.signedIn ? { tone: 'ok' as const, label: t('settings.email.ms.statusReady') }
        : { tone: 'warn' as const, label: t('settings.email.ms.statusSignedOut') }
  const signedIn = !!status?.signedIn

  return (
    <Card>
      <ServiceHead
        icon={MICROSOFT_ICON}
        name={account.name || account.user}
        desc={t('settings.email.ms.kind')}
        status={chip}
        actions={
          <>
            {signIn.pending
              ? <Button onClick={signIn.cancel}>{t('settings.email.ms.cancel')}</Button>
              : (
                <Button
                  variant={signedIn ? 'secondary' : 'primary'}
                  disabled={busy}
                  onClick={() => { void signIn.signIn(account.id).then(() => refresh()) }}
                >
                  {signedIn ? t('settings.email.ms.reSignIn') : t('settings.email.ms.signIn')}
                </Button>
              )}
            {signedIn && !signIn.pending && <Button disabled={busy} onClick={() => void signOut()}>{t('settings.email.ms.signOut')}</Button>}
            <Button variant="link" disabled={busy || signIn.pending} onClick={() => void remove()}>{t('settings.email.removeAccount')}</Button>
          </>
        }
      />
      {signIn.error && <Note tone="warn">{signIn.error}</Note>}
      {signIn.notice === 'other-account' && <Note tone="muted">{t('settings.email.ms.otherAccount')}</Note>}
      {statusError && <Note tone="warn">{statusError}</Note>}
      <Row label={t('settings.email.accountName')}>
        <TextInput value={account.name} onCommit={onRename} placeholder={t('settings.email.accountName')} />
      </Row>
      <Row label={t('settings.email.ms.signedInAs')}>
        <span className="sui-unit">{status?.username || account.user}</span>
      </Row>
      <Row label={t('settings.email.ms.fetch')}>
        <StatusChip tone={status?.fetchReady ? 'ok' : 'off'} label={status?.fetchReady ? t('settings.email.ms.ready') : t('settings.email.ms.notReady')} />
      </Row>
      <Row label={t('settings.email.ms.send')}>
        <StatusChip tone={status?.sendReady ? 'ok' : 'off'} label={status?.sendReady ? t('settings.email.ms.ready') : t('settings.email.ms.notReady')} />
      </Row>
    </Card>
  )
}

/** Zeile „Microsoft-365-Konto“ in der Karte „Konto hinzufügen“. */
export const MicrosoftAddRows: React.FC<{ t: TabTFn }> = ({ t }) => {
  const email = useUIStore(s => s.email)
  const setEmail = useUIStore(s => s.setEmail)
  const signIn = useMicrosoftSignIn()
  return (
    <>
      <Row label={t('settings.email.ms.add')} hint={signIn.pending ? t('settings.email.ms.waiting') : t('settings.email.ms.addHint')}>
        {signIn.pending
          ? <Button onClick={signIn.cancel}>{t('settings.email.ms.cancel')}</Button>
          : <Button variant="primary" onClick={() => void signIn.signIn()}>{t('settings.email.ms.signIn')}</Button>}
      </Row>
      {signIn.error && <Note tone="warn">{signIn.error}</Note>}
      <Details title={t('settings.email.ms.ownApp')}>
        <p>{t('settings.email.ms.ownAppHint')}</p>
        <Row label={t('settings.email.ms.clientId')}>
          <TextInput value={email.microsoftClientId || ''} onCommit={v => setEmail({ microsoftClientId: v.trim() })} placeholder="00000000-0000-0000-0000-000000000000" wide />
        </Row>
        <Row label={t('settings.email.ms.tenant')}>
          <TextInput value={email.microsoftTenant || ''} onCommit={v => setEmail({ microsoftTenant: v.trim() })} placeholder="organizations" wide />
        </Row>
      </Details>
    </>
  )
}
