// Rückfrage nach der Referenzzeit eines Skills auf der Ergebniskarte (Zeitbilanz B).
//
// Die Antwort wird zur Referenz des SKILLS, nicht dieses einen Laufs: Eine Einzelschätzung je
// Lauf wäre nie mit etwas vergleichbar; die Skill-Referenz gilt für alle Läufe des Skills
// und steht mit ihrer Stichprobe auf der Bilanzkarte. Gefragt wird nur, solange der Skill
// noch keine Referenz hat — danach steht die Zahl in Einstellungen → Allgemein → Zeitbilanz.

import { useEffect, useState } from 'react'
import { useUIStore, saveImpactNow } from '../../stores/uiStore'
import { useTranslation } from '../../utils/translations'
import { MAX_SKILL_REFERENCE_MINUTES } from '../../../shared/activityLog'
import { skillReferencePromptCandidates } from '../../utils/skillReferencePrompt'
import type { AgentRunUiState } from '../../stores/noteAgentStore'

export function SkillReferencePrompt({ run }: { run: AgentRunUiState }) {
  const { t } = useTranslation()
  const skillReferences = useUIStore(s => s.impact.skillReferences)
  const dismissed = useUIStore(s => s.impact.skillReferenceDismissed)
  const setSkillReference = useUIStore(s => s.setSkillReference)
  const dismissPrompt = useUIStore(s => s.dismissSkillReferencePrompt)
  const [picked, setPicked] = useState('')
  const [minutes, setMinutes] = useState('')
  const [invalid, setInvalid] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)
  // Bestätigung gehört zum Lauf, in dem gespeichert wurde. Sie hängt am Store-Wert, nicht an
  // einem Zeitgeber: steht die Referenz im Store, bleibt die Zeile stehen (F10).
  const [savedFor, setSavedFor] = useState<{ runId: string | null; id: string; label: string } | null>(null)

  useEffect(() => {
    setPicked('')
    setMinutes('')
    setInvalid(false)
    setSaveFailed(false)
  }, [run.runId])

  const candidates = skillReferencePromptCandidates(run, skillReferences, dismissed)
  const saved = savedFor && savedFor.runId === run.runId ? skillReferences?.[savedFor.id] : undefined
  if (savedFor && savedFor.runId === run.runId && saved) {
    return (
      <div className="ai-bar-agent-remember-saved">
        &#10003; {t('aiBar.agent.skillRef.saved', { skill: savedFor.label, minutes: saved.minutes })}
      </div>
    )
  }
  if (candidates.length === 0) return null
  const skill = candidates.find(c => c.id === picked) ?? candidates[0]

  const submit = async () => {
    if (saving) return
    const n = Math.round(Number(minutes))
    if (!Number.isFinite(n) || n < 1 || n > MAX_SKILL_REFERENCE_MINUTES) { setInvalid(true); return }
    const vorher = useUIStore.getState().impact.skillReferences?.[skill.id]
    setSkillReference(skill.id, n, skill.label, run.vaultKey)
    setSaving(true)
    setSaveFailed(false)
    // Erst nach geglücktem Schreiben bestätigen (F16). Scheitert es, Store zurücksetzen und
    // die Eingabe stehen lassen — sonst gälte die Referenz bis zum Neustart und wäre dann weg.
    const ok = await saveImpactNow()
    setSaving(false)
    if (ok) {
      setSavedFor({ runId: run.runId, id: skill.id, label: skill.label })
    } else {
      setSkillReference(skill.id, vorher?.minutes ?? null, vorher?.label, vorher?.vault)
      setSaveFailed(true)
    }
  }

  return (
    <div className="ai-bar-agent-skillref">
      <div className="ai-bar-agent-skillref-question">{t('aiBar.agent.skillRef.question')}</div>
      <div className="ai-bar-agent-remember">
        {candidates.length > 1 && (
          <select
            className="ai-bar-context-search ai-bar-agent-skillref-pick"
            aria-label={t('aiBar.agent.skillRef.pick')}
            value={skill.id}
            onChange={e => setPicked(e.target.value)}
          >
            {candidates.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        )}
        <input
          type="number"
          className="ai-bar-context-search ai-bar-agent-skillref-minutes"
          min={1}
          max={MAX_SKILL_REFERENCE_MINUTES}
          step={15}
          value={minutes}
          placeholder="min"
          onChange={e => { setMinutes(e.target.value); setInvalid(false) }}
          onKeyDown={e => { if (e.key === 'Enter') void submit() }}
        />
        <span className="ai-bar-agent-skillref-unit">min</span>
        <button type="button" className="ai-bar-cancel" onClick={() => dismissPrompt(skill.id)}>{t('aiBar.agent.skillRef.never')}</button>
        <button type="button" className="ai-bar-send" onClick={() => void submit()} disabled={minutes.trim() === '' || saving}>{t('aiBar.agent.skillRef.save')}</button>
      </div>
      <div className="ai-bar-agent-skillref-hint">{t('aiBar.agent.skillRef.hint', { skill: skill.label })}</div>
      {invalid && <div className="ai-bar-context-error">{t('aiBar.agent.skillRef.invalid', { max: MAX_SKILL_REFERENCE_MINUTES })}</div>}
      {saveFailed && <div className="ai-bar-context-error">{t('aiBar.agent.skillRef.saveFailed')}</div>}
    </div>
  )
}
