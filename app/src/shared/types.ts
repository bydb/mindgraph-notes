import type { RelevanceConfig } from './emailRelevance'
import type { RagIndexStatus, RagQueryResult, RetrievedChunk } from './rag/types'

// Per-Vault Feature Toggles
export interface VaultFeatures {
  readwise: boolean
  email: boolean
  dailyNote: boolean
  edoobox: boolean
  remarkable: boolean
}

export interface VaultSettings {
  schemaVersion: number
  features: VaultFeatures
}

// FileTree Icon Customization
export type IconSet = 'default' | 'minimal' | 'colorful' | 'emoji'

// Sync Types
export interface SyncProgress {
  status: 'idle' | 'connecting' | 'scanning' | 'uploading' | 'downloading' | 'done' | 'error'
  current: number
  total: number
  fileName?: string
  error?: string
}

export interface SyncResult {
  success: boolean
  uploaded: number
  downloaded: number
  conflicts: number
  error?: string
}

export interface SyncConfig {
  enabled: boolean
  vaultId: string
  relayUrl: string
  autoSync: boolean
  syncInterval: number
  excludeFolders: string[]
  excludeExtensions: string[]
}

export interface SyncLogEntry {
  timestamp: number
  type: 'sync' | 'upload' | 'download' | 'conflict' | 'delete' | 'error' | 'connect' | 'disconnect'
  message: string
  fileName?: string
}

export interface DeletedFileInfo {
  path: string
  originalPath: string
  size: number
  deletedAt: number
}

// Update-Checker Types
export interface UpdateInfo {
  available: boolean
  version?: string
  releaseUrl?: string
  body?: string
  error?: boolean
  autoUpdate?: boolean
}

// Quiz / Spaced Repetition Types
export type QuizDifficulty = 'easy' | 'medium' | 'hard'

export interface QuizQuestion {
  id: string
  question: string
  expectedAnswer: string
  topic: string
  difficulty: QuizDifficulty
  sourceFile: string
}

export interface QuizResult {
  questionId: string
  userAnswer: string
  score: number          // 0-100
  feedback: string
  correct: boolean
}

export interface QuizSession {
  id: string
  sourceType: 'file' | 'folder'
  sourcePath: string
  createdAt: Date
  questions: QuizQuestion[]
  results: QuizResult[]
  weakTopics: string[]
  completed: boolean
}

export interface TopicProgress {
  correctCount: number
  totalCount: number
  lastAsked: Date
  nextReview: Date
}

export interface LearningProgress {
  filePath: string
  topics: Record<string, TopicProgress>
}

export interface QuizAnalysis {
  weakTopics: string[]
  recommendations: string[]
  suggestedFiles: string[]
  overallScore: number
}

// Study Statistics Types
export interface DailyReview {
  date: string         // YYYY-MM-DD
  cardsReviewed: number
  cardsCorrect: number // quality >= 2
}

export interface StudyStatsData {
  studyDays: string[]
  dailyReviews: DailyReview[]
}

// Flashcard / Spaced Repetition Types
export type FlashcardStatus = 'pending' | 'active' | 'suspended'

export interface Flashcard {
  id: string
  sourceNote: string           // Pfad zur Quell-Notiz
  front: string                // Frage
  back: string                 // Antwort
  topic: string                // Themenbereich
  status: FlashcardStatus
  created: string              // ISO date string
  modified: string             // ISO date string
  // SM-2 Felder
  easeFactor: number           // 1.3-2.5
  interval: number             // Tage bis nächste Review
  repetitions: number          // Anzahl erfolgreicher Reviews
  nextReview: string | null    // ISO date string, null = noch nie gelernt
  lastReview: string | null    // ISO date string
}

export interface FlashcardSession {
  cards: Flashcard[]
  currentIndex: number
  startedAt: string
  completedCount: number
}

export interface FileCustomization {
  color?: string           // Ordner/Datei Farbe (aus Palette)
  icon?: string            // Icon-Override (z.B. '📚', '🎯', 'star')
  hidden?: boolean         // Ordner im FileTree ausblenden
  pinned?: boolean         // Ordner als Favorit oben im FileTree anpinnen
}

// Task-Statistiken pro Notiz (für Cache)
export interface CachedTaskStats {
  total: number
  completed: number
  critical: number
  overdue: number
}

// Dataview Query Types
export interface NoteFrontmatter {
  [key: string]: unknown
}

// Inline-Felder: Key:: Value und [key:: value]
export interface InlineField {
  key: string
  value: string
  line: number
}

// Implizite Felder (automatisch aus Note abgeleitet)
export interface FileMetadata {
  name: string        // Dateiname ohne Extension
  path: string        // Relativer Pfad
  folder: string      // Übergeordneter Ordner
  ext: string         // Extension (.md)
  ctime: Date         // Erstellt
  mtime: Date         // Geändert
  tags: string[]      // Alle Tags
  outlinks: string[]  // Ausgehende Links
  inlinks: string[]   // Eingehende Links
}

// Kombinierte Query-Metadaten
export interface NoteQueryMetadata {
  file: FileMetadata
  frontmatter: NoteFrontmatter
  fields: Record<string, unknown>
}

// Dataview Query Types
export type DataviewQueryType = 'LIST' | 'TABLE' | 'TASK'

export interface DataviewFromClause {
  tags?: string[]                // #tag
  folders?: string[]             // "Folder/Path"
  links?: { to?: string[]; from?: string[] }
}

export interface DataviewSort {
  field: string
  direction: 'ASC' | 'DESC'
}

export type DataviewOperator = '=' | '!=' | '>' | '<' | '>=' | '<=' | 'contains'
export type DataviewLogicalOp = 'AND' | 'OR'

export interface DataviewComparison {
  type: 'comparison'
  field: string
  operator: DataviewOperator
  value: unknown
}

export interface DataviewLogical {
  type: 'logical'
  operator: DataviewLogicalOp
  left: DataviewExpression
  right: DataviewExpression
}

export interface DataviewNot {
  type: 'not'
  expression: DataviewExpression
}

export interface DataviewFunctionCall {
  type: 'function'
  name: string
  args: (string | number | DataviewExpression)[]
}

export type DataviewExpression = DataviewComparison | DataviewLogical | DataviewNot | DataviewFunctionCall | { type: 'field'; name: string } | { type: 'literal'; value: unknown }

export interface DataviewQuery {
  type: DataviewQueryType
  fields?: string[]              // TABLE Spalten
  from?: DataviewFromClause
  where?: DataviewExpression
  sort?: DataviewSort[]
  groupBy?: string               // v2 - später
  limit?: number
}

export interface DataviewResultRow {
  note: Note
  metadata: NoteQueryMetadata
  values?: Record<string, unknown>  // TABLE column values
}

export interface DataviewResult {
  type: DataviewQueryType
  rows: DataviewResultRow[]
  columns?: string[]
  error?: string
  executionTime?: number
}

// Notes Cache für schnelles Laden
export interface CachedNoteMetadata {
  id: string
  path: string
  title: string
  outgoingLinks: string[]
  tags: string[]
  headings?: NoteHeading[]
  blocks?: NoteBlock[]
  sourcePdf?: string
  taskStats?: CachedTaskStats  // Task-Statistiken für schnelle Berechnung
  frontmatter?: NoteFrontmatter  // Parsed YAML frontmatter for Dataview
  mtime: number            // Datei-Änderungszeit in ms
  createdAt: number        // Als Timestamp für JSON-Serialisierung
  modifiedAt: number
}

export interface NotesCache {
  version: number
  vaultPath: string
  notes: Record<string, CachedNoteMetadata>  // Key = relativePath
}

export interface FileWithMtime {
  path: string             // Relativer Pfad
  mtime: number            // Änderungszeit in ms
  isDirectory: boolean
}

// Überschriften-Daten für Autocomplete
export interface NoteHeading {
  level: number;       // 1-6 für h1-h6
  text: string;        // Überschrift-Text ohne #
  line: number;        // Zeilennummer
}

// Block-Referenz-Daten für Autocomplete
export interface NoteBlock {
  id: string;          // Block-ID ohne ^
  line: number;        // Zeilennummer
  content: string;     // Block-Inhalt (erste 100 Zeichen)
}

// Kernentität: Notiz
export interface Note {
  id: string;                    // Eindeutige ID (Hash des Pfads)
  path: string;                  // Relativer Pfad zur Vault-Root
  title: string;                 // Aus Dateiname oder erstem H1
  content: string;               // Roher Markdown-Inhalt

  // Extrahierte Daten
  outgoingLinks: string[];       // IDs der verlinkten Notizen
  incomingLinks: string[];       // IDs der Notizen, die hierher linken
  tags: string[];                // #tags aus dem Inhalt
  headings?: NoteHeading[];      // Überschriften für Autocomplete
  blocks?: NoteBlock[];          // Block-Referenzen für Autocomplete

  // PDF Companion Support
  sourcePdf?: string;            // Relativer Pfad zum Quell-PDF (nur für Companion-Notizen)

  // Task-Statistiken (für schnelle Vault-weite Berechnung)
  taskStats?: CachedTaskStats;

  // Metadaten
  createdAt: Date;
  modifiedAt: Date;
}

// Graph-Daten (persistiert separat)
export interface NodePosition {
  x: number;
  y: number;
  pinned: boolean;
  color?: string;
  size?: 'small' | 'medium' | 'large';
  width?: number;
  height?: number;
}

