/**
 * Markdown-bewusstes Chunking für Projekt-RAG und Vault-Index.
 *
 * Warum nicht „ganze Notiz = 1 Vektor" (wie Smart Connections)? Ein 4000-Zeichen-
 * Cap mittelt mehrere Themen in einen Vektor → grobes Retrieval. Hier wird pro
 * Überschriften-Sektion gechunkt, lange Sektionen im Sliding-Window mit Overlap
 * geteilt. So bleibt eine Aussage retrievbar und jeder Chunk trägt seine nächste
 * Überschrift fürs Quellen-Zitat ([[Datei]] § Heading).
 *
 * Koordinatenvertrag (Vault-Chat-Plan Rev. 3, Entscheidung 5): Jeder Chunk ist ein
 * ZUSAMMENHÄNGENDER Ausschnitt der kanonisierten Datei (BOM entfernt, CRLF → LF),
 * die Offsets beziehen sich auf die vollständige kanonische Folge EINSCHLIESSLICH
 * Frontmatter. Invariante, in Tests erzwungen:
 *   canonical.slice(chunk.sourceStart, chunk.sourceEnd) === chunk.text
 * Deshalb wird nichts mehr getrimmt und wieder zusammengesetzt — Trimmen, Overlap
 * und das Verschmelzen kurzer Chunks sind reine Spannen-Operationen.
 *
 * Reine, deterministische Logik ohne FS/Ollama — von Main UND Renderer nutzbar.
 */

export interface ChunkOptions {
  /** Ziel-Chunkgröße in Zeichen (~300–400 Tokens bei Default 1200). */
  targetChars?: number
  /** Überlappung zwischen aufeinanderfolgenden Chunks derselben Sektion. */
  overlapChars?: number
  /** Chunks kürzer als dies werden mit dem vorherigen verschmolzen. */
  minChars?: number
}

export interface RawChunk {
  text: string
  heading: string
  chunkIndex: number
  /** UTF-16-Offset in der kanonischen Datei (inkl. Frontmatter), inklusiv. */
  sourceStart: number
  /** UTF-16-Offset in der kanonischen Datei, exklusiv. */
  sourceEnd: number
  /** 1-basierte Zeile, in der der Chunk beginnt. */
  startLine: number
}

const DEFAULT_TARGET = 1200
const DEFAULT_OVERLAP = 200
const DEFAULT_MIN = 200

// Überschrift H1–H6 (nur H1–H3 begründen einen Sektions-Schnitt, s. u.).
const HEADING_RE = /^(#{1,6})\s+(.+?)\s*#*\s*$/

/**
 * Kanonische Form einer Markdown-Datei: ohne BOM, nur `\n` als Zeilenende.
 * Alle Offsets des Chunkers beziehen sich auf diese Form.
 */
export function canonicalizeMarkdown(content: string): string {
  const withoutBom = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content
  return withoutBom.replace(/\r\n?/g, '\n')
}

const FRONTMATTER_RE = /^---[\s\S]*?\n---\s*\n?/

/** Entfernt einen führenden YAML-Frontmatter-Block (`--- … ---`). */
export function stripFrontmatter(content: string): string {
  return content.replace(/^﻿?---[\s\S]*?\n---\s*\n?/, '')
}

/** Länge des führenden Frontmatter-Blocks in der kanonischen Datei (0 = keiner). */
export function frontmatterEndOffset(canonical: string): number {
  const m = canonical.match(FRONTMATTER_RE)
  return m ? m[0].length : 0
}

interface Span {
  start: number
  end: number
}

interface Section extends Span {
  heading: string
}

function isWhitespace(code: number): boolean {
  return code === 0x20 || code === 0x09 || code === 0x0a || code === 0x0d || code === 0x0b || code === 0x0c
}

/** Rückt eine Spanne von beiden Seiten über Leerraum ein (wie `String.trim()`). */
function trimSpan(canonical: string, span: Span): Span {
  let { start, end } = span
  while (start < end && isWhitespace(canonical.charCodeAt(start))) start++
  while (end > start && isWhitespace(canonical.charCodeAt(end - 1))) end--
  return { start, end }
}

// Ein Schnitt darf kein Surrogatpaar (Emoji) zerteilen — sonst enthält der Chunk-
// Text ein halbes Zeichen. Die Invariante hielte trotzdem, das Embedding nicht.
function alignStart(canonical: string, pos: number, floor: number): number {
  const code = canonical.charCodeAt(pos)
  return pos > floor && code >= 0xdc00 && code <= 0xdfff ? pos - 1 : pos
}

function alignEnd(canonical: string, pos: number, floor: number): number {
  const code = canonical.charCodeAt(pos - 1)
  return pos - 1 > floor && code >= 0xd800 && code <= 0xdbff ? pos - 1 : pos
}

function splitIntoSections(canonical: string, bodyStart: number): Section[] {
  const sections: Section[] = []
  let currentHeading = ''
  let sectionStart = bodyStart
  let pos = bodyStart
  let hasContent = false

  const flush = (end: number) => {
    if (!hasContent) return
    const trimmed = trimSpan(canonical, { start: sectionStart, end })
    if (trimmed.end > trimmed.start) sections.push({ heading: currentHeading, ...trimmed })
  }

  while (pos <= canonical.length) {
    const nl = canonical.indexOf('\n', pos)
    const lineEnd = nl === -1 ? canonical.length : nl
    const line = canonical.slice(pos, lineEnd)
    const m = line.match(HEADING_RE)
    if (m && m[1].length <= 3) {
      // Neue Sektion an H1–H3. Die Überschrift bleibt im Sektionstext (der LLM
      // soll sie sehen), wird aber auch als `heading` für das Zitat gemerkt.
      flush(pos)
      currentHeading = m[2].trim()
      sectionStart = pos
      hasContent = false
    }
    if (line.trim()) hasContent = true
    if (nl === -1) break
    pos = nl + 1
  }
  flush(canonical.length)
  return sections
}

/** Absätze einer Sektion als getrimmte Spannen (getrennt durch Leerzeilen). */
function paragraphSpans(canonical: string, section: Span): Span[] {
  const out: Span[] = []
  const text = canonical.slice(section.start, section.end)
  const sep = /\n(?:[ \t]*\n)+/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = sep.exec(text)) !== null) {
    out.push({ start: section.start + last, end: section.start + m.index })
    last = m.index + m[0].length
  }
  out.push({ start: section.start + last, end: section.end })
  return out.map((p) => trimSpan(canonical, p)).filter((p) => p.end > p.start)
}

