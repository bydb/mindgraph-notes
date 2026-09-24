import { useCallback, useEffect, useRef, useState } from 'react'
import { useNotesStore } from '../../stores/notesStore'
import { useTranslation } from '../../utils/translations'
import { Row, Note, Toggle, Button, RemovableChips, ChipInput, Details } from './SettingsUI'
import type { VaultRagStatusDto, VaultBuildProgressDto } from '../../../shared/types'

/**
 * Vault-Index (Phase 1): Opt-in pro Vault, Umfang vor dem ersten Aufbau, Fortschritt
 * mit Pause/Abbrechen, Ausschlussordner. Alle Zustände kommen aus dem Main; diese
 * Karte hält nur Anzeige und Aktionen (Vault-Chat-Plan Rev. 3, Entscheidung 1).
 */

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function formatDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  const m = Math.floor(s / 60)
  const h = Math.floor(m / 60)
  if (h > 0) return `${h} h ${m % 60} min`
  if (m > 0) return `${m} min ${s % 60} s`
  return `${s} s`
}

export function VaultIndexSection() {
  const { t, language } = useTranslation()
  const vaultPath = useNotesStore((s) => s.vaultPath)
  const [status, setStatus] = useState<VaultRagStatusDto | null>(null)
  const [estimate, setEstimate] = useState<{ files: number; bytes: number; chunksApprox: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const progressRef = useRef<VaultBuildProgressDto | null>(null)
  const [, force] = useState(0)

  const refresh = useCallback(async () => {
    if (!vaultPath) return
    const res = await window.electronAPI.vaultRagStatus(vaultPath)
    if (res.success && res.status) {
      setStatus(res.status)
      // Kein laufender Build im Status → alter Fortschritt verschwindet (F38).
      progressRef.current = res.status.build
      setError(null)
    } else if (res.error) {
      setError(res.error)
    }
  }, [vaultPath])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!vaultPath) return
    const off = window.electronAPI.onVaultRagProgress((p) => {
      // Nur Ereignisse des eigenen Vaults — ein Lauf des vorherigen Vaults darf hier nichts zeigen (F38).
      if (p.vaultPath !== vaultPath) return
      progressRef.current = p
      force((n) => n + 1)
      if (p.phase === 'done' || p.phase === 'error' || p.phase === 'cancelled') void refresh()
    })
    return off
  }, [vaultPath, refresh])

  const setConfig = useCallback(
    async (patch: { enabled?: boolean; excludeFolders?: string[] }) => {
      if (!vaultPath) return
      setBusy(true)
      try {
        const res = await window.electronAPI.vaultRagConfigSet(vaultPath, patch)
        if (!res.success) setError(res.error ?? 'Fehler')
        await refresh()
      } finally {
        setBusy(false)
      }
    },
    [vaultPath, refresh]
  )

  const loadEstimate = useCallback(async () => {
    if (!vaultPath) return
    setBusy(true)
    try {
      const res = await window.electronAPI.vaultRagEstimate(vaultPath)
      if (res.success && res.estimate) setEstimate(res.estimate)
      else if (res.error) setError(res.error)
    } finally {
      setBusy(false)
    }
  }, [vaultPath])

  const startBuild = useCallback(async () => {
    if (!vaultPath) return
    setBusy(true)
    setError(null)
    try {
      const res = await window.electronAPI.vaultRagBuild(vaultPath)
      if (!res.success) setError(res.error ?? 'Fehler')
      await refresh()
    } finally {
      setBusy(false)
    }
  }, [vaultPath, refresh])

  const control = useCallback(
    async (action: 'pause' | 'resume' | 'cancel') => {
      if (!vaultPath) return
      const res = await window.electronAPI.vaultRagBuildControl(vaultPath, action)
      if (!res.success && res.error) setError(res.error)
      await refresh()
    },
    [vaultPath, refresh]
  )

  if (!vaultPath || !status) return null

  const config = status.config
  const progress = progressRef.current
  const running = !!progress && !['done', 'error', 'cancelled'].includes(progress.phase)
  const de = language === 'de'

  const phaseLabel = (p: VaultBuildProgressDto): string => {
    if (p.paused === 'user') return t('settings.vaultIndex.pausedUser')
    if (p.paused === 'foreground') return t('settings.vaultIndex.pausedForeground')
    switch (p.phase) {
      // Vorbereitung kann lange dauern (Embedding-Modell laden): die Meldung aus dem Main zeigen.
      case 'preparing': return p.message || t('settings.vaultIndex.phasePreparing')
      case 'scanning': return t('settings.vaultIndex.phaseScanning')
      case 'embedding': return t('settings.vaultIndex.phaseEmbedding')
      case 'writing': return t('settings.vaultIndex.phaseWriting')
      case 'done': return t('settings.vaultIndex.phaseDone')
      case 'cancelled': return t('settings.vaultIndex.phaseCancelled')
      case 'error': return t('settings.vaultIndex.phaseError')
    }
  }

  return (
    <>
      <Row label={t('settings.vaultIndex.enable')} hint={t('settings.vaultIndex.enableHint')}>
        <Toggle checked={config.enabled} onChange={(v) => void setConfig({ enabled: v })} disabled={busy} ariaLabel={t('settings.vaultIndex.enable')} />
      </Row>

      {config.enabled && (
        <>
          <Row label={t('settings.vaultIndex.model')} hint={t('settings.vaultIndex.modelHint')}>
            <span className="sui-autosave">{status.embedModel}</span>
          </Row>

          {status.index.exists && <Note tone="ok">{t('settings.vaultIndex.whereToUse')}</Note>}
          {status.index.exists ? (
            <Row label={t('settings.vaultIndex.state')}>
              <span className="sui-autosave">
                {t('settings.vaultIndex.stateLine', {
                  chunks: status.index.chunkCount,
                  files: status.index.fileCount,
                  size: formatBytes(status.index.bytes),
                  date: status.index.createdAt ? new Date(status.index.createdAt).toLocaleString(de ? 'de-DE' : 'en-US') : '–'
                })}
              </span>
            </Row>
          ) : (
            <Note tone="muted">{t('settings.vaultIndex.noIndex')}</Note>
          )}

          {status.index.exists && status.index.policyOutdated && !running && (
            <Note tone="warn" action={t('settings.vaultIndex.rebuild')} onAction={() => void startBuild()} actionDisabled={busy}>
              {t('settings.vaultIndex.policyOutdated')}
            </Note>
          )}

          {status.index.exists && status.index.excludeMismatch && !running && (
            <Note tone="warn" action={t('settings.vaultIndex.rebuild')} onAction={() => void startBuild()} actionDisabled={busy}>
              {t('settings.vaultIndex.excludeMismatch')}
            </Note>
          )}

          {status.index.exists && status.index.model && status.index.model.split(':')[0] !== status.embedModel.split(':')[0] && !running && (
            <Note tone="warn" action={t('settings.vaultIndex.rebuild')} onAction={() => void startBuild()} actionDisabled={busy}>
              {t('settings.vaultIndex.modelMismatch', { indexModel: status.index.model, model: status.embedModel })}
            </Note>
          )}

          {!running && (
            <Row label={t('settings.vaultIndex.build')} hint={estimate
              ? t('settings.vaultIndex.estimateLine', { files: estimate.files, size: formatBytes(estimate.bytes), chunks: estimate.chunksApprox })
              : t('settings.vaultIndex.estimateHint')}>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button onClick={() => void loadEstimate()} disabled={busy}>{t('settings.vaultIndex.estimate')}</Button>
                <Button variant="primary" onClick={() => void startBuild()} disabled={busy}>
                  {status.index.exists ? t('settings.vaultIndex.rebuild') : t('settings.vaultIndex.create')}
                </Button>
              </div>
            </Row>
          )}

          {progress && (
            <Row label={t('settings.vaultIndex.progress')} stacked>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <span>{phaseLabel(progress)}</span>
                  <span className="sui-autosave">
                    {t('settings.vaultIndex.progressLine', {
                      filesDone: progress.filesDone,
                      filesTotal: progress.filesTotal,
                      embedded: progress.chunksEmbedded,
                      reused: progress.chunksReused
                    })}
                    {progress.etaMs !== null && running ? ` · ${t('settings.vaultIndex.eta', { eta: formatDuration(progress.etaMs) })}` : ''}
                  </span>
                </div>
                <progress
                  value={progress.filesTotal > 0 ? progress.filesDone : undefined}
                  max={progress.filesTotal > 0 ? progress.filesTotal : undefined}
                  style={{ width: '100%' }}
                />
                {progress.error && <Note tone="danger">{progress.error}</Note>}
                {running && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    {progress.paused === 'user'
                      ? <Button onClick={() => void control('resume')}>{t('settings.vaultIndex.resume')}</Button>
                      : <Button onClick={() => void control('pause')}>{t('settings.vaultIndex.pause')}</Button>}
                    <Button danger onClick={() => void control('cancel')}>{t('settings.vaultIndex.cancel')}</Button>
                  </div>
                )}
              </div>
            </Row>
          )}

          {status.pendingChanges > 0 && !running && (
            <Note tone="muted">{t('settings.vaultIndex.pending', { n: status.pendingChanges })}</Note>
          )}
          {status.lastReconcile && status.lastReconcile.status !== 'skipped' && (
            <Note tone={status.lastReconcile.status === 'needs-rebuild' || status.lastReconcile.status === 'error' ? 'warn' : 'muted'}>
              {t(`settings.vaultIndex.reconcile.${status.lastReconcile.status}` as 'settings.vaultIndex.reconcile.unchanged', {
                when: new Date(status.lastReconcile.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                n: status.lastReconcile.changed ?? 0,
                files: status.lastReconcile.filesScanned ?? 0
              })}
            </Note>
          )}

          <Details title={t('settings.vaultIndex.excludeTitle')}>
            <p className="sui-hint">{t('settings.vaultIndex.excludeHint')}</p>
            <RemovableChips
              items={config.excludeFolders}
              onRemove={(item) => void setConfig({ excludeFolders: config.excludeFolders.filter((f) => f !== item) })}
              removeTitle={t('settings.vaultIndex.excludeRemove')}
              empty={t('settings.vaultIndex.excludeEmpty')}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <ChipInput
                placeholder={t('settings.vaultIndex.excludePlaceholder')}
                onAdd={(v) => {
                  const next = v.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
                  if (next && !config.excludeFolders.includes(next)) void setConfig({ excludeFolders: [...config.excludeFolders, next] })
                }}
                disabled={busy || running}
              />
            </div>
          </Details>

          <Note tone="muted">{t('settings.vaultIndex.pauseNote')}</Note>
        </>
      )}

      {error && <Note tone="danger" action={t('settings.integ.recheck')} onAction={() => void refresh()}>{error}</Note>}
    </>
  )
}
