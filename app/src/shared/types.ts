// FileTree Icon Customization
export type IconSet = 'default' | 'minimal' | 'colorful' | 'emoji'

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
