import { Fragment, useCallback, useEffect, useState } from 'react'
import { useNotesStore } from '../../stores/notesStore'
import { useTranslation } from '../../utils/translations'
import { generateNoteId } from '../../utils/linkExtractor'
import type { NoteAgentSkill, NoteAgentCatalogSkill } from '../../../shared/types'
import { PageHeader, SectionTitle, Card, Row, Note, Details, Toggle, Button, Code } from './SettingsUI'
import { BrandSection } from './BrandSection'
import { compactSkillDiff, diffSkillLines } from '../../../shared/skillUpdate'

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
  // Was in der Liste fehlt (zu groß, über der Obergrenze) und ab wann gekürzt wird.
  const [skipped, setSkipped] = useState<{ tooLarge: string[]; overLimit: number }>({ tooLarge: [], overLimit: 0 })
  const [bodyLimit, setBodyLimit] = useState(18000)
  const [newName, setNewName] = useState('')
  const [installStatus, setInstallStatus] = useState<string | null>(null)
  // Stufe 2: kuratierter Katalog (Vorschau-vor-Install ist Pflicht-UX) + Import.
  const [catalog, setCatalog] = useState<NoteAgentCatalogSkill[] | null>(null)
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [previewId, setPreviewId] = useState<string | null>(null)
  // Skill-Updater: mitgelieferte Skills, für die diese App eine neuere Fassung hat.
  // `outdated` = unveränderte ältere Auslieferung (ein Klick), `modified` = vom Nutzer angepasst
  // (erst Unterschiede ansehen, dann ausdrücklich ersetzen). Entschieden wird im Main.
  const [updates, setUpdates] = useState<Record<string, 'outdated' | 'modified'>>({})
  const [updateBusy, setUpdateBusy] = useState(false)
  const [updateStatus, setUpdateStatus] = useState<string | null>(null)
  const [updatePreview, setUpdatePreview] = useState<{ folderName: string; oldText: string; newText: string; carried: string | null } | null>(null)

  const reload = useCallback(async () => {
    if (!vaultPath) return
    setLoading(true)
    const res = await window.electronAPI.noteSkillsList(vaultPath)
    setSkills(res.skills)
    setSkipped(res.skipped ?? { tooLarge: [], overLimit: 0 })
    if (res.bodyLimit) setBodyLimit(res.bodyLimit)
    setError(res.error || null)
    setLoading(false)
    // Fehler hier bleiben still: ohne Auskunft gibt es schlicht kein Update-Angebot.
    const upd = await window.electronAPI.noteSkillsUpdates(vaultPath)
    setUpdates(Object.fromEntries(upd.updates.map(u => [u.folderName, u.state])))
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

  const applyUpdates = async (folderNames: string[], confirmedModified: string[] = []) => {
    if (!vaultPath || folderNames.length === 0) return
    setError(null)
    setUpdateStatus(null)
    setUpdateBusy(true)
    const res = await window.electronAPI.noteSkillsUpdateApply(vaultPath, folderNames, confirmedModified)
    setUpdateBusy(false)
    setUpdatePreview(null)
    const problems = [res.error, ...res.failed.map(f => `${f.folderName}: ${f.error}`)].filter(Boolean)
    if (problems.length > 0) setError(problems.join(' · '))
    if (res.updated.length > 0) setUpdateStatus(t('settings.skills.updateDone', { names: res.updated.join(', ') }))
    await reload()
  }

  const showUpdateDiff = async (folderName: string) => {
    if (!vaultPath) return
    if (updatePreview?.folderName === folderName) { setUpdatePreview(null); return }
    setError(null)
    const res = await window.electronAPI.noteSkillsUpdatePreview(vaultPath, folderName)
    if (!res.success || !res.preview) { setError(res.error || null); return }
    setUpdatePreview({ folderName, oldText: res.preview.oldText, newText: res.preview.newText, carried: res.preview.carried })
  }

  const outdatedNames = skills.filter(s => updates[s.folderName] === 'outdated').map(s => s.folderName)
  const enabledCount = skills.filter(s => s.enabled).length

  return (
    <div className="settings-section">
      <PageHeader title={t('settings.tab.skills')} subtitle={t('settings.skills.subtitle')} />

      {vaultPath && <BrandSection vaultPath={vaultPath} skills={skills} onChanged={() => void reload()} />}

      <SectionTitle title={t('settings.skills.groupVault')} meta={loading ? undefined : t('settings.skills.meta', { n: skills.length, on: enabledCount })} />
      <Card>
        {outdatedNames.length > 1 && (
          <Note tone="warn" action={t('settings.skills.updateAll', { n: outdatedNames.length })} onAction={() => void applyUpdates(outdatedNames)} actionDisabled={updateBusy}>
            {t('settings.skills.updateAllHint', { n: outdatedNames.length })}
          </Note>
        )}
        {updateStatus && <Note tone="ok">{updateStatus}</Note>}
        {loading ? (
          <Note tone="muted">…</Note>
        ) : skills.length === 0 ? (
          <Note tone="muted">{t('settings.skills.empty')}</Note>
        ) : skills.map(skill => (
          <Fragment key={skill.folderName}>
          <Row
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
          {updates[skill.folderName] === 'outdated' && (
            <Note tone="warn" action={t('settings.skills.update')} onAction={() => void applyUpdates([skill.folderName])} actionDisabled={updateBusy}>
              {t('settings.skills.updateAvailable')}{' '}
              <button type="button" className="sui-link" onClick={() => void showUpdateDiff(skill.folderName)}>
                {updatePreview?.folderName === skill.folderName ? t('settings.skills.updateDiffClose') : t('settings.skills.updateDiff')}
              </button>
            </Note>
          )}
          {updates[skill.folderName] === 'modified' && (
            <Note tone="warn" action={updatePreview?.folderName === skill.folderName ? t('settings.skills.updateDiffClose') : t('settings.skills.updateDiff')} onAction={() => void showUpdateDiff(skill.folderName)}>
              {t('settings.skills.updateAvailableModified')}
            </Note>
          )}
          {updatePreview?.folderName === skill.folderName && (
            <Row label={t('settings.skills.updateDiffTitle')} stacked>
              {updatePreview.carried && <Note tone="muted">{t('settings.skills.updateCarried', { line: updatePreview.carried })}</Note>}
              <div className="sui-preview sui-skilldiff" role="group" aria-label={t('settings.skills.updateDiffTitle')}>
                {compactSkillDiff(diffSkillLines(updatePreview.oldText, updatePreview.newText)).map((l, i) => l === null
                  ? <div key={i} className="sui-skilldiff-gap">⋯</div>
                  : (
                    <div key={i} className={`sui-skilldiff-line is-${l.type}`}>
                      <span className="sui-skilldiff-mark" aria-hidden="true">{l.type === 'add' ? '+' : l.type === 'del' ? '−' : ' '}</span>
                      <span className="sui-skilldiff-sr">{l.type === 'add' ? t('settings.skills.updateDiffAdded') : l.type === 'del' ? t('settings.skills.updateDiffRemoved') : ''}</span>
                      {l.text || ' '}
                    </div>
                  ))}
              </div>
              {updates[skill.folderName] === 'modified' && (
                <>
                  <Note tone="muted">{t('settings.skills.updateReplaceHint')}</Note>
                  <div className="sui-pair">
                    <Button variant="primary" disabled={updateBusy} onClick={() => void applyUpdates([skill.folderName], [skill.folderName])}>{t('settings.skills.updateReplace')}</Button>
                    <Button onClick={() => setUpdatePreview(null)}>{t('settings.skills.updateKeep')}</Button>
                  </div>
                </>
              )}
            </Row>
          )}
          {skill.truncated && <Note tone="warn">{t('settings.skills.truncated', { limit: bodyLimit.toLocaleString('de-DE'), chars: skill.bodyChars.toLocaleString('de-DE') })}</Note>}
          </Fragment>
        ))}
        {skipped.tooLarge.length > 0 && <Note tone="warn">{t('settings.skills.skippedLarge', { names: skipped.tooLarge.join(', ') })}</Note>}
        {skipped.overLimit > 0 && <Note tone="warn">{t('settings.skills.skippedLimit', { n: skipped.overLimit })}</Note>}
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
