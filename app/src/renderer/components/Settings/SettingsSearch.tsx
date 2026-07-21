import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from '../../utils/translations'
import { fuzzyMatch, highlightMatch } from '../CommandPalette/CommandPalette'

// Settings-Suche (Design 1b „Suche zuerst", Befund S1): kuratierter Index über
// Tabs UND wichtige Einzel-Einstellungen. Treffer zeigen den Pfad, ↵/Klick
// springt zum Tab und hebt die Ziel-Zeile kurz hervor (Anker).

export interface SettingsSearchEntry {
  id: string
  tab: string
  label: string
  path: string       // „Gruppe → Tab" bzw. „Tab → Sektion"
  keywords: string   // zusätzliche Suchbegriffe (de/en, Synonyme)
  anchor?: string    // data-settings-anchor-Ziel im Tab-Inhalt
}

interface SettingsSearchProps {
  entries: SettingsSearchEntry[]
  onNavigate: (tab: string, anchor?: string) => void
}

const MAX_RESULTS = 8

export const SettingsSearch: React.FC<SettingsSearchProps> = ({ entries, onNavigate }) => {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const wrapRef = useRef<HTMLDivElement | null>(null)

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    const substring: SettingsSearchEntry[] = []
    const fuzzy: SettingsSearchEntry[] = []
    for (const entry of entries) {
      const haystack = `${entry.label} ${entry.path} ${entry.keywords}`.toLowerCase()
      if (haystack.includes(q)) substring.push(entry)
      else if (fuzzyMatch(q, entry.label.toLowerCase())) fuzzy.push(entry)
    }
    return [...substring, ...fuzzy].slice(0, MAX_RESULTS)
  }, [entries, query])

  useEffect(() => { setSelectedIndex(0) }, [query])

  // Klick außerhalb schließt die Trefferliste
  useEffect(() => {
    if (!query) return
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current?.contains(e.target as Node)) return
      setQuery('')
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [query])

  const pick = (entry: SettingsSearchEntry) => {
    setQuery('')
    onNavigate(entry.tab, entry.anchor)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!results.length) {
      if (e.key === 'Escape') setQuery('')
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(i => (i + 1) % results.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(i => (i - 1 + results.length) % results.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      pick(results[selectedIndex])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setQuery('')
    }
  }

  return (
    <div className="settings-search" ref={wrapRef}>
      <div className="settings-search-field">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="text"
          value={query}
          placeholder={t('settings.search.placeholder')}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          spellCheck={false}
        />
      </div>
      {query.trim() && (
        <div className="settings-search-results">
          {results.length === 0 ? (
            <div className="settings-search-empty">{t('settings.search.noResults')}</div>
          ) : (
            <>
              {results.map((entry, i) => (
                <button
                  key={entry.id}
                  className={`settings-search-result ${i === selectedIndex ? 'selected' : ''}`}
                  onClick={() => pick(entry)}
                  onMouseEnter={() => setSelectedIndex(i)}
                >
                  <span className="settings-search-result-label">{highlightMatch(entry.label, query.trim())}</span>
                  <span className="settings-search-result-path">{entry.path}</span>
                </button>
              ))}
              <div className="settings-search-hint">{t('settings.search.hint')}</div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
