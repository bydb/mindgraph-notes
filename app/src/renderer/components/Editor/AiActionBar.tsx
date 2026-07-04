import { useMemo, useState } from 'react'
import { useUIStore } from '../../stores/uiStore'
import { useTranslation } from '../../utils/translations'
import { ModelLogo } from '../Shared/ModelLogo'
import { ModelPicker } from '../Shared/ModelPicker'
import { HumanIcon } from '../Shared/HumanIcon'
import { ContextAttachmentRow, FolderGlyph } from '../Shared/ContextAttachmentRow'
import { diffStats, type DiffOp } from '../../utils/blockDiff'
import { OPENROUTER_MODEL_SENTINEL } from '../../../shared/llmBackend'
import { isCloudModel } from '../../../shared/modelCompatibility'
import { useContextVaultFiles } from '../../utils/useContextVaultFiles'
import type { NoteAgentAttachment } from '../../../shared/types'

// Notiz-Agent Phase 2 (Modus B): UI-Zustand eines Agent-Laufs — verwaltet im
// MarkdownEditor (pro Notiz gekeyt), hier nur dargestellt.
export interface AgentUiStep {
  seq: number
  skill: string
  summary: string
}

export interface AgentUiResult {
  resultId: string
  suggestedName: string
  kind: string
  summary: string
  sources: string[]
  state: 'pending' | 'accepted' | 'discarded'
  finalName?: string
  error?: string
}

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
  agentPhase: 'idle' | 'running' | 'review'
  agentSteps: AgentUiStep[]
  agentResults: AgentUiResult[]
  agentFinalText: string
  onAgentRun: (instruction: string) => void
  onAgentCancel: () => void
  onAgentAccept: (resultId: string) => void
  onAgentDiscard: (resultId: string) => void
  onAgentDismiss: () => void
  // Mitlernen (Stufe 3): bestätigter Merksatz → Agent-Gedächtnis-Notiz. true = gespeichert.
  onRemember: (text: string) => Promise<boolean>
}

const PRESETS = [
  { id: 'rewrite', key: 'aiBar.preset.rewrite' as const },
  { id: 'shorten', key: 'aiBar.preset.shorten' as const },
  { id: 'structure', key: 'aiBar.preset.structure' as const },
  { id: 'tone', key: 'aiBar.preset.tone' as const },
]