export interface ManualEdge {
  id: string;
  source: string;              // Note ID
  target: string;              // Note ID
  label?: string;              // Optionale Beschriftung
  style?: 'solid' | 'dashed';
}

export interface GraphData {
  version: string;
  lastModified: Date;
  nodes: Record<string, NodePosition>;
  manualEdges: ManualEdge[];
  viewport: {
    x: number;
    y: number;
    zoom: number;
  };
}

// Notiz-Agent Phase 1: Kontext-Datei der Macher-Leiste. Der Renderer kennt nur die
// Attachment-ID — der absolute Pfad bleibt Main-seitig (docs/note-agent-harness-plan.md §2).
export interface NoteAgentAttachment {
  id: string;
  name: string;
  kind: 'xlsx' | 'docx' | 'pptx' | 'pdf' | 'md' | 'txt' | 'csv' | 'folder';
  insideVault: boolean;
  sizeBytes: number;
}

export interface NoteAgentAttachResult {
  attachments: NoteAgentAttachment[];
  errors: string[];
}

// Notiz-Agent Phase 2 (Modus B): Renderer-sichtbare Run-Artefakte — bewusst ohne Pfade,
// nur opake Handles (docs/note-agent-harness-plan.md, F02).
export interface NoteAgentResultCard {
  resultId: string;
  suggestedName: string;
  kind: string;
  summary: string;
  sources: string[];
}

// Agent-Skills Stufe 1: Vault-Skill (Skills/<ordner>/SKILL.md, agentskills.io-Format).
export interface NoteAgentSkill {
  name: string;
  description: string;
  folderName: string;
  relPath: string;
  enabled: boolean;
}

// Agent-Skills Stufe 2: Eintrag des kuratierten Katalogs (docs/skills/index.json).
export interface NoteAgentCatalogSkill {
  id: string;
  name: string;
  description: string;
  language: string;
  license: string;
  source: string;
  content: string; // vollständige SKILL.md — Pflicht-Vorschau vor Installation
}

export interface NoteAgentProgressEvent {
  runId: string;
  seq: number;
  skill: string;
  summary: string;
}

export interface NoteAgentDoneEvent {
  runId: string;
  ok: boolean;
  cancelled?: boolean;
  error?: string;
  text?: string;
  hitMaxIterations?: boolean;
  results: NoteAgentResultCard[];
  // Webrecherche-Provenienz (nur bei aktivierter Webrecherche) — Suchen + Seitenabrufe.
  web?: {
    queries: Array<{ query: string; status: string }>;
    fetches: Array<{ url: string; title: string; status: string }>;
    searchCount: number;
    fetchCount: number;
  };
}

// IPC Kommunikation
export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: FileEntry[];
  fileType?: 'markdown' | 'pdf' | 'image' | 'excel' | 'word' | 'powerpoint' | 'code' | 'epub' | 'plugin';
  /** Bei fileType 'plugin' (ADR plugin-renderer-host §7): welches Renderer-Plugin/Editor die Endung
   *  beansprucht. Der FileTree öffnet damit einen plugin-editor-Tab. */
  pluginEditor?: { pluginId: string; editorId: string };
}

// PDF-Dokument
export interface PDFDocument {
  id: string;                    // Eindeutige ID (Hash des Pfads)
  path: string;                  // Relativer Pfad zur Vault-Root
  title: string;                 // Aus Dateiname
  type: 'pdf';
  createdAt: Date;
  modifiedAt: Date;
}

export interface ReMarkableDocumentSummary {
  id: string;
  name: string;
  type: 'DocumentType' | 'CollectionType';
  parent: string;
  modifiedClient: string;
}

export interface ReMarkableUsbCheckResult {
  connected: boolean;
  mode: 'usb';
  error?: string;
}

export interface ReMarkableDownloadResult {
  success: boolean;
  relativePdfPath?: string;
  alreadyExists?: boolean;
  error?: string;
}

export interface ReMarkableUploadResult {
  success: boolean;
  error?: string;
}

export interface ReMarkableOptimizeResult {
  success: boolean;
  relativePdfPath?: string;
  method?: 'ghostscript' | 'qpdf' | 'unchanged';
  originalSize?: number;
  optimizedSize?: number;
  error?: string;
}

export interface ReMarkableBookifyResult {
  success: boolean;
  relativePdfPath?: string;
  sourcePages?: number;
  charCount?: number;
  error?: string;
}

export interface ReMarkableUsbDebugInfoResult {
  success: boolean;
  connected: boolean;
  vendorName?: string;
  productName?: string;
  vendorId?: number;
  productId?: number;
  vendorIdHex?: string;
  productIdHex?: string;
  error?: string;
}

// API Typen für IPC
export interface ElectronAPI {
  // Settings / Vault Persistenz
  getLastVault: () => Promise<string | null>;
  setLastVault: (vaultPath: string) => Promise<boolean>;

  // UI-Settings Persistenz
  loadUISettings: () => Promise<Record<string, unknown>>;
  saveUISettings: (settings: Record<string, unknown>) => Promise<boolean>;
  pruneUISettingsKeys: (keys: string[]) => Promise<boolean>;
  setMainLanguage: (lang: string) => Promise<boolean>;
  clipboardWriteText: (text: string) => Promise<boolean>;
  clipboardReadText: () => Promise<string>;

  openVault: () => Promise<string | null>;
  selectFolderInVault: (vaultPath: string) => Promise<string | null>;
  selectVaultDirectory: () => Promise<string | null>;
  checkDirectoryEmpty: (dirPath: string) => Promise<boolean>;
  createStarterVault: (targetPath: string, language: string) => Promise<boolean>;
  createEmptyVault: (targetPath: string) => Promise<boolean>;
  readDirectory: (dirPath: string) => Promise<FileEntry[]>;
  readFile: (filePath: string) => Promise<string>;
  // Wie readFile, aber fehlende Datei → null (Sidecar-Probing ohne Error-Log)
  readFileOptional: (filePath: string) => Promise<string | null>;
  readFilesBatch: (basePath: string, relativePaths: string[]) => Promise<Record<string, string | null>>;
  readFileBinary: (filePath: string) => Promise<string>;  // Returns Base64
  writeFile: (filePath: string, content: string) => Promise<void>;
  appendAnnotation: (vaultPath: string, relPath: string, block: string, headerIfNew: string) => Promise<{ success: boolean; relPath: string }>;
  deleteAnnotation: (vaultPath: string, relPath: string, annoId: string) => Promise<{ success: boolean; removed: boolean }>;
  deleteFile: (filePath: string) => Promise<boolean>;
  deleteFiles: (filePaths: string[]) => Promise<{ deleted: number; total: number }>;
  deleteDirectory: (dirPath: string) => Promise<boolean>;
  renameFile: (oldPath: string, newPath: string) => Promise<{ success: boolean; newPath?: string; error?: string }>;
  moveFile: (sourcePath: string, targetDir: string) => Promise<{ success: boolean; newPath?: string; error?: string }>;
  duplicateFile: (filePath: string) => Promise<{ success: boolean; newPath?: string; error?: string }>;
  showInFolder: (filePath: string) => Promise<boolean>;
  promptNewNote: () => Promise<string | null>;
  createNote: (filePath: string) => Promise<{ path: string; fileName: string; content: string }>;
  createDirectory: (dirPath: string) => Promise<boolean>;
  promptNewFolder: (basePath: string) => Promise<string | null>;
  watchDirectory: (dirPath: string, callback: (event: string, filePath: string) => void) => void;
  unwatchDirectory: () => void;
  getFileStats: (filePath: string) => Promise<{ createdAt: Date; modifiedAt: Date }>;

  // Directory operations
  ensureDir: (dirPath: string) => Promise<boolean>;

  // Image Handling
  copyImageToAttachments: (vaultPath: string, sourcePath: string, imagesFolder?: string) => Promise<{
    success: boolean;
    fileName?: string;
    relativePath?: string;
    error?: string;
  }>;
  writeImageFromBase64: (vaultPath: string, base64Data: string, suggestedName: string, imagesFolder?: string) => Promise<{
    success: boolean;
    fileName?: string;
    relativePath?: string;
    error?: string;
  }>;
  copyFileToVault: (vaultPath: string, sourcePath: string, targetRelDir: string) => Promise<{
    success: boolean;
    fileName?: string;
    relativePath?: string;
    error?: string;
  }>;
  readImageAsDataUrl: (imagePath: string) => Promise<{
    success: boolean;
    dataUrl?: string;
    error?: string;
  }>;
  findImageInVault: (vaultPath: string, imageName: string) => Promise<{
    success: boolean;
    path?: string;
    error?: string;
  }>;

  // PDF Companion Support
  ensurePdfCompanion: (pdfPath: string, vaultPath: string) => Promise<{
    exists: boolean;
    path: string;
    content: string;
  }>;
  syncPdfCompanion: (oldCompanionPath: string, newPdfPath: string, vaultPath: string) => Promise<{
    success: boolean;
    oldPath?: string;
    newPath?: string;
    content?: string;
    error?: string;
  }>;

  // Graph-Daten Persistenz
  saveGraphData: (vaultPath: string, data: object) => Promise<boolean>;
  loadGraphData: (vaultPath: string) => Promise<object | null>;

