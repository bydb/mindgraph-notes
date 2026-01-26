import { app, BrowserWindow, ipcMain, dialog, shell, Notification } from 'electron'
import * as path from 'path'
import * as fs from 'fs/promises'
import { FSWatcher, watch } from 'chokidar'
import * as pty from 'node-pty'
import type { FileEntry } from '../shared/types'

let mainWindow: BrowserWindow | null = null
let fileWatcher: FSWatcher | null = null
let ptyProcess: pty.IPty | null = null
let isQuitting = false

// Settings-Pfad im User-Data-Verzeichnis
function getSettingsPath(): string {
  return path.join(app.getPath('userData'), 'settings.json')
}

// UI-Settings-Pfad im User-Data-Verzeichnis
function getUISettingsPath(): string {
  return path.join(app.getPath('userData'), 'ui-settings.json')
}

// Settings laden
async function loadSettings(): Promise<{ lastVaultPath?: string }> {
  try {
    const content = await fs.readFile(getSettingsPath(), 'utf-8')
    return JSON.parse(content)
  } catch {
    return {}
  }
}

// Settings speichern
async function saveSettings(settings: { lastVaultPath?: string }): Promise<void> {
  try {
    const currentSettings = await loadSettings()
    const merged = { ...currentSettings, ...settings }
    await fs.writeFile(getSettingsPath(), JSON.stringify(merged, null, 2), 'utf-8')
  } catch (error) {
    console.error('Fehler beim Speichern der Settings:', error)
  }
}

// UI-Settings laden
async function loadUISettings(): Promise<Record<string, unknown>> {
  try {
    const content = await fs.readFile(getUISettingsPath(), 'utf-8')
    return JSON.parse(content)
  } catch {
    return {}
  }
}

// UI-Settings speichern
async function saveUISettings(settings: Record<string, unknown>): Promise<void> {
  try {
    await fs.writeFile(getUISettingsPath(), JSON.stringify(settings, null, 2), 'utf-8')
  } catch (error) {
    console.error('Fehler beim Speichern der UI-Settings:', error)
  }
}

function createWindow(): void {
  // Icon-Pfad basierend auf Platform
  const iconPath = process.platform === 'darwin'
    ? path.join(__dirname, '../../resources/icon.icns')
    : path.join(__dirname, '../../resources/icon.png')

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    },
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 15, y: 15 }
  })

  // In Entwicklung: Vite Dev Server
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  // Externe Links im Standardbrowser öffnen
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Externe URLs im Standardbrowser öffnen
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url)
      return { action: 'deny' }
    }
    return { action: 'allow' }
  })

  // Navigation zu externen URLs abfangen
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const appUrl = process.env.NODE_ENV === 'development'
      ? 'http://localhost:5173'
      : `file://${path.join(__dirname, '../renderer/index.html')}`

    // Wenn es keine App-interne Navigation ist, im Browser öffnen
    if (!url.startsWith(appUrl) && (url.startsWith('http://') || url.startsWith('https://'))) {
      event.preventDefault()
      shell.openExternal(url)
    }
  })
}

// App-Name setzen
app.name = 'MindGraph Notes'

app.whenReady().then(() => {
  // App-Icon für macOS Dock setzen
  if (process.platform === 'darwin') {
    app.dock.setIcon(path.join(__dirname, '../../resources/icon.png'))
  }

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// IPC Handlers

// Letzten Vault-Pfad laden
ipcMain.handle('get-last-vault', async () => {
  const settings = await loadSettings()
  return settings.lastVaultPath || null
})

// Vault-Pfad speichern
ipcMain.handle('set-last-vault', async (_event, vaultPath: string) => {
  await saveSettings({ lastVaultPath: vaultPath })
  return true
})

// UI-Settings laden
ipcMain.handle('load-ui-settings', async () => {
  return await loadUISettings()
})

// UI-Settings speichern
ipcMain.handle('save-ui-settings', async (_event, settings: Record<string, unknown>) => {
  await saveUISettings(settings)
  return true
})

// Vault-Ordner öffnen
ipcMain.handle('open-vault', async () => {
  if (!mainWindow) return null
  
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
    title: 'Vault-Ordner auswählen',
    buttonLabel: 'Vault öffnen'
  })
  
  if (result.canceled || result.filePaths.length === 0) {
    return null
  }
  
  return result.filePaths[0]
})

// Dialog für neue Notiz
ipcMain.handle('prompt-new-note', async () => {
  if (!mainWindow) return null
  
  const { response, checkboxChecked } = await dialog.showMessageBox(mainWindow, {
    type: 'question',
    title: 'Neue Notiz',
    message: 'Neue Notiz erstellen',
    detail: 'Gib den Namen der neuen Notiz ein:',
    buttons: ['Abbrechen', 'Erstellen'],
    defaultId: 1,
    cancelId: 0
  })
  
  if (response === 0) return null
  
  // Da MessageBox keine Texteingabe unterstützt, nutzen wir einen Workaround
  // Wir öffnen einen Save-Dialog
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Neue Notiz erstellen',
    buttonLabel: 'Erstellen',
    filters: [{ name: 'Markdown', extensions: ['md'] }],
    properties: ['createDirectory', 'showOverwriteConfirmation']
  })
  
  if (result.canceled || !result.filePath) return null

  // Ensure .md extension is always added (older macOS versions may not enforce it)
  let filePath = result.filePath
  if (!filePath.toLowerCase().endsWith('.md')) {
    // Remove any other extension like .mkd, .markdown, etc. and add .md
    filePath = filePath.replace(/\.(mkd|markdown|mdown|txt)$/i, '') + '.md'
    if (!filePath.endsWith('.md')) {
      filePath = filePath + '.md'
    }
  }

  return filePath
})

// Neue Notiz erstellen
ipcMain.handle('create-note', async (_event, filePath: string) => {
  const fileName = path.basename(filePath)
  const content = `# ${fileName.replace('.md', '')}\n\n`
  
  try {
    await fs.writeFile(filePath, content, 'utf-8')
    return { path: filePath, fileName, content }
  } catch (error) {
    console.error('Fehler beim Erstellen der Notiz:', error)
    throw error
  }
})

// Verzeichnis rekursiv lesen
// Supported image extensions for file tree display
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.ico']

function getFileType(fileName: string): 'markdown' | 'pdf' | 'image' | null {
  const ext = path.extname(fileName).toLowerCase()
  if (ext === '.md') return 'markdown'
  if (ext === '.pdf') return 'pdf'
  if (IMAGE_EXTENSIONS.includes(ext)) return 'image'
  return null
}

async function readDirectoryRecursive(dirPath: string, basePath: string): Promise<FileEntry[]> {
  const entries: FileEntry[] = []
  const items = await fs.readdir(dirPath, { withFileTypes: true })

  for (const item of items) {
    if (item.name.startsWith('.')) continue

    const fullPath = path.join(dirPath, item.name)
    const relativePath = path.relative(basePath, fullPath)

    if (item.isDirectory()) {
      const children = await readDirectoryRecursive(fullPath, basePath)
      entries.push({
        name: item.name,
        path: relativePath,
        isDirectory: true,
        children
      })
    } else {
      const fileType = getFileType(item.name)
      if (fileType) {
        entries.push({
          name: item.name,
          path: relativePath,
          isDirectory: false,
          fileType
        })
      }
    }
  }

  return entries.sort((a, b) => {
    if (a.isDirectory && !b.isDirectory) return -1
    if (!a.isDirectory && b.isDirectory) return 1
    return a.name.localeCompare(b.name)
  })
}