export function AiActionBar({ open, onOpenChange, phase, proposal, onGenerate, onAccept, onDiscard, tagSuggestions, tagsLoading, onSuggestTags, onAcceptTag, onDismissTag, model, models, onModelChange, getModelLabel, attachments, onAttachDialog, onAttachFolderDialog, onAttachVaultFile, onDetach, attachError, targetFolder, onTargetFolderChange, agentPhase, agentSteps, agentResults, agentFinalText, onAgentRun, onAgentCancel, onAgentAccept, onAgentDiscard, onAgentDismiss, onRemember }: Props) {
  const { t } = useTranslation()
  const aiEnabled = useUIStore(s => s.ollama.enabled)
  const [instruction, setInstruction] = useState('')
  const [preset, setPreset] = useState<string | null>(null)
  // Mitlernen (Stufe 3): Merksatz-Eingabe in der Review-Phase.
  const [rememberText, setRememberText] = useState('')
  const [rememberSaved, setRememberSaved] = useState(false)

  const submitRemember = async () => {
    if (!rememberText.trim()) return
    const ok = await onRemember(rememberText.trim())
    if (ok) {
      setRememberText('')
      setRememberSaved(true)
      setTimeout(() => setRememberSaved(false), 3000)
    }
  }
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
  // OpenRouter-Sentinel oder gehostetes Ollama-Cloud-Modell (`:cloud`/`-cloud`).
  const cloudSelected = model === OPENROUTER_MODEL_SENTINEL || isCloudModel(model)
  const agentMode = !!targetFolder
  const busy = phase === 'generating' || agentPhase === 'running'

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
    closeTargetPicker()
  }

  const submit = () => {
    if (busy) return
    // Modus B: Zielordner verknüpft → Agent-Loop statt Block-Diff (implizite Eskalation).
    if (agentMode) {
      if (!instruction.trim()) return
      onAgentRun(instruction.trim())
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

  // Idle / Generating: Presets + Eingabe
  return (
    <div className="ai-bar-expanded">
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
      <textarea
        className="ai-bar-input"
        placeholder={t('aiBar.placeholder')}
        value={instruction}
        onChange={e => setInstruction(e.target.value)}
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
          </>
        }
      />

      {/* Modus B + Cloud: ehrlicher Hinweis — auch vom Agenten GELESENE Notizen gehen
          im Verlauf an den Anbieter, nicht nur die Anhänge (Entscheidung 7). */}
      {agentMode && cloudSelected && (
        <div className="ai-bar-cloud-hint">{t('aiBar.agent.cloudHint')}</div>
      )}

      {/* Agent-Lauf: Protokoll + Abbrechen + Ergebnis-Karten */}
      {agentPhase !== 'idle' && (
        <div className="ai-bar-agent">
          {agentSteps.length > 0 && (
            <div className="ai-bar-agent-steps">
              {agentSteps.map(s => (
                <div key={s.seq} className="ai-bar-agent-step">{s.seq}. {s.skill}{s.summary ? ` — ${s.summary}` : ''}</div>
              ))}
            </div>
          )}
          {agentPhase === 'running' && (
            <div className="ai-bar-agent-row">
              <span className="ai-bar-agent-working">{t('aiBar.agent.working')}</span>
              <button type="button" className="ai-bar-cancel" onClick={onAgentCancel}>{t('aiBar.cancel')}</button>
            </div>
          )}
          {agentPhase === 'review' && (
            <>
              {agentFinalText && <div className="ai-bar-agent-text">{agentFinalText}</div>}
              {agentResults.map(r => (
                <div key={r.resultId} className="ai-bar-agent-card">
                  <div className="ai-bar-agent-card-head">
                    <span className="ai-bar-agent-card-name" title={r.suggestedName}>{r.suggestedName}</span>
                    <span className="ai-bar-agent-card-meta">{r.summary}</span>
                  </div>
                  {r.sources.length > 0 && (
                    <div className="ai-bar-agent-card-sources">{t('aiBar.agent.sources')}: {r.sources.join(', ')}</div>
                  )}
                  {r.state === 'pending' ? (
                    <div className="ai-bar-agent-card-actions">
                      <button type="button" className="ai-bar-cancel" onClick={() => onAgentDiscard(r.resultId)}>{t('aiBar.discard')}</button>
                      <button type="button" className="ai-bar-send" onClick={() => onAgentAccept(r.resultId)}>{t('aiBar.agent.accept')}</button>
                    </div>
                  ) : (
                    <div className="ai-bar-agent-card-state">
                      {r.state === 'accepted' ? `${t('aiBar.agent.accepted')}: ${r.finalName || r.suggestedName}` : t('aiBar.agent.discardedState')}
                    </div>
                  )}
                  {r.error && <div className="ai-bar-context-error">{r.error}</div>}
                </div>
              ))}
              {/* Mitlernen (Stufe 3): bestätigter Merksatz → Agent-Gedächtnis-Notiz */}
              <div className="ai-bar-agent-remember">
                <input
                  className="ai-bar-context-search"
                  placeholder={t('aiBar.agent.rememberPlaceholder')}
                  value={rememberText}
                  onChange={e => setRememberText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') void submitRemember() }}
                />
                <button type="button" className="ai-bar-cancel" onClick={() => void submitRemember()} disabled={!rememberText.trim()}>
                  {rememberSaved ? t('aiBar.agent.remembered') : t('aiBar.agent.remember')}
                </button>
              </div>
              <div className="ai-bar-agent-row">
                <span />
                <button type="button" className="ai-bar-cancel" onClick={onAgentDismiss}>{t('aiBar.agent.close')}</button>
              </div>
            </>
          )}
        </div>
      )}

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
