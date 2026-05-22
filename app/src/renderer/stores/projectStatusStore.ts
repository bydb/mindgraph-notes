import { create } from 'zustand'
import type {
  DiscoveredProject,
  ProjectStatusCrystallizeInput,
  ProjectStatusResult,
  ProjectPriority,
  LintFinding,
  ProjectSynonymCache
} from '../../shared/types'
import { useUIStore } from './uiStore'

// Standard-Pfade. Können später per Settings überschrieben werden.
const DEFAULT_PROJECTS_FOLDER = '100 - ✅ Projekte'

interface RunningJob {
  folderRel: string
  startedAt: number
}

interface ProjectStatusState {
  projects: DiscoveredProject[]
  loading: boolean
  lastError: string | null
  lastLoadedAt: number | null
  /** aktuell laufende Crystallize-Jobs (per Projekt-Pfad) */
  runningJobs: Map<string, RunningJob>
  /** zuletzt erzeugte Status-Drafts pro Projekt (für Toast / Click-to-Open) */
  lastResults: Map<string, ProjectStatusResult>
  /** Synonym-Cache pro Projekt-Pfad (folderRel) */
  synonyms: Record<string, ProjectSynonymCache>
  /** aktuell laufende Synonym-Generierungen (per folderRel) */
  generatingSynonyms: Set<string>

  // Actions
  load: (vaultPath: string, projectsFolderRel?: string) => Promise<void>
  crystallize: (
    vaultPath: string,
    project: DiscoveredProject,
    model: string,
    language: 'de' | 'en'
  ) => Promise<ProjectStatusResult>
  markProject: (
    vaultPath: string,
    projectFolderRel: string,
    keywords: string[],
    priority: ProjectPriority
  ) => Promise<{ success: boolean; statusFilePath?: string; error?: string }>
  suggestKeywords: (
    vaultPath: string,
    projectFolderRel: string
  ) => Promise<string[]>
  loadAllSynonyms: (vaultPath: string) => Promise<void>
  generateSynonyms: (vaultPath: string, projectFolderRel: string, model: string) => Promise<{ success: boolean; error?: string }>
  cleanupFindings: (
    vaultPath: string,
    project: DiscoveredProject,
    filePath: string,
    refsToRemove: string[],
    language: 'de' | 'en'
  ) => Promise<{ success: boolean; removedLineCount?: number; remainingFindings?: LintFinding[]; error?: string }>
  deleteDraft: (
    vaultPath: string,
    project: DiscoveredProject,
    draftRel: string
  ) => Promise<{ success: boolean; error?: string }>
  reset: () => void
}

