import { useCallback, useEffect, useState } from 'react'
import { useNotesStore } from '../../stores/notesStore'
import { useTranslation } from '../../utils/translations'
import { generateNoteId } from '../../utils/linkExtractor'
import type { NoteAgentSkill } from '../../../shared/types'

// Agent-Skills Stufe 1 (docs/agent-skills-plan.md): Vault-Skills verwalten.
// Skills sind Markdown-Notizen (Skills/<ordner>/SKILL.md, agentskills.io-Format) —
// „Bearbeiten" öffnet die Datei im ganz normalen Editor. Aktivierung liegt in
// vault-settings.json, die SKILL.md bleibt spec-rein und in Fremd-Tools nutzbar.

interface Props {
  onClose: () => void
}

export function SkillsSection({ onClose }: Props) {
  const { t } = useTranslation()
  const { vaultPath, addNote, selectNote } = useNotesStore()
  const [skills, setSkills] = useState<NoteAgentSkill[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [installStatus, setInstallStatus] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!vaultPath) return
    setLoading(true)
    const res = await window.electronAPI.noteSkillsList(vaultPath)
    setSkills(res.skills)
    setError(res.error || null)
    setLoading(false)
  }, [vaultPath])

  useEffect(() => {
    void reload()
  }, [reload])

  const toggleSkill = async (skill: NoteAgentSkill) => {
    if (!vaultPath) return
    const res = await window.electronAPI.noteSkillsSetEnabled(vaultPath, skill.folderName, !skill.enabled)
    if (res.success) {
      setSkills(prev => prev.map(s => (s.folderName === skill.folderName ? { ...s, enabled: !skill.enabled } : s)))
    } else {
      setError(res.error || null)
    }
  }

  // SKILL.md als normale Notiz öffnen (Muster: PDFViewer „Mit KI bearbeiten").
  const openSkill = async (relPath: string) => {
    if (!vaultPath) return
    try {
      const fullPath = `${vaultPath}/${relPath}`
      const content = await window.electronAPI.readFile(fullPath)
      const stats = await window.electronAPI.getFileStats(fullPath)
      const { extractLinks, extractTags, extractTitle, extractHeadings, extractBlocks } = await import('../../utils/linkExtractor')
      const noteId = generateNoteId(relPath)
      addNote({
        id: noteId,
        path: relPath,
        title: extractTitle(content, relPath.split('/').pop() || ''),
        content,
        outgoingLinks: extractLinks(content),
        incomingLinks: [],
        tags: extractTags(content),
        headings: extractHeadings(content),
        blocks: extractBlocks(content),
        createdAt: stats.createdAt,
        modifiedAt: stats.modifiedAt
      })
      selectNote(noteId)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const createNewSkill = async () => {
    if (!vaultPath || !newName.trim()) return
    setError(null)
    const res = await window.electronAPI.noteSkillsCreate(vaultPath, newName.trim())
    if (!res.success || !res.relPath) {
      setError(res.error || 'Anlegen fehlgeschlagen')
      return
    }
    setNewName('')
    await reload()
    await openSkill(res.relPath)
  }

  const installStarter = async () => {
    if (!vaultPath) return
    setError(null)
    setInstallStatus(null)
    const res = await window.electronAPI.noteSkillsInstallStarter(vaultPath)
    if (!res.success) {
      setError(res.error || 'Installation fehlgeschlagen')
      return
    }
    setInstallStatus(
      res.installed.length > 0
        ? `${t('settings.skills.installed')}: ${res.installed.join(', ')}`
        : t('settings.skills.installedNone')
    )
    await reload()
  }

  return (
    <div className="settings-section">
      <h3>{t('settings.skills.title')}</h3>
      <p className="settings-hint">{t('settings.skills.intro')}</p>

      {loading ? (
        <p className="settings-hint">…</p>
      ) : skills.length === 0 ? (
        <p className="settings-hint">{t('settings.skills.empty')}</p>
      ) : (
        skills.map(skill => (
          <div key={skill.folderName} className="settings-row" style={{ alignItems: 'flex-start' }}>
            <label style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontWeight: 500 }}>{skill.name}</span>
              {skill.description && (
                <span style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  {skill.description}
                </span>
              )}
              <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginTop: 2, fontFamily: 'var(--font-mono, monospace)' }}>
                {skill.relPath}
              </span>
            </label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
              <button type="button" className="settings-btn-secondary" onClick={() => void openSkill(skill.relPath)}>
                {t('settings.skills.edit')}
              </button>
              <input
                type="checkbox"
                checked={skill.enabled}
                onChange={() => void toggleSkill(skill)}
                title={skill.enabled ? t('settings.skills.disable') : t('settings.skills.enable')}
              />
            </div>
          </div>
        ))
      )}

      <div className="settings-divider" />

      <div className="settings-row">
        <label>{t('settings.skills.new')}</label>
        <div className="settings-input-group">
          <input
            className="settings-input"
            value={newName}
            placeholder={t('settings.skills.newPlaceholder')}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') void createNewSkill() }}
          />
          <button type="button" className="settings-btn" onClick={() => void createNewSkill()} disabled={!newName.trim()}>
            {t('settings.skills.create')}
          </button>
        </div>
      </div>

      <div className="settings-row">
        <label>
          {t('settings.skills.starter')}
          <span style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            {t('settings.skills.starterHint')}
          </span>
        </label>
        <button type="button" className="settings-btn-secondary" onClick={() => void installStarter()}>
          {t('settings.skills.install')}
        </button>
      </div>
      {installStatus && <p className="settings-hint">{installStatus}</p>}
      {error && <p className="settings-hint" style={{ color: 'var(--color-danger)' }}>{error}</p>}
    </div>
  )
}
