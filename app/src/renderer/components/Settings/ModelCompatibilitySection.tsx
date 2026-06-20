import { useMemo, useState } from 'react'
import {
  MODEL_COMPATIBILITY,
  MODULES,
  RECOMMENDED_DEFAULTS,
  getModelVerdict,
  greenModelsForModule,
  isCloudModel,
  isHumanFavorite,
  isMlxModel,
  modelMarkers,
  type ModuleId,
  type Verdict
} from '../../../shared/modelCompatibility'
import { useUIStore } from '../../stores/uiStore'
import { useTranslation, type TranslationKey } from '../../utils/translations'
import { ModelLogo } from '../Shared/ModelLogo'
import { ModelMarkers, AppleLogo, StarIcon } from '../Shared/ModelMarkers'
import { ModelRamWarning } from '../Shared/ModelRamWarning'

interface Props {
  availableModels: Array<{ name: string; size: number }>
}

export const VERDICT_ICON: Record<Verdict, string> = {
  green: '✅',
  yellow: '⚠️',
  red: '🔴',
  untested: '❔'
}

export const VERDICT_COLOR: Record<Verdict, string> = {
  green: 'var(--success, #16a34a)',
  yellow: 'var(--warning, #d97706)',
  red: 'var(--danger, #dc2626)',
  untested: 'var(--text-secondary, #6b7280)'
}