ipcMain.handle('read-directory', async (_event, dirPath: string) => {
  try {
    return await readDirectoryRecursive(dirPath, dirPath)
  } catch (error) {
    console.error('Fehler beim Lesen des Verzeichnisses:', error)
    return []
  }
})

// Datei lesen
ipcMain.handle('read-file', async (_event, filePath: string) => {
  try {
    return await fs.readFile(filePath, 'utf-8')
  } catch (error) {
    console.error('Fehler beim Lesen der Datei:', error)
    throw error
  }
})

// Mehrere Dateien auf einmal lesen (für Performance)
ipcMain.handle('read-files-batch', async (_event, basePath: string, relativePaths: string[]) => {
  const results: Record<string, string | null> = {}

  // Parallel lesen mit Limit
  const CONCURRENCY = 100
  for (let i = 0; i < relativePaths.length; i += CONCURRENCY) {
    const batch = relativePaths.slice(i, i + CONCURRENCY)
    const batchResults = await Promise.all(
      batch.map(async (relPath) => {
        try {
          const fullPath = path.join(basePath, relPath)
          const content = await fs.readFile(fullPath, 'utf-8')
          return { path: relPath, content }
        } catch {
          return { path: relPath, content: null }
        }
      })
    )
    for (const { path: p, content } of batchResults) {
      results[p] = content
    }
  }

  return results
})

// Binäre Datei lesen als Base64 (für PDFs etc.)
ipcMain.handle('read-file-binary', async (_event, filePath: string) => {
  try {
    const buffer = await fs.readFile(filePath)
    return buffer.toString('base64')
  } catch (error) {
    console.error('Fehler beim Lesen der binären Datei:', error)
    throw error
  }
})

// Datei schreiben
ipcMain.handle('write-file', async (_event, filePath: string, content: string) => {
  try {
    await fs.writeFile(filePath, content, 'utf-8')
  } catch (error) {
    console.error('Fehler beim Schreiben der Datei:', error)
    throw error
  }
})

// PDF Companion-Datei erstellen oder lesen
ipcMain.handle('ensure-pdf-companion', async (_event, pdfPath: string, vaultPath: string) => {
  try {
    const companionPath = pdfPath + '.md'
    const fullCompanionPath = path.join(vaultPath, companionPath)
    const pdfFileName = path.basename(pdfPath)
    const pdfTitle = pdfFileName.replace('.pdf', '')

    // Prüfe ob Companion bereits existiert
    try {
      const content = await fs.readFile(fullCompanionPath, 'utf-8')
      return {
        exists: true,
        path: companionPath,
        content
      }
    } catch {
      // Companion existiert nicht, erstelle sie
      const now = new Date().toISOString()
      const template = `---
source: "${pdfFileName}"
created: ${now}
tags: []
---

# ${pdfTitle}

![[${pdfFileName}]]

## Notizen

`
      await fs.writeFile(fullCompanionPath, template, 'utf-8')
      return {
        exists: false,
        path: companionPath,
        content: template
      }
    }
  } catch (error) {
    console.error('Fehler beim Erstellen der PDF-Companion:', error)
    throw error
  }
})

