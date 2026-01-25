import { create } from 'zustand'
import type { Note, FileEntry } from '../../shared/types'
import { extractLinks, extractTags, extractTitle, generateNoteId, extractHeadings, extractBlocks } from '../utils/linkExtractor'

interface NotesState {
  vaultPath: string | null
  notes: Note[]
  fileTree: FileEntry[]
  selectedNoteId: string | null
  secondarySelectedNoteId: string | null  // Für Text-Split View
  selectedPdfPath: string | null  // Relativer Pfad zum ausgewählten PDF
  selectedImagePath: string | null  // Relativer Pfad zum ausgewählten Bild
  isLoading: boolean

  // Actions
  setVaultPath: (path: string | null) => void
  setFileTree: (tree: FileEntry[]) => void
  setNotes: (notes: Note[]) => void
  addNote: (note: Note) => void
  updateNote: (id: string, updates: Partial<Note>) => void
  updateNotePath: (oldId: string, newPath: string, newId: string) => void
  removeNote: (id: string) => void
  selectNote: (id: string | null) => void
  selectSecondaryNote: (id: string | null) => void  // Für Text-Split View
  selectPdf: (path: string | null) => void
  selectImage: (path: string | null) => void
  setLoading: (loading: boolean) => void

  // Computed
  getSelectedNote: () => Note | undefined
  getSecondarySelectedNote: () => Note | undefined  // Für Text-Split View
  getNoteByPath: (path: string) => Note | undefined
  getNoteById: (id: string) => Note | undefined
}

export const useNotesStore = create<NotesState>((set, get) => ({
  vaultPath: null,
  notes: [],
  fileTree: [],
  selectedNoteId: null,
  secondarySelectedNoteId: null,
  selectedPdfPath: null,
  selectedImagePath: null,
  isLoading: false,
  
  setVaultPath: (path) => {
    set({ vaultPath: path })
    // Vault-Pfad persistent speichern
    if (path) {
      window.electronAPI.setLastVault(path)
    }
  },
  
  setFileTree: (tree) => set({ fileTree: tree }),
  
  setNotes: (notes) => {
    set({ notes: recalculateBacklinks(notes) })
  },
  
  addNote: (note) => set((state) => {
    // Prüfe ob Notiz mit gleicher ID oder gleichem Pfad bereits existiert
    const existingIndex = state.notes.findIndex(n => n.id === note.id || n.path === note.path)
    if (existingIndex !== -1) {
      // Update existierende Notiz statt Duplikat zu erstellen
      const newNotes = [...state.notes]
      newNotes[existingIndex] = { ...newNotes[existingIndex], ...note }
      return { notes: recalculateBacklinks(newNotes) }
    }
    const newNotes = [...state.notes, note]
    return { notes: recalculateBacklinks(newNotes) }
  }),
  
  updateNote: (id, updates) => set((state) => {
    const newNotes = state.notes.map(n =>
      n.id === id ? { ...n, ...updates } : n
    )
    // Immer Backlinks neu berechnen, da sich Links geändert haben könnten
    return { notes: recalculateBacklinks(newNotes) }
  }),

  updateNotePath: (oldId, newPath, newId) => set((state) => {
    const newTitle = extractTitle('', newPath.split('/').pop() || newPath)
    const newNotes = state.notes.map(n =>
      n.id === oldId
        ? { ...n, id: newId, path: newPath, title: newTitle }
        : n
    )
    // Update selectedNoteId if the renamed note was selected
    const newSelectedId = state.selectedNoteId === oldId ? newId : state.selectedNoteId
    return {
      notes: recalculateBacklinks(newNotes),
      selectedNoteId: newSelectedId
    }
  }),

  removeNote: (id) => set((state) => {
    const newNotes = state.notes.filter(n => n.id !== id)
    return { notes: recalculateBacklinks(newNotes) }
  }),
  
  selectNote: (id) => set({ selectedNoteId: id, selectedPdfPath: null, selectedImagePath: null }),

  selectSecondaryNote: (id) => set({ secondarySelectedNoteId: id }),

  selectPdf: (path) => set({ selectedPdfPath: path, selectedNoteId: null, selectedImagePath: null }),

  selectImage: (path) => set({ selectedImagePath: path, selectedNoteId: null, selectedPdfPath: null }),

  setLoading: (loading) => set({ isLoading: loading }),
  
  getSelectedNote: () => {
    const state = get()
    return state.notes.find(n => n.id === state.selectedNoteId)
  },

  getSecondarySelectedNote: () => {
    const state = get()
    return state.notes.find(n => n.id === state.secondarySelectedNoteId)
  },

  getNoteByPath: (path) => {
    return get().notes.find(n => n.path === path)
  },
  
  getNoteById: (id) => {
    return get().notes.find(n => n.id === id)
  }
}))

