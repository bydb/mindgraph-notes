import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useNotesStore } from '../../stores/notesStore'
import { useUIStore } from '../../stores/uiStore'
import { useTranslation } from '../../utils/translations'

interface EmbeddingModel {
  name: string
  size: number
}

interface EmbeddingsCacheEntry {
  embedding: number[]
  mtime: number      // File modification time when embedding was generated
  size: number       // File size for change detection
}

interface EmbeddingsCache {
  model: string
  version: number
  lastUpdated: number
  files: Record<string, EmbeddingsCacheEntry>
}

interface SimilarNote {
  id: string
  title: string
  path: string
  similarity: number          // Hybrid-Score (gewichtet)
  // Score-Komponenten für Transparenz
  embeddingScore: number      // Reine Embedding-Ähnlichkeit
  keywordMatch: number        // Keyword-Überlappung (0-1)
  hasWikilink: boolean        // Expliziter Wikilink vorhanden
  tagOverlap: number          // Tag-Überlappung (0-1)
  folderProximity: number     // Ordner-Nähe (0-1)
}

// Default-Gewichtungen (werden von uiStore überschrieben)
const DEFAULT_WEIGHTS = {
  embedding: 50,
  keyword: 30,
  wikilink: 10,
  tags: 10,
  folder: 0
}

// Stoppwörter die bei Keyword-Extraktion ignoriert werden
const STOP_WORDS = new Set([
  'der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einer', 'einem', 'einen',
  'und', 'oder', 'aber', 'wenn', 'weil', 'dass', 'als', 'auch', 'nur', 'noch',
  'ist', 'sind', 'war', 'waren', 'wird', 'werden', 'hat', 'haben', 'kann', 'können',
  'mit', 'von', 'für', 'auf', 'aus', 'bei', 'nach', 'vor', 'über', 'unter', 'durch',
  'sich', 'nicht', 'mehr', 'sehr', 'wie', 'was', 'wer', 'wo', 'wann', 'warum',
  'the', 'a', 'an', 'and', 'or', 'but', 'if', 'then', 'so', 'as', 'of', 'to', 'in',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does',
  'will', 'would', 'could', 'should', 'may', 'might', 'must', 'shall', 'can',
  'this', 'that', 'these', 'those', 'it', 'its', 'they', 'them', 'their', 'we', 'our',
  'note', 'notiz', 'inbox', 'zum', 'zur', 'im', 'am', 'um', 'es', 'sie', 'er', 'wir'
])