function windowSection(canonical: string, section: Section, target: number, overlap: number): Section[] {
  if (section.end - section.start <= target) return [section]

  const out: Section[] = []
  const push = (span: Span) => {
    const t = trimSpan(canonical, span)
    if (t.end > t.start) out.push({ heading: section.heading, ...t })
  }

  let cur: Span | null = null
  for (const p of paragraphSpans(canonical, section)) {
    if (cur && cur.end - cur.start + (p.end - p.start) + 2 > target) {
      push(cur)
      // Overlap: der Schwanz des vorherigen Chunks bleibt am Anfang des nächsten,
      // damit eine an der Grenze zerschnittene Aussage in beiden auffindbar ist.
      // Als Spanne heißt das: früher anfangen, nicht Text voranstellen.
      const start = alignStart(canonical, Math.max(cur.start, cur.end - overlap), cur.start)
      cur = { start, end: p.end }
    } else {
      cur = cur ? { start: cur.start, end: p.end } : { start: p.start, end: p.end }
    }
    // Einzelner Riesen-Absatz: hart schneiden, ebenfalls als Spannen.
    while (cur.end - cur.start > target * 1.5) {
      const cutEnd = alignEnd(canonical, cur.start + target, cur.start)
      push({ start: cur.start, end: cutEnd })
      cur = { start: alignStart(canonical, cutEnd - overlap, cur.start), end: cur.end }
    }
  }
  if (cur) push(cur)
  return out
}

function lineOf(canonical: string, offset: number): number {
  let line = 1
  for (let i = 0; i < offset; i++) if (canonical.charCodeAt(i) === 0x0a) line++
  return line
}

/**
 * Zerlegt Markdown in eingebettungsfertige Chunks mit Quellspannen.
 * Reihenfolge: kanonisieren → Frontmatter überspringen → an H1–H3 in Sektionen →
 * lange Sektionen im Paragraph-Sliding-Window → Mini-Chunks mit Vorgänger
 * verschmelzen. Die Eingabe darf nicht-kanonisch sein; die Offsets gelten für
 * `canonicalizeMarkdown(content)`.
 */
export function chunkMarkdown(content: string, opts: ChunkOptions = {}): RawChunk[] {
  const target = opts.targetChars ?? DEFAULT_TARGET
  const overlap = opts.overlapChars ?? DEFAULT_OVERLAP
  const min = opts.minChars ?? DEFAULT_MIN

  const canonical = canonicalizeMarkdown(content)
  const bodyStart = frontmatterEndOffset(canonical)
  if (!canonical.slice(bodyStart).trim()) return []

  const raw: Section[] = []
  for (const section of splitIntoSections(canonical, bodyStart)) {
    raw.push(...windowSection(canonical, section, target, overlap))
  }

  // Mini-Chunks an den Vorgänger anhängen (zu kurze Fragmente embedden schlecht).
  // Als Spanne: der Vorgänger reicht danach bis zum Ende des kurzen Chunks — der
  // Zwischenraum (z.B. eine Überschriftenzeile) gehört dann mit dazu, das ist
  // Originaltext und hält die Invariante. Ein kurzer ERSTER Chunk (typisch: nur die
  // Überschriftenzeile vor einem langen Absatz) wandert in den nächsten, sonst
  // stünde „# Titel" allein als Quelle im Index.
  const merged: Section[] = []
  // Halter-Objekt statt `let`: TypeScripts Schleifen-Narrowing hielt die Variable
  // sonst für dauerhaft null.
  const hold: { short: Section | null } = { short: null }
  for (const c of raw) {
    const prev = merged[merged.length - 1]
    const held = hold.short
    if (c.end - c.start < min && prev) {
      prev.end = Math.max(prev.end, c.end)
    } else if (c.end - c.start < min && !prev) {
      hold.short = held
        ? { heading: held.heading, start: held.start, end: Math.max(held.end, c.end) }
        : { heading: c.heading, start: c.start, end: c.end }
    } else if (held) {
      merged.push({ heading: held.heading, start: Math.min(held.start, c.start), end: c.end })
      hold.short = null
    } else {
      merged.push({ ...c })
    }
  }
  if (hold.short) merged.push(hold.short)

  let lineCursorOffset = 0
  let lineCursorLine = 1
  return merged.map((c, i) => {
    // Zeilen inkrementell zählen (Chunks sind nach Start sortiert).
    for (let k = lineCursorOffset; k < c.start; k++) if (canonical.charCodeAt(k) === 0x0a) lineCursorLine++
    lineCursorOffset = c.start
    return {
      text: canonical.slice(c.start, c.end),
      heading: c.heading,
      chunkIndex: i,
      sourceStart: c.start,
      sourceEnd: c.end,
      startLine: lineCursorLine
    }
  })
}

/** Exportiert für Tests und für die Relokalisierung nach einer Dateiänderung. */
export const chunkingInternals = { lineOf, trimSpan }
