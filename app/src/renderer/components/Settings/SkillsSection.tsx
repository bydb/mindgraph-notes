import { useCallback, useEffect, useState } from 'react'
import { useNotesStore } from '../../stores/notesStore'
import { useTranslation } from '../../utils/translations'
import { generateNoteId } from '../../utils/linkExtractor'
import type { NoteAgentSkill, NoteAgentCatalogSkill } from '../../../shared/types'
import { PageHeader, SectionTitle, Card, Row, Note, Details, Toggle, Button, Code } from './SettingsUI'

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
  // Stufe 2: kuratierter Katalog (Vorschau-vor-Install ist Pflicht-UX) + Import.
  const [catalog, setCatalog] = useState<NoteAgentCatalogSkill[] | null>(null)
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [previewId, setPreviewId] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!vaultPath) return
    setLoading(true)
    const res = await window.electronAPI.noteSkillsList(vaultPath)
    setSkills(res.skills)
    setError(res.error || null)
    setLoading(false)
  }, [vaultPath])

  useEffect(() => { void reload() }, [reload])

  const toggleSkill = async (skill: NoteAgentSkill) => {
    if (!vaultPath) return
    const res = await window.electronAPI.noteSkillsSetEnabled(vaultPath, skill.folderName, !skill.enabled)
    if (res.success) setSkills(prev => prev.map(s => (s.folderName === skill.folderName ? { ...s, enabled: !skill.enabled } : s)))
    else setError(res.error || null)
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

  const loadCatalog = async () => {
    setError(null)
    setCatalogLoading(true)
    const res = await window.electronAPI.noteSkillsCatalog()
    setCatalog(res.skills)
    if (res.error) setError(res.error)
    setCatalogLoading(false)
  }

  const installFromCatalog = async (id: string) => {
    if (!vaultPath) return
    setError(null)
    const res = await window.electronAPI.noteSkillsCatalogInstall(vaultPath, id)
    if (!res.success) {
      setError(res.error || 'Installation fehlgeschlagen')
      return
    }
    setPreviewId(null)
    setInstallStatus(`${t('settings.skills.installed')}: ${id}`)
    await reload()
  }

  const importFromDisk = async () => {
    if (!vaultPath) return
    setError(null)
    setInstallStatus(null)
    const res = await window.electronAPI.noteSkillsImportDialog(vaultPath)
    if (res.cancelled) return
    if (!res.success) {
      setError(res.error || 'Import fehlgeschlagen')
      return
    }
    setInstallStatus(`${t('settings.skills.installed')}: ${res.folderName}${res.includedScripts ? ` — ${t('settings.skills.scriptsIncluded')}` : ''}`)
    await reload()
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
    setInstallStatus(res.installed.length > 0 ? `${t('settings.skills.installed')}: ${res.installed.join(', ')}` : t('settings.skills.installedNone'))
    await reload()
  }

  const enabledCount = skills.filter(s => s.enabled).length

  return (
    <div className="settings-section">
      <PageHeader title={t('settings.tab.skills')} subtitle={t('settings.skills.subtitle')} />

      <SectionTitle title={t('settings.skills.groupVault')} meta={loading ? undefined : t('settings.skills.meta', { n: skills.length, on: enabledCount })} />
      <Card>
        {loading ? (
          <Note tone="muted">…</Note>
        ) : skills.length === 0 ? (
          <Note tone="muted">{t('settings.skills.empty')}</Note>
        ) : skills.map(skill => (
          <Row
            key={skill.folderName}
            label={skill.name}
            htmlFor={`skill-${skill.folderName}`}
            hint={
              <>
                {skill.description && <>{skill.description}<br /></>}
                <span className="sui-secret-suffix">{skill.relPath}</span> · <button type="button" className="sui-link" onClick={() => void openSkill(skill.relPath)}>{t('settings.skills.edit')}</button>
              </>
            }
          >
            <Toggle id={`skill-${skill.folderName}`} checked={skill.enabled} onChange={() => void toggleSkill(skill)} ariaLabel={skill.enabled ? t('settings.skills.disable') : t('settings.skills.enable')} />
          </Row>
        ))}
        <Details title={t('settings.skills.newHint')}>
          <p>{t('settings.skills.limitNote')}</p>
        </Details>
      </Card>

      <SectionTitle title={t('settings.skills.groupAdd')} />
      <Card>
        <Row label={t('settings.skills.new')} hint={t('settings.skills.newHint')}>
          <input
            type="text"
            className="sui-input"
            value={newName}
            placeholder={t('settings.skills.newPlaceholder')}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') void createNewSkill() }}
          />
          <Button variant="primary" onClick={() => void createNewSkill()} disabled={!newName.trim()}>{t('settings.skills.create')}</Button>
        </Row>
        <Row label={t('settings.skills.starter')} hint={t('settings.skills.starterHint')}>
          <Button onClick={() => void installStarter()}>{t('settings.skills.install')}</Button>
        </Row>
        <Row label={t('settings.skills.import')} hint={t('settings.skills.importHint')}>
          <Button onClick={() => void importFromDisk()}>{t('settings.skills.importButton')}</Button>
        </Row>
        <Row label={t('settings.skills.catalog')} hint={t('settings.skills.catalogHint')}>
          <Button onClick={() => void loadCatalog()} disabled={catalogLoading}>{catalogLoading ? '…' : t('settings.skills.catalogLoad')}</Button>
        </Row>
        {installStatus && <Note tone="ok">{installStatus}</Note>}
        {error && <Note tone="danger">{error}</Note>}
      </Card>

      {catalog && (
        <>
          <SectionTitle title={t('settings.skills.catalog')} meta={t('settings.skills.catalogMeta', { n: catalog.length })} />
          <Card>
            {catalog.length === 0 && <Note tone="muted">{t('settings.skills.catalogEmpty')}</Note>}
            {catalog.map(entry => {
              const alreadyInstalled = skills.some(s => s.folderName === entry.id)
              const open = previewId === entry.id && !alreadyInstalled
              return (
                <div key={entry.id}>
                  <Row label={entry.name} hint={<>{entry.description}<br />{entry.source} · {entry.license}{entry.language ? ` · ${entry.language}` : ''}</>}>
                    <Button onClick={() => setPreviewId(open ? null : entry.id)} disabled={alreadyInstalled}>
                      {alreadyInstalled ? t('settings.skills.alreadyInstalled') : open ? t('settings.skills.previewClose') : t('settings.skills.preview')}
                    </Button>
                  </Row>
                  {open && (
                    <Row label={t('settings.skills.preview')} stacked>
                      {/* Pflicht-UX: kompletter Inhalt VOR der Installation sichtbar */}
                      <div className="sui-preview"><Code>{entry.content}</Code></div>
                      <div className="sui-pair"><Button variant="primary" onClick={() => void installFromCatalog(entry.id)}>{t('settings.skills.install')}</Button></div>
                    </Row>
                  )}
                </div>
              )
            })}
          </Card>
        </>
      )}
    </div>
  )
}