  // Notes Cache für schnelles Laden
  saveNotesCache: (vaultPath: string, cache: object) => Promise<boolean>;
  loadNotesCache: (vaultPath: string) => Promise<object | null>;
  getFilesWithMtime: (vaultPath: string) => Promise<Array<{ path: string; mtime: number }>>;

  // PDF Export
  exportPDF: (defaultFileName: string, htmlContent: string, title: string, vaultPath?: string, notePath?: string, pdfStyle?: 'standard' | 'remarkable-book') => Promise<{
    success: boolean;
    path?: string;
    error?: string;
  }>;

  // Terminal
  terminalCreate: (cwd: string) => void;
  terminalWrite: (data: string) => void;
  terminalResize: (cols: number, rows: number) => void;
  terminalDestroy: () => void;
  onTerminalData: (callback: (data: string) => void) => void;
  onTerminalExit: (callback: () => void) => void;
  onTerminalError: (callback: (error: string) => void) => void;

  // Command existence check
  checkCommandExists: (command: string, args?: string[]) => Promise<{ exists: boolean }>;

  // Notifications für Reminder-System
  showNotification: (title: string, body: string, noteId?: string) => Promise<boolean>;
  onNotificationClicked: (callback: (noteId: string) => void) => void;

  // Zotero / Better BibTeX API
  zoteroCheck: () => Promise<boolean>;
  zoteroSearch: (query: string) => Promise<Array<{ item: object; citekey: string }>>;
  zoteroListCitationStyles: () => Promise<Array<{ id: string; label: string; description: string; format?: string }>>;
  zoteroFormatBibliography: (citekey: string, styleId: string, locale?: string) => Promise<string>;
  zoteroGetNotes: (citekey: string) => Promise<unknown>;

  // Semantic Scholar API
  semanticScholarSearch: (query: string, filters?: object) => Promise<{ total: number; papers: Array<object>; error?: string; retryAfterMs?: number }>;
  semanticScholarGetPaper: (paperId: string) => Promise<object | null>;
  openAlexSearch: (query: string, filters?: object) => Promise<{ total: number; papers: Array<object>; error?: string; retryAfterMs?: number; warning?: string }>;
  openAlexSaveKey: (apiKey: string) => Promise<{ success: boolean; error?: string }>;
  openAlexLoadKey: () => Promise<string | null>;
  openAlexDeleteKey: () => Promise<{ success: boolean; error?: string }>;
  openAlexSaveMailto: (mailto: string) => Promise<{ success: boolean; error?: string }>;
  openAlexLoadMailto: () => Promise<string | null>;
  openAlexDeleteMailto: () => Promise<{ success: boolean; error?: string }>;
  openAlexCheck: () => Promise<{ available: boolean; authenticated: boolean; remaining?: string; error?: string }>;

  // Notiz-Agent Phase 1: Kontext-Dateien für die Macher-Leiste
  noteAgentAttachDialog: () => Promise<NoteAgentAttachResult>;
  noteAgentAttachFolderDialog: () => Promise<NoteAgentAttachResult>;
  noteAgentAttachVaultFile: (vaultPath: string, relPath: string) => Promise<NoteAgentAttachResult>;
  noteAgentDetach: (id: string) => Promise<{ success: boolean }>;
  // Notiz-Agent Phase 2: Agent-Loop (Modus B)
  noteAgentRun: (params: {
    vaultPath: string;
    noteId: string;
    noteContent: string;
    instruction: string;
    model: string;
    attachmentIds: string[];
    targetFolderRel: string;
    cloud?: { model: string; provider?: 'openrouter' | 'llmbase' } | null;
    webResearch?: { enabled: boolean } | null;
  }) => Promise<{ success: boolean; runId?: string; error?: string }>;
  noteAgentCancel: (runId: string) => Promise<{ success: boolean }>;
  noteAgentRemember: (vaultPath: string, text: string) => Promise<{ success: boolean; relPath?: string; error?: string }>;
  // Agent-Skills Stufe 1
  noteSkillsList: (vaultPath: string) => Promise<{ skills: NoteAgentSkill[]; error?: string }>;
  noteSkillsSetEnabled: (vaultPath: string, folderName: string, enabled: boolean) => Promise<{ success: boolean; error?: string }>;
  noteSkillsCreate: (vaultPath: string, name: string) => Promise<{ success: boolean; relPath?: string; folderName?: string; error?: string }>;
  noteSkillsInstallStarter: (vaultPath: string) => Promise<{ success: boolean; installed: string[]; error?: string }>;
  // Agent-Skills Stufe 2: Katalog + Import
  noteSkillsCatalog: () => Promise<{ skills: NoteAgentCatalogSkill[]; error?: string }>;
  noteSkillsCatalogInstall: (vaultPath: string, id: string) => Promise<{ success: boolean; relPath?: string; folderName?: string; error?: string }>;
  noteSkillsImportDialog: (vaultPath: string) => Promise<{ success: boolean; cancelled?: boolean; relPath?: string; folderName?: string; skippedScripts?: boolean; error?: string }>;
  noteAgentAcceptResult: (runId: string, resultId: string) => Promise<{ success: boolean; fileName?: string; relPath?: string; error?: string }>;
  noteAgentDiscardResult: (runId: string, resultId: string) => Promise<{ success: boolean; error?: string }>;
  onNoteAgentProgress: (callback: (p: NoteAgentProgressEvent) => void) => void;
  onNoteAgentDone: (callback: (p: NoteAgentDoneEvent) => void) => void;
  onNoteAgentRunEvicted: (callback: (p: { runId: string }) => void) => void;

  // Ollama Local AI API
  ollamaCheck: () => Promise<boolean>;
  ollamaModels: () => Promise<Array<{ name: string; size: number }>>;
  ollamaImageModels: () => Promise<Array<{ name: string; size: number }>>;
  ollamaGenerate: (request: {
    model: string;
    prompt: string;
    action: 'translate' | 'summarize' | 'continue' | 'improve' | 'custom' | 'ocr-cleanup';
    targetLanguage?: string;
    originalText: string;
    customPrompt?: string;
    cloud?: { model: string; provider?: 'openrouter' | 'llmbase' } | null;
    contextAttachmentIds?: string[];
  }) => Promise<{
    success: boolean;
    result?: string;
    error?: string;
    model?: string;
    action?: string;
    prompt?: string;
    originalText?: string;
    targetLanguage?: string;
    customPrompt?: string;
    timestamp?: string;
  }>;
  ollamaGenerateImage: (request: {
    model: string;
    prompt: string;
    vaultPath: string;
    width?: number;
    height?: number;
    steps?: number;
  }) => Promise<{
    success: boolean;
    fileName?: string;
    relativePath?: string;
    error?: string;
  }>;
  onOllamaImageProgress: (callback: (progress: { completed: number; total: number }) => void) => void;
  ollamaPullModel: (name: string) => Promise<{ success: boolean; error?: string }>;
  ollamaDeleteModel: (name: string) => Promise<{ success: boolean; error?: string }>;
  onOllamaPullProgress: (callback: (progress: { status: string; completed?: number; total?: number }) => void) => void;

  // Ollama Embeddings für Smart Connections
  ollamaEmbeddings: (model: string, text: string) => Promise<{
    success: boolean;
    embedding?: number[];
    error?: string;
  }>;
  ollamaEmbeddingModels: () => Promise<Array<{ name: string; size: number }>>;

  // LLM-as-Judge-Reranker für Smart Connections
  ollamaRerankPair: (model: string, query: string, document: string) => Promise<{
    success: boolean;
    score?: number;
    error?: string;
  }>;

  // Ollama Chat für Notes Chat
  ollamaChat: (model: string, messages: Array<{ role: string; content: string }>, context: string, chatMode?: 'direct' | 'socratic' | 'grill' | 'email', cloud?: { model: string; provider?: 'openrouter' | 'llmbase' } | null, contextAttachmentIds?: string[]) => Promise<{
    success: boolean;
    response?: string;
    error?: string;
  }>;
  onOllamaChatChunk: (callback: (chunk: string) => void) => void;
  onOllamaChatDone: (callback: () => void) => void;
  onOllamaEmailChatChunk: (callback: (chunk: string) => void) => void;
  onOllamaEmailChatDone: (callback: () => void) => void;

  // Projekt-RAG: Projektordner semantisch befragen (lokal)
  projectRagStatus: (vaultPath: string, projectFolderRel: string, embedModel: string) => Promise<RagIndexStatus>;
  projectRagIndex: (vaultPath: string, projectFolderRel: string, embedModel: string) => Promise<{ success: boolean; chunkCount?: number; fileCount?: number; error?: string }>;
  onProjectRagIndexProgress: (callback: (progress: { done: number; total: number }) => void) => void;
  projectRagQuery: (vaultPath: string, projectFolderRel: string, query: string, embedModel: string, opts?: object) => Promise<RagQueryResult>;
  projectRagAnswer: (vaultPath: string, projectFolderRel: string, query: string, embedModel: string, chatModel: string, language?: 'de' | 'en') => Promise<{ success: boolean; response?: string; sources?: RetrievedChunk[]; error?: string }>;
  onProjectRagAnswerChunk: (callback: (chunk: string) => void) => void;
  onProjectRagAnswerDone: (callback: () => void) => void;
  onProjectRagAnswerSources: (callback: (sources: RetrievedChunk[]) => void) => void;
  projectRagRerankCandidates: (vaultPath: string, queryText: string, candidateFolderRels: string[], embedModel: string) => Promise<{ success: boolean; ranking: Array<{ folderRel: string; score: number | null }>; error?: string }>;