// PDF Companion synchronisieren (wenn PDF umbenannt wurde)
ipcMain.handle('sync-pdf-companion', async (_event, oldCompanionPath: string, newPdfPath: string, vaultPath: string) => {
  try {
    const fullOldCompanionPath = path.join(vaultPath, oldCompanionPath)
    const newPdfFileName = path.basename(newPdfPath)
    const newPdfTitle = newPdfFileName.replace('.pdf', '')
    const newCompanionPath = newPdfPath + '.md'
    const fullNewCompanionPath = path.join(vaultPath, newCompanionPath)

    // Lese alten Companion-Inhalt
    const oldContent = await fs.readFile(fullOldCompanionPath, 'utf-8')

    // Extrahiere den alten source-Wert aus dem Frontmatter
    const sourceMatch = oldContent.match(/source:\s*"([^"]+)"/)
    const oldPdfFileName = sourceMatch ? sourceMatch[1] : ''

    // Aktualisiere den Inhalt
    let newContent = oldContent
      // Aktualisiere source im Frontmatter
      .replace(/source:\s*"[^"]+"/, `source: "${newPdfFileName}"`)
      // Aktualisiere den Titel (# OldTitle -> # NewTitle)
      .replace(new RegExp(`#\\s+${oldPdfFileName.replace('.pdf', '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), `# ${newPdfTitle}`)
      // Aktualisiere das Embed
      .replace(new RegExp(`!\\[\\[${oldPdfFileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]\\]`), `![[${newPdfFileName}]]`)

    // Wenn Pfade unterschiedlich sind, verschiebe die Datei
    if (oldCompanionPath !== newCompanionPath) {
      // Schreibe neuen Companion
      await fs.writeFile(fullNewCompanionPath, newContent, 'utf-8')
      // Lösche alten Companion
      await fs.unlink(fullOldCompanionPath)
      console.log(`[PDF Sync] Companion umbenannt: ${oldCompanionPath} -> ${newCompanionPath}`)
    } else {
      // Nur Inhalt aktualisieren
      await fs.writeFile(fullOldCompanionPath, newContent, 'utf-8')
      console.log(`[PDF Sync] Companion aktualisiert: ${oldCompanionPath}`)
    }

    return {
      success: true,
      oldPath: oldCompanionPath,
      newPath: newCompanionPath,
      content: newContent
    }
  } catch (error) {
    console.error('Fehler beim Synchronisieren der PDF-Companion:', error)
    return { success: false, error: String(error) }
  }
})

// Datei löschen
ipcMain.handle('delete-file', async (_event, filePath: string) => {
  if (!mainWindow) return false

  const fileName = path.basename(filePath)

  const { response } = await dialog.showMessageBox(mainWindow, {
    type: 'warning',
    title: 'Notiz löschen',
    message: `"${fileName}" wirklich löschen?`,
    detail: 'Diese Aktion kann nicht rückgängig gemacht werden.',
    buttons: ['Abbrechen', 'Löschen'],
    defaultId: 0,
    cancelId: 0
  })

  if (response === 0) return false

  try {
    await fs.unlink(filePath)
    return true
  } catch (error) {
    console.error('Fehler beim Löschen der Datei:', error)
    throw error
  }
})

// Ordner löschen (rekursiv)
ipcMain.handle('delete-directory', async (_event, dirPath: string) => {
  if (!mainWindow) return false

  const folderName = path.basename(dirPath)

  // Zähle Dateien im Ordner
  let fileCount = 0
  async function countFiles(dir: string): Promise<void> {
    const items = await fs.readdir(dir, { withFileTypes: true })
    for (const item of items) {
      if (item.isDirectory()) {
        await countFiles(path.join(dir, item.name))
      } else {
        fileCount++
      }
    }
  }

  try {
    await countFiles(dirPath)
  } catch {
    fileCount = 0
  }

  const detail = fileCount > 0
    ? `Dieser Ordner enthält ${fileCount} Datei(en). Alle Inhalte werden gelöscht.`
    : 'Dieser Ordner ist leer.'

  const { response } = await dialog.showMessageBox(mainWindow, {
    type: 'warning',
    title: 'Ordner löschen',
    message: `Ordner "${folderName}" wirklich löschen?`,
    detail: detail + '\n\nDiese Aktion kann nicht rückgängig gemacht werden.',
    buttons: ['Abbrechen', 'Löschen'],
    defaultId: 0,
    cancelId: 0
  })

  if (response === 0) return false

  try {
    await fs.rm(dirPath, { recursive: true, force: true })
    return true
  } catch (error) {
    console.error('Fehler beim Löschen des Ordners:', error)
    throw error
  }
})

// Datei-Statistiken abrufen
ipcMain.handle('get-file-stats', async (_event, filePath: string) => {
  try {
    const stats = await fs.stat(filePath)
    return {
      createdAt: stats.birthtime,
      modifiedAt: stats.mtime
    }
  } catch (error) {
    console.error('Fehler beim Abrufen der Datei-Statistiken:', error)
    throw error
  }
})

// Datei/Ordner umbenennen
ipcMain.handle('rename-file', async (_event, oldPath: string, newPath: string) => {
  try {
    // Prüfen ob Ziel bereits existiert
    try {
      await fs.access(newPath)
      // Datei existiert bereits
      if (!mainWindow) return { success: false, error: 'exists' }

      const { response } = await dialog.showMessageBox(mainWindow, {
        type: 'warning',
        title: 'Datei existiert bereits',
        message: `"${path.basename(newPath)}" existiert bereits.`,
        detail: 'Möchtest du die Datei überschreiben?',
        buttons: ['Abbrechen', 'Überschreiben'],
        defaultId: 0,
        cancelId: 0
      })

      if (response === 0) return { success: false, error: 'cancelled' }
    } catch {
      // Datei existiert nicht - gut
    }

    await fs.rename(oldPath, newPath)
    return { success: true, newPath }
  } catch (error) {
    console.error('Fehler beim Umbenennen:', error)
    return { success: false, error: 'failed' }
  }
})

// Datei/Ordner verschieben
ipcMain.handle('move-file', async (_event, sourcePath: string, targetDir: string) => {
  try {
    const fileName = path.basename(sourcePath)
    const targetPath = path.join(targetDir, fileName)

    // Prüfen ob Ziel bereits existiert
    try {
      await fs.access(targetPath)
      if (!mainWindow) return { success: false, error: 'exists' }

      const { response } = await dialog.showMessageBox(mainWindow, {
        type: 'warning',
        title: 'Datei existiert bereits',
        message: `"${fileName}" existiert bereits im Zielordner.`,
        detail: 'Möchtest du die Datei überschreiben?',
        buttons: ['Abbrechen', 'Überschreiben'],
        defaultId: 0,
        cancelId: 0
      })

      if (response === 0) return { success: false, error: 'cancelled' }
    } catch {
      // Datei existiert nicht - gut
    }

    await fs.rename(sourcePath, targetPath)
    return { success: true, newPath: targetPath }
  } catch (error) {
    console.error('Fehler beim Verschieben:', error)
    return { success: false, error: 'failed' }
  }
})

// Datei duplizieren
ipcMain.handle('duplicate-file', async (_event, filePath: string) => {
  try {
    const dir = path.dirname(filePath)
    const ext = path.extname(filePath)
    const baseName = path.basename(filePath, ext)

    // Finde einen freien Namen
    let counter = 1
    let newPath = path.join(dir, `${baseName} Kopie${ext}`)
    while (true) {
      try {
        await fs.access(newPath)
        counter++
        newPath = path.join(dir, `${baseName} Kopie ${counter}${ext}`)
      } catch {
        break // Datei existiert nicht - Name ist frei
      }
    }

    await fs.copyFile(filePath, newPath)
    return { success: true, newPath }
  } catch (error) {
    console.error('Fehler beim Duplizieren:', error)
    return { success: false, error: 'failed' }
  }
})

// Im Finder/Explorer zeigen
ipcMain.handle('show-in-folder', async (_event, filePath: string) => {
  shell.showItemInFolder(filePath)
  return true
})

// Ordner erstellen
ipcMain.handle('create-directory', async (_event, dirPath: string) => {
  try {
    await fs.mkdir(dirPath, { recursive: true })
    return true
  } catch (error) {
    console.error('Fehler beim Erstellen des Ordners:', error)
    throw error
  }
})

// Ensure directory exists (idempotent - creates if not exists)
ipcMain.handle('ensure-dir', async (_event, dirPath: string) => {
  try {
    await fs.mkdir(dirPath, { recursive: true })
    return true
  } catch (error) {
    // If directory already exists, that's fine
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      return true
    }
    console.error('Fehler beim Erstellen des Ordners:', error)
    throw error
  }
})

// ============ IMAGE HANDLING ============
const SUPPORTED_IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg']

// Copy image from external source to .attachments folder
ipcMain.handle('copy-image-to-attachments', async (_event, vaultPath: string, sourcePath: string) => {
  try {
    const ext = path.extname(sourcePath).toLowerCase()

    // Validate image format
    if (!SUPPORTED_IMAGE_EXTENSIONS.includes(ext)) {
      return { success: false, error: `Nicht unterstütztes Bildformat: ${ext}` }
    }

    // Create .attachments directory if it doesn't exist
    const attachmentsDir = path.join(vaultPath, '.attachments')
    await fs.mkdir(attachmentsDir, { recursive: true })

    // Generate unique filename with timestamp
    const baseName = path.basename(sourcePath, ext)
    const timestamp = Date.now()
    const fileName = `${baseName}-${timestamp}${ext}`
    const targetPath = path.join(attachmentsDir, fileName)

    // Copy the file
    await fs.copyFile(sourcePath, targetPath)

    console.log('[Image] Copied:', sourcePath, '->', targetPath)

    return {
      success: true,
      fileName,
      relativePath: `.attachments/${fileName}`
    }
  } catch (error) {
    console.error('[Image] Copy error:', error)
    return { success: false, error: String(error) }
  }
})

// Write image from Base64 data (for clipboard paste)
ipcMain.handle('write-image-from-base64', async (_event, vaultPath: string, base64Data: string, suggestedName: string) => {
  try {
    // Parse base64 data URL if present
    let buffer: Buffer
    let ext = '.png'

    if (base64Data.startsWith('data:')) {
      const match = base64Data.match(/^data:image\/(\w+);base64,(.+)$/)
      if (!match) {
        return { success: false, error: 'Ungültiges Base64-Bildformat' }
      }
      const mimeExt = match[1].toLowerCase()
      ext = mimeExt === 'jpeg' ? '.jpg' : `.${mimeExt}`
      buffer = Buffer.from(match[2], 'base64')
    } else {
      buffer = Buffer.from(base64Data, 'base64')
    }

    // Create .attachments directory if it doesn't exist
    const attachmentsDir = path.join(vaultPath, '.attachments')
    await fs.mkdir(attachmentsDir, { recursive: true })

    // Generate unique filename
    const timestamp = Date.now()
    const baseName = suggestedName.replace(/\.[^.]+$/, '') || 'screenshot'
    const fileName = `${baseName}-${timestamp}${ext}`
    const targetPath = path.join(attachmentsDir, fileName)

    // Write the file
    await fs.writeFile(targetPath, buffer)

    console.log('[Image] Written from Base64:', targetPath)

    return {
      success: true,
      fileName,
      relativePath: `.attachments/${fileName}`
    }
  } catch (error) {
    console.error('[Image] Write Base64 error:', error)
    return { success: false, error: String(error) }
  }
})