// Renders a single module row: status badge, recommended hint, override picker, details toggle.
function ModuleRow({
  moduleId,
  activeModel,
  availableModels,
  override,
  onChangeOverride,
  isExpanded,
  onToggleExpanded,
  tabOverride,
  t
}: {
  moduleId: ModuleId
  activeModel: string
  availableModels: Array<{ name: string; size: number }>
  override: string
  onChangeOverride: (value: string) => void
  isExpanded: boolean
  onToggleExpanded: () => void
  tabOverride?: { model: string; tabLabel: string }
  t: (key: TranslationKey) => string
}) {
  // Tab-Felder (z.B. email.analysisModel) haben höchste Prio in der Chain — die Sektion muss
  // den effektiven Wert reflektieren, sonst zeigt sie grünes Licht, während ein verstecktes
  // Tab-Feld längst was anderes durchschickt (siehe v0.6.41 fobizz-Vorfall).
  const effectiveModel = (tabOverride?.model) || override || activeModel
  const verdict = effectiveModel ? getModelVerdict(effectiveModel, moduleId) : { verdict: 'untested' as Verdict, reasons: [] }
  const moduleDescriptor = MODULES.find(m => m.id === moduleId)!
  const isHardLocked = moduleDescriptor.damageRelevant && verdict.verdict === 'red'
  const recommended = RECOMMENDED_DEFAULTS[moduleId]
  const greenModels = greenModelsForModule(moduleId)

  const moduleLabel = t(`settings.integrations.compatibility.module.${moduleId}` as TranslationKey)
  const verdictLabel = t(`settings.integrations.compatibility.verdict.${verdict.verdict}` as TranslationKey)

  return (
    <div
      className="model-compat-row"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        padding: '12px',
        marginBottom: '8px',
        background: 'var(--bg-secondary, rgba(0,0,0,0.02))',
        border: `1px solid ${isHardLocked ? VERDICT_COLOR.red : 'var(--border-color)'}`,
        borderRadius: '6px'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: '1 1 240px', minWidth: 0 }}>
          <span style={{ fontSize: '16px', lineHeight: 1 }}>{VERDICT_ICON[verdict.verdict]}</span>
          <span style={{ fontWeight: 500 }}>{moduleLabel}</span>
          <span style={{ fontSize: '12px', color: VERDICT_COLOR[verdict.verdict] }}>{verdictLabel}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: '1 1 auto', justifyContent: 'flex-end' }}>
          {effectiveModel && <ModelLogo model={effectiveModel} size={16} />}
          <select
            value={override}
            onChange={e => onChangeOverride(e.target.value)}
            style={{ maxWidth: '220px' }}
          >
            <option value="">{t('settings.integrations.compatibility.useActiveModel')}</option>
            {availableModels.map(m => {
              const v = getModelVerdict(m.name, moduleId)
              return (
                <option key={m.name} value={m.name}>
                  {VERDICT_ICON[v.verdict]} {modelMarkers(m.name)}{m.name}
                </option>
              )
            })}
          </select>
          <button
            type="button"
            className="settings-refresh"
            onClick={onToggleExpanded}
            style={{ fontSize: '12px' }}
          >
            {isExpanded ? t('settings.integrations.compatibility.hideDetails') : t('settings.integrations.compatibility.showDetails')}
          </button>
        </div>
      </div>

      {recommended && override !== recommended && effectiveModel !== recommended && (
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
          {t('settings.integrations.compatibility.recommended')}: <strong>{recommended}</strong>
        </div>
      )}

      {effectiveModel && <ModelRamWarning model={effectiveModel} />}

      {tabOverride && tabOverride.model && (
        <div
          style={{
            padding: '8px 10px',
            background: 'rgba(217, 119, 6, 0.08)',
            border: `1px solid ${VERDICT_COLOR.yellow}`,
            borderRadius: '4px',
            fontSize: '12px',
            color: 'var(--text-primary)'
          }}
        >
          <strong>{t('settings.integrations.compatibility.tabOverride')}</strong>{' '}
          {t('settings.integrations.compatibility.tabOverrideHint')
            .replace('{model}', tabOverride.model)
            .replace('{tab}', tabOverride.tabLabel)}
        </div>
      )}

      {isHardLocked && (
        <div
          style={{
            padding: '8px 10px',
            background: 'rgba(220, 38, 38, 0.08)',
            border: `1px solid ${VERDICT_COLOR.red}`,
            borderRadius: '4px',
            fontSize: '13px',
            color: VERDICT_COLOR.red
          }}
        >
          <strong>{t('settings.integrations.compatibility.hardLock')}</strong> — {t('settings.integrations.compatibility.hardLockReason')}
          {greenModels.length > 0 && (
            <div style={{ marginTop: '4px' }}>
              {greenModels.map(name => (
                <code
                  key={name}
                  style={{
                    display: 'inline-block',
                    marginRight: '6px',
                    padding: '1px 6px',
                    background: 'var(--bg-primary, white)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '3px',
                    fontSize: '11px'
                  }}
                >
                  {name}
                </code>
              ))}
            </div>
          )}
        </div>
      )}

      {verdict.reasons.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '12px', color: 'var(--text-secondary)' }}>
          {verdict.reasons.map((reason, i) => (
            <li key={i}>{reason}</li>
          ))}
        </ul>
      )}

      {isExpanded && (
        <DetailDrawer model={effectiveModel} moduleId={moduleId} t={t} />
      )}
    </div>
  )
}

