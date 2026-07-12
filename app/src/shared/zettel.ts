// Zettel-Erstellung (Schnellerfassung → Zettel-Modus): pure, testbare Bausteine.
//
// Die Konvention kommt aus dem gelebten Zettelkasten (nicht aus dem alten
// Templater-Template):
//   Dateiname:   <Emoji-Cluster> - <Titel>.md   — die Emojis erzählen die
//                Mini-Geschichte des Zettels (z.B. „🛬🤦‍♂️ - Der gesunde
//                Menschenverstand.md"); Umlaute bleiben erhalten.
//   Frontmatter: id (JJJJMMTTHHmm), created (JJJJ-MM-TT HH:mm),
//                tags als Inline-Array
//   Body:        **Zitat:** / **Mein Gedanke:** / **Quelle**
//
// IO (Ordner finden, Tags ernten, Datei schreiben) lebt in main/index.ts.

export interface ZettelInput {
  title: string
  /** Emoji-Cluster für den Dateinamen (optional, wird gefiltert). */
  emojis?: string
  quote?: string
  thought?: string
  /** Freitext: [[Wikilink]], Literaturangabe oder URL. */
  source?: string
  tags: string[]
  now: Date
}

// Emojis + das, was sie zusammenhält: ZWJ (Familien/Berufe), Variation Selector,
// Hautton-Modifier, Regional Indicators (Flaggen), Tag-Zeichen (Subdivision-Flaggen).
const EMOJI_PART_RE = /\p{Extended_Pictographic}|\p{Emoji_Presentation}|[\u200D\uFE0F\u20E3]|[\u{1F3FB}-\u{1F3FF}]|[\u{1F1E6}-\u{1F1FF}]|[\u{E0020}-\u{E007F}]/gu

/** Nur Emoji-Zeichen behalten (Modell-Antworten enthalten gern Begleittext). */
export function sanitizeZettelEmojis(raw: string): string {
  const parts = (raw || '').match(EMOJI_PART_RE)
  if (!parts) return ''
  // Auf eine handliche Cluster-Länge kappen (grob: max ~6 sichtbare Emojis).
  return parts.join('').slice(0, 24)
}

/** JJJJMMTTHHmm — die id-Konvention des Zettelkastens. */
export function zettelTimestampId(now: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}`
}

function zettelCreated(now: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`
}

/** Dateisystem-sichere Titel-Variante — Umlaute bleiben (gelebte Konvention). */
export function sanitizeZettelTitle(title: string): string {
  return (title || '')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 90)
}

export function sanitizeZettelTag(tag: string): string {
  return (tag || '')
    .trim()
    .replace(/^#+/, '')
    .replace(/\s+/g, '-')
    .replace(/[[\]{}:,#"'|>&*!\r\n]/g, '')
    .substring(0, 40)
}

export function buildZettelFileName(input: Pick<ZettelInput, 'title' | 'emojis'>): string {
  const title = sanitizeZettelTitle(input.title) || 'Zettel'
  const emojis = sanitizeZettelEmojis(input.emojis || '')
  return emojis ? `${emojis} - ${title}.md` : `${title}.md`
}

export function buildZettelContent(input: ZettelInput): string {
  const tags = input.tags.map(sanitizeZettelTag).filter(Boolean)
  const lines: string[] = [
    '---',
    `id: ${zettelTimestampId(input.now)}`,
    `created: ${zettelCreated(input.now)}`,
    `tags: [${tags.join(', ')}]`,
    '---',
    ''
  ]

  const quote = (input.quote || '').trim()
  const thought = (input.thought || '').trim()
  const source = (input.source || '').trim()

  if (quote) {
    lines.push('**Zitat:**', '', quote, '')
  }
  if (thought) {
    lines.push('**Mein Gedanke:**', '', thought, '')
  }
  if (source) {
    lines.push('**Quelle**', '', source, '')
  }

  return lines.join('\n')
}

/**
 * Frontmatter-Tags aus einem Markdown-Dokument (Inline-Array UND Listen-Syntax).
 * Wird beim Ernten der Zettelkasten-Tags für die Kandidatenliste genutzt.
 */
export function extractFrontmatterTags(content: string): string[] {
  if (!content.startsWith('---')) return []
  const end = content.indexOf('\n---', 3)
  if (end === -1) return []
  const frontmatter = content.slice(3, end)

  const tags: string[] = []
  const inlineMatch = frontmatter.match(/^tags:\s*\[([^\]]*)\]/m)
  if (inlineMatch) {
    for (const part of inlineMatch[1].split(',')) {
      const tag = part.trim().replace(/^["']|["']$/g, '')
      if (tag) tags.push(tag)
    }
    return tags
  }

  const listMatch = frontmatter.match(/^tags:\s*$([\s\S]*?)(?=^\S|\s*$(?![\s\S]))/m)
  if (listMatch) {
    for (const line of listMatch[1].split('\n')) {
      const item = line.match(/^\s+-\s+(.+)$/)
      if (item) {
        const tag = item[1].trim().replace(/^["']|["']$/g, '')
        if (tag) tags.push(tag)
      }
    }
  }
  return tags
}
