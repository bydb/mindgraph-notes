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

// IPC Kommunikation
export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: FileEntry[];
  fileType?: 'markdown' | 'pdf' | 'image' | 'excel' | 'word' | 'powerpoint' | 'code';
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
  setMainLanguage: (lang: string) => Promise<boolean>;

  openVault: () => Promise<string | null>;
  selectFolderInVault: (vaultPath: string) => Promise<string | null>;
  selectVaultDirectory: () => Promise<string | null>;
  checkDirectoryEmpty: (dirPath: string) => Promise<boolean>;
  createStarterVault: (targetPath: string, language: string) => Promise<boolean>;
  createEmptyVault: (targetPath: string) => Promise<boolean>;
  readDirectory: (dirPath: string) => Promise<FileEntry[]>;
  readFile: (filePath: string) => Promise<string>;
  readFilesBatch: (basePath: string, relativePaths: string[]) => Promise<Record<string, string | null>>;
  readFileBinary: (filePath: string) => Promise<string>;  // Returns Base64
  writeFile: (filePath: string, content: string) => Promise<void>;
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
  copyImageToAttachments: (vaultPath: string, sourcePath: string) => Promise<{
    success: boolean;
    fileName?: string;
    relativePath?: string;
    error?: string;
  }>;
  writeImageFromBase64: (vaultPath: string, base64Data: string, suggestedName: string) => Promise<{
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
  exportPDF: (defaultFileName: string, htmlContent: string, title: string, vaultPath?: string, notePath?: string) => Promise<{
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
  zoteroGetNotes: (citekey: string) => Promise<unknown>;

  // Semantic Scholar API
  semanticScholarSearch: (query: string, filters?: object) => Promise<{ total: number; papers: Array<object> }>;
  semanticScholarGetPaper: (paperId: string) => Promise<object | null>;

  // Ollama Local AI API
  ollamaCheck: () => Promise<boolean>;
  ollamaModels: () => Promise<Array<{ name: string; size: number }>>;
  ollamaImageModels: () => Promise<Array<{ name: string; size: number }>>;
  ollamaGenerate: (request: {
    model: string;
    prompt: string;
    action: 'translate' | 'summarize' | 'continue' | 'improve' | 'custom';
    targetLanguage?: string;
    originalText: string;
    customPrompt?: string;
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

  // Ollama Chat für Notes Chat
  ollamaChat: (model: string, messages: Array<{ role: string; content: string }>, context: string, chatMode?: 'direct' | 'socratic' | 'email') => Promise<{
    success: boolean;
    response?: string;
    error?: string;
  }>;
  onOllamaChatChunk: (callback: (chunk: string) => void) => void;
  onOllamaChatDone: (callback: () => void) => void;

  // LM Studio Local AI API (OpenAI-kompatibel)
  lmstudioCheck: (port?: number) => Promise<boolean>;
  lmstudioModels: (port?: number) => Promise<Array<{ name: string; size: number }>>;
  lmstudioGenerate: (request: {
    model: string;
    prompt: string;
    action: 'translate' | 'summarize' | 'continue' | 'improve' | 'custom';
    targetLanguage?: string;
    originalText: string;
    customPrompt?: string;
    port?: number;
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
  lmstudioChat: (model: string, messages: Array<{ role: string; content: string }>, context: string, chatMode?: 'direct' | 'socratic', port?: number) => Promise<{
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
  checkForUpdates: () => Promise<UpdateInfo>;
  installUpdate: () => Promise<boolean>;
  getWhatsNewContent: (version: string) => Promise<string | null>;
  onAutoUpdateAvailable: (callback: (info: { version: string }) => void) => void;
  onAutoUpdateProgress: (callback: (progress: { percent: number }) => void) => void;
  onAutoUpdateDownloaded: (callback: (info: { version: string }) => void) => void;

  // Quiz / Spaced Repetition
  quizGenerateQuestions: (model: string, content: string, count: number, sourcePath: string) => Promise<{
    success: boolean;
    questions?: QuizQuestion[];
    error?: string;
  }>;
  quizEvaluateAnswer: (model: string, question: string, expectedAnswer: string, userAnswer: string) => Promise<{
    success: boolean;
    score?: number;
    feedback?: string;
    correct?: boolean;
    error?: string;
  }>;
  quizAnalyzeResults: (model: string, results: QuizResult[], questions: QuizQuestion[]) => Promise<{
    success: boolean;
    analysis?: QuizAnalysis;
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
  emailFetch: (vaultPath: string, accounts: EmailAccount[], lastFetchedAt: Record<string, string>, maxPerAccount: number) => Promise<EmailFetchResult>;
  emailAnalyze: (vaultPath: string, model: string, emailIds?: string[]) => Promise<{ success: boolean; analyzed: number; error?: string }>;
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
  emailSavePassword: (accountId: string, password: string) => Promise<boolean>;
  emailLoadPassword: (accountId: string) => Promise<string | null>;
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
  remarkableUsbCheck: () => Promise<ReMarkableUsbCheckResult>;
  remarkableListDocuments: (folderId?: string) => Promise<{ documents: ReMarkableDocumentSummary[]; error?: string }>;
  remarkableDownloadDocument: (vaultPath: string, document: { id: string; name: string }) => Promise<ReMarkableDownloadResult>;
  remarkableUploadPdf: (vaultPath: string, relativePdfPath: string) => Promise<ReMarkableUploadResult>;
  remarkableOptimizePdfForUpload: (vaultPath: string, relativePdfPath: string) => Promise<ReMarkableOptimizeResult>;
  remarkableUsbDebugInfo: () => Promise<ReMarkableUsbDebugInfoResult>;

  // edoobox Agent
  edooboxSaveCredentials: (apiKey: string, apiSecret: string) => Promise<boolean>;
  edooboxLoadCredentials: () => Promise<{ apiKey: string; apiSecret: string } | null>;
  edooboxCheck: (baseUrl: string, apiVersion: string) => Promise<{ success: boolean; error?: string }>;
  edooboxListOffers: (baseUrl: string, apiVersion: string) => Promise<{ success: boolean; offers?: EdooboxOffer[]; error?: string }>;
  edooboxListCategories: (baseUrl: string, apiVersion: string) => Promise<{ success: boolean; categories?: EdooboxCategory[]; error?: string }>;
  edooboxParseFormular: () => Promise<EdooboxImportResult | null>;
  edooboxImportEvent: (baseUrl: string, apiVersion: string, event: EdooboxEvent) => Promise<{ success: boolean; offerId?: string; error?: string }>;
  edooboxLoadEvents: (vaultPath: string) => Promise<EdooboxEvent[]>;
  edooboxSaveEvents: (vaultPath: string, events: EdooboxEvent[]) => Promise<boolean>;
  edooboxListOffersDashboard: (baseUrl: string, apiVersion: string, scope?: 'active' | 'past' | 'all') => Promise<{ success: boolean; offers?: EdooboxOfferDashboard[]; error?: string }>;
  edooboxListBookings: (baseUrl: string, apiVersion: string, offerId: string) => Promise<{ success: boolean; bookings?: EdooboxBooking[]; error?: string }>;
  edooboxListDates: (baseUrl: string, apiVersion: string, offerId: string) => Promise<{ success: boolean; dates?: EdooboxEventDate[]; error?: string }>;

  // IQ-Auswertung
  iqGenerateReport: (data: IqReportData, suggestedFileName: string) => Promise<{ success: boolean; filePath?: string; canceled?: boolean; error?: string }>;

  // Anwesenheitsliste
  attendanceListGenerate: (data: AttendanceListData, suggestedFileName: string) => Promise<{ success: boolean; filePath?: string; canceled?: boolean; error?: string }>;

  // Marketing (WordPress)
  marketingSaveCredentials: (credentials: { wpAppPassword?: string }) => Promise<boolean>;
  marketingLoadCredentials: () => Promise<{ wpAppPassword?: string } | null>;
  marketingCheckWordpress: (siteUrl: string, username: string) => Promise<{ success: boolean; userName?: string; error?: string }>;
  marketingGenerateContent: (offerData: object, model: string) => Promise<{ success: boolean; blogPost?: string; igCaption?: string; error?: string }>;
  marketingPublishWordpress: (siteUrl: string, username: string, title: string, content: string, status: 'draft' | 'publish', featuredMediaId?: number) => Promise<{ success: boolean; postId?: number; postUrl?: string; status?: string; error?: string }>;
  marketingUploadImage: (siteUrl: string, username: string, imagePath: string, caption?: string) => Promise<{ success: boolean; mediaId?: number; imageUrl?: string; error?: string }>;
  marketingGenerateImage: (prompt: string, apiKey: string) => Promise<{ success: boolean; imagePath?: string; imageBase64?: string; error?: string }>;
  marketingReadImageBase64: (imagePath: string) => Promise<string | null>;
  marketingSelectImage: () => Promise<string | null>;

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

  // Transport (Quick Capture)
  transportGetConfig: () => Promise<{ vaultPath: string | null; transport: { destinations: { label: string; folder: string }[]; predefinedTags: string[]; defaultDestinationIndex: number } | null }>;
  transportListVaultSubdirs: () => Promise<string[]>;
  transportSaveNote: (data: { title: string; category: string; tags: string[]; content: string; destinationFolder: string }) => Promise<{ success: boolean; relativePath?: string; error?: string }>;
  transportOpenInMain: (relativePath: string) => Promise<void>;
  transportClose: () => Promise<void>;
  transportShow: () => Promise<void>;
  transportUpdateShortcut: (shortcut: string) => Promise<{ success: boolean; error?: string }>;
  openInVSCode: (absolutePath: string) => Promise<{ success: boolean; error?: string }>;
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
  onTransportNoteCreated: (callback: (data: { relativePath: string }) => void) => void;
  onTransportOpenNote: (callback: (relativePath: string) => void) => void;
  onTransportWindowShown: (callback: () => void) => void;

  // Telegram Bot
  telegramSaveToken: (token: string) => Promise<boolean>;
  telegramHasToken: () => Promise<boolean>;
  telegramSaveAnthropicKey: (key: string) => Promise<boolean>;
  telegramHasAnthropicKey: () => Promise<boolean>;
  telegramUpdateConfig: (config: {
    backend?: 'ollama' | 'anthropic' | 'auto';
    anthropicModel?: string;
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
  }) => Promise<boolean>;
  telegramStart: () => Promise<{ success: boolean; error?: string; alreadyRunning?: boolean }>;
  telegramStop: () => Promise<{ success: boolean; alreadyStopped?: boolean }>;
  telegramStatus: () => Promise<{ active: boolean }>;

  // Brain (lokales Tagesgedächtnis)
  brainConsolidateDay: (input: BrainConsolidateInput) => Promise<BrainConsolidateResult>;
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
  subject: string
  date: string            // ISO
  snippet: string         // Erste ~200 Zeichen
  bodyText: string
  flags: string[]         // \Seen, \Flagged etc.
  fetchedAt: string
  analysis?: EmailAnalysis
  noteCreated?: boolean   // true wenn Notiz bereits erstellt wurde
  notePath?: string       // Pfad zur erstellten Notiz
  sent?: boolean          // true fuer vom User gesendete Emails
  hasAttachments?: boolean
  attachmentNames?: string[]
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
  replyHandled?: boolean   // true wenn User die Antwort anderweitig erledigt hat (z.B. Telefon)
  replyHandledAt?: string  // ISO-Timestamp wann markiert
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
}

export interface EmailFetchResult {
  success: boolean
  newCount: number
  totalCount: number
  error?: string
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

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
