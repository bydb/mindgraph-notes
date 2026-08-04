// Agent-Tab: der Notiz-Agent ohne offene Notiz.
//
// Anlass: Ordner-Aufträge („werte die Rückmeldungen aller Schulen aus") haben keine
// Ausgangsnotiz. Bis hierher wohnte der Agent ausschließlich in der Macher-Leiste
// unter dem Editor — ohne geöffnete Datei war er nicht erreichbar.
//
// Zustand und IPC liegen im noteAgentStore (Bereich = Tab-ID), die Lauf-Anzeige ist
// dieselbe wie in der Macher-Leiste (AgentRunPanel).

import { useEffect, useMemo, useState } from 'react'
import { useUIStore } from '../../stores/uiStore'
import { useNotesStore } from '../../stores/notesStore'
import { useTranslation } from '../../utils/translations'
import { ContextAttachmentRow, FolderGlyph } from '../Shared/ContextAttachmentRow'
import { ModelPicker } from '../Shared/ModelPicker'
import { AgentRunPanel } from './AgentRunPanel'
import { useContextVaultFiles } from '../../utils/useContextVaultFiles'
import { useIsModuleEnabled } from '../../utils/modules'
import { useNoteAgentStore, EMPTY_AGENT_SCOPE } from '../../stores/noteAgentStore'
import { cloudRoutesForFeature, cloudProviderForSentinel, type CloudProviderId } from '../../../shared/llmBackend'
import { isCloudModel } from '../../../shared/modelCompatibility'
import { WEB_SEARCH_PROVIDER_META, isWebResearchConfigComplete } from '../../../shared/webResearch'

// Globus-Icon für den Webrecherche-Toggle (SVG, kein Emoji).
function GlobeGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3c2.5 2.5 3.8 5.7 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.7-3.8-9S9.5 5.5 12 3z" />
    </svg>
  )
}

interface Props {
  /** Tab-ID — zugleich der Bereich im noteAgentStore. */
  tabId: string
}