  // LM Studio Local AI API (OpenAI-kompatibel)
  lmstudioCheck: (port?: number) => Promise<boolean>;
  lmstudioModels: (port?: number) => Promise<Array<{ name: string; size: number }>>;
  lmstudioGenerate: (request: {
    model: string;
    prompt: string;
    action: 'translate' | 'summarize' | 'continue' | 'improve' | 'custom' | 'ocr-cleanup';
    targetLanguage?: string;
    originalText: string;
    customPrompt?: string;
    port?: number;
    contextAttachmentIds?: string[];
  }) => Promise<{
    success: boolean;
    result?: string;
    error?: string;
    model?: string;
    action?: string;
    prompt?: string;
    originalText?: string;
    targetLanguage?: string;
    customPrompt?: string;
    timestamp?: string;
  }>;
  lmstudioChat: (model: string, messages: Array<{ role: string; content: string }>, context: string, chatMode?: 'direct' | 'socratic' | 'grill', port?: number, contextAttachmentIds?: string[]) => Promise<{
    success: boolean;
    response?: string;
    error?: string;
  }>;
  lmstudioEmbeddings: (model: string, text: string, port?: number) => Promise<{
    success: boolean;
    embedding?: number[];
    error?: string;
  }>;
  lmstudioEmbeddingModels: (port?: number) => Promise<Array<{ name: string; size: number }>>;

  // Wikilink Stripping
  stripWikilinksInFolder: (folderPath: string, vaultPath: string) => Promise<{
    success: boolean;
    filesProcessed?: number;
    filesModified?: number;
    wikilinksRemoved?: number;
    error?: string;
  }>;

  // Voice / Whisper STT
  voiceCheckWhisper: (command: string) => Promise<{
    available: boolean;
    command: string | null;
    binary: string | null;
    error?: string;
  }>;
  voiceTranscribe: (audio: ArrayBuffer, extension: string, opts: { command: string; model: string; language: string }) => Promise<{
    success: boolean;
    text?: string;
    error?: string;
  }>;

  // Voice / ElevenLabs TTS
  elevenlabsSaveKey: (apiKey: string) => Promise<{ success: boolean; error?: string }>;
  elevenlabsLoadKey: () => Promise<string | null>;
  elevenlabsDeleteKey: () => Promise<{ success: boolean }>;
  elevenlabsListVoices: () => Promise<{
    success: boolean;
    voices?: Array<{ voice_id: string; name: string; labels?: Record<string, string>; category?: string }>;
    error?: string;
  }>;
  elevenlabsSynthesize: (params: { text: string; voiceId: string; modelId: string; stability: number; similarity: number }) => Promise<{
    success: boolean;
    audio?: ArrayBuffer;
    error?: string;
  }>;

  // Docling PDF Extraction API
  doclingCheck: (baseUrl?: string) => Promise<{
    available: boolean;
    version?: string;
  }>;
  doclingConvertPdf: (pdfPath: string, baseUrl?: string, options?: DoclingOptions) => Promise<{
    success: boolean;
    content?: string;
    sourceFile?: string;
    error?: string;
  }>;

  // Vision OCR (Ollama Vision Models)
  visionOcrModels: () => Promise<{ name: string; size: number }[]>;
  visionOcrExtractPage: (base64Image: string, model: string, pageNum: number) => Promise<{
    success: boolean;
    content: string;
    error?: string;
  }>;

  // Readwise Integration API
  readwiseCheck: (apiKey: string) => Promise<{ available: boolean }>;
  readwiseSync: (apiKey: string, syncFolder: string, vaultPath: string, lastSyncedAt?: string, syncCategories?: Record<string, boolean>) => Promise<{
    success: boolean;
    stats?: { new: number; updated: number; total: number };
    syncedFiles?: string[];
    error?: string;
  }>;
  onReadwiseSyncProgress: (callback: (progress: { current: number; total: number; status: string; title?: string }) => void) => void;

  // LanguageTool Grammar/Spell Check API
  languagetoolCheck: (mode?: 'local' | 'api', localUrl?: string, apiKey?: string) => Promise<{
    available: boolean;
  }>;
  languagetoolAnalyze: (text: string, language?: string, mode?: 'local' | 'api', localUrl?: string, apiUsername?: string, apiKey?: string) => Promise<{
    success: boolean;
    matches?: LanguageToolMatch[];
    detectedLanguage?: string;
    error?: string;
  }>;

  // Custom Logo
  selectCustomLogo: () => Promise<string | null>;
  removeCustomLogo: () => Promise<boolean>;

  // Update-Checker & What's New
  getAppVersion: () => Promise<string>;
  getSystemMemory: () => Promise<{ totalGB: number; freeGB: number; cpus: number }>;
  checkForUpdates: () => Promise<UpdateInfo>;
  installUpdate: () => Promise<boolean>;
  getWhatsNewContent: (version: string) => Promise<string | null>;
  onAutoUpdateAvailable: (callback: (info: { version: string }) => void) => void;
  onAutoUpdateProgress: (callback: (progress: { percent: number }) => void) => void;
  onAutoUpdateDownloaded: (callback: (info: { version: string }) => void) => void;

  // Quiz / Spaced Repetition
  quizGenerateQuestions: (model: string, content: string, count: number, sourcePath: string, cloud?: { model: string; provider?: 'openrouter' | 'llmbase' } | null) => Promise<{
    success: boolean;
    questions?: QuizQuestion[];
    error?: string;
  }>;
  quizEvaluateAnswer: (model: string, question: string, expectedAnswer: string, userAnswer: string, cloud?: { model: string; provider?: 'openrouter' | 'llmbase' } | null) => Promise<{
    success: boolean;
    score?: number;
    feedback?: string;
    correct?: boolean;
    error?: string;
  }>;
  quizAnalyzeResults: (model: string, results: QuizResult[], questions: QuizQuestion[], cloud?: { model: string; provider?: 'openrouter' | 'llmbase' } | null) => Promise<{
    success: boolean;
    analysis?: QuizAnalysis;
    error?: string;
  }>;
  flashcardsGenerate: (model: string, content: string, count: number, sourcePath: string, cloud?: { model: string; provider?: 'openrouter' | 'llmbase' } | null) => Promise<{
    success: boolean;
    cards?: { front: string; back: string; topic: string }[];
    error?: string;
  }>;
  onQuizProgress: (callback: (progress: { current: number; total: number; status: string }) => void) => void;

  // Learning Progress Persistence
  saveLearningProgress: (vaultPath: string, progress: Record<string, LearningProgress>) => Promise<boolean>;
  loadLearningProgress: (vaultPath: string) => Promise<Record<string, LearningProgress> | null>;

  // Flashcards Persistence
  flashcardsLoad: (vaultPath: string) => Promise<Flashcard[] | null>;
  flashcardsSave: (vaultPath: string, flashcards: Flashcard[]) => Promise<boolean>;

  // Anki Import
  importAnki: (vaultPath: string) => Promise<{
    success: boolean
    canceled?: boolean
    cards?: Flashcard[]
    mediaCount?: number
    deckNames?: string[]
    cardCount?: number
    error?: string
  }>;

  // Study Statistics Persistence
  studyStatsLoad: (vaultPath: string) => Promise<StudyStatsData | null>;
  studyStatsSave: (vaultPath: string, data: StudyStatsData) => Promise<boolean>;

  // Sync
  syncSetup: (vaultPath: string, passphrase: string, relayUrl: string, autoSyncInterval?: number, activationCode?: string) => Promise<{ vaultId: string }>;
  syncJoin: (vaultPath: string, vaultId: string, passphrase: string, relayUrl: string, autoSyncInterval?: number, activationCode?: string) => Promise<boolean>;
  syncNow: (force?: boolean) => Promise<SyncResult>;
  syncDisable: () => Promise<boolean>;
  syncSetAutoSync: (intervalSeconds: number) => Promise<boolean>;
  syncStatus: () => Promise<{
    status: SyncProgress['status'];
    vaultId: string;
    connected: boolean;
    lastSyncTime: number | null;
  }>;
  syncSavePassphrase: (passphrase: string) => Promise<boolean>;
  syncLoadPassphrase: () => Promise<string | null>;
  syncRestore: (vaultPath: string, vaultId: string, relayUrl: string, autoSyncInterval?: number) => Promise<boolean>;
  syncSetExcludeConfig: (config: { folders: string[]; extensions: string[] }) => Promise<boolean>;
  syncGetDeletedFiles: () => Promise<DeletedFileInfo[]>;
  syncRestoreFile: (filePath: string) => Promise<boolean>;
  onSyncProgress: (callback: (data: SyncProgress) => void) => void;
  onSyncLog: (callback: (entry: Omit<SyncLogEntry, 'timestamp'>) => void) => void;

