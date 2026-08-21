// Prüfkarte für einen Termin, den die App aus einer E-Mail gelesen hat.
//
// Warum überhaupt eine Karte und kein Ein-Klick-Eintrag: Das Modell liest Datum,
// Uhrzeit und Dauer aus Fließtext. Das geht meistens gut und gelegentlich daneben
// — und ein falscher Termin im Kalender ist schlimmer als gar keiner, weil er
// unbemerkt bleibt. Jedes Feld ist deshalb änderbar, bevor irgendetwas passiert.
//
// Zwei Wege hinaus, weil keiner allein reicht: Direkt eintragen geht nur unter
// macOS und braucht eine Systemfreigabe; die .ics-Datei nimmt jeder Kalender auf
// jedem System an.

import React, { useState } from 'react'
import { useTranslation } from '../../utils/translations'
import { IconCalendar, IconClose } from '../Shared/Icons'
import { DEFAULT_REMINDER_MINUTES, normalizeDraft, type CalendarEventDraft } from '../../../shared/calendarEvent'
import './EventDraftCard.css'

// Der Weg direkt in den Kalender laeuft ueber EventKit und gibt es nur unter
// macOS. Auf anderen Systemen den Schalter gar nicht erst zeigen, statt ihn mit
// „macOS only" antworten zu lassen — die .ics-Datei funktioniert dort ohnehin.
const CAN_ADD_DIRECTLY = window.electronAPI.platform === 'darwin'

interface Props {
  draft: CalendarEventDraft
  /** Beanstandungen aus der Prüfung — angenommene Werte, verworfene Felder. */
  problems?: Array<{ field: string; message: string }>
  onClose: () => void
}

