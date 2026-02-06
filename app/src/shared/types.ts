// FileTree Icon Customization
export type IconSet = 'default' | 'minimal' | 'colorful' | 'emoji'

// Update-Checker Types
export interface UpdateInfo {
  available: boolean
  version?: string
  releaseUrl?: string
  body?: string
  error?: boolean
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
  fileType?: 'markdown' | 'pdf' | 'image';
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

// API Typen für IPC
export interface ElectronAPI {
  // Settings / Vault Persistenz
  getLastVault: () => Promise<string | null>;
  setLastVault: (vaultPath: string) => Promise<boolean>;

  // UI-Settings Persistenz
  loadUISettings: () => Promise<Record<string, unknown>>;
  saveUISettings: (settings: Record<string, unknown>) => Promise<boolean>;

  openVault: () => Promise<string | null>;
  readDirectory: (dirPath: string) => Promise<FileEntry[]>;
  readFile: (filePath: string) => Promise<string>;
  readFilesBatch: (basePath: string, relativePaths: string[]) => Promise<Record<string, string | null>>;
  readFileBinary: (filePath: string) => Promise<string>;  // Returns Base64
  writeFile: (filePath: string, content: string) => Promise<void>;
  deleteFile: (filePath: string) => Promise<boolean>;
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
  exportPDF: (defaultFileName: string, htmlContent: string, title: string) => Promise<{
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

  // Notifications für Reminder-System
  showNotification: (title: string, body: string, noteId?: string) => Promise<boolean>;
  onNotificationClicked: (callback: (noteId: string) => void) => void;

  // Zotero / Better BibTeX API
  zoteroCheck: () => Promise<boolean>;
  zoteroSearch: (query: string) => Promise<Array<{ item: object; citekey: string }>>;
  zoteroGetNotes: (citekey: string) => Promise<unknown>;

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

  // Ollama Embeddings für Smart Connections
  ollamaEmbeddings: (model: string, text: string) => Promise<{
    success: boolean;
    embedding?: number[];
    error?: string;
  }>;
  ollamaEmbeddingModels: () => Promise<Array<{ name: string; size: number }>>;

  // Ollama Chat für Notes Chat
  ollamaChat: (model: string, messages: Array<{ role: string; content: string }>, context: string, chatMode?: 'direct' | 'socratic') => Promise<{
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
  getWhatsNewContent: (version: string) => Promise<string | null>;

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
