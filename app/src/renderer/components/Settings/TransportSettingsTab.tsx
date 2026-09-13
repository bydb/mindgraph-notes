// Einstellungen → Schnellerfassung (Transport). Aus Settings.tsx ausgelagert (Redesign 09/2026).
import React, { useState, useEffect } from 'react'
import { useUIStore, type TransportDestination } from '../../stores/uiStore'
import type { TabTFn } from './settingsTypes'
import { PageHeader, SectionTitle, Card, Row, Note, Toggle, Select, Button, RemovableChips, ChipInput, Keys } from './SettingsUI'

function keyboardEventToAccelerator(e: React.KeyboardEvent<HTMLButtonElement>): string | null {
  const parts: string[] = []

  // Modifier in Electron-Reihenfolge
  if (e.ctrlKey || e.metaKey) parts.push('CommandOrControl')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')

  const key = e.key

  // Reine Modifier-Keys ignorieren — User muss noch eine "richtige" Taste drücken
  if (['Control', 'Shift', 'Alt', 'Meta', 'OS', 'AltGraph'].includes(key)) {
    return null
  }

  // Key-Name in Electron-Accelerator konvertieren
  let keyName: string
  if (key.length === 1) {
    // Einzelnes Zeichen: Buchstaben groß, Ziffern unverändert, Sonderzeichen weitgehend passthrough
    const upper = key.toUpperCase()
    if (/^[A-Z0-9]$/.test(upper)) {
      keyName = upper
    } else if (key === ' ') {
      keyName = 'Space'
    } else if (key === '+') {
      keyName = 'Plus'
    } else if (key === '-') {
      keyName = '-'
    } else if (key === '=') {
      keyName = '='
    } else if (key === ',') {
      keyName = ','
    } else if (key === '.') {
      keyName = '.'
    } else if (key === '/') {
      keyName = '/'
    } else if (key === '\\') {
      keyName = '\\'
    } else if (key === ';') {
      keyName = ';'
    } else if (key === "'") {
      keyName = "'"
    } else if (key === '[') {
      keyName = '['
    } else if (key === ']') {
      keyName = ']'
    } else if (key === '`') {
      keyName = '`'
    } else {
      // Fallback: unbekanntes Sonderzeichen — Key-Code als Anhaltspunkt nutzen
      keyName = upper
    }
  } else {
    // Named keys: Pfeile, Funktionstasten, Escape, …
    const map: Record<string, string> = {
      'ArrowUp': 'Up',
      'ArrowDown': 'Down',
      'ArrowLeft': 'Left',
      'ArrowRight': 'Right',
      'Escape': 'Esc',
      'Enter': 'Return',
      'Delete': 'Delete',
      'Backspace': 'Backspace',
      'Tab': 'Tab',
      'Home': 'Home',
      'End': 'End',
      'PageUp': 'PageUp',
      'PageDown': 'PageDown',
      'Insert': 'Insert'
    }
    if (map[key]) {
      keyName = map[key]
    } else if (/^F([1-9]|1[0-9]|2[0-4])$/.test(key)) {
      keyName = key // F1..F24
    } else {
      return null
    }
  }

  parts.push(keyName)

  // Mindestens ein Modifier ist unter Linux/Windows für nicht-Funktionstasten quasi Pflicht
  // (F1..F24 und Medien-Keys gehen ohne — der Rest nicht). Wir erlauben's für Funktionstasten.
  const isFunctionKey = /^F([1-9]|1[0-9]|2[0-4])$/.test(keyName)
  const hasModifier = parts.length > 1 // mind. ein Modifier + key
  if (!isFunctionKey && !hasModifier) {
    return null
  }

  return parts.join('+')
}

// Hübsche Anzeige eines Accelerator-Strings auf Linux/Windows
function formatAcceleratorForDisplay(accelerator: string): string {
  return accelerator
    .split('+')
    .map(part => {
      if (part === 'CommandOrControl') return navigator.platform.toLowerCase().includes('mac') ? '⌘' : 'Ctrl'
      if (part === 'Control') return 'Ctrl'
      if (part === 'Alt') return 'Alt'
      if (part === 'Shift') return 'Shift'
      if (part === 'Super' || part === 'Meta') return 'Super'
      return part
    })
    .join(' + ')
}

