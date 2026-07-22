import type { NoteKindDefinition } from '../../utils/noteKind'
import { ModelLogo } from '../Shared/ModelLogo'
import { HumanIcon } from '../Shared/HumanIcon'
import { useTranslation } from '../../utils/translations'

// Titel + Eigenschaften-Zeile im Dokument (Design-Variante 1c „Fokus + Kontextspalte").
// Rein präsentational; lebt als Geschwister der contentEditable-Fläche und ist damit
// unsichtbar für den Turndown-Roundtrip des Lesen-Modus.

interface NoteDocumentHeaderProps {
  // null → Titel unterdrückt (Body beginnt bereits mit einer H1 — sonst Doppel-Titel)
  title: string | null
  kind: NoteKindDefinition | null
  createdLabel: string | null
  tags: string[]
  zettelId: string | null
  aiProvenance: { model: string; date: string } | null
  showAuthorship: boolean
  // Schreiben-Modus: nur Titel, keine Eigenschaften-Zeile (Frontmatter zeigt dort das PropertiesPanel)
  compact?: boolean
}

// Erstelldatum ableiten: Frontmatter `created:` → Zettel-ID (JJJJMMTT…) → Datei-createdAt.
export function deriveCreatedDate(
  content: string,
  zettelId: string | null,
  fileCreatedAt: Date | string | undefined
): Date | null {
  const fm = content.match(/^---\s*\n([\s\S]*?)\n---/)
  const createdLine = fm?.[1].match(/^created:\s*["']?(.+?)["']?\s*$/m)
  if (createdLine) {
    const parsed = new Date(createdLine[1].trim())
    if (!Number.isNaN(parsed.getTime())) return parsed
  }
  if (zettelId && zettelId.length >= 8) {
    const year = Number(zettelId.slice(0, 4))
    const month = Number(zettelId.slice(4, 6))
    const day = Number(zettelId.slice(6, 8))
    if (year >= 1970 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return new Date(year, month - 1, day)
    }
  }
  if (fileCreatedAt) {
    const parsed = new Date(fileCreatedAt)
    if (!Number.isNaN(parsed.getTime())) return parsed
  }
  return null
}

export function formatCreatedDate(date: Date, language: string): string {
  const sameYear = date.getFullYear() === new Date().getFullYear()
  return date.toLocaleDateString(language === 'de' ? 'de-DE' : 'en-US', {
    day: 'numeric',
    month: 'long',
    ...(sameYear ? {} : { year: 'numeric' as const })
  })
}

export function NoteDocumentHeader({
  title,
  kind,
  createdLabel,
  tags,
  zettelId,
  aiProvenance,
  showAuthorship,
  compact
}: NoteDocumentHeaderProps) {
  const { t } = useTranslation()

  if (compact) {
    return title ? (
      <div className="note-doc-header compact">
        <div className="note-doc-title">{title}</div>
      </div>
    ) : null
  }

  return (
    <div className="note-doc-header">
      {title && <div className="note-doc-title">{title}</div>}
      <div className="note-doc-props">
        {kind && (
          <span className={`note-doc-kind note-doc-kind-${kind.id}`}>
            <span className={`note-kind-dot note-kind-${kind.id}`} />
            {kind.label}
          </span>
        )}
        {createdLabel && (
          <span className="note-doc-chip">{t('editor.docHeader.created', { date: createdLabel })}</span>
        )}
        {tags.map(tag => (
          <span key={tag} className="note-doc-chip note-doc-tag">#{tag}</span>
        ))}
        {showAuthorship && (
          aiProvenance ? (
            <span
              className="note-authorship note-authorship-ai"
              title={`${t('editor.aiEdited')} · ${aiProvenance.model}${aiProvenance.date ? ' · ' + aiProvenance.date : ''}`}
            >
              <ModelLogo model={aiProvenance.model} size={13} />
              <span>{t('editor.aiEdited')}</span>
            </span>
          ) : (
            <span className="note-authorship note-authorship-human" title={t('aiBar.byYouTitle')}>
              <HumanIcon size={12} />
              <span>{t('aiBar.byYou')}</span>
            </span>
          )
        )}
        <span className="note-doc-props-spacer" />
        {zettelId && (
          <span className="note-doc-id" title={t('editor.zettelIdTooltip', { id: zettelId })}>{zettelId}</span>
        )}
      </div>
    </div>
  )
}
