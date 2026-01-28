import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useNotesStore } from '../../stores/notesStore'
import { useUIStore } from '../../stores/uiStore'

interface EmbeddingModel {
  name: string
  size: number
}

interface SimilarNote {
  id: string
  title: string
  path: string
  similarity: number          // Hybrid-Score (gewichtet)
  // Score-Komponenten für Transparenz
  embeddingScore: number      // Reine Embedding-Ähnlichkeit
  hasWikilink: boolean        // Expliziter Wikilink vorhanden
  tagOverlap: number          // Tag-Überlappung (0-1)
  folderProximity: number     // Ordner-Nähe (0-1)
}

// Gewichtungen für Hybrid-Score
// Wikilinks > Embeddings, da explizite Links menschliche Entscheidungen sind
// und Embeddings durch KI-generierten Content-Stil verfälscht werden können
const WEIGHTS = {
  embedding: 0.32,      // 32% Embedding-Ähnlichkeit (reduziert wegen KI-Stil-Problem)
  wikilink: 0.40,       // 40% Wikilink-Bonus (erhöht - menschliche Entscheidung)
  tags: 0.23,           // 23% Tag-Überlappung
  folder: 0.05          // 5% Ordner-Nähe (reduziert)
}

interface SmartConnectionsPanelProps {
  onClose: () => void
}

// Extrahiere Wikilinks aus Notiz-Inhalt
function extractWikilinks(content: string): string[] {
  const wikilinks: string[] = []
  // Match [[link]] oder [[link|display]]
  const regex = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g
  let match
  while ((match = regex.exec(content)) !== null) {
    // Normalisiere: lowercase, trimmed
    wikilinks.push(match[1].trim().toLowerCase())
  }
  return wikilinks
}

// Prüfe ob eine Notiz per Wikilink verlinkt ist
function isLinkedViaWikilink(wikilinks: string[], note: { title: string; path: string }): boolean {
  const noteTitle = note.title.toLowerCase()
  // Dateiname ohne .md Extension
  const fileName = note.path.split('/').pop()?.replace('.md', '').toLowerCase() || ''

  return wikilinks.some(link => {
    // Exakter Match auf Titel oder Dateiname
    if (link === noteTitle || link === fileName) return true
    // Teilmatch für lange Dateinamen (z.B. "2025 - Gerlich - AI Tools..." könnte als "Gerlich" verlinkt sein)
    if (noteTitle.includes(link) || fileName.includes(link)) return true
    if (link.includes(noteTitle) || link.includes(fileName)) return true
    return false
  })
}

// Berechne Tag-Überlappung (Jaccard-Ähnlichkeit)
function calculateTagOverlap(tags1: string[], tags2: string[]): number {
  if (tags1.length === 0 && tags2.length === 0) return 0
  if (tags1.length === 0 || tags2.length === 0) return 0

  const set1 = new Set(tags1.map(t => t.toLowerCase()))
  const set2 = new Set(tags2.map(t => t.toLowerCase()))

  const intersection = [...set1].filter(t => set2.has(t)).length
  const union = new Set([...set1, ...set2]).size

  return union > 0 ? intersection / union : 0
}

// Berechne Ordner-Nähe (gemeinsame Pfadtiefe)
function calculateFolderProximity(path1: string, path2: string): number {
  const parts1 = path1.split('/').slice(0, -1) // Ohne Dateiname
  const parts2 = path2.split('/').slice(0, -1)

  if (parts1.length === 0 && parts2.length === 0) return 1 // Beide im Root

  let commonDepth = 0
  const minLength = Math.min(parts1.length, parts2.length)

  for (let i = 0; i < minLength; i++) {
    if (parts1[i] === parts2[i]) {
      commonDepth++
    } else {
      break
    }
  }

  // Normalisiere auf 0-1 (mehr gemeinsame Ordner = höherer Score)
  const maxDepth = Math.max(parts1.length, parts2.length)
  if (maxDepth === 0) return 1

  return commonDepth / maxDepth
}

// Kürze Text auf maximale Länge für Embedding-Modelle
// nomic-embed-text hat 8192 Token-Limit, aber deutscher Text braucht mehr Tokens
// Sicher: ~6000 Zeichen (~2000 Tokens mit Puffer)
const MAX_EMBEDDING_LENGTH = 6000

