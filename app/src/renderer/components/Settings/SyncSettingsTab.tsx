// Einstellungen → Synchronisation (Redesign 09/2026): Status-Kopf, Vault-Karte, Ausschlüsse,
// Verwaltung (Protokoll, gelöschte Dateien, erzwingen, deaktivieren). Einrichtung als eigene Karte.

import React, { useState } from 'react'
import { useSyncStore } from '../../stores/syncStore'
import { useNotesStore } from '../../stores/notesStore'
import { writeClipboardText } from '../../utils/clipboard'
import type { TabTFn } from './settingsTypes'
import {
  PageHeader, SectionTitle, Card, Row, Note, Details, Toggle, Segmented, Button, NumberInput, TextInput, Hero,
  RemovableChips, ChipInput, ChipSelect, TILE_GLYPH, SavedMark
} from './SettingsUI'

const DEFAULT_EXTENSIONS = ['.pdf', '.png', '.jpg', '.gif', '.svg', '.webp', '.bmp']

const LOG_ICON: Record<string, React.ReactNode> = {
  upload: <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 11V3M7 3L4 6M7 3L10 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  download: <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 3V11M7 11L4 8M7 11L10 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  conflict: <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 4V8M7 10V10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M1.5 12L7 2L12.5 12H1.5Z" stroke="currentColor" strokeWidth="1.2" fill="none"/></svg>,
  delete: <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 4H11M5 4V3H9V4M5.5 6V10.5M8.5 6V10.5M4 4L4.5 11.5H9.5L10 4" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  error: <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.2"/><path d="M5 5L9 9M9 5L5 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>,
  connect: <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M4.5 7H9.5M3 4.5C3 4.5 2 5.5 2 7S3 9.5 3 9.5M11 4.5C11 4.5 12 5.5 12 7S11 9.5 11 9.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>,
  sync: <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2.5 7.5A4.5 4.5 0 0 1 11 4.5M11.5 6.5A4.5 4.5 0 0 1 3 9.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><path d="M9 3.5L11 4.5L10 6.5M5 10.5L3 9.5L4 7.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
}