  // Email Integration
  emailConnect: (account: EmailAccount) => Promise<{ success: boolean; error?: string }>;
  emailListFolders: (account: EmailAccount) => Promise<{ success: boolean; folders: EmailFolder[]; error?: string }>;
  emailMove: (payload: { accountId: string; host: string; port: number; user: string; tls: boolean; sourceFolder: string; uid: number; destinationFolder: string }) => Promise<{ success: boolean; newUid?: number; destinationFolder?: string; error?: string }>;
  emailFetch: (vaultPath: string, accounts: Array<EmailAccount & { folder?: string }>, lastFetchedAt: Record<string, string>, maxPerAccount: number) => Promise<EmailFetchResult>;
  emailAnalyze: (vaultPath: string, model: string, emailIds?: string[], lowPowerMode?: boolean, cloud?: { model: string; provider?: 'openrouter' | 'llmbase' } | null) => Promise<{ success: boolean; analyzed: number; failed?: number; total?: number; lastError?: string | null; error?: string }>;
  emailRelevanceConfigLoad: (vaultPath: string) => Promise<{ success: boolean; config?: RelevanceConfig; hasBlock?: boolean; notePath?: string; error?: string }>;
  emailRelevanceConfigSave: (vaultPath: string, config: RelevanceConfig) => Promise<{ success: boolean; notePath?: string; error?: string }>;
  noteAnalyzeRelevance: (payload: {
    vaultPath: string
    noteRelativePath: string
    model: string
    context: {
      todayIso: string
      calendar: Array<{ title: string; startIso: string; daysAhead: number; location?: string }>
      emails: Array<{ from: string; subject: string; snippet: string; date: string }>
      recentNoteTitles: string[]
    }
  }) => Promise<{ success: true; score: number; reason: string; model: string; checkedAt: string } | { success: false; error: string; raw?: string }>;
  emailLoad: (vaultPath: string) => Promise<{ emails: EmailMessage[]; lastFetchedAt: Record<string, string> } | null>;
  emailSave: (vaultPath: string, data: { emails: EmailMessage[]; lastFetchedAt: Record<string, string> }) => Promise<boolean>;
  emailContactsLoad: (vaultPath: string) => Promise<SavedEmailContact[]>;
  emailSavePassword: (accountId: string, password: string) => Promise<boolean>;
  emailLoadPassword: (accountId: string) => Promise<string | null>;
  // OpenRouter Cloud-Backend
  openrouterSaveKey: (apiKey: string) => Promise<{ success: boolean; hasKey?: boolean; error?: string }>;
  openrouterHasKey: () => Promise<boolean>;
  openrouterClearKey: () => Promise<{ success: boolean }>;
  openrouterListModels: () => Promise<{ success: boolean; models: Array<{ id: string; name: string; contextLength?: number; promptPrice?: string }>; error?: string }>;
  openrouterTest: (model: string) => Promise<{ success: boolean; reply?: string; error?: string }>;
  // LLMBase Cloud-Backend (EU/DSGVO)
  llmbaseSaveKey: (apiKey: string) => Promise<{ success: boolean; hasKey?: boolean; error?: string }>;
  llmbaseHasKey: () => Promise<boolean>;
  llmbaseClearKey: () => Promise<{ success: boolean }>;
  llmbaseListModels: () => Promise<{ success: boolean; models: Array<{ id: string; name: string; contextLength?: number; promptPrice?: string }>; error?: string }>;
  llmbaseTest: (model: string) => Promise<{ success: boolean; reply?: string; error?: string }>;

  // Webrecherche (Opt-in) — Provider-Config + API-Keys liegen Main-seitig (0d), pro Provider.
  webResearchLoadConfig: () => Promise<{ provider: 'tavily' | 'searxng' | 'linkup'; searxngUrl: string; approvedPrivateOrigin?: string; hasTavilyKey: boolean; hasLinkupKey: boolean }>;
  webResearchSaveConfig: (input: { provider?: 'tavily' | 'searxng' | 'linkup'; searxngUrl?: string }) => Promise<{ success: boolean; config?: { provider: 'tavily' | 'searxng' | 'linkup'; searxngUrl: string }; error?: string }>;
  webResearchSaveKey: (provider: 'tavily' | 'linkup', apiKey: string) => Promise<{ success: boolean; hasKey?: boolean; error?: string }>;
  webResearchHasKey: (provider: 'tavily' | 'linkup') => Promise<boolean>;
  webResearchClearKey: (provider: 'tavily' | 'linkup') => Promise<{ success: boolean; error?: string }>;
  webResearchTest: () => Promise<{ success: boolean; count?: number; error?: string }>;
  onEmailFetchProgress: (callback: (progress: { current: number; total: number; status: string }) => void) => void;
  onEmailAnalysisProgress: (callback: (progress: { current: number; total: number }) => void) => void;
  emailSetup: (vaultPath: string, inboxFolderName?: string) => Promise<{ success: boolean; folderPath?: string; instructionPath?: string; error?: string }>;
  emailCreateNote: (vaultPath: string, email: EmailMessage, inboxFolderName?: string) => Promise<{ success: boolean; path?: string; alreadyExists?: boolean; error?: string }>;
  emailSend: (composeData: object) => Promise<EmailSendResult>;
  emailSelectSignatureImage: (vaultPath: string) => Promise<{ success: boolean; path?: string; dataUrl?: string; error?: string }>;
  emailLoadSignatureImage: (imagePath: string) => Promise<string | null>;

  // Apple Reminders (macOS)
  platform: string;
  createAppleReminder: (options: { title: string; notes?: string; dueDate?: string; dueTime?: string; list?: string }) => Promise<{ success: boolean; error?: string }>;

  // Apple Calendar (macOS)
  calendarGetEvents: (startDate: string, endDate: string) => Promise<{ success: boolean; events: CalendarEvent[]; error?: string; needsPermission?: boolean; neverAsked?: boolean }>;
  calendarCreateEvent: (params: { title: string; startIso: string; durationMinutes: number; notes?: string }) => Promise<{ success: boolean; eventId?: string; error?: string; needsPermission?: boolean }>;
  calendarRequestAccess: () => Promise<{ success: boolean; status: 'granted' | 'alreadyGranted' | 'denied' | 'deniedPersistent' | 'unsupported' | 'error' | 'unknown'; error?: string; raw?: string }>;

  // reMarkable (USB)

  // edoobox Agent: vollständig nach src/plugins/edoobox/ migriert (Aufruf via edooboxClient) —
  // inkl. Formular-Import + IQ-/Anwesenheitsliste-DOCX (Phase 2). Datentypen (EdooboxImportResult,
  // IqReportData, AttendanceListData) bleiben hier, der Renderer nutzt sie weiter.

  // Antares CS: migriert nach src/plugins/antares/ — Aufruf via pluginInvoke('antares', actionId, payload).
  // Die Antares-Datentypen (AntaresEntleiher/VerleihRow/Lizenz/DashboardCounts) bleiben hier (Renderer nutzt sie).

  // Marketing (WordPress + Imagen): nach src/plugins/edoobox/ migriert (Aufruf via edooboxClient,
  // bytes-basierter Bild-Flow). Keine electronAPI-Methoden mehr (Phase 2b).

  // Office-Formate
  officeParseExcel: (filePath: string) => Promise<{ success: boolean; data?: ExcelData; error?: string }>;
  officeExcelToMarkdown: (filePath: string, sheetName?: string) => Promise<{ success: boolean; markdown?: string; error?: string }>;
  officeParseDocx: (filePath: string) => Promise<{ success: boolean; data?: WordData; error?: string }>;
  officeImportDocx: (vaultPath: string, sourcePath: string, targetFolder?: string) => Promise<{ success: boolean; relativePath?: string; error?: string }>;
  officeExportDocx: (markdownContent: string, suggestedName: string) => Promise<{ success: boolean; filePath?: string; canceled?: boolean; error?: string }>;
  officeParsePptx: (filePath: string) => Promise<{ success: boolean; data?: PowerPointData; error?: string }>;
  officeImportPptx: (vaultPath: string, sourcePath: string, targetFolder?: string) => Promise<{ success: boolean; relativePath?: string; error?: string }>;

  // Vault Settings
  loadVaultSettings: (vaultPath: string) => Promise<Record<string, unknown> | null>;
  saveVaultSettings: (vaultPath: string, settings: object) => Promise<boolean>;

  // Embeddings Cache
  saveEmbeddingsCache: (vaultPath: string, model: string, cache: object) => Promise<boolean>;
  loadEmbeddingsCache: (vaultPath: string, model: string) => Promise<object | null>;

  // Update & External
  downloadUpdate: () => Promise<{ success: boolean; error?: string }>;
  openExternal: (url: string) => Promise<void>;

  // Email attachments
  emailSelectAttachments: () => Promise<ComposeAttachment[]>;
  emailFetchAttachments: (payload: { accountId: string; host: string; port: number; user: string; tls: boolean; folder: string; uid: number }) => Promise<{ success: boolean; attachments?: Array<{ filename: string; contentType: string; size: number; contentBase64: string | null; tooLarge: boolean }>; error?: string }>;
  emailSaveAttachment: (filename: string, contentBase64: string) => Promise<{ success: boolean; path?: string; canceled?: boolean; error?: string }>;

