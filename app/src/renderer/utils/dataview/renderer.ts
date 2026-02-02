/**
 * Dataview Result Renderer
 * Renders query results as HTML
 */

import type { DataviewResult } from '../../../shared/types'
import { getMetadataValue } from '../metadataExtractor'

export interface RendererOptions {
  language?: 'de' | 'en'
  maxRows?: number
}

const translations = {
  de: {
    noResults: 'Keine Ergebnisse',
    error: 'Fehler',
    results: 'Ergebnisse',
    executionTime: 'Ausführungszeit',
    ms: 'ms',
    showMore: 'Mehr anzeigen',
    note: 'Notiz',
  },
  en: {
    noResults: 'No results',
    error: 'Error',
    results: 'results',
    executionTime: 'Execution time',
    ms: 'ms',
    showMore: 'Show more',
    note: 'Note',
  }
}

/**
 * Render a Dataview result as HTML
 */
export function renderResult(result: DataviewResult, options: RendererOptions = {}): string {
  const lang = options.language || 'de'
  const t = translations[lang]

  if (result.error) {
    return renderError(result.error, t)
  }

  if (result.rows.length === 0) {
    return renderEmpty(t)
  }

  switch (result.type) {
    case 'LIST':
      return renderList(result, t, options)
    case 'TABLE':
      return renderTable(result, t, options)
    case 'TASK':
      return renderTaskList(result, t, options)
    default:
      return renderList(result, t, options)
  }
}

/**
 * Render error message
 */
function renderError(error: string, t: typeof translations['de']): string {
  return `<div class="dataview-error">
    <span class="dataview-error-icon">⚠️</span>
    <span class="dataview-error-message">${t.error}: ${escapeHtml(error)}</span>
  </div>`
}

/**
 * Render empty result
 */
function renderEmpty(t: typeof translations['de']): string {
  return `<div class="dataview-empty">
    <span class="dataview-empty-icon">📭</span>
    <span class="dataview-empty-message">${t.noResults}</span>
  </div>`
}

/**
 * Render LIST result
 */
function renderList(
  result: DataviewResult,
  t: typeof translations['de'],
  options: RendererOptions
): string {
  const maxRows = options.maxRows || 100
  const displayRows = result.rows.slice(0, maxRows)

  let html = '<div class="dataview-container dataview-list">'
  html += '<ul class="dataview-list-items">'

  for (const row of displayRows) {
    const notePath = row.note.path
    const noteTitle = row.note.title || row.metadata.file.name

    html += `<li class="dataview-list-item">
      <a href="#" class="dataview-link" data-note-path="${escapeHtml(notePath)}">${escapeHtml(noteTitle)}</a>
    </li>`
  }

  html += '</ul>'

  if (result.rows.length > maxRows) {
    html += `<div class="dataview-more">+${result.rows.length - maxRows} ${t.showMore}</div>`
  }

  html += renderFooter(result, t)
  html += '</div>'

  return html
}

/**
 * Render TABLE result
 */
function renderTable(
  result: DataviewResult,
  t: typeof translations['de'],
  options: RendererOptions
): string {
  const maxRows = options.maxRows || 100
  const displayRows = result.rows.slice(0, maxRows)
  const columns = result.columns || []

  let html = '<div class="dataview-container dataview-table-container">'
  html += '<table class="dataview-table">'

  // Header
  html += '<thead><tr>'
  html += `<th class="dataview-col-note">${t.note}</th>`
  for (const col of columns) {
    html += `<th>${escapeHtml(formatColumnName(col))}</th>`
  }
  html += '</tr></thead>'

  // Body
  html += '<tbody>'
  for (const row of displayRows) {
    html += '<tr>'

    // Note link
    const notePath = row.note.path
    const noteTitle = row.note.title || row.metadata.file.name
    html += `<td class="dataview-col-note">
      <a href="#" class="dataview-link" data-note-path="${escapeHtml(notePath)}">${escapeHtml(noteTitle)}</a>
    </td>`

    // Column values
    for (const col of columns) {
      const value = row.values?.[col] ?? getMetadataValue(row.metadata, col)
      html += `<td>${formatValue(value)}</td>`
    }

    html += '</tr>'
  }
  html += '</tbody>'
  html += '</table>'

  if (result.rows.length > maxRows) {
    html += `<div class="dataview-more">+${result.rows.length - maxRows} ${t.showMore}</div>`
  }

  html += renderFooter(result, t)
  html += '</div>'

  return html
}

