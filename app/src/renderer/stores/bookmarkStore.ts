import { create } from 'zustand'

interface BookmarkState {
  bookmarks: string[]  // Array of note IDs

  // Actions
  addBookmark: (noteId: string) => void
  removeBookmark: (noteId: string) => void
  toggleBookmark: (noteId: string) => void
  isBookmarked: (noteId: string) => boolean
  reorderBookmarks: (bookmarks: string[]) => void
  clearBookmarks: () => void
}

// Load bookmarks from localStorage
const loadBookmarks = (): string[] => {
  try {
    const saved = localStorage.getItem('mindgraph-bookmarks')
    return saved ? JSON.parse(saved) : []
  } catch {
    return []
  }
}

// Save bookmarks to localStorage
const saveBookmarks = (bookmarks: string[]) => {
  localStorage.setItem('mindgraph-bookmarks', JSON.stringify(bookmarks))
}

export const useBookmarkStore = create<BookmarkState>()((set, get) => ({
  bookmarks: loadBookmarks(),

  addBookmark: (noteId) => {
    const state = get()
    if (state.bookmarks.includes(noteId)) return

    const newBookmarks = [...state.bookmarks, noteId]
    saveBookmarks(newBookmarks)
    set({ bookmarks: newBookmarks })
  },

  removeBookmark: (noteId) => {
    const state = get()
    const newBookmarks = state.bookmarks.filter(id => id !== noteId)
    saveBookmarks(newBookmarks)
    set({ bookmarks: newBookmarks })
  },

  toggleBookmark: (noteId) => {
    const state = get()
    if (state.bookmarks.includes(noteId)) {
      state.removeBookmark(noteId)
    } else {
      state.addBookmark(noteId)
    }
  },

  isBookmarked: (noteId) => {
    return get().bookmarks.includes(noteId)
  },

  reorderBookmarks: (bookmarks) => {
    saveBookmarks(bookmarks)
    set({ bookmarks })
  },

  clearBookmarks: () => {
    saveBookmarks([])
    set({ bookmarks: [] })
  }
}))
