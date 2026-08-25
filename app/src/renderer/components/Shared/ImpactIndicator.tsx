// Effizienzindex in der Statusleiste.
//
// Sichtbar in jedem Tab, ohne Klick, ohne Umweg. Die Zahl selbst bleibt zurückhaltend:
// Sie erscheint nur, wenn es an diesem Tag etwas zu berichten gibt — eine Null wäre eine
// Aussage über einen Tag, an dem noch gar nichts passiert ist.
//
// Kein Abfragetakt: Der Main-Prozess meldet Änderungen am Protokoll (`activity-changed`),
// weil sie ein paar Mal am Tag passieren und nicht ein paar Mal pro Minute.

import { useCallback, useEffect, useState } from 'react'
import { useNotesStore } from '../../stores/notesStore'
import { useUIStore } from '../../stores/uiStore'
import { useTranslation } from '../../utils/translations'
import { acceptedLine, emailTasksLine, tasksLine, savedBasisLine, savedContextLine, unmeasuredLine, unpricedLine } from '../../utils/impactText'
import {
  estimateSavedMinutes,
  impactBadge,
  localDayRange,
  type ActivitySummary
} from '../../../shared/activityLog'

/** Millisekunden bis zur nächsten lokalen Mitternacht — danach ist „heute" ein anderer Tag. */
function msUntilNextMidnight(): number {
  const next = new Date()
  next.setHours(24, 0, 0, 0)
  return Math.max(1000, next.getTime() - Date.now())
}

export function ImpactIndicator({ onOpenCard }: { onOpenCard: () => void }) {
  const { t } = useTranslation()
  const vaultPath = useNotesStore(s => s.vaultPath)
  const referenceMinutes = useUIStore(s => s.impact.referenceMinutes)
  const showInStatusBar = useUIStore(s => s.impact.showInStatusBar)
  const [summary, setSummary] = useState<ActivitySummary | null>(null)

  const load = useCallback(async () => {
    if (!vaultPath) {
      setSummary(null)
      return
    }
    try {
      const res = await window.electronAPI.activitySummary(vaultPath, localDayRange(Date.now()))
      setSummary(res.success && res.summary ? res.summary : null)
    } catch {
      // Eine nicht lesbare Bilanz ist kein Fehler, den die Statusleiste melden müsste.
      setSummary(null)
    }
  }, [vaultPath])

  useEffect(() => {
    void load()
    const off = window.electronAPI.onActivityChanged(payload => {
      // Nur der eigene Vault: Ein zweites Fenster auf einem anderen Vault soll diese
      // Anzeige nicht umschreiben.
      if (!payload?.vaultPath || payload.vaultPath === vaultPath) void load()
    })
    const onFocus = () => void load()
    window.addEventListener('focus', onFocus)
    // Tageswechsel: Um Mitternacht zeigt „heute" sonst bis zum nächsten Ereignis den
    // Vortag. Der Timer plant sich SELBST neu — ein einzelner Timeout hätte nur die
    // erste Mitternacht erwischt, und die App läuft bei vielen Nutzern tagelang durch.
    let midnight: ReturnType<typeof setTimeout>
    const scheduleMidnight = (): void => {
      midnight = setTimeout(() => {
        void load()
        scheduleMidnight()
      }, msUntilNextMidnight())
    }
    scheduleMidnight()
    return () => {
      off?.()
      window.removeEventListener('focus', onFocus)
      clearTimeout(midnight)
    }
  }, [load, vaultPath])

  if (!showInStatusBar || !summary) return null

  const saved = estimateSavedMinutes(summary, referenceMinutes)
  const badge = impactBadge(summary, saved)
  if (badge.kind === 'none') return null

  const label =
    badge.kind === 'minutes' ? t('statusbar.impact.minutes', { minutes: badge.minutes })
    : badge.kind === 'accepted' ? t('statusbar.impact.accepted', { count: badge.count })
    : t('statusbar.impact.tasks', { count: badge.count })

  const lines = [
    t('statusbar.impact.title'),
    summary.acceptedTotal > 0 ? acceptedLine(summary, t) : null,
    summary.tasksCreated > 0 ? tasksLine(summary, t) : null,
    summary.emailTasks > 0 ? emailTasksLine(summary, t) : null,
    ...saved.lines.flatMap(line => [savedBasisLine(line, t), savedContextLine(line, t)]),
    // Ohne Referenzzeit ist die Zahl nicht klein, sondern nicht vorhanden — das gehört
    // auch in die Kurzfassung, sonst wirkt die Statusleiste wie ein Urteil.
    saved.unpricedTypes.length > 0 ? unpricedLine(saved.unpricedTypes, t) : null,
    saved.unmeasuredRuns > 0 ? unmeasuredLine(saved.unmeasuredRuns, t) : null,
    t('statusbar.impact.openCard')
  ].filter(Boolean)

  return (
    <>
      <span className="status-separator">|</span>
      <button
        type="button"
        className="status-item status-impact"
        title={lines.join('\n')}
        onClick={onOpenCard}
      >
        {label}
      </button>
    </>
  )
}
