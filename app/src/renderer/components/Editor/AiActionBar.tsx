import { useState } from 'react'
import { useUIStore } from '../../stores/uiStore'
import { useTranslation } from '../../utils/translations'
import { ModelLogo } from '../Shared/ModelLogo'
import { ModelPicker } from '../Shared/ModelPicker'
import { HumanIcon } from '../Shared/HumanIcon'
import { diffStats, type DiffOp } from '../../utils/blockDiff'

// Macher-Leiste: Anweisung → KI-Vorschlag als Block-Diff → Übernehmen/Verwerfen.
// Eingeklappt = ruhiges Zuhause des ⌘⇧A-Assistenten. Provenienz ist eingewebt:
// im Diff ist das Entfernte „dein Text" (Human-SVG), das Neue von der KI (Modell-Logo).

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
  // Modellwahl für die Umschreibung (lokales Override).
  model: string
  models: Array<{ name: string }>
  onModelChange: (model: string) => void
}

const PRESETS = [
  { id: 'rewrite', key: 'aiBar.preset.rewrite' as const },
  { id: 'shorten', key: 'aiBar.preset.shorten' as const },
  { id: 'structure', key: 'aiBar.preset.structure' as const },
  { id: 'tone', key: 'aiBar.preset.tone' as const },
]

export function AiActionBar({ open, onOpenChange, phase, proposal, onGenerate, onAccept, onDiscard, tagSuggestions, tagsLoading, onSuggestTags, onAcceptTag, onDismissTag, model, models, onModelChange }: Props) {
  const { t } = useTranslation()
  const aiEnabled = useUIStore(s => s.ollama.enabled)
  const [instruction, setInstruction] = useState('')
  const [preset, setPreset] = useState<string | null>(null)

  if (!aiEnabled) return null

  const close = () => {
    onOpenChange(false)
    onDiscard()
    setInstruction('')
    setPreset(null)
  }

  const submit = () => {
    if (phase === 'generating') return
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
      <div className="ai-bar-footer">
        <div className="ai-bar-model-pick" title={t('aiBar.model')}>
          <ModelPicker
            value={model}
            models={models}
            onChange={onModelChange}
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
            disabled={phase === 'generating' || (!preset && !instruction.trim())}
          >
            {phase === 'generating' ? t('aiBar.generating') : t('aiBar.send')}
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