/**
 * Render TASK list result
 */
function renderTaskList(
  result: DataviewResult,
  t: typeof translations['de'],
  options: RendererOptions
): string {
  const maxRows = options.maxRows || 100
  const displayRows = result.rows.slice(0, maxRows)

  // Extract tasks from each note
  const tasks: Array<{ text: string; completed: boolean; notePath: string; noteTitle: string }> = []

  for (const row of displayRows) {
    const content = row.note.content
    const taskRegex = /^[\s]*[-*]\s*\[([ xX])\]\s*(.+)$/gm
    let match

    while ((match = taskRegex.exec(content)) !== null) {
      tasks.push({
        text: match[2],
        completed: match[1].toLowerCase() === 'x',
        notePath: row.note.path,
        noteTitle: row.note.title
      })
    }
  }

  let html = '<div class="dataview-container dataview-task-list">'

  if (tasks.length === 0) {
    html += `<div class="dataview-empty">${t.noResults}</div>`
  } else {
    html += '<ul class="dataview-tasks">'

    for (const task of tasks.slice(0, maxRows)) {
      const checkedAttr = task.completed ? ' checked' : ''
      const completedClass = task.completed ? ' dataview-task-completed' : ''

      html += `<li class="dataview-task-item${completedClass}">
        <input type="checkbox" class="dataview-task-checkbox" disabled${checkedAttr}>
        <span class="dataview-task-text">${escapeHtml(task.text)}</span>
        <a href="#" class="dataview-task-source dataview-link" data-note-path="${escapeHtml(task.notePath)}">${escapeHtml(task.noteTitle)}</a>
      </li>`
    }

    html += '</ul>'

    if (tasks.length > maxRows) {
      html += `<div class="dataview-more">+${tasks.length - maxRows} ${t.showMore}</div>`
    }
  }

  html += renderFooter(result, t)
  html += '</div>'

  return html
}

/**
 * Render footer with stats
 */
function renderFooter(result: DataviewResult, t: typeof translations['de']): string {
  const count = result.rows.length
  const time = result.executionTime || 0

  return `<div class="dataview-footer">
    <span class="dataview-count">${count} ${t.results}</span>
    <span class="dataview-time">${t.executionTime}: ${time}${t.ms}</span>
  </div>`
}

/**
 * Format a column name for display
 */
function formatColumnName(name: string): string {
  // Convert file.name to File Name, status to Status, etc.
  return name
    .replace(/^file\./, '')
    .replace(/([A-Z])/g, ' $1')
    .replace(/[._-]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim()
}

/**
 * Format a value for display
 */
function formatValue(value: unknown): string {
  if (value === undefined || value === null) {
    return '<span class="dataview-null">-</span>'
  }

  if (value instanceof Date) {
    return `<span class="dataview-date">${formatDate(value)}</span>`
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return '<span class="dataview-null">-</span>'
    }
    return value.map(v => formatValue(v)).join(', ')
  }

  if (typeof value === 'boolean') {
    return value
      ? '<span class="dataview-bool dataview-bool-true">✓</span>'
      : '<span class="dataview-bool dataview-bool-false">✗</span>'
  }

  if (typeof value === 'number') {
    return `<span class="dataview-number">${value}</span>`
  }

  // Check for tags
  if (typeof value === 'string' && value.startsWith('#')) {
    return `<span class="dataview-tag">${escapeHtml(value)}</span>`
  }

  return escapeHtml(String(value))
}

/**
 * Format a date for display
 */
function formatDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }
  return text.replace(/[&<>"']/g, m => map[m])
}
