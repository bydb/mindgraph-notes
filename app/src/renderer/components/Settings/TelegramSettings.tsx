import React, { useEffect, useState } from 'react'
import { useUIStore } from '../../stores/uiStore'
import { useNotesStore } from '../../stores/notesStore'
import { useTranslation, type TranslationKey } from '../../utils/translations'

export const TelegramSettings: React.FC = () => {
  const { t } = useTranslation()
  const telegramBot = useUIStore(s => s.telegramBot)
  const setTelegramBot = useUIStore(s => s.setTelegramBot)
  const projectsRootFolder = useUIStore(s => s.projectsRootFolder)
  const projectRagEmbeddingModel = useUIStore(s => s.ollama.projectRagEmbeddingModel)
  const notes = useNotesStore(s => s.notes)

  const [tokenInput, setTokenInput] = useState('')
  const [hasToken, setHasToken] = useState(false)
  const [newChatId, setNewChatId] = useState('')
  const [newPriorityFolder, setNewPriorityFolder] = useState('')

  // Alle Vault-Ordner aus Note-Pfaden extrahieren (relative Pfade)
  const allFolders = React.useMemo(() => {
    const set = new Set<string>()
    for (const n of notes) {
      const parts = n.path.split('/').slice(0, -1)
      for (let i = 1; i <= parts.length; i++) {
        set.add(parts.slice(0, i).join('/'))
      }
    }
    return Array.from(set).filter(Boolean).sort()
  }, [notes])
  const [active, setActive] = useState(false)
  const [statusMsg, setStatusMsg] = useState<{ text: string; kind: 'info' | 'error' | 'success' } | null>(null)
  const [busy, setBusy] = useState(false)

  // Agent Memory State
  const [memoryEntries, setMemoryEntries] = useState<Array<{ id: string; key: string; value: string }>>([])
  const [memorySaved, setMemorySaved] = useState(false)

  // Agent Memory laden
  useEffect(() => {
    window.electronAPI.agentMemoryLoad().then(data => {
      setMemoryEntries(data.entries)
    }).catch(() => {
      // Vault evtl. noch nicht geladen — still schweigen
    })
  }, [])

  // Agent Memory speichern (debounced)
  useEffect(() => {
    if (memoryEntries.length === 0 && !memorySaved) return
    const timer = setTimeout(() => {
      window.electronAPI.agentMemorySave({ entries: memoryEntries }).then(ok => {
        if (ok) {
          setMemorySaved(true)
          setTimeout(() => setMemorySaved(false), 2000)
        }
      }).catch(() => {})
    }, 800)
    return () => clearTimeout(timer)
  }, [memoryEntries])

  const addMemoryEntry = () => {
    const id = `mem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
    setMemoryEntries(prev => [...prev, { id, key: '', value: '' }])
  }

  const updateMemoryEntry = (idx: number, field: 'key' | 'value', value: string) => {
    setMemoryEntries(prev => prev.map((e, i) => i === idx ? { ...e, [field]: value } : e))
  }

  const removeMemoryEntry = (idx: number) => {
    setMemoryEntries(prev => prev.filter((_, i) => i !== idx))
  }

  // Scheduler State
  type SchedRule = { id: string; enabled: boolean; action: string; hour: number; minute: number; weekdays: number[]; label?: string }
  const [scheduleRules, setScheduleRules] = useState<SchedRule[]>([])
  const [schedulerRunning, setSchedulerRunning] = useState(false)

  // Scheduler laden. Der Toggle spiegelt die persistierte Absicht (enabled),
  // nicht den Laufzeit-Zustand (running) — nach Neustart kann enabled=true sein,
  // während der Scheduler erst mit dem Bot-Start wieder anläuft.
  useEffect(() => {
    window.electronAPI.schedulerStatus().then(status => {
      setScheduleRules(status.rules)
      setSchedulerRunning(status.enabled)
    }).catch(() => {})
  }, [])

  // Regeländerungen speichern (debounced). enabled wird mitgesendet, damit ein
  // bloßes Bearbeiten von Regeln den Master-Zustand nicht kippt und nicht
  // ungewollt Timer scharf schaltet (setConfig armiert nur bei enabled).
  useEffect(() => {
    if (scheduleRules.length === 0 && !schedulerRunning) return
    const timer = setTimeout(() => {
      window.electronAPI.schedulerSave({ rules: scheduleRules, enabled: schedulerRunning }).catch(() => {})
    }, 800)
    return () => clearTimeout(timer)
  }, [scheduleRules])

  const addRule = () => {
    const id = `sched_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
    setScheduleRules(prev => [...prev, { id, enabled: true, action: 'briefing', hour: 7, minute: 0, weekdays: [] }])
  }

  const updateRule = (idx: number, field: string, value: unknown) => {
    setScheduleRules(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r))
  }

  const removeRule = (idx: number) => {
    setScheduleRules(prev => prev.filter((_, i) => i !== idx))
  }

  const toggleScheduler = async (on: boolean) => {
    setSchedulerRunning(on)
    // Über setConfig: persistiert enabled UND gleicht die Laufzeit an (armiert
    // bei on, baut Timer bei off ab) — eine kohärente Schreibgrenze.
    await window.electronAPI.schedulerSave({ rules: scheduleRules, enabled: on }).catch(() => {})
  }

  const refreshStatus = async () => {
    const [tokenRes, statusRes] = await Promise.all([
      window.electronAPI.telegramHasToken(),
      window.electronAPI.telegramStatus()
    ])
    setHasToken(tokenRes)
    setActive(statusRes.active)
    setTelegramBot({ active: statusRes.active })
  }

  useEffect(() => {
    refreshStatus()
  }, [])

  // Config live zum Main-Prozess pushen, damit der laufende Bot sie nutzt
  useEffect(() => {
    window.electronAPI.telegramUpdateConfig({
      ollamaModel: telegramBot.ollamaModel,
      includeEmails: telegramBot.briefingIncludeEmails,
      includeOverdue: telegramBot.briefingIncludeOverdue,
      allowedChatIds: telegramBot.allowedChatIds,
      priorityFolders: telegramBot.priorityFolders,
      agentEnabled: telegramBot.agentEnabled,
      agentInboxFolder: telegramBot.agentInboxFolder,
      agentMaxIterations: telegramBot.agentMaxIterations,
      agentAllowedTools: telegramBot.agentAllowedTools,
      agentConfirmTools: telegramBot.agentConfirmTools,
      projectsRootFolder,
      projectRagEmbeddingModel
    })
  }, [
    telegramBot.ollamaModel,
    telegramBot.briefingIncludeEmails,
    telegramBot.briefingIncludeOverdue,
    telegramBot.allowedChatIds,
    telegramBot.priorityFolders,
    telegramBot.agentEnabled,
    telegramBot.agentInboxFolder,
    telegramBot.agentMaxIterations,
    telegramBot.agentAllowedTools,
    telegramBot.agentConfirmTools,
    projectsRootFolder,
    projectRagEmbeddingModel
  ])

  const saveToken = async () => {
    if (!tokenInput.trim()) return
    setBusy(true)
    const ok = await window.electronAPI.telegramSaveToken(tokenInput.trim())
    setBusy(false)
    if (ok) {
      setTokenInput('')
      setHasToken(true)
      setStatusMsg({ text: t('telegramSettings.tokenSaved'), kind: 'success' })
    } else {
      setStatusMsg({ text: t('telegramSettings.tokenSaveFailed'), kind: 'error' })
    }
  }

  const addChatId = () => {
    const id = newChatId.trim()
    if (!id) return
    if (!/^-?\d+$/.test(id)) {
      setStatusMsg({ text: t('telegramSettings.chatIdMustBeNumber'), kind: 'error' })
      return
    }
    if (telegramBot.allowedChatIds.includes(id)) return
    setTelegramBot({ allowedChatIds: [...telegramBot.allowedChatIds, id] })
    setNewChatId('')
  }

  const removeChatId = (id: string) => {
    setTelegramBot({ allowedChatIds: telegramBot.allowedChatIds.filter(x => x !== id) })
  }

  const addPriorityFolder = () => {
    const folder = newPriorityFolder.trim().replace(/^\/+|\/+$/g, '')
    if (!folder) return
    if (telegramBot.priorityFolders.includes(folder)) return
    setTelegramBot({ priorityFolders: [...telegramBot.priorityFolders, folder] })
    setNewPriorityFolder('')
  }

  const removePriorityFolder = (folder: string) => {
    setTelegramBot({ priorityFolders: telegramBot.priorityFolders.filter(f => f !== folder) })
  }

  const startBot = async () => {
    setBusy(true)
    setStatusMsg({ text: t('telegramSettings.starting'), kind: 'info' })
    const res = await window.electronAPI.telegramStart()
    setBusy(false)
    if (res.success) {
      setActive(true)
      setTelegramBot({ active: true })
      setStatusMsg({ text: res.alreadyRunning ? t('telegramSettings.alreadyRunning') : t('telegramSettings.started'), kind: 'success' })
    } else {
      setStatusMsg({ text: res.error ?? t('telegramSettings.startFailed'), kind: 'error' })
    }
  }

  const stopBot = async () => {
    setBusy(true)
    const res = await window.electronAPI.telegramStop()
    setBusy(false)
    if (res.success) {
      setActive(false)
      setTelegramBot({ active: false })
      setStatusMsg({ text: t('telegramSettings.stopped'), kind: 'info' })
    }
  }

  return (
    <div className="settings-section">
      <h3 style={{ display: 'flex', alignItems: 'center' }}>
        {t('telegramSettings.heading')}
        <span className="beta-badge">
          <span className="beta-badge-dot" />
          {t('telegramSettings.experimentalBadge')}
        </span>
      </h3>
      <div
        style={{
          padding: '10px 12px',
          borderRadius: 6,
          border: '1px solid var(--border-color)',
          background: 'color-mix(in srgb, var(--accent-color) 6%, transparent)',
          color: 'var(--text-secondary)',
          fontSize: 13,
          lineHeight: 1.5,
          marginBottom: 14
        }}
      >
        {t('telegramSettings.experimentalNote')}
      </div>
      <p className="settings-help">
        {t('telegramSettings.intro')}
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
          <strong>{active ? t('telegramSettings.botActive') : t('telegramSettings.botInactive')}</strong>
          {!active && hasToken && (
            <button className="settings-button primary" onClick={startBot} disabled={busy}>
              {telegramBot.allowedChatIds.length === 0 ? t('telegramSettings.startDetectChatId') : t('telegramSettings.start')}
            </button>
          )}
          {active && (
            <button className="settings-button" onClick={stopBot} disabled={busy}>{t('telegramSettings.stop')}</button>
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
          <span>{t('telegramSettings.enableFeature')}</span>
        </label>
      </div>

      {/* Bot-Token */}
      <div className="settings-group">
        <label className="settings-label">{t('telegramSettings.botToken')} {hasToken && <span style={{ color: '#44c767' }}>{t('telegramSettings.savedCheck')}</span>}</label>
        <p className="settings-help">
          {t('telegramSettings.tokenHelpBefore')} <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer">@BotFather</a> {t('telegramSettings.tokenHelpAfter')} <code>123456:ABC-DEF...</code>.
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="password"
            placeholder={hasToken ? t('telegramSettings.tokenPlaceholderSet') : t('telegramSettings.tokenPlaceholderNew')}
            value={tokenInput}
            onChange={e => setTokenInput(e.target.value)}
            className="settings-input"
            style={{ flex: 1 }}
          />
          <button className="settings-button" onClick={saveToken} disabled={busy || !tokenInput.trim()}>
            {t('telegramSettings.save')}
          </button>
        </div>
      </div>

      {/* Chat-IDs */}
      <div className="settings-group">
        <label className="settings-label">{t('telegramSettings.allowedChatIds')}</label>
        <p className="settings-help">
          {t('telegramSettings.chatIdsHelp')}
        </p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <input
            type="text"
            placeholder={t('telegramSettings.chatIdPlaceholder')}
            value={newChatId}
            onChange={e => setNewChatId(e.target.value)}
            className="settings-input"
            style={{ flex: 1 }}
          />
          <button className="settings-button" onClick={addChatId}>{t('telegramSettings.add')}</button>
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
                <button className="settings-button small" onClick={() => removeChatId(id)}>{t('telegramSettings.remove')}</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Ollama-Modell */}
      <div className="settings-group">
        <label className="settings-label">{t('telegramSettings.ollamaModelLabel')}</label>
        <input
          type="text"
          placeholder={t('telegramSettings.ollamaModelPlaceholder')}
          value={telegramBot.ollamaModel}
          onChange={e => setTelegramBot({ ollamaModel: e.target.value })}
          className="settings-input"
        />
        <p className="settings-help" style={{ marginTop: 4, fontSize: 12 }}>
          {t('telegramSettings.ollamaModelHelpBefore')} <code>qwen3.6:27b-mlx</code>{t('telegramSettings.ollamaModelHelpMid')} <code>qwen3.5:cloud</code> {t('telegramSettings.ollamaModelHelpSignin')} <code>ollama signin</code>).
          {t('telegramSettings.ollamaModelHelpAfter')}
        </p>
      </div>

      {/* Briefing-Optionen */}
      <div className="settings-group">
        <label className="settings-label">{t('telegramSettings.briefingIncludes')}</label>
        <label className="settings-row">
          <input
            type="checkbox"
            checked={telegramBot.briefingIncludeOverdue}
            onChange={e => setTelegramBot({ briefingIncludeOverdue: e.target.checked })}
          />
          <span>{t('telegramSettings.overdueTasks')}</span>
        </label>
        <label className="settings-row">
          <input
            type="checkbox"
            checked={telegramBot.briefingIncludeEmails}
            onChange={e => setTelegramBot({ briefingIncludeEmails: e.target.checked })}
          />
          <span>{t('telegramSettings.relevantUnreadEmails')}</span>
        </label>
      </div>

      {/* Priority-Ordner */}
      <div className="settings-group">
        <label className="settings-label">{t('telegramSettings.priorityFolders')}</label>
        <p className="settings-help">
          {t('telegramSettings.priorityFoldersHelpBefore')} <code>/ask</code> {t('telegramSettings.priorityFoldersHelpAnd')} <code>/inbox</code> {t('telegramSettings.priorityFoldersHelpAfter')}
        </p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <input
            type="text"
            placeholder={t('telegramSettings.priorityFolderPlaceholder')}
            value={newPriorityFolder}
            onChange={e => setNewPriorityFolder(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addPriorityFolder() } }}
            className="settings-input"
            list="priority-folder-suggestions"
            style={{ flex: 1 }}
          />
          <datalist id="priority-folder-suggestions">
            {allFolders
              .filter(f => !telegramBot.priorityFolders.includes(f))
              .slice(0, 200)
              .map(f => <option key={f} value={f} />)}
          </datalist>
          <button className="settings-button" onClick={addPriorityFolder} disabled={!newPriorityFolder.trim()}>{t('telegramSettings.add')}</button>
        </div>
        {telegramBot.priorityFolders.length > 0 && (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {telegramBot.priorityFolders.map(folder => (
              <li
                key={folder}
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
                <code style={{ fontSize: 12 }}>{folder}</code>
                <button className="settings-button small" onClick={() => removePriorityFolder(folder)}>{t('telegramSettings.remove')}</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Scheduler */}
      <div className="settings-group">
        <label className="settings-label">{t('telegramSettings.scheduler')}</label>
        <p className="settings-help">
          {t('telegramSettings.schedulerHelp')}
        </p>
        <label className="settings-row" style={{ marginBottom: 12 }}>
          <input
            type="checkbox"
            checked={schedulerRunning}
            onChange={e => toggleScheduler(e.target.checked)}
          />
          <span>{t('telegramSettings.schedulerActive')}</span>
        </label>
        {scheduleRules.map((rule, idx) => (
          <div key={rule.id} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="checkbox"
              checked={rule.enabled}
              onChange={e => updateRule(idx, 'enabled', e.target.checked)}
            />
            <select
              value={rule.action}
              onChange={e => updateRule(idx, 'action', e.target.value)}
              className="settings-input"
              style={{ width: 130 }}
            >
              <option value="briefing">{t('telegramSettings.schedBriefing')}</option>
              <option value="overdue-check">{t('telegramSettings.schedOverdue')}</option>
            </select>
            <input
              type="number"
              min={0}
              max={23}
              value={rule.hour}
              onChange={e => updateRule(idx, 'hour', Number(e.target.value))}
              className="settings-input"
              style={{ width: 50 }}
            />
            <span>:</span>
            <input
              type="number"
              min={0}
              max={59}
              value={rule.minute}
              onChange={e => updateRule(idx, 'minute', Number(e.target.value))}
              className="settings-input"
              style={{ width: 50 }}
            />
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Uhr</span>
            <button
              className="settings-button small"
              onClick={() => removeRule(idx)}
              title={t('telegramSettings.remove')}
            >
              ✕
            </button>
          </div>
        ))}
        <button
          className="settings-button"
          onClick={addRule}
          style={{ marginTop: 4 }}
        >
          + {t('telegramSettings.addSchedule')}
        </button>
      </div>

      {/* Agent-Modus */}
      <div className="settings-group">
        <label className="settings-label">{t('telegramSettings.agentMode')}</label>
        <p className="settings-help">
          {t('telegramSettings.agentModeHelpBefore')} <code>llama3.1</code>, <code>qwen2.5-coder:14b</code>, <code>mistral-nemo</code>).
        </p>
        <label className="settings-row">
          <input
            type="checkbox"
            checked={telegramBot.agentEnabled}
            onChange={e => setTelegramBot({ agentEnabled: e.target.checked })}
          />
          <span>{t('telegramSettings.enableAgentMode')} (<code>/agent &lt;{t('telegramSettings.taskArg')}&gt;</code>)</span>
        </label>

        {telegramBot.agentEnabled && (
          <>
            <label className="settings-label" style={{ marginTop: 12 }}>
              {t('telegramSettings.inboxFolderLabel')}
            </label>
            <input
              type="text"
              placeholder={t('telegramSettings.inboxFolderPlaceholder')}
              value={telegramBot.agentInboxFolder}
              onChange={e => setTelegramBot({ agentInboxFolder: e.target.value })}
              className="settings-input"
              list="agent-inbox-suggestions"
            />
            <datalist id="agent-inbox-suggestions">
              {allFolders.slice(0, 200).map(f => <option key={f} value={f} />)}
            </datalist>

            <label className="settings-label" style={{ marginTop: 12 }}>
              {t('telegramSettings.maxIterations')} <strong>{telegramBot.agentMaxIterations}</strong>
            </label>
            <input
              type="range"
              min={1}
              max={15}
              value={telegramBot.agentMaxIterations}
              onChange={e => setTelegramBot({ agentMaxIterations: Number(e.target.value) })}
              className="settings-input"
            />
            <p className="settings-help">
              {t('telegramSettings.maxIterationsHelp')}
            </p>

            <label className="settings-label" style={{ marginTop: 12 }}>{t('telegramSettings.activeTools')}</label>
            <p className="settings-help">
              {t('telegramSettings.writeToolsHelp')}
            </p>
            {AGENT_TOOLS.map(tool => {
              const enabled = telegramBot.agentAllowedTools.includes(tool.name)
              const toggle = () => {
                const next = enabled
                  ? telegramBot.agentAllowedTools.filter(n => n !== tool.name)
                  : [...telegramBot.agentAllowedTools, tool.name]
                setTelegramBot({ agentAllowedTools: next })
              }
              return (
                <label key={tool.name} className="settings-row" style={{ alignItems: 'flex-start' }}>
                  <input type="checkbox" checked={enabled} onChange={toggle} />
                  <span>
                    <code style={{ color: tool.write ? '#d44' : 'inherit' }}>{tool.name}</code>
                    {tool.write && <span style={{ fontSize: 11, marginLeft: 6, color: '#d44' }}>{t('telegramSettings.writeConfirm')}</span>}
                    <br />
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t(`telegramSettings.tool.${tool.name}` as TranslationKey)}</span>
                  </span>
                </label>
              )
            })}
          </>
        )}
      </div>

      {/* Agent Memory */}
      <div className="settings-group">
        <label className="settings-label">{t('telegramSettings.agentMemory')}</label>
        <p className="settings-help">
          {t('telegramSettings.agentMemoryHelp')}
        </p>
        {memoryEntries.map((entry, idx) => (
          <div key={entry.id} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'flex-start' }}>
            <input
              type="text"
              placeholder={t('telegramSettings.memoryKeyPlaceholder')}
              value={entry.key}
              onChange={e => updateMemoryEntry(idx, 'key', e.target.value)}
              className="settings-input"
              style={{ width: 140, flexShrink: 0 }}
            />
            <input
              type="text"
              placeholder={t('telegramSettings.memoryValuePlaceholder')}
              value={entry.value}
              onChange={e => updateMemoryEntry(idx, 'value', e.target.value)}
              className="settings-input"
              style={{ flex: 1 }}
            />
            <button
              className="settings-button small"
              onClick={() => removeMemoryEntry(idx)}
              title={t('telegramSettings.remove')}
            >
              ✕
            </button>
          </div>
        ))}
        <button
          className="settings-button"
          onClick={addMemoryEntry}
          style={{ marginTop: 4 }}
        >
          + {t('telegramSettings.addMemoryEntry')}
        </button>
        {memorySaved && (
          <span style={{ fontSize: 12, color: '#44c767', marginLeft: 8 }}>
            ✓ {t('telegramSettings.memorySaved')}
          </span>
        )}
      </div>

      {/* Commands-Referenz */}
      <div className="settings-group">
        <label className="settings-label">{t('telegramSettings.availableCommands')}</label>
        <ul style={{ fontSize: 13, lineHeight: 1.8, paddingLeft: 20 }}>
          <li><code>/today</code> {t('telegramSettings.or')} <code>/todos</code> — {t('telegramSettings.cmdToday')}</li>
          <li><code>/overdue</code> — {t('telegramSettings.cmdOverdue')}</li>
          <li><code>/week</code> — {t('telegramSettings.cmdWeek')}</li>
          <li><code>/agenda</code> — {t('telegramSettings.cmdAgenda')}</li>
          <li><code>/inbox</code> — {t('telegramSettings.cmdInbox')}</li>
          <li><code>/briefing</code> — {t('telegramSettings.cmdBriefing')}</li>
          <li><code>/ask &lt;{t('telegramSettings.questionArg')}&gt;</code> — {t('telegramSettings.cmdAsk')}</li>
          {telegramBot.agentEnabled && (
            <li><code>/agent &lt;{t('telegramSettings.taskArg')}&gt;</code> — {t('telegramSettings.cmdAgent')}</li>
          )}
          <li>{t('telegramSettings.cmdFreeTextBefore')} <code>/</code> — {t('telegramSettings.cmdFreeTextMid')} <code>/ask</code> {t('telegramSettings.cmdFreeTextAfter')}</li>
        </ul>
      </div>
    </div>
  )
}

const AGENT_TOOLS: Array<{ name: string; description: string; write: boolean }> = [
  { name: 'note_search', description: 'Notizen im Vault per Stichwort suchen.', write: false },
  { name: 'note_read', description: 'Volltext einer Notiz lesen.', write: false },
  { name: 'task_list', description: 'Offene Tasks listen (today / overdue / week / all).', write: false },
  { name: 'calendar_list', description: 'Kalender-Termine auslesen (macOS).', write: false },
  { name: 'note_create', description: 'Neue Notiz im Inbox-Ordner anlegen.', write: true },
  { name: 'note_append', description: 'Text an eine bestehende Notiz anhängen.', write: true },
  { name: 'task_toggle', description: 'Task in einer Notiz abhaken bzw. wieder öffnen.', write: true }
]
