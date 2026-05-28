import { actionsByModule, WORKFLOW_MODULE_LABELS } from '../../../shared/workflow/registry'
import { MODULE_FEATURE_GATE, type WorkflowModuleId } from '../../../shared/workflow/types'
import type { VaultFeatures } from '../../../shared/types'
import { useVaultSettingsStore } from '../../stores/vaultSettingsStore'
import { ModuleIcon } from './ModuleIcon'

interface Props {
  onAdd: (actionId: string) => void
}

export function WorkflowPalette({ onAdd }: Props) {
  const features = useVaultSettingsStore(s => s.features)
  const grouped = actionsByModule()

  const isModuleActive = (moduleId: WorkflowModuleId): boolean => {
    const gate = MODULE_FEATURE_GATE[moduleId]
    if (!gate) return true // Kern-Modul
    return Boolean(features[gate as keyof VaultFeatures])
  }

  return (
    <div className="wf-palette">
      <div className="wf-palette__title">Bausteine</div>
      {(Object.keys(grouped) as WorkflowModuleId[]).map(moduleId => {
        const actions = grouped[moduleId]
        if (!actions?.length) return null
        const active = isModuleActive(moduleId)
        return (
          <div className={`wf-palette__group ${active ? '' : 'wf-palette__group--disabled'}`} key={moduleId}>
            <div className="wf-palette__group-title">
              <span aria-hidden="true" style={{ display: 'inline-flex', alignItems: 'center' }}>
                <ModuleIcon moduleId={moduleId} size={14} />
              </span>
              <span>{WORKFLOW_MODULE_LABELS[moduleId]}</span>
              {!active && <span className="wf-palette__off" title="Modul in Einstellungen deaktiviert">aus</span>}
            </div>
            {actions.map(action => (
              <button
                key={action.id}
                className="wf-palette__item"
                disabled={!active}
                title={action.description || action.label}
                onClick={() => active && onAdd(action.id)}
              >
                {action.label}
              </button>
            ))}
          </div>
        )
      })}
    </div>
  )
}