export const useProjectStatusStore = create<ProjectStatusState>((set, get) => ({
  projects: [],
  loading: false,
  lastError: null,
  lastLoadedAt: null,
  runningJobs: new Map(),
  lastResults: new Map(),
  synonyms: {},
  generatingSynonyms: new Set(),

  load: async (vaultPath: string, projectsFolderRel: string = DEFAULT_PROJECTS_FOLDER) => {
    set({ loading: true, lastError: null })
    try {
      const result = await window.electronAPI.projectStatusDiscover(vaultPath, projectsFolderRel)
      if (!result.success) {
        set({ loading: false, lastError: result.error || 'Discovery fehlgeschlagen' })
        return
      }
      set({
        projects: result.projects || [],
        loading: false,
        lastError: null,
        lastLoadedAt: Date.now()
      })
    } catch (err) {
      set({
        loading: false,
        lastError: err instanceof Error ? err.message : 'Unbekannter Fehler beim Laden'
      })
    }
  },

  crystallize: async (vaultPath, project, model, language) => {
    const key = project.folderRel
    const running = get().runningJobs
    if (running.has(key)) {
      return { success: false, error: 'Dieses Projekt wird gerade verarbeitet.' }
    }

    // Job-Lock setzen
    const newRunning = new Map(running)
    newRunning.set(key, { folderRel: key, startedAt: Date.now() })
    set({ runningJobs: newRunning })

    try {
      // Email-Folder aus den Email-Settings übernehmen, damit das Project-Status-
      // Modul die analysierten Mails als 4. Quelle nutzen kann. Fallback auf den
      // Backend-Default (`‼️📧 - emails`), wenn nicht gesetzt.
      const emailFolderRel = useUIStore.getState().email?.inboxFolderName?.trim() || undefined

      const input: ProjectStatusCrystallizeInput = {
        vaultPath,
        projectFolderRel: project.folderRel,
        model,
        language,
        ...(emailFolderRel ? { emailFolderRel } : {})
      }
      const result = await window.electronAPI.projectStatusCrystallize(input)

      // Job-Lock entfernen
      const after = new Map(get().runningJobs)
      after.delete(key)
      const newResults = new Map(get().lastResults)
      newResults.set(key, result)
      const nextState: Partial<ProjectStatusState> = { runningJobs: after, lastResults: newResults }

      if (result.success && result.notePath && result.weekTag) {
        const relPath = result.notePath.startsWith(vaultPath)
          ? result.notePath.slice(vaultPath.length + 1)
          : result.notePath
        nextState.projects = get().projects.map(p => {
          if (p.folderRel !== key) return p
          const existingDrafts = p.currentWeekDrafts || (p.currentWeekDraft ? [p.currentWeekDraft] : [])
          const currentWeekDrafts = [relPath, ...existingDrafts.filter(d => d !== relPath)]
          return {
            ...p,
            currentWeekDraft: relPath,
            currentWeekDrafts
          }
        })
      }

      set(nextState)

      return result
    } catch (err) {
      const after = new Map(get().runningJobs)
      after.delete(key)
      set({ runningJobs: after })
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unbekannter Fehler'
      }
    }
  },

  markProject: async (vaultPath, projectFolderRel, keywords, priority) => {
    try {
      const result = await window.electronAPI.projectStatusMark(
        vaultPath,
        projectFolderRel,
        keywords,
        priority
      )
      return result
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unbekannter Fehler'
      }
    }
  },

  suggestKeywords: async (vaultPath, projectFolderRel) => {
    try {
      const result = await window.electronAPI.projectStatusSuggestKeywords(vaultPath, projectFolderRel)
      return result.success && result.keywords ? result.keywords : []
    } catch {
      return []
    }
  },

  loadAllSynonyms: async (vaultPath: string) => {
    const { projects } = get()
    if (projects.length === 0) return
    const updates: Record<string, ProjectSynonymCache> = {}
    await Promise.all(projects.map(async p => {
      try {
        const result = await window.electronAPI.projectStatusLoadSynonyms(vaultPath, p.folderRel)
        if (result.success && result.cache) {
          updates[p.folderRel] = result.cache
        }
      } catch {
        // einzelner Fehler kippt die Bulk-Operation nicht
      }
    }))
    set({ synonyms: { ...get().synonyms, ...updates } })
  },

  generateSynonyms: async (vaultPath, projectFolderRel, model) => {
    const current = get().generatingSynonyms
    if (current.has(projectFolderRel)) {
      return { success: false, error: 'Synonyme werden bereits generiert' }
    }
    const next = new Set(current)
    next.add(projectFolderRel)
    set({ generatingSynonyms: next })
    try {
      const result = await window.electronAPI.projectStatusGenerateSynonyms(vaultPath, projectFolderRel, model)
      const after = new Set(get().generatingSynonyms)
      after.delete(projectFolderRel)
      if (result.success && result.cache) {
        set({
          synonyms: { ...get().synonyms, [projectFolderRel]: result.cache },
          generatingSynonyms: after
        })
        return { success: true }
      }
      set({ generatingSynonyms: after })
      return { success: false, error: result.error || 'Generierung fehlgeschlagen' }
    } catch (err) {
      const after = new Set(get().generatingSynonyms)
      after.delete(projectFolderRel)
      set({ generatingSynonyms: after })
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unbekannter Fehler'
      }
    }
  },

  cleanupFindings: async (vaultPath, project, filePath, refsToRemove, language) => {
    try {
      const result = await window.electronAPI.projectStatusCleanup(vaultPath, filePath, refsToRemove, language)
      // Bei Erfolg lastResult aktualisieren: remainingFindings nachziehen
      if (result.success) {
        const newResults = new Map(get().lastResults)
        const prev = newResults.get(project.folderRel)
        if (prev) {
          newResults.set(project.folderRel, {
            ...prev,
            findings: result.remainingFindings || []
          })
          set({ lastResults: newResults })
        }
      }
      return result
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unbekannter Fehler'
      }
    }
  },

  deleteDraft: async (vaultPath, project, draftRel) => {
    try {
      // Absoluter Pfad für den IPC-Aufruf (assertSafePath nimmt absolute Pfade)
      const draftAbs = draftRel.startsWith(vaultPath) ? draftRel : `${vaultPath}/${draftRel}`
      const result = await window.electronAPI.projectStatusDeleteDraft(vaultPath, draftAbs)
      if (result.success) {
        // Local State: Draft aus dem Projekt entfernen
        const projects = get().projects.map(p => {
          if (p.folderRel !== project.folderRel) return p
          const remaining = (p.currentWeekDrafts || []).filter(d => d !== draftRel)
          return {
            ...p,
            currentWeekDrafts: remaining,
            currentWeekDraft: remaining[0] || null
          }
        })
        // Falls der gelöschte Draft auch der letzte gemerkte lastResult war → entfernen
        const lastResults = new Map(get().lastResults)
        const prev = lastResults.get(project.folderRel)
        if (prev && prev.notePath && (prev.notePath === draftAbs || prev.notePath.endsWith(draftRel))) {
          lastResults.delete(project.folderRel)
        }
        set({ projects, lastResults })
      }
      return result
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unbekannter Fehler'
      }
    }
  },

  reset: () => set({
    projects: [],
    lastError: null,
    lastLoadedAt: null,
    runningJobs: new Map(),
    lastResults: new Map(),
    synonyms: {},
    generatingSynonyms: new Set()
  })
}))
