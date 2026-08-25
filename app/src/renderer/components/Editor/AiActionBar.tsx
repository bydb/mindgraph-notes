import { useEffect, useMemo, useState } from 'react'
import { useUIStore } from '../../stores/uiStore'
import { useTranslation } from '../../utils/translations'
import { WEB_SEARCH_PROVIDER_META, isWebResearchConfigComplete } from '../../../shared/webResearch'
import { ModelLogo } from '../Shared/ModelLogo'
import { ModelPicker } from '../Shared/ModelPicker'
import { AgentRunPanel, type AgentPreviewResponse } from '../Agent/AgentRunPanel'
import type { AgentRunUiState } from '../../stores/noteAgentStore'
import { HumanIcon } from '../Shared/HumanIcon'
import { ContextAttachmentRow, FolderGlyph } from '../Shared/ContextAttachmentRow'
import { diffStats, type DiffOp } from '../../utils/blockDiff'
import { cloudProviderForSentinel } from '../../../shared/llmBackend'
import { isCloudModel } from '../../../shared/modelCompatibility'
import { useContextVaultFiles } from '../../utils/useContextVaultFiles'
import { useIsModuleEnabled } from '../../utils/modules'
import type { NoteAgentAttachment } from '../../../shared/types'
import { useComposeMeasurement } from '../../utils/activeTimeTracker'

// Notiz-Agent Phase 2 (Modus B): Der Lauf-Zustand liegt im noteAgentStore (ein
// Zustand für Macher-Leiste UND Agent-Tab), dargestellt wird er vom gemeinsamen
// AgentRunPanel. Die Typen kommen von dort — hier nur re-exportiert, damit
// bestehende Importe aus dieser Datei weiter funktionieren.
export type { AgentUiStep, AgentUiResult, AgentUiWeb } from '../../stores/noteAgentStore'
export type { AgentPreviewResponse }

// Macher-Leiste: Anweisung → KI-Vorschlag als Block-Diff → Übernehmen/Verwerfen.
// Eingeklappt = ruhiges Zuhause des ⌘⇧A-Assistenten. Provenienz ist eingewebt:
// im Diff ist das Entfernte „dein Text" (Human-SVG), das Neue von der KI (Modell-Logo).
// Notiz-Agent Phase 1: Kontext-Datei-Chips + Cloud-Hinweis (docs/note-agent-harness-plan.md §1).

export interface AiProposalMeta {
  ops: DiffOp[]
  action: string
  model: string
  date: string
}

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  phase: 'idle' | 'generating' | 'review'
  proposal: AiProposalMeta | null
  onGenerate: (instruction: string, preset: string | null) => void
  onAccept: () => void
  onDiscard: () => void
  // Ambienter Copilot: Tag-Vorschläge (auf Knopf) → bestätigen ins Frontmatter.
  tagSuggestions: string[]
  tagsLoading: boolean
  onSuggestTags: () => void
  onAcceptTag: (tag: string) => void
  onDismissTag: (tag: string) => void
  // Modellwahl für die Umschreibung (lokales Override + optional OpenRouter-Eintrag).
  model: string
  models: Array<{ name: string }>
  onModelChange: (model: string) => void
  // Label-Override fürs Dropdown (z.B. „OpenRouter · <modell>" für den Cloud-Eintrag).
  getModelLabel?: (name: string) => string
  // Notiz-Agent Phase 1: Kontext-Dateien (flüchtig, pro Notiz — Verwaltung im MarkdownEditor).
  attachments: NoteAgentAttachment[]
  onAttachDialog: () => void
  onAttachFolderDialog: () => void
  onAttachVaultFile: (relPath: string) => void
  onDetach: (id: string) => void
  attachError: string | null
  // Notiz-Agent Phase 2 (Modus B): Zielordner = implizite Eskalation zum Agent-Loop.
  targetFolder: string
  onTargetFolderChange: (rel: string | null) => void
  // Lauf-Zustand aus dem noteAgentStore (Protokoll, Ergebnis-Karten, Provenienz).
  agentRun: AgentRunUiState
  onAgentRun: (instruction: string, opts: { webResearch: boolean; instructionMs?: number }) => void
  onAgentCancel: () => void
  onAgentAccept: (resultId: string) => void
  onAgentDiscard: (resultId: string) => void
  // Vorschau der Staging-Datei vor Übernehmen/Verwerfen (read-only).
  onAgentPreview: (resultId: string) => Promise<AgentPreviewResponse>
  onAgentDismiss: () => void
  // Mitlernen (Stufe 3): bestätigter Merksatz → Agent-Gedächtnis-Notiz.
  onRemember: (text: string) => Promise<{ success: boolean; relPath?: string; error?: string }>
}

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

