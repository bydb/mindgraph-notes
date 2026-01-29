import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  // Settings / Vault Persistenz
  getLastVault: () => ipcRenderer.invoke('get-last-vault'),
  setLastVault: (vaultPath: string) => ipcRenderer.invoke('set-last-vault', vaultPath),

  // UI-Settings Persistenz
  loadUISettings: () => ipcRenderer.invoke('load-ui-settings'),
  saveUISettings: (settings: object) => ipcRenderer.invoke('save-ui-settings', settings),

  openVault: () => ipcRenderer.invoke('open-vault'),
  readDirectory: (dirPath: string) => ipcRenderer.invoke('read-directory', dirPath),
  readFile: (filePath: string) => ipcRenderer.invoke('read-file', filePath),
  readFilesBatch: (basePath: string, relativePaths: string[]) => ipcRenderer.invoke('read-files-batch', basePath, relativePaths),
  readFileBinary: (filePath: string) => ipcRenderer.invoke('read-file-binary', filePath),
  writeFile: (filePath: string, content: string) => ipcRenderer.invoke('write-file', filePath, content),
  deleteFile: (filePath: string) => ipcRenderer.invoke('delete-file', filePath),
  deleteDirectory: (dirPath: string) => ipcRenderer.invoke('delete-directory', dirPath),
  renameFile: (oldPath: string, newPath: string) => ipcRenderer.invoke('rename-file', oldPath, newPath),
  moveFile: (sourcePath: string, targetDir: string) => ipcRenderer.invoke('move-file', sourcePath, targetDir),
  duplicateFile: (filePath: string) => ipcRenderer.invoke('duplicate-file', filePath),
  showInFolder: (filePath: string) => ipcRenderer.invoke('show-in-folder', filePath),
  promptNewNote: () => ipcRenderer.invoke('prompt-new-note'),
  createNote: (filePath: string) => ipcRenderer.invoke('create-note', filePath),
  getFileStats: (filePath: string) => ipcRenderer.invoke('get-file-stats', filePath),
  createDirectory: (dirPath: string) => ipcRenderer.invoke('create-directory', dirPath),
  promptNewFolder: (basePath: string) => ipcRenderer.invoke('prompt-new-folder', basePath),
  ensureDir: (dirPath: string) => ipcRenderer.invoke('ensure-dir', dirPath),

  // Image Handling
  copyImageToAttachments: (vaultPath: string, sourcePath: string) =>
    ipcRenderer.invoke('copy-image-to-attachments', vaultPath, sourcePath),
  writeImageFromBase64: (vaultPath: string, base64Data: string, suggestedName: string) =>
    ipcRenderer.invoke('write-image-from-base64', vaultPath, base64Data, suggestedName),
  readImageAsDataUrl: (imagePath: string) =>
    ipcRenderer.invoke('read-image-as-data-url', imagePath),
  findImageInVault: (vaultPath: string, imageName: string) =>
    ipcRenderer.invoke('find-image-in-vault', vaultPath, imageName),

  // PDF Companion Support
  ensurePdfCompanion: (pdfPath: string, vaultPath: string) =>
    ipcRenderer.invoke('ensure-pdf-companion', pdfPath, vaultPath),
  syncPdfCompanion: (oldCompanionPath: string, newPdfPath: string, vaultPath: string) =>
    ipcRenderer.invoke('sync-pdf-companion', oldCompanionPath, newPdfPath, vaultPath),

  // Graph-Daten Persistenz
  saveGraphData: (vaultPath: string, data: object) => ipcRenderer.invoke('save-graph-data', vaultPath, data),
  loadGraphData: (vaultPath: string) => ipcRenderer.invoke('load-graph-data', vaultPath),

  // Notes-Cache für schnelles Laden
  saveNotesCache: (vaultPath: string, cache: object) => ipcRenderer.invoke('save-notes-cache', vaultPath, cache),
  loadNotesCache: (vaultPath: string) => ipcRenderer.invoke('load-notes-cache', vaultPath),
  getFilesWithMtime: (vaultPath: string) => ipcRenderer.invoke('get-files-with-mtime', vaultPath),

  // Embeddings-Cache für Smart Connections
  saveEmbeddingsCache: (vaultPath: string, model: string, cache: object) =>
    ipcRenderer.invoke('save-embeddings-cache', vaultPath, model, cache),
  loadEmbeddingsCache: (vaultPath: string, model: string) =>
    ipcRenderer.invoke('load-embeddings-cache', vaultPath, model),

  // PDF Export
  exportPDF: (defaultFileName: string, htmlContent: string, title: string) =>
    ipcRenderer.invoke('export-pdf', defaultFileName, htmlContent, title),

  // Notification API für Reminder-System
  showNotification: (title: string, body: string, noteId?: string) =>
    ipcRenderer.invoke('show-notification', title, body, noteId),

  // Zotero / Better BibTeX API
  zoteroCheck: () => ipcRenderer.invoke('zotero-check'),
  zoteroSearch: (query: string) => ipcRenderer.invoke('zotero-search', query),
  zoteroGetNotes: (citekey: string) => ipcRenderer.invoke('zotero-get-notes', citekey),

  // Ollama Local AI API
  ollamaCheck: () => ipcRenderer.invoke('ollama-check'),
  ollamaModels: () => ipcRenderer.invoke('ollama-models'),
  ollamaImageModels: () => ipcRenderer.invoke('ollama-image-models'),
  ollamaGenerate: (request: {
    model: string
    prompt: string
    action: 'translate' | 'summarize' | 'continue' | 'improve' | 'custom'
    targetLanguage?: string
    originalText: string
    customPrompt?: string
  }) => ipcRenderer.invoke('ollama-generate', request),
  ollamaGenerateImage: (request: {
    model: string
    prompt: string
    vaultPath: string
    width?: number
    height?: number
    steps?: number
  }) => ipcRenderer.invoke('ollama-generate-image', request),
  onOllamaImageProgress: (callback: (progress: { completed: number; total: number }) => void) => {
    ipcRenderer.removeAllListeners('ollama-image-progress')
    ipcRenderer.on('ollama-image-progress', (_event, progress) => callback(progress))
  },

  // Ollama Embeddings für Smart Connections
  ollamaEmbeddings: (model: string, text: string) =>
    ipcRenderer.invoke('ollama-embeddings', model, text),
  ollamaEmbeddingModels: () => ipcRenderer.invoke('ollama-embedding-models'),

  // Ollama Chat für Notes Chat
  ollamaChat: (model: string, messages: Array<{ role: string; content: string }>, context: string, chatMode: 'direct' | 'socratic' = 'direct') =>
    ipcRenderer.invoke('ollama-chat', model, messages, context, chatMode),
  onOllamaChatChunk: (callback: (chunk: string) => void) => {
    ipcRenderer.removeAllListeners('ollama-chat-chunk')
    ipcRenderer.on('ollama-chat-chunk', (_event, chunk) => callback(chunk))
  },
  onOllamaChatDone: (callback: () => void) => {
    ipcRenderer.removeAllListeners('ollama-chat-done')
    ipcRenderer.on('ollama-chat-done', () => callback())
  },

  // LM Studio Local AI API (OpenAI-kompatibel)
  lmstudioCheck: (port?: number) => ipcRenderer.invoke('lmstudio-check', port),
  lmstudioModels: (port?: number) => ipcRenderer.invoke('lmstudio-models', port),
  lmstudioGenerate: (request: {
    model: string
    prompt: string
    action: 'translate' | 'summarize' | 'continue' | 'improve' | 'custom'
    targetLanguage?: string
    originalText: string
    customPrompt?: string
    port?: number
  }) => ipcRenderer.invoke('lmstudio-generate', request),
  lmstudioChat: (model: string, messages: Array<{ role: string; content: string }>, context: string, chatMode: 'direct' | 'socratic' = 'direct', port?: number) =>
    ipcRenderer.invoke('lmstudio-chat', model, messages, context, chatMode, port),
  lmstudioEmbeddings: (model: string, text: string, port?: number) =>
    ipcRenderer.invoke('lmstudio-embeddings', model, text, port),
  lmstudioEmbeddingModels: (port?: number) => ipcRenderer.invoke('lmstudio-embedding-models', port),

  // Wikilink Stripping
  stripWikilinksInFolder: (folderPath: string, vaultPath: string) =>
    ipcRenderer.invoke('strip-wikilinks-in-folder', folderPath, vaultPath),

  // Docling PDF Extraction API
  doclingCheck: (baseUrl?: string) => ipcRenderer.invoke('docling-check', baseUrl),
  doclingConvertPdf: (pdfPath: string, baseUrl?: string, options?: { ocrEnabled?: boolean; ocrLanguages?: string[] }) =>
    ipcRenderer.invoke('docling-convert-pdf', pdfPath, baseUrl, options),

  onNotificationClicked: (callback: (noteId: string) => void) => {
    ipcRenderer.removeAllListeners('notification-clicked')
    ipcRenderer.on('notification-clicked', (_event, noteId) => callback(noteId))
  },

  watchDirectory: (dirPath: string, callback: (event: string, filePath: string) => void) => {
    ipcRenderer.send('watch-directory', dirPath)
    ipcRenderer.on('file-changed', (_event, eventName, filePath) => {
      callback(eventName, filePath)
    })
  },
  
  unwatchDirectory: () => {
    ipcRenderer.send('unwatch-directory')
    ipcRenderer.removeAllListeners('file-changed')
  },
  
  // Terminal API
  terminalCreate: (cwd: string) => ipcRenderer.send('terminal-create', cwd),
  terminalWrite: (data: string) => ipcRenderer.send('terminal-write', data),
  terminalResize: (cols: number, rows: number) => ipcRenderer.send('terminal-resize', cols, rows),
  terminalDestroy: () => ipcRenderer.send('terminal-destroy'),
  
  onTerminalData: (callback: (data: string) => void) => {
    console.log('[Preload] Setting up terminal-data listener')
    ipcRenderer.removeAllListeners('terminal-data')
    ipcRenderer.on('terminal-data', (_event, data) => {
      console.log('[Preload] Received terminal-data, length:', data?.length)
      callback(data)
    })
  },

  onTerminalExit: (callback: () => void) => {
    ipcRenderer.removeAllListeners('terminal-exit')
    ipcRenderer.on('terminal-exit', () => callback())
  },

  onTerminalError: (callback: (error: string) => void) => {
    ipcRenderer.removeAllListeners('terminal-error')
    ipcRenderer.on('terminal-error', (_event, error) => callback(error))
  }
})