  // Transport (Quick Capture)
  transportGetConfig: () => Promise<{ vaultPath: string | null; transport: { destinations: { label: string; folder: string }[]; predefinedTags: string[]; defaultDestinationIndex: number } | null }>;
  transportListVaultSubdirs: () => Promise<string[]>;
  transportSaveNote: (data: { title: string; category: string; tags: string[]; content: string; destinationFolder: string }) => Promise<{ success: boolean; relativePath?: string; error?: string }>;
  transportZettelContext: (preferredFolder?: string) => Promise<{ zettelFolder: string | null; tags: string[] }>;
  zettelSuggestMeta: (request: { model: string; title?: string; quote?: string; thought?: string; candidateTags?: string[] }) =>
    Promise<{ success: boolean; tags?: string[]; emojis?: string; error?: string; model?: string }>;
  transportSaveZettel: (data: { title: string; emojis: string; quote: string; thought: string; source: string; tags: string[]; destinationFolder: string }) =>
    Promise<{ success: boolean; relativePath?: string; error?: string }>;
  transportOpenInMain: (relativePath: string) => Promise<void>;
  transportClose: () => Promise<void>;
  transportShow: () => Promise<void>;
  transportUpdateShortcut: (shortcut: string) => Promise<{ success: boolean; error?: string }>;
  openInVSCode: (absolutePath: string) => Promise<{ success: boolean; error?: string }>;
  htmlPreviewExport: (vaultPath: string, relativePath: string, format: 'pdf' | 'epub') =>
    Promise<{ success: boolean; path?: string; error?: string; warning?: string; canceled?: boolean }>;
  openPath: (absolutePath: string) => Promise<{ success: boolean; error?: string }>;
  onAiActionProgress: (callback: (progress: { action: string; current: number; total: number }) => void) => () => void;
  tasksUpdateLine: (data: {
    vaultPath: string;
    relativePath: string;
    lineIndex: number;
    expectedOldLine: string;
    newLine: string;
  }) => Promise<{ success: boolean; error?: string }>;
  tasksCreate: (data: {
    vaultPath: string;
    relativePath: string;
    taskLine: string;
  }) => Promise<{ success: boolean; relativePath?: string; error?: string }>;
  tasksSuggestTags: (request: {
    model: string;
    taskText: string;
    noteTitle?: string;
    candidateTags?: string[];
    existingTags?: string[];
  }) => Promise<{ success: boolean; tags?: string[]; model?: string; error?: string }>;
  onTransportNoteCreated: (callback: (data: { relativePath: string }) => void) => void;
  onTransportOpenNote: (callback: (relativePath: string) => void) => void;
  onTransportWindowShown: (callback: () => void) => void;

  // Telegram Bot
  telegramSaveToken: (token: string) => Promise<boolean>;
  telegramHasToken: () => Promise<boolean>;
  telegramUpdateConfig: (config: {
    ollamaModel?: string;
    excludedFolders?: string[];
    includeEmails?: boolean;
    includeOverdue?: boolean;
    allowedChatIds?: string[];
    priorityFolders?: string[];
    agentEnabled?: boolean;
    agentInboxFolder?: string;
    agentMaxIterations?: number;
    agentAllowedTools?: string[];
    agentConfirmTools?: string[];
    projectsRootFolder?: string;
    projectRagEmbeddingModel?: string;
  }) => Promise<boolean>;
  telegramStart: () => Promise<{ success: boolean; error?: string; alreadyRunning?: boolean }>;
  telegramStop: () => Promise<{ success: boolean; alreadyStopped?: boolean }>;
  telegramStatus: () => Promise<{ active: boolean }>;

  // Agent Memory (persistente Fakten für den Telegram-Agenten)
  agentMemoryLoad: () => Promise<{ entries: Array<{ id: string; key: string; value: string }> }>;
  agentMemorySave: (store: { entries: Array<{ id: string; key: string; value: string }> }) => Promise<boolean>;

  // Scheduler (zeitgesteuerte Read-Only-Aktionen)
  schedulerLoad: () => Promise<{ enabled: boolean; rules: Array<{ id: string; enabled: boolean; action: string; hour: number; minute: number; weekdays: number[]; label?: string }> }>;
  schedulerSave: (config: { enabled: boolean; rules: Array<{ id: string; enabled: boolean; action: string; hour: number; minute: number; weekdays: number[]; label?: string }> }) => Promise<boolean>;
  schedulerStart: () => Promise<boolean>;
  schedulerStop: () => Promise<boolean>;
  schedulerStatus: () => Promise<{ running: boolean; enabled: boolean; rules: Array<{ id: string; enabled: boolean; action: string; hour: number; minute: number; weekdays: number[]; label?: string }> }>;

  // Brain (lokales Tagesgedächtnis)
  brainConsolidateDay: (input: BrainConsolidateInput) => Promise<BrainConsolidateResult>;

  // E-Mail Markdown-Vorschau
  emailRenderHtml: (body: string) => Promise<string>;

  // Workflow Canvas
  workflowLoad: (vaultPath: string) => Promise<import('./workflow/model').WorkflowFile | null>;
  workflowSave: (vaultPath: string, file: import('./workflow/model').WorkflowFile) => Promise<{ success: boolean; error?: string }>;
  workflowRun: (payload: import('./workflow/model').WorkflowRunPayload) => Promise<import('./workflow/model').WorkflowRun>;

  // Plugin-Transport
  pluginInvoke: (pluginId: string, actionId: string, payload?: unknown) => Promise<import('./plugins/transport').PluginInvokeResult>;
  pluginList: () => Promise<import('./plugins/transport').PluginInvokeResult>;
  pluginSetEnabled: (pluginId: string, enabled: boolean) => Promise<import('./plugins/transport').PluginInvokeResult>;
  pluginInstall: () => Promise<{ ok: boolean; data?: { id: string; version: string; idempotent: boolean }; error?: string; code?: string; canceled?: boolean; restartRequired?: boolean }>;
  pluginInstallFromGithub: (repo: string, tag?: string) => Promise<{ ok: boolean; data?: { id: string; version: string; idempotent: boolean }; error?: string; code?: string; restartRequired?: boolean }>;
  pluginUninstall: (pluginId: string) => Promise<{ ok: boolean; error?: string }>;
  pluginInstallErrors: () => Promise<{ ok: boolean; data?: Array<{ id: string; version: string; code: string; message: string }>; error?: string }>;
  pluginInstalled: () => Promise<{ ok: boolean; data?: Array<{ id: string; version: string; activation: string; readiness: string | null; error: string | null }>; error?: string }>;
  pluginCheckUpdates: () => Promise<{ ok: boolean; data?: Array<{ id: string; repo: string; current: string; latest: string; hasUpdate: boolean }>; error?: string }>;
  pluginCatalog: () => Promise<{ ok: boolean; data?: Array<{ id: string; name: string; repo: string; description?: string; author?: string; category?: string; tag?: string }>; error?: string; code?: string }>;
  pluginWidgets: () => Promise<import('./plugins/widget').WidgetListResult>;
  pluginWidgetData: (instanceId: string) => Promise<import('./plugins/widget').WidgetDataResult>;
  onPluginWidgetsChanged: (callback: () => void) => () => void;
  // Renderer-Plugin-Host (ADR plugin-renderer-host §5.3/§6): byte-freie Liste + Serve der verifizierten
  // Bytes (Blob-Import) + capability-gated Vault-Bridge + Lifecycle-Push + Aktivierungs-Ack (F06).
  pluginRenderers: () => Promise<import('./plugins/renderer').RendererListResult>;
  pluginRendererEntry: (pluginId: string) => Promise<import('./plugins/renderer').RendererServeResult>;
  pluginHost: (rendererInstanceId: string, op: string, args: unknown[]) => Promise<import('./plugins/renderer').RendererHostOpResult>;
  onPluginRenderersChanged: (callback: () => void) => () => void;
  pluginRendererActivated: (ack: import('./plugins/renderer').RendererActivateAck) => Promise<{ ok: boolean }>;
  // Gerichteter Teardown (ADR §5.2/§5.5, F15/F16): Main fordert den Teardown EINER instanceId an, der
  // Renderer disposed (Mounts + module.deactivate + Styles + Blob) und ackt den §5.5-Ausgang zurück.
  onPluginRendererTeardown: (callback: (rendererInstanceId: string) => void) => () => void;
  pluginRendererTornDown: (ack: import('./plugins/renderer').RendererTeardownAck) => Promise<{ ok: boolean }>;

  // Projekt-Status-Crystallizer
  projectStatusDiscover: (vaultPath: string, projectsFolderRel: string) => Promise<{ success: boolean; projects?: DiscoveredProject[]; error?: string }>;
  projectStatusMark: (vaultPath: string, projectFolderRel: string, keywords: string[], priority: 'high' | 'med' | 'low') => Promise<{ success: boolean; statusFilePath?: string; error?: string }>;
  projectStatusSuggestKeywords: (vaultPath: string, projectFolderRel: string) => Promise<{ success: boolean; keywords?: string[]; error?: string }>;
  projectStatusCrystallize: (input: ProjectStatusCrystallizeInput) => Promise<ProjectStatusResult>;
  projectStatusCleanup: (vaultPath: string, filePath: string, refsToRemove: string[], language: 'de' | 'en') => Promise<{ success: boolean; removedLineCount?: number; remainingFindings?: LintFinding[]; error?: string }>;
  projectStatusDeleteDraft: (vaultPath: string, filePath: string) => Promise<{ success: boolean; error?: string }>;
  projectStatusSetStatus: (vaultPath: string, projectFolderRel: string, status: 'active' | 'done') => Promise<{ success: boolean; error?: string }>;
  projectStatusGenerateSynonyms: (vaultPath: string, projectFolderRel: string, model: string) => Promise<{ success: boolean; cache?: ProjectSynonymCache; error?: string }>;
  projectStatusLoadSynonyms: (vaultPath: string, projectFolderRel: string) => Promise<{ success: boolean; cache?: ProjectSynonymCache | null; error?: string }>;
}