function truncateForEmbedding(text: string): string {
  if (text.length <= MAX_EMBEDDING_LENGTH) return text

  // Kürze intelligent: Behalte Anfang (Titel, Zusammenfassung) und Ende (Schluss)
  const halfLength = Math.floor(MAX_EMBEDDING_LENGTH / 2)
  const start = text.slice(0, halfLength)
  const end = text.slice(-halfLength)

  console.log(`[SmartConnections] Text gekürzt: ${text.length} → ${MAX_EMBEDDING_LENGTH} Zeichen`)
  return start + '\n\n[...]\n\n' + end
}

// Berechne Hybrid-Score aus allen Faktoren
function calculateHybridScore(
  embeddingScore: number,
  hasWikilink: boolean,
  tagOverlap: number,
  folderProximity: number
): number {
  const score =
    WEIGHTS.embedding * embeddingScore +
    WEIGHTS.wikilink * (hasWikilink ? 1 : 0) +
    WEIGHTS.tags * tagOverlap +
    WEIGHTS.folder * folderProximity

  return Math.min(1.0, score)
}

// Cosine similarity zwischen zwei Vektoren
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0

  let dotProduct = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }

  if (normA === 0 || normB === 0) return 0
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
}

export const SmartConnectionsPanel: React.FC<SmartConnectionsPanelProps> = ({ onClose }) => {
  const { notes, selectedNoteId, selectNote, vaultPath } = useNotesStore()
  const { ollama: llmSettings } = useUIStore()
  const [embeddingModels, setEmbeddingModels] = useState<EmbeddingModel[]>([])
  const [selectedModel, setSelectedModel] = useState<string>('')
  const [isBackendAvailable, setIsBackendAvailable] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isCalculating, setIsCalculating] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const [similarNotes, setSimilarNotes] = useState<SimilarNote[]>([])
  const [embeddingsCache, setEmbeddingsCache] = useState<Record<string, number[]>>({})
  const [error, setError] = useState<string | null>(null)

  // Aktuelle Notiz
  const currentNote = useMemo(() => {
    if (!selectedNoteId) return null
    return notes.find(n => n.id === selectedNoteId)
  }, [notes, selectedNoteId])

  // Backend (Ollama oder LM Studio) und Modelle prüfen
  useEffect(() => {
    const checkBackend = async () => {
      setIsLoading(true)
      try {
        let available = false
        let models: EmbeddingModel[] = []

        if (llmSettings.backend === 'lm-studio') {
          available = await window.electronAPI.lmstudioCheck(llmSettings.lmStudioPort)
          if (available) {
            models = await window.electronAPI.lmstudioEmbeddingModels(llmSettings.lmStudioPort)
          }
        } else {
          available = await window.electronAPI.ollamaCheck()
          if (available) {
            models = await window.electronAPI.ollamaEmbeddingModels()
          }
        }

        setIsBackendAvailable(available)
        setEmbeddingModels(models)

        if (models.length > 0) {
          // Versuche nomic-embed-text als Standard
          const nomicModel = models.find((m: EmbeddingModel) => m.name.includes('nomic'))
          if (nomicModel) {
            setSelectedModel(nomicModel.name)
          } else {
            setSelectedModel(models[0].name)
          }
        }
      } catch (err) {
        console.error('[SmartConnections] Error checking backend:', err)
        setError('Fehler beim Prüfen des KI-Backends')
      } finally {
        setIsLoading(false)
      }
    }

    checkBackend()
  }, [llmSettings.backend, llmSettings.lmStudioPort])

  // Lade gecachte Embeddings aus .mindgraph/
  useEffect(() => {
    const loadCachedEmbeddings = async () => {
      if (!vaultPath || !selectedModel) return

      try {
        const graphData = await window.electronAPI.loadGraphData(vaultPath) as {
          embeddings?: Record<string, Record<string, number[]>>
        } | null
        if (graphData?.embeddings?.[selectedModel]) {
          setEmbeddingsCache(graphData.embeddings[selectedModel])
          console.log('[SmartConnections] Loaded cached embeddings:', Object.keys(graphData.embeddings[selectedModel]).length)
        }
      } catch (err) {
        console.log('[SmartConnections] No cached embeddings found')
      }
    }

    loadCachedEmbeddings()
  }, [vaultPath, selectedModel])

  // Embedding für Text generieren (mit automatischer Kürzung)
  const getEmbedding = useCallback(async (text: string): Promise<number[] | null> => {
    if (!selectedModel || !text.trim()) return null

    try {
      // Kürze Text falls zu lang für Embedding-Modell
      const truncatedText = truncateForEmbedding(text)

      // Backend-basierte API-Auswahl
      const result = llmSettings.backend === 'lm-studio'
        ? await window.electronAPI.lmstudioEmbeddings(selectedModel, truncatedText, llmSettings.lmStudioPort)
        : await window.electronAPI.ollamaEmbeddings(selectedModel, truncatedText)

      if (result.success && result.embedding) {
        return result.embedding
      }
      console.error('[SmartConnections] Embedding failed:', result.error)
      return null
    } catch (err) {
      console.error('[SmartConnections] Embedding error:', err)
      return null
    }
  }, [selectedModel, llmSettings.backend, llmSettings.lmStudioPort])

  // Ähnliche Notizen berechnen
  const calculateSimilarities = useCallback(async () => {
    if (!currentNote || !selectedModel || !vaultPath) return

    setIsCalculating(true)
    setError(null)
    setSimilarNotes([])

    try {
      // 1. Hole/Generiere Embedding für aktuelle Notiz
      let currentContent = currentNote.content
      if (!currentContent) {
        const contents = await window.electronAPI.readFilesBatch(vaultPath, [currentNote.path])
        currentContent = contents[currentNote.path] || ''
      }

      if (!currentContent.trim()) {
        setError('Aktuelle Notiz ist leer')
        setIsCalculating(false)
        return
      }

      // Extrahiere Wikilinks aus aktueller Notiz für Bonus-Berechnung
      const wikilinks = extractWikilinks(currentContent)
      console.log('[SmartConnections] Found wikilinks:', wikilinks)

      console.log(`[SmartConnections] Generating embedding for "${currentNote.title}" (${currentContent.length} chars)`)
      const currentEmbedding = await getEmbedding(currentContent)
      if (!currentEmbedding) {
        setError(`Konnte Embedding nicht generieren (${currentContent.length} Zeichen). Prüfe Ollama-Logs.`)
        setIsCalculating(false)
        return
      }

      // 2. Berechne Ähnlichkeiten mit anderen Notizen
      const otherNotes = notes.filter(n => n.id !== selectedNoteId && n.path.endsWith('.md'))
      const updatedCache = { ...embeddingsCache }
      const similarities: SimilarNote[] = []

      setProgress({ current: 0, total: otherNotes.length })

      // Batch-Laden der Inhalte für Notizen ohne gecachte Embeddings
      const notesNeedingContent = otherNotes.filter(n => !updatedCache[n.id] && !n.content)
      if (notesNeedingContent.length > 0) {
        const paths = notesNeedingContent.map(n => n.path)
        const contents = await window.electronAPI.readFilesBatch(vaultPath, paths)
        for (const note of notesNeedingContent) {
          const content = contents[note.path]
          if (content) {
            // Temporär speichern
            ;(note as any)._loadedContent = content
          }
        }
      }

      // Verarbeite jede Notiz
      for (let i = 0; i < otherNotes.length; i++) {
        const note = otherNotes[i]
        setProgress({ current: i + 1, total: otherNotes.length })

        let noteEmbedding = updatedCache[note.id]

        // Wenn kein gecachtes Embedding, generiere es
        if (!noteEmbedding) {
          const content = note.content || (note as any)._loadedContent
          if (content && content.trim()) {
            const generatedEmbedding = await getEmbedding(content)
            if (generatedEmbedding) {
              noteEmbedding = generatedEmbedding
              updatedCache[note.id] = generatedEmbedding
            }
          }
        }

        // Berechne Hybrid-Ähnlichkeit
        if (noteEmbedding) {
          const embeddingScore = cosineSimilarity(currentEmbedding, noteEmbedding)
          const hasWikilink = isLinkedViaWikilink(wikilinks, note)
          const tagOverlap = calculateTagOverlap(currentNote.tags || [], note.tags || [])
          const folderProximity = calculateFolderProximity(currentNote.path, note.path)

          // Hybrid-Score berechnen
          const similarity = calculateHybridScore(
            embeddingScore,
            hasWikilink,
            tagOverlap,
            folderProximity
          )

          if (hasWikilink || tagOverlap > 0) {
            console.log(`[SmartConnections] "${note.title}": embed=${(embeddingScore*100).toFixed(0)}%, wikilink=${hasWikilink}, tags=${(tagOverlap*100).toFixed(0)}%, folder=${(folderProximity*100).toFixed(0)}% → hybrid=${(similarity*100).toFixed(0)}%`)
          }

          if (similarity > 0.2) { // Niedrigerer Threshold wegen gewichteter Scores
            similarities.push({
              id: note.id,
              title: note.title,
              path: note.path,
              similarity,
              embeddingScore,
              hasWikilink,
              tagOverlap,
              folderProximity
            })
          }
        }
      }

      // Sortiere nach Ähnlichkeit (absteigend)
      similarities.sort((a, b) => b.similarity - a.similarity)

      // Top 20 anzeigen
      setSimilarNotes(similarities.slice(0, 20))

      // Cache speichern
      if (Object.keys(updatedCache).length > Object.keys(embeddingsCache).length) {
        setEmbeddingsCache(updatedCache)
        try {
          const existingData = await window.electronAPI.loadGraphData(vaultPath) as {
            embeddings?: Record<string, Record<string, number[]>>
            [key: string]: unknown
          } | null
          const graphData = existingData || {}
          if (!graphData.embeddings) {
            graphData.embeddings = {}
          }
          graphData.embeddings[selectedModel] = updatedCache
          await window.electronAPI.saveGraphData(vaultPath, graphData)
          console.log('[SmartConnections] Saved embeddings cache')
        } catch (err) {
          console.error('[SmartConnections] Failed to save cache:', err)
        }
      }
    } catch (err) {
      console.error('[SmartConnections] Error calculating similarities:', err)
      setError('Fehler bei der Berechnung')
    } finally {
      setIsCalculating(false)
    }
  }, [currentNote, selectedModel, vaultPath, notes, selectedNoteId, embeddingsCache, getEmbedding])

  // Automatisch berechnen wenn Notiz gewechselt wird
  useEffect(() => {
    if (currentNote && selectedModel && isBackendAvailable && !isCalculating) {
      // Verzögerung um zu viele Berechnungen zu vermeiden
      const timer = setTimeout(() => {
        calculateSimilarities()
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [selectedNoteId, selectedModel])

  const handleNoteClick = (noteId: string) => {
    selectNote(noteId)
  }

  // Farbe basierend auf Ähnlichkeit
  const getSimilarityColor = (similarity: number): string => {
    if (similarity >= 0.8) return 'var(--color-success)'
    if (similarity >= 0.6) return 'var(--color-warning)'
    return 'var(--accent-color)'
  }

  return (
    <div className="smart-connections-panel">
      <div className="smart-connections-header">
        <div className="smart-connections-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M12 2v4"/>
            <path d="M12 18v4"/>
            <path d="M4.93 4.93l2.83 2.83"/>
            <path d="M16.24 16.24l2.83 2.83"/>
            <path d="M2 12h4"/>
            <path d="M18 12h4"/>
            <path d="M4.93 19.07l2.83-2.83"/>
            <path d="M16.24 7.76l2.83-2.83"/>
          </svg>
          <span>Smart Connections</span>
        </div>
        <button className="smart-connections-close" onClick={onClose} title="Schließen">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <div className="smart-connections-content">
        {isLoading ? (
          <div className="smart-connections-loading">
            <div className="smart-connections-spinner"></div>
            <p>Prüfe {llmSettings.backend === 'lm-studio' ? 'LM Studio' : 'Ollama'}...</p>
          </div>
        ) : !isBackendAvailable ? (
          <div className="smart-connections-unavailable">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <p>{llmSettings.backend === 'lm-studio' ? 'LM Studio' : 'Ollama'} nicht verfügbar</p>
            <span>
              {llmSettings.backend === 'lm-studio'
                ? 'Starte LM Studio und lade ein Embedding-Modell'
                : 'Starte Ollama für KI-basierte Ähnlichkeitsanalyse'}
            </span>
          </div>
        ) : embeddingModels.length === 0 ? (
          <div className="smart-connections-unavailable">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            <p>Kein Embedding-Modell</p>
            <span>
              {llmSettings.backend === 'lm-studio'
                ? 'Lade ein Embedding-Modell in LM Studio'
                : 'Installiere z.B.: ollama pull nomic-embed-text'}
            </span>
          </div>
        ) : !currentNote ? (
          <div className="smart-connections-unavailable">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            <p>Keine Notiz ausgewählt</p>
            <span>Wähle eine Notiz um ähnliche zu finden</span>
          </div>
        ) : (
          <>
            {/* Modell-Auswahl */}
            <div className="smart-connections-model">
              <label>Modell:</label>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                disabled={isCalculating}
              >
                {embeddingModels.map(model => (
                  <option key={model.name} value={model.name}>
                    {model.name}
                  </option>
                ))}
              </select>
              <button
                className="smart-connections-refresh"
                onClick={calculateSimilarities}
                disabled={isCalculating}
                title="Neu berechnen"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="23 4 23 10 17 10"/>
                  <polyline points="1 20 1 14 7 14"/>
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                </svg>
              </button>
            </div>

            {/* Aktuelle Notiz */}
            <div className="smart-connections-current">
              <span className="smart-connections-current-label">Aktuelle Notiz:</span>
              <span className="smart-connections-current-title">{currentNote.title}</span>
            </div>

            {/* Fortschritt oder Ergebnisse */}
            {isCalculating ? (
              <div className="smart-connections-calculating">
                <div className="smart-connections-progress-bar">
                  <div
                    className="smart-connections-progress-fill"
                    style={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }}
                  />
                </div>
                <p>Berechne Ähnlichkeiten... {progress.current}/{progress.total}</p>
              </div>
            ) : error ? (
              <div className="smart-connections-error">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <span>{error}</span>
              </div>
            ) : similarNotes.length === 0 ? (
              <div className="smart-connections-empty">
                <p>Keine ähnlichen Notizen gefunden</p>
                <span>Klicke auf Aktualisieren um zu suchen</span>
              </div>
            ) : (
              <div className="smart-connections-results">
                <div className="smart-connections-results-header">
                  <span>Ähnliche Notizen</span>
                  <span className="smart-connections-results-count">{similarNotes.length}</span>
                </div>
                <div className="smart-connections-legend">
                  <span className="smart-connections-legend-item" title="Expliziter Wikilink (40%)">
                    <span className="smart-connections-badge wikilink" style={{ width: 14, height: 14 }}>
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                      </svg>
                    </span>
                    Link
                  </span>
                  <span className="smart-connections-legend-item" title="Gemeinsame Tags (23%)">
                    <span className="smart-connections-badge tags" style={{ width: 14, height: 14 }}>#</span>
                    Tags
                  </span>
                  <span className="smart-connections-legend-item" title="Ordner-Nähe (5%)">
                    <span className="smart-connections-badge folder" style={{ width: 14, height: 14 }}>
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                      </svg>
                    </span>
                    Ordner
                  </span>
                </div>
                <div className="smart-connections-list">
                  {similarNotes.map(note => (
                    <div
                      key={note.id}
                      className={`smart-connections-item ${note.hasWikilink ? 'has-wikilink' : ''}`}
                      onClick={() => handleNoteClick(note.id)}
                    >
                      <div className="smart-connections-item-header">
                        <span className="smart-connections-item-similarity" style={{ color: getSimilarityColor(note.similarity) }}>
                          {(note.similarity * 100).toFixed(0)}%
                        </span>
                        {/* Score-Indikatoren */}
                        <div className="smart-connections-badges">
                          {note.hasWikilink && (
                            <span className="smart-connections-badge wikilink" title={`Explizit verlinkt (+${(WEIGHTS.wikilink * 100).toFixed(0)}%)`}>
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                              </svg>
                            </span>
                          )}
                          {note.tagOverlap > 0 && (
                            <span className="smart-connections-badge tags" title={`Tags: ${(note.tagOverlap * 100).toFixed(0)}% Überlappung`}>
                              #
                            </span>
                          )}
                          {note.folderProximity > 0.5 && (
                            <span className="smart-connections-badge folder" title={`Ordner: ${(note.folderProximity * 100).toFixed(0)}% Nähe`}>
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                              </svg>
                            </span>
                          )}
                        </div>
                        <span className="smart-connections-item-title">{note.title}</span>
                      </div>
                      {/* Embedding-Score als Tooltip-Info */}
                      <div className="smart-connections-item-bar" title={`Embedding: ${(note.embeddingScore * 100).toFixed(0)}%`}>
                        <div
                          className="smart-connections-item-bar-fill"
                          style={{
                            width: `${note.similarity * 100}%`,
                            backgroundColor: getSimilarityColor(note.similarity)
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