// Read image as Data URL for preview
ipcMain.handle('read-image-as-data-url', async (_event, imagePath: string) => {
  try {
    const ext = path.extname(imagePath).toLowerCase()

    // Determine MIME type
    const mimeTypes: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml'
    }

    const mimeType = mimeTypes[ext] || 'image/png'

    // Read file as buffer
    const buffer = await fs.readFile(imagePath)
    const base64 = buffer.toString('base64')
    const dataUrl = `data:${mimeType};base64,${base64}`

    return { success: true, dataUrl }
  } catch (error) {
    console.error('[Image] Read error:', error)
    return { success: false, error: String(error) }
  }
})

// Find image anywhere in vault (Obsidian-style search)
ipcMain.handle('find-image-in-vault', async (_event, vaultPath: string, imageName: string) => {
  try {
    const searchName = imageName.toLowerCase()
    const justFileName = searchName.split('/').pop() || searchName

    // Recursive search function
    async function searchDir(dirPath: string): Promise<string | null> {
      try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true })

        for (const entry of entries) {
          const fullPath = path.join(dirPath, entry.name)

          if (entry.isDirectory()) {
            // Skip hidden directories and node_modules
            if (entry.name.startsWith('.') && entry.name !== '.attachments') continue
            if (entry.name === 'node_modules') continue

            const found = await searchDir(fullPath)
            if (found) return found
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase()
            // Include images AND PDFs for embed support
            const isEmbeddable = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.ico', '.pdf'].includes(ext)

            if (isEmbeddable && entry.name.toLowerCase() === justFileName) {
              // Return absolute path
              return fullPath
            }
          }
        }
      } catch (error) {
        // Ignore permission errors etc.
      }
      return null
    }

    const foundPath = await searchDir(vaultPath)
    return { success: !!foundPath, path: foundPath }
  } catch (error) {
    console.error('[Image] Find in vault error:', error)
    return { success: false, error: String(error) }
  }
})

// ============ ZOTERO / BETTER BIBTEX API ============
const ZOTERO_API_URL = 'http://localhost:23119/better-bibtex/json-rpc'

// Prüft ob Zotero/Better BibTeX läuft
ipcMain.handle('zotero-check', async () => {
  try {
    const response = await fetch(ZOTERO_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'item.search',
        params: ['test'],
        id: 1
      })
    })
    return response.ok
  } catch {
    return false
  }
})

// Sucht in Zotero nach Items
ipcMain.handle('zotero-search', async (_event, query: string) => {
  console.log('[Zotero] Search called with query:', query)
  if (!query.trim()) return []

  try {
    // item.search gibt bereits vollständige Item-Daten zurück (CSL JSON Format)
    const searchResponse = await fetch(ZOTERO_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'item.search',
        params: [query],
        id: 1
      })
    })

    if (!searchResponse.ok) {
      console.error('[Zotero] Search failed:', searchResponse.status)
      return []
    }

    const searchData = await searchResponse.json()

    if (searchData.error) {
      console.error('[Zotero] API Error:', searchData.error)
      return []
    }

    if (!searchData.result || !Array.isArray(searchData.result)) {
      console.log('[Zotero] No results')
      return []
    }

    // item.search gibt bereits vollständige Items mit citekey zurück
    const results: Array<{ item: object; citekey: string }> = []

    for (const item of searchData.result.slice(0, 20)) {
      // Konvertiere CSL JSON Format zu unserem Format
      const zoteroItem = {
        key: item.id,
        citekey: item.citekey || item['citation-key'] || 'unknown',
        title: item.title || 'Ohne Titel',
        creators: item.author?.map((a: { family?: string; given?: string; literal?: string }) => ({
          lastName: a.family,
          firstName: a.given,
          name: a.literal,
          creatorType: 'author'
        })) || [],
        date: item.issued?.['date-parts']?.[0]?.[0]?.toString(),
        year: item.issued?.['date-parts']?.[0]?.[0]?.toString(),
        itemType: item.type || 'document',
        abstractNote: item.abstract,
        DOI: item.DOI,
        URL: item.URL,
        publicationTitle: item['container-title'],
        journalAbbreviation: item.journalAbbreviation,
        volume: item.volume,
        issue: item.issue,
        pages: item.page,
        publisher: item.publisher,
        place: item['publisher-place'],
        tags: []
      }

      results.push({
        item: zoteroItem,
        citekey: zoteroItem.citekey
      })
    }

    console.log('[Zotero] Found', results.length, 'results')
    return results
  } catch (error) {
    console.error('[Zotero] Search error:', error)
    return []
  }
})

// Holt Notizen/Annotationen für ein Zotero-Item
ipcMain.handle('zotero-get-notes', async (_event, citekey: string) => {
  console.log('[Zotero] Getting notes for:', citekey)

  try {
    // Versuche item.notes API
    const notesResponse = await fetch(ZOTERO_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'item.notes',
        params: [[citekey]],
        id: 1
      })
    })

    if (notesResponse.ok) {
      const notesData = await notesResponse.json()
      console.log('[Zotero] Notes response:', JSON.stringify(notesData).slice(0, 1000))

      if (notesData.result && notesData.result[citekey]) {
        // Extrahiere Text aus HTML-Annotationen
        const htmlNotes: string[] = notesData.result[citekey]
        const annotations: string[] = []

        for (const html of htmlNotes) {
          // Entferne HTML-Tags und extrahiere nur den Text
          // Behalte Zeilenumbrüche bei
          let text = html
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/p>/gi, '\n')
            .replace(/<\/div>/gi, '\n')
            .replace(/<[^>]*>/g, '')
            .replace(/&nbsp;/g, ' ')
            .replace(/&quot;/g, '"')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .trim()

          // Entferne mehrfache Leerzeilen
          text = text.replace(/\n{3,}/g, '\n\n')

          if (text) {
            annotations.push(text)
          }
        }

        console.log('[Zotero] Extracted annotations:', annotations.length)
        return annotations
      }
    }

    return []
  } catch (error) {
    console.error('[Zotero] Get notes error:', error)
    return []
  }
})

// ============ OLLAMA LOCAL AI API ============
const OLLAMA_API_URL = 'http://localhost:11434'

// Prüft ob Ollama läuft
ipcMain.handle('ollama-check', async () => {
  try {
    const response = await fetch(`${OLLAMA_API_URL}/api/tags`, {
      method: 'GET',
      signal: AbortSignal.timeout(3000)
    })
    return response.ok
  } catch {
    return false
  }
})

// Holt verfügbare Modelle
ipcMain.handle('ollama-models', async () => {
  try {
    const response = await fetch(`${OLLAMA_API_URL}/api/tags`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000)
    })

    if (!response.ok) return []

    const data = await response.json()
    return data.models?.map((m: { name: string; size: number }) => ({
      name: m.name,
      size: m.size
    })) || []
  } catch (error) {
    console.error('[Ollama] Error fetching models:', error)
    return []
  }
})

// Führt eine KI-Anfrage aus
interface OllamaRequest {
  model: string
  prompt: string
  action: 'translate' | 'summarize' | 'continue' | 'improve' | 'custom'
  targetLanguage?: string
  originalText: string
  customPrompt?: string
}