function DetailDrawer({ model, moduleId, t }: { model: string; moduleId: ModuleId; t: (k: TranslationKey) => string }) {
  if (!model) return null
  const v = getModelVerdict(model, moduleId)
  if (v.verdict === 'untested') {
    return (
      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', padding: '8px', background: 'var(--bg-primary)', borderRadius: '4px' }}>
        {t('settings.integrations.compatibility.untestedHint')}
      </div>
    )
  }
  const m = v.metrics || {}
  type Row = [TranslationKey, string]
  const rows: Row[] = []
  if (typeof m.formatCompliancePct === 'number')      rows.push(['settings.integrations.compatibility.metric.formatCompliance', `${m.formatCompliancePct} %`])
  if (typeof m.criticalTitlesLinkedPct === 'number')  rows.push(['settings.integrations.compatibility.metric.criticalTitles',    `${m.criticalTitlesLinkedPct} %`])
  if (typeof m.rule5CompliancePct === 'number')       rows.push(['settings.integrations.compatibility.metric.rule5Compliance',   `${m.rule5CompliancePct} %`])
  if (typeof m.recallPct === 'number')                rows.push(['settings.integrations.compatibility.metric.recall',            `${m.recallPct} %`])
  if (typeof m.directionAccuracyPct === 'number')     rows.push(['settings.integrations.compatibility.metric.direction',         `${m.directionAccuracyPct} %`])
  if (typeof m.latencySecondsPerRun === 'number')     rows.push(['settings.integrations.compatibility.metric.latency',           `~${m.latencySecondsPerRun} s`])
  if (typeof m.ramGigabytes === 'number')             rows.push(['settings.integrations.compatibility.metric.ram',               `~${m.ramGigabytes} GB`])
  if (m.wikilinkHallucinations) {
    rows.push([
      'settings.integrations.compatibility.metric.hallucinations',
      t(`settings.integrations.compatibility.hallucinations.${m.wikilinkHallucinations}` as TranslationKey)
    ])
  }

  return (
    <div style={{ fontSize: '12px', padding: '8px 10px', background: 'var(--bg-primary)', borderRadius: '4px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 500, marginBottom: '6px' }}>
        <ModelLogo model={model} size={16} />
        <ModelMarkers model={model} />
        <span>{model}</span>
      </div>
      {isMlxModel(model) && (
        <div style={{ marginBottom: '6px', color: 'var(--text-secondary)', fontSize: '11px' }}>
          {t('settings.integrations.ollama.mlxHint')}
        </div>
      )}
      {isHumanFavorite(model) && (
        <div style={{ marginBottom: '6px', color: 'var(--text-secondary)', fontSize: '11px' }}>
          {t('settings.integrations.ollama.humanFavoriteHint')}
        </div>
      )}
      {rows.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            {rows.map(([key, value]) => (
              <tr key={key}>
                <td style={{ padding: '2px 8px 2px 0', color: 'var(--text-secondary)' }}>{t(key)}</td>
                <td style={{ padding: '2px 0', fontFamily: 'var(--font-mono, monospace)' }}>{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {v.notes && (
        <div style={{ marginTop: '6px', color: 'var(--text-secondary)', fontStyle: 'italic' }}>{v.notes}</div>
      )}
    </div>
  )
}

// Kompakte Inline-Anzeige direkt unter dem Modell-Picker:
// zeigt für jedes Modul mit Daten den Verdict des aktiven Modells (ohne Override).
export function ActiveModelStatusBadge({ model }: { model: string }) {
  const { t } = useTranslation()
  if (!model) return null

  const visibleModules: ModuleId[] = MODULES
    .filter(m => Object.keys(MODEL_COMPATIBILITY.modules[m.id] || {}).length > 0)
    .map(m => m.id)

  if (visibleModules.length === 0) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px' }}>
      {isCloudModel(model) && (
        <div
          style={{
            padding: '6px 10px',
            background: 'rgba(217, 119, 6, 0.08)',
            border: `1px solid ${VERDICT_COLOR.yellow}`,
            borderRadius: '4px',
            fontSize: '12px',
            color: 'var(--text-primary)'
          }}
        >
          <strong>{t('settings.integrations.ollama.cloudBadge')}</strong> — {t('settings.integrations.ollama.cloudModelWarning')}
        </div>
      )}
      {isMlxModel(model) && (
        <div
          style={{
            padding: '6px 10px',
            background: 'rgba(0, 0, 0, 0.03)',
            border: '1px solid var(--border-color)',
            borderRadius: '4px',
            fontSize: '12px',
            color: 'var(--text-primary)'
          }}
        >
          <strong style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}><AppleLogo size={13} /> {t('settings.integrations.ollama.mlxBadge')}</strong> — <AppleLogo size={12} /> {t('settings.integrations.ollama.mlxHint')}
        </div>
      )}
      {isHumanFavorite(model) && (
        <div
          style={{
            padding: '6px 10px',
            background: 'rgba(0, 0, 0, 0.03)',
            border: '1px solid var(--border-color)',
            borderRadius: '4px',
            fontSize: '12px',
            color: 'var(--text-primary)'
          }}
        >
          <strong style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}><StarIcon size={13} /> {t('settings.integrations.ollama.humanFavoriteBadge')}</strong> — <StarIcon size={12} /> {t('settings.integrations.ollama.humanFavoriteHint')}
        </div>
      )}
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '8px',
        fontSize: '12px',
        color: 'var(--text-secondary, #6b7280)'
      }}
    >
      {visibleModules.map(moduleId => {
        const v = getModelVerdict(model, moduleId)
        const label = t(`settings.integrations.compatibility.module.${moduleId}` as TranslationKey)
        return (
          <span
            key={moduleId}
            title={v.reasons.join(' · ') || t(`settings.integrations.compatibility.verdict.${v.verdict}` as TranslationKey)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '2px 8px',
              borderRadius: '10px',
              background: 'var(--bg-secondary, rgba(0,0,0,0.04))',
              border: `1px solid ${VERDICT_COLOR[v.verdict]}`,
              color: VERDICT_COLOR[v.verdict]
            }}
          >
            {VERDICT_ICON[v.verdict]} {label}
          </span>
        )
      })}
    </div>
    </div>
  )
}

export function ModelCompatibilitySection({ availableModels }: Props) {
  const { t } = useTranslation()
  const ollama = useUIStore(state => state.ollama)
  const setOllama = useUIStore(state => state.setOllama)
  const emailAnalysisModel = useUIStore(state => state.email.analysisModel)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  // Mapping: welches Tab-Feld überstimmt welches Modul?
  // Tab-Felder haben höchste Prio (siehe architecture-model-compatibility). Hier nur lesen, nicht ändern.
  const getTabOverride = (moduleId: ModuleId): { model: string; tabLabel: string } | undefined => {
    if (moduleId === 'task-extraction' && emailAnalysisModel) {
      return { model: emailAnalysisModel, tabLabel: t('settings.email.title') }
    }
    return undefined
  }

  const visibleModules: ModuleId[] = useMemo(() => {
    // Module ohne Daten in der Matrix nicht in der UI zeigen — werden später ergänzt.
    return MODULES
      .filter(m => Object.keys(MODEL_COMPATIBILITY.modules[m.id] || {}).length > 0)
      .map(m => m.id)
  }, [])

  const setOverride = (moduleId: ModuleId, value: string) => {
    setOllama({
      moduleModelOverrides: { ...ollama.moduleModelOverrides, [moduleId]: value }
    })
  }

  return (
    <div className="settings-subsection" style={{ marginTop: '24px' }}>
      <h4 style={{ marginBottom: '4px' }}>{t('settings.integrations.compatibility.title')}</h4>
      <p className="settings-hint" style={{ marginBottom: '12px' }}>
        {t('settings.integrations.compatibility.description')}
      </p>

      {visibleModules.map(moduleId => (
        <ModuleRow
          key={moduleId}
          moduleId={moduleId}
          activeModel={ollama.selectedModel}
          availableModels={availableModels}
          override={ollama.moduleModelOverrides?.[moduleId] || ''}
          onChangeOverride={value => setOverride(moduleId, value)}
          isExpanded={!!expanded[moduleId]}
          onToggleExpanded={() => setExpanded(prev => ({ ...prev, [moduleId]: !prev[moduleId] }))}
          tabOverride={getTabOverride(moduleId)}
          t={t}
        />
      ))}

      <p className="settings-hint" style={{ marginTop: '8px', fontSize: '11px' }}>
        {t('settings.integrations.compatibility.dataVersion')}: <code>{MODEL_COMPATIBILITY.version}</code>
      </p>
    </div>
  )
}
