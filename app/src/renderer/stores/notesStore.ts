import { create } from 'zustand'
import type { Note, FileEntry } from '../../shared/types'
import { extractLinks, extractTags, extractTitle, generateNoteId, extractHeadings, extractBlocks } from '../utils/linkExtractor'

interface NotesState {
  vaultPath: string | null
  notes: Note[]
  fileTree: FileEntry[]
  selectedNoteId: string | null
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
  selectPdf: (path: string | null) => void
  selectImage: (path: string | null) => void
  setLoading: (loading: boolean) => void

  // Computed
  getSelectedNote: () => Note | undefined
  getNoteByPath: (path: string) => Note | undefined
  getNoteById: (id: string) => Note | undefined
}

export const useNotesStore = create<NotesState>((set, get) => ({
  vaultPath: null,
  notes: [],
  fileTree: [],
  selectedNoteId: null,
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

  selectPdf: (path) => set({ selectedPdfPath: path, selectedNoteId: null, selectedImagePath: null }),

  selectImage: (path) => set({ selectedImagePath: path, selectedNoteId: null, selectedPdfPath: null }),

  setLoading: (loading) => set({ isLoading: loading }),
  
  getSelectedNote: () => {
    const state = get()
    return state.notes.find(n => n.id === state.selectedNoteId)
  },
  
  getNoteByPath: (path) => {
    return get().notes.find(n => n.path === path)
  },
  
  getNoteById: (id) => {
    return get().notes.find(n => n.id === id)
  }
}))

// Hilfsfunktion zum Neuberechnen der Backlinks
function recalculateBacklinks(notes: Note[]): Note[] {
  return notes.map(note => {
    const incomingLinks: string[] = []

    // Finde alle Notizen, die auf diese Notiz verlinken
    for (const otherNote of notes) {
      if (otherNote.id === note.id) continue

      // Prüfe jeden ausgehenden Link der anderen Notiz
      for (const linkText of otherNote.outgoingLinks) {
        const linkLower = linkText.toLowerCase()
        const titleLower = note.title.toLowerCase()
        const pathWithoutExt = note.path.replace('.md', '').toLowerCase()
        const fileNameWithoutExt = note.path.split('/').pop()?.replace('.md', '').toLowerCase() || ''

        // PDF-Link Matching: [[document.pdf]] -> PDF-Companion
        if (linkLower.endsWith('.pdf') && note.sourcePdf) {
          const pdfFileName = note.sourcePdf.split('/').pop()?.toLowerCase() || ''
          const linkFileName = linkLower.split('/').pop() || linkLower
          if (pdfFileName === linkFileName || note.sourcePdf.toLowerCase() === linkLower) {
            incomingLinks.push(otherNote.id)
            break
          }
        }

        // Vergleiche mit verschiedenen Varianten
        if (linkLower === titleLower ||
            linkLower === pathWithoutExt ||
            linkLower === fileNameWithoutExt) {
          incomingLinks.push(otherNote.id)
          break // Nur einmal pro Notiz zählen
        }
      }
    }

    return { ...note, incomingLinks }
  })
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
