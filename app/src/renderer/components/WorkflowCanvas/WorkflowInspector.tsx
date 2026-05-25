import { useWorkflowStore } from '../../stores/workflowStore'
import { useUIStore } from '../../stores/uiStore'
import { getActionById } from '../../../shared/workflow/registry'
import type { WorkflowConfigField } from '../../../shared/workflow/types'

export function WorkflowInspector() {
  const selectedNodeId = useWorkflowStore(s => s.selectedNodeId)
  const node = useWorkflowStore(s => s.workflow.nodes.find(n => n.id === s.selectedNodeId) || null)
  // Stabile Referenz selektieren, dann im Render filtern (kein neues Array im Selektor).
  const allIssues = useWorkflowStore(s => s.validation.issues)
  const issues = allIssues.filter(i => i.nodeId === selectedNodeId)
  const updateNodeConfig = useWorkflowStore(s => s.updateNodeConfig)
  const removeNode = useWorkflowStore(s => s.removeNode)
  const globalModel = useUIStore(s => s.ollama.selectedModel)

  if (!selectedNodeId || !node) {
    return (
      <div className="wf-inspector wf-inspector--empty">
        <p>Wähle einen Baustein, um ihn zu konfigurieren.</p>
      </div>
    )
  }

  const action = getActionById(node.actionId)
  if (!action) return <div className="wf-inspector">Unbekannte Action.</div>

  const renderField = (field: WorkflowConfigField) => {
    const value = (node.config[field.key] ?? field.default ?? '') as string | number | boolean
    const set = (v: unknown) => updateNodeConfig(node.id, { [field.key]: v })

    switch (field.type) {
      case 'textarea':
        return (
          <textarea
            className="wf-input"
            rows={4}
            value={String(value)}
            placeholder={field.placeholder}
            onChange={e => set(e.target.value)}
          />
        )
      case 'model':
        return (
          <input
            className="wf-input"
            type="text"
            value={String(value)}
            placeholder={globalModel ? `leer = ${globalModel}` : 'globales Modell'}
            onChange={e => set(e.target.value)}
          />
        )
      case 'select':
        return (
          <select className="wf-input" value={String(value)} onChange={e => set(e.target.value)}>
            <option value="">—</option>
            {field.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        )
      case 'boolean':
        return <input type="checkbox" checked={Boolean(value)} onChange={e => set(e.target.checked)} />
      case 'number':
        return <input className="wf-input" type="number" value={Number(value) || 0} onChange={e => set(Number(e.target.value))} />
      default:
        return (
          <input
            className="wf-input"
            type="text"
            value={String(value)}
            placeholder={field.placeholder}
            onChange={e => set(e.target.value)}
          />
        )
    }
  }

  return (
    <div className="wf-inspector">
      <div className="wf-inspector__title">{action.label}</div>
      {action.description && <p className="wf-inspector__desc">{action.description}</p>}

      {action.hardLockModule && (
        <p className="wf-inspector__note">
          ⚠️ Verarbeitet untrusted Inhalt mit einem LLM — der Runner prüft die Modell-Freigabe
          (Modul <code>{action.hardLockModule}</code>) und blockiert rot-gelockte Modelle.
        </p>
      )}

      {action.config?.length ? (
        <div className="wf-inspector__fields">
          {action.config.map(field => (
            <label className="wf-field" key={field.key}>
              <span className="wf-field__label">{field.label}</span>
              {renderField(field)}
            </label>
          ))}
        </div>
      ) : (
        <p className="wf-inspector__desc">Keine Konfiguration nötig.</p>
      )}

      {issues.length > 0 && (
        <ul className="wf-inspector__issues">
          {issues.map((i, idx) => (
            <li key={idx} className={`wf-issue wf-issue--${i.level}`}>{i.message}</li>
          ))}
        </ul>
      )}

      <button className="wf-btn wf-btn--danger" onClick={() => removeNode(node.id)}>
        Baustein entfernen
      </button>
    </div>
  )
}