// Brain (lokales Tagesgedächtnis — Phase 1)
export interface BrainSensorNote {
  title: string;
  path: string;
  tags: string[];
  events: { opened: number; updated: number; created: boolean };
}

export interface BrainSensorTasks {
  completed: number;
  created: number;
  examples: string[];
}

export interface BrainSensorEmail {
  from: string;
  subject: string;
  relevance: number;
  needsReply: boolean;
}

export interface BrainSensorEmails {
  received: number;
  replied: number;
  topRelevant: BrainSensorEmail[];
}

export interface BrainSensorJournal {
  title: string;
  path: string;
  excerpt: string;  // Body ohne Frontmatter, gekürzt auf ~2000 Zeichen
}

export interface BrainSensors {
  notes: BrainSensorNote[];
  tasks: BrainSensorTasks;
  emails: BrainSensorEmails;
  journal?: BrainSensorJournal;
}

export interface BrainConsolidateInput {
  vaultPath: string;
  folderPath: string;          // Relativer Pfad im Vault, z.B. '800 - 🧠 brain'
  date: string;
  generatedAtIso: string;
  model: string;
  language: 'de' | 'en';
  sensors: BrainSensors;
}

export interface BrainConsolidateResult {
  success: boolean;
  notePath?: string;
  error?: string;
}

// Projekt-Status-Crystallizer
//
// Idee: Aus deinen Tagesnotizen (Brain), Inbox-Mails und Projekt-Dateien
// destilliert das Modul wöchentlich pro markiertem Projekt einen lebenden
// Status — lokal via Ollama, mit Wikilink-Lint und Audit-Trail.
//
// Markierung pro Projekt:
//   Frontmatter in `<Projektordner>/_STATUS.md` mit `keywords:` + `priority:`.
//   Existiert die Datei, ist das Projekt eingeschrieben.
//
// Wochen-Output:
//   `<Projektordner>/_STATUS-<ISO-Woche>.md` (Draft — wird nie überschrieben).

export type ProjectPriority = 'high' | 'med' | 'low';

/**
 * Lebenszyklus-Zustand eines markierten Projekts.
 *   - `active` (Default, auch bei fehlendem Feld): wird verfolgt, erscheint oben.
 *   - `done`: abgeschlossen — bleibt erfasst (Keywords/Synonyme/Drafts intakt),
 *     wird aber in eine eingeklappte „Abgeschlossen"-Sektion einsortiert.
 * Reversibel: `done` lässt sich jederzeit wieder auf `active` setzen.
 */
export type ProjectStatus = 'active' | 'done';

/** Frontmatter-Marker, der ein Projekt für den Crystallizer aktiviert. */
export interface ProjectStatusMarker {
  project: string;        // Anzeigename (in der Regel = Ordnername)
  keywords: string[];     // Identifikations-Begriffe für Brain-/Inbox-Filterung
  priority: ProjectPriority;
  status?: ProjectStatus; // optional; fehlt = 'active' (Rückwärtskompatibilität)
}

/** Ein in der Übersicht gefundenes, markiertes Projekt. */
export interface DiscoveredProject {
  folderName: string;             // z.B. "134 - AIS chat change"
  folderRel: string;              // vault-relativer Pfad zum Ordner
  marker: ProjectStatusMarker;
  lastBrainSignal: {
    date: string | null;          // YYYY-MM-DD oder null wenn kein Signal in 60 Tagen
    ageDays: number | null;       // Tage seit letztem Signal, null = unbekannt/zu alt
  };
  currentWeekDraft: string | null; // vault-relativer Pfad zum neuesten `_STATUS-<WW>*.md` oder null
  currentWeekDrafts: string[];     // alle Drafts der aktuellen Woche, neueste zuerst
}

/** Ein vorgefilterter Brain-Tag, der das Projekt-Keyword matched. */
export interface ProjectStatusBrainEntry {
  date: string;               // YYYY-MM-DD aus Pfad
  body: string;               // Inhalt ohne YAML-Frontmatter
  evidence: string[];         // welche Keywords matched haben
}

/** Eine projektzugehörige Quell-Datei (Projektdatei, Inbox-Note oder Email-Notiz). */
export interface ProjectStatusSourceFile {
  name: string;               // basename ohne .md
  pathRel: string;            // vault-relativer Pfad
  content: string;            // ggf. gekürzt auf ~60 Zeilen wenn zu groß
  origin: 'project' | 'inbox' | 'email';
}

/** Eingabe für den Crystallize-Lauf eines Projekts. */
export interface ProjectStatusCrystallizeInput {
  vaultPath: string;
  projectFolderRel: string;   // z.B. "100 - ✅ Projekte/134 - AIS chat change"
  model: string;              // z.B. "gemma4:latest"
  language: 'de' | 'en';
  brainFolderRel?: string;    // optional — Standard "800 - 🧠 brain"
  inboxFolderRel?: string;    // optional — Standard "000 - 📥 inbox/010 - 📥 Notes"
  emailFolderRel?: string;    // optional — Standard "‼️📧 - emails"
  ragEmbeddingModel?: string; // optional — wenn gesetzt, ergänzt Projekt-RAG (Unterordner) die Quellen
}

/** Lint-Findung im erzeugten Status — drei Klassen. */
export type LintFindingKind =
  | 'hallucination'            // ⚠ — Wikilink zu nicht existierender Datei
  | 'suggestion'               // 💡 — Wikilink fast richtig (ZK-ID/Emoji-Präfix fehlt)
  | 'markdown-link';           // 📝 — `[Text]` wo `[[Text]]` gemeint sein dürfte

export interface LintFinding {
  kind: LintFindingKind;
  ref: string;                 // wie es im Text steht
  count: number;               // Vorkommen im Dokument
  suggestion?: string;         // Empfehlung (für `suggestion` und `markdown-link`)
}

/** Vom Synonym-Generator erzeugter Cache pro Projekt. */
export interface ProjectSynonymCache {
  synonyms: string[];
  generatedAt: string;          // ISO-Timestamp
  model: string;                // verwendetes Ollama-Modell
  sourceCount: number;          // Anzahl betrachteter Dateien (inkl. _STATUS.md)
}

/** Ergebnis eines Crystallize-Laufs. */
export interface ProjectStatusResult {
  success: boolean;
  notePath?: string;            // absoluter Pfad zur erstellten `_STATUS-<WW>.md`
  weekTag?: string;             // z.B. "2026-W21"
  brainEntriesUsed?: number;
  inboxNotesUsed?: number;
  emailNotesUsed?: number;
  findings?: LintFinding[];
  error?: string;
}

// Office-Formate
export interface ExcelSheet {
  name: string;
  rows: string[][];
}
export interface ExcelData {
  sheets: ExcelSheet[];
}
export interface WordData {
  html: string;
  markdown: string;
  messages: string[];
}
export interface PowerPointSlide {
  index: number;
  title: string;
  text: string;
  notes?: string;
  images: { name: string; dataUrl: string }[];
}
export interface PowerPointData {
  slides: PowerPointSlide[];
}

// Email Integration Types
export interface EmailMessage {
  id: string              // Message-ID Header
  uid: number
  accountId: string
  from: { name: string; address: string }
  to: { name: string; address: string }[]
  /** CC-Empfänger aus dem IMAP-Envelope. Fehlt bei Mails, die vor Einführung
   *  des Felds gefetcht wurden — Anzeige und Reply-All behandeln undefined wie []. */
  cc?: { name: string; address: string }[]
  subject: string
  date: string            // ISO
  snippet: string         // Erste ~200 Zeichen
  bodyText: string
  /** Original-HTML-Body (gekappt), nur für die optionale HTML-Ansicht in der Detail-View.
   *  Wird im Renderer via sanitizeEmailHtml() entschärft (Remote-Bilder blockiert). */
  bodyHtml?: string
  flags: string[]         // \Seen, \Flagged etc.
  fetchedAt: string
  analysis?: EmailAnalysis
  noteCreated?: boolean   // true wenn Notiz bereits erstellt wurde
  notePath?: string       // Pfad zur erstellten Notiz
  sent?: boolean          // true fuer vom User gesendete Emails
  hasAttachments?: boolean
  attachmentNames?: string[]
  /** In-Reply-To-Header: Message-ID der Mail, auf die diese antwortet.
   *  Für den Reply-Received-Trigger (Match gegen gesendete Message-IDs). */
  inReplyTo?: string
  /** References-Header: Kette der Message-IDs im Thread (normalisiert als Array). */
  references?: string[]
  /** Vom User manuell zugewiesener Projektordner (vault-relativer Pfad).
   *  null = explizit "kein Projekt"; undefined = auto-Match aktiv. */
  userProject?: string | null
  /** IMAP-Folder, aus dem die Mail abgerufen wurde. Default 'INBOX' (für Legacy-Mails ohne Feld). */
  folder?: string
}

export interface EmailFolder {
  /** Voller IMAP-Pfad inkl. Delimiter (z.B. 'INBOX.Archive.2025') — eindeutig pro Account. */
  path: string
  /** Anzeigename (letztes Pfad-Segment). */
  name: string
  /** IMAP-Hierarchie-Trennzeichen ('.' bei Courier/Dovecot mit Prefix, '/' bei Gmail). */
  delimiter: string
  /** RFC 6154 SPECIAL-USE (\\Inbox, \\Sent, \\Drafts, \\Trash, \\Junk, \\Archive, \\All, \\Flagged). */
  specialUse?: string
  /** \\Noselect-Folder können keine Mails enthalten (nur Container für Subfolder). */
  selectable?: boolean
  /** Subscription-Status (RFC 3501). */
  subscribed?: boolean
}

