/**
 * ProjectStatusWidget — Dashboard-Karte für den Crystallizer.
 *
 * Für Nutzer ohne KI-Hintergrund gemacht:
 *   - Leerstand erklärt verständlich, wie man startet
 *   - Eine Aktion pro Projekt: "Wochenstand erzeugen"
 *   - Echte Erfolgs-/Fehler-Rückmeldung, kein Cloud-Fallback
 *   - Brain-Signal-Alter zeigt auf einen Blick, ob ein Projekt verwaist
 *
 * Diese Komponente ist absichtlich keine Verwaltungs-Suite — sie soll Sonntag
 * funktionieren, ohne dass man irgendetwas konfiguriert.
 */

import React, { useEffect, useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useProjectStatusStore } from '../../stores/projectStatusStore'
import { useNotesStore } from '../../stores/notesStore'
import { useUIStore } from '../../stores/uiStore'
import type { DiscoveredProject, ProjectPriority } from '../../../shared/types'
import { isHardLocked } from '../../../shared/modelCompatibility'
import { ActiveModelBadge } from '../Shared/ActiveModelBadge'
import { IconClipboard, IconRefresh, IconTag, IconTrash } from '../Shared/Icons'
import './ProjectStatusWidget.css'

const STALE_THRESHOLD_DAYS = 14

interface ProjectStatusWidgetProps {
  // Reserviert für künftige TranslationKey-Anbindung. Aktuell schaltet das
  // Widget bilingual via `uiStore.language` (siehe `lang` unten) — die
  // Widget-Texte sind dafür ausreichend wenige und werden inline gehalten.
  t?: unknown
}

// ────────────────────────────────────────────────────────────────────────────
// Hauptkomponente
// ────────────────────────────────────────────────────────────────────────────

