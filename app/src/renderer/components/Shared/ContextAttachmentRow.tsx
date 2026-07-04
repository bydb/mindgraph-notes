import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from '../../utils/translations'
import { useContextVaultFiles } from '../../utils/useContextVaultFiles'
import type { NoteAgentAttachment } from '../../../shared/types'

// Notiz-Agent Phase 1: geteilte Kontext-Zeile (Pill-Button + Chips + Vault-Picker +
// Fehler + Cloud-Hinweis) für Macher-Leiste und Notes-Chat. Die Verwaltung der
// Attachments (Main-Registry via IPC) liegt beim Aufrufer — hier nur Darstellung.
// `extra` erlaubt dem Aufrufer, weitere Elemente in DIESELBE Zeile zu setzen
// (Macher-Leiste: Zielordner-Button + Chip) — eine ruhige Zeile statt Stapel.
// Styles: globale .ai-bar-context*-Klassen in styles/index.css.

interface Props {
  attachments: NoteAgentAttachment[]
  onAttachDialog: () => void
  onAttachFolderDialog: () => void
  onAttachVaultFile: (relPath: string) => void
  onDetach: (id: string) => void
  disabled?: boolean
  attachError: string | null
  // Cloud-Backend gewählt? Dann Hinweis zeigen, sobald Anhänge da sind (keine Sperre —
  // Entscheidung 7 im Plan, der Nutzer entscheidet).
  cloudSelected: boolean
  extra?: ReactNode
}

export const FolderGlyph = ({ size = 11 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" style={{ flexShrink: 0 }}>
    <path d="M1.5 3.5A1.5 1.5 0 0 1 3 2h3l1.5 2H13a1.5 1.5 0 0 1 1.5 1.5v6A1.5 1.5 0 0 1 13 13H3a1.5 1.5 0 0 1-1.5-1.5v-8Z" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinejoin="round" />
  </svg>
)

const PlusGlyph = () => (
  <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true" style={{ flexShrink: 0 }}>
    <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
  </svg>
)

export function ContextAttachmentRow({ attachments, onAttachDialog, onAttachFolderDialog, onAttachVaultFile, onDetach, disabled, attachError, cloudSelected, extra }: Props) {
  const { t } = useTranslation()
  const vaultFiles = useContextVaultFiles()
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerQuery, setPickerQuery] = useState('')

  const pickerMatches = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase()
    const attached = new Set(attachments.map(a => a.name))
    const pool = q ? vaultFiles.filter(f => f.name.toLowerCase().includes(q) || f.relPath.toLowerCase().includes(q)) : vaultFiles
    const candidates = pool.filter(f => !attached.has(f.name))
    // Dateien vor Ordnern — sonst dominieren bei leerer Suche die Top-Level-Ordner.
    return [...candidates.filter(f => !f.isFolder), ...candidates.filter(f => f.isFolder)].slice(0, 8)
  }, [pickerQuery, vaultFiles, attachments])

  const closePicker = () => {
    setPickerOpen(false)
    setPickerQuery('')
  }

  return (
    <>
      <div className="ai-bar-context">
        <div className="ai-bar-context-picker-wrap">
          <button
            type="button"
            className="ai-bar-context-btn"
            onClick={() => (pickerOpen ? closePicker() : setPickerOpen(true))}
            disabled={disabled}
            title={t('aiBar.context.add')}
            aria-expanded={pickerOpen}
          >
            <PlusGlyph /> {t('aiBar.context.label')}
          </button>
          {pickerOpen && (
            <div className="ai-bar-context-picker">
              <input
                autoFocus
                className="ai-bar-context-search"
                placeholder={t('aiBar.context.searchPlaceholder')}
                value={pickerQuery}
                onChange={e => setPickerQuery(e.target.value)}
                onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); closePicker() } }}
              />
              <div className="ai-bar-context-results">
                {pickerMatches.map(f => (
                  <button
                    key={f.relPath}
                    type="button"
                    className="ai-bar-context-result"
                    onClick={() => { onAttachVaultFile(f.relPath); closePicker() }}
                    title={f.relPath}
                  >
                    <span className="ai-bar-context-result-name">
                      {f.isFolder && <FolderGlyph />} {f.name}
                    </span>
                    <span className="ai-bar-context-result-path">{f.relPath}</span>
                  </button>
                ))}
                {pickerMatches.length === 0 && (
                  <div className="ai-bar-context-empty">{t('aiBar.context.noResults')}</div>
                )}
              </div>
              <button type="button" className="ai-bar-context-oschooser" onClick={() => { onAttachDialog(); closePicker() }}>
                {t('aiBar.context.fromComputer')}
              </button>
              <button type="button" className="ai-bar-context-oschooser" onClick={() => { onAttachFolderDialog(); closePicker() }}>
                {t('aiBar.context.folderFromComputer')}
              </button>
            </div>
          )}
        </div>
        {attachments.map(a => (
          <span key={a.id} className="ai-bar-chip ai-bar-context-chip">
            <span className="ai-bar-context-chip-name" title={a.name}>
              {a.kind === 'folder' && <FolderGlyph />} {a.name}
            </span>
            <button type="button" className="ai-bar-chip-x" onClick={() => onDetach(a.id)} disabled={disabled} aria-label={t('aiBar.context.remove')}>×</button>
          </span>
        ))}
        {extra}
      </div>
      {attachError && <div className="ai-bar-context-error">{attachError}</div>}
      {attachments.length > 0 && cloudSelected && (
        <div className="ai-bar-cloud-hint">{t('aiBar.context.cloudHint')}</div>
      )}
    </>
  )
}