export function AgentView({ tabId }: Props) {
  const { t } = useTranslation()
  const vaultPath = useNotesStore(s => s.vaultPath)
  const ollama = useUIStore(s => s.ollama)
  const webResearchModule = useIsModuleEnabled('web-research')
  const webResearchConfig = useUIStore(s => s.webResearchConfig)
  const setWebResearchConfig = useUIStore(s => s.setWebResearchConfig)

  const scope = useNoteAgentStore(s => s.scopes[tabId] ?? EMPTY_AGENT_SCOPE)
  const run = scope.run

  const [instruction, setInstruction] = useState('')
  const [models, setModels] = useState<Array<{ name: string }>>([])
  const [localModel, setLocalModel] = useState('')
  const [webArmed, setWebArmed] = useState(false)

  // Cloud-Routing: hier zählt ausschließlich das 'note-agent'-Opt-in — der Tab kann
  // nichts anderes als Agent-Läufe starten.
  const agentRoutes = useMemo(() => cloudRoutesForFeature('note-agent', ollama), [ollama])
  const [cloudProvider, setCloudProvider] = useState<CloudProviderId | null>(null)
  const activeCloudRoute = cloudProvider ? (agentRoutes.find(r => r.provider === cloudProvider) ?? null) : null

  // Modell-Präzedenz wie in der Macher-Leiste (CLAUDE.md): Auswahl im Tab →
  // Modul-Override → globales Modell.
  const effectiveModel = localModel || ollama.moduleModelOverrides?.['note-agent'] || ollama.selectedModel
  const pickerValue = activeCloudRoute ? activeCloudRoute.sentinel : effectiveModel
  const cloudSelected = cloudProviderForSentinel(pickerValue) !== null || isCloudModel(pickerValue)

  useEffect(() => {
    if (!ollama.enabled || models.length > 0) return
    let cancelled = false
    ;(async () => {
      try {
        const list = ollama.backend === 'lm-studio'
          ? await window.electronAPI.lmstudioModels(ollama.lmStudioPort)
          : await window.electronAPI.ollamaModels()
        if (!cancelled && Array.isArray(list)) setModels(list)
      } catch (e) {
        console.error('[Agent-Tab] Modell-Liste laden fehlgeschlagen:', e)
      }
    })()
    return () => { cancelled = true }
  }, [ollama.enabled, ollama.backend, ollama.lmStudioPort, models.length])

  useEffect(() => {
    if (webResearchModule && !webResearchConfig) {
      window.electronAPI.webResearchLoadConfig()
        .then(c => setWebResearchConfig({ provider: c.provider, searxngUrl: c.searxngUrl, hasTavilyKey: c.hasTavilyKey, hasLinkupKey: c.hasLinkupKey }))
        .catch(() => { /* ignorieren */ })
    }
  }, [webResearchModule, webResearchConfig, setWebResearchConfig])

  const webConfigured = !!webResearchConfig && (
    webResearchConfig.provider === 'tavily' ? webResearchConfig.hasTavilyKey :
    webResearchConfig.provider === 'linkup' ? webResearchConfig.hasLinkupKey :
    isWebResearchConfigComplete({ provider: 'searxng', searxngUrl: webResearchConfig.searxngUrl })
  )
  const webProviderLabel = webResearchConfig ? WEB_SEARCH_PROVIDER_META[webResearchConfig.provider].label : ''

  // Zielordner-Picker
  const vaultEntries = useContextVaultFiles()
  const [targetPickerOpen, setTargetPickerOpen] = useState(false)
  const [targetQuery, setTargetQuery] = useState('')
  const targetMatches = useMemo(() => {
    const q = targetQuery.trim().toLowerCase()
    const folders = vaultEntries.filter(f => f.isFolder)
    const pool = q ? folders.filter(f => f.name.toLowerCase().includes(q) || f.relPath.toLowerCase().includes(q)) : folders
    return pool.slice(0, 8)
  }, [targetQuery, vaultEntries])
  const closeTargetPicker = () => {
    setTargetPickerOpen(false)
    setTargetQuery('')
  }

  const store = useNoteAgentStore.getState
  const busy = run.phase === 'running'
  const canRun = !!vaultPath && !!scope.targetFolder && !!instruction.trim() && !busy

  const submit = async () => {
    if (!canRun || !vaultPath) return
    let cloud: { model: string; provider: CloudProviderId } | null = null
    let cloudLabel: string | null = null
    if (activeCloudRoute) {
      cloud = { model: activeCloudRoute.model, provider: activeCloudRoute.provider }
      cloudLabel = activeCloudRoute.label
    }
    await store().startRun(tabId, {
      vaultPath,
      // Der Lauf hat keine Ausgangsnotiz — die Tab-ID ist die Kennung, der Inhalt leer.
      noteId: tabId,
      noteContent: '',
      instruction: instruction.trim(),
      model: effectiveModel,
      localBackend: ollama.backend === 'lm-studio' ? 'lmstudio' : 'ollama',
      lmStudioPort: ollama.lmStudioPort,
      cloud,
      cloudLabel,
      webResearch: webResearchModule && webArmed && webConfigured
    })
  }

  if (!ollama.enabled) {
    return (
      <div className="agent-view">
        <div className="agent-view-inner">
          <div className="agent-view-empty">{t('agentTab.aiDisabled')}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="agent-view">
      <div className="agent-view-inner">
        <div className="agent-view-head">
          <h2 className="agent-view-title">{t('agentTab.title')}</h2>
          <p className="agent-view-sub">{t('agentTab.subtitle')}</p>
        </div>

        <textarea
          className="ai-bar-input agent-view-input"
          placeholder={t('agentTab.placeholder')}
          value={instruction}
          onChange={e => setInstruction(e.target.value)}
          rows={4}
          disabled={busy}
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void submit() }
          }}
        />

        <ContextAttachmentRow
          attachments={scope.attachments}
          onAttachDialog={() => void store().attachFromDialog(tabId)}
          onAttachFolderDialog={() => void store().attachFolderFromDialog(tabId)}
          onAttachVaultFile={rel => { if (vaultPath) void store().attachVaultPath(tabId, vaultPath, rel) }}
          onDetach={id => void store().detach(tabId, id)}
          disabled={busy}
          attachError={scope.attachError}
          cloudSelected={false}
          extra={
            <>
              <div className="ai-bar-context-picker-wrap">
                <button
                  type="button"
                  className={`ai-bar-context-btn ${scope.targetFolder ? 'active' : ''}`}
                  onClick={() => (targetPickerOpen ? closeTargetPicker() : setTargetPickerOpen(true))}
                  disabled={busy}
                  title={t('aiBar.target.hint')}
                  aria-expanded={targetPickerOpen}
                >
                  <FolderGlyph /> {t('aiBar.target.label')}
                </button>
                {targetPickerOpen && (
                  <div className="ai-bar-context-picker">
                    <input
                      autoFocus
                      className="ai-bar-context-search"
                      placeholder={t('aiBar.target.searchPlaceholder')}
                      value={targetQuery}
                      onChange={e => setTargetQuery(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); closeTargetPicker() } }}
                    />
                    <div className="ai-bar-context-results">
                      {targetMatches.map(f => (
                        <button
                          key={f.relPath}
                          type="button"
                          className="ai-bar-context-result"
                          onClick={() => { store().setTargetFolder(tabId, f.relPath); closeTargetPicker() }}
                          title={f.relPath}
                        >
                          <span className="ai-bar-context-result-name">{f.name}</span>
                          <span className="ai-bar-context-result-path">{f.relPath}</span>
                        </button>
                      ))}
                      {targetMatches.length === 0 && (
                        <div className="ai-bar-context-empty">{t('aiBar.context.noResults')}</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
              {scope.targetFolder && (
                <span className="ai-bar-chip ai-bar-context-chip ai-bar-target-chip">
                  <span className="ai-bar-context-chip-name" title={scope.targetFolder}>
                    <FolderGlyph /> {scope.targetFolder.split('/').pop()}
                  </span>
                  <button type="button" className="ai-bar-chip-x" onClick={() => store().setTargetFolder(tabId, null)} disabled={busy} aria-label={t('aiBar.target.remove')}>×</button>
                </span>
              )}
              {webResearchModule && (
                <button
                  type="button"
                  className={`ai-bar-context-btn ai-bar-web-btn ${webArmed ? 'active' : ''}`}
                  onClick={() => {
                    if (!webConfigured) {
                      window.dispatchEvent(new CustomEvent('mindgraph:openSettings', { detail: { tab: 'ai', anchor: 'ai-webresearch' } }))
                      return
                    }
                    setWebArmed(v => !v)
                  }}
                  disabled={busy}
                  title={webArmed ? t('aiBar.web.armed') : webConfigured ? `${t('aiBar.web.hint')} (${webProviderLabel})` : t('aiBar.web.setup')}
                  aria-pressed={webArmed}
                >
                  <GlobeGlyph /> {t('aiBar.web.label')}
                </button>
              )}
            </>
          }
        />

        {/* Ohne Zielordner kann der Agent nichts ablegen — das ist die Vorbedingung,
            nicht nur eine Empfehlung. */}
        {!scope.targetFolder && <div className="ai-bar-agent-mode-hint">{t('agentTab.needTarget')}</div>}
        {scope.targetFolder && cloudSelected && <div className="ai-bar-cloud-hint">{t('aiBar.agent.cloudHint')}</div>}
        {webArmed && (
          <div className="ai-bar-cloud-hint">
            {!webConfigured ? t('aiBar.web.notConfigured') : cloudSelected ? t('aiBar.web.cloudFlowHint') : t('aiBar.web.flowHint')}
          </div>
        )}

        <AgentRunPanel
          run={run}
          onCancel={() => store().cancelRun(tabId)}
          onAccept={id => void store().acceptResult(tabId, id)}
          onDiscard={id => void store().discardResult(tabId, id)}
          onPreview={id => store().previewResult(tabId, id)}
          onDismiss={() => store().dismissRun(tabId)}
          onRemember={async text => {
            if (!vaultPath) return { success: false, error: 'Kein Vault geöffnet' }
            return window.electronAPI.noteAgentRemember(vaultPath, text)
          }}
        />

        <div className="ai-bar-footer agent-view-footer">
          <div className="ai-bar-model-pick" title={t('aiBar.model')}>
            <ModelPicker
              value={pickerValue}
              models={[...agentRoutes.map(r => ({ name: r.sentinel })), ...models]}
              onChange={name => {
                const provider = cloudProviderForSentinel(name)
                if (provider) setCloudProvider(provider)
                else { setCloudProvider(null); setLocalModel(name) }
              }}
              getLabel={name => agentRoutes.find(r => r.sentinel === name)?.label ?? name}
              ariaLabel={t('aiBar.model')}
              maxWidth={260}
            />
          </div>
          <div className="ai-bar-actions">
            <button type="button" className="ai-bar-send" onClick={() => void submit()} disabled={!canRun}>
              {busy ? t('aiBar.agent.working') : t('aiBar.agent.run')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
