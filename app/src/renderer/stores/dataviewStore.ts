/**
 * Dataview Store
 * Manages query caching and indexes for fast Dataview query execution
 */

import { create } from 'zustand'
import type { Note, DataviewResult, NoteFrontmatter } from '../../shared/types'
import { runQuery, ExecutorOptions } from '../utils/dataview'
import { parseFrontmatter } from '../utils/metadataExtractor'

interface QueryCacheEntry {
  result: DataviewResult
  timestamp: number
  queryHash: string
}

interface DataviewState {
  // Indexes for O(1) lookups
  tagIndex: Map<string, Set<string>>        // tag -> noteIds
  folderIndex: Map<string, Set<string>>     // folder -> noteIds
  fieldIndex: Map<string, Set<string>>      // fieldName -> noteIds that have this field

  // Query cache
  queryCache: Map<string, QueryCacheEntry>
  cacheTTL: number  // Time to live in ms (default: 5000)

  // Parsed frontmatter cache
  frontmatterCache: Map<string, NoteFrontmatter>

  // Actions
  rebuildIndexes: (notes: Note[]) => void
  executeQuery: (queryString: string, notes: Note[]) => DataviewResult
  invalidateCache: (noteId?: string) => void
  clearCache: () => void
  getFrontmatter: (note: Note) => NoteFrontmatter
}

/**
 * Generate a hash for a query string (for caching)
 */
function hashQuery(query: string, noteCount: number): string {
  let hash = 0
  const str = query + ':' + noteCount
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return Math.abs(hash).toString(36)
}

export const useDataviewStore = create<DataviewState>((set, get) => ({
  tagIndex: new Map(),
  folderIndex: new Map(),
  fieldIndex: new Map(),
  queryCache: new Map(),
  cacheTTL: 5000,
  frontmatterCache: new Map(),

  /**
   * Rebuild all indexes from notes
   * Should be called when vault is loaded or notes change significantly
   * Note: frontmatter cache is populated by Sidebar when loading notes
   */
  rebuildIndexes: (notes: Note[]) => {
    const startTime = Date.now()
    const state = get()

    const tagIndex = new Map<string, Set<string>>()
    const folderIndex = new Map<string, Set<string>>()
    const fieldIndex = new Map<string, Set<string>>()
    // Keep existing frontmatter cache - it's populated by Sidebar from note cache
    const frontmatterCache = new Map(state.frontmatterCache)

    for (const note of notes) {
      // Index tags
      for (const tag of note.tags) {
        const tagLower = tag.toLowerCase()
        if (!tagIndex.has(tagLower)) {
          tagIndex.set(tagLower, new Set())
        }
        tagIndex.get(tagLower)!.add(note.id)
      }

      // Index folder
      const pathParts = note.path.split('/')
      pathParts.pop() // Remove filename
      const folder = pathParts.join('/')

      if (folder) {
        // Index all folder levels
        let currentPath = ''
        for (const part of pathParts) {
          currentPath = currentPath ? currentPath + '/' + part : part
          if (!folderIndex.has(currentPath)) {
            folderIndex.set(currentPath, new Set())
          }
          folderIndex.get(currentPath)!.add(note.id)
        }
      }

      // Get frontmatter from cache or parse from content
      let frontmatter = frontmatterCache.get(note.id)
      if (!frontmatter && note.content) {
        frontmatter = parseFrontmatter(note.content)
        frontmatterCache.set(note.id, frontmatter)
      }

      // Index frontmatter fields
      if (frontmatter) {
        for (const key of Object.keys(frontmatter)) {
          const keyLower = key.toLowerCase()
          if (!fieldIndex.has(keyLower)) {
            fieldIndex.set(keyLower, new Set())
          }
          fieldIndex.get(keyLower)!.add(note.id)
        }
      }
    }

    console.log(`[Dataview] Indexes rebuilt for ${notes.length} notes in ${Date.now() - startTime}ms`)
    console.log(`[Dataview] Tags: ${tagIndex.size}, Folders: ${folderIndex.size}, Fields: ${fieldIndex.size}, Frontmatter: ${frontmatterCache.size}`)

    set({
      tagIndex,
      folderIndex,
      fieldIndex,
      frontmatterCache,
      queryCache: new Map() // Clear cache when indexes change
    })
  },

  /**
   * Execute a Dataview query with caching
   */
  executeQuery: (queryString: string, notes: Note[]): DataviewResult => {
    const state = get()
    const trimmedQuery = queryString.trim()

    // Check cache
    const queryHash = hashQuery(trimmedQuery, notes.length)
    const cached = state.queryCache.get(queryHash)

    if (cached && Date.now() - cached.timestamp < state.cacheTTL) {
      // Return cached result
      return {
        ...cached.result,
        executionTime: 0 // Indicate cache hit
      }
    }

    // Execute query with indexes and frontmatter cache
    console.log('[DataviewStore] executeQuery called with', notes.length, 'notes')
    const executorOptions: ExecutorOptions = {
      tagIndex: state.tagIndex,
      folderIndex: state.folderIndex,
      frontmatterCache: state.frontmatterCache
    }

    const result = runQuery(trimmedQuery, notes, executorOptions)

    // Cache result
    const newCache = new Map(state.queryCache)
    newCache.set(queryHash, {
      result,
      timestamp: Date.now(),
      queryHash
    })

    // Limit cache size
    if (newCache.size > 100) {
      // Remove oldest entries
      const entries = Array.from(newCache.entries())
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp)
      for (let i = 0; i < 20; i++) {
        newCache.delete(entries[i][0])
      }
    }

    set({ queryCache: newCache })

    return result
  },

  /**
   * Invalidate cache for a specific note or all cache
   */
  invalidateCache: (noteId?: string) => {
    if (noteId) {
      // For now, invalidate all cache when a note changes
      // A more sophisticated approach would track which queries use which notes
      set({ queryCache: new Map() })
    } else {
      set({ queryCache: new Map() })
    }
  },

  /**
   * Clear all cache
   */
  clearCache: () => {
    set({ queryCache: new Map() })
  },

  /**
   * Get cached frontmatter for a note
   */
  getFrontmatter: (note: Note): NoteFrontmatter => {
    const state = get()
    let fm = state.frontmatterCache.get(note.id)

    if (!fm) {
      // Parse and cache
      fm = parseFrontmatter(note.content)
      const newCache = new Map(state.frontmatterCache)
      newCache.set(note.id, fm)
      set({ frontmatterCache: newCache })
    }

    return fm
  }
}))

/**
 * Hook to get executor options with current indexes
 */
export function useDataviewExecutorOptions(): ExecutorOptions {
  const tagIndex = useDataviewStore(s => s.tagIndex)
  const folderIndex = useDataviewStore(s => s.folderIndex)

  return { tagIndex, folderIndex }
}