ipcMain.handle('ollama-generate', async (_event, request: OllamaRequest) => {
  console.log('[Ollama] Generate request:', request.action, 'with model:', request.model)

  try {
    // System-Prompts für verschiedene Aktionen
    const systemPrompts: Record<string, string> = {
      translate: `Du bist ein professioneller Übersetzer. Übersetze den folgenden Text ins ${request.targetLanguage || 'Englische'}. Gib NUR die Übersetzung zurück, keine Erklärungen oder zusätzlichen Text.`,
      summarize: 'Du bist ein Experte für Zusammenfassungen. Fasse den folgenden Text prägnant zusammen. Behalte die wichtigsten Punkte bei. Gib NUR die Zusammenfassung zurück.',
      continue: 'Du bist ein kreativer Schreibassistent. Setze den folgenden Text nahtlos und im gleichen Stil fort. Gib NUR die Fortsetzung zurück, ohne den Originaltext zu wiederholen.',
      improve: 'Du bist ein Lektor. Verbessere Grammatik, Stil und Klarheit des folgenden Textes. Behalte die ursprüngliche Bedeutung bei. Gib NUR den verbesserten Text zurück.',
      custom: request.customPrompt || 'Bearbeite den folgenden Text nach deinem besten Wissen.'
    }

    const fullPrompt = request.action === 'custom'
      ? `${request.customPrompt}\n\nText:\n${request.originalText}`
      : `${systemPrompts[request.action]}\n\nText:\n${request.originalText}`

    const response = await fetch(`${OLLAMA_API_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: request.model,
        prompt: fullPrompt,
        stream: false,
        options: {
          temperature: request.action === 'translate' ? 0.3 : 0.7,
          num_predict: request.action === 'summarize' ? 500 : 2000
        }
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[Ollama] API error:', errorText)
      throw new Error(`Ollama API Fehler: ${response.status}`)
    }

    const data = await response.json()
    console.log('[Ollama] Response received:', {
      hasResponse: !!data.response,
      responseLength: data.response?.length || 0,
      hasThinking: !!data.thinking,
      done: data.done
    })

    return {
      success: true,
      result: data.response?.trim() || '',
      model: request.model,
      action: request.action,
      prompt: fullPrompt,
      originalText: request.originalText,
      targetLanguage: request.targetLanguage,
      customPrompt: request.customPrompt,
      timestamp: new Date().toISOString()
    }
  } catch (error) {
    console.error('[Ollama] Generate error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unbekannter Fehler',
      model: request.model,
      action: request.action
    }
  }
})

// Generiert Embeddings für Text (für Smart Connections)
ipcMain.handle('ollama-embeddings', async (_event, model: string, text: string) => {
  console.log('[Ollama] Embeddings request for model:', model, 'text length:', text.length)

  try {
    // Timeout nach 60 Sekunden
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 60000)

    const response = await fetch(`${OLLAMA_API_URL}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt: text
      }),
      signal: controller.signal
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[Ollama] Embeddings API error:', errorText)
      throw new Error(`Ollama API Fehler: ${response.status}`)
    }

    const data = await response.json()

    if (!data.embedding) {
      throw new Error('Keine Embeddings in der Antwort')
    }

    return {
      success: true,
      embedding: data.embedding
    }
  } catch (error) {
    console.error('[Ollama] Embeddings error:', error)

    // Spezifische Fehlermeldungen
    let errorMessage = 'Unbekannter Fehler'
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        errorMessage = 'Timeout: Embedding-Generierung dauerte zu lange (>60s)'
      } else {
        errorMessage = error.message
      }
    }

    return {
      success: false,
      error: errorMessage
    }
  }
})

