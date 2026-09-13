import { useTranslation } from '../../utils/translations'

export function ShellAccessToggle({ enabled, disabled, onChange }: {
  enabled: boolean
  disabled: boolean
  onChange: (enabled: boolean) => void
}) {
  const { t } = useTranslation()
  return (
    <button type="button" className={`ai-bar-context-btn ${enabled ? 'active' : ''}`}
      disabled={disabled} aria-pressed={enabled} title={t('aiBar.shell.hint')}
      onClick={() => onChange(!enabled)}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <rect x="2" y="3" width="20" height="18" rx="2" />
        <path d="m6 8 4 4-4 4m7 0h5" />
      </svg>
      {t('aiBar.shell.label')}
    </button>
  )
}
