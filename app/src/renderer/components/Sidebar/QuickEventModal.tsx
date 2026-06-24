import React, { useEffect, useMemo, useState, useCallback } from 'react'
import { useUIStore } from '../../stores/uiStore'
import { useNotesStore, createNoteFromFile } from '../../stores/notesStore'
import { useTranslation } from '../../utils/translations'
import type { CalendarEvent } from '../../../shared/types'
import './QuickEventModal.css'

const pad2 = (n: number) => n.toString().padStart(2, '0')

const todayIso = (): string => {
  const d = new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

const nextHourHHmm = (): string => {
  const d = new Date()
  d.setMinutes(0, 0, 0)
  d.setHours(d.getHours() + 1)
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

const sanitizeFilename = (s: string): string =>
  s.replace(/[/\\?%*:|"<>]/g, '-').replace(/\s+/g, ' ').trim().substring(0, 80)

interface ParsedEvent {
  title: string
  start: number   // ms
  end: number     // ms
  location?: string
  allDay: boolean
}

const parseEvent = (e: CalendarEvent): ParsedEvent | null => {
  const start = new Date(e.startDate.replace(' ', 'T')).getTime()
  const end = new Date(e.endDate.replace(' ', 'T')).getTime()
  if (Number.isNaN(start) || Number.isNaN(end)) return null
  return { title: e.title, start, end, location: e.location, allDay: e.allDay ?? false }
}

export const QuickEventModal: React.FC = () => {
  const { t } = useTranslation()
  const open = useUIStore(state => state.quickEventModalOpen)
  const setOpen = useUIStore(state => state.setQuickEventModalOpen)
  const transport = useUIStore(state => state.transport)
  const { vaultPath, addNote, selectNote } = useNotesStore()

  const [title, setTitle] = useState('')
  const [date, setDate] = useState(todayIso())
  const [time, setTime] = useState(nextHourHHmm())
  const [duration, setDuration] = useState(60)
  const [location, setLocation] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [warnMsg, setWarnMsg] = useState<string | null>(null)
  const [dayEvents, setDayEvents] = useState<ParsedEvent[]>([])

  // Reset bei Open/Close
  useEffect(() => {
    if (!open) return
    setTitle('')
    setDate(todayIso())
    setTime(nextHourHHmm())
    setDuration(60)
    setLocation('')
    setNotes('')
    setSubmitting(false)
    setErrorMsg(null)
    setWarnMsg(null)
  }, [open])

  // Konflikt-Check: Events des gewählten Tages laden
  useEffect(() => {
    if (!open) return
    let cancelled = false
    void (async () => {
      try {
        const res = await window.electronAPI.calendarGetEvents(date, date)
        if (cancelled) return
        if (!res.success) {
          setDayEvents([])
          return
        }
        const parsed = res.events.map(parseEvent).filter((e): e is ParsedEvent => !!e)
        setDayEvents(parsed)
      } catch {
        if (!cancelled) setDayEvents([])
      }
    })()
    return () => { cancelled = true }
  }, [open, date])

  const slotStart = useMemo(() => {
    const [h, m] = time.split(':').map(Number)
    if (Number.isNaN(h) || Number.isNaN(m)) return null
    const [y, mo, d] = date.split('-').map(Number)
    if (!y || !mo || !d) return null
    return new Date(y, mo - 1, d, h, m, 0).getTime()
  }, [date, time])

  const slotEnd = useMemo(() => {
    if (slotStart == null) return null
    return slotStart + duration * 60_000
  }, [slotStart, duration])

  const conflicts = useMemo(() => {
    if (slotStart == null || slotEnd == null) return [] as ParsedEvent[]
    return dayEvents.filter(e => e.start < slotEnd && e.end > slotStart)
  }, [dayEvents, slotStart, slotEnd])

  const handleClose = useCallback(() => {
    if (submitting) return
    setOpen(false)
  }, [submitting, setOpen])

  const handleSubmit = useCallback(async () => {
    if (!title.trim()) {
      setErrorMsg(t('quickEvent.errorTitle'))
      return
    }
    if (!vaultPath) {
      setErrorMsg(t('quickEvent.errorVault'))
      return
    }
    setSubmitting(true)
    setErrorMsg(null)
    setWarnMsg(null)
    try {
      const folder = (transport.defaultDestinationFolder || '').trim().replace(/^\/+|\/+$/g, '')
      const safeTitle = sanitizeFilename(title)
      // Filename-Konvention (vgl. telegram/agent/tools/notes.ts): YYYYMMDDHHMM - 🔴 Titel.md
      const zettelId = `${date.replace(/-/g, '')}${time.replace(':', '')}`
      const filename = `${zettelId} - 🔴 ${safeTitle}.md`
      const relPath = folder ? `${folder}/${filename}` : filename
      const filePath = `${vaultPath}/${relPath}`

      const lines: string[] = []
      lines.push('---')
      lines.push('type: event')
      // category: 🔴 → triggert das existierende Note-Kind-System und zeigt im FileTree
      // sowie auf Bookmarks/Canvas einen roten Punkt für Termine.
      lines.push('category: 🔴')
      lines.push(`date: ${date}`)
      lines.push(`time: "${time}"`)
      lines.push(`duration: ${duration}`)
      if (location.trim()) lines.push(`location: ${JSON.stringify(location.trim())}`)
      lines.push('tags:')
      lines.push('  - event')
      lines.push('---')
      lines.push('')
      lines.push(`# ${title.trim()}`)
      lines.push('')
      if (notes.trim()) {
        lines.push(notes.trim())
        lines.push('')
      }
      lines.push(`- [ ] ${title.trim()} (@[[${date}]] ${time})`)
      lines.push('')
      const content = lines.join('\n')

      if (folder) {
        await window.electronAPI.ensureDir(`${vaultPath}/${folder}`)
      }
      await window.electronAPI.writeFile(filePath, content)
      const note = await createNoteFromFile(filePath, relPath, content)
      addNote(note)
      selectNote(note.id)

      // Zusätzlich in macOS-Kalender (EventKit) eintragen — best effort.
      // Schlägt das fehl (kein Permission, anderes OS), bleibt die Notiz erhalten,
      // wir zeigen nur eine Warnung und schließen das Modal trotzdem.
      const [yy, mm, dd] = date.split('-').map(Number)
      const [hh, mi] = time.split(':').map(Number)
      const startIso = new Date(yy, mm - 1, dd, hh, mi, 0).toISOString()
      const calNotes = [location.trim() ? `Ort: ${location.trim()}` : '', notes.trim()].filter(Boolean).join('\n\n')
      try {
        const calRes = await window.electronAPI.calendarCreateEvent({
          title: title.trim(),
          startIso,
          durationMinutes: duration,
          notes: calNotes
        })
        if (!calRes.success) {
          setWarnMsg(calRes.needsPermission
            ? t('quickEvent.calendarNeedsPermission')
            : t('quickEvent.calendarFailed', { error: calRes.error || '' }))
          // Notiz wurde erfolgreich angelegt — Modal trotzdem nicht schließen,
          // damit der User die Warnung sieht.
          return
        }
      } catch (err) {
        setWarnMsg(t('quickEvent.calendarFailed', { error: err instanceof Error ? err.message : String(err) }))
        return
      }

      setOpen(false)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }, [title, vaultPath, transport.defaultDestinationFolder, date, time, duration, location, notes, addNote, selectNote, setOpen, t])

  if (!open) return null

  const formatHHmm = (ms: number) => {
    const d = new Date(ms)
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
  }

  return (
    <div className="quick-event-overlay" onClick={handleClose}>
      <div className="quick-event-modal" onClick={e => e.stopPropagation()}>
        <header className="quick-event-header">
          <h3>{t('quickEvent.title')}</h3>
          <button className="quick-event-close" onClick={handleClose} aria-label={t('quickEvent.close')} title={t('quickEvent.close')}>×</button>
        </header>
        <div className="quick-event-body">
          <label className="quick-event-field">
            <span>{t('quickEvent.fieldTitle')}</span>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              autoFocus
              placeholder={t('quickEvent.titlePlaceholder')}
            />
          </label>
          <div className="quick-event-row">
            <label className="quick-event-field">
              <span>{t('quickEvent.fieldDate')}</span>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} />
            </label>
            <label className="quick-event-field">
              <span>{t('quickEvent.fieldTime')}</span>
              <input type="time" value={time} onChange={e => setTime(e.target.value)} />
            </label>
            <label className="quick-event-field">
              <span>{t('quickEvent.fieldDuration')}</span>
              <input
                type="number"
                min={5}
                step={5}
                value={duration}
                onChange={e => setDuration(Math.max(5, Number(e.target.value) || 60))}
              />
            </label>
          </div>
          <label className="quick-event-field">
            <span>{t('quickEvent.fieldLocation')}</span>
            <input type="text" value={location} onChange={e => setLocation(e.target.value)} placeholder={t('quickEvent.locationPlaceholder')} />
          </label>
          <label className="quick-event-field">
            <span>{t('quickEvent.fieldNotes')}</span>
            <textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)} />
          </label>

          {conflicts.length > 0 && (
            <div className="quick-event-conflicts">
              <strong>⚠️ {t('quickEvent.conflicts')}</strong>
              <ul>
                {conflicts.map((c, i) => (
                  <li key={i}>
                    {c.allDay ? t('quickEvent.allDay') : `${formatHHmm(c.start)}–${formatHHmm(c.end)}`}
                    {' · '}{c.title}
                    {c.location ? ` · ${c.location}` : ''}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {warnMsg && <div className="quick-event-warn">{warnMsg}</div>}
          {errorMsg && <div className="quick-event-error">{errorMsg}</div>}
        </div>
        <footer className="quick-event-footer">
          <div className="quick-event-target-hint">
            {t('quickEvent.targetFolder')}: <code>{transport.defaultDestinationFolder || '(Vault-Root)'}</code>
          </div>
          <div className="quick-event-actions">
            <button className="btn-secondary" onClick={handleClose} disabled={submitting}>{t('quickEvent.cancel')}</button>
            <button className="btn-primary" onClick={handleSubmit} disabled={submitting || !title.trim()}>
              {submitting ? t('quickEvent.creating') : t('quickEvent.create')}
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
