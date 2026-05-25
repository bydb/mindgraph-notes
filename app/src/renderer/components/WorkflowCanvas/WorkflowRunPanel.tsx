import { useWorkflowStore } from '../../stores/workflowStore'
import type { WorkflowStepStatus } from '../../../shared/workflow/model'

// Text-Ausgaben lesbar machen (Arrays → Zeilen, Strings direkt; Objekte wie
// Analyse/Projekt/json bleiben weg, da als Rohtext wenig hilfreich).
function outputText(val: unknown): string {
  if (Array.isArray(val)) return val.map(v => (typeof v === 'string' ? v : JSON.stringify(v))).join('\n')
  if (typeof val === 'string') return val.trim()
  return ''
}

const STEP_ICON: Record<WorkflowStepStatus, string> = {
  pending: '○',
  running: '◐',
  success: '✓',
  failed: '✗',
  skipped: '–'
}

export function WorkflowRunPanel() {
  const run = useWorkflowStore(s => s.run)
  const running = useWorkflowStore(s => s.running)
  const clearRun = useWorkflowStore(s => s.clearRun)

  if (running) {
    return <div className="wf-runpanel"><div className="wf-runpanel__head">Läuft …</div></div>
  }
  if (!run) {
    return (
      <div className="wf-runpanel wf-runpanel--empty">
        <span>„Simulieren" zeigt den Trockenlauf, „Ausführen" startet den echten Lauf.</span>
      </div>
    )
  }

  return (
    <div className="wf-runpanel">
      <div className="wf-runpanel__head">
        <span className={`wf-run-status wf-run-status--${run.status}`}>
          {run.mode === 'simulate' ? 'Simulation' : 'Lauf'} · {run.status}
        </span>
        <button className="wf-btn wf-btn--ghost" onClick={clearRun}>schließen</button>
      </div>

      {run.error && <div className="wf-run-error">{run.error}</div>}

      <ol className="wf-run-steps">
        {run.steps.map((step, idx) => (
          <li key={step.nodeId + idx} className={`wf-run-step wf-run-step--${step.status}`}>
            <span className="wf-run-step__icon">{STEP_ICON[step.status]}</span>
            <span className="wf-run-step__label">{idx + 1}. {step.label}</span>
            <span className="wf-run-step__log">{step.log.join(' · ')}</span>
            {step.error && <span className="wf-run-step__err">{step.error}</span>}
            {step.outputs && Object.entries(step.outputs).map(([port, val]) => {
              const txt = outputText(val)
              return txt ? <pre key={port} className="wf-run-step__out">{txt}</pre> : null
            })}
          </li>
        ))}
      </ol>

      {run.handoff && (
        <div className="wf-run-handoff">
          → Hand-off ({run.handoff.kind === 'compose' ? 'Antwort ins Compose-Fenster' : run.handoff.kind === 'task' ? 'Aufgabe „Entwurf prüfen"' : 'Notiz'}): der Mensch übernimmt.
        </div>
      )}
    </div>
  )
}