export const ProjectStatusWidget: React.FC<ProjectStatusWidgetProps> = () => {
  const vaultPath = useNotesStore(s => s.vaultPath)
  const language = useUIStore(s => s.language)
  const lang: 'de' | 'en' = language === 'en' ? 'en' : 'de'

  const projectsRootFolder = useUIStore(s => s.projectsRootFolder)
  const ollama = useUIStore(s => s.ollama)
  const moduleOverride = ollama.moduleModelOverrides['project-status']
  const effectiveModel = moduleOverride || ollama.selectedModel || ''
  const hardLocked = effectiveModel && isHardLocked(effectiveModel, 'project-status')

  const { projects, loading, lastError, runningJobs, lastResults, synonyms, generatingSynonyms, load, crystallize, cleanupFindings, deleteDraft, generateSynonyms } = useProjectStatusStore(useShallow(s => ({
    projects: s.projects,
    loading: s.loading,
    lastError: s.lastError,
    runningJobs: s.runningJobs,
    lastResults: s.lastResults,
    synonyms: s.synonyms,
    generatingSynonyms: s.generatingSynonyms,
    load: s.load,
    crystallize: s.crystallize,
    cleanupFindings: s.cleanupFindings,
    deleteDraft: s.deleteDraft,
    generateSynonyms: s.generateSynonyms
  })))

  const loadAllSynonyms = useProjectStatusStore(s => s.loadAllSynonyms)

  useEffect(() => {
    if (vaultPath && projects.length > 0) {
      loadAllSynonyms(vaultPath)
    }
  }, [vaultPath, projects, loadAllSynonyms])

  const [showMarkDialog, setShowMarkDialog] = useState(false)
  const [reviewProject, setReviewProject] = useState<DiscoveredProject | null>(null)
  const [draftsProject, setDraftsProject] = useState<DiscoveredProject | null>(null)
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; text: string; href?: string; projectKey?: string } | null>(null)

  // Beim Mount und bei Vault- oder Projekt-Ordner-Wechsel laden
  useEffect(() => {
    if (vaultPath && projectsRootFolder) {
      load(vaultPath, projectsRootFolder)
    }
  }, [vaultPath, projectsRootFolder, load])

  const sorted = useMemo(() => {
    // Schon im Store nach priority sortiert. Hier nur Anzeige.
    return projects
  }, [projects])

  if (!vaultPath) {
    return (
      <div className="project-status-widget project-status-widget--empty">
        <h3 className="psw-title">{lang === 'de' ? 'Projekt-Status' : 'Project status'}</h3>
        <p className="psw-hint">{lang === 'de' ? 'Bitte zuerst ein Vault öffnen.' : 'Open a vault first.'}</p>
      </div>
    )
  }

  const handleCrystallize = async (project: DiscoveredProject) => {
    setToast(null)
    if (!effectiveModel) {
      setToast({
        kind: 'error',
        text: lang === 'de'
          ? 'Kein lokales Sprachmodell ausgewählt. Bitte in den Einstellungen → Integrationen → Ollama eines wählen.'
          : 'No local model selected. Please choose one in Settings → Integrations → Ollama.'
      })
      return
    }
    if (hardLocked) {
      setToast({
        kind: 'error',
        text: lang === 'de'
          ? 'Das aktive Modell ist für Projekt-Status gesperrt. Bitte ein anderes Modell wählen.'
          : 'The active model is locked for project status. Please pick a different model.'
      })
      return
    }
    const result = await crystallize(vaultPath, project, effectiveModel, lang)
    if (result.success && result.notePath) {
      const findingCount = result.findings?.length || 0
      const findingsHint = findingCount > 0
        ? (lang === 'de' ? ` — ${findingCount} Hinweis${findingCount === 1 ? '' : 'e'} zur Datenqualität` : ` — ${findingCount} data-quality hint${findingCount === 1 ? '' : 's'}`)
        : ''
      setToast({
        kind: 'success',
        text: lang === 'de'
          ? `Wochenstand für „${project.folderName}" erstellt (${result.brainEntriesUsed} Brain-Tag${result.brainEntriesUsed === 1 ? '' : 'e'}, ${result.inboxNotesUsed} Inbox-Notiz${result.inboxNotesUsed === 1 ? '' : 'en'})${findingsHint}.`
          : `Status created for "${project.folderName}" (${result.brainEntriesUsed} brain day(s), ${result.inboxNotesUsed} inbox note(s))${findingsHint}.`,
        href: result.notePath,
        projectKey: project.folderRel
      })
    } else {
      setToast({
        kind: 'error',
        text: result.error || (lang === 'de' ? 'Unbekannter Fehler' : 'Unknown error')
      })
    }
  }

  const handleGenerateSynonyms = async (project: DiscoveredProject) => {
    setToast(null)
    if (!effectiveModel) {
      setToast({
        kind: 'error',
        text: lang === 'de'
          ? 'Kein lokales Sprachmodell ausgewählt.'
          : 'No local model selected.'
      })
      return
    }
    const result = await generateSynonyms(vaultPath, project.folderRel, effectiveModel)
    if (result.success) {
      const count = synonyms[project.folderRel]?.synonyms.length || 0
      setToast({
        kind: 'success',
        text: lang === 'de'
          ? `Synonyme für „${project.folderName}" aktualisiert (${count} Begriffe).`
          : `Synonyms updated for "${project.folderName}" (${count} terms).`
      })
    } else {
      setToast({
        kind: 'error',
        text: result.error || (lang === 'de' ? 'Synonym-Generierung fehlgeschlagen' : 'Synonym generation failed')
      })
    }
  }

  const handleOpenStatusFile = async (absPath: string) => {
    try {
      // Versuch 1: Notiz im notesStore finden und über `selectNote` öffnen.
      const relInVault = absPath.startsWith(vaultPath) ? absPath.slice(vaultPath.length + 1) : absPath
      const notesState = useNotesStore.getState()
      const note = notesState.getNoteByPath(relInVault)
      if (note) {
        notesState.selectNote(note.id)
        return
      }
      // Fallback: Im Finder/Explorer anzeigen — Datei ist frisch geschrieben
      // und noch nicht im Note-Cache; das hier ist die robusteste UX-Option,
      // bis ein vollständiger Vault-Rescan ausgelöst wird.
      await window.electronAPI.showInFolder(absPath)
    } catch (err) {
      console.warn('Konnte Status-Datei nicht öffnen:', err)
    }
  }

  const noProjectsFolder = !projectsRootFolder

  return (
    <div className="project-status-widget">
      <div className="psw-header">
        <h3 className="psw-title" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          <IconClipboard size={16} />
          <span>{lang === 'de' ? 'Projekt-Status' : 'Project status'}</span>
        </h3>
        <div className="psw-header-actions">
          <ActiveModelBadge moduleId="project-status" />
          <button
            className="psw-btn psw-btn--ghost"
            onClick={() => projectsRootFolder && load(vaultPath, projectsRootFolder)}
            disabled={loading || noProjectsFolder}
            title={lang === 'de' ? 'Liste neu laden' : 'Reload list'}
          >
            ↻
          </button>
          <button
            className="psw-btn psw-btn--primary"
            onClick={() => setShowMarkDialog(true)}
            disabled={noProjectsFolder}
            title={noProjectsFolder
              ? (lang === 'de' ? 'Zuerst in Einstellungen den Projekt-Ordner festlegen' : 'Set a projects folder in Settings first')
              : undefined}
          >
            {lang === 'de' ? '+ Projekt markieren' : '+ Mark project'}
          </button>
        </div>
      </div>

      {noProjectsFolder && (
        <NoFolderConfiguredState lang={lang} />
      )}

      {!noProjectsFolder && loading && projects.length === 0 && (
        <p className="psw-hint">{lang === 'de' ? 'Lade …' : 'Loading …'}</p>
      )}

      {!noProjectsFolder && lastError && (
        <div className="psw-error">
          <strong>{lang === 'de' ? 'Fehler:' : 'Error:'}</strong> {lastError}
        </div>
      )}

      {!noProjectsFolder && !loading && projects.length === 0 && !lastError && (
        <EmptyState lang={lang} onMarkClick={() => setShowMarkDialog(true)} />
      )}

      {sorted.length > 0 && (
        <div className="psw-list">
          {sorted.map(p => (
            <ProjectRow
              key={p.folderRel}
              project={p}
              lang={lang}
              running={runningJobs.has(p.folderRel)}
              lastResult={lastResults.get(p.folderRel)}
              synonymCount={synonyms[p.folderRel]?.synonyms.length || 0}
              synonymsGeneratedAt={synonyms[p.folderRel]?.generatedAt}
              synonymRunning={generatingSynonyms.has(p.folderRel)}
              onCrystallize={() => handleCrystallize(p)}
              onGenerateSynonyms={() => handleGenerateSynonyms(p)}
              onOpenStatus={(absPath) => handleOpenStatusFile(absPath)}
              onReview={() => setReviewProject(p)}
              onShowDrafts={() => setDraftsProject(p)}
            />
          ))}
        </div>
      )}

      {toast && (
        <div className={`psw-toast psw-toast--${toast.kind}`}>
          <span>{toast.text}</span>
          {toast.projectKey && (lastResults.get(toast.projectKey)?.findings?.length || 0) > 0 && (
            <button
              className="psw-btn psw-btn--ghost psw-btn--small"
              onClick={() => {
                const proj = projects.find(p => p.folderRel === toast.projectKey)
                if (proj) setReviewProject(proj)
              }}
            >
              {lang === 'de' ? 'Prüfen' : 'Review'}
            </button>
          )}
          {toast.href && (
            <button
              className="psw-btn psw-btn--ghost psw-btn--small"
              onClick={() => toast.href && handleOpenStatusFile(toast.href)}
            >
              {lang === 'de' ? 'Öffnen' : 'Open'}
            </button>
          )}
          <button className="psw-toast-close" onClick={() => setToast(null)} aria-label="dismiss">×</button>
        </div>
      )}

      {reviewProject && (() => {
        const r = lastResults.get(reviewProject.folderRel)
        if (!r || !r.success || !r.notePath) {
          return null
        }
        return (
          <ReviewFindingsModal
            vaultPath={vaultPath}
            project={reviewProject}
            filePath={r.notePath}
            findings={r.findings || []}
            lang={lang}
            onClose={() => setReviewProject(null)}
            onCleanup={async (refs) => {
              const cleanup = await cleanupFindings(vaultPath, reviewProject, r.notePath!, refs, lang)
              return cleanup
            }}
            onOpenStatus={() => r.notePath && handleOpenStatusFile(r.notePath)}
          />
        )
      })()}

      {draftsProject && (
        <DraftsCleanupModal
          vaultPath={vaultPath}
          project={draftsProject}
          lang={lang}
          onClose={() => setDraftsProject(null)}
          onDelete={(draftRel) => deleteDraft(vaultPath, draftsProject, draftRel)}
          onOpen={(draftRel) => {
            const abs = draftRel.startsWith(vaultPath) ? draftRel : `${vaultPath}/${draftRel}`
            handleOpenStatusFile(abs)
          }}
        />
      )}

      {showMarkDialog && (
        <MarkProjectDialog
          vaultPath={vaultPath}
          projectsRootFolder={projectsRootFolder}
          lang={lang}
          onClose={() => setShowMarkDialog(false)}
          onSaved={() => {
            setShowMarkDialog(false)
            if (projectsRootFolder) load(vaultPath, projectsRootFolder)
          }}
        />
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// NoFolderConfiguredState — User hat keinen Projekt-Ordner in Settings gewählt
// ────────────────────────────────────────────────────────────────────────────

const NoFolderConfiguredState: React.FC<{ lang: 'de' | 'en' }> = ({ lang }) => {
  if (lang === 'de') {
    return (
      <div className="psw-empty">
        <p className="psw-empty-headline">Projekt-Ordner nicht festgelegt.</p>
        <p className="psw-empty-text">
          Bevor du Projekte markieren kannst, sag uns, wo deine Projekte
          liegen — egal ob das <code>100 - Projekte</code>, <code>Kunden</code>,
          <code>Projects</code> oder ein ganz anderer Pfad ist.
        </p>
        <p className="psw-empty-text">
          Öffne <strong>Einstellungen → Allgemein → Vault → „Projekt-Ordner (Crystallizer)"</strong> und
          wähle den Ordner. Der Crystallizer scannt dann darin nach Unterordnern,
          die du als Projekte markieren kannst.
        </p>
        <p className="psw-empty-privacy">
          🔒 Alles bleibt auf deinem Rechner.
        </p>
      </div>
    )
  }
  return (
    <div className="psw-empty">
      <p className="psw-empty-headline">Projects folder not set.</p>
      <p className="psw-empty-text">
        Before marking projects, tell us where your project folders live —
        could be <code>Projects</code>, <code>Clients</code>, or any other path.
      </p>
      <p className="psw-empty-text">
        Open <strong>Settings → General → Vault → "Projects folder (Crystallizer)"</strong> and
        pick the folder. The Crystallizer will then scan its subfolders for
        projects you can mark.
      </p>
      <p className="psw-empty-privacy">
        🔒 Everything stays on your machine.
      </p>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// EmptyState — verständliche Anleitung statt nur „keine Daten"
// ────────────────────────────────────────────────────────────────────────────

const EmptyState: React.FC<{ lang: 'de' | 'en'; onMarkClick: () => void }> = ({ lang, onMarkClick }) => {
  if (lang === 'de') {
    return (
      <div className="psw-empty">
        <p className="psw-empty-headline">Noch keine Projekte markiert.</p>
        <p className="psw-empty-text">
          Markiere die 3–5 Projekte, die dich diese Woche beschäftigen.
          Jeden Sonntag klickst du dann einmal pro Projekt — und bekommst
          einen Wochenstand mit allem Wichtigen aus deinen Notizen.
        </p>
        <ul className="psw-empty-points">
          <li>Was hast du diese Woche bewegt?</li>
          <li>Was hängt noch?</li>
          <li>Welche Termine kommen?</li>
        </ul>
        <p className="psw-empty-privacy">
          🔒 Alles bleibt auf deinem Rechner. Keine Cloud, kein OpenAI.
        </p>
        <button className="psw-btn psw-btn--primary" onClick={onMarkClick}>
          + Erstes Projekt markieren
        </button>
      </div>
    )
  }
  return (
    <div className="psw-empty">
      <p className="psw-empty-headline">No projects marked yet.</p>
      <p className="psw-empty-text">
        Mark the 3–5 projects you care about this week. Every Sunday, one click
        per project gives you a weekly status — distilled from your own notes.
      </p>
      <ul className="psw-empty-points">
        <li>What did you move forward this week?</li>
        <li>What's hanging?</li>
        <li>Which deadlines are coming?</li>
      </ul>
      <p className="psw-empty-privacy">
        🔒 Everything stays on your machine. No cloud, no OpenAI.
      </p>
      <button className="psw-btn psw-btn--primary" onClick={onMarkClick}>
        + Mark first project
      </button>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// ProjectRow
// ────────────────────────────────────────────────────────────────────────────

interface ProjectRowProps {
  project: DiscoveredProject
  lang: 'de' | 'en'
  running: boolean
  lastResult?: import('../../../shared/types').ProjectStatusResult
  synonymCount: number
  synonymsGeneratedAt?: string
  synonymRunning: boolean
  onCrystallize: () => void
  onGenerateSynonyms: () => void
  onOpenStatus: (absPath: string) => void
  onReview: () => void
  onShowDrafts: () => void
}

const ProjectRow: React.FC<ProjectRowProps> = ({ project, lang, running, lastResult, synonymCount, synonymsGeneratedAt, synonymRunning, onCrystallize, onGenerateSynonyms, onOpenStatus, onReview, onShowDrafts }) => {
  const prio = project.marker.priority
  const prioDot = prio === 'high' ? '🔴' : prio === 'med' ? '🟡' : '🟢'
  const prioLabel = lang === 'de'
    ? (prio === 'high' ? 'Hoch' : prio === 'med' ? 'Mittel' : 'Niedrig')
    : (prio === 'high' ? 'High' : prio === 'med' ? 'Med' : 'Low')

  const signalAge = project.lastBrainSignal.ageDays
  const isStale = signalAge === null || signalAge > STALE_THRESHOLD_DAYS

  const signalLabel = (() => {
    if (signalAge === null) {
      return lang === 'de' ? 'kein Signal in 60 Tagen' : 'no signal in 60 days'
    }
    if (signalAge === 0) return lang === 'de' ? 'heute aktiv' : 'active today'
    if (signalAge === 1) return lang === 'de' ? 'gestern aktiv' : 'active yesterday'
    return lang === 'de' ? `vor ${signalAge} Tagen` : `${signalAge} days ago`
  })()
  const currentWeekDraftCount = project.currentWeekDrafts?.length || (project.currentWeekDraft ? 1 : 0)

  return (
    <div className={`psw-row ${isStale ? 'psw-row--stale' : ''}`}>
      <div className="psw-row-main">
        <div className="psw-row-name">
          <span className="psw-row-dot" title={prioLabel}>{prioDot}</span>
          <span className="psw-row-title">{project.folderName}</span>
        </div>
        <div className="psw-row-meta">
          <span className="psw-row-signal">{signalLabel}</span>
          {currentWeekDraftCount > 0 && (
            <button
              type="button"
              className={`psw-row-badge ${currentWeekDraftCount > 1 ? 'psw-row-badge--clickable' : ''}`}
              onClick={currentWeekDraftCount > 1 ? onShowDrafts : undefined}
              disabled={currentWeekDraftCount === 1}
              title={currentWeekDraftCount > 1
                ? (lang === 'de' ? 'Drafts dieser Woche verwalten / löschen' : 'Manage / delete drafts')
                : (lang === 'de' ? 'Diese Woche bereits erzeugt' : 'Already created this week')}
            >
              {currentWeekDraftCount === 1
                ? (lang === 'de' ? '✓ diese Woche' : '✓ this week')
                : (lang === 'de' ? `${currentWeekDraftCount} Entwürfe diese Woche` : `${currentWeekDraftCount} drafts this week`)}
            </button>
          )}
        </div>
      </div>
      <div className="psw-row-actions">
        {lastResult?.success && (lastResult.findings?.length || 0) > 0 && (
          <button
            className="psw-btn psw-btn--ghost psw-btn--small"
            onClick={onReview}
            title={lang === 'de' ? 'Hinweise prüfen & aufräumen' : 'Review & cleanup hints'}
          >
            {lang === 'de'
              ? `🛠 Prüfen (${lastResult.findings?.length})`
              : `🛠 Review (${lastResult.findings?.length})`}
          </button>
        )}
        {lastResult?.success && lastResult.notePath && (
          <button
            className="psw-btn psw-btn--ghost psw-btn--small"
            onClick={() => onOpenStatus(lastResult.notePath!)}
            title={lang === 'de' ? 'Letzten Stand öffnen' : 'Open last status'}
          >
            {lang === 'de' ? 'Ansehen' : 'Open'}
          </button>
        )}
        <button
          className="psw-btn psw-btn--ghost psw-btn--small"
          onClick={onGenerateSynonyms}
          disabled={synonymRunning}
          title={(() => {
            if (synonymRunning) return lang === 'de' ? 'Synonyme werden generiert …' : 'Generating synonyms …'
            if (!synonymsGeneratedAt) return lang === 'de' ? 'Topic-Synonyme für Email-Matching generieren' : 'Generate topic synonyms for email matching'
            const days = Math.floor((Date.now() - new Date(synonymsGeneratedAt).getTime()) / 86400000)
            return lang === 'de'
              ? `${synonymCount} Synonyme · vor ${days} Tag${days === 1 ? '' : 'en'} · Klick: neu generieren`
              : `${synonymCount} synonyms · ${days} day${days === 1 ? '' : 's'} ago · click to regenerate`
          })()}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            {synonymRunning
              ? <><IconRefresh size={12} /> …</>
              : <><IconTag size={12} /> {synonymCount > 0 ? synonymCount : (lang === 'de' ? 'Synonyme' : 'Synonyms')}</>}
          </span>
        </button>
        <button
          className="psw-btn psw-btn--primary psw-btn--small"
          onClick={onCrystallize}
          disabled={running}
        >
          {running
            ? (lang === 'de' ? 'läuft …' : 'running …')
            : (lang === 'de' ? 'Wochenstand erzeugen' : 'Create status')}
        </button>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// ReviewFindingsModal — Klick-weg-Aufräumen für ⚠/💡/📝
// ────────────────────────────────────────────────────────────────────────────

interface ReviewFindingsModalProps {
  vaultPath: string
  project: DiscoveredProject
  filePath: string
  findings: import('../../../shared/types').LintFinding[]
  lang: 'de' | 'en'
  onClose: () => void
  onCleanup: (refsToRemove: string[]) => Promise<{ success: boolean; removedLineCount?: number; remainingFindings?: import('../../../shared/types').LintFinding[]; error?: string }>
  onOpenStatus: () => void
}

const ReviewFindingsModal: React.FC<ReviewFindingsModalProps> = ({ project, findings, lang, onClose, onCleanup, onOpenStatus }) => {
  const [currentFindings, setCurrentFindings] = useState(findings)
  const [busyRef, setBusyRef] = useState<string | null>(null)
  const [lastError, setLastError] = useState<string | null>(null)
  const [removedTotal, setRemovedTotal] = useState(0)

  useEffect(() => {
    setCurrentFindings(findings)
  }, [findings])

  const handleRemove = async (ref: string) => {
    setBusyRef(ref)
    setLastError(null)
    const result = await onCleanup([ref])
    setBusyRef(null)
    if (result.success) {
      setRemovedTotal(prev => prev + (result.removedLineCount || 0))
      setCurrentFindings(result.remainingFindings || [])
    } else {
      setLastError(result.error || (lang === 'de' ? 'Unbekannter Fehler' : 'Unknown error'))
    }
  }

  const handleRemoveHallucinations = async () => {
    const refs = currentFindings
      .filter(f => f.kind === 'hallucination')
      .map(f => f.ref)
    if (refs.length === 0) return

    setBusyRef('__hallucinations__')
    setLastError(null)
    const result = await onCleanup(refs)
    setBusyRef(null)
    if (result.success) {
      setRemovedTotal(prev => prev + (result.removedLineCount || 0))
      setCurrentFindings(result.remainingFindings || [])
    } else {
      setLastError(result.error || (lang === 'de' ? 'Unbekannter Fehler' : 'Unknown error'))
    }
  }

  const hallu = currentFindings.filter(f => f.kind === 'hallucination')
  const sugg = currentFindings.filter(f => f.kind === 'suggestion')
  const md = currentFindings.filter(f => f.kind === 'markdown-link')

  return (
    <div className="psw-modal-backdrop" onClick={onClose}>
      <div className="psw-modal psw-modal--review" onClick={e => e.stopPropagation()}>
        <div className="psw-modal-header">
          <h2>
            {lang === 'de' ? '🛠 Prüfen & aufräumen' : '🛠 Review & cleanup'}
            <span className="psw-modal-subtitle">{project.folderName}</span>
          </h2>
          <button className="psw-modal-close" onClick={onClose}>×</button>
        </div>

        <div className="psw-modal-body">
          <p className="psw-modal-intro">
            {lang === 'de'
              ? 'Hier siehst du alle Verweise im Wochenstand, die wir nicht 1:1 zuordnen konnten. Mit einem Klick entfernst du jede Zeile, die einen solchen Verweis enthält. Die Notiz wird sofort aktualisiert.'
              : 'These are references we could not match 1:1 in your vault. One click removes every line containing such a reference. The note updates immediately.'}
          </p>

          {removedTotal > 0 && (
            <div className="psw-review-counter">
              {lang === 'de'
                ? `✓ ${removedTotal} Zeile${removedTotal === 1 ? '' : 'n'} entfernt.`
                : `✓ ${removedTotal} line${removedTotal === 1 ? '' : 's'} removed.`}
            </div>
          )}

          {lastError && (
            <div className="psw-error">{lastError}</div>
          )}

          {currentFindings.length === 0 ? (
            <div className="psw-review-empty">
              {lang === 'de'
                ? '🎉 Alles aufgeräumt — keine offenen Hinweise mehr.'
                : '🎉 All clean — no open hints remaining.'}
            </div>
          ) : (
            <>
              {hallu.length > 0 && (
                <FindingGroup
                  title={lang === 'de' ? `⚠ Vermutlich erfunden (${hallu.length})` : `⚠ Likely invented (${hallu.length})`}
                  description={lang === 'de'
                    ? 'Diese Verweise zeigen auf keine Datei in deinem Vault. Klick „Aus Notiz entfernen", wenn die Aussage falsch ist.'
                    : 'These references point to no file in your vault. Click "Remove from note" if the statement is wrong.'}
                  findings={hallu}
                  busyRef={busyRef}
                  onRemove={handleRemove}
                  action={(
                    <button
                      className="psw-btn psw-btn--ghost psw-btn--small"
                      onClick={handleRemoveHallucinations}
                      disabled={busyRef !== null}
                    >
                      {busyRef === '__hallucinations__'
                        ? (lang === 'de' ? 'entferne …' : 'removing …')
                        : (lang === 'de' ? 'Alle ⚠ entfernen' : 'Remove all ⚠')}
                    </button>
                  )}
                  lang={lang}
                />
              )}
              {sugg.length > 0 && (
                <FindingGroup
                  title={lang === 'de' ? `💡 Link-Vorschläge (${sugg.length})` : `💡 Link suggestions (${sugg.length})`}
                  description={lang === 'de'
                    ? 'Diese Datei existiert — mit ZK-ID oder Emoji-Präfix. Du kannst die Zeile entfernen oder den Verweis manuell anpassen.'
                    : 'These files exist — with ID prefix or emoji. You can remove the line, or adjust the reference manually.'}
                  findings={sugg}
                  busyRef={busyRef}
                  onRemove={handleRemove}
                  lang={lang}
                />
              )}
              {md.length > 0 && (
                <FindingGroup
                  title={lang === 'de' ? `📝 Single-Bracket-Verweise (${md.length})` : `📝 Single-bracket references (${md.length})`}
                  description={lang === 'de'
                    ? 'Möglicherweise als Wikilink gemeint — Markdown-Single-Bracket-Syntax.'
                    : 'Possibly meant as wikilinks — Markdown single-bracket syntax.'}
                  findings={md}
                  busyRef={busyRef}
                  onRemove={handleRemove}
                  lang={lang}
                />
              )}
            </>
          )}
        </div>

        <div className="psw-modal-footer">
          <button className="psw-btn psw-btn--ghost" onClick={onOpenStatus}>
            {lang === 'de' ? '📄 Notiz öffnen' : '📄 Open note'}
          </button>
          <button className="psw-btn psw-btn--primary" onClick={onClose}>
            {lang === 'de' ? 'Fertig' : 'Done'}
          </button>
        </div>
      </div>
    </div>
  )
}

interface FindingGroupProps {
  title: string
  description: string
  findings: import('../../../shared/types').LintFinding[]
  busyRef: string | null
  onRemove: (ref: string) => void
  action?: React.ReactNode
  lang: 'de' | 'en'
}

const FindingGroup: React.FC<FindingGroupProps> = ({ title, description, findings, busyRef, onRemove, action, lang }) => {
  return (
    <div className="psw-finding-group">
      <div className="psw-finding-group-header">
        <h3 className="psw-finding-group-title">{title}</h3>
        {action}
      </div>
      <p className="psw-finding-group-desc">{description}</p>
      <ul className="psw-finding-list">
        {findings.map(f => (
          <li key={f.ref} className="psw-finding-item">
            <div className="psw-finding-info">
              <code className="psw-finding-ref">{f.ref}</code>
              <span className="psw-finding-count">
                {lang === 'de'
                  ? `${f.count}× im Dokument`
                  : `${f.count}× in document`}
              </span>
              {f.suggestion && (
                <span className="psw-finding-suggestion">
                  → <code>[[{f.suggestion}]]</code>
                </span>
              )}
            </div>
            <button
              className="psw-btn psw-btn--ghost psw-btn--small"
              onClick={() => onRemove(f.ref)}
              disabled={busyRef !== null}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                {busyRef === f.ref
                  ? (lang === 'de' ? 'entferne …' : 'removing …')
                  : <><IconTrash size={12} /> {lang === 'de' ? 'Aus Notiz entfernen' : 'Remove from note'}</>}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// MarkProjectDialog
// ────────────────────────────────────────────────────────────────────────────

interface MarkProjectDialogProps {
  vaultPath: string
  projectsRootFolder: string
  lang: 'de' | 'en'
  onClose: () => void
  onSaved: () => void
}

interface FolderEntry {
  name: string
  relPath: string
  alreadyMarked: boolean
}

const MarkProjectDialog: React.FC<MarkProjectDialogProps> = ({ vaultPath, projectsRootFolder, lang, onClose, onSaved }) => {
  const suggestKeywords = useProjectStatusStore(s => s.suggestKeywords)
  const markProject = useProjectStatusStore(s => s.markProject)

  const [folders, setFolders] = useState<FolderEntry[]>([])
  const [loadingFolders, setLoadingFolders] = useState(true)
  const [selectedFolder, setSelectedFolder] = useState<string>('')
  const [keywords, setKeywords] = useState<string>('')
  const [priority, setPriority] = useState<ProjectPriority>('med')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Liste der Unterordner unter dem konfigurierten Projekt-Ordner laden
  useEffect(() => {
    if (!projectsRootFolder) {
      setLoadingFolders(false)
      return
    }
    const load = async () => {
      try {
        const dirEntries = await window.electronAPI.readDirectory(
          `${vaultPath}/${projectsRootFolder}`
        )
        const folderEntries: FolderEntry[] = []
        for (const e of dirEntries) {
          if (!e || typeof e !== 'object') continue
          if (!e.isDirectory) continue
          const name = e.name
          if (!name || name.startsWith('.')) continue
          const relPath = `${projectsRootFolder}/${name}`
          let alreadyMarked = false
          try {
            await window.electronAPI.readFile(`${vaultPath}/${relPath}/_STATUS.md`)
            alreadyMarked = true
          } catch {
            alreadyMarked = false
          }
          folderEntries.push({ name, relPath, alreadyMarked })
        }
        folderEntries.sort((a, b) => a.name.localeCompare(b.name, 'de'))
        setFolders(folderEntries)
      } catch (err) {
        setError(err instanceof Error ? err.message : (lang === 'de' ? 'Konnte Ordner nicht laden' : 'Could not load folders'))
      } finally {
        setLoadingFolders(false)
      }
    }
    load()
  }, [vaultPath, projectsRootFolder, lang])

  // Wenn der ausgewählte Ordner sich ändert → Keyword-Vorschläge holen
  useEffect(() => {
    if (!selectedFolder) {
      setKeywords('')
      return
    }
    const run = async () => {
      const sug = await suggestKeywords(vaultPath, selectedFolder)
      if (sug.length > 0) {
        setKeywords(sug.join(', '))
      }
    }
    run()
  }, [selectedFolder, vaultPath, suggestKeywords])

  const handleSave = async () => {
    if (!selectedFolder) {
      setError(lang === 'de' ? 'Bitte einen Projektordner wählen.' : 'Please pick a project folder.')
      return
    }
    const kws = keywords.split(',').map(k => k.trim()).filter(Boolean)
    if (kws.length === 0) {
      setError(lang === 'de' ? 'Bitte mindestens ein Keyword angeben.' : 'Please enter at least one keyword.')
      return
    }
    setSaving(true)
    setError(null)
    const result = await markProject(vaultPath, selectedFolder, kws, priority)
    setSaving(false)
    if (result.success) {
      onSaved()
    } else {
      setError(result.error || (lang === 'de' ? 'Speichern fehlgeschlagen' : 'Save failed'))
    }
  }

  return (
    <div className="psw-modal-backdrop" onClick={onClose}>
      <div className="psw-modal" onClick={e => e.stopPropagation()}>
        <div className="psw-modal-header">
          <h2>{lang === 'de' ? 'Projekt markieren' : 'Mark project'}</h2>
          <button className="psw-modal-close" onClick={onClose}>×</button>
        </div>

        <div className="psw-modal-body">
          <p className="psw-modal-intro">
            {lang === 'de'
              ? 'Wähle einen deiner Projektordner. MindGraph Notes scannt deine täglichen Notizen darauf und erzeugt jeden Sonntag einen Wochenstand für dich.'
              : 'Pick one of your project folders. MindGraph Notes scans your daily notes for it and creates a weekly status every Sunday.'}
          </p>

          <label className="psw-field">
            <span className="psw-field-label">{lang === 'de' ? '1. Projektordner' : '1. Project folder'}</span>
            {loadingFolders ? (
              <p className="psw-hint">{lang === 'de' ? 'Lade Ordner …' : 'Loading folders …'}</p>
            ) : folders.length === 0 ? (
              <p className="psw-hint">
                {lang === 'de'
                  ? `Keine Unterordner unter „${projectsRootFolder}" gefunden. Lege dort zuerst einen Ordner an.`
                  : `No subfolders under "${projectsRootFolder}". Create one first.`}
              </p>
            ) : (
              <select
                value={selectedFolder}
                onChange={e => setSelectedFolder(e.target.value)}
                className="psw-select"
              >
                <option value="">{lang === 'de' ? '— bitte wählen —' : '— please choose —'}</option>
                {folders.map(f => (
                  <option key={f.relPath} value={f.relPath} disabled={f.alreadyMarked}>
                    {f.name} {f.alreadyMarked ? (lang === 'de' ? '(bereits markiert)' : '(already marked)') : ''}
                  </option>
                ))}
              </select>
            )}
          </label>

          <label className="psw-field">
            <span className="psw-field-label">
              {lang === 'de' ? '2. Begriffe (Komma-getrennt)' : '2. Keywords (comma-separated)'}
            </span>
            <p className="psw-field-hint">
              {lang === 'de'
                ? 'Vorschläge kommen aus den Dateinamen im Ordner. Du kannst sie anpassen — diese Begriffe identifizieren das Projekt in deinen Tagesnotizen.'
                : 'Suggestions from filenames in the folder. Adjust as needed — these terms identify the project in your daily notes.'}
            </p>
            <input
              type="text"
              value={keywords}
              onChange={e => setKeywords(e.target.value)}
              placeholder={lang === 'de' ? 'z.B. Müller, Q3, Lieferung' : 'e.g. Müller, Q3, delivery'}
              className="psw-input"
            />
          </label>

          <label className="psw-field">
            <span className="psw-field-label">{lang === 'de' ? '3. Wie wichtig?' : '3. How important?'}</span>
            <div className="psw-priority-row">
              {(['high', 'med', 'low'] as ProjectPriority[]).map(p => (
                <button
                  key={p}
                  type="button"
                  className={`psw-priority-btn ${priority === p ? 'psw-priority-btn--active' : ''}`}
                  onClick={() => setPriority(p)}
                >
                  {p === 'high' ? '🔴 ' : p === 'med' ? '🟡 ' : '🟢 '}
                  {lang === 'de'
                    ? (p === 'high' ? 'Hoch' : p === 'med' ? 'Mittel' : 'Niedrig')
                    : (p === 'high' ? 'High' : p === 'med' ? 'Med' : 'Low')}
                </button>
              ))}
            </div>
          </label>

          {error && (
            <div className="psw-error">{error}</div>
          )}
        </div>

        <div className="psw-modal-footer">
          <button className="psw-btn psw-btn--ghost" onClick={onClose}>
            {lang === 'de' ? 'Abbrechen' : 'Cancel'}
          </button>
          <button
            className="psw-btn psw-btn--primary"
            onClick={handleSave}
            disabled={saving || !selectedFolder}
          >
            {saving
              ? (lang === 'de' ? 'speichert …' : 'saving …')
              : (lang === 'de' ? 'Markieren' : 'Mark')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// DraftsCleanupModal — alte Wochen-Entwürfe wegputzen
// ────────────────────────────────────────────────────────────────────────────

interface DraftsCleanupModalProps {
  vaultPath: string
  project: DiscoveredProject
  lang: 'de' | 'en'
  onClose: () => void
  onDelete: (draftRel: string) => Promise<{ success: boolean; error?: string }>
  onOpen: (draftRel: string) => void
}

interface DraftRowInfo {
  rel: string
  basename: string
  mtimeMs: number | null
  loading?: boolean
}

const DraftsCleanupModal: React.FC<DraftsCleanupModalProps> = ({ vaultPath, project, lang, onClose, onDelete, onOpen }) => {
  const [rows, setRows] = useState<DraftRowInfo[]>([])
  const [error, setError] = useState<string | null>(null)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [busyRel, setBusyRel] = useState<string | null>(null)

  // mtime pro Draft holen (für „heute 14:35"-Anzeige)
  useEffect(() => {
    const init = async () => {
      const drafts = project.currentWeekDrafts || []
      const result: DraftRowInfo[] = []
      for (const rel of drafts) {
        const abs = `${vaultPath}/${rel}`
        try {
          const stat = await window.electronAPI.getFileStats(abs)
          // electronAPI.getFileStats Rückgabe: { size, mtime, ... } — Form je nach Impl.
          // Wir greifen defensiv auf mtime in mehreren Varianten zu.
          const anyStat = stat as unknown as Record<string, unknown>
          const mtime = (anyStat.mtimeMs ?? anyStat.mtime ?? null) as number | string | null
          const mtimeMs = typeof mtime === 'number'
            ? mtime
            : (typeof mtime === 'string' ? new Date(mtime).getTime() : null)
          result.push({ rel, basename: rel.split('/').pop() || rel, mtimeMs })
        } catch {
          result.push({ rel, basename: rel.split('/').pop() || rel, mtimeMs: null })
        }
      }
      // Newest first
      result.sort((a, b) => (b.mtimeMs || 0) - (a.mtimeMs || 0))
      setRows(result)
    }
    init()
  }, [project, vaultPath])

  const formatWhen = (ms: number | null): string => {
    if (ms === null) return lang === 'de' ? '—' : '—'
    const d = new Date(ms)
    const today = new Date()
    const sameDay = d.toDateString() === today.toDateString()
    if (sameDay) {
      const hh = String(d.getHours()).padStart(2, '0')
      const mm = String(d.getMinutes()).padStart(2, '0')
      return lang === 'de' ? `heute ${hh}:${mm}` : `today ${hh}:${mm}`
    }
    return d.toLocaleString(lang === 'de' ? 'de-DE' : 'en-US', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
    })
  }

  const handleDelete = async (rel: string) => {
    setBusyRel(rel)
    setError(null)
    const result = await onDelete(rel)
    setBusyRel(null)
    if (result.success) {
      setRows(prev => prev.filter(r => r.rel !== rel))
    } else {
      setError(result.error || (lang === 'de' ? 'Löschen fehlgeschlagen' : 'Delete failed'))
    }
  }

  const handleBulkDelete = async () => {
    if (rows.length <= 1) return
    setBulkBusy(true)
    setError(null)
    // Alle außer dem ersten (= neuesten) löschen, sequenziell.
    const toDelete = rows.slice(1)
    for (const r of toDelete) {
      const res = await onDelete(r.rel)
      if (!res.success) {
        setError(res.error || (lang === 'de' ? 'Bulk-Löschen abgebrochen' : 'Bulk delete aborted'))
        setBulkBusy(false)
        // Rows aktualisieren auf das, was wir schon haben
        setRows(prev => prev.filter(x => x.rel !== r.rel))
        return
      }
    }
    setRows(prev => prev.slice(0, 1))
    setBulkBusy(false)
  }

  return (
    <div className="psw-modal-backdrop" onClick={onClose}>
      <div className="psw-modal psw-modal--review" onClick={e => e.stopPropagation()}>
        <div className="psw-modal-header">
          <h2>
            {lang === 'de' ? '🗂 Wochen-Entwürfe aufräumen' : '🗂 Clean up weekly drafts'}
            <span className="psw-modal-subtitle">{project.folderName}</span>
          </h2>
          <button className="psw-modal-close" onClick={onClose}>×</button>
        </div>

        <div className="psw-modal-body">
          <p className="psw-modal-intro">
            {lang === 'de'
              ? 'Beim wiederholten „Wochenstand erzeugen" entstehen Entwurfs-Kopien (z.B. „… (2).md", „… (3).md"). Hier kannst du die nicht benötigten löschen. Der jüngste Entwurf ist oben markiert.'
              : 'Re-running "Create status" produces draft copies (e.g. "… (2).md", "… (3).md"). Delete the ones you no longer need. The newest is marked at top.'}
          </p>

          {error && <div className="psw-error">{error}</div>}

          {rows.length === 0 ? (
            <div className="psw-review-empty">
              {lang === 'de' ? 'Keine Entwürfe in dieser Woche.' : 'No drafts this week.'}
            </div>
          ) : (
            <>
              {rows.length > 1 && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
                  <button
                    className="psw-btn psw-btn--ghost psw-btn--small"
                    onClick={handleBulkDelete}
                    disabled={bulkBusy}
                  >
                    {bulkBusy
                      ? (lang === 'de' ? 'lösche …' : 'deleting …')
                      : (lang === 'de' ? `🗑 Alle bis auf den neuesten (${rows.length - 1})` : `🗑 All but newest (${rows.length - 1})`)}
                  </button>
                </div>
              )}
              <ul className="psw-finding-list">
                {rows.map((r, idx) => (
                  <li key={r.rel} className="psw-finding-item">
                    <div className="psw-finding-info">
                      <code className="psw-finding-ref">{r.basename}</code>
                      <span className="psw-finding-count">{formatWhen(r.mtimeMs)}</span>
                      {idx === 0 && (
                        <span className="psw-row-badge" style={{ marginLeft: 4 }}>
                          {lang === 'de' ? 'neuester' : 'newest'}
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        className="psw-btn psw-btn--ghost psw-btn--small"
                        onClick={() => onOpen(r.rel)}
                      >
                        {lang === 'de' ? 'Öffnen' : 'Open'}
                      </button>
                      <button
                        className="psw-btn psw-btn--ghost psw-btn--small"
                        onClick={() => handleDelete(r.rel)}
                        disabled={busyRel === r.rel || bulkBusy}
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          {busyRel === r.rel
                            ? (lang === 'de' ? 'löschen …' : 'deleting …')
                            : <><IconTrash size={12} /> {lang === 'de' ? 'Löschen' : 'Delete'}</>}
                        </span>
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <div className="psw-modal-footer">
          <button className="psw-btn psw-btn--primary" onClick={onClose}>
            {lang === 'de' ? 'Fertig' : 'Done'}
          </button>
        </div>
      </div>
    </div>
  )
}
