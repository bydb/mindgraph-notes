// Einstellungen → E-Mail: Microsoft-365-Konten.
//
// Die Anmeldung läuft im Main (main/email/microsoftAuth.ts) und im Systembrowser.
// Hier kommen nur Kontoname und Zustand an, nie eine Zugangsmarke. Ein Microsoft-Konto
// hat keine Server-, Port- oder Passwortfelder: die Verbindungsdaten legt der Main fest.
// Plan: docs/codex-collab/microsoft-365-anbindung.md, Abschnitt 4.

import React, { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { useUIStore } from '../../stores/uiStore'
import type { MicrosoftMailStatus } from '../../../shared/types'
import type { TabTFn } from './settingsTypes'
import { isMicrosoftAccountId } from '../../../shared/emailAccountKind'
import { Card, ServiceHead, IconTile, Row, Note, Details, Button, TextInput, StatusChip } from './SettingsUI'

type Account = ReturnType<typeof useUIStore.getState>['email']['accounts'][number]

const MICROSOFT_ICON = (
  <IconTile bg="#0f6cbd">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 6-10 7L2 6" />
    </svg>
  </IconTile>
)

// Der Main lässt immer nur EINE Anmeldung zu; eine zweite gibt die erste auf. Deshalb gibt es
// auch in der Oberfläche nur einen Anmeldezustand für alle Karten und die Hinzufügen-Zeile:
// Solange eine Anmeldung läuft, sind die übrigen Anmeldeknöpfe gesperrt, und „Abbrechen“ steht
// nur dort, wo sie gestartet wurde (Codex F19).
let activeSignIn: string | null = null
const signInListeners = new Set<() => void>()
const setActiveSignIn = (owner: string | null): void => { activeSignIn = owner; signInListeners.forEach(fn => fn()) }
const subscribeSignIn = (fn: () => void): (() => void) => { signInListeners.add(fn); return () => { signInListeners.delete(fn) } }

/** Schlüssel der Hinzufügen-Zeile im gemeinsamen Anmeldezustand. */
const ADD_ROW = '(neu)'

/**
 * Anmeldung auslösen und das Konto in die Einstellungen übernehmen.
 * `owner` ist die Karte (Konto-ID) oder die Hinzufügen-Zeile. Eine Karte verlangt genau ihr
 * Konto: meldet sich jemand mit einem anderen an, bindet der Main nichts (Codex F18).
 */
export function useMicrosoftSignIn(owner: string): {
  pending: boolean
  /** Eine Anmeldung läuft an anderer Stelle der Seite. */
  busyElsewhere: boolean
  error: string | null
  errorCode: string | null
  signIn: () => Promise<string | null>
  cancel: () => void
  clearMessages: () => void
} {
  const active = useSyncExternalStore(subscribeSignIn, () => activeSignIn)
  const [error, setError] = useState<string | null>(null)
  const [errorCode, setErrorCode] = useState<string | null>(null)

  const signIn = useCallback(async (): Promise<string | null> => {
    if (activeSignIn !== null) return null
    setActiveSignIn(owner)
    setError(null)
    setErrorCode(null)
    try {
      const { email } = useUIStore.getState()
      const result = await window.electronAPI.emailMicrosoftLogin({
        clientId: email.microsoftClientId,
        tenant: email.microsoftTenant,
        // Nur eine Konto-Karte verlangt genau ihr Konto; Hinzufügen-Zeile und Onboarding nehmen jedes.
        expectedAccountId: isMicrosoftAccountId(owner) ? owner : undefined
      })
      if (!result.success) {
        // Ein eigener Abbruch ist keine Fehlermeldung wert.
        if (result.errorCode !== 'cancelled') { setError(result.error); setErrorCode(result.errorCode) }
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
      return id
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      return null
    } finally {
      setActiveSignIn(null)
    }
  }, [owner])

  const cancel = useCallback(() => {
    // Nur die eigene Anmeldung abbrechen — der IPC-Aufruf trifft sonst die eines anderen Knopfs.
    if (activeSignIn === owner) void window.electronAPI.emailMicrosoftCancelLogin()
  }, [owner])
  const clearMessages = useCallback(() => { setError(null); setErrorCode(null) }, [])
  return { pending: active === owner, busyElsewhere: active !== null && active !== owner, error, errorCode, signIn, cancel, clearMessages }
}

/**
 * Ausweg bei unlesbarer Ablage (Codex F16): verschiebt die gespeicherten Microsoft-Anmeldungen
 * dieses Geräts unverändert in einen Sicherungsordner. Danach braucht jedes Microsoft-Konto eine
 * neue Anmeldung; die Konten in den Einstellungen bleiben stehen.
 */
const StorageResetNote: React.FC<{ t: TabTFn; onDone: () => void }> = ({ t, onDone }) => {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  return (
    <Note
      tone="warn"
      action={t('settings.email.ms.reset')}
      actionDisabled={busy}
      onAction={() => {
        setBusy(true)
        void window.electronAPI.emailMicrosoftResetStorage().then(result => {
          setBusy(false)
          if (result.success) { setFailed(null); onDone() } else setFailed(result.error)
        })
      }}
    >
      {failed || t('settings.email.ms.resetHint')}
    </Note>
  )
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
  const [storageUnreadable, setStorageUnreadable] = useState(false)
  const signIn = useMicrosoftSignIn(account.id)

  const refresh = useCallback(async () => {
    const result = await window.electronAPI.emailMicrosoftStatus(account.id)
    if (result.success) { setStatus(result.status); setStatusError(null) } else { setStatus(null); setStatusError(result.error) }
    setStorageUnreadable(result.success ? result.status.errorCode === 'storage-unreadable' : result.errorCode === 'storage-unreadable')
  }, [account.id])

  useEffect(() => { void refresh() }, [refresh])

  const signOut = async (): Promise<void> => {
    setBusy(true)
    const result = await window.electronAPI.emailMicrosoftLogout(account.id)
    await refresh()
    // Nach refresh setzen: die Abmeldung kann gelungen und nur das Aufräumen gescheitert sein.
    if (!result.success) setStatusError(result.error)
    setBusy(false)
  }

  const remove = async (): Promise<void> => {
    setBusy(true)
    // Erst abmelden, damit keine Marke für ein entferntes Konto liegen bleibt.
    const result = await window.electronAPI.emailMicrosoftLogout(account.id)
    setBusy(false)
    if (!result.success) {
      setStatusError(result.error)
      if (result.errorCode === 'storage-unreadable') setStorageUnreadable(true)
      return
    }
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
                  disabled={busy || signIn.busyElsewhere || storageUnreadable}
                  onClick={() => { void signIn.signIn().then(() => refresh()) }}
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
      {storageUnreadable
        ? <StorageResetNote t={t} onDone={() => { signIn.clearMessages(); void refresh() }} />
        : statusError && <Note tone="warn">{statusError}</Note>}
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
  const signIn = useMicrosoftSignIn(ADD_ROW)
  return (
    <>
      <Row label={t('settings.email.ms.add')} hint={signIn.pending ? t('settings.email.ms.waiting') : t('settings.email.ms.addHint')}>
        {signIn.pending
          ? <Button onClick={signIn.cancel}>{t('settings.email.ms.cancel')}</Button>
          : <Button variant="primary" disabled={signIn.busyElsewhere} onClick={() => void signIn.signIn()}>{t('settings.email.ms.signIn')}</Button>}
      </Row>
      {signIn.errorCode === 'storage-unreadable'
        ? <StorageResetNote t={t} onDone={signIn.clearMessages} />
        : signIn.error && <Note tone="warn">{signIn.error}</Note>}
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
