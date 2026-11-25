import { useEffect, useRef, useState } from 'react'
import { stepActivity, type LogoActivity } from '../../../shared/agentLogoStatus'

// Das Logo als Statusanzeige (shared/agentLogoStatus.ts): Mitte = Agent, oben = Auftrag,
// unten links = Unterlagen, unten rechts = Ergebnis.
// - Leerlauf: ein Knoten ist blass, solange seine Angabe fehlt — sonst steht das Zeichen still.
// - Lauf: Nach einem Leseschritt läuft ein Punkt von „Unterlagen“ zur Mitte, nach einem
//   Schreibschritt von der Mitte zu „Ergebnis“; dazwischen (das Modell rechnet) zieht die Mitte
//   langsam einen Ring.
// - Fertig mit Ergebnis: der Ergebnisknoten trägt einen Ring.
// Bewegung nur während eines Laufs und nie bei „Bewegung reduzieren“ — die App soll ruhig bleiben.

const PULSE_MS = 2600

export interface AgentStatusLogoProps {
  size?: number
  phase: 'idle' | 'running' | 'review' | 'error' | string
  /** Protokollschritte des Laufs; ausgewertet wird nur der letzte. */
  steps: Array<{ skill: string }>
  hasTask: boolean
  hasDocs: boolean
  hasTarget: boolean
  hasResult: boolean
  /** Beschriftungen für Screenreader und Tooltip. */
  labels: { idle: string; read: string; write: string; think: string; done: string }
}

export function AgentStatusLogo({ size = 30, phase, steps, hasTask, hasDocs, hasTarget, hasResult, labels }: AgentStatusLogoProps) {
  const running = phase === 'running'
  const [activity, setActivity] = useState<LogoActivity>('think')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const count = steps.length
  const lastSkill = count > 0 ? steps[count - 1].skill : ''

  useEffect(() => {
    if (!running) { setActivity('think'); return }
    const next = stepActivity(lastSkill)
    setActivity(next)
    if (timer.current) clearTimeout(timer.current)
    // Der Schritt selbst ist schnell vorbei — danach rechnet das Modell, bis der nächste kommt.
    if (next !== 'think') timer.current = setTimeout(() => setActivity('think'), PULSE_MS)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [running, count, lastSkill])

  const state = running ? activity : phase === 'review' && hasResult ? 'done' : 'idle'
  const label = state === 'idle' ? labels.idle : labels[state]
  // Im Lauf sind alle Angaben gemacht; blass ist ein Knoten nur vor dem Start.
  const dim = (given: boolean): number => (running || phase === 'review' || given ? 1 : 0.38)

  return (
    <svg className={`agent-status-logo is-${state}`} width={size} height={size} viewBox="0 0 32 32" role="img" aria-label={label}>
      <title>{label}</title>
      <rect width="32" height="32" rx="8" fill="var(--accent-color)" />
      <g stroke="#fff" strokeWidth="1.5" strokeLinecap="round">
        <line x1="16" y1="16" x2="16" y2="7.5" opacity={dim(hasTask)} />
        <line className="agent-status-logo-edge-read" x1="16" y1="16" x2="8" y2="23" opacity={dim(hasDocs)} />
        <line className="agent-status-logo-edge-write" x1="16" y1="16" x2="24" y2="23" opacity={dim(hasTarget)} />
        <line x1="8" y1="23" x2="24" y2="23" opacity={Math.min(dim(hasDocs), dim(hasTarget))} />
      </g>
      {/* Ringe: Mitte beim Rechnen, Ergebnisknoten, wenn etwas bereitliegt */}
      <circle className="agent-status-logo-ring is-think" cx="16" cy="16" r="3" fill="none" stroke="#fff" strokeWidth="0.9" />
      <circle className="agent-status-logo-ring is-done" cx="24" cy="23" r="4.1" fill="none" stroke="#fff" strokeWidth="0.9" />
      <g fill="#fff">
        <circle cx="16" cy="16" r="3" />
        <circle cx="16" cy="7.5" r="2.3" opacity={dim(hasTask)} />
        <circle cx="8" cy="23" r="2.3" opacity={dim(hasDocs)} />
        <circle cx="24" cy="23" r="2.3" opacity={dim(hasTarget)} />
      </g>
      {/* Lichtpunkt entlang der Kante: Unterlagen → Mitte (Lesen), Mitte → Ergebnis (Schreiben) */}
      <circle className="agent-status-logo-dot" r="1.5" fill="var(--accent-color)" stroke="#fff" strokeWidth="0.7" />
    </svg>
  )
}