/** ISO → Wert für <input type="datetime-local"> in LOKALER Zeit. */
function toLocalInput(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export const EventDraftCard: React.FC<Props> = ({ draft: initial, problems = [], onClose }) => {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<CalendarEventDraft>(initial)
  const [busy, setBusy] = useState<'calendar' | 'ics' | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [editedFields, setEditedFields] = useState<Set<string>>(() => new Set())

  const set = <K extends keyof CalendarEventDraft>(key: K, value: CalendarEventDraft[K]) => {
    setDraft(d => ({ ...d, [key]: value }))
    setEditedFields(fields => new Set(fields).add(key))
    setMessage('')
    setError('')
  }

  // Die vom Modell gemeldeten Annahmen bleiben sichtbar, bis der Nutzer genau
  // dieses Feld anfasst. Zusaetzlich pruefen wir den aktuellen Formularstand, damit
  // eine nachtraeglich geloeschte Uhrzeit oder ungueltige Dauer nicht gespeichert wird.
  const { draft: cleanDraft, problems: liveProblems } = normalizeDraft(draft)
  const displayedProblems = [...problems.filter(problem => !editedFields.has(problem.field)), ...liveProblems]
    .filter((problem, index, all) => all.findIndex(other => other.field === problem.field && other.message === problem.message) === index)

  const addToCalendar = async () => {
    setBusy('calendar'); setMessage(''); setError('')
    try {
      const r = await window.electronAPI.calendarCreateEvent({
        title: cleanDraft.title,
        startIso: cleanDraft.startIso,
        durationMinutes: cleanDraft.durationMinutes,
        notes: cleanDraft.notes,
        location: cleanDraft.location,
        url: cleanDraft.url,
        reminderMinutes: DEFAULT_REMINDER_MINUTES,
      })
      if (r.success) setMessage(t('inbox.event.addedToCalendar'))
      else setError(r.error || t('inbox.event.failed'))
    } catch (e) {
      setError(e instanceof Error ? e.message : t('inbox.event.failed'))
    } finally {
      setBusy(null)
    }
  }

  const saveIcs = async () => {
    setBusy('ics'); setMessage(''); setError('')
    try {
      const r = await window.electronAPI.calendarSaveIcs(cleanDraft, DEFAULT_REMINDER_MINUTES)
      if (r.success) setMessage(t('inbox.event.icsSaved'))
      else if (!r.canceled) setError(r.error || t('inbox.event.failed'))
    } catch (e) {
      setError(e instanceof Error ? e.message : t('inbox.event.failed'))
    } finally {
      setBusy(null)
    }
  }

  const startValue = toLocalInput(draft.startIso)
  const canSubmit = liveProblems.length === 0 && !busy

  return (
    <div className="event-draft">
      <div className="event-draft-head">
        <span className="event-draft-head-icon" aria-hidden="true"><IconCalendar size={15} /></span>
        <span className="event-draft-title">{t('inbox.event.cardTitle')}</span>
        <button
          className="event-draft-close"
          onClick={onClose}
          aria-label={t('common.close')}
          title={t('common.close')}
        >
          <IconClose size={14} />
        </button>
      </div>

      {displayedProblems.length > 0 && (
        <ul className="event-draft-problems">
          {displayedProblems.map((p, i) => (
            <li key={`${p.field}-${i}`}>
              <span className="panel-dot panel-dot--warning" aria-hidden="true" />
              <span>{p.message}</span>
            </li>
          ))}
        </ul>
      )}

      <label className="event-draft-field">
        <span>{t('inbox.event.fieldTitle')}</span>
        <input value={draft.title} onChange={e => set('title', e.target.value)} />
      </label>

      <div className="event-draft-row">
        <label className="event-draft-field">
          <span>{t('inbox.event.fieldStart')}</span>
          <input
            type="datetime-local"
            value={startValue}
            onChange={e => {
              if (!e.target.value) {
                set('startIso', '')
                return
              }
              const d = new Date(e.target.value)
              if (!Number.isNaN(d.getTime())) set('startIso', d.toISOString())
            }}
          />
        </label>
        <label className="event-draft-field event-draft-field--narrow">
          <span>{t('inbox.event.fieldDuration')}</span>
          <input
            type="number"
            min={5}
            max={720}
            step={5}
            value={draft.durationMinutes}
            onChange={e => set('durationMinutes', Number(e.target.value))}
          />
        </label>
      </div>

      <label className="event-draft-field">
        <span>{t('inbox.event.fieldLocation')}</span>
        <input value={draft.location || ''} onChange={e => set('location', e.target.value)} />
      </label>

      <label className="event-draft-field">
        <span>{t('inbox.event.fieldUrl')}</span>
        <input value={draft.url || ''} onChange={e => set('url', e.target.value)} placeholder="https://…" />
      </label>

      <label className="event-draft-field">
        <span>{t('inbox.event.fieldNotes')}</span>
        <textarea rows={3} value={draft.notes || ''} onChange={e => set('notes', e.target.value)} />
      </label>

      <p className="event-draft-reminders">{t('inbox.event.reminderHint')}</p>

      <div className="event-draft-actions">
        {CAN_ADD_DIRECTLY && (
          <button className="event-draft-btn event-draft-btn--primary" onClick={addToCalendar} disabled={!canSubmit}>
            {busy === 'calendar' ? t('inbox.event.working') : t('inbox.event.addToCalendar')}
          </button>
        )}
        <button className={`event-draft-btn${CAN_ADD_DIRECTLY ? '' : ' event-draft-btn--primary'}`} onClick={saveIcs} disabled={!canSubmit}>
          {busy === 'ics' ? t('inbox.event.working') : t('inbox.event.saveIcs')}
        </button>
      </div>

      {message && (
        <div className="event-draft-ok" role="status">
          <span className="panel-dot panel-dot--success" aria-hidden="true" />
          <span>{message}</span>
        </div>
      )}
      {error && (
        <div className="event-draft-err" role="alert">
          <span className="panel-dot panel-dot--danger" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}
    </div>
  )
}