export const SyncSettingsTab: React.FC<{ t: TabTFn }> = ({ t }) => {
  const syncState = useSyncStore()
  const vaultPath = useNotesStore(s => s.vaultPath)

  const [syncMode, setSyncMode] = useState<'new' | 'join'>('new')
  const [activationCode, setActivationCode] = useState('')
  const [passphrase, setPassphrase] = useState('')
  const [joinVaultId, setJoinVaultId] = useState('')
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [setupError, setSetupError] = useState<string | null>(null)
  const [deletedFiles, setDeletedFiles] = useState<Array<{ path: string; originalPath: string; size: number; deletedAt: number }>>([])
  const [deletedLoading, setDeletedLoading] = useState(false)
  const [deletedLoaded, setDeletedLoaded] = useState(false)
  const [restored, setRestored] = useState<Set<string>>(new Set())

  const busy = syncState.syncStatus !== 'idle' && syncState.syncStatus !== 'done' && syncState.syncStatus !== 'error'
  const relayHost = syncState.relayUrl.replace(/^wss?:\/\//, '')

  const lastSyncLabel = (() => {
    if (!syncState.lastSyncTime) return t('settings.sync.neverSynced')
    const diff = Math.floor((Date.now() - syncState.lastSyncTime) / 1000)
    if (diff < 60) return t('settings.sync.ago', { time: `${diff} ${t('settings.sync.seconds')}` })
    if (diff < 3600) return t('settings.sync.ago', { time: `${Math.floor(diff / 60)} ${t('settings.sync.minutes')}` })
    return t('settings.sync.ago', { time: `${Math.floor(diff / 3600)} ${t('settings.sync.hours')}` })
  })()

  const loadDeleted = async () => {
    setDeletedLoading(true)
    setRestored(new Set())
    try {
      setDeletedFiles(await window.electronAPI.syncGetDeletedFiles())
      setDeletedLoaded(true)
    } catch { /* ignore */ } finally {
      setDeletedLoading(false)
    }
  }

  if (!syncState.syncEnabled) {
    return (
      <div className="settings-section">
        <PageHeader title={t('settings.sync.title')} subtitle={t('settings.sync.subtitle')} />
        <SectionTitle title={t('settings.sync.groupSetup')} />
        <Card>
          <Row label={t('settings.sync.mode')} hint={syncMode === 'new' ? t('settings.sync.newSyncDesc') : t('settings.sync.joinSyncDesc')}>
            <Segmented
              options={[{ value: 'new' as const, label: t('settings.sync.newSync') }, { value: 'join' as const, label: t('settings.sync.joinSync') }]}
              value={syncMode}
              onChange={setSyncMode}
              ariaLabel={t('settings.sync.mode')}
            />
          </Row>
          {syncMode === 'join' && (
            <Row label={t('settings.sync.vaultId')} hint={t('settings.sync.enterVaultId')}>
              <TextInput value={joinVaultId} onCommit={setJoinVaultId} placeholder="mg-…" />
            </Row>
          )}
          <Row label={t('settings.sync.relayUrl')}>
            <TextInput type="url" value={syncState.relayUrl} onCommit={v => syncState.setRelayUrl(v)} placeholder="wss://sync.example.com" />
          </Row>
          <Row label={t('settings.sync.activationCode')} hint={t('settings.sync.activationCodeHint')}>
            <TextInput value={activationCode} onCommit={setActivationCode} placeholder={t('settings.sync.activationCode')} />
          </Row>
          <Row label={t('settings.sync.passphrase')} hint={t('settings.sync.passphraseHint')}>
            <input
              type="password"
              className="sui-input"
              value={passphrase}
              onChange={e => setPassphrase(e.target.value)}
              placeholder={t('settings.sync.passphrase')}
              autoComplete="new-password"
            />
          </Row>
          <Note tone="warn">{t('settings.sync.passphraseWarning')}</Note>
          {setupError && <Note tone="danger">{setupError}</Note>}
          <Row label={t('settings.sync.activate')}>
            <Button
              variant="primary"
              disabled={!passphrase || !activationCode || !syncState.relayUrl || (syncMode === 'join' && !joinVaultId) || !vaultPath || loading}
              onClick={async () => {
                if (!vaultPath) return
                setLoading(true)
                setSetupError(null)
                try {
                  if (syncMode === 'new') await syncState.initSync(vaultPath, passphrase, activationCode)
                  else await syncState.joinSync(vaultPath, joinVaultId, passphrase, activationCode)
                  setPassphrase(''); setJoinVaultId(''); setActivationCode('')
                } catch (err) {
                  setSetupError(err instanceof Error ? err.message : 'Setup failed')
                } finally {
                  setLoading(false)
                }
              }}
            >
              {loading ? t('settings.sync.status.connecting') : t('settings.sync.activate')}
            </Button>
          </Row>
        </Card>
      </div>
    )
  }

  const customExts = syncState.excludeExtensions.filter(e => !DEFAULT_EXTENSIONS.includes(e))

  return (
    <div className="settings-section">
      <PageHeader title={t('settings.sync.title')} subtitle={t('settings.sync.subtitle')} />

      <Hero
        icon={TILE_GLYPH.cloud}
        title={syncState.syncStatus === 'error' ? t('settings.sync.heroError') : busy ? t('settings.sync.heroSyncing') : t('settings.sync.heroActive')}
        dot={syncState.syncStatus === 'error' ? 'off' : busy ? 'checking' : 'ok'}
        meta={<><b>{syncState.vaultName || vaultPath?.split(/[/\\]/).pop() || 'Vault'}</b> · {t('settings.sync.lastSync')} {lastSyncLabel} · {relayHost}</>}
        actions={<Button variant="primary" disabled={busy} onClick={() => void syncState.triggerSync()}>{t('settings.sync.syncNow')}</Button>}
      />
      {busy && syncState.syncProgress.total > 0 && (
        <p className="sui-hero-note">
          {syncState.syncProgress.fileName && `${syncState.syncProgress.fileName} · `}
          {t('settings.sync.progress', { current: syncState.syncProgress.current, total: syncState.syncProgress.total })}
        </p>
      )}
      {syncState.syncError && (
        <Card>
          <Note
            tone="danger"
            action={syncState.syncError.includes('SAFETY') ? t('settings.sync.forceSync') : undefined}
            onAction={() => void syncState.triggerSync(true)}
          >
            {syncState.syncError}
          </Note>
        </Card>
      )}

      <SectionTitle title={t('settings.sync.groupVault')} />
      <Card>
        <Row label={t('settings.sync.vaultId')} hint={t('settings.sync.vaultIdHint')}>
          <code className="sui-secret-suffix">{syncState.vaultId}</code>
          {copied ? <SavedMark label={t('settings.sync.copied')} /> : (
            <Button variant="link" onClick={() => { writeClipboardText(syncState.vaultId); setCopied(true); setTimeout(() => setCopied(false), 2000) }}>
              {t('settings.sync.copy')}
            </Button>
          )}
        </Row>
        <Row label={t('settings.sync.relayUrl')}>
          <TextInput type="url" value={syncState.relayUrl} onCommit={v => syncState.setRelayUrl(v)} />
        </Row>
        <Row label={t('settings.sync.autoSync')} htmlFor="sync-auto">
          <Toggle id="sync-auto" checked={syncState.autoSync} onChange={syncState.setAutoSync} />
        </Row>
        {syncState.autoSync && (
          <Row label={t('settings.sync.interval')}>
            <NumberInput value={syncState.syncInterval} min={60} max={3600} onCommit={v => syncState.setSyncInterval(v || 300)} unit={t('settings.sync.intervalUnit')} />
          </Row>
        )}
      </Card>

      <SectionTitle title={t('settings.sync.groupExclude')} />
      <Card>
        <Row label={t('settings.sync.excludeFolders')} hint={t('settings.sync.excludeFoldersHint')} stacked>
          <RemovableChips items={syncState.excludeFolders} onRemove={f => syncState.setExcludeFolders(syncState.excludeFolders.filter(x => x !== f))} removeTitle={t('settings.ui.remove')} />
          <div className="sui-pair">
            <ChipInput placeholder={t('settings.sync.addFolder')} onAdd={f => { if (!syncState.excludeFolders.includes(f)) syncState.setExcludeFolders([...syncState.excludeFolders, f]) }} />
          </div>
        </Row>
        <Row label={t('settings.sync.excludeExtensions')} hint={t('settings.sync.excludeExtensionsHint')} stacked>
          <ChipSelect
            options={DEFAULT_EXTENSIONS.map(e => ({ value: e, label: e }))}
            selected={e => syncState.excludeExtensions.includes(e)}
            onToggle={(e, on) => syncState.setExcludeExtensions(on ? [...syncState.excludeExtensions, e] : syncState.excludeExtensions.filter(x => x !== e))}
          />
          <RemovableChips items={customExts} onRemove={e => syncState.setExcludeExtensions(syncState.excludeExtensions.filter(x => x !== e))} removeTitle={t('settings.ui.remove')} />
          <div className="sui-pair">
            <ChipInput
              placeholder={t('settings.sync.addExtension')}
              onAdd={raw => {
                const ext = raw.startsWith('.') ? raw : `.${raw}`
                if (!syncState.excludeExtensions.includes(ext)) syncState.setExcludeExtensions([...syncState.excludeExtensions, ext])
              }}
            />
          </div>
        </Row>
      </Card>

      <SectionTitle title={t('settings.sync.groupManage')} />
      <Card>
        <Details title={`${t('settings.sync.log.title')} · ${t('settings.sync.entries', { n: syncState.syncLog.length })}`} wide>
          {syncState.syncLog.length === 0 ? (
            <p className="sui-autosave">{t('settings.sync.log.empty')}</p>
          ) : (
            <>
              <div className="sui-list">
                {syncState.syncLog.map((entry, i) => (
                  <div key={i} className="sui-list-row">
                    <span className="sui-list-time">{new Date(entry.timestamp).toLocaleTimeString()}</span>
                    <span className={`sui-list-icon is-${entry.type}`}>{LOG_ICON[entry.type === 'disconnect' ? 'connect' : entry.type] ?? null}</span>
                    <span className="sui-list-main">{entry.message}</span>
                  </div>
                ))}
              </div>
              <Button variant="link" onClick={() => syncState.clearSyncLog()}>{t('settings.sync.log.clear')}</Button>
            </>
          )}
        </Details>
        <Row label={t('settings.sync.deleted.title')} hint={t('settings.sync.deleted.hint')}>
          <Button onClick={() => void loadDeleted()} disabled={deletedLoading}>
            {deletedLoading ? t('settings.sync.deleted.loading') : deletedLoaded ? t('settings.sync.deleted.reload') : t('settings.sync.deleted.load')}
          </Button>
        </Row>
        {deletedLoaded && (
          deletedFiles.length === 0 ? <Note tone="muted">{t('settings.sync.deleted.empty')}</Note> : (
            <div className="sui-list">
              {deletedFiles.map(file => {
                const daysAgo = Math.floor((Date.now() / 1000 - file.deletedAt) / 86400)
                const sizeKB = Math.round(file.size / 1024)
                return (
                  <div key={file.path} className="sui-list-row">
                    <span className="sui-list-main">{file.originalPath || file.path}</span>
                    <span className="sui-list-meta">{sizeKB} KB · {t('settings.sync.deleted.daysAgo', { days: daysAgo })}</span>
                    <Button
                      variant="link"
                      disabled={restored.has(file.path)}
                      onClick={async () => {
                        const ok = await window.electronAPI.syncRestoreFile(file.path)
                        if (ok) {
                          setRestored(prev => new Set(prev).add(file.path))
                          setTimeout(() => { void loadDeleted() }, 2000)
                        }
                      }}
                    >
                      {restored.has(file.path) ? t('settings.sync.deleted.restored') : t('settings.sync.deleted.restore')}
                    </Button>
                  </div>
                )
              })}
            </div>
          )
        )}
        <Row label={t('settings.sync.forceSync')} hint={t('settings.sync.forceSyncHint')}>
          <Button disabled={busy} onClick={() => void syncState.triggerSync(true)}>{t('settings.sync.forceSync')}</Button>
        </Row>
        <Row label={t('settings.sync.deactivate')} hint={t('settings.sync.deactivateHint')}>
          <Button danger onClick={() => void syncState.disableSync()}>{t('settings.sync.deactivate')}</Button>
        </Row>
      </Card>
    </div>
  )
}
