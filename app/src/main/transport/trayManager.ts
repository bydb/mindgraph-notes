import { Tray, Menu, globalShortcut, BrowserWindow, app, screen, nativeImage } from 'electron'
import * as path from 'path'

let tray: Tray | null = null
let transportWindow: BrowserWindow | null = null
let currentShortcut: string = 'CommandOrControl+Shift+N'
let cachedResourcesPath: string = ''

export function getTransportWindow(): BrowserWindow | null {
  return transportWindow
}

export function getCurrentShortcut(): string {
  return currentShortcut
}

export function setupTray(opts: {
  getMainWindow: () => BrowserWindow | null
  resourcesPath: string
  initialShortcut?: string
}): void {
  const { getMainWindow, resourcesPath, initialShortcut } = opts
  cachedResourcesPath = resourcesPath
  if (initialShortcut && initialShortcut.trim().length > 0) {
    currentShortcut = initialShortcut.trim()
  }

  // Tray-Icon erstellen (Template-Images für automatische Hell/Dunkel-Anpassung)
  const trayIconPath = path.join(resourcesPath, 'trayIconTemplate.png')
  const trayIcon = nativeImage.createFromPath(trayIconPath)
  // Template-Image ist nur auf macOS sinnvoll (automatische Hell/Dunkel-Anpassung)
  if (process.platform === 'darwin') {
    trayIcon.setTemplateImage(true)
  }

  try {
    tray = new Tray(trayIcon)
    tray.setToolTip('MindGraph Notes')
  } catch (err) {
    console.warn('[Transport] Tray konnte nicht erstellt werden (Desktop-Umgebung ohne Tray-Support?):', err)
    // Trotzdem globalen Shortcut registrieren — der funktioniert auch ohne Tray
    registerShortcut(resourcesPath)
    return
  }

  // Rechtsklick-Kontextmenü
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Schnellerfassung',
      click: () => showTransportWindow(resourcesPath)
    },
    {
      label: 'MindGraph öffnen',
      click: () => {
        const mw = getMainWindow()
        if (mw) {
          mw.show()
          mw.focus()
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Beenden',
      click: () => app.quit()
    }
  ])

  tray.setContextMenu(contextMenu)

  // Linksklick öffnet Schnellerfassung
  tray.on('click', () => {
    showTransportWindow(resourcesPath)
  })

  // Global Shortcut registrieren
  registerShortcut(resourcesPath)

  // Cleanup bei App-Beendigung
  app.on('before-quit', () => {
    globalShortcut.unregisterAll()
  })
}

function createTransportWindow(_resourcesPath: string): BrowserWindow {
  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize

  const winWidth = 560
  const winHeight = 580
  const x = Math.round((screenWidth - winWidth) / 2)
  const y = Math.round((screenHeight - winHeight) / 3) // Leicht oberhalb der Mitte

  transportWindow = new BrowserWindow({
    width: winWidth,
    height: winHeight,
    x,
    y,
    frame: false,
    transparent: false,
    alwaysOnTop: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    show: false,
    vibrancy: 'popover',
    visualEffectState: 'active',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  // Sicherheitsnetz: Falls das Fenster-Manager trotzdem maximiert/fullscreen triggert,
  // sofort zurück auf die gewünschte Popover-Größe.
  transportWindow.on('maximize', () => {
    if (transportWindow && !transportWindow.isDestroyed()) {
      transportWindow.unmaximize()
    }
  })
  transportWindow.on('enter-full-screen', () => {
    if (transportWindow && !transportWindow.isDestroyed()) {
      transportWindow.setFullScreen(false)
    }
  })

  // In Entwicklung: Vite Dev Server
  if (process.env.NODE_ENV === 'development') {
    transportWindow.loadURL('http://localhost:5173/transport.html')
  } else {
    transportWindow.loadFile(path.join(__dirname, '../renderer/transport.html'))
  }

  // Fenster verstecken wenn Fokus verloren geht
  transportWindow.on('blur', () => {
    hideTransportWindow()
  })

  transportWindow.on('closed', () => {
    transportWindow = null
  })

  return transportWindow
}

export function showTransportWindow(resourcesPath: string): void {
  if (!transportWindow || transportWindow.isDestroyed()) {
    createTransportWindow(resourcesPath)
  }

  if (transportWindow) {
    // Position neu berechnen (Monitor könnte gewechselt haben)
    const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize
    const [winWidth, winHeight] = transportWindow.getSize()
    const x = Math.round((screenWidth - winWidth) / 2)
    const y = Math.round((screenHeight - winHeight) / 3)
    transportWindow.setPosition(x, y)

    transportWindow.show()
    transportWindow.focus()
    transportWindow.webContents.send('transport-window-shown')
  }
}

export function hideTransportWindow(): void {
  if (transportWindow && !transportWindow.isDestroyed()) {
    transportWindow.hide()
  }
}

function registerShortcut(resourcesPath: string): void {
  const success = globalShortcut.register(currentShortcut, () => {
    showTransportWindow(resourcesPath)
  })

  if (!success) {
    console.warn(`[Transport] Global shortcut ${currentShortcut} konnte nicht registriert werden`)
  } else {
    console.log(`[Transport] Global shortcut ${currentShortcut} registriert`)
  }
}

export function updateShortcut(newShortcut: string, resourcesPath?: string): boolean {
  const targetPath = resourcesPath ?? cachedResourcesPath

  try {
    globalShortcut.unregister(currentShortcut)
  } catch {
    // Shortcut war möglicherweise nicht registriert
  }

  const success = globalShortcut.register(newShortcut, () => {
    showTransportWindow(targetPath)
  })

  if (success) {
    currentShortcut = newShortcut
    console.log(`[Transport] Global shortcut ${currentShortcut} registriert`)
  } else {
    console.warn(`[Transport] Shortcut ${newShortcut} konnte nicht registriert werden — Fallback auf ${currentShortcut}`)
    // Fallback auf vorherigen Shortcut
    globalShortcut.register(currentShortcut, () => {
      showTransportWindow(targetPath)
    })
  }

  return success
}
