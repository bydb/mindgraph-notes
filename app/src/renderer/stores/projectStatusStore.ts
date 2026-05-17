import { create } from 'zustand'
import type {
  DiscoveredProject,
  ProjectStatusCrystallizeInput,
  ProjectStatusResult,
  ProjectPriority,
  LintFinding
} from '../../shared/types'

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
      const input: ProjectStatusCrystallizeInput = {
        vaultPath,
        projectFolderRel: project.folderRel,
        model,
        language
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
    lastResults: new Map()
  })
}))