// Transport-Settings Tab
// Zeigt unter einem Integrations-Modul-Header einen Hinweis, dass das Modul deaktiviert ist,
// mit einem Link zum Modul-Tab. Konfiguration darunter bleibt via bestehenden `disabled={...}` Attributen gesperrt.

export const TransportSettingsTab: React.FC<{ t: TabTFn }> = ({ t }) => {
  const transport = useUIStore(state => state.transport)
  const setTransport = useUIStore(state => state.setTransport)
  const [newDestLabel, setNewDestLabel] = useState('')
  const [newDestFolder, setNewDestFolder] = useState('')
  const [vaultSubdirs, setVaultSubdirs] = useState<string[]>([])

  // Vault-Unterordner für Ordner-Dropdown laden
  useEffect(() => {
    let cancelled = false
    window.electronAPI.transportListVaultSubdirs()
      .then(dirs => {
        if (!cancelled) setVaultSubdirs(Array.isArray(dirs) ? dirs : [])
      })
      .catch(err => console.error('[Settings] Vault-Subdirs laden fehlgeschlagen:', err))
    return () => { cancelled = true }
  }, [])
  const [recordingShortcut, setRecordingShortcut] = useState(false)
  const [shortcutStatus, setShortcutStatus] = useState<{ type: 'idle' | 'success' | 'error'; message?: string }>({ type: 'idle' })

  const handleShortcutCapture = async (e: React.KeyboardEvent<HTMLButtonElement>): Promise<void> => {
    e.preventDefault()
    e.stopPropagation()

    // Escape bricht das Recording ab, ohne zu speichern
    if (e.key === 'Escape' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
      setRecordingShortcut(false)
      setShortcutStatus({ type: 'idle' })
      ;(e.target as HTMLButtonElement).blur()
      return
    }

    const accelerator = keyboardEventToAccelerator(e)
    if (!accelerator) {
      // Noch nicht genug gedrückt (z. B. nur Ctrl) — weiter warten
      return
    }

    // Sofort speichern
    setTransport({ shortcut: accelerator })
    setRecordingShortcut(false)
    ;(e.target as HTMLButtonElement).blur()

    // An Main-Prozess schicken, um globalShortcut neu zu registrieren
    try {
      const result = await window.electronAPI.transportUpdateShortcut(accelerator)
      if (result.success) {
        setShortcutStatus({ type: 'success', message: t('settings.transport.shortcutSaved') })
      } else {
        setShortcutStatus({
          type: 'error',
          message: result.error || t('settings.transport.shortcutFailed')
        })
      }
    } catch (err) {
      setShortcutStatus({
        type: 'error',
        message: err instanceof Error ? err.message : t('settings.transport.shortcutFailed')
      })
    }
  }

  const addDestination = (): void => {
    if (!newDestLabel.trim() || !newDestFolder.trim()) return
    const dest: TransportDestination = { label: newDestLabel.trim(), folder: newDestFolder.trim() }
    setTransport({ destinations: [...transport.destinations, dest] })
    setNewDestLabel('')
    setNewDestFolder('')
  }

  const removeDestination = (index: number): void => {
    const updated = transport.destinations.filter((_, i) => i !== index)
    setTransport({ destinations: updated })
  }

  const removeTag = (tag: string): void => {
    setTransport({ predefinedTags: transport.predefinedTags.filter(t => t !== tag) })
  }

  return (
    <div className="settings-section">
      <PageHeader title={t('settings.transport.title')} subtitle={t('settings.transport.subtitle')} />

      <Card>
        <Row label={t('settings.transport.enabled')} htmlFor="transport-enabled">
          <Toggle id="transport-enabled" checked={transport.enabled} onChange={v => setTransport({ enabled: v })} />
        </Row>
        <Row label={t('settings.transport.shortcut')} hint={t('settings.transport.shortcutHint')}>
          <button
            type="button"
            className={`sui-shortcut${recordingShortcut ? ' is-recording' : ''}`}
            onKeyDown={handleShortcutCapture}
            onFocus={() => { setRecordingShortcut(true); setShortcutStatus({ type: 'idle' }) }}
            onBlur={() => setRecordingShortcut(false)}
            title={t('settings.transport.shortcutRecord')}
          >
            {recordingShortcut
              ? t('settings.transport.shortcutRecording')
              : <Keys keys={formatAcceleratorForDisplay(transport.shortcut || 'CommandOrControl+Shift+N').split('+')} />}
          </button>
        </Row>
        {shortcutStatus.type !== 'idle' && shortcutStatus.message && (
          <Note tone={shortcutStatus.type === 'error' ? 'danger' : 'ok'}>{shortcutStatus.message}</Note>
        )}
        <Row label={t('settings.transport.titlebarButton')} hint={t('settings.transport.titlebarButtonHint')} htmlFor="transport-titlebar">
          <Toggle id="transport-titlebar" checked={transport.showTitlebarButton} onChange={v => setTransport({ showTitlebarButton: v })} />
        </Row>
      </Card>

      <SectionTitle title={t('settings.transport.destinations')} />
      <Card>
        <Row label={t('settings.transport.destinations')} hint={t('settings.transport.destinationsHint')} stacked>
          <RemovableChips
            items={transport.destinations.map(d => `${d.label} — ${d.folder}`)}
            onRemove={item => { const i = transport.destinations.findIndex(d => `${d.label} — ${d.folder}` === item); if (i >= 0) removeDestination(i) }}
            removeTitle={t('settings.ui.remove')}
            empty={t('settings.transport.noDestinations')}
          />
          <div className="sui-pair">
            <input
              type="text"
              className="sui-input"
              value={newDestLabel}
              onChange={e => setNewDestLabel(e.target.value)}
              placeholder={t('settings.transport.destLabelPlaceholder')}
            />
            <Select value={newDestFolder} onChange={e => setNewDestFolder(e.target.value)}>
              <option value="">{t('settings.transport.destFolderPlaceholder')}</option>
              {vaultSubdirs.length === 0 && <option value="" disabled>{t('settings.transport.noSubdirs')}</option>}
              {vaultSubdirs.map(dir => <option key={dir} value={dir}>{dir}</option>)}
            </Select>
            <Button onClick={addDestination} disabled={!newDestLabel.trim() || !newDestFolder.trim()}>{t('settings.transport.addDestination')}</Button>
          </div>
        </Row>
        <Row label={t('settings.transport.defaultDestination')}>
          <Select value={transport.defaultDestinationFolder || ''} onChange={e => setTransport({ defaultDestinationFolder: e.target.value })}>
            <option value="" disabled>{t('settings.transport.chooseFolder')}</option>
            {transport.destinations.map((dest, i) => <option key={`dest-${i}`} value={dest.folder}>{dest.label} — {dest.folder}</option>)}
            {vaultSubdirs.filter(dir => !transport.destinations.some(d => d.folder === dir)).map(dir => <option key={`vault-${dir}`} value={dir}>{dir}</option>)}
          </Select>
        </Row>
        <Row label={t('settings.transport.zettelDestination')} hint={t('settings.transport.zettelDestinationHint')} anchor="transport-zettel-folder">
          <Select value={transport.zettelDestinationFolder || ''} onChange={e => setTransport({ zettelDestinationFolder: e.target.value })}>
            <option value="">{t('settings.transport.zettelDestinationAuto')}</option>
            {transport.zettelDestinationFolder && !vaultSubdirs.includes(transport.zettelDestinationFolder) && (
              <option value={transport.zettelDestinationFolder}>{transport.zettelDestinationFolder}</option>
            )}
            {vaultSubdirs.map(dir => <option key={`zettel-${dir}`} value={dir}>{dir}</option>)}
          </Select>
        </Row>
      </Card>

      <SectionTitle title={t('settings.transport.tags')} />
      <Card>
        <Row label={t('settings.transport.tags')} hint={t('settings.transport.tagsHint')} stacked>
          <RemovableChips items={transport.predefinedTags} onRemove={removeTag} removeTitle={t('settings.ui.remove')} />
          <div className="sui-pair">
            <ChipInput placeholder={t('settings.transport.tagPlaceholder')} onAdd={tag => { if (!transport.predefinedTags.includes(tag)) setTransport({ predefinedTags: [...transport.predefinedTags, tag] }) }} />
          </div>
        </Row>
      </Card>
    </div>
  )
}

