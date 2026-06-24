import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useNotesStore, createNoteFromFile } from '../../stores/notesStore'
import { useTranslation } from '../../utils/translations'
import { PanelHeader } from '../Shared/PanelHeader'
import {
  searchSemanticScholar,
  searchOpenAlex,
  formatAuthors,
  generateCitation,
  generateLiteratureNote,
  generateLiteratureNoteFilename,
  FIELDS_OF_STUDY,
  type ResearchSource,
  type SemanticScholarPaper,
  type SemanticScholarSearchFilters
} from '../../services/semanticScholarService'

interface SemanticScholarPanelProps {
  onClose: () => void
}

export const SemanticScholarPanel: React.FC<SemanticScholarPanelProps> = ({ onClose }) => {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SemanticScholarPaper[]>([])
  const [totalResults, setTotalResults] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedPaper, setExpandedPaper] = useState<string | null>(null)
  const [showFilters, setShowFilters] = useState(false)
  const [source, setSource] = useState<ResearchSource>('semantic-scholar')
  const [filters, setFilters] = useState<SemanticScholarSearchFilters>({
    limit: 10,
    minCitationCount: 0
  })
  const [yearFrom, setYearFrom] = useState('')
  const [yearTo, setYearTo] = useState('')
  const [fieldOfStudy, setFieldOfStudy] = useState('')
  const [openAccessOnly, setOpenAccessOnly] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const latestSearchRef = useRef(0)

  const { vaultPath, addNote, selectNote: selectNoteInStore } = useNotesStore()
  const { t } = useTranslation()

  // Focus input on mount
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100)
  }, [])

  // Build current filters from state
  const minCitations = filters.minCitationCount || 0
  const filterKey = `${source}|${yearFrom}|${yearTo}|${fieldOfStudy}|${minCitations}|${openAccessOnly}`

  const buildCurrentFilters = useCallback((): SemanticScholarSearchFilters => {
    const f: SemanticScholarSearchFilters = { limit: 20 }
    if (yearFrom || yearTo) {
      f.year = yearFrom && yearTo ? `${yearFrom}-${yearTo}` : yearFrom ? `${yearFrom}-` : `-${yearTo}`
    }
    if (fieldOfStudy) f.fieldsOfStudy = fieldOfStudy
    if (minCitations > 0) f.minCitationCount = minCitations
    if (openAccessOnly) f.openAccessPdf = true
    return f
  }, [yearFrom, yearTo, fieldOfStudy, minCitations, openAccessOnly])

  const performSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([])
      setTotalResults(0)
      return
    }
    const searchId = latestSearchRef.current + 1
    latestSearchRef.current = searchId
    setIsLoading(true)
    setError(null)
    try {
      const f = buildCurrentFilters()
      const result = source === 'openalex'
        ? await searchOpenAlex(searchQuery, f)
        : await searchSemanticScholar(searchQuery, f)
      if (searchId !== latestSearchRef.current) return

      if (result.error === 'rate_limited') {
        setError(source === 'openalex' ? t('semanticScholar.openAlexRateLimited') : t('semanticScholar.rateLimited'))
        setResults([])
        setTotalResults(0)
      } else if (result.error) {
        setError(t('semanticScholar.error'))
        setResults([])
        setTotalResults(0)
      } else {
        setResults(result.papers)
        setTotalResults(result.total)
        if (result.warning === 'missing_api_key') {
          setError(t('semanticScholar.openAlexApiHint'))
        }
      }
    } catch (err) {
      if (searchId !== latestSearchRef.current) return
      console.error('[SemanticScholar] Search error:', err)
      setError(t('semanticScholar.error'))
      setResults([])
    } finally {
      if (searchId === latestSearchRef.current) {
        setIsLoading(false)
      }
    }
  }, [buildCurrentFilters, source, t])

  // Store performSearch in a ref so handleKeyDown always has the latest version
  const performSearchRef = useRef(performSearch)
  performSearchRef.current = performSearch

  // Debounced auto-search on query or filter change
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }

    if (!query.trim()) {
      setResults([])
      setTotalResults(0)
      return
    }

    const debounceMs = filterKey === 'semantic-scholar||||0|false' ? 1200 : 1800
    searchTimeoutRef.current = setTimeout(() => {
      performSearchRef.current(query)
    }, debounceMs)

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
    }
  }, [query, filterKey])

  // Zitation einfügen
  const insertCitation = useCallback((paper: SemanticScholarPaper) => {
    const citation = generateCitation(paper)
    window.dispatchEvent(new CustomEvent('insert-text-at-cursor', { detail: citation }))
  }, [])

  // Literaturnotiz erstellen
  const createNote = useCallback(async (paper: SemanticScholarPaper) => {
    if (!vaultPath) return

    const content = generateLiteratureNote(paper)
    const filename = generateLiteratureNoteFilename(paper)
    const literaturePath = `${vaultPath}/Literatur`

    try {
      await window.electronAPI.ensureDir(literaturePath)
      const filePath = `${literaturePath}/${filename}`
      const relativePath = `Literatur/${filename}`

      await window.electronAPI.writeFile(filePath, content)
      const newNote = await createNoteFromFile(filePath, relativePath, content)
      addNote(newNote)
      selectNoteInStore(newNote.id)
    } catch (err) {
      console.error('[SemanticScholar] Error creating note:', err)
    }
  }, [vaultPath, addNote, selectNoteInStore])

  // Keyboard: Enter forces immediate search, Escape closes
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
      performSearchRef.current(query)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }, [query, onClose])

  return (
    <div className="semantic-scholar-panel">
      <PanelHeader
        icon={
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
          </svg>
        }
        title="Research"
        onClose={onClose}
        closeTitle={t('panel.close')}
      />

      <div className="semantic-scholar-search">
        <div className="semantic-scholar-source-toggle">
          <button
            className={source === 'semantic-scholar' ? 'active' : ''}
            onClick={() => setSource('semantic-scholar')}
          >
            Semantic Scholar
          </button>
          <button
            className={source === 'openalex' ? 'active' : ''}
            onClick={() => setSource('openalex')}
          >
            OpenAlex
          </button>
        </div>

        <div className="semantic-scholar-search-row">
          <div className="semantic-scholar-input-wrapper">
            <svg className="semantic-scholar-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              ref={inputRef}
              type="text"
              className="semantic-scholar-input"
              placeholder={source === 'openalex' ? t('semanticScholar.openAlexPlaceholder') : t('semanticScholar.placeholder')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
            />
          </div>
          <button
            className={`semantic-scholar-filter-btn ${showFilters ? 'active' : ''}`}
            onClick={() => setShowFilters(!showFilters)}
            title={t('semanticScholar.filters')}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
            </svg>
          </button>
        </div>

        {showFilters && (
          <div className="semantic-scholar-filters">
            <div className="semantic-scholar-filter-row">
              <label>{t('semanticScholar.year')}</label>
              <div className="semantic-scholar-year-range">
                <input
                  type="number"
                  placeholder="Von"
                  value={yearFrom}
                  onChange={(e) => setYearFrom(e.target.value)}
                  min="1900"
                  max="2030"
                />
                <span>–</span>
                <input
                  type="number"
                  placeholder="Bis"
                  value={yearTo}
                  onChange={(e) => setYearTo(e.target.value)}
                  min="1900"
                  max="2030"
                />
              </div>
            </div>
            <div className="semantic-scholar-filter-row">
              <label>{t('semanticScholar.field')}</label>
              <select
                value={fieldOfStudy}
                onChange={(e) => setFieldOfStudy(e.target.value)}
                disabled={source === 'openalex'}
                title={source === 'openalex' ? t('semanticScholar.openAlexFieldHint') : undefined}
              >
                <option value="">{t('semanticScholar.allFields')}</option>
                {FIELDS_OF_STUDY.map(field => (
                  <option key={field} value={field}>{field}</option>
                ))}
              </select>
            </div>
            <div className="semantic-scholar-filter-row">
              <label>{t('semanticScholar.minCitations')}</label>
              <input
                type="number"
                value={filters.minCitationCount || ''}
                onChange={(e) => setFilters(f => ({ ...f, minCitationCount: parseInt(e.target.value) || 0 }))}
                min="0"
                placeholder="0"
              />
            </div>
            <div className="semantic-scholar-filter-row">
              <label className="semantic-scholar-checkbox-label">
                <input
                  type="checkbox"
                  checked={openAccessOnly}
                  onChange={(e) => setOpenAccessOnly(e.target.checked)}
                />
                {t('semanticScholar.openAccessOnly')}
              </label>
            </div>
          </div>
        )}
      </div>

      <div className="semantic-scholar-content">
        {isLoading ? (
          <div className="semantic-scholar-loading">{t('semanticScholar.searching')}</div>
        ) : error ? (
          <div className="semantic-scholar-error">{error}</div>
        ) : results.length === 0 && query ? (
          <div className="semantic-scholar-empty">{t('semanticScholar.noResults')}</div>
        ) : results.length === 0 ? (
          <div className="semantic-scholar-empty semantic-scholar-hint">
            {t('semanticScholar.hint')}
          </div>
        ) : (
          <>
            {totalResults > 0 && (
              <div className="semantic-scholar-result-count">
                {totalResults.toLocaleString()} {t('semanticScholar.resultsFound')} · {source === 'openalex' ? 'OpenAlex' : 'Semantic Scholar'}
              </div>
            )}
            {results.map((paper) => (
              <div
                key={paper.paperId}
                className={`semantic-scholar-result panel-card ${expandedPaper === paper.paperId ? 'expanded' : ''}`}
              >
                <div
                  className="semantic-scholar-result-header"
                  onClick={() => setExpandedPaper(expandedPaper === paper.paperId ? null : paper.paperId)}
                >
                  <div className="semantic-scholar-result-title">{paper.title}</div>
                  <div className="semantic-scholar-result-meta">
                    <span className="semantic-scholar-result-authors">{formatAuthors(paper)}</span>
                    {paper.year && <span className="semantic-scholar-result-year">{paper.year}</span>}
                    {paper.citationCount != null && paper.citationCount > 0 && (
                      <span className="semantic-scholar-result-citations">
                        {paper.citationCount} {t('semanticScholar.citations')}
                      </span>
                    )}
                    {paper.openAccessPdf?.url && (
                      <span className="semantic-scholar-badge oa">OA</span>
                    )}
                    {paper.source === 'openalex' && (
                      <span className="semantic-scholar-badge source">OpenAlex</span>
                    )}
                  </div>
                </div>

                {expandedPaper === paper.paperId && (
                  <div className="semantic-scholar-result-details">
                    {paper.abstract && (
                      <div className="semantic-scholar-abstract">
                        <strong>Abstract:</strong>
                        <p>{paper.abstract}</p>
                      </div>
                    )}
                    {paper.venue && (
                      <div className="semantic-scholar-venue">
                        <strong>Venue:</strong> {paper.venue}
                      </div>
                    )}
                    {paper.topics && paper.topics.length > 0 && (
                      <div className="semantic-scholar-venue">
                        <strong>Topics:</strong> {paper.topics.join(', ')}
                      </div>
                    )}
                    <div className="semantic-scholar-actions">
                      <button
                        className="semantic-scholar-action-btn"
                        onClick={() => insertCitation(paper)}
                        title={t('semanticScholar.insertCitation')}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M6 9a6 6 0 0 1 12 0c0 3-2 5-4 6v3H10v-3c-2-1-4-3-4-6z"/>
                        </svg>
                        {t('semanticScholar.cite')}
                      </button>
                      <button
                        className="semantic-scholar-action-btn"
                        onClick={() => createNote(paper)}
                        title={t('semanticScholar.createNote')}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                          <polyline points="14 2 14 8 20 8"/>
                          <line x1="12" y1="18" x2="12" y2="12"/>
                          <line x1="9" y1="15" x2="15" y2="15"/>
                        </svg>
                        {t('semanticScholar.note')}
                      </button>
                      {paper.openAccessPdf?.url && (
                        <button
                          className="semantic-scholar-action-btn"
                          onClick={() => window.open(paper.openAccessPdf!.url, '_blank')}
                          title="PDF"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                            <polyline points="14 2 14 8 20 8"/>
                          </svg>
                          PDF
                        </button>
                      )}
                      {paper.url && (
                        <button
                          className="semantic-scholar-action-btn"
                          onClick={() => window.open(paper.url, '_blank')}
                          title={t('semanticScholar.openInBrowser')}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                            <polyline points="15 3 21 3 21 9"/>
                            <line x1="10" y1="14" x2="21" y2="3"/>
                          </svg>
                          Link
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