// Chat mit Kontext (für Notes Chat)
ipcMain.handle('ollama-chat', async (event, model: string, messages: Array<{ role: string; content: string }>, context: string, chatMode: 'direct' | 'socratic' = 'direct') => {
  console.log('[Ollama] Chat request with model:', model, 'context length:', context.length, 'mode:', chatMode)

  try {
    // System-Prompt basierend auf Modus
    const directPrompt = `Du bist ein hilfreicher Assistent, der Fragen zu den folgenden Notizen beantwortet. Antworte auf Deutsch, sei präzise und beziehe dich auf den Inhalt der Notizen.

NOTIZEN-KONTEXT:
${context}

---
Beantworte nun die Fragen des Nutzers basierend auf diesen Notizen. Wenn die Antwort nicht in den Notizen zu finden ist, sage das ehrlich.`

    const socraticPrompt = `Du bist ein sokratischer Tutor. Deine Aufgabe: Den Nutzer durch EINE gezielte Frage zum Nachdenken anregen.

REGELN:
- Antworte IMMER mit genau EINER kurzen Rückfrage (1-2 Sätze max)
- Gib NIEMALS die Antwort direkt
- Halte dich kurz und prägnant
- Nur bei "Ich weiß nicht" oder "Sag es mir" gibst du einen kleinen Hinweis

NOTIZEN-KONTEXT:
${context}

---
Stelle EINE kurze Frage, die zum Nachdenken anregt.`

    const systemMessage = {
      role: 'system',
      content: chatMode === 'socratic' ? socraticPrompt : directPrompt
    }

    const allMessages = [systemMessage, ...messages]

    const response = await fetch(`${OLLAMA_API_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: allMessages,
        stream: true
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[Ollama] Chat API error:', errorText)
      throw new Error(`Ollama API Fehler: ${response.status}`)
    }

    // Stream verarbeiten
    const reader = response.body?.getReader()
    if (!reader) throw new Error('Keine Response-Daten')

    const decoder = new TextDecoder()
    let fullResponse = ''
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const chunk = decoder.decode(value, { stream: true })
      buffer += chunk

      // Verarbeite komplette Zeilen
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmedLine = line.trim()
        if (!trimmedLine) continue

        try {
          const json = JSON.parse(trimmedLine)
          if (json.message?.content) {
            fullResponse += json.message.content
            // Sende Chunk an Renderer
            event.sender.send('ollama-chat-chunk', json.message.content)
          }
          if (json.done) {
            event.sender.send('ollama-chat-done')
          }
        } catch {
          // Ignoriere ungültige JSON-Zeilen
        }
      }
    }

    return {
      success: true,
      response: fullResponse
    }
  } catch (error) {
    console.error('[Ollama] Chat error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unbekannter Fehler'
    }
  }
})

// Holt verfügbare Embedding-Modelle
ipcMain.handle('ollama-embedding-models', async () => {
  try {
    const response = await fetch(`${OLLAMA_API_URL}/api/tags`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000)
    })

    if (!response.ok) return []

    const data = await response.json()
    // Bekannte Embedding-Modelle (nomic-embed-text, mxbai-embed-large, all-minilm, etc.)
    const embeddingPatterns = ['embed', 'minilm', 'bge', 'gte', 'e5']
    return data.models?.filter((m: { name: string }) =>
      embeddingPatterns.some(pattern => m.name.toLowerCase().includes(pattern))
    ).map((m: { name: string; size: number }) => ({
      name: m.name,
      size: m.size
    })) || []
  } catch (error) {
    console.error('[Ollama] Error fetching embedding models:', error)
    return []
  }
})

// Holt verfügbare Bildgenerierungs-Modelle (z.B. flux2-klein)
ipcMain.handle('ollama-image-models', async () => {
  try {
    const response = await fetch(`${OLLAMA_API_URL}/api/tags`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000)
    })

    if (!response.ok) return []

    const data = await response.json()
    // Filter für bekannte Bildgenerierungs-Modelle
    const imageModelPatterns = ['flux', 'z-image', 'stable-diffusion', 'sdxl']
    return data.models?.filter((m: { name: string }) =>
      imageModelPatterns.some(pattern => m.name.toLowerCase().includes(pattern))
    ).map((m: { name: string; size: number }) => ({
      name: m.name,
      size: m.size
    })) || []
  } catch (error) {
    console.error('[Ollama] Error fetching image models:', error)
    return []
  }
})

// Generiert ein Bild mit Ollama (Flux2, etc.)
interface OllamaImageRequest {
  model: string
  prompt: string
  vaultPath: string
  width?: number
  height?: number
  steps?: number
}

ipcMain.handle('ollama-generate-image', async (event, request: OllamaImageRequest) => {
  console.log('[Ollama] Image generation request:', request.prompt, 'with model:', request.model)

  try {
    const response = await fetch(`${OLLAMA_API_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: request.model,
        prompt: request.prompt,
        stream: true,
        options: {
          width: request.width || 512,
          height: request.height || 512,
          steps: request.steps || 8
        }
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[Ollama] Image API error:', errorText)
      throw new Error(`Ollama API Fehler: ${response.status}`)
    }

    // Stream verarbeiten
    const reader = response.body?.getReader()
    if (!reader) throw new Error('Keine Response-Daten')

    const decoder = new TextDecoder()
    let imageBase64 = ''
    let buffer = '' // Buffer für unvollständige JSON-Zeilen

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const chunk = decoder.decode(value, { stream: true })
      buffer += chunk

      // Verarbeite komplette Zeilen
      const lines = buffer.split('\n')
      buffer = lines.pop() || '' // Letzte (möglicherweise unvollständige) Zeile behalten

      for (const line of lines) {
        const trimmedLine = line.trim()
        if (!trimmedLine) continue

        try {
          const json = JSON.parse(trimmedLine)
          console.log('[Ollama] Parsed JSON keys:', Object.keys(json))

          // Fortschritt senden
          if (json.completed !== undefined && json.total !== undefined) {
            event.sender.send('ollama-image-progress', {
              completed: json.completed,
              total: json.total
            })
          }

          // Bild extrahieren
          if (json.image) {
            console.log('[Ollama] Found image, length:', json.image.length)
            imageBase64 = json.image
          }
        } catch (parseError) {
          console.log('[Ollama] JSON parse error for line:', trimmedLine.substring(0, 100))
        }
      }
    }

    // Verarbeite restlichen Buffer
    if (buffer.trim()) {
      try {
        const json = JSON.parse(buffer.trim())
        console.log('[Ollama] Final buffer JSON keys:', Object.keys(json))
        if (json.image) {
          console.log('[Ollama] Found image in final buffer, length:', json.image.length)
          imageBase64 = json.image
        }
      } catch {
        console.log('[Ollama] Could not parse final buffer')
      }
    }

    if (!imageBase64) {
      throw new Error('Kein Bild in der Antwort')
    }

    // Bild speichern im .attachments Ordner (wie andere Bilder auch)
    const attachmentsDir = path.join(request.vaultPath, '.attachments')
    await fs.mkdir(attachmentsDir, { recursive: true })

    // Eindeutiger Dateiname
    const timestamp = Date.now()
    const sanitizedPrompt = request.prompt
      .slice(0, 30)
      .replace(/[^a-zA-Z0-9äöüÄÖÜß]/g, '-')
      .replace(/-+/g, '-')
      .toLowerCase()
    const fileName = `ai-${sanitizedPrompt}-${timestamp}.png`
    const filePath = path.join(attachmentsDir, fileName)

    // Base64 zu Buffer und speichern
    const imageBuffer = Buffer.from(imageBase64, 'base64')
    await fs.writeFile(filePath, imageBuffer)

    console.log('[Ollama] Image saved:', filePath)

    return {
      success: true,
      fileName,
      relativePath: `.attachments/${fileName}`
    }
  } catch (error) {
    console.error('[Ollama] Image generation error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unbekannter Fehler'
    }
  }
})

// Dialog für neuen Ordner
ipcMain.handle('prompt-new-folder', async (_event, basePath: string) => {
  if (!mainWindow) return null

  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Neuen Ordner erstellen',
    defaultPath: basePath,
    buttonLabel: 'Ordner erstellen',
    properties: ['createDirectory']
  })

  if (result.canceled || !result.filePath) {
    return null
  }

  // Ordner erstellen
  try {
    await fs.mkdir(result.filePath, { recursive: true })
    return result.filePath
  } catch (error) {
    console.error('Fehler beim Erstellen des Ordners:', error)
    throw error
  }
})

// File Watcher
ipcMain.on('watch-directory', (_event, dirPath: string) => {
  if (fileWatcher) {
    fileWatcher.close()
  }
  
  fileWatcher = watch(dirPath, {
    ignored: /(^|[\/\\])\../,
    persistent: true,
    ignoreInitial: true
  })
  
  fileWatcher.on('all', (eventName, filePath) => {
    if (filePath.endsWith('.md')) {
      mainWindow?.webContents.send('file-changed', eventName, filePath)
    }
  })
})

ipcMain.on('unwatch-directory', () => {
  if (fileWatcher) {
    fileWatcher.close()
    fileWatcher = null
  }
})

// Terminal (PTY) Handlers
let lastPtyCreateTime = 0

ipcMain.on('terminal-create', (_event, cwd: string) => {
  const now = Date.now()

  // Debounce: Ignoriere Aufrufe die innerhalb von 500ms kommen
  if (now - lastPtyCreateTime < 500) {
    console.log('[Terminal] Debounced - ignoring duplicate create')
    return
  }
  lastPtyCreateTime = now

  console.log('[Terminal] Creating PTY with cwd:', cwd)

  if (ptyProcess) {
    console.log('[Terminal] Killing existing PTY')
    ptyProcess.kill()
    ptyProcess = null
  }

  const shell = process.platform === 'win32' ? 'powershell.exe' : '/bin/zsh'
  console.log('[Terminal] Using shell:', shell)

  // Resolve ~ to HOME - IMMER Home-Verzeichnis verwenden um Probleme mit Leerzeichen zu vermeiden
  const workingDir = process.env.HOME || '/'
  console.log('[Terminal] Working directory:', workingDir, '(requested:', cwd, ')')

  try {
    // Shell-Args für interaktive Shell (ohne -l, da das Probleme machen kann)
    const shellArgs = process.platform === 'win32' ? [] : ['-i']
    console.log('[Terminal] Shell args:', shellArgs)

    // Erweitere PATH für Homebrew und andere Tools die in GUI-Apps oft fehlen
    const homeDir = process.env.HOME || '/Users/' + process.env.USER
    const additionalPaths = [
      '/opt/homebrew/bin',
      '/opt/homebrew/sbin',
      '/usr/local/bin',
      '/usr/local/sbin',
      `${homeDir}/.local/bin`,
      `${homeDir}/.cargo/bin`,
      `${homeDir}/.nvm/versions/node/v20.18.1/bin`, // Falls NVM verwendet wird
    ]
    const currentPath = process.env.PATH || '/usr/bin:/bin:/usr/sbin:/sbin'
    const extendedPath = [...additionalPaths, ...currentPath.split(':')].join(':')

    ptyProcess = pty.spawn(shell, shellArgs, {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: workingDir,
      env: {
        ...process.env,
        PATH: extendedPath,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        LANG: 'en_US.UTF-8',
        LC_ALL: 'en_US.UTF-8',
      } as { [key: string]: string }
    })

    console.log('[Terminal] PTY created successfully, PID:', ptyProcess.pid)

    ptyProcess.onData((data) => {
      // Prüfe ob App beendet wird oder Fenster zerstört ist
      if (isQuitting || !mainWindow || mainWindow.isDestroyed()) {
        return
      }
      console.log('[Terminal] Sending data to renderer, length:', data.length)
      mainWindow.webContents.send('terminal-data', data)
    })

    ptyProcess.onExit(({ exitCode }) => {
      console.log('[Terminal] PTY exited with code:', exitCode)
      // Prüfe ob App beendet wird oder Fenster zerstört ist
      if (!isQuitting && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('terminal-exit')
      }
      ptyProcess = null
    })

    // Send initial success indicator
    console.log('[Terminal] PTY ready')

    // Test IPC-Kanal: Sende eine Test-Nachricht um zu prüfen ob IPC funktioniert
    setTimeout(() => {
      if (isQuitting || !mainWindow || mainWindow.isDestroyed()) return

      console.log('[Terminal] Sending test message via IPC...')
      mainWindow.webContents.send('terminal-data', '\x1b[32m[Terminal verbunden]\x1b[0m\r\n')

      // Sende einen Zeilenumbruch an die Shell um den Prompt auszulösen
      if (ptyProcess) {
        console.log('[Terminal] Sending newline to trigger prompt...')
        ptyProcess.write('\n')
      }
    }, 100)
  } catch (error) {
    console.error('[Terminal] Failed to create PTY:', error)
    mainWindow?.webContents.send('terminal-error', `Terminal konnte nicht gestartet werden: ${error}`)
  }
})

