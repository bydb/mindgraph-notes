import { useTranslation } from '../../utils/translations'

// Schalter pro Lauf, nicht pro Klick: die eigentliche Freigabe holt der Main-Prozess
// danach über einen nativen Dialog, der die freigegebenen Vorgänge aufzählt. Hier wird
// nur angemeldet, dass dieser Lauf sie überhaupt anfragen darf.
export function ComputerAccessToggle({ enabled, disabled, onChange }: {
  enabled: boolean
  disabled: boolean
  onChange: (enabled: boolean) => void
}) {
  const { t } = useTranslation()
  return (
    <button type="button" className={`ai-bar-context-btn ${enabled ? 'active' : ''}`}
      disabled={disabled} aria-pressed={enabled} title={t('aiBar.computer.hint')}
      onClick={() => onChange(!enabled)}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <rect x="2" y="4" width="20" height="12" rx="2" />
        <path d="M8 20h8m-4-4v4" />
      </svg>
      {t('aiBar.computer.label')}
    </button>
  )
}
