// KI-Provenienz: welches Modell hat den Inhalt erzeugt bzw. zuletzt bearbeitet.
//
// Single-Source und prozessübergreifend (Main + Renderer): die Schreibpfade des
// Notiz-Agenten, von Brain, den E-Mail-Notizen und dem Workflow-Runner leben im
// Main-Prozess, die KI-Leiste und der Notizen-Chat im Renderer — beide stempeln
// denselben Frontmatter-Schlüssel, damit das Badge im Lesen-Modus überall greift.
//
// Durable und maschinenlesbar im Frontmatter (`ki-modell` + `ki-datum`); im
// Lesen-Modus rendert `NoteDocumentHeader` daraus ein Chip mit Hersteller-Logo.
//
// Bewusst NICHT in `writeFileSafe` verdrahtet: das ist die gemeinsame Schreibgrenze
// für menschliche UND maschinelle Writes und darf nichts über die Herkunft annehmen.
// Jeder KI-Pfad stempelt selbst, unmittelbar vor dem Schreiben.

export const AI_PROVENANCE_MODEL_KEY = 'ki-modell'
export const AI_PROVENANCE_DATE_KEY = 'ki-datum'

/**
 * YAML-Plain-Scalar, wo möglich — sonst doppelt gequotet.
 * Ollama-Tags wie `qwen3.6:27b-mlx` enthalten zwar einen Doppelpunkt, aber kein
 * `": "`, und bleiben damit gültige Plain-Scalars. Erst Sonderfälle (Doppelpunkt
 * mit Leerzeichen, `#`, Anführungszeichen, Rand-Whitespace) brauchen Quotes.
 */
