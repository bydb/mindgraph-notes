import { Tray, Menu, globalShortcut, BrowserWindow, app, screen, nativeImage } from 'electron'
import * as path from 'path'

let tray: Tray | null = null
let transportWindow: BrowserWindow | null = null
let currentShortcut: string = 'CommandOrControl+Shift+N'

export function getTransportWindow(): BrowserWindow | null {
  return transportWindow
}

export function setupTray(opts: {
  getMainWindow: () => BrowserWindow | null
  resourcesPath: string
}): void {
  const { getMainWindow, resourcesPath } = opts

  // Tray-Icon erstellen (Template-Images für automatische Hell/Dunkel-Anpassung)
  const trayIconPath = path.join(resourcesPath, 'trayIconTemplate.png')
  const trayIcon = nativeImage.createFromPath(trayIconPath)
  trayIcon.setTemplateImage(true)

  tray = new Tray(trayIcon)
  tray.setToolTip('MindGraph Notes')

  // Rechtsklick-Kontextmenü
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Quick Capture',
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

  // Linksklick öffnet Quick Capture
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

function createTransportWindow(resourcesPath: string): BrowserWindow {
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
  currentShortcut = 'CommandOrControl+Shift+N'
  const success = globalShortcut.register(currentShortcut, () => {
    showTransportWindow(resourcesPath)
  })

  if (!success) {
    console.warn(`[Transport] Global shortcut ${currentShortcut} konnte nicht registriert werden`)
  }
}

export function updateShortcut(newShortcut: string, resourcesPath: string): boolean {
  // Nur den eigenen Shortcut deregistrieren, nicht alle
  try {
    globalShortcut.unregister(currentShortcut)
  } catch {
    // Shortcut war möglicherweise nicht registriert
  }

  const success = globalShortcut.register(newShortcut, () => {
    showTransportWindow(resourcesPath)
  })

  if (success) {
    currentShortcut = newShortcut
  } else {
    // Fallback auf vorherigen Shortcut
    globalShortcut.register(currentShortcut, () => {
      showTransportWindow(resourcesPath)
    })
  }

  return success
}
