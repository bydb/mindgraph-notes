import { Handle, Position, type NodeProps } from 'reactflow'
import type { WorkflowActionDefinition } from '../../../shared/workflow/types'
import { canConnect } from '../../../shared/workflow/validation'
import { useWorkflowStore } from '../../stores/workflowStore'
import { portColor, MODULE_ICONS } from './ui'

export interface WorkflowNodeData {
  action: WorkflowActionDefinition
}

export function WorkflowNodeCard({ id, data, selected }: NodeProps<WorkflowNodeData>) {
  const action = data.action
  const connecting = useWorkflowStore(s => s.connecting)
  // WICHTIG: stabile Referenz selektieren, NICHT im Selektor filtern
  // (filter() liefert jedes Mal ein neues Array → Endlos-Render-Loop).
  const allIssues = useWorkflowStore(s => s.validation.issues)
  const hasError = allIssues.some(i => i.nodeId === id && i.level === 'error')

  // Während eines Verbindungs-Drags: kompatible Eingänge leuchten, der Rest dimmt.
  const inClass = (kind: WorkflowActionDefinition['inputs'][number]['kind']) => {
    if (!connecting) return 'wf-port'
    if (connecting.nodeId === id) return 'wf-port wf-port--dim'
    return canConnect(connecting.kind, kind) ? 'wf-port wf-port--compatible' : 'wf-port wf-port--dim'
  }
  const outClass = () => (connecting ? 'wf-port wf-port--dim' : 'wf-port')

  return (
    <div className={`wf-node ${selected ? 'wf-node--selected' : ''} ${hasError ? 'wf-node--error' : ''}`}>
      <div className="wf-node__header">
        <span className="wf-node__icon">{MODULE_ICONS[action.moduleId]}</span>
        <span className="wf-node__label">{action.label}</span>
        <span className="wf-node__badges">
          {hasError && <span title="Konfiguration unvollständig">⚠️</span>}
          {action.isWrite && <span title="Schreibende Aktion — braucht Freigabe">🔒</span>}
          {action.privacy?.localOnly && <span title="Läuft lokal (Ollama)">🧠</span>}
          {action.privacy?.containsPersonalData && <span title="Personenbezogene Daten">🛡️</span>}
          {action.privacy?.sendsExternalRequest && <span title="Externe API">☁️</span>}
          {action.isTerminal && <span title="Endpunkt: Mensch übernimmt">🏁</span>}
        </span>
      </div>

      <div className="wf-node__ports">
        <div className="wf-node__col wf-node__col--in">
          {action.inputs.map(port => (
            <div className="wf-port-row wf-port-row--in" key={`in-${port.id}`}>
              <Handle
                id={port.id}
                type="target"
                position={Position.Left}
                className={inClass(port.kind)}
                style={{ position: 'relative', background: portColor(port.kind) }}
              />
              <span className="wf-port-label" title={port.kind}>
                {port.label}{port.required ? ' *' : ''}
              </span>
            </div>
          ))}
        </div>

        <div className="wf-node__col wf-node__col--out">
          {action.outputs.map(port => (
            <div className="wf-port-row wf-port-row--out" key={`out-${port.id}`}>
              <span className="wf-port-label" title={port.kind}>{port.label}</span>
              <Handle
                id={port.id}
                type="source"
                position={Position.Right}
                className={outClass()}
                style={{ position: 'relative', background: portColor(port.kind) }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