function yamlScalar(value: string): string {
  const v = value.trim()
  if (!v) return '""'
  const needsQuotes = /:\s/.test(v) || /\s#/.test(v) || /^[#&*!|>%@`"'-]/.test(v) || /["\\\n]/.test(v)
  if (!needsQuotes) return v
  return `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

/** Umkehrung von `yamlScalar` beim Lesen: umschließende Quotes entfernen. */
function unquoteScalar(raw: string): string {
  const v = raw.trim()
  if (v.length >= 2 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))) {
    const inner = v.slice(1, -1)
    return v.startsWith('"') ? inner.replace(/\\"/g, '"').replace(/\\\\/g, '\\') : inner.replace(/''/g, "'")
  }
  return v
}

/**
 * Ein YAML-Frontmatter-Block ist nur in Markdown ein Metadaten-Kopf. In einer
 * HTML-Datei wäre er sichtbarer Text — und weil er VOR `<!DOCTYPE html>`
 * landet, zählt die Typangabe nicht mehr: der Browser fällt in den
 * Quirks-Modus, Layout und Skripte verhalten sich anders (real aufgetreten:
 * eine wissenschaftliche Seite zeigte danach den Kopf als Text und ließ alle
 * Formeln als `$$` stehen).
 *
 * Bewusst nur der Dokumentanfang und nicht `looksLikeFullHtmlDocument()`: das
 * prüft irgendwo im Text und würde jeder Markdown-Notiz mit einem
 * HTML-Codeblock still den Stempel verweigern.
 */
function looksLikeHtmlDocument(content: string): boolean {
  return /^﻿?\s*<\s*(!doctype\s+html|html)\b/i.test(content)
}

/**
 * Schreibt/aktualisiert `ki-modell` + `ki-datum` im Frontmatter.
 * Vorhandene Zeilen werden ersetzt (nie dupliziert), der Body bleibt unangetastet.
 * Ohne Frontmatter wird einer angelegt.
 * HTML-Dokumente bleiben unverändert — dort wäre der Block kein Metadaten-Kopf,
 * sondern sichtbarer Text vor der Typangabe.
 */
export function setAiProvenanceInContent(content: string, model: string, date: string): string {
  if (looksLikeHtmlDocument(content)) return content
  const modelLine = `${AI_PROVENANCE_MODEL_KEY}: ${yamlScalar(model)}`
  const dateLine = `${AI_PROVENANCE_DATE_KEY}: ${yamlScalar(date)}`
  const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---/)
  if (fmMatch) {
    let fm = fmMatch[1]
    const bodyStart = fmMatch[0].length
    fm = new RegExp(`^${AI_PROVENANCE_MODEL_KEY}:\\s*.*$`, 'm').test(fm)
      ? fm.replace(new RegExp(`^${AI_PROVENANCE_MODEL_KEY}:\\s*.*$`, 'm'), modelLine)
      : `${fm.trimEnd()}\n${modelLine}`
    fm = new RegExp(`^${AI_PROVENANCE_DATE_KEY}:\\s*.*$`, 'm').test(fm)
      ? fm.replace(new RegExp(`^${AI_PROVENANCE_DATE_KEY}:\\s*.*$`, 'm'), dateLine)
      : `${fm.trimEnd()}\n${dateLine}`
    return `---\n${fm}\n---${content.slice(bodyStart)}`
  }
  return `---\n${modelLine}\n${dateLine}\n---\n\n${content}`
}

/** Liest die Provenienz aus dem Frontmatter. null = nicht KI-markiert. */
export function getAiProvenance(content: string): { model: string; date: string } | null {
  const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---/)
  if (!fmMatch) return null
  const m = fmMatch[1].match(new RegExp(`^${AI_PROVENANCE_MODEL_KEY}:\\s*(.+)$`, 'm'))
  if (!m) return null
  const model = unquoteScalar(m[1])
  if (!model) return null
  const d = fmMatch[1].match(new RegExp(`^${AI_PROVENANCE_DATE_KEY}:\\s*(.+)$`, 'm'))
  return { model, date: d ? unquoteScalar(d[1]) : '' }
}

/** Heutiges Datum als `YYYY-MM-DD` — das Format von `ki-datum`. */
export function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10)
}

const MAX_LABEL_CHARS = 22

/**
 * Anzeigename fürs Badge: Provider-/Namespace-Präfix strippen und kappen.
 * `openrouter/anthropic/claude-sonnet-4` → `claude-sonnet-4`,
 * `mlx-community/qwen3.6-27b` → `qwen3.6-27b`.
 * Der vollständige String bleibt dem Tooltip vorbehalten.
 */
export function formatProvenanceLabel(model: string): string {
  const raw = (model || '').trim()
  if (!raw) return ''
  const segments = raw.split('/').filter(Boolean)
  const short = segments.length > 0 ? segments[segments.length - 1] : raw
  if (short.length <= MAX_LABEL_CHARS) return short
  return `${short.slice(0, MAX_LABEL_CHARS - 1)}…`
}

/**
 * Sichtbare Kennzeichnung für Ausgabeformate ohne Frontmatter (HTML, PDF, DOCX).
 *
 * Eine einzige Wortlaut-Quelle für alle Exportwege: sonst driften die
 * Formulierungen auseinander und dieselbe Notiz trägt je nach Dateiformat einen
 * anderen Hinweis. Leerer String ohne Modell — unmarkiert ist besser als falsch
 * markiert (gleiche Regel wie beim `<meta>`-Tag).
 */
export function buildProvenanceNotice(model: string, lang?: string): string {
  const m = (model || '').trim()
  if (!m) return ''
  return `${lang === 'en' ? 'Generated with AI model' : 'Erstellt mit KI-Modell'}: ${m}`
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * HTML-Pendant zum Frontmatter-Stempel: erzeugte Seiten (write_html) können kein
 * YAML tragen, deshalb wandert die Provenienz dort in ein `<meta>`-Tag.
 * Leerer String, wenn kein Modell bekannt ist — dann bleibt die Seite unmarkiert.
 */
export function buildProvenanceMetaTag(model: string): string {
  const m = (model || '').trim()
  if (!m) return ''
  return `<meta name="${AI_PROVENANCE_MODEL_KEY}" content="${escapeHtmlAttribute(m)}">`
}

/**
 * Sichtbare Fußzeile für alles, was über ein HTML-Template gerendert wird:
 * erzeugte Seiten (write_html) und der PDF-Export von Notizen.
 *
 * Das Styling kommt bewusst NICHT als Inline-Style mit, sondern über die Klasse
 * `.ai-provenance` aus dem jeweiligen Dokument — sonst kämpfte ein fest
 * verdrahtetes Grau gegen den reMarkable-Buchstil (reines Schwarz, e-ink).
 * `escapeHtmlAttribute` escaped mehr als für Textinhalt nötig; das ist
 * unschädlich und spart einen zweiten, fast identischen Escaper.
 */
export function buildProvenanceFooterHtml(model: string, lang?: string): string {
  const notice = buildProvenanceNotice(model, lang)
  if (!notice) return ''
  return `<footer class="ai-provenance">${escapeHtmlAttribute(notice)}</footer>`
}