const PRESETS = [
  { id: 'rewrite', key: 'aiBar.preset.rewrite' as const },
  { id: 'shorten', key: 'aiBar.preset.shorten' as const },
  { id: 'structure', key: 'aiBar.preset.structure' as const },
  { id: 'tone', key: 'aiBar.preset.tone' as const },
]

export function AiActionBar({ open, onOpenChange, phase, proposal, onGenerate, onAccept, onDiscard, tagSuggestions, tagsLoading, onSuggestTags, onAcceptTag, onDismissTag, model, models, onModelChange, getModelLabel, attachments, onAttachDialog, onAttachFolderDialog, onAttachVaultFile, onDetach, attachError, targetFolder, onTargetFolderChange, agentRun, onAgentRun, onAgentCancel, onAgentAccept, onAgentDiscard, onAgentPreview, onAgentDismiss, onRemember }: Props) {
  const { t } = useTranslation()
  const agentPhase = agentRun.phase
  const aiEnabled = useUIStore(s => s.ollama.enabled)
  const webResearchModule = useIsModuleEnabled('web-research')
  const webResearchConfig = useUIStore(s => s.webResearchConfig)
  const setWebResearchConfig = useUIStore(s => s.setWebResearchConfig)
  const [webResearchArmed, setWebResearchArmed] = useState(false)
  const [instruction, setInstruction] = useState('')
  const [preset, setPreset] = useState<string | null>(null)
  // Zielordner-Picker (Modus B)
  const vaultEntries = useContextVaultFiles()
  const [targetPickerOpen, setTargetPickerOpen] = useState(false)
  const [targetQuery, setTargetQuery] = useState('')
  const targetMatches = useMemo(() => {
    const q = targetQuery.trim().toLowerCase()
    const folders = vaultEntries.filter(f => f.isFolder)
    const pool = q ? folders.filter(f => f.name.toLowerCase().includes(q) || f.relPath.toLowerCase().includes(q)) : folders
    return pool.slice(0, 8)
  }, [targetQuery, vaultEntries])

  // Cloud-Erkennung nur für den Hinweis (keine Sperre — Entscheidung 7 im Plan):
  // Cloud-Sentinel (OpenRouter/LLMBase) oder gehostetes Ollama-Cloud-Modell (`:cloud`/`-cloud`).
  const cloudSelected = cloudProviderForSentinel(model) !== null || isCloudModel(model)
  const agentMode = !!targetFolder
  const busy = phase === 'generating' || agentPhase === 'running'

  // Config-Spiegel (0d) einmal laden, sobald das Modul aktiv ist — die Leiste braucht Provider
  // + „konfiguriert?" für Tooltip und Warnung (P2-1).
  useEffect(() => {
    if (webResearchModule && !webResearchConfig) {
      window.electronAPI.webResearchLoadConfig()
        .then(c => setWebResearchConfig({ provider: c.provider, searxngUrl: c.searxngUrl, hasTavilyKey: c.hasTavilyKey, hasLinkupKey: c.hasLinkupKey }))
        .catch(() => { /* ignorieren */ })
    }
  }, [webResearchModule, webResearchConfig, setWebResearchConfig])

  // Pro-Lauf-Opt-in NICHT über Läufe/Kontexte hinweg lecken (P1-2): zurücksetzen, sobald die
  // Leiste geschlossen ist, der Agent-Modus verlassen wird oder das Modul aus ist.
  useEffect(() => {
    if (!open || !agentMode || !webResearchModule) setWebResearchArmed(false)
  }, [open, agentMode, webResearchModule])

  const webConfigured = !!webResearchConfig && (
    webResearchConfig.provider === 'tavily' ? webResearchConfig.hasTavilyKey :
    webResearchConfig.provider === 'linkup' ? webResearchConfig.hasLinkupKey :
    isWebResearchConfigComplete({ provider: 'searxng', searxngUrl: webResearchConfig.searxngUrl })
  )
  const webProviderLabel = webResearchConfig ? WEB_SEARCH_PROVIDER_META[webResearchConfig.provider].label : ''

  // Im Agent-Modus haben die Umschreib-Presets keine Wirkung (der Agent-Loop
  // nutzt nur die Anweisung) — sie werden ausgeblendet und eine aktive Auswahl
  // zurückgesetzt, damit kein toter Zustand zurückbleibt.
  useEffect(() => {
    if (agentMode) setPreset(null)
  }, [agentMode])

  if (!aiEnabled) return null

  const closeTargetPicker = () => {
    setTargetPickerOpen(false)
    setTargetQuery('')
  }

  const close = () => {
    onOpenChange(false)
    onDiscard()
    setInstruction('')
    setPreset(null)
    setWebResearchArmed(false)
    closeTargetPicker()
  }

  // Aktive Zeit am Auftrag — dieselbe Messung wie im Agent-Tab.
  const compose = useComposeMeasurement()

  const submit = () => {
    if (busy) return
    // Modus B: Zielordner verknüpft → Agent-Loop statt Block-Diff (implizite Eskalation).
    if (agentMode) {
      if (!instruction.trim()) return
      // webResearch nur, wenn Modul an, scharfgestellt UND konfiguriert — nie „scharf-aber-
      // unkonfiguriert" an den Main geben (der Lauf würde sonst scheitern).
      onAgentRun(instruction.trim(), { webResearch: webResearchModule && webResearchArmed && webConfigured, instructionMs: compose.take() })
      return
    }
    if (!preset && !instruction.trim()) return
    onGenerate(instruction.trim(), preset)
  }

  if (!open) {
    return (
      <button className="ai-bar-collapsed" onClick={() => onOpenChange(true)} title={t('aiBar.hint')}>
        <span className="ai-bar-spark" aria-hidden>✦</span>
        <span className="ai-bar-collapsed-text">{t('aiBar.hint')}</span>
        <kbd className="ai-bar-kbd">⌘⇧A</kbd>
      </button>
    )
  }

  // Review-Phase: Block-Diff + Provenienz + Aktionen
  if (phase === 'review' && proposal) {
    const { added, removed } = diffStats(proposal.ops)
    return (
      <div className="ai-bar-expanded ai-bar-review">
        <div className="ai-bar-review-head">
          <span className="ai-bar-prov ai-bar-prov-human" title={t('aiBar.yourText')}>
            <HumanIcon size={13} /> {t('aiBar.yourText')}
          </span>
          <span className="ai-bar-prov-arrow" aria-hidden>→</span>
          <span className="ai-bar-prov ai-bar-prov-ai" title={proposal.model}>
            <ModelLogo model={proposal.model} size={14} /> {proposal.model}
          </span>
          <span className="ai-bar-review-meta">· {proposal.action}{proposal.date ? ` · ${proposal.date}` : ''}</span>
          <span className="ai-bar-review-stat"><span className="add">+{added}</span> <span className="del">−{removed}</span></span>
        </div>
        <div className="ai-bar-diff" role="region" aria-label={t('aiBar.review')}>
          {proposal.ops.map((op, i) => (
            <div key={i} className={`ai-diff-line ai-diff-${op.type}`}>
              <span className="ai-diff-gutter" aria-hidden>{op.type === 'ins' ? '+' : op.type === 'del' ? '−' : ''}</span>
              <span className="ai-diff-text">{op.text || ' '}</span>
            </div>
          ))}
        </div>
        <div className="ai-bar-footer">
          <button type="button" className="ai-bar-cancel" onClick={() => onGenerate(instruction.trim(), preset)} title={t('aiBar.retry')}>
            {t('aiBar.retry')}
          </button>
          <div className="ai-bar-actions">
            <button type="button" className="ai-bar-cancel" onClick={onDiscard}>{t('aiBar.discard')}</button>
            <button type="button" className="ai-bar-send" onClick={onAccept}>{t('aiBar.accept')}</button>
          </div>
        </div>
      </div>
    )
  }

  // Idle / Generating: Presets + Eingabe.
  // Im Agent-Modus sind die Umschreib-Presets ausgeblendet — sie wirken dort nicht.
  return (
    <div className="ai-bar-expanded">
      {!agentMode && (
        <div className="ai-bar-presets">
          {PRESETS.map(p => (
            <button
              key={p.id}
              type="button"
              className={`ai-bar-preset ${preset === p.id ? 'active' : ''}`}
              onClick={() => setPreset(preset === p.id ? null : p.id)}
              disabled={phase === 'generating'}
            >
              {t(p.key)}
            </button>
          ))}
        </div>
      )}
      <textarea
        className="ai-bar-input"
        placeholder={t('aiBar.placeholder')}
        value={instruction}
        onChange={e => { compose.noteTyping(); setInstruction(e.target.value) }}
        rows={2}
        autoFocus
        disabled={phase === 'generating'}
        onKeyDown={e => {
          if (e.key === 'Escape') close()
          else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit() }
        }}
      />

      {/* Notiz-Agent: EINE ruhige Zeile — Kontext-Button, Chips, Ziel-Button (Phase 2).
          Zielordner verknüpft = Agent-Loop mit Datei-Outputs; Erklärung im Tooltip. */}
      <ContextAttachmentRow
        attachments={attachments}
        onAttachDialog={onAttachDialog}
        onAttachFolderDialog={onAttachFolderDialog}
        onAttachVaultFile={onAttachVaultFile}
        onDetach={onDetach}
        disabled={busy}
        attachError={attachError}
        cloudSelected={cloudSelected && !agentMode}
        extra={
          <>
            <div className="ai-bar-context-picker-wrap">
              <button
                type="button"
                className={`ai-bar-context-btn ${targetFolder ? 'active' : ''}`}
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
                        onClick={() => { onTargetFolderChange(f.relPath); closeTargetPicker() }}
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
            {targetFolder && (
              <span className="ai-bar-chip ai-bar-context-chip ai-bar-target-chip">
                <span className="ai-bar-context-chip-name" title={targetFolder}>
                  <FolderGlyph /> {targetFolder.split('/').pop()}
                </span>
                <button type="button" className="ai-bar-chip-x" onClick={() => onTargetFolderChange(null)} disabled={busy} aria-label={t('aiBar.target.remove')}>×</button>
              </span>
            )}
            {/* Webrecherche pro Lauf scharfstellen (Globus). NUR im Agent-Modus sichtbar
                (Zielordner gesetzt). Nicht konfiguriert → NICHT scharfstellen, sondern in die
                Einstellungen springen („Jetzt einrichten"); sonst würde der Lauf im Main scheitern. */}
            {webResearchModule && agentMode && (
              <button
                type="button"
                className={`ai-bar-context-btn ai-bar-web-btn ${webResearchArmed ? 'active' : ''}`}
                onClick={() => {
                  if (!webConfigured) {
                    window.dispatchEvent(new CustomEvent('mindgraph:openSettings', {
                      detail: { tab: 'ai', anchor: 'ai-webresearch' }
                    }))
                    return
                  }
                  setWebResearchArmed(v => !v)
                }}
                disabled={busy}
                title={webResearchArmed
                  ? t('aiBar.web.armed')
                  : webConfigured
                    ? `${t('aiBar.web.hint')} (${webProviderLabel})`
                    : t('aiBar.web.setup')}
                aria-pressed={webResearchArmed}
              >
                <GlobeGlyph /> {t('aiBar.web.label')}
              </button>
            )}
          </>
        }
      />

      {/* Sichtbarer Moduswechsel: der Zielordner eskaliert die Leiste vom Block-Diff
          zum Agent-Loop mit Datei-Outputs — das darf nicht nur im Tooltip stehen. */}
      {agentMode && (
        <div className="ai-bar-agent-mode-hint">
          {t('aiBar.agent.modeHintBefore')}<strong>{targetFolder.split('/').pop()}</strong>{t('aiBar.agent.modeHintAfter')}
        </div>
      )}

      {/* Modus B + Cloud: ehrlicher Hinweis — auch vom Agenten GELESENE Notizen gehen
          im Verlauf an den Anbieter, nicht nur die Anhänge (Entscheidung 7). */}
      {agentMode && cloudSelected && (
        <div className="ai-bar-cloud-hint">{t('aiBar.agent.cloudHint')}</div>
      )}
      {/* Webrecherche scharf: ehrlicher Datenfluss-Hinweis; bei Cloud-LLM beide Flüsse.
          Nicht konfiguriert → klare Warnung VOR dem Lauf (statt erst im Main zu scheitern). */}
      {agentMode && webResearchArmed && (
        <div className="ai-bar-cloud-hint">
          {!webConfigured
            ? t('aiBar.web.notConfigured')
            : cloudSelected ? t('aiBar.web.cloudFlowHint') : t('aiBar.web.flowHint')}
        </div>
      )}

      {/* Agent-Lauf: Protokoll, Ergebnis-Karten, Merken — geteilt mit dem Agent-Tab */}
      <AgentRunPanel
        run={agentRun}
        onCancel={onAgentCancel}
        onAccept={onAgentAccept}
        onDiscard={onAgentDiscard}
        onPreview={onAgentPreview}
        onDismiss={onAgentDismiss}
        onRemember={onRemember}
      />

      <div className="ai-bar-footer">
        <div className="ai-bar-model-pick" title={t('aiBar.model')}>
          <ModelPicker
            value={model}
            models={models}
            onChange={onModelChange}
            getLabel={getModelLabel}
            ariaLabel={t('aiBar.model')}
            maxWidth={260}
          />
        </div>
        <div className="ai-bar-actions">
          <button type="button" className="ai-bar-cancel" onClick={close}>{t('aiBar.cancel')}</button>
          <button
            type="button"
            className="ai-bar-send"
            onClick={submit}
            disabled={busy || (agentMode ? !instruction.trim() : (!preset && !instruction.trim()))}
          >
            {phase === 'generating' ? t('aiBar.generating') : agentPhase === 'running' ? t('aiBar.agent.working') : agentMode ? t('aiBar.agent.run') : t('aiBar.send')}
          </button>
        </div>
      </div>

      {/* Ambienter Copilot: Tag-Vorschläge auf Knopf → bestätigen ins Frontmatter */}
      <div className="ai-bar-suggest">
        <button type="button" className="ai-bar-suggest-btn" onClick={onSuggestTags} disabled={tagsLoading || phase === 'generating'}>
          <span className="ai-bar-spark" aria-hidden>✦</span>
          {tagsLoading ? t('aiBar.tagsLoading') : t('aiBar.suggestTags')}
        </button>
        {tagSuggestions.length > 0 && (
          <div className="ai-bar-chips">
            {tagSuggestions.map(tag => (
              <span key={tag} className="ai-bar-chip">
                <button type="button" className="ai-bar-chip-add" onClick={() => onAcceptTag(tag)} title={t('aiBar.addTag')}>+ #{tag}</button>
                <button type="button" className="ai-bar-chip-x" onClick={() => onDismissTag(tag)} aria-label={t('aiBar.discard')}>×</button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