// Extrahiere wichtige Keywords aus Text
function extractKeywords(text: string, title: string): string[] {
  const keywords: string[] = []

  // 1. Titel-Wörter sind sehr wichtig (ohne Datum/Emoji)
  const titleWords = title
    .replace(/^\d{12}\s*-?\s*/, '')  // Entferne Datums-Präfix
    .replace(/[\u{1F300}-\u{1F9FF}]/gu, '')  // Entferne Emojis
    .toLowerCase()
    .split(/[\s\-_.,;:!?()[\]{}]+/)
    .filter(w => w.length > 3 && !STOP_WORDS.has(w))

  keywords.push(...titleWords)

  // 2. Überschriften extrahieren (## Heading)
  const headings = text.match(/^#{1,3}\s+(.+)$/gm) || []
  for (const heading of headings) {
    const words = heading
      .replace(/^#+\s*/, '')
      .toLowerCase()
      .split(/[\s\-_.,;:!?()[\]{}]+/)
      .filter(w => w.length > 3 && !STOP_WORDS.has(w))
    keywords.push(...words)
  }

  // 3. Fettgedruckte Begriffe (**term** oder __term__)
  const boldTerms = text.match(/\*\*([^*]+)\*\*|__([^_]+)__/g) || []
  for (const term of boldTerms) {
    const clean = term.replace(/\*\*|__/g, '').toLowerCase()
    if (clean.length > 3 && !STOP_WORDS.has(clean)) {
      keywords.push(clean)
    }
  }

  // 4. Eigennamen und Fachbegriffe (Wörter mit Großbuchstaben im Text)
  const properNouns = text.match(/\b[A-ZÄÖÜ][a-zäöüß]{3,}\b/g) || []
  for (const noun of properNouns) {
    const lower = noun.toLowerCase()
    if (!STOP_WORDS.has(lower)) {
      keywords.push(lower)
    }
  }

  // Deduplizieren und häufigste behalten
  const freq = new Map<string, number>()
  for (const kw of keywords) {
    freq.set(kw, (freq.get(kw) || 0) + 1)
  }

  // Top Keywords nach Häufigkeit, max 20
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([kw]) => kw)
}

// Berechne Keyword-Überlappung zwischen zwei Texten
function calculateKeywordMatch(keywords1: string[], text2: string, title2: string): number {
  if (keywords1.length === 0) return 0

  const text2Lower = (title2 + ' ' + text2).toLowerCase()
  let matches = 0

  for (const kw of keywords1) {
    // Prüfe ob Keyword im Text vorkommt (als ganzes Wort)
    const regex = new RegExp(`\\b${kw}\\b`, 'i')
    if (regex.test(text2Lower)) {
      matches++
    }
  }

  // Normalisiere auf 0-1 (mind. 30% der Keywords müssen matchen für vollen Score)
  return Math.min(1, matches / (keywords1.length * 0.3))
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
// nomic-embed-text hat strenges Token-Limit
// 4000 Zeichen = ~1000-1400 Tokens, sicher für die meisten Modelle
const MAX_EMBEDDING_LENGTH = 4000

// Bereite Text für Embedding vor: Entferne Frontmatter, extrahiere semantischen Kern
function prepareTextForEmbedding(text: string): string {
  // 1. Entferne YAML Frontmatter (zwischen --- Markern)
  let cleanText = text.replace(/^---[\s\S]*?---\n*/m, '')

  // 2. Entferne Obsidian-spezifische Syntax
  cleanText = cleanText
    .replace(/>\s*Erstellt am.*?\n/g, '')           // Erstellungsdatum
    .replace(/!\[\[.*?\]\]/g, '')                    // Bild-Embeds
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')  // [[link|text]] → text
    .replace(/\[\[([^\]]+)\]\]/g, '$1')              // [[link]] → link
    .replace(/^>\s*\[!.*?\].*$/gm, '')               // Callout headers
    .replace(/^[-*]\s*\[[ x]\]/gm, '')               // Checkboxen
    .replace(/\n{3,}/g, '\n\n')                      // Mehrfache Leerzeilen

  // 3. Extrahiere Überschriften für semantische Zusammenfassung
  const headings = cleanText.match(/^#{1,3}\s+.+$/gm) || []
  const headingsSummary = headings.slice(0, 10).join('\n')

  // 4. Wenn kurz genug, nutze alles
  if (cleanText.length <= MAX_EMBEDDING_LENGTH) {
    return cleanText.trim()
  }

  // 5. Bei langen Texten: Überschriften + Anfang + Mitte-Samples
  const contentWithoutHeadings = cleanText.replace(/^#{1,3}\s+.+$/gm, '')
  const paragraphs = contentWithoutHeadings.split(/\n\n+/).filter(p => p.trim().length > 50)

  // Nimm Überschriften + erste Paragraphen + einige aus der Mitte
  const budget = MAX_EMBEDDING_LENGTH - headingsSummary.length - 100
  let result = headingsSummary + '\n\n'
  let usedChars = 0

  // Erste Hälfte der Paragraphen (Einleitung, Hauptinhalt)
  for (let i = 0; i < Math.min(paragraphs.length, 10) && usedChars < budget * 0.7; i++) {
    result += paragraphs[i] + '\n\n'
    usedChars += paragraphs[i].length
  }

  // Einige aus der Mitte (Kerninhalt)
  const middleStart = Math.floor(paragraphs.length * 0.3)
  const middleEnd = Math.floor(paragraphs.length * 0.6)
  for (let i = middleStart; i < middleEnd && usedChars < budget; i++) {
    if (!result.includes(paragraphs[i])) {
      result += paragraphs[i] + '\n\n'
      usedChars += paragraphs[i].length
    }
  }

  console.log(`[SmartConnections] Text vorbereitet: ${text.length} → ${result.length} Zeichen (${headings.length} Überschriften)`)
  return result.trim()
}

// Legacy-Funktion für Kompatibilität
function truncateForEmbedding(text: string): string {
  return prepareTextForEmbedding(text)
}

// Normalisiere Embedding-Score für bessere Differenzierung
// Cosine-Similarity clustert typisch zwischen 0.5-0.95
// Diese Funktion spreizt die Werte auf 0-1 für sichtbarere Unterschiede
function normalizeEmbeddingScore(rawScore: number): number {
  const MIN_EXPECTED = 0.50  // Scores darunter = unverwandt
  const MAX_EXPECTED = 0.95  // Sehr hohe Ähnlichkeit

  const normalized = (rawScore - MIN_EXPECTED) / (MAX_EXPECTED - MIN_EXPECTED)
  return Math.max(0, Math.min(1, normalized))
}

// Berechne Hybrid-Score aus allen Faktoren
function calculateHybridScore(
  embeddingScore: number,
  keywordMatch: number,
  hasWikilink: boolean,
  tagOverlap: number,
  folderProximity: number,
  weights: { embedding: number; keyword: number; wikilink: number; tags: number; folder: number }
): number {
  // Normalisiere Embedding-Score für bessere Spreizung
  const normalizedEmbedding = normalizeEmbeddingScore(embeddingScore)

  const score =
    weights.embedding * normalizedEmbedding +
    weights.keyword * keywordMatch +
    weights.wikilink * (hasWikilink ? 1 : 0) +
    weights.tags * tagOverlap +
    weights.folder * folderProximity

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
  const { t } = useTranslation()
  const { notes, selectedNoteId, selectNote, vaultPath } = useNotesStore()
  const { ollama: llmSettings, smartConnectionsWeights } = useUIStore()

  // Gewichtungen aus Settings (als Dezimalwerte 0-1)
  const WEIGHTS = useMemo(() => ({
    embedding: (smartConnectionsWeights?.embedding ?? DEFAULT_WEIGHTS.embedding) / 100,
    keyword: (smartConnectionsWeights?.keyword ?? DEFAULT_WEIGHTS.keyword) / 100,
    wikilink: (smartConnectionsWeights?.wikilink ?? DEFAULT_WEIGHTS.wikilink) / 100,
    tags: (smartConnectionsWeights?.tags ?? DEFAULT_WEIGHTS.tags) / 100,
    folder: (smartConnectionsWeights?.folder ?? DEFAULT_WEIGHTS.folder) / 100
  }), [smartConnectionsWeights])
  const [embeddingModels, setEmbeddingModels] = useState<EmbeddingModel[]>([])
  const [selectedModel, setSelectedModel] = useState<string>('')
  const [isBackendAvailable, setIsBackendAvailable] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isCalculating, setIsCalculating] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const [similarNotes, setSimilarNotes] = useState<SimilarNote[]>([])
  const [embeddingsCache, setEmbeddingsCache] = useState<EmbeddingsCache | null>(null)
  const [pendingNotes, setPendingNotes] = useState<string[]>([]) // IDs of notes needing embedding
  const [isIntegrating, setIsIntegrating] = useState(false)
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
        setError(t('smartConnections.errorCheckingBackend'))
      } finally {
        setIsLoading(false)
      }
    }

    checkBackend()
  }, [llmSettings.backend, llmSettings.lmStudioPort])

  // Lade gecachte Embeddings und erkenne neue/geänderte Dateien
  useEffect(() => {
    const loadCachedEmbeddings = async () => {
      if (!vaultPath || !selectedModel) return

      try {
        // Lade separaten Embeddings-Cache
        const cacheFile = await window.electronAPI.loadEmbeddingsCache?.(vaultPath, selectedModel) as EmbeddingsCache | null

        // Fallback: Alte Struktur aus graph-data.json
        if (!cacheFile) {
          const graphData = await window.electronAPI.loadGraphData(vaultPath) as {
            embeddings?: Record<string, Record<string, number[]>>
          } | null

          if (graphData?.embeddings?.[selectedModel]) {
            // Migriere alte Struktur in neue
            const oldCache = graphData.embeddings[selectedModel]
            const migratedCache: EmbeddingsCache = {
              model: selectedModel,
              version: 1,
              lastUpdated: Date.now(),
              files: {}
            }
            for (const [id, embedding] of Object.entries(oldCache)) {
              migratedCache.files[id] = {
                embedding,
                mtime: 0,  // Unbekannt, wird bei nächster Prüfung aktualisiert
                size: 0
              }
            }
            setEmbeddingsCache(migratedCache)
            console.log('[SmartConnections] Migrated old cache:', Object.keys(migratedCache.files).length)
          } else {
            setEmbeddingsCache({ model: selectedModel, version: 1, lastUpdated: 0, files: {} })
          }
        } else {
          setEmbeddingsCache(cacheFile)
          console.log('[SmartConnections] Loaded embeddings cache:', Object.keys(cacheFile.files).length)
        }
      } catch (err) {
        console.log('[SmartConnections] No cached embeddings found, starting fresh')
        setEmbeddingsCache({ model: selectedModel, version: 1, lastUpdated: 0, files: {} })
      }
    }

    loadCachedEmbeddings()
  }, [vaultPath, selectedModel])

  // Erkenne neue/geänderte Dateien
  useEffect(() => {
    if (!embeddingsCache || !notes.length) return

    const pending: string[] = []
    for (const note of notes) {
      if (!note.path.endsWith('.md')) continue

      const cached = embeddingsCache.files[note.id]
      const noteMtime = note.modifiedAt?.getTime() || 0
      if (!cached) {
        // Neue Datei - noch kein Embedding
        pending.push(note.id)
      } else if (noteMtime && cached.mtime > 0 && noteMtime > cached.mtime) {
        // Datei wurde seit letztem Embedding geändert
        pending.push(note.id)
      }
    }

    setPendingNotes(pending)
    if (pending.length > 0) {
      console.log('[SmartConnections] Pending notes (new/modified):', pending.length)
    }
  }, [embeddingsCache, notes])

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

  // Neue/geänderte Notizen integrieren (Embeddings generieren)
  const integratePendingNotes = useCallback(async () => {
    if (!vaultPath || !selectedModel || !embeddingsCache || pendingNotes.length === 0) return

    setIsIntegrating(true)
    setProgress({ current: 0, total: pendingNotes.length })

    const updatedCache: EmbeddingsCache = {
      ...embeddingsCache,
      lastUpdated: Date.now(),
      files: { ...embeddingsCache.files }
    }

    // Batch-Laden der Inhalte
    const notesToProcess = notes.filter(n => pendingNotes.includes(n.id))
    const paths = notesToProcess.map(n => n.path)
    const contents = await window.electronAPI.readFilesBatch(vaultPath, paths)

    for (let i = 0; i < notesToProcess.length; i++) {
      const note = notesToProcess[i]
      setProgress({ current: i + 1, total: notesToProcess.length })

      const content = contents[note.path] || ''
      let embedding: number[] = []

      if (content.trim()) {
        embedding = await getEmbedding(content) || []
      }

      // Speichere IMMER einen Cache-Eintrag, auch für leere Dateien
      // damit sie nicht immer wieder als "pending" erscheinen
      updatedCache.files[note.id] = {
        embedding,
        mtime: note.modifiedAt?.getTime() || Date.now(),
        size: content.length
      }
    }

    // Cache speichern
    setEmbeddingsCache(updatedCache)
    setPendingNotes([])

    try {
      // Speichere in separater Datei
      if (window.electronAPI.saveEmbeddingsCache) {
        await window.electronAPI.saveEmbeddingsCache(vaultPath, selectedModel, updatedCache)
      } else {
        // Fallback: In graph-data.json speichern
        const existingData = await window.electronAPI.loadGraphData(vaultPath) as {
          embeddings?: Record<string, Record<string, number[]>>
          [key: string]: unknown
        } | null
        const graphData = existingData || {}
        if (!graphData.embeddings) {
          graphData.embeddings = {}
        }
        // Konvertiere zu altem Format für Rückwärtskompatibilität
        const simpleCache: Record<string, number[]> = {}
        for (const [id, entry] of Object.entries(updatedCache.files)) {
          simpleCache[id] = entry.embedding
        }
        graphData.embeddings[selectedModel] = simpleCache
        await window.electronAPI.saveGraphData(vaultPath, graphData)
      }
      console.log('[SmartConnections] Integrated', notesToProcess.length, 'notes')
    } catch (err) {
      console.error('[SmartConnections] Failed to save cache:', err)
    }

    setIsIntegrating(false)
  }, [vaultPath, selectedModel, embeddingsCache, pendingNotes, notes, getEmbedding])

  // Ähnliche Notizen berechnen (nutzt nur Cache, generiert keine neuen Embeddings)
  const calculateSimilarities = useCallback(async () => {
    if (!currentNote || !selectedModel || !vaultPath || !embeddingsCache) return

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
        setError(t('smartConnections.noteEmpty'))
        setIsCalculating(false)
        return
      }

      // Extrahiere Wikilinks aus aktueller Notiz für Bonus-Berechnung
      const wikilinks = extractWikilinks(currentContent)

      // Extrahiere Keywords aus aktueller Notiz für Keyword-Matching
      const currentKeywords = extractKeywords(currentContent, currentNote.title)
      console.log(`[SmartConnections] Keywords extrahiert: ${currentKeywords.slice(0, 10).join(', ')}...`)

      // Embedding für aktuelle Notiz (generiere falls nicht gecacht)
      let currentEmbedding = embeddingsCache.files[currentNote.id]?.embedding
      if (!currentEmbedding) {
        console.log(`[SmartConnections] Generating embedding for current note "${currentNote.title}"`)
        currentEmbedding = await getEmbedding(currentContent) || undefined
        if (!currentEmbedding) {
          setError(`${t('smartConnections.errorGeneratingEmbedding')}`)
          setIsCalculating(false)
          return
        }
        // Cache aktualisieren
        embeddingsCache.files[currentNote.id] = {
          embedding: currentEmbedding,
          mtime: currentNote.modifiedAt?.getTime() || Date.now(),
          size: currentContent.length
        }
      }

      // 2. Berechne Ähnlichkeiten NUR mit gecachten Notizen
      const otherNotes = notes.filter(n => n.id !== selectedNoteId && n.path.endsWith('.md'))
      const similarities: SimilarNote[] = []

      // Debug: Wie viele Notizen haben gecachte Embeddings?
      const cachedCount = otherNotes.filter(n => embeddingsCache?.files?.[n.id]?.embedding?.length > 0).length
      console.log(`[SmartConnections] Vergleiche mit ${cachedCount}/${otherNotes.length} gecachten Notizen`)

      if (cachedCount === 0) {
        console.error('[SmartConnections] WARNUNG: Keine gecachten Embeddings gefunden! Cache:', embeddingsCache)
      }

      for (const note of otherNotes) {
        const cachedEntry = embeddingsCache?.files?.[note.id]
        // Überspringe Notizen ohne Cache oder mit leerem Embedding (fehlgeschlagen)
        if (!cachedEntry || !cachedEntry.embedding || cachedEntry.embedding.length === 0) continue

        const embeddingScore = cosineSimilarity(currentEmbedding, cachedEntry.embedding)
        const hasWikilink = isLinkedViaWikilink(wikilinks, note)
        const tagOverlap = calculateTagOverlap(currentNote.tags || [], note.tags || [])
        const folderProximity = calculateFolderProximity(currentNote.path, note.path)

        // Keyword-Match: Prüfe ob Keywords im Titel/Tags der anderen Notiz vorkommen
        const otherTagsText = (note.tags || []).join(' ')
        const keywordMatch = calculateKeywordMatch(currentKeywords, otherTagsText, note.title)

        const similarity = calculateHybridScore(
          embeddingScore,
          keywordMatch,
          hasWikilink,
          tagOverlap,
          folderProximity,
          WEIGHTS
        )

        if (similarity > 0.2) {
          similarities.push({
            id: note.id,
            title: note.title,
            path: note.path,
            similarity,
            embeddingScore,
            keywordMatch,
            hasWikilink,
            tagOverlap,
            folderProximity
          })
        }
      }

      similarities.sort((a, b) => b.similarity - a.similarity)
      setSimilarNotes(similarities.slice(0, 20))

    } catch (err) {
      console.error('[SmartConnections] Error calculating similarities:', err)
      setError(t('smartConnections.errorCalculating'))
    } finally {
      setIsCalculating(false)
    }
  }, [currentNote, selectedModel, vaultPath, notes, selectedNoteId, embeddingsCache, getEmbedding, t, WEIGHTS])

  // Automatisch berechnen wenn Notiz gewechselt wird UND Cache geladen ist
  useEffect(() => {
    // WICHTIG: Warte bis embeddingsCache geladen ist (nicht null und hat files)
    const cacheReady = embeddingsCache && Object.keys(embeddingsCache.files || {}).length > 0

    if (currentNote && selectedModel && isBackendAvailable && !isCalculating && cacheReady) {
      console.log(`[SmartConnections] Cache ready with ${Object.keys(embeddingsCache.files).length} entries, calculating...`)
      // Verzögerung um zu viele Berechnungen zu vermeiden
      const timer = setTimeout(() => {
        calculateSimilarities()
      }, 500)
      return () => clearTimeout(timer)
    } else if (currentNote && selectedModel && !cacheReady) {
      console.log('[SmartConnections] Warte auf Cache...')
    }
  }, [selectedNoteId, selectedModel, embeddingsCache])

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
        <button className="smart-connections-close" onClick={onClose} title={t('panel.close')}>
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
            <p>{t('smartConnections.checking')} {llmSettings.backend === 'lm-studio' ? 'LM Studio' : 'Ollama'}...</p>
          </div>
        ) : !isBackendAvailable ? (
          <div className="smart-connections-unavailable">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <p>{llmSettings.backend === 'lm-studio' ? 'LM Studio' : 'Ollama'} {t('smartConnections.notAvailable')}</p>
            <span>
              {llmSettings.backend === 'lm-studio'
                ? t('smartConnections.startLMStudioEmbed')
                : t('smartConnections.startOllama')}
            </span>
          </div>
        ) : embeddingModels.length === 0 ? (
          <div className="smart-connections-unavailable">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            <p>{t('smartConnections.noEmbeddingModel')}</p>
            <span>
              {llmSettings.backend === 'lm-studio'
                ? t('smartConnections.loadEmbeddingLMStudio')
                : t('smartConnections.installEmbeddingOllama')}
            </span>
          </div>
        ) : !currentNote ? (
          <div className="smart-connections-unavailable">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            <p>{t('smartConnections.noNoteSelected')}</p>
            <span>{t('smartConnections.selectNote')}</span>
          </div>
        ) : (
          <>
            {/* Modell-Auswahl */}
            <div className="smart-connections-model">
              <label>{t('smartConnections.model')}:</label>
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
                title={t('smartConnections.recalculate')}
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
              <span className="smart-connections-current-label">{t('smartConnections.currentNote')}:</span>
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
                <p>{t('smartConnections.calculating')}... {progress.current}/{progress.total}</p>
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
                <p>{t('smartConnections.noSimilar')}</p>
                <span>{t('smartConnections.clickRefresh')}</span>
              </div>
            ) : (
              <div className="smart-connections-results">
                <div className="smart-connections-results-header">
                  <span>{t('smartConnections.similarNotes')}</span>
                  <span className="smart-connections-results-count">{similarNotes.length}</span>
                </div>
                <div className="smart-connections-legend">
                  <span className="smart-connections-legend-item" title={t('smartConnections.keywordMatchTooltip')}>
                    <span className="smart-connections-badge keyword" style={{ width: 14, height: 14 }}>🔑</span>
                    {t('smartConnections.keyword')}
                  </span>
                  <span className="smart-connections-legend-item" title={t('smartConnections.explicitWikilink')}>
                    <span className="smart-connections-badge wikilink" style={{ width: 14, height: 14 }}>
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                      </svg>
                    </span>
                    {t('smartConnections.link')}
                  </span>
                  <span className="smart-connections-legend-item" title={t('smartConnections.sharedTags')}>
                    <span className="smart-connections-badge tags" style={{ width: 14, height: 14 }}>#</span>
                    {t('smartConnections.tags')}
                  </span>
                  {WEIGHTS.folder > 0 && (
                    <span className="smart-connections-legend-item" title={t('smartConnections.folderProximity')}>
                      <span className="smart-connections-badge folder" style={{ width: 14, height: 14 }}>📁</span>
                      {t('smartConnections.folder')}
                    </span>
                  )}
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
                            <span className="smart-connections-badge wikilink" title={`${t('smartConnections.explicitlyLinked')} (+${(WEIGHTS.wikilink * 100).toFixed(0)}%)`}>
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                              </svg>
                            </span>
                          )}
                          {note.keywordMatch > 0.3 && (
                            <span className="smart-connections-badge keyword" title={`Keyword-Match: ${(note.keywordMatch * 100).toFixed(0)}%`}>
                              🔑
                            </span>
                          )}
                          {note.tagOverlap > 0 && (
                            <span className="smart-connections-badge tags" title={t('smartConnections.tagsOverlap', { percent: (note.tagOverlap * 100).toFixed(0) })}>
                              #
                            </span>
                          )}
                          {WEIGHTS.folder > 0 && note.folderProximity > 0 && (
                            <span className="smart-connections-badge folder" title={t('smartConnections.folderProximityTooltip', { percent: (note.folderProximity * 100).toFixed(0) })}>
                              📁
                            </span>
                          )}
                        </div>
                        <span className="smart-connections-item-title">{note.title}</span>
                      </div>
                      {/* Embedding-Score als Tooltip-Info */}
                      <div className="smart-connections-item-bar" title={`${t('smartConnections.embedding')}: ${(note.embeddingScore * 100).toFixed(0)}%`}>
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

      {/* Footer: Pending Notes Integration */}
      {pendingNotes.length > 0 && isBackendAvailable && selectedModel && (
        <div className="smart-connections-footer">
          {isIntegrating ? (
            <div className="smart-connections-integrating">
              <div className="smart-connections-spinner small"></div>
              <span>{t('smartConnections.integrating')} {progress.current}/{progress.total}</span>
            </div>
          ) : (
            <>
              <span className="smart-connections-pending-count">
                {pendingNotes.length} {pendingNotes.length === 1 ? t('smartConnections.newNote') : t('smartConnections.newNotes')}
              </span>
              <button
                className="smart-connections-integrate-btn"
                onClick={integratePendingNotes}
                title={t('smartConnections.integrateTooltip')}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"/>
                  <line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                {t('smartConnections.integrate')}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
