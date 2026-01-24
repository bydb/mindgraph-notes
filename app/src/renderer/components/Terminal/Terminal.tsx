import React, { useEffect, useRef, useState } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { useNotesStore } from '../../stores/notesStore'

interface TerminalProps {
  visible: boolean
  onToggle: () => void
}

export const Terminal: React.FC<TerminalProps> = ({ visible, onToggle }) => {
  const terminalRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<XTerm | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const isConnectedRef = useRef(false)
  const [height, setHeight] = useState(300)
  const resizingRef = useRef(false)
  const startYRef = useRef(0)
  const startHeightRef = useRef(0)
  const wasVisibleRef = useRef(false)
  const ptyStartedRef = useRef(false)

  const vaultPath = useNotesStore((s) => s.vaultPath)

  // Sync ref with state
  useEffect(() => {
    isConnectedRef.current = isConnected
  }, [isConnected])

  // PTY starten
  const startPty = (force = false) => {
    if (ptyStartedRef.current && !force) {
      console.log('PTY already started, skipping')
      return
    }
    ptyStartedRef.current = true
    const cwd = vaultPath || '~'
    console.log('Starting PTY with cwd:', cwd)
    window.electronAPI.terminalCreate(cwd)
    // isConnected wird erst gesetzt, wenn Daten empfangen werden
  }

  // Terminal UI initialisieren - nur einmal
  useEffect(() => {
    // Initialisiere auch wenn nicht sichtbar - DOM existiert jetzt immer
    if (!terminalRef.current || xtermRef.current) return

    console.log('Initializing terminal UI...')

    const term = new XTerm({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: '"MesloLGS Nerd Font Mono", "MesloLGS NF", "Hack Nerd Font", "FiraCode Nerd Font", Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
        cursor: '#d4d4d4',
        cursorAccent: '#1e1e1e',
        selectionBackground: '#264f78',
        black: '#1e1e1e',
        red: '#f44747',
        green: '#6a9955',
        yellow: '#dcdcaa',
        blue: '#569cd6',
        magenta: '#c586c0',
        cyan: '#4ec9b0',
        white: '#d4d4d4',
        brightBlack: '#808080',
        brightRed: '#f44747',
        brightGreen: '#6a9955',
        brightYellow: '#dcdcaa',
        brightBlue: '#569cd6',
        brightMagenta: '#c586c0',
        brightCyan: '#4ec9b0',
        brightWhite: '#d4d4d4',
      },
      allowProposedApi: true,
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(terminalRef.current)
    setTimeout(() => fitAddon.fit(), 50)

    xtermRef.current = term
    fitAddonRef.current = fitAddon

    // WICHTIG: IPC-Listener ZUERST registrieren, BEVOR PTY gestartet wird
    // Daten vom Terminal empfangen
    console.log('[Terminal] Setting up IPC listeners...')

    // Speichere term in xtermRef BEVOR wir den Listener setzen
    const termInstance = term

    window.electronAPI.onTerminalData((data: string) => {
      console.log('[Terminal] Received data from PTY, length:', data.length)
      console.log('[Terminal] Writing to xterm, instance valid:', !!xtermRef.current)
      if (!isConnectedRef.current) {
        console.log('[Terminal] First data received - marking as connected')
        setIsConnected(true)
        isConnectedRef.current = true
      }
      // Verwende xtermRef statt der closure-Variable
      if (xtermRef.current) {
        xtermRef.current.write(data)
      } else {
        console.error('[Terminal] xterm instance is null!')
      }
    })

    // Terminal Exit Handler
    window.electronAPI.onTerminalExit(() => {
      console.log('[Terminal] PTY exit event received')
      setIsConnected(false)
      isConnectedRef.current = false
      ptyStartedRef.current = false
      term.writeln('\r\n\x1b[31m[Terminal beendet - Klicke ↻ zum Neustart]\x1b[0m')
    })

    // Terminal Error Handler
    window.electronAPI.onTerminalError((error: string) => {
      console.error('[Terminal] Error event received:', error)
      setIsConnected(false)
      isConnectedRef.current = false
      ptyStartedRef.current = false
      term.writeln(`\r\n\x1b[31m[Fehler: ${error}]\x1b[0m`)
    })

    // Daten zum Terminal senden
    term.onData((data) => {
      console.log('[Terminal] Sending user input to PTY, length:', data.length)
      window.electronAPI.terminalWrite(data)
    })

    // JETZT PTY starten (nachdem alle Listener bereit sind)
    console.log('[Terminal] Listeners ready, starting PTY...')
    startPty()

    // Focus setzen nach kurzer Verzögerung
    setTimeout(() => {
      term.focus()
    }, 200)

    // Terminal-Größe anpassen
    term.onResize(({ cols, rows }) => {
      window.electronAPI.terminalResize(cols, rows)
    })

    // Resize Observer
    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit()
    })
    resizeObserver.observe(terminalRef.current)

    return () => {
      resizeObserver.disconnect()
    }
  }, [])

  // Wiedereröffnen: PTY neu starten wenn nötig
  useEffect(() => {
    // Prüfen ob Terminal gerade geöffnet wurde (war vorher geschlossen)
    if (visible && !wasVisibleRef.current && xtermRef.current && !isConnected) {
      console.log('Terminal wiedereröffnet und nicht verbunden - starte PTY...')
      startPty()
    }
    wasVisibleRef.current = visible

    // Fit anpassen und Focus setzen wenn sichtbar wird
    if (visible && fitAddonRef.current) {
      setTimeout(() => {
        fitAddonRef.current?.fit()
        // Focus auf Terminal setzen damit Tastatureingaben funktionieren
        xtermRef.current?.focus()
      }, 50)
    }
  }, [visible, isConnected])

  // Fit bei Höhenänderung
  useEffect(() => {
    if (visible && fitAddonRef.current) {
      setTimeout(() => fitAddonRef.current?.fit(), 50)
    }
  }, [height])

  // Cleanup bei Unmount
  useEffect(() => {
    return () => {
      window.electronAPI.terminalDestroy()
      if (xtermRef.current) {
        xtermRef.current.dispose()
        xtermRef.current = null
      }
    }
  }, [])

  // Resize handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    resizingRef.current = true
    startYRef.current = e.clientY
    startHeightRef.current = height
    document.body.style.cursor = 'ns-resize'
    document.body.style.userSelect = 'none'
  }

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!resizingRef.current) return
      const delta = startYRef.current - e.clientY
      const newHeight = Math.max(150, Math.min(window.innerHeight * 0.8, startHeightRef.current + delta))
      setHeight(newHeight)
    }

    const handleMouseUp = () => {
      if (resizingRef.current) {
        resizingRef.current = false
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        fitAddonRef.current?.fit()
      }
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

  // Manueller Neustart
  const handleRestart = () => {
    console.log('Manual restart requested')
    xtermRef.current?.clear()
    ptyStartedRef.current = false
    startPty(true)
  }

  // Statt null zurückzugeben, verstecken wir das Terminal mit CSS
  // So bleibt xterm an das DOM angehängt und funktioniert weiter
  return (
    <div className="terminal-container" style={{ height, display: visible ? 'flex' : 'none' }}>
      <div className="terminal-resize-handle" onMouseDown={handleMouseDown} />
      <div className="terminal-header">
        <span className="terminal-title">
          Terminal {!isConnected && <span style={{ color: '#f44747' }}>(getrennt)</span>}
        </span>
        <div className="terminal-actions">
          <button
            className="btn-icon"
            onClick={handleRestart}
            title="Terminal neu starten"
          >
            ↻
          </button>
          <button
            className="btn-icon"
            onClick={() => {
              if (vaultPath) {
                window.electronAPI.terminalWrite(`cd "${vaultPath}" && clear\n`)
              }
            }}
            title="Zum Vault wechseln"
          >
            📁
          </button>
          <button
            className="btn-icon"
            onClick={() => window.electronAPI.terminalWrite('opencode\n')}
            title="OpenCode starten"
          >
            🤖
          </button>
          <button className="btn-icon" onClick={onToggle} title="Terminal schließen">
            ✕
          </button>
        </div>
      </div>
      <div
        className="terminal-content"
        ref={terminalRef}
        onClick={() => xtermRef.current?.focus()}
      />
    </div>
  )
}