ipcMain.on('terminal-write', (_event, data: string) => {
  ptyProcess?.write(data)
})

ipcMain.on('terminal-resize', (_event, cols: number, rows: number) => {
  ptyProcess?.resize(cols, rows)
})

ipcMain.on('terminal-destroy', () => {
  if (ptyProcess) {
    ptyProcess.kill()
    ptyProcess = null
  }
})

// Graph-Daten speichern (im Vault unter .mindgraph/)
ipcMain.handle('save-graph-data', async (_event, vaultPath: string, data: object) => {
  try {
    const mindgraphDir = path.join(vaultPath, '.mindgraph')
    const graphFile = path.join(mindgraphDir, 'graph-data.json')

    // Verzeichnis erstellen falls nicht vorhanden
    await fs.mkdir(mindgraphDir, { recursive: true })

    // Daten speichern
    await fs.writeFile(graphFile, JSON.stringify(data, null, 2), 'utf-8')
    return true
  } catch (error) {
    console.error('Fehler beim Speichern der Graph-Daten:', error)
    return false
  }
})

// Graph-Daten laden
ipcMain.handle('load-graph-data', async (_event, vaultPath: string) => {
  try {
    const graphFile = path.join(vaultPath, '.mindgraph', 'graph-data.json')
    const content = await fs.readFile(graphFile, 'utf-8')
    return JSON.parse(content)
  } catch (error) {
    // Datei existiert nicht oder ist ungültig - leere Daten zurückgeben
    return null
  }
})

// ============ NOTES CACHE ============

// Notes-Cache speichern
ipcMain.handle('save-notes-cache', async (_event, vaultPath: string, cache: object) => {
  try {
    const mindgraphDir = path.join(vaultPath, '.mindgraph')
    const cacheFile = path.join(mindgraphDir, 'notes-cache.json')

    await fs.mkdir(mindgraphDir, { recursive: true })
    await fs.writeFile(cacheFile, JSON.stringify(cache), 'utf-8')
    console.log('[Cache] Notes-Cache gespeichert:', Object.keys((cache as any).notes || {}).length, 'Notizen')
    return true
  } catch (error) {
    console.error('Fehler beim Speichern des Notes-Cache:', error)
    return false
  }
})

// Notes-Cache laden
ipcMain.handle('load-notes-cache', async (_event, vaultPath: string) => {
  try {
    const cacheFile = path.join(vaultPath, '.mindgraph', 'notes-cache.json')
    const content = await fs.readFile(cacheFile, 'utf-8')
    const cache = JSON.parse(content)
    console.log('[Cache] Notes-Cache geladen:', Object.keys(cache.notes || {}).length, 'Notizen')
    return cache
  } catch (error) {
    console.log('[Cache] Kein Notes-Cache vorhanden, wird neu erstellt')
    return null
  }
})

// Alle Markdown-Dateien mit mtime abrufen (für Cache-Vergleich)
ipcMain.handle('get-files-with-mtime', async (_event, vaultPath: string) => {
  const files: Array<{ path: string; mtime: number }> = []

  async function scanDirectory(dirPath: string, basePath: string) {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true })

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name)
        const relativePath = path.relative(basePath, fullPath)

        // Versteckte Dateien/Ordner überspringen
        if (entry.name.startsWith('.')) continue

        if (entry.isDirectory()) {
          await scanDirectory(fullPath, basePath)
        } else if (entry.name.endsWith('.md')) {
          try {
            const stats = await fs.stat(fullPath)
            files.push({
              path: relativePath,
              mtime: stats.mtimeMs
            })
          } catch {
            // Datei möglicherweise gelöscht während Scan
          }
        }
      }
    } catch (error) {
      console.error(`Fehler beim Scannen von ${dirPath}:`, error)
    }
  }

  const startTime = Date.now()
  await scanDirectory(vaultPath, vaultPath)
  console.log(`[Cache] ${files.length} Markdown-Dateien in ${Date.now() - startTime}ms gescannt`)
  return files
})