// Hilfsfunktion zum Neuberechnen der Backlinks - OPTIMIERT mit Index O(n) statt O(n²)
function recalculateBacklinks(notes: Note[]): Note[] {
  const startTime = Date.now()

  // 1. Index aufbauen: Link-Ziel -> Note-ID
  // Jede Notiz kann über mehrere Wege erreicht werden (Titel, Pfad, Dateiname, PDF)
  const linkTargetToNoteId = new Map<string, string>()

  for (const note of notes) {
    const titleLower = note.title.toLowerCase()
    const pathWithoutExt = note.path.replace('.md', '').toLowerCase()
    const fileNameWithoutExt = note.path.split('/').pop()?.replace('.md', '').toLowerCase() || ''

    // Alle Varianten registrieren
    linkTargetToNoteId.set(titleLower, note.id)
    linkTargetToNoteId.set(pathWithoutExt, note.id)
    linkTargetToNoteId.set(fileNameWithoutExt, note.id)

    // PDF-Companion: Auch PDF-Dateinamen registrieren
    if (note.sourcePdf) {
      const pdfFileName = note.sourcePdf.split('/').pop()?.toLowerCase() || ''
      const pdfPath = note.sourcePdf.toLowerCase()
      linkTargetToNoteId.set(pdfFileName, note.id)
      linkTargetToNoteId.set(pdfPath, note.id)
    }
  }

  // 2. Incoming Links berechnen: Für jeden ausgehenden Link schauen, welche Notiz das Ziel ist
  const incomingLinksMap = new Map<string, Set<string>>()

  for (const note of notes) {
    for (const linkText of note.outgoingLinks) {
      const linkLower = linkText.toLowerCase()
      const targetNoteId = linkTargetToNoteId.get(linkLower)

      if (targetNoteId && targetNoteId !== note.id) {
        if (!incomingLinksMap.has(targetNoteId)) {
          incomingLinksMap.set(targetNoteId, new Set())
        }
        incomingLinksMap.get(targetNoteId)!.add(note.id)
      }
    }
  }

  // 3. Notes mit berechneten Backlinks zurückgeben
  const result = notes.map(note => ({
    ...note,
    incomingLinks: Array.from(incomingLinksMap.get(note.id) || [])
  }))

  console.log(`[Backlinks] ${notes.length} Notizen in ${Date.now() - startTime}ms verarbeitet`)
  return result
}

// Hilfsfunktion zum Erstellen einer Note aus Datei-Daten
export async function createNoteFromFile(
  filePath: string,
  relativePath: string,
  content: string
): Promise<Note> {
  const fileName = relativePath.split('/').pop() || relativePath
  const stats = await window.electronAPI.getFileStats(filePath)

  return {
    id: generateNoteId(relativePath),
    path: relativePath,
    title: extractTitle(content, fileName),
    content,
    outgoingLinks: extractLinks(content),
    incomingLinks: [], // Wird später berechnet
    tags: extractTags(content),
    headings: extractHeadings(content),
    blocks: extractBlocks(content),
    createdAt: stats.createdAt,
    modifiedAt: stats.modifiedAt
  }
}
