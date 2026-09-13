// Verbindungszustand der externen Dienste (Zotero, OpenAlex, Docling, Vision OCR,
// LanguageTool, Readwise) — EINE Quelle für den Integrations-Tab UND die Status-Zeilen
// im Modul-Tab. Vorher lag der Zustand als 18 useState-Zeilen in Settings.tsx und war
// nur im Integrations-Tab sichtbar; der Modul-Tab wusste nichts vom Verbindungszustand.
//
// `active` steuert, wann geprüft wird: beim Öffnen eines der beiden Tabs einmal alle
// Dienste, danach nur noch auf Knopfdruck oder nach einer Änderung (URL, Key).

import { useCallback, useEffect, useState } from 'react'
import { useUIStore } from '../../stores/uiStore'
import { useNotesStore, createNoteFromFile } from '../../stores/notesStore'
import { useTranslation } from '../../utils/translations'

export type ConnState = 'checking' | 'connected' | 'disconnected'

export interface ReadwiseSyncProgress { current: number; total: number; status: string; title?: string }

export function useIntegrationStatus(active: boolean) {
  const { t } = useTranslation()
  const vaultPath = useNotesStore(s => s.vaultPath)
  const docling = useUIStore(s => s.docling)
  const languageTool = useUIStore(s => s.languageTool)
  const readwise = useUIStore(s => s.readwise)
  const setReadwise = useUIStore(s => s.setReadwise)

  const [zotero, setZotero] = useState<ConnState>('checking')
  const [openAlex, setOpenAlex] = useState<ConnState>('checking')
  const [openAlexMessage, setOpenAlexMessage] = useState<string | null>(null)
  const [openAlexKeySuffix, setOpenAlexKeySuffix] = useState<string | null>(null)
  const [openAlexKeySaved, setOpenAlexKeySaved] = useState(false)
  const [openAlexMailtoSaved, setOpenAlexMailtoSaved] = useState<string | null>(null)
  const [doclingState, setDoclingState] = useState<ConnState>('checking')
  const [doclingVersion, setDoclingVersion] = useState('')
  const [visionOcrModels, setVisionOcrModels] = useState<Array<{ name: string; size: number }>>([])
  const [languageToolState, setLanguageToolState] = useState<ConnState>('checking')
  const [readwiseState, setReadwiseState] = useState<ConnState>('checking')
  const [readwiseSyncing, setReadwiseSyncing] = useState(false)
  const [readwiseSyncProgress, setReadwiseSyncProgress] = useState<ReadwiseSyncProgress | null>(null)
  const [readwiseSyncResult, setReadwiseSyncResult] = useState<string | null>(null)

  const checkZotero = useCallback(async () => {
    setZotero('checking')
    try {
      const ok = await window.electronAPI.zoteroCheck()
      setZotero(ok ? 'connected' : 'disconnected')
    } catch {
      setZotero('disconnected')
    }
  }, [])

  const checkOpenAlex = useCallback(async () => {
    setOpenAlex('checking')
    setOpenAlexMessage(null)
    try {
      const result = await window.electronAPI.openAlexCheck()
      setOpenAlex(result.available ? 'connected' : 'disconnected')
      if (result.available) {
        setOpenAlexMessage(result.authenticated
          ? t('settings.integrations.openAlexConnectedWithKey')
          : t('settings.integrations.openAlexConnectedDemo'))
      } else {
        setOpenAlexMessage(result.error || t('settings.notConnected'))
      }
    } catch {
      setOpenAlex('disconnected')
      setOpenAlexMessage(t('settings.notConnected'))
    }
  }, [t])

  const loadOpenAlexSecrets = useCallback(() => {
    window.electronAPI.openAlexLoadKey().then(key => {
      setOpenAlexKeySaved(Boolean(key))
      setOpenAlexKeySuffix(key ? key.slice(-4) : null)
    }).catch(() => {})
    window.electronAPI.openAlexLoadMailto().then(mailto => {
      setOpenAlexMailtoSaved(mailto || null)
    }).catch(() => {})
  }, [])

  const saveOpenAlexKey = useCallback(async (key: string) => {
    const result = await window.electronAPI.openAlexSaveKey(key)
    if (result.success) {
      setOpenAlexKeySaved(true)
      setOpenAlexKeySuffix(key.slice(-4))
      setOpenAlexMessage(t('settings.integrations.openAlexSaved'))
      await checkOpenAlex()
    } else {
      setOpenAlex('disconnected')
      setOpenAlexMessage(result.error || t('settings.integrations.openAlexSaveFailed'))
    }
  }, [t, checkOpenAlex])

  const deleteOpenAlexKey = useCallback(async () => {
    await window.electronAPI.openAlexDeleteKey()
    setOpenAlexKeySaved(false)
    setOpenAlexKeySuffix(null)
    setOpenAlexMessage(t('settings.integrations.openAlexDeleted'))
    await checkOpenAlex()
  }, [t, checkOpenAlex])

  const saveOpenAlexMailto = useCallback(async (mailto: string) => {
    if (!mailto) {
      await window.electronAPI.openAlexDeleteMailto()
      setOpenAlexMailtoSaved(null)
      setOpenAlexMessage(t('settings.integrations.openAlexMailtoDeleted'))
      await checkOpenAlex()
      return
    }
    const result = await window.electronAPI.openAlexSaveMailto(mailto)
    if (result.success) {
      setOpenAlexMailtoSaved(mailto)
      setOpenAlexMessage(t('settings.integrations.openAlexMailtoSaved'))
      await checkOpenAlex()
    } else {
      setOpenAlexMessage(result.error || t('settings.integrations.openAlexMailtoSaveFailed'))
    }
  }, [t, checkOpenAlex])

  const checkDocling = useCallback(async (url?: string) => {
    setDoclingState('checking')
    try {
      const result = await window.electronAPI.doclingCheck(url ?? docling.url)
      setDoclingState(result.available ? 'connected' : 'disconnected')
      if (result.version) setDoclingVersion(result.version)
    } catch {
      setDoclingState('disconnected')
    }
  }, [docling.url])

  const loadVisionOcrModels = useCallback(() => {
    window.electronAPI.visionOcrModels().then(setVisionOcrModels).catch(() => {})
  }, [])

  const checkLanguageTool = useCallback(async () => {
    setLanguageToolState('checking')
    try {
      const mode = languageTool.mode || 'local'
      const result = await window.electronAPI.languagetoolCheck(
        mode,
        mode === 'local' ? languageTool.url : undefined,
        mode === 'api' ? languageTool.apiKey : undefined
      )
      setLanguageToolState(result.available ? 'connected' : 'disconnected')
    } catch {
      setLanguageToolState('disconnected')
    }
  }, [languageTool.mode, languageTool.url, languageTool.apiKey])

  const checkReadwise = useCallback(async (apiKey?: string) => {
    const key = apiKey ?? readwise.apiKey
    if (!key) {
      setReadwiseState('disconnected')
      return
    }
    setReadwiseState('checking')
    try {
      const result = await window.electronAPI.readwiseCheck(key)
      setReadwiseState(result.available ? 'connected' : 'disconnected')
    } catch {
      setReadwiseState('disconnected')
    }
  }, [readwise.apiKey])

  const triggerReadwiseSync = useCallback(async () => {
    if (!readwise.apiKey || !vaultPath || readwiseSyncing) return
    setReadwiseSyncing(true)
    setReadwiseSyncResult(null)
    setReadwiseSyncProgress(null)
    window.electronAPI.onReadwiseSyncProgress(progress => setReadwiseSyncProgress(progress))
    try {
      const result = await window.electronAPI.readwiseSync(
        readwise.apiKey,
        readwise.syncFolder,
        vaultPath,
        readwise.lastSyncedAt || undefined,
        readwise.syncCategories
      )
      if (result.success && result.stats) {
        setReadwise({ lastSyncedAt: new Date().toISOString() })
        setReadwiseSyncResult(
          t('settings.readwise.syncStats')
            .replace('{new}', String(result.stats.new))
            .replace('{updated}', String(result.stats.updated))
            .replace('{total}', String(result.stats.total))
        )
        // FileTree neu laden und synced Dateien in den NotesStore aufnehmen
        if ((result.stats.new > 0 || result.stats.updated > 0) && result.syncedFiles && result.syncedFiles.length > 0) {
          try {
            const newTree = await window.electronAPI.readDirectory(vaultPath)
            useNotesStore.getState().setFileTree(newTree)
            const contents = await window.electronAPI.readFilesBatch(vaultPath, result.syncedFiles)
            for (const relativePath of result.syncedFiles) {
              const content = contents[relativePath]
              if (!content) continue
              const note = await createNoteFromFile(`${vaultPath}/${relativePath}`, relativePath, content)
              useNotesStore.getState().addNote(note)
            }
            console.log(`[Readwise] ${result.syncedFiles.length} Notizen in Store geladen`)
          } catch (e) {
            console.error('[Readwise] Store-Update failed:', e)
          }
        }
      } else {
        setReadwiseSyncResult(`Fehler: ${result.error}`)
      }
    } catch (error) {
      setReadwiseSyncResult(`Fehler: ${error instanceof Error ? error.message : 'Unbekannt'}`)
    } finally {
      setReadwiseSyncing(false)
    }
  }, [readwise.apiKey, readwise.syncFolder, readwise.lastSyncedAt, readwise.syncCategories, vaultPath, readwiseSyncing, setReadwise, t])

  const checkAll = useCallback(() => {
    void checkZotero()
    void checkOpenAlex()
    loadOpenAlexSecrets()
    void checkDocling()
    loadVisionOcrModels()
    void checkLanguageTool()
    void checkReadwise()
  }, [checkZotero, checkOpenAlex, loadOpenAlexSecrets, checkDocling, loadVisionOcrModels, checkLanguageTool, checkReadwise])

  // Einmal beim Aktivwerden prüfen — nicht bei jedem Render, sonst hämmert jede
  // Tastatureingabe in einem URL-Feld gegen den Server.
  useEffect(() => {
    if (active) checkAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  return {
    zotero, checkZotero,
    openAlex, openAlexMessage, openAlexKeySaved, openAlexKeySuffix, openAlexMailtoSaved,
    checkOpenAlex, saveOpenAlexKey, deleteOpenAlexKey, saveOpenAlexMailto,
    docling: doclingState, doclingVersion, checkDocling,
    visionOcrModels, loadVisionOcrModels,
    languageTool: languageToolState, checkLanguageTool,
    readwise: readwiseState, checkReadwise,
    readwiseSyncing, readwiseSyncProgress, readwiseSyncResult, triggerReadwiseSync,
    checkAll
  }
}

export type IntegrationStatus = ReturnType<typeof useIntegrationStatus>
