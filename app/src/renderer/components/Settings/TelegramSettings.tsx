import React, { useEffect, useState } from 'react'
import { useUIStore } from '../../stores/uiStore'

export const TelegramSettings: React.FC = () => {
  const telegramBot = useUIStore(s => s.telegramBot)
  const setTelegramBot = useUIStore(s => s.setTelegramBot)

  const [tokenInput, setTokenInput] = useState('')
  const [hasToken, setHasToken] = useState(false)
  const [anthropicKeyInput, setAnthropicKeyInput] = useState('')
  const [hasAnthropicKey, setHasAnthropicKey] = useState(false)
  const [newChatId, setNewChatId] = useState('')
  const [active, setActive] = useState(false)
  const [statusMsg, setStatusMsg] = useState<{ text: string; kind: 'info' | 'error' | 'success' } | null>(null)
  const [busy, setBusy] = useState(false)

  const refreshStatus = async () => {
    const [tokenRes, anthropicRes, statusRes] = await Promise.all([
      window.electronAPI.telegramHasToken(),
      window.electronAPI.telegramHasAnthropicKey(),
      window.electronAPI.telegramStatus()
    ])
    setHasToken(tokenRes)
    setHasAnthropicKey(anthropicRes)
    setActive(statusRes.active)
    setTelegramBot({ active: statusRes.active })
  }

  useEffect(() => {
    refreshStatus()
  }, [])

  // Config live zum Main-Prozess pushen, damit der laufende Bot sie nutzt
  useEffect(() => {
    window.electronAPI.telegramUpdateConfig({
      backend: telegramBot.llmBackend,
      anthropicModel: telegramBot.anthropicModel,
      ollamaModel: telegramBot.ollamaModel,
      includeEmails: telegramBot.briefingIncludeEmails,
      includeOverdue: telegramBot.briefingIncludeOverdue,
      allowedChatIds: telegramBot.allowedChatIds
    })
  }, [
    telegramBot.llmBackend,
    telegramBot.anthropicModel,
    telegramBot.ollamaModel,
    telegramBot.briefingIncludeEmails,
    telegramBot.briefingIncludeOverdue,
    telegramBot.allowedChatIds
  ])

  const saveToken = async () => {
    if (!tokenInput.trim()) return
    setBusy(true)
    const ok = await window.electronAPI.telegramSaveToken(tokenInput.trim())
    setBusy(false)
    if (ok) {
      setTokenInput('')
      setHasToken(true)
      setStatusMsg({ text: 'Bot-Token gespeichert.', kind: 'success' })
    } else {
      setStatusMsg({ text: 'Token konnte nicht gespeichert werden.', kind: 'error' })
    }
  }

  const saveAnthropicKey = async () => {
    if (!anthropicKeyInput.trim()) return
    setBusy(true)
    const ok = await window.electronAPI.telegramSaveAnthropicKey(anthropicKeyInput.trim())
    setBusy(false)
    if (ok) {
      setAnthropicKeyInput('')
      setHasAnthropicKey(true)
      setStatusMsg({ text: 'Anthropic-Key gespeichert.', kind: 'success' })
    } else {
      setStatusMsg({ text: 'Anthropic-Key konnte nicht gespeichert werden.', kind: 'error' })
    }
  }

  const addChatId = () => {
    const id = newChatId.trim()
    if (!id) return
    if (!/^-?\d+$/.test(id)) {
      setStatusMsg({ text: 'Chat-ID muss eine Zahl sein.', kind: 'error' })
      return
    }
    if (telegramBot.allowedChatIds.includes(id)) return
    setTelegramBot({ allowedChatIds: [...telegramBot.allowedChatIds, id] })
    setNewChatId('')
  }

  const removeChatId = (id: string) => {
    setTelegramBot({ allowedChatIds: telegramBot.allowedChatIds.filter(x => x !== id) })
  }

  const startBot = async () => {
    setBusy(true)
    setStatusMsg({ text: 'Starte Bot …', kind: 'info' })
    const res = await window.electronAPI.telegramStart()
    setBusy(false)
    if (res.success) {
      setActive(true)
      setTelegramBot({ active: true })
      setStatusMsg({ text: res.alreadyRunning ? 'Bot lief bereits.' : 'Bot gestartet — schreib /start an deinen Bot.', kind: 'success' })
    } else {
      setStatusMsg({ text: res.error ?? 'Start fehlgeschlagen.', kind: 'error' })
    }
  }

  const stopBot = async () => {
    setBusy(true)
    const res = await window.electronAPI.telegramStop()
    setBusy(false)
    if (res.success) {
      setActive(false)
      setTelegramBot({ active: false })
      setStatusMsg({ text: 'Bot gestoppt.', kind: 'info' })
    }
  }

  return (
    <div className="settings-section">
      <h3>Telegram-Bot</h3>
      <p className="settings-help">
        Stelle Fragen an dein Vault per Telegram — Tasks abfragen, Morning-Briefings erhalten, Notizen durchsuchen.
        Der Bot läuft lokal in MindGraph, solange die App geöffnet ist.
      </p>

      {/* Status */}
      <div className="settings-group">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <span
            style={{
              display: 'inline-block',
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: active ? '#44c767' : '#b0b0b0'
            }}
          />
          <strong>{active ? 'Bot aktiv' : 'Bot inaktiv'}</strong>
          {!active && hasToken && (
            <button className="settings-button primary" onClick={startBot} disabled={busy}>
              {telegramBot.allowedChatIds.length === 0 ? 'Starten (Chat-ID ermitteln)' : 'Starten'}
            </button>
          )}
          {active && (
            <button className="settings-button" onClick={stopBot} disabled={busy}>Stoppen</button>
          )}
        </div>
        {statusMsg && (
          <div
            style={{
              padding: '8px 12px',
              borderRadius: 4,
              background: statusMsg.kind === 'error' ? '#fee' : statusMsg.kind === 'success' ? '#efe' : '#eef',
              color: statusMsg.kind === 'error' ? '#a00' : statusMsg.kind === 'success' ? '#060' : '#336',
              fontSize: 13
            }}
          >
            {statusMsg.text}
          </div>
        )}
      </div>

      {/* Modul-Toggle */}
      <div className="settings-group">
        <label className="settings-row">
          <input
            type="checkbox"
            checked={telegramBot.enabled}
            onChange={e => setTelegramBot({ enabled: e.target.checked })}
          />
          <span>Telegram-Bot-Feature aktivieren</span>
        </label>
      </div>

      {/* Bot-Token */}
      <div className="settings-group">
        <label className="settings-label">Bot-Token {hasToken && <span style={{ color: '#44c767' }}>✓ gespeichert</span>}</label>
        <p className="settings-help">
          Erstelle einen Bot bei <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer">@BotFather</a> in
          Telegram — er gibt dir einen Token wie <code>123456:ABC-DEF...</code>.
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="password"
            placeholder={hasToken ? 'Neuen Token setzen …' : 'Bot-Token hier einfügen'}
            value={tokenInput}
            onChange={e => setTokenInput(e.target.value)}
            className="settings-input"
            style={{ flex: 1 }}
          />
          <button className="settings-button" onClick={saveToken} disabled={busy || !tokenInput.trim()}>
            Speichern
          </button>
        </div>
      </div>

      {/* Chat-IDs */}
      <div className="settings-group">
        <label className="settings-label">Freigeschaltete Chat-IDs</label>
        <p className="settings-help">
          Schreibe dem Bot einmal in Telegram — er zeigt dir deine Chat-ID an, wenn du nicht freigeschaltet bist.
          Trage sie hier ein, damit der Bot dir antwortet.
        </p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <input
            type="text"
            placeholder="z. B. 123456789"
            value={newChatId}
            onChange={e => setNewChatId(e.target.value)}
            className="settings-input"
            style={{ flex: 1 }}
          />
          <button className="settings-button" onClick={addChatId}>Hinzufügen</button>
        </div>
        {telegramBot.allowedChatIds.length > 0 && (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {telegramBot.allowedChatIds.map(id => (
              <li
                key={id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '6px 10px',
                  background: 'var(--bg-secondary)',
                  borderRadius: 4,
                  marginBottom: 4
                }}
              >
                <code>{id}</code>
                <button className="settings-button small" onClick={() => removeChatId(id)}>Entfernen</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* LLM-Backend */}
      <div className="settings-group">
        <label className="settings-label">LLM-Backend für /ask und /briefing</label>
        <select
          value={telegramBot.llmBackend}
          onChange={e => setTelegramBot({ llmBackend: e.target.value as 'ollama' | 'anthropic' | 'auto' })}
          className="settings-select"
        >
          <option value="auto">Auto (Ollama wenn erreichbar, sonst Anthropic)</option>
          <option value="ollama">Nur Ollama (lokal)</option>
          <option value="anthropic">Nur Anthropic (API)</option>
        </select>
      </div>

      <div className="settings-group" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label className="settings-label">Ollama-Modell</label>
          <input
            type="text"
            placeholder="auto"
            value={telegramBot.ollamaModel}
            onChange={e => setTelegramBot({ ollamaModel: e.target.value })}
            className="settings-input"
          />
          <p className="settings-help" style={{ marginTop: 4, fontSize: 11 }}>Leer = automatisch wählen (llama3.1 o. ä.)</p>
        </div>
        <div>
          <label className="settings-label">Anthropic-Modell</label>
          <select
            value={telegramBot.anthropicModel}
            onChange={e => setTelegramBot({ anthropicModel: e.target.value })}
            className="settings-select"
          >
            <option value="claude-opus-4-7">Opus 4.7 (beste Qualität)</option>
            <option value="claude-sonnet-4-6">Sonnet 4.6 (Standard)</option>
            <option value="claude-haiku-4-5-20251001">Haiku 4.5 (schnell, günstig)</option>
          </select>
        </div>
      </div>

      {/* Anthropic Key */}
      {(telegramBot.llmBackend === 'anthropic' || telegramBot.llmBackend === 'auto') && (
        <div className="settings-group">
          <label className="settings-label">
            Anthropic API-Key {hasAnthropicKey && <span style={{ color: '#44c767' }}>✓ gespeichert</span>}
          </label>
          <p className="settings-help">
            Hol dir einen Key unter <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer">console.anthropic.com</a>.
            Nur nötig, wenn Anthropic verwendet werden soll.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="password"
              placeholder={hasAnthropicKey ? 'Neuen Key setzen …' : 'sk-ant-...'}
              value={anthropicKeyInput}
              onChange={e => setAnthropicKeyInput(e.target.value)}
              className="settings-input"
              style={{ flex: 1 }}
            />
            <button className="settings-button" onClick={saveAnthropicKey} disabled={busy || !anthropicKeyInput.trim()}>
              Speichern
            </button>
          </div>
        </div>
      )}

      {/* Briefing-Optionen */}
      <div className="settings-group">
        <label className="settings-label">Morning-Briefing enthält</label>
        <label className="settings-row">
          <input
            type="checkbox"
            checked={telegramBot.briefingIncludeOverdue}
            onChange={e => setTelegramBot({ briefingIncludeOverdue: e.target.checked })}
          />
          <span>Überfällige Tasks</span>
        </label>
        <label className="settings-row">
          <input
            type="checkbox"
            checked={telegramBot.briefingIncludeEmails}
            onChange={e => setTelegramBot({ briefingIncludeEmails: e.target.checked })}
          />
          <span>Relevante ungelesene Emails</span>
        </label>
      </div>

      {/* Commands-Referenz */}
      <div className="settings-group">
        <label className="settings-label">Verfügbare Befehle</label>
        <ul style={{ fontSize: 13, lineHeight: 1.8, paddingLeft: 20 }}>
          <li><code>/today</code> oder <code>/todos</code> — heute fällige Tasks</li>
          <li><code>/overdue</code> — überfällige Tasks</li>
          <li><code>/week</code> — Tasks der nächsten 7 Tage</li>
          <li><code>/briefing</code> — Morning-Briefing (LLM-generiert)</li>
          <li><code>/ask &lt;frage&gt;</code> — Frage an deinen Vault stellen</li>
          <li>Freier Text ohne <code>/</code> — wird als <code>/ask</code> behandelt</li>
        </ul>
      </div>
    </div>
  )
}