// PDF Export - mit verstecktem Fenster für vollständigen Export
ipcMain.handle('export-pdf', async (_event, defaultFileName: string, htmlContent: string, title: string) => {
  if (!mainWindow) return { success: false, error: 'Kein Fenster verfügbar' }

  // Speicherdialog öffnen
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Als PDF exportieren',
    defaultPath: defaultFileName.replace('.md', '.pdf'),
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  })

  if (result.canceled || !result.filePath) {
    return { success: false, error: 'Abgebrochen' }
  }

  try {
    // Erstelle ein verstecktes Fenster für den PDF-Export
    const pdfWindow = new BrowserWindow({
      width: 800,
      height: 600,
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    })

    // HTML-Template für den PDF-Export
    const fullHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>${title}</title>
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
            font-size: 12pt;
            line-height: 1.6;
            color: #1a1a1a;
            padding: 40px;
            max-width: 100%;
          }
          h1 {
            font-size: 24pt;
            margin-bottom: 16px;
            padding-bottom: 8px;
            border-bottom: 2px solid #333;
          }
          h2 {
            font-size: 18pt;
            margin-top: 24px;
            margin-bottom: 12px;
          }
          h3 {
            font-size: 14pt;
            margin-top: 20px;
            margin-bottom: 10px;
          }
          p {
            margin-bottom: 12px;
          }
          ul, ol {
            margin-bottom: 12px;
            padding-left: 24px;
          }
          li {
            margin-bottom: 4px;
          }
          code {
            font-family: 'SF Mono', Monaco, 'Courier New', monospace;
            font-size: 10pt;
            background: #f5f5f5;
            padding: 2px 6px;
            border-radius: 3px;
          }
          pre {
            background: #f5f5f5;
            padding: 16px;
            border-radius: 6px;
            overflow-x: auto;
            margin-bottom: 16px;
          }
          pre code {
            background: none;
            padding: 0;
          }
          blockquote {
            border-left: 4px solid #666;
            padding-left: 16px;
            margin: 16px 0;
            color: #555;
            font-style: italic;
          }
          a {
            color: #0066cc;
            text-decoration: underline;
          }
          table {
            border-collapse: collapse;
            width: 100%;
            margin-bottom: 16px;
          }
          th, td {
            border: 1px solid #ddd;
            padding: 8px 12px;
            text-align: left;
          }
          th {
            background: #f5f5f5;
            font-weight: 600;
          }
          img {
            max-width: 100%;
            height: auto;
          }
          .callout {
            margin: 16px 0;
            padding: 12px 16px;
            border-left: 4px solid #666;
            background: #f9f9f9;
            border-radius: 0 6px 6px 0;
          }
          .callout-title {
            font-weight: 600;
            margin-bottom: 8px;
          }
          .task-list-item {
            list-style: none;
            margin-left: -20px;
          }
          .task-list-item-checkbox {
            margin-right: 8px;
          }
          .footnotes {
            margin-top: 32px;
            padding-top: 16px;
            border-top: 1px solid #ddd;
            font-size: 10pt;
          }
          .footnote-ref {
            font-size: 0.75em;
            vertical-align: super;
          }
          hr {
            border: none;
            border-top: 1px solid #ddd;
            margin: 24px 0;
          }
          .mermaid-container {
            margin: 16px 0;
            text-align: center;
          }
          .mermaid svg {
            max-width: 100%;
          }
        </style>
      </head>
      <body>
        ${htmlContent}
      </body>
      </html>
    `

    // Lade den HTML-Inhalt
    await pdfWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(fullHtml))

    // Warte kurz bis alles gerendert ist
    await new Promise(resolve => setTimeout(resolve, 500))

    // PDF generieren
    const pdfData = await pdfWindow.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      margins: {
        top: 0.5,
        bottom: 0.5,
        left: 0.5,
        right: 0.5
      }
    })

    // Fenster schließen
    pdfWindow.close()

    // PDF speichern
    await fs.writeFile(result.filePath, pdfData)

    return { success: true, path: result.filePath }
  } catch (error) {
    console.error('PDF Export Fehler:', error)
    return { success: false, error: String(error) }
  }
})

// Notification Handler - für Reminder-System
ipcMain.handle('show-notification', async (_event, title: string, body: string, noteId?: string) => {
  if (!Notification.isSupported()) {
    console.log('[Notification] Notifications not supported on this system')
    return false
  }

  try {
    const notification = new Notification({
      title,
      body,
      silent: false,
      urgency: 'normal'
    })

    // Bei Klick auf Notification: Fokus auf App und optional Notiz auswählen
    notification.on('click', () => {
      if (mainWindow) {
        mainWindow.show()
        mainWindow.focus()
        if (noteId) {
          mainWindow.webContents.send('notification-clicked', noteId)
        }
      }
    })

    notification.show()
    console.log('[Notification] Shown:', title)
    return true
  } catch (error) {
    console.error('[Notification] Error showing notification:', error)
    return false
  }
})

// ============ WIKILINK STRIPPING ============

// Entfernt Wikilink-Klammern aus Text, behält den Text
// [[Link]] -> Link
// [[Link|Alias]] -> Alias
function stripWikilinks(content: string): string {
  // Pattern für Wikilinks mit Alias: [[target|alias]] -> alias
  const withAlias = /\[\[([^\]|]+)\|([^\]]+)\]\]/g
  // Pattern für einfache Wikilinks: [[target]] -> target
  const simple = /\[\[([^\]|]+)\]\]/g

  let result = content
  // Erst die mit Alias ersetzen (spezifischer)
  result = result.replace(withAlias, '$2')
  // Dann die einfachen
  result = result.replace(simple, '$1')

  return result
}

// Wikilinks aus allen Dateien in einem Ordner entfernen
ipcMain.handle('strip-wikilinks-in-folder', async (_event, folderPath: string, vaultPath: string) => {
  if (!mainWindow) return { success: false, error: 'Kein Fenster verfügbar' }

  const folderName = path.basename(folderPath)

  // Bestätigungsdialog
  const { response } = await dialog.showMessageBox(mainWindow, {
    type: 'warning',
    title: 'Wikilinks entfernen',
    message: `Wikilinks in "${folderName}" entfernen?`,
    detail: 'Diese Aktion entfernt alle [[Wikilink]]-Klammern aus den Markdown-Dateien in diesem Ordner (rekursiv). Der Text bleibt erhalten.\n\nBeispiel: [[Link]] → Link, [[Link|Alias]] → Alias\n\nDiese Aktion kann nicht rückgängig gemacht werden.',
    buttons: ['Abbrechen', 'Wikilinks entfernen'],
    defaultId: 0,
    cancelId: 0
  })

  if (response === 0) {
    return { success: false, error: 'Abgebrochen' }
  }

  try {
    const stats = {
      filesProcessed: 0,
      filesModified: 0,
      wikilinksRemoved: 0
    }

    // Rekursive Funktion zum Verarbeiten von Dateien
    async function processDirectory(dirPath: string): Promise<void> {
      const entries = await fs.readdir(dirPath, { withFileTypes: true })

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name)

        if (entry.isDirectory()) {
          // Versteckte Ordner überspringen
          if (!entry.name.startsWith('.')) {
            await processDirectory(fullPath)
          }
        } else if (entry.name.endsWith('.md')) {
          stats.filesProcessed++

          const content = await fs.readFile(fullPath, 'utf-8')
          const newContent = stripWikilinks(content)

          // Prüfen ob sich etwas geändert hat
          if (content !== newContent) {
            await fs.writeFile(fullPath, newContent, 'utf-8')
            stats.filesModified++

            // Zähle entfernte Wikilinks (ungefähr)
            const originalWikilinks = (content.match(/\[\[[^\]]+\]\]/g) || []).length
            stats.wikilinksRemoved += originalWikilinks
          }
        }
      }
    }

    await processDirectory(folderPath)

    console.log(`[Wikilinks] Stripped in ${folderPath}:`, stats)

    // Erfolgsmeldung anzeigen
    await dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Wikilinks entfernt',
      message: 'Wikilinks erfolgreich entfernt',
      detail: `${stats.filesProcessed} Dateien verarbeitet\n${stats.filesModified} Dateien geändert\n${stats.wikilinksRemoved} Wikilinks entfernt`,
      buttons: ['OK']
    })

    return {
      success: true,
      ...stats
    }
  } catch (error) {
    console.error('[Wikilinks] Strip error:', error)
    return { success: false, error: String(error) }
  }
})

// Cleanup bei App-Beendigung
app.on('before-quit', () => {
  isQuitting = true

  // File Watcher stoppen
  if (fileWatcher) {
    fileWatcher.close()
    fileWatcher = null
  }

  // PTY Prozess beenden
  if (ptyProcess) {
    try {
      ptyProcess.kill()
    } catch (e) {
      // Ignoriere Fehler beim Beenden
    }
    ptyProcess = null
  }
})