export interface EmailSuggestedAction {
  action?: string
  beschreibung?: string
  date?: string
  datum?: string
  time?: string
  uhrzeit?: string
  [key: string]: unknown
}

export interface EmailAnalysis {
  relevant: boolean
  relevanceScore: number  // 0-100
  sentiment: 'positive' | 'neutral' | 'negative' | 'urgent'
  summary: string
  extractedInfo: string[]
  categories: string[]
  suggestedActions?: (EmailSuggestedAction | string)[]
  needsReply?: boolean
  replyUrgency?: 'low' | 'medium' | 'high'
  /** Hybrid-Scorer: vom LLM als zutreffend beurteilte (weiche) Kriterien — für Erklärbarkeit. */
  matchedCriteria?: string[]
  /** Hybrid-Scorer: zusammengeführte, menschenlesbare Gründe (harte Signale + weiche Kriterien). */
  relevanceReasons?: string[]
  /** Hybrid-Scorer: deterministischer Code-Floor aus VIP/Domain/Keyword/Antwort-Häufigkeit. */
  hardFloor?: number
  replyHandled?: boolean   // true wenn User die Antwort anderweitig erledigt hat (z.B. Telefon)
  replyHandledAt?: string  // ISO-Timestamp wann markiert
  /** Exactly-once-Marker: workflowId → runId. Verhindert Mehrfach-Auslösung
   *  desselben Workflows für dieselbe Mail über Re-Analyse/Neustart (Decision #5). */
  workflowRuns?: Record<string, string>
  analyzedAt: string
  model: string
}

export interface EmailFilter {
  sender?: string
  subject?: string
  content?: string
  onlyRelevant?: boolean
  onlyUnread?: boolean
  sentiment?: string
}

export interface EmailAccount {
  id: string
  name: string
  host: string
  port: number
  user: string
  fromAddress?: string
  tls: boolean
  smtpHost: string
  smtpPort: number
  smtpTls: boolean
}

export interface ComposeAttachment {
  path: string
  filename: string
  size: number
}

export interface ComposeEmail {
  to: { name: string; address: string }[]
  cc?: { name: string; address: string }[]
  subject: string
  body: string
  inReplyTo?: string
  references?: string
  accountId: string
  attachments?: ComposeAttachment[]
}

export interface EmailSendResult {
  success: boolean
  messageId?: string
  error?: string
  appendWarning?: string  // Send erfolgreich, aber Speichern im Gesendet-Ordner schlug fehl
  sentMailbox?: string    // Name des verwendeten Sent-Folders bei erfolgreichem Append
}

export interface EmailFetchResult {
  success: boolean
  newCount: number
  totalCount: number
  error?: string
}

/** Persistenter Kontakt-Speicher ({vault}/.mindgraph/contacts.json).
 *  Empfänger gesendeter Mails — überlebt das retainDays-Pruning von emails.json,
 *  damit selten angeschriebene Adressen im Compose-Autocomplete bleiben. */
export interface SavedEmailContact {
  email: string
  name?: string
  lastUsedAt?: string  // ISO-Datum der letzten gesendeten Mail an diese Adresse
}

export interface AggregatedContact {
  id: string
  name: string
  email: string
  aliases: string[]
  sources: ('email' | 'edoobox' | 'vault')[]
  emailCount: number
  lastEmailDate?: string
  edooboxBookings?: { offerId: string; offerName: string; status: string }[]
  vaultMentions?: string[]
}

// Apple Calendar Types
export interface CalendarEvent {
  title: string
  startDate: string
  endDate: string
  location?: string
  calendar?: string
  allDay?: boolean
}

// edoobox Agent Types
export interface EdooboxSpeaker {
  name: string
  role?: string
  institution?: string
}

export interface EdooboxEventDate {
  date: string       // ISO date YYYY-MM-DD
  startTime: string  // HH:mm
  endTime: string    // HH:mm
}

export interface EdooboxEvent {
  id: string
  title: string
  description: string
  maxParticipants?: number
  dates: EdooboxEventDate[]
  location?: string
  speakers: EdooboxSpeaker[]
  contact?: string
  price?: number
  category?: string
  status: 'imported' | 'pushed' | 'error'
  warnings?: string[]
  error?: string
  edooboxOfferId?: string
  importedAt: string  // ISO
  pushedAt?: string   // ISO
  sourceFile?: string
}

export interface EdooboxOffer {
  id: string
  name: string
  status: string
  dateCount: number
}

export interface EdooboxCategory {
  id: string
  name: string
}

export interface EdooboxBooking {
  id: string
  offerId: string
  userName: string
  userEmail: string
  status: string
  bookedAt: string  // ISO
  present?: boolean
  schule?: string
  personalNr?: string
}

export interface EdooboxOfferDashboard {
  id: string
  name: string
  number: string
  status: string
  bookingCount: number
  maxParticipants: number
  dateStart?: string
  dateEnd?: string
  epHash?: string
  location?: string
  leaders?: string[]
  description?: string
  bookings: EdooboxBooking[]
}

export interface EdooboxImportResult {
  event: EdooboxEvent
  warnings: string[]
}

export interface AttendanceParticipant {
  name: string
  vorname: string
  personalNr?: string
  schule?: string
}

export interface AttendanceListData {
  title: string
  location?: string
  laNr?: string
  akkrNr?: string
  schuljahr?: string
  dates: string[]  // ISO YYYY-MM-DD
  participants: AttendanceParticipant[]
}

export interface IqReportData {
  title: string
  dateStart?: string
  dateEnd?: string
  location?: string
  laNr?: string
  veranstaltungsNr?: string
  countTotal: number
  countTeachers: number
  countPrincipals: number
  checkFragebogen: boolean
  checkZielscheibe: boolean
  checkPositionieren: boolean
  checkMuendlich: boolean
  checkSonstiges: boolean
  checkDokumentiert: boolean
}

// Docling Options for PDF conversion
export interface DoclingOptions {
  ocrEnabled?: boolean;
  ocrLanguages?: string[];
}

// LanguageTool Settings
export interface LanguageToolSettings {
  enabled: boolean;
  url: string;
  language: string;  // 'auto', 'de-DE', 'en-US', etc.
  autoCheck: boolean;
  autoCheckDelay: number;  // ms
}

// LanguageTool API Response Types
export interface LanguageToolMatch {
  message: string;
  shortMessage: string;
  offset: number;
  length: number;
  replacements: Array<{ value: string }>;
  rule: {
    id: string;
    category: { id: string; name: string };
  };
}

export interface LanguageToolResponse {
  matches: LanguageToolMatch[];
  language: {
    name: string;
    code: string;
    detectedLanguage?: {
      name: string;
      code: string;
    };
  };
}

// ---- Antares CS (Medienzentrum-Verleihsystem) ----

/** Ein Entleiher aus der Antares-DB (Person, die Medien/Geräte ausleiht). */
export interface AntaresEntleiher {
  identifier: string
  fn_ename: string         // Nachname
  fn_vorname: string       // Vorname (oft mit trailing whitespace)
  fn_enr: string           // Entleihernummer
  fn_schulname: string
  fn_schulnr: string
  class: string
  __fromtable?: string
}

/** Eine Lizenz-Zeile (z.B. ablaufende Lizenz). */
export interface AntaresLizenz {
  identifier: string
  fn_erfdat: string       // ISO YYYY-MM-DD — Erfassungsdatum
  fn_enddat: string       // ISO YYYY-MM-DD — Ablaufdatum
  fn_titel: string        // Lizenz-/Medien-Titel
  fn_prod: string         // Quelle / Produzent
  fn_nnr: string          // Lizenznummer
  verf?: string           // Verfügbarkeit
  [k: string]: unknown
}

/** Counts aus dem Antares-Dashboard (geparst aus HTML). */
export interface AntaresDashboardCounts {
  offeneRegistrierungen: number
  offeneAnfragenGeraete: number
  offeneVorbestellungenGeraete: number
  stornierteVorbestellungen: number
  ueberfaelligeGeraete: number
  offeneVorbestellungenMedien: number
  ueberfaelligeMedien: number
}

/** Eine Verleih-Zeile (entliehene Kopie eines Mediums oder Geräts). */
export interface AntaresVerleihRow {
  identifier: string
  fn_leihnr: string        // Leihnummer
  fn_titel: string
  fn_info: string          // 'geraete' | 'medien'
  fn_status: string        // '10','11','20','21','40' etc.
  fn_mahnstufe?: string
  fn_kopienummer?: string
  fn_entldatum: string     // ISO YYYY-MM-DD (Ausleihdatum)
  fn_rueckdatum: string    // ISO YYYY-MM-DD (Rückgabedatum, fällig)
  fn_eingdatum?: string    // tatsächliche Rückgabe (oder leer)
  fn_versanddatum?: string
  fn_mahndat?: string
  fn_ename: string         // Entleiher-Nachname
  fn_vorname: string
  fn_enr: string
  fn_schulname: string
  fn_schulnr: string
  fn_erfname?: string      // Mitarbeiter der erfasst hat
  [k: string]: unknown
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
