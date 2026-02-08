/**
 * Dataview Widget
 * CodeMirror widget for rendering Dataview query results inline
 */

import { WidgetType } from '@codemirror/view'
import type { Note } from '../../../../../shared/types'
import { renderResult } from '../../../../utils/dataview'
import { useDataviewStore } from '../../../../stores/dataviewStore'
import { sanitizeHtml, escapeHtml } from '../../../../utils/sanitize'

export class DataviewWidget extends WidgetType {
  private container: HTMLElement | null = null
  private rendered: boolean = false

  constructor(
    readonly query: string,
    readonly notes: Note[],
    readonly language: 'de' | 'en',
    readonly onNoteClick?: (notePath: string) => void
  ) {
    super()
  }

  eq(other: DataviewWidget): boolean {
    return other.query === this.query && other.notes.length === this.notes.length
  }

  toDOM(): HTMLElement {
    this.container = document.createElement('div')
    this.container.className = 'dataview-widget'

    // Show loading state initially
    this.container.innerHTML = '<div class="dataview-loading"><span class="dataview-spinner"></span> Loading...</div>'

    // Render asynchronously to not block the editor
    this.renderAsync()

    return this.container
  }

  private async renderAsync(): Promise<void> {
    console.log('[DataviewWidget] renderAsync called, query:', this.query.slice(0, 50), 'notes:', this.notes.length)
    if (!this.container || this.rendered) {
      console.log('[DataviewWidget] Skipping - container:', !!this.container, 'rendered:', this.rendered)
      return
    }
    this.rendered = true

    try {
      // Small delay to let the editor update first
      await new Promise(resolve => setTimeout(resolve, 10))

      // Execute query using the store (with caching and indexes)
      const store = useDataviewStore.getState()
      console.log('[DataviewWidget] Executing query...')
      const result = store.executeQuery(this.query, this.notes)
      console.log('[DataviewWidget] Query result:', result.type, 'rows:', result.rows?.length, 'error:', result.error)

      // Render result
      const html = renderResult(result, {
        language: this.language,
        maxRows: 50
      })
      console.log('[DataviewWidget] Rendered HTML length:', html.length)

      if (this.container) {
        this.container.innerHTML = sanitizeHtml(html)

        // Add click handlers for note links
        this.setupLinkHandlers()
      }
    } catch (error) {
      console.error('[DataviewWidget] Render error:', error)
      if (this.container) {
        this.container.innerHTML = `<div class="dataview-error">
          <span class="dataview-error-icon">⚠️</span>
          <span class="dataview-error-message">Error: ${escapeHtml(error instanceof Error ? error.message : 'Unknown error')}</span>
        </div>`
      }
    }
  }

  private setupLinkHandlers(): void {
    if (!this.container || !this.onNoteClick) return

    const links = this.container.querySelectorAll('.dataview-link')
    for (const link of links) {
      link.addEventListener('click', (e) => {
        e.preventDefault()
        const notePath = (link as HTMLElement).dataset.notePath
        if (notePath && this.onNoteClick) {
          this.onNoteClick(notePath)
        }
      })
    }
  }

  updateDOM(): boolean {
    // Return false to indicate we want a new widget
    return false
  }

  ignoreEvent(event: Event): boolean {
    // Don't ignore click events so links work
    return event.type !== 'click'
  }

  destroy(): void {
    this.container = null
    this.rendered = false
  }
}

/**
 * Create a placeholder widget for when data is not yet available
 */
export class DataviewPlaceholderWidget extends WidgetType {
  constructor(readonly query: string) {
    super()
  }

  eq(other: DataviewPlaceholderWidget): boolean {
    return other.query === this.query
  }

  toDOM(): HTMLElement {
    const container = document.createElement('div')
    container.className = 'dataview-widget dataview-placeholder'
    container.innerHTML = `<div class="dataview-loading">
      <span class="dataview-spinner"></span>
      <span>Dataview query...</span>
    </div>`
    return container
  }

  ignoreEvent(): boolean {
    return true
  }
}

/**
 * Create an error widget for parse errors
 */
export class DataviewErrorWidget extends WidgetType {
  constructor(readonly error: string) {
    super()
  }

  eq(other: DataviewErrorWidget): boolean {
    return other.error === this.error
  }

  toDOM(): HTMLElement {
    const container = document.createElement('div')
    container.className = 'dataview-widget dataview-error-widget'
    container.innerHTML = `<div class="dataview-error">
      <span class="dataview-error-icon">⚠️</span>
      <span class="dataview-error-message">${this.escapeHtml(this.error)}</span>
    </div>`
    return container
  }

  private escapeHtml(text: string): string {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    }
    return text.replace(/[&<>"']/g, m => map[m])
  }

  ignoreEvent(): boolean {
    return true
  }
}
