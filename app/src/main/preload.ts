import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  // Settings / Vault Persistenz
  getLastVault: () => ipcRenderer.invoke('get-last-vault'),
  setLastVault: (vaultPath: string) => ipcRenderer.invoke('set-last-vault', vaultPath),

  // UI-Settings Persistenz
  loadUISettings: () => ipcRenderer.invoke('load-ui-settings'),
  saveUISettings: (settings: object) => ipcRenderer.invoke('save-ui-settings', settings),
  pruneUISettingsKeys: (keys: string[]) => ipcRenderer.invoke('prune-ui-settings-keys', keys),
  setMainLanguage: (lang: string) => ipcRenderer.invoke('set-main-language', lang),

  // Clipboard über Electron, robuster als navigator.clipboard in separaten Fenstern
  clipboardWriteText: (text: string) => ipcRenderer.invoke('clipboard-write-text', text),
  clipboardReadText: () => ipcRenderer.invoke('clipboard-read-text'),

  openVault: () => ipcRenderer.invoke('open-vault'),
  selectFolderInVault: (vaultPath: string) => ipcRenderer.invoke('select-folder-in-vault', vaultPath),
  readDirectory: (dirPath: string) => ipcRenderer.invoke('read-directory', dirPath),
  readFile: (filePath: string) => ipcRenderer.invoke('read-file', filePath),
  readFileOptional: (filePath: string) => ipcRenderer.invoke('read-file-optional', filePath),
  readFilesBatch: (basePath: string, relativePaths: string[]) => ipcRenderer.invoke('read-files-batch', basePath, relativePaths),
  readFileBinary: (filePath: string) => ipcRenderer.invoke('read-file-binary', filePath),
  writeFile: (filePath: string, content: string) => ipcRenderer.invoke('write-file', filePath, content),
  appendAnnotation: (vaultPath: string, relPath: string, block: string, headerIfNew: string) =>
    ipcRenderer.invoke('append-annotation', vaultPath, relPath, block, headerIfNew),
  deleteAnnotation: (vaultPath: string, relPath: string, annoId: string) =>
    ipcRenderer.invoke('delete-annotation', vaultPath, relPath, annoId),
  deleteFile: (filePath: string) => ipcRenderer.invoke('delete-file', filePath),
  deleteFiles: (filePaths: string[]) => ipcRenderer.invoke('delete-files', filePaths),
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

  // Starter-Vault & Onboarding
  selectVaultDirectory: () => ipcRenderer.invoke('select-vault-directory'),
  checkDirectoryEmpty: (dirPath: string) => ipcRenderer.invoke('check-directory-empty', dirPath),
  createStarterVault: (targetPath: string, language: string) =>
    ipcRenderer.invoke('create-starter-vault', targetPath, language),
  createEmptyVault: (targetPath: string) =>
    ipcRenderer.invoke('create-empty-vault', targetPath),

  // Image Handling
  copyImageToAttachments: (vaultPath: string, sourcePath: string, imagesFolder?: string) =>
    ipcRenderer.invoke('copy-image-to-attachments', vaultPath, sourcePath, imagesFolder),
  writeImageFromBase64: (vaultPath: string, base64Data: string, suggestedName: string, imagesFolder?: string) =>
    ipcRenderer.invoke('write-image-from-base64', vaultPath, base64Data, suggestedName, imagesFolder),
  copyFileToVault: (vaultPath: string, sourcePath: string, targetRelDir: string) =>
    ipcRenderer.invoke('copy-file-to-vault', vaultPath, sourcePath, targetRelDir),
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

  // Per-Vault Feature Toggles
  loadVaultSettings: (vaultPath: string) => ipcRenderer.invoke('vault-settings-load', vaultPath),
  saveVaultSettings: (vaultPath: string, settings: object) => ipcRenderer.invoke('vault-settings-save', vaultPath, settings),

  // E-Mail Markdown-Vorschau (exakt das gesendete HTML)
  emailRenderHtml: (body: string) => ipcRenderer.invoke('email-render-html', body),

  // Workflow Canvas
  workflowLoad: (vaultPath: string) => ipcRenderer.invoke('workflow-load', vaultPath),
  workflowSave: (vaultPath: string, file: object) => ipcRenderer.invoke('workflow-save', vaultPath, file),
  workflowRun: (payload: object) => ipcRenderer.invoke('workflow-run', payload),

  // Plugin-Transport (ein generischer Kanal, nicht-generische Actions)
  pluginInvoke: (pluginId: string, actionId: string, payload?: unknown) =>
    ipcRenderer.invoke('plugin:invoke', pluginId, actionId, payload),
  pluginList: () => ipcRenderer.invoke('plugin:list'),
  pluginSetEnabled: (pluginId: string, enabled: boolean) =>
    ipcRenderer.invoke('plugin:setEnabled', pluginId, enabled),
  // Disk-installierte Plugins (A1 Runtime-Loader): Datei-Install / Deinstall / Fehlerliste
  pluginInstall: () => ipcRenderer.invoke('plugin:install'),
  pluginInstallFromGithub: (repo: string, tag?: string) => ipcRenderer.invoke('plugin:installFromGithub', repo, tag),
  pluginUninstall: (pluginId: string) => ipcRenderer.invoke('plugin:uninstall', pluginId),
  pluginInstallErrors: () => ipcRenderer.invoke('plugin:installErrors'),
  pluginInstalled: () => ipcRenderer.invoke('plugin:installed'),
  pluginCheckUpdates: () => ipcRenderer.invoke('plugin:checkUpdates'),
  // A3-Voll: zentraler Plugin-Katalog (Discovery, read-only)
  pluginCatalog: () => ipcRenderer.invoke('plugin:catalog'),
  pluginWidgets: () => ipcRenderer.invoke('plugin:widgets'),
  pluginWidgetData: (instanceId: string) => ipcRenderer.invoke('plugin:widgetData', instanceId),
  onPluginWidgetsChanged: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('plugin:widgets-changed', handler)
    return () => ipcRenderer.removeListener('plugin:widgets-changed', handler)
  },
  // Renderer-Plugin-Host (ADR plugin-renderer-host §5.3/§6): Liste aktiver Renderer-Plugins (byte-frei)
  // + Serve der verifizierten Bytes (utf8) für den Blob-URL-import; Push bei Lifecycle-Änderungen.
  pluginRenderers: () => ipcRenderer.invoke('plugin:renderers'),
  pluginRendererEntry: (pluginId: string) => ipcRenderer.invoke('plugin:rendererEntry', pluginId),
  // Capability-gated Vault-Bridge: der Renderer übergibt die instanceId (nie eine pluginId) + 'vault.<op>'.
  pluginHost: (rendererInstanceId: string, op: string, args: unknown[]) =>
    ipcRenderer.invoke('plugin:host', rendererInstanceId, op, args),
  onPluginRenderersChanged: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('plugin:renderers-changed', handler)
    return () => ipcRenderer.removeListener('plugin:renderers-changed', handler)
  },
  // Renderer→Main Aktivierungs-Ack (F06/§5.2): nach import(blob)+activate(host)+Staging meldet der
  // Renderer den Ausgang für die rendererInstanceId; Main committet active.json erst nach { ok:true }.
  pluginRendererActivated: (ack: unknown) => ipcRenderer.invoke('plugin:rendererActivated', ack),
  // Gerichteter Teardown (F15/F16/§5.2/§5.5): Main→Renderer Request EINER instanceId, Renderer→Main Ack des Ausgangs.
  onPluginRendererTeardown: (callback: (rendererInstanceId: string) => void) => {
    const handler = (_e: unknown, id: string) => callback(id)
    ipcRenderer.on('plugin:rendererTeardown', handler)
    return () => ipcRenderer.removeListener('plugin:rendererTeardown', handler)
  },
  pluginRendererTornDown: (ack: unknown) => ipcRenderer.invoke('plugin:rendererTornDown', ack),

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
  exportPDF: (defaultFileName: string, htmlContent: string, title: string, vaultPath?: string, notePath?: string, pdfStyle?: 'standard' | 'remarkable-book') =>
    ipcRenderer.invoke('export-pdf', defaultFileName, htmlContent, title, vaultPath, notePath, pdfStyle),

  // Notification API für Reminder-System
  showNotification: (title: string, body: string, noteId?: string) =>
    ipcRenderer.invoke('show-notification', title, body, noteId),

  // Zotero / Better BibTeX API
  zoteroCheck: () => ipcRenderer.invoke('zotero-check'),
  zoteroSearch: (query: string) => ipcRenderer.invoke('zotero-search', query),
  zoteroListCitationStyles: () => ipcRenderer.invoke('zotero-list-citation-styles'),
  zoteroFormatBibliography: (citekey: string, styleId: string, locale?: string) =>
    ipcRenderer.invoke('zotero-format-bibliography', citekey, styleId, locale),
  zoteroGetNotes: (citekey: string) => ipcRenderer.invoke('zotero-get-notes', citekey),

  // Semantic Scholar API
  semanticScholarSearch: (query: string, filters?: object) =>
    ipcRenderer.invoke('semantic-scholar-search', query, filters),
  semanticScholarGetPaper: (paperId: string) =>
    ipcRenderer.invoke('semantic-scholar-get-paper', paperId),
  openAlexSearch: (query: string, filters?: object) =>
    ipcRenderer.invoke('openalex-search', query, filters),
  openAlexSaveKey: (apiKey: string) => ipcRenderer.invoke('openalex-save-key', apiKey),
  openAlexLoadKey: () => ipcRenderer.invoke('openalex-load-key'),
  openAlexDeleteKey: () => ipcRenderer.invoke('openalex-delete-key'),
  openAlexSaveMailto: (mailto: string) => ipcRenderer.invoke('openalex-save-mailto', mailto),
  openAlexLoadMailto: () => ipcRenderer.invoke('openalex-load-mailto'),
  openAlexDeleteMailto: () => ipcRenderer.invoke('openalex-delete-mailto'),
  openAlexCheck: () => ipcRenderer.invoke('openalex-check'),

  // Notiz-Agent Phase 1: Kontext-Dateien für die Macher-Leiste (Attachment-IDs, Pfade bleiben Main-seitig)
  noteAgentAttachDialog: () => ipcRenderer.invoke('note-agent-attach-dialog'),
  noteAgentAttachFolderDialog: () => ipcRenderer.invoke('note-agent-attach-folder-dialog'),
  noteAgentAttachVaultFile: (vaultPath: string, relPath: string) =>
    ipcRenderer.invoke('note-agent-attach-vault-file', vaultPath, relPath),
  noteAgentDetach: (id: string) => ipcRenderer.invoke('note-agent-detach', id),
  // Notiz-Agent Phase 2: Agent-Loop (Modus B) — Run/Abbruch + Ergebnis-Handles
  noteAgentRun: (params: {
    vaultPath: string
    noteId: string
    noteContent: string
    instruction: string
    model: string
    attachmentIds: string[]
    targetFolderRel: string
    cloud?: { model: string } | null
    webResearch?: { enabled: boolean } | null
  }) => ipcRenderer.invoke('note-agent-run', params),
  noteAgentCancel: (runId: string) => ipcRenderer.invoke('note-agent-cancel', runId),
  noteAgentRemember: (vaultPath: string, text: string) => ipcRenderer.invoke('note-agent-remember', vaultPath, text),
  // Agent-Skills Stufe 1: Vault-Skills verwalten
  noteSkillsList: (vaultPath: string) => ipcRenderer.invoke('note-skills-list', vaultPath),
  noteSkillsSetEnabled: (vaultPath: string, folderName: string, enabled: boolean) =>
    ipcRenderer.invoke('note-skills-set-enabled', vaultPath, folderName, enabled),
  noteSkillsCreate: (vaultPath: string, name: string) => ipcRenderer.invoke('note-skills-create', vaultPath, name),
  noteSkillsInstallStarter: (vaultPath: string) => ipcRenderer.invoke('note-skills-install-starter', vaultPath),
  // Agent-Skills Stufe 2: Katalog + Import
  noteSkillsCatalog: () => ipcRenderer.invoke('note-skills-catalog'),
  noteSkillsCatalogInstall: (vaultPath: string, id: string) => ipcRenderer.invoke('note-skills-catalog-install', vaultPath, id),
  noteSkillsImportDialog: (vaultPath: string) => ipcRenderer.invoke('note-skills-import-dialog', vaultPath),
  noteAgentAcceptResult: (runId: string, resultId: string) => ipcRenderer.invoke('note-agent-accept-result', runId, resultId),
  noteAgentDiscardResult: (runId: string, resultId: string) => ipcRenderer.invoke('note-agent-discard-result', runId, resultId),
  onNoteAgentProgress: (callback: (p: { runId: string; seq: number; skill: string; summary: string }) => void) => {
    ipcRenderer.removeAllListeners('note-agent-progress')
    ipcRenderer.on('note-agent-progress', (_event, p) => callback(p))
  },
  onNoteAgentDone: (callback: (p: {
    runId: string
    ok: boolean
    cancelled?: boolean
    error?: string
    text?: string
    hitMaxIterations?: boolean
    results: Array<{ resultId: string; suggestedName: string; kind: string; summary: string; sources: string[] }>
    web?: {
      queries: Array<{ query: string; status: string }>
      fetches: Array<{ url: string; title: string; status: string }>
      searchCount: number
      fetchCount: number
    }
  }) => void) => {
    ipcRenderer.removeAllListeners('note-agent-done')
    ipcRenderer.on('note-agent-done', (_event, p) => callback(p))
  },
  onNoteAgentRunEvicted: (callback: (p: { runId: string }) => void) => {
    ipcRenderer.removeAllListeners('note-agent-run-evicted')
    ipcRenderer.on('note-agent-run-evicted', (_event, p) => callback(p))
  },

  // Ollama Local AI API
  ollamaCheck: () => ipcRenderer.invoke('ollama-check'),
  ollamaModels: () => ipcRenderer.invoke('ollama-models'),
  ollamaImageModels: () => ipcRenderer.invoke('ollama-image-models'),
  ollamaGenerate: (request: {
    model: string
    prompt: string
    action: 'translate' | 'summarize' | 'continue' | 'improve' | 'custom' | 'ocr-cleanup'
    targetLanguage?: string
    originalText: string
    customPrompt?: string
    cloud?: { model: string } | null
    contextAttachmentIds?: string[]
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
  ollamaPullModel: (name: string) => ipcRenderer.invoke('ollama-pull-model', name),
  ollamaDeleteModel: (name: string) => ipcRenderer.invoke('ollama-delete-model', name),
  onOllamaPullProgress: (callback: (progress: { status: string; completed?: number; total?: number }) => void) => {
    ipcRenderer.removeAllListeners('ollama-pull-progress')
    ipcRenderer.on('ollama-pull-progress', (_event, progress) => callback(progress))
  },

  // Ollama Embeddings für Smart Connections
  ollamaEmbeddings: (model: string, text: string) =>
    ipcRenderer.invoke('ollama-embeddings', model, text),
  ollamaEmbeddingModels: () => ipcRenderer.invoke('ollama-embedding-models'),

  // LLM-as-Judge-Reranker (Ollama hat keinen nativen Reranker-Endpoint)
  ollamaRerankPair: (model: string, query: string, document: string) =>
    ipcRenderer.invoke('ollama-rerank-pair', model, query, document) as Promise<{ success: boolean; score?: number; error?: string }>,

  // Ollama Chat für Notes Chat
  ollamaChat: (model: string, messages: Array<{ role: string; content: string }>, context: string, chatMode: 'direct' | 'socratic' | 'grill' | 'email' = 'direct', cloud?: { model: string } | null, contextAttachmentIds?: string[]) =>
    ipcRenderer.invoke('ollama-chat', model, messages, context, chatMode, cloud, contextAttachmentIds),
  onOllamaChatChunk: (callback: (chunk: string) => void) => {
    ipcRenderer.removeAllListeners('ollama-chat-chunk')
    ipcRenderer.on('ollama-chat-chunk', (_event, chunk) => callback(chunk))
  },
  onOllamaChatDone: (callback: () => void) => {
    ipcRenderer.removeAllListeners('ollama-chat-done')
    ipcRenderer.on('ollama-chat-done', () => callback())
  },
  // Email-KI-Chat: eigene Streaming-Channels (Notes-Chat und Email-Chat können
  // gleichzeitig gemountet sein, removeAllListeners erlaubt nur einen Listener)
  onOllamaEmailChatChunk: (callback: (chunk: string) => void) => {
    ipcRenderer.removeAllListeners('ollama-email-chat-chunk')
    ipcRenderer.on('ollama-email-chat-chunk', (_event, chunk) => callback(chunk))
  },
  onOllamaEmailChatDone: (callback: () => void) => {
    ipcRenderer.removeAllListeners('ollama-email-chat-done')
    ipcRenderer.on('ollama-email-chat-done', () => callback())
  },

  // Projekt-RAG: Projektordner semantisch befragen (lokal)
  projectRagStatus: (vaultPath: string, projectFolderRel: string, embedModel: string) =>
    ipcRenderer.invoke('project-rag-status', vaultPath, projectFolderRel, embedModel),
  projectRagIndex: (vaultPath: string, projectFolderRel: string, embedModel: string) =>
    ipcRenderer.invoke('project-rag-index', vaultPath, projectFolderRel, embedModel),
  onProjectRagIndexProgress: (callback: (progress: { done: number; total: number }) => void) => {
    ipcRenderer.removeAllListeners('project-rag-index-progress')
    ipcRenderer.on('project-rag-index-progress', (_event, progress) => callback(progress))
  },
  projectRagQuery: (vaultPath: string, projectFolderRel: string, query: string, embedModel: string, opts?: object) =>
    ipcRenderer.invoke('project-rag-query', vaultPath, projectFolderRel, query, embedModel, opts),
  projectRagAnswer: (vaultPath: string, projectFolderRel: string, query: string, embedModel: string, chatModel: string, language: 'de' | 'en' = 'de') =>
    ipcRenderer.invoke('project-rag-answer', vaultPath, projectFolderRel, query, embedModel, chatModel, language),
  onProjectRagAnswerChunk: (callback: (chunk: string) => void) => {
    ipcRenderer.removeAllListeners('project-rag-answer-chunk')
    ipcRenderer.on('project-rag-answer-chunk', (_event, chunk) => callback(chunk))
  },
  onProjectRagAnswerDone: (callback: () => void) => {
    ipcRenderer.removeAllListeners('project-rag-answer-done')
    ipcRenderer.on('project-rag-answer-done', () => callback())
  },
  onProjectRagAnswerSources: (callback: (sources: unknown[]) => void) => {
    ipcRenderer.removeAllListeners('project-rag-answer-sources')
    ipcRenderer.on('project-rag-answer-sources', (_event, sources) => callback(sources))
  },
  projectRagRerankCandidates: (vaultPath: string, queryText: string, candidateFolderRels: string[], embedModel: string) =>
    ipcRenderer.invoke('project-rag-rerank-candidates', vaultPath, queryText, candidateFolderRels, embedModel),

  // LM Studio Local AI API (OpenAI-kompatibel)
  lmstudioCheck: (port?: number) => ipcRenderer.invoke('lmstudio-check', port),
  lmstudioModels: (port?: number) => ipcRenderer.invoke('lmstudio-models', port),
  lmstudioGenerate: (request: {
    model: string
    prompt: string
    action: 'translate' | 'summarize' | 'continue' | 'improve' | 'custom' | 'ocr-cleanup'
    targetLanguage?: string
    originalText: string
    customPrompt?: string
    port?: number
    contextAttachmentIds?: string[]
  }) => ipcRenderer.invoke('lmstudio-generate', request),
  lmstudioChat: (model: string, messages: Array<{ role: string; content: string }>, context: string, chatMode: 'direct' | 'socratic' | 'grill' = 'direct', port?: number, contextAttachmentIds?: string[]) =>
    ipcRenderer.invoke('lmstudio-chat', model, messages, context, chatMode, port, contextAttachmentIds),
  lmstudioEmbeddings: (model: string, text: string, port?: number) =>
    ipcRenderer.invoke('lmstudio-embeddings', model, text, port),
  lmstudioEmbeddingModels: (port?: number) => ipcRenderer.invoke('lmstudio-embedding-models', port),

  // Wikilink Stripping
  stripWikilinksInFolder: (folderPath: string, vaultPath: string) =>
    ipcRenderer.invoke('strip-wikilinks-in-folder', folderPath, vaultPath),

  // Voice / Whisper STT
  voiceCheckWhisper: (command: string): Promise<{ available: boolean; command: string | null; binary: string | null; error?: string }> =>
    ipcRenderer.invoke('voice-check-whisper', command),
  voiceTranscribe: (audio: ArrayBuffer, extension: string, opts: { command: string; model: string; language: string }): Promise<{ success: boolean; text?: string; error?: string }> =>
    ipcRenderer.invoke('voice-transcribe', audio, extension, opts),

  // Voice / ElevenLabs TTS
  elevenlabsSaveKey: (apiKey: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('elevenlabs-save-key', apiKey),
  elevenlabsLoadKey: (): Promise<string | null> =>
    ipcRenderer.invoke('elevenlabs-load-key'),
  elevenlabsDeleteKey: (): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('elevenlabs-delete-key'),
  elevenlabsListVoices: (): Promise<{ success: boolean; voices?: Array<{ voice_id: string; name: string; labels?: Record<string, string>; category?: string }>; error?: string }> =>
    ipcRenderer.invoke('elevenlabs-list-voices'),
  elevenlabsSynthesize: (params: { text: string; voiceId: string; modelId: string; stability: number; similarity: number }): Promise<{ success: boolean; audio?: ArrayBuffer; error?: string }> =>
    ipcRenderer.invoke('elevenlabs-synthesize', params),

  // Docling PDF Extraction API
  doclingCheck: (baseUrl?: string) => ipcRenderer.invoke('docling-check', baseUrl),
  doclingConvertPdf: (pdfPath: string, baseUrl?: string, options?: { ocrEnabled?: boolean; ocrLanguages?: string[] }) =>
    ipcRenderer.invoke('docling-convert-pdf', pdfPath, baseUrl, options),

  // Vision OCR (Ollama Vision Models)
  visionOcrModels: () => ipcRenderer.invoke('vision-ocr-models'),
  visionOcrExtractPage: (base64Image: string, model: string, pageNum: number) =>
    ipcRenderer.invoke('vision-ocr-extract-page', base64Image, model, pageNum),

  // Readwise Integration API
  readwiseCheck: (apiKey: string) => ipcRenderer.invoke('readwise-check', apiKey),
  readwiseSync: (apiKey: string, syncFolder: string, vaultPath: string, lastSyncedAt?: string, syncCategories?: Record<string, boolean>) =>
    ipcRenderer.invoke('readwise-sync', apiKey, syncFolder, vaultPath, lastSyncedAt, syncCategories),
  onReadwiseSyncProgress: (callback: (progress: { current: number; total: number; status: string; title?: string }) => void) => {
    ipcRenderer.removeAllListeners('readwise-sync-progress')
    ipcRenderer.on('readwise-sync-progress', (_event, progress) => callback(progress))
  },

  // LanguageTool Grammar/Spell Check API
  languagetoolCheck: (mode?: 'local' | 'api', localUrl?: string, apiKey?: string) =>
    ipcRenderer.invoke('languagetool-check', mode || 'local', localUrl, apiKey),
  languagetoolAnalyze: (text: string, language?: string, mode?: 'local' | 'api', localUrl?: string, apiUsername?: string, apiKey?: string) =>
    ipcRenderer.invoke('languagetool-analyze', text, language, mode || 'local', localUrl, apiUsername, apiKey),

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
  },

  // Command existence check (for AI tool detection)
  checkCommandExists: (command: string, args?: string[]) => ipcRenderer.invoke('check-command-exists', command, args),

  // Custom Logo
  selectCustomLogo: () => ipcRenderer.invoke('select-custom-logo'),
  removeCustomLogo: () => ipcRenderer.invoke('remove-custom-logo'),

  // Update-Checker & What's New
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getSystemMemory: () => ipcRenderer.invoke('get-system-memory'),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
  getWhatsNewContent: (version: string) => ipcRenderer.invoke('get-whats-new-content', version),
  onAutoUpdateAvailable: (callback: (info: { version: string }) => void) => {
    ipcRenderer.on('auto-update-available', (_event, info) => callback(info))
  },
  onAutoUpdateProgress: (callback: (progress: { percent: number }) => void) => {
    ipcRenderer.on('auto-update-progress', (_event, progress) => callback(progress))
  },
  onAutoUpdateDownloaded: (callback: (info: { version: string }) => void) => {
    ipcRenderer.on('auto-update-downloaded', (_event, info) => callback(info))
  },

  // Quiz / Spaced Repetition
  quizGenerateQuestions: (model: string, content: string, count: number, sourcePath: string, cloud?: { model: string } | null) =>
    ipcRenderer.invoke('quiz-generate-questions', model, content, count, sourcePath, cloud),
  quizEvaluateAnswer: (model: string, question: string, expectedAnswer: string, userAnswer: string, cloud?: { model: string } | null) =>
    ipcRenderer.invoke('quiz-evaluate-answer', model, question, expectedAnswer, userAnswer, cloud),
  quizAnalyzeResults: (model: string, results: object[], questions: object[], cloud?: { model: string } | null) =>
    ipcRenderer.invoke('quiz-analyze-results', model, results, questions, cloud),
  flashcardsGenerate: (model: string, content: string, count: number, sourcePath: string, cloud?: { model: string } | null) =>
    ipcRenderer.invoke('flashcards-generate', model, content, count, sourcePath, cloud),
  onQuizProgress: (callback: (progress: { current: number; total: number; status: string }) => void) =>
    ipcRenderer.on('quiz-progress', (_event, progress) => callback(progress)),

  // Learning Progress Persistence
  saveLearningProgress: (vaultPath: string, progress: object) =>
    ipcRenderer.invoke('save-learning-progress', vaultPath, progress),
  loadLearningProgress: (vaultPath: string) =>
    ipcRenderer.invoke('load-learning-progress', vaultPath),

  // Flashcards Persistence
  flashcardsLoad: (vaultPath: string) =>
    ipcRenderer.invoke('flashcards-load', vaultPath),
  flashcardsSave: (vaultPath: string, flashcards: object[]) =>
    ipcRenderer.invoke('flashcards-save', vaultPath, flashcards),

  // Anki Import
  importAnki: (vaultPath: string) =>
    ipcRenderer.invoke('import-anki', vaultPath),

  // Study Statistics Persistence
  studyStatsLoad: (vaultPath: string) =>
    ipcRenderer.invoke('study-stats-load', vaultPath),
  studyStatsSave: (vaultPath: string, data: object) =>
    ipcRenderer.invoke('study-stats-save', vaultPath, data),

  // Sync
  syncSetup: (vaultPath: string, passphrase: string, relayUrl: string, autoSyncInterval?: number, activationCode?: string) =>
    ipcRenderer.invoke('sync-setup', vaultPath, passphrase, relayUrl, autoSyncInterval, activationCode),
  syncJoin: (vaultPath: string, vaultId: string, passphrase: string, relayUrl: string, autoSyncInterval?: number, activationCode?: string) =>
    ipcRenderer.invoke('sync-join', vaultPath, vaultId, passphrase, relayUrl, autoSyncInterval, activationCode),
  syncNow: (force?: boolean) => ipcRenderer.invoke('sync-now', force),
  syncDisable: () => ipcRenderer.invoke('sync-disable'),
  syncSetAutoSync: (intervalSeconds: number) => ipcRenderer.invoke('sync-set-auto-sync', intervalSeconds),
  syncStatus: () => ipcRenderer.invoke('sync-status'),
  syncSavePassphrase: (passphrase: string) =>
    ipcRenderer.invoke('sync-save-passphrase', passphrase),
  syncLoadPassphrase: () => ipcRenderer.invoke('sync-load-passphrase'),
  syncRestore: (vaultPath: string, vaultId: string, relayUrl: string, autoSyncInterval?: number) =>
    ipcRenderer.invoke('sync-restore', vaultPath, vaultId, relayUrl, autoSyncInterval),
  syncSetExcludeConfig: (config: { folders: string[]; extensions: string[] }) =>
    ipcRenderer.invoke('sync-set-exclude-config', config),
  syncGetDeletedFiles: () => ipcRenderer.invoke('sync-get-deleted-files'),
  syncRestoreFile: (filePath: string) => ipcRenderer.invoke('sync-restore-file', filePath),
  onSyncProgress: (callback: (data: { status: string; current: number; total: number; fileName?: string; error?: string }) => void) => {
    ipcRenderer.removeAllListeners('sync-progress')
    ipcRenderer.on('sync-progress', (_event, data) => callback(data))
  },
  onSyncLog: (callback: (entry: { type: string; message: string; fileName?: string }) => void) => {
    ipcRenderer.removeAllListeners('sync-log')
    ipcRenderer.on('sync-log', (_event, entry) => callback(entry))
  },

  // Email Integration
  emailConnect: (account: { id: string; host: string; port: number; user: string; tls: boolean }) =>
    ipcRenderer.invoke('email-connect', account),
  emailListFolders: (account: { id: string; host: string; port: number; user: string; tls: boolean }) =>
    ipcRenderer.invoke('email-list-folders', account),
  emailMove: (payload: { accountId: string; host: string; port: number; user: string; tls: boolean; sourceFolder: string; uid: number; destinationFolder: string }) =>
    ipcRenderer.invoke('email-move', payload),
  emailFetch: (vaultPath: string, accounts: object[], lastFetchedAt: Record<string, string>, maxPerAccount: number) =>
    ipcRenderer.invoke('email-fetch', vaultPath, accounts, lastFetchedAt, maxPerAccount),
  emailAnalyze: (vaultPath: string, model: string, emailIds?: string[], lowPowerMode?: boolean, cloud?: { model: string } | null) =>
    ipcRenderer.invoke('email-analyze', vaultPath, model, emailIds, lowPowerMode, cloud),
  emailRelevanceConfigLoad: (vaultPath: string) =>
    ipcRenderer.invoke('email-relevance-config-load', vaultPath),
  emailRelevanceConfigSave: (vaultPath: string, config: unknown) =>
    ipcRenderer.invoke('email-relevance-config-save', vaultPath, config),
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
  }) => ipcRenderer.invoke('note-analyze-relevance', payload),
  emailLoad: (vaultPath: string) =>
    ipcRenderer.invoke('email-load', vaultPath),
  emailSave: (vaultPath: string, data: { emails: object[]; lastFetchedAt: Record<string, string> }) =>
    ipcRenderer.invoke('email-save', vaultPath, data),
  emailContactsLoad: (vaultPath: string) =>
    ipcRenderer.invoke('email-contacts-load', vaultPath),
  emailSavePassword: (accountId: string, password: string) =>
    ipcRenderer.invoke('email-save-password', accountId, password),
  emailLoadPassword: (accountId: string) =>
    ipcRenderer.invoke('email-load-password', accountId),
  // OpenRouter Cloud-Backend
  openrouterSaveKey: (apiKey: string) =>
    ipcRenderer.invoke('openrouter-save-key', apiKey),
  openrouterHasKey: () =>
    ipcRenderer.invoke('openrouter-has-key'),
  openrouterClearKey: () =>
    ipcRenderer.invoke('openrouter-clear-key'),
  openrouterListModels: () =>
    ipcRenderer.invoke('openrouter-list-models'),
  openrouterTest: (model: string) =>
    ipcRenderer.invoke('openrouter-test', model),
  // LLMBase Cloud-Backend (EU/DSGVO)
  llmbaseSaveKey: (apiKey: string) =>
    ipcRenderer.invoke('llmbase-save-key', apiKey),
  llmbaseHasKey: () =>
    ipcRenderer.invoke('llmbase-has-key'),
  llmbaseClearKey: () =>
    ipcRenderer.invoke('llmbase-clear-key'),
  llmbaseListModels: () =>
    ipcRenderer.invoke('llmbase-list-models'),
  llmbaseTest: (model: string) =>
    ipcRenderer.invoke('llmbase-test', model),
  onEmailFetchProgress: (callback: (progress: { current: number; total: number; status: string }) => void) => {
    ipcRenderer.removeAllListeners('email-fetch-progress')
    ipcRenderer.on('email-fetch-progress', (_event, progress) => callback(progress))
  },
  onEmailAnalysisProgress: (callback: (progress: { current: number; total: number }) => void) => {
    ipcRenderer.removeAllListeners('email-analysis-progress')
    ipcRenderer.on('email-analysis-progress', (_event, progress) => callback(progress))
  },
  emailSetup: (vaultPath: string, inboxFolderName?: string) =>
    ipcRenderer.invoke('email-setup', vaultPath, inboxFolderName),
  emailCreateNote: (vaultPath: string, email: object, inboxFolderName?: string) =>
    ipcRenderer.invoke('email-create-note', vaultPath, email, inboxFolderName),
  emailSend: (composeData: object) =>
    ipcRenderer.invoke('email-send', composeData),
  emailSelectAttachments: () =>
    ipcRenderer.invoke('email-select-attachments'),
  emailFetchAttachments: (payload: { accountId: string; host: string; port: number; user: string; tls: boolean; folder: string; uid: number }) =>
    ipcRenderer.invoke('email-fetch-attachments', payload),
  emailSaveAttachment: (filename: string, contentBase64: string) =>
    ipcRenderer.invoke('email-save-attachment', filename, contentBase64),
  emailSelectSignatureImage: (vaultPath: string) =>
    ipcRenderer.invoke('email-select-signature-image', vaultPath),
  emailLoadSignatureImage: (imagePath: string) =>
    ipcRenderer.invoke('email-load-signature-image', imagePath),

  // Apple Reminders (macOS)
  platform: process.platform,
  createAppleReminder: (options: { title: string; notes?: string; dueDate?: string; dueTime?: string; list?: string }) =>
    ipcRenderer.invoke('create-apple-reminder', options),

  // Apple Calendar (macOS)
  calendarGetEvents: (startDate: string, endDate: string) =>
    ipcRenderer.invoke('calendar-get-events', startDate, endDate),
  calendarCreateEvent: (params: { title: string; startIso: string; durationMinutes: number; notes?: string }) =>
    ipcRenderer.invoke('calendar-create-event', params),
  calendarRequestAccess: () =>
    ipcRenderer.invoke('calendar-request-access'),

  // reMarkable (USB)

  // edoobox Agent: vollständig nach src/plugins/edoobox/ migriert (plugin:invoke) — inkl.
  // Formular-Import + IQ-/Anwesenheitsliste-DOCX (Phase 2, via edooboxClient).

  // Antares CS: migriert nach src/plugins/antares/ — Aufruf via electronAPI.pluginInvoke('antares', …)

  // Marketing (WordPress + Imagen): nach src/plugins/edoobox/ migriert (plugin:invoke via
  // edooboxClient) — inkl. bytes-basiertem Bild-Flow (Phase 2b).

  // Office-Formate
  officeParseExcel: (filePath: string) =>
    ipcRenderer.invoke('office-parse-excel', filePath),
  officeExcelToMarkdown: (filePath: string, sheetName?: string) =>
    ipcRenderer.invoke('office-excel-to-markdown', filePath, sheetName),
  officeParseDocx: (filePath: string) =>
    ipcRenderer.invoke('office-parse-docx', filePath),
  officeImportDocx: (vaultPath: string, sourcePath: string, targetFolder?: string) =>
    ipcRenderer.invoke('office-import-docx', vaultPath, sourcePath, targetFolder),
  officeExportDocx: (markdownContent: string, suggestedName: string) =>
    ipcRenderer.invoke('office-export-docx', markdownContent, suggestedName),
  officeParsePptx: (filePath: string) =>
    ipcRenderer.invoke('office-parse-pptx', filePath),
  officeImportPptx: (vaultPath: string, sourcePath: string, targetFolder?: string) =>
    ipcRenderer.invoke('office-import-pptx', vaultPath, sourcePath, targetFolder),

  // Transport (Quick Capture)
  transportGetConfig: () =>
    ipcRenderer.invoke('transport-get-config'),
  transportListVaultSubdirs: () =>
    ipcRenderer.invoke('transport-list-vault-subdirs'),
  transportSaveNote: (data: { title: string; category: string; tags: string[]; content: string; destinationFolder: string }) =>
    ipcRenderer.invoke('transport-save-note', data),
  transportZettelContext: (preferredFolder?: string) =>
    ipcRenderer.invoke('transport-zettel-context', preferredFolder),
  zettelSuggestMeta: (request: { model: string; title?: string; quote?: string; thought?: string; candidateTags?: string[] }) =>
    ipcRenderer.invoke('zettel-suggest-meta', request),
  transportSaveZettel: (data: { title: string; emojis: string; quote: string; thought: string; source: string; tags: string[]; destinationFolder: string }) =>
    ipcRenderer.invoke('transport-save-zettel', data),
  transportOpenInMain: (relativePath: string) =>
    ipcRenderer.invoke('transport-open-in-main', relativePath),
  transportClose: () =>
    ipcRenderer.invoke('transport-close'),
  transportShow: () =>
    ipcRenderer.invoke('transport-show'),

  // In VS Code öffnen (vscode:// Protocol)
  openInVSCode: (absolutePath: string) =>
    ipcRenderer.invoke('open-in-vscode', absolutePath),

  // HTML-Vorschau (Code-Editor) als PDF/EPUB exportieren
  htmlPreviewExport: (vaultPath: string, relativePath: string, format: 'pdf' | 'epub') =>
    ipcRenderer.invoke('html-preview-export', { vaultPath, relativePath, format }),

  // Vault-Datei mit der System-Standard-App öffnen (z.B. EPUB)
  openPath: (absolutePath: string) =>
    ipcRenderer.invoke('open-path', absolutePath),

  // Task-Editing (Overdue-Panel / Aufgaben & Termine)
  tasksUpdateLine: (data: {
    vaultPath: string
    relativePath: string
    lineIndex: number
    expectedOldLine: string
    newLine: string
  }) => ipcRenderer.invoke('tasks-update-line', data),
  tasksCreate: (data: {
    vaultPath: string
    relativePath: string
    taskLine: string
  }) => ipcRenderer.invoke('tasks-create', data),
  tasksSuggestTags: (request: {
    model: string
    taskText: string
    noteTitle?: string
    candidateTags?: string[]
    existingTags?: string[]
  }) => ipcRenderer.invoke('tasks-suggest-tags', request),

  transportUpdateShortcut: (shortcut: string) =>
    ipcRenderer.invoke('transport-update-shortcut', shortcut),
  onTransportNoteCreated: (callback: (data: { relativePath: string }) => void) => {
    ipcRenderer.removeAllListeners('transport-note-created')
    ipcRenderer.on('transport-note-created', (_event, data) => callback(data))
  },
  onTransportOpenNote: (callback: (relativePath: string) => void) => {
    ipcRenderer.removeAllListeners('transport-open-note')
    ipcRenderer.on('transport-open-note', (_event, relativePath) => callback(relativePath))
  },
  onTransportWindowShown: (callback: () => void) => {
    ipcRenderer.removeAllListeners('transport-window-shown')
    ipcRenderer.on('transport-window-shown', () => callback())
  },

  // Fortschritt gechunkter KI-Aktionen (Übersetzen/OCR-Cleanup/Lektorat langer Texte)
  onAiActionProgress: (callback: (progress: { action: string; current: number; total: number }) => void) => {
    const listener = (_event: unknown, progress: { action: string; current: number; total: number }): void => callback(progress)
    ipcRenderer.on('ai-action-progress', listener)
    return () => ipcRenderer.removeListener('ai-action-progress', listener)
  },

  // Telegram Bot
  telegramSaveToken: (token: string) =>
    ipcRenderer.invoke('telegram-save-token', token),
  telegramHasToken: () =>
    ipcRenderer.invoke('telegram-has-token'),
  telegramUpdateConfig: (config: {
    ollamaModel?: string
    excludedFolders?: string[]
    includeEmails?: boolean
    includeOverdue?: boolean
    allowedChatIds?: string[]
    priorityFolders?: string[]
    agentEnabled?: boolean
    agentInboxFolder?: string
    agentMaxIterations?: number
    agentAllowedTools?: string[]
    agentConfirmTools?: string[]
    projectsRootFolder?: string
    projectRagEmbeddingModel?: string
  }) => ipcRenderer.invoke('telegram-update-config', config),
  telegramStart: () =>
    ipcRenderer.invoke('telegram-start'),
  telegramStop: () =>
    ipcRenderer.invoke('telegram-stop'),
  telegramStatus: () =>
    ipcRenderer.invoke('telegram-status'),

  // Agent Memory (persistente Fakten für den Telegram-Agenten)
  agentMemoryLoad: () =>
    ipcRenderer.invoke('agent-memory-load'),
  agentMemorySave: (store: { entries: Array<{ id: string; key: string; value: string }> }) =>
    ipcRenderer.invoke('agent-memory-save', store),

  // Scheduler (zeitgesteuerte Read-Only-Aktionen)
  schedulerLoad: () =>
    ipcRenderer.invoke('scheduler-load'),
  schedulerSave: (config: { enabled: boolean; rules: Array<{ id: string; enabled: boolean; action: string; hour: number; minute: number; weekdays: number[]; label?: string }> }) =>
    ipcRenderer.invoke('scheduler-save', config),
  schedulerStart: () =>
    ipcRenderer.invoke('scheduler-start'),
  schedulerStop: () =>
    ipcRenderer.invoke('scheduler-stop'),
  schedulerStatus: () =>
    ipcRenderer.invoke('scheduler-status'),

  // Brain (lokales Tagesgedächtnis — ausschließlich lokal via Ollama)
  brainConsolidateDay: (input: unknown) =>
    ipcRenderer.invoke('brain-consolidate-day', input),

  // Projekt-Status-Crystallizer
  projectStatusDiscover: (vaultPath: string, projectsFolderRel: string) =>
    ipcRenderer.invoke('project-status-discover', vaultPath, projectsFolderRel),
  projectStatusSuggestKeywords: (vaultPath: string, projectFolderRel: string) =>
    ipcRenderer.invoke('project-status-suggest-keywords', vaultPath, projectFolderRel),
  projectStatusMark: (vaultPath: string, projectFolderRel: string, keywords: string[], priority: string) =>
    ipcRenderer.invoke('project-status-mark', vaultPath, projectFolderRel, keywords, priority),
  projectStatusCrystallize: (input: unknown) =>
    ipcRenderer.invoke('project-status-crystallize', input),
  projectStatusCleanup: (vaultPath: string, filePath: string, refsToRemove: string[], language: string) =>
    ipcRenderer.invoke('project-status-cleanup', vaultPath, filePath, refsToRemove, language),
  projectStatusDeleteDraft: (vaultPath: string, filePath: string) =>
    ipcRenderer.invoke('project-status-delete-draft', vaultPath, filePath),
  projectStatusSetStatus: (vaultPath: string, projectFolderRel: string, status: 'active' | 'done') =>
    ipcRenderer.invoke('project-status-set-status', vaultPath, projectFolderRel, status),
  projectStatusGenerateSynonyms: (vaultPath: string, projectFolderRel: string, model: string) =>
    ipcRenderer.invoke('project-status-generate-synonyms', vaultPath, projectFolderRel, model),
  projectStatusLoadSynonyms: (vaultPath: string, projectFolderRel: string) =>
    ipcRenderer.invoke('project-status-load-synonyms', vaultPath, projectFolderRel),

  // Webrecherche (Opt-in): Provider-Config + API-Keys liegen Main-seitig (0d),
  // der Renderer verwaltet sie nur über diese Kanäle.
  webResearchLoadConfig: () => ipcRenderer.invoke('webresearch-load-config'),
  webResearchSaveConfig: (input: { provider?: 'tavily' | 'searxng' | 'linkup'; searxngUrl?: string }) =>
    ipcRenderer.invoke('webresearch-save-config', input),
  webResearchSaveKey: (provider: 'tavily' | 'linkup', apiKey: string) => ipcRenderer.invoke('webresearch-save-key', provider, apiKey),
  webResearchHasKey: (provider: 'tavily' | 'linkup') => ipcRenderer.invoke('webresearch-has-key', provider),
  webResearchClearKey: (provider: 'tavily' | 'linkup') => ipcRenderer.invoke('webresearch-clear-key', provider),
  webResearchTest: () => ipcRenderer.invoke('webresearch-test')
})
