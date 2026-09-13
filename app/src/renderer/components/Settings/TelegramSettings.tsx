// Einstellungen → Telegram (Redesign 09/2026). EXPERIMENTELL, eingefroren — nur Darstellung
// geändert, Logik (Token, Chat-IDs, Scheduler, Agent-Modus, Gedächtnis) unverändert.

import React, { useEffect, useState } from 'react'
import { useUIStore } from '../../stores/uiStore'
import { useNotesStore } from '../../stores/notesStore'
import { useTranslation, type TranslationKey } from '../../utils/translations'
import { ExternalLink } from '../Shared/ExternalLink'
import {
  PageHeader, SectionTitle, Card, ServiceHead, IconTile, Row, Note, Details, Toggle, Select, Button, TextInput, SecretField,
  RemovableChips, ChipInput, StatusChip, SavedMark
} from './SettingsUI'

const SEND_ICON = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m22 2-7 20-4-9-9-4z" /><path d="M22 2 11 13" />
  </svg>
)

export const TelegramSettings: React.FC = () => {
  const { t } = useTranslation()
  const telegramBot = useUIStore(s => s.telegramBot)
  const setTelegramBot = useUIStore(s => s.setTelegramBot)
  const projectsRootFolder = useUIStore(s => s.projectsRootFolder)
  const projectRagEmbeddingModel = useUIStore(s => s.ollama.projectRagEmbeddingModel)
  const notes = useNotesStore(s => s.notes)

  const [hasToken, setHasToken] = useState(false)
  const [newPriorityFolder, setNewPriorityFolder] = useState('')

  // Alle Vault-Ordner aus Note-Pfaden extrahieren (relative Pfade)
  const allFolders = React.useMemo(() => {
    const set = new Set<string>()
    for (const n of notes) {
      const parts = n.path.split('/').slice(0, -1)
      for (let i = 1; i <= parts.length; i++) set.add(parts.slice(0, i).join('/'))
    }
    return Array.from(set).filter(Boolean).sort()
  }, [notes])
  const [active, setActive] = useState(false)
  const [statusMsg, setStatusMsg] = useState<{ text: string; kind: 'info' | 'error' | 'success' } | null>(null)
  const [busy, setBusy] = useState(false)

  // Agent Memory State
  const [memoryEntries, setMemoryEntries] = useState<Array<{ id: string; key: string; value: string }>>([])
  const [memorySaved, setMemorySaved] = useState(false)

  useEffect(() => {
    window.electronAPI.agentMemoryLoad().then(data => setMemoryEntries(data.entries)).catch(() => { /* Vault evtl. noch nicht geladen */ })
  }, [])

  // Agent Memory speichern (debounced)
  useEffect(() => {
    if (memoryEntries.length === 0 && !memorySaved) return
    const timer = setTimeout(() => {
      window.electronAPI.agentMemorySave({ entries: memoryEntries }).then(ok => {
        if (ok) { setMemorySaved(true); setTimeout(() => setMemorySaved(false), 2000) }
      }).catch(() => {})
    }, 800)
    return () => clearTimeout(timer)
  }, [memoryEntries]) // eslint-disable-line react-hooks/exhaustive-deps

  const addMemoryEntry = () => {
    const id = `mem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
    setMemoryEntries(prev => [...prev, { id, key: '', value: '' }])
  }
  const updateMemoryEntry = (idx: number, field: 'key' | 'value', value: string) => {
    setMemoryEntries(prev => prev.map((e, i) => i === idx ? { ...e, [field]: value } : e))
  }
  const removeMemoryEntry = (idx: number) => setMemoryEntries(prev => prev.filter((_, i) => i !== idx))

  // Scheduler State
  type SchedRule = { id: string; enabled: boolean; action: string; hour: number; minute: number; weekdays: number[]; label?: string }
  const [scheduleRules, setScheduleRules] = useState<SchedRule[]>([])
  const [schedulerRunning, setSchedulerRunning] = useState(false)

  // Scheduler laden. Der Toggle spiegelt die persistierte Absicht (enabled), nicht den
  // Laufzeit-Zustand (running).
  useEffect(() => {
    window.electronAPI.schedulerStatus().then(status => {
      setScheduleRules(status.rules)
      setSchedulerRunning(status.enabled)
    }).catch(() => {})
  }, [])

  // Regeländerungen speichern (debounced). enabled wird mitgesendet, damit ein bloßes
  // Bearbeiten den Master-Zustand nicht kippt (setConfig armiert nur bei enabled).
  useEffect(() => {
    if (scheduleRules.length === 0 && !schedulerRunning) return
    const timer = setTimeout(() => {
      window.electronAPI.schedulerSave({ rules: scheduleRules, enabled: schedulerRunning }).catch(() => {})
    }, 800)
    return () => clearTimeout(timer)
  }, [scheduleRules]) // eslint-disable-line react-hooks/exhaustive-deps

  const addRule = () => {
    const id = `sched_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
    setScheduleRules(prev => [...prev, { id, enabled: true, action: 'briefing', hour: 7, minute: 0, weekdays: [] }])
  }
  const updateRule = (idx: number, field: string, value: unknown) => setScheduleRules(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r))
  const removeRule = (idx: number) => setScheduleRules(prev => prev.filter((_, i) => i !== idx))
  const toggleScheduler = async (on: boolean) => {
    setSchedulerRunning(on)
    await window.electronAPI.schedulerSave({ rules: scheduleRules, enabled: on }).catch(() => {})
  }

  const refreshStatus = async () => {
    const [tokenRes, statusRes] = await Promise.all([window.electronAPI.telegramHasToken(), window.electronAPI.telegramStatus()])
    setHasToken(tokenRes)
    setActive(statusRes.active)
    setTelegramBot({ active: statusRes.active })
  }
  useEffect(() => { void refreshStatus() }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
    telegramBot.ollamaModel, telegramBot.briefingIncludeEmails, telegramBot.briefingIncludeOverdue, telegramBot.allowedChatIds,
    telegramBot.priorityFolders, telegramBot.agentEnabled, telegramBot.agentInboxFolder, telegramBot.agentMaxIterations,
    telegramBot.agentAllowedTools, telegramBot.agentConfirmTools, projectsRootFolder, projectRagEmbeddingModel
  ])

  const saveToken = async (token: string) => {
    setBusy(true)
    const ok = await window.electronAPI.telegramSaveToken(token)
    setBusy(false)
    if (ok) {
      setHasToken(true)
      setStatusMsg({ text: t('telegramSettings.tokenSaved'), kind: 'success' })
    } else {
      setStatusMsg({ text: t('telegramSettings.tokenSaveFailed'), kind: 'error' })
    }
  }

  const addChatId = (raw: string) => {
    const id = raw.trim()
    if (!/^-?\d+$/.test(id)) {
      setStatusMsg({ text: t('telegramSettings.chatIdMustBeNumber'), kind: 'error' })
      return
    }
    if (telegramBot.allowedChatIds.includes(id)) return
    setTelegramBot({ allowedChatIds: [...telegramBot.allowedChatIds, id] })
  }
  const removeChatId = (id: string) => setTelegramBot({ allowedChatIds: telegramBot.allowedChatIds.filter(x => x !== id) })

  const addPriorityFolder = () => {
    const folder = newPriorityFolder.trim().replace(/^\/+|\/+$/g, '')
    if (!folder || telegramBot.priorityFolders.includes(folder)) return
    setTelegramBot({ priorityFolders: [...telegramBot.priorityFolders, folder] })
    setNewPriorityFolder('')
  }
  const removePriorityFolder = (folder: string) => setTelegramBot({ priorityFolders: telegramBot.priorityFolders.filter(f => f !== folder) })

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

  const botIcon = <IconTile bg="#2f7af5">{SEND_ICON}</IconTile>

  return (
    <div className="settings-section">
      <PageHeader
        title={<>{t('telegramSettings.heading')} <span className="beta-badge"><span className="beta-badge-dot" />{t('telegramSettings.experimentalBadge')}</span></>}
        subtitle={t('settings.telegram.subtitle')}
      />
      <Card><Note tone="muted">{t('telegramSettings.experimentalNote')} {t('telegramSettings.intro')}</Note></Card>

      {/* ── Bot ── */}
      <Card>
        <ServiceHead
          icon={botIcon}
          name={t('settings.telegram.botName')}
          desc={t('settings.telegram.botDesc')}
          status={active ? { tone: 'ok', label: t('telegramSettings.botActive') } : hasToken ? { tone: 'off', label: t('telegramSettings.botInactive') } : { tone: 'warn', label: t('settings.telegram.noToken') }}
          actions={
            active
              ? <Button onClick={() => void stopBot()} disabled={busy}>{t('telegramSettings.stop')}</Button>
              : hasToken ? <Button variant="primary" onClick={() => void startBot()} disabled={busy}>{telegramBot.allowedChatIds.length === 0 ? t('telegramSettings.startDetectChatId') : t('telegramSettings.start')}</Button> : undefined
          }
          toggle={{ checked: telegramBot.enabled, onChange: v => setTelegramBot({ enabled: v }), ariaLabel: t('telegramSettings.enableFeature') }}
          dimmed={!telegramBot.enabled}
        />
        {statusMsg && <Note tone={statusMsg.kind === 'error' ? 'danger' : statusMsg.kind === 'success' ? 'ok' : 'muted'}>{statusMsg.text}</Note>}
        <Row
          label={t('telegramSettings.botToken')}
          hint={<>{t('settings.telegram.tokenHint')} · {t('telegramSettings.tokenHelpBefore')} <ExternalLink href="https://t.me/BotFather">@BotFather</ExternalLink> {t('telegramSettings.tokenHelpAfter')} <code>123456:ABC-DEF...</code></>}
        >
          <SecretField saved={hasToken} onSave={saveToken} placeholder={t('telegramSettings.tokenPlaceholderNew')} busy={busy} />
        </Row>
        <Row label={t('telegramSettings.allowedChatIds')} hint={t('telegramSettings.chatIdsHelp')} stacked>
          <RemovableChips items={telegramBot.allowedChatIds} onRemove={removeChatId} removeTitle={t('telegramSettings.remove')} />
          <div className="sui-pair"><ChipInput placeholder={t('telegramSettings.chatIdPlaceholder')} onAdd={addChatId} addLabel={t('telegramSettings.add')} /></div>
        </Row>
        <Row
          label={t('telegramSettings.ollamaModelLabel')}
          hint={<>{t('telegramSettings.ollamaModelHelpBefore')} <code>qwen3.6:27b-mlx</code>{t('telegramSettings.ollamaModelHelpMid')} <code>qwen3.5:cloud</code> {t('telegramSettings.ollamaModelHelpSignin')} <code>ollama signin</code>). {t('telegramSettings.ollamaModelHelpAfter')}</>}
        >
          <TextInput value={telegramBot.ollamaModel} onCommit={v => setTelegramBot({ ollamaModel: v })} placeholder={t('telegramSettings.ollamaModelPlaceholder')} />
        </Row>
      </Card>

      {/* ── Briefing & Kontext ── */}
      <SectionTitle title={t('settings.telegram.groupBriefing')} />
      <Card>
        <Row label={t('telegramSettings.briefingIncludes')} />
        <Row label={t('telegramSettings.overdueTasks')} htmlFor="tg-overdue">
          <Toggle id="tg-overdue" checked={telegramBot.briefingIncludeOverdue} onChange={v => setTelegramBot({ briefingIncludeOverdue: v })} />
        </Row>
        <Row label={t('telegramSettings.relevantUnreadEmails')} htmlFor="tg-emails">
          <Toggle id="tg-emails" checked={telegramBot.briefingIncludeEmails} onChange={v => setTelegramBot({ briefingIncludeEmails: v })} />
        </Row>
        <Row
          label={t('telegramSettings.priorityFolders')}
          hint={<>{t('telegramSettings.priorityFoldersHelpBefore')} <code>/ask</code> {t('telegramSettings.priorityFoldersHelpAnd')} <code>/inbox</code> {t('telegramSettings.priorityFoldersHelpAfter')}</>}
          stacked
        >
          <RemovableChips items={telegramBot.priorityFolders} onRemove={removePriorityFolder} removeTitle={t('telegramSettings.remove')} />
          <div className="sui-pair">
            <input
              type="text"
              className="sui-input"
              placeholder={t('telegramSettings.priorityFolderPlaceholder')}
              value={newPriorityFolder}
              onChange={e => setNewPriorityFolder(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addPriorityFolder() } }}
              list="priority-folder-suggestions"
            />
            <datalist id="priority-folder-suggestions">
              {allFolders.filter(f => !telegramBot.priorityFolders.includes(f)).slice(0, 200).map(f => <option key={f} value={f} />)}
            </datalist>
            <Button onClick={addPriorityFolder} disabled={!newPriorityFolder.trim()}>{t('telegramSettings.add')}</Button>
          </div>
        </Row>
      </Card>

      {/* ── Zeitpläne ── */}
      <SectionTitle title={t('settings.telegram.groupScheduler')} meta={t('settings.telegram.rules', { n: scheduleRules.length })} />
      <Card>
        <Row label={t('telegramSettings.schedulerActive')} hint={t('telegramSettings.schedulerHelp')} htmlFor="tg-scheduler">
          <Toggle id="tg-scheduler" checked={schedulerRunning} onChange={v => void toggleScheduler(v)} />
        </Row>
        {scheduleRules.map((rule, idx) => (
          <Row key={rule.id} label={rule.action === 'briefing' ? t('telegramSettings.schedBriefing') : t('telegramSettings.schedOverdue')} hint={`${String(rule.hour).padStart(2, '0')}:${String(rule.minute).padStart(2, '0')} ${t('settings.telegram.ruleTime')}`}>
            <Toggle checked={rule.enabled} onChange={v => updateRule(idx, 'enabled', v)} ariaLabel={t('telegramSettings.schedulerActive')} />
            <Select value={rule.action} onChange={e => updateRule(idx, 'action', e.target.value)}>
              <option value="briefing">{t('telegramSettings.schedBriefing')}</option>
              <option value="overdue-check">{t('telegramSettings.schedOverdue')}</option>
            </Select>
            <input type="number" className="sui-input is-number" min={0} max={23} value={rule.hour} onChange={e => updateRule(idx, 'hour', Number(e.target.value))} aria-label="h" />
            <span className="sui-unit">:</span>
            <input type="number" className="sui-input is-number" min={0} max={59} value={rule.minute} onChange={e => updateRule(idx, 'minute', Number(e.target.value))} aria-label="min" />
            <Button variant="link" onClick={() => removeRule(idx)}>{t('telegramSettings.remove')}</Button>
          </Row>
        ))}
        <Row label={t('telegramSettings.addSchedule')}>
          <Button onClick={addRule}>+ {t('telegramSettings.addSchedule')}</Button>
        </Row>
      </Card>

      {/* ── Agent-Modus ── */}
      <SectionTitle title={t('settings.telegram.groupAgent')} />
      <Card>
        <Row
          label={<>{t('telegramSettings.enableAgentMode')} (<code>/agent &lt;{t('telegramSettings.taskArg')}&gt;</code>)</>}
          hint={<>{t('telegramSettings.agentModeHelpBefore')} <code>llama3.1</code>, <code>qwen2.5-coder:14b</code>, <code>mistral-nemo</code>).</>}
          htmlFor="tg-agent"
        >
          <Toggle id="tg-agent" checked={telegramBot.agentEnabled} onChange={v => setTelegramBot({ agentEnabled: v })} />
        </Row>
        {telegramBot.agentEnabled && (
          <>
            <Row label={t('telegramSettings.inboxFolderLabel')}>
              <input
                type="text"
                className="sui-input"
                placeholder={t('telegramSettings.inboxFolderPlaceholder')}
                value={telegramBot.agentInboxFolder}
                onChange={e => setTelegramBot({ agentInboxFolder: e.target.value })}
                list="agent-inbox-suggestions"
              />
              <datalist id="agent-inbox-suggestions">{allFolders.slice(0, 200).map(f => <option key={f} value={f} />)}</datalist>
            </Row>
            <Row label={t('telegramSettings.maxIterations')} hint={t('telegramSettings.maxIterationsHelp')}>
              <input type="range" className="sui-range" min={1} max={15} value={telegramBot.agentMaxIterations} onChange={e => setTelegramBot({ agentMaxIterations: Number(e.target.value) })} />
              <span className="sui-unit">{telegramBot.agentMaxIterations}</span>
            </Row>
            <Row label={t('telegramSettings.activeTools')} hint={t('telegramSettings.writeToolsHelp')} />
            {AGENT_TOOLS.map(tool => {
              const enabled = telegramBot.agentAllowedTools.includes(tool.name)
              return (
                <Row key={tool.name} label={<code>{tool.name}</code>} hint={t(`telegramSettings.tool.${tool.name}` as TranslationKey)} htmlFor={`tg-tool-${tool.name}`}>
                  {tool.write && <StatusChip tone="warn" label={t('settings.telegram.toolWrite')} />}
                  <Toggle
                    id={`tg-tool-${tool.name}`}
                    checked={enabled}
                    onChange={on => setTelegramBot({ agentAllowedTools: on ? [...telegramBot.agentAllowedTools, tool.name] : telegramBot.agentAllowedTools.filter(n => n !== tool.name) })}
                  />
                </Row>
              )
            })}
          </>
        )}
      </Card>

      {/* ── Agent-Gedächtnis ── */}
      <SectionTitle title={t('settings.telegram.groupMemory')} />
      <Card>
        <Row label={t('telegramSettings.agentMemory')} hint={t('telegramSettings.agentMemoryHelp')}>
          {memorySaved && <SavedMark label={t('telegramSettings.memorySaved')} />}
          <Button onClick={addMemoryEntry}>+ {t('telegramSettings.addMemoryEntry')}</Button>
        </Row>
        {memoryEntries.map((entry, idx) => (
          <Row key={entry.id} label={entry.key || '…'} stacked>
            <div className="sui-rule-row">
              <input type="text" className="sui-input" placeholder={t('telegramSettings.memoryKeyPlaceholder')} value={entry.key} onChange={e => updateMemoryEntry(idx, 'key', e.target.value)} />
              <input type="text" className="sui-input" placeholder={t('telegramSettings.memoryValuePlaceholder')} value={entry.value} onChange={e => updateMemoryEntry(idx, 'value', e.target.value)} />
              <button type="button" className="sui-rule-remove" title={t('telegramSettings.remove')} aria-label={t('telegramSettings.remove')} onClick={() => removeMemoryEntry(idx)}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
              </button>
            </div>
          </Row>
        ))}
      </Card>

      {/* ── Befehle ── */}
      <Card>
        <Details title={t('settings.telegram.groupCommands')}>
          <ul className="sui-hint-list">
            <li><code>/today</code> {t('telegramSettings.or')} <code>/todos</code> — {t('telegramSettings.cmdToday')}</li>
            <li><code>/overdue</code> — {t('telegramSettings.cmdOverdue')}</li>
            <li><code>/week</code> — {t('telegramSettings.cmdWeek')}</li>
            <li><code>/agenda</code> — {t('telegramSettings.cmdAgenda')}</li>
            <li><code>/inbox</code> — {t('telegramSettings.cmdInbox')}</li>
            <li><code>/briefing</code> — {t('telegramSettings.cmdBriefing')}</li>
            <li><code>/ask &lt;{t('telegramSettings.questionArg')}&gt;</code> — {t('telegramSettings.cmdAsk')}</li>
            {telegramBot.agentEnabled && <li><code>/agent &lt;{t('telegramSettings.taskArg')}&gt;</code> — {t('telegramSettings.cmdAgent')}</li>}
            <li>{t('telegramSettings.cmdFreeTextBefore')} <code>/</code> — {t('telegramSettings.cmdFreeTextMid')} <code>/ask</code> {t('telegramSettings.cmdFreeTextAfter')}</li>
          </ul>
        </Details>
      </Card>
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
