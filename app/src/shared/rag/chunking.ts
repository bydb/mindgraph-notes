/**
 * Markdown-bewusstes Chunking für das Projekt-RAG.
 *
 * Warum nicht „ganze Notiz = 1 Vektor" (wie Smart Connections)? Ein 4000-Zeichen-
 * Cap mittelt mehrere Themen in einen Vektor → grobes Retrieval. Hier wird pro
 * Überschriften-Sektion gechunkt, lange Sektionen im Sliding-Window mit Overlap
 * geteilt. So bleibt eine Aussage retrievbar und jeder Chunk trägt seine nächste
 * Überschrift fürs Quellen-Zitat ([[Datei]] § Heading).
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
}

const DEFAULT_TARGET = 1200
const DEFAULT_OVERLAP = 200
const DEFAULT_MIN = 200

// Überschrift H1–H6 (nur H1–H3 begründen einen Sektions-Schnitt, s. u.).
const HEADING_RE = /^(#{1,6})\s+(.+?)\s*#*\s*$/

/** Entfernt einen führenden YAML-Frontmatter-Block (`--- … ---`). */
export function stripFrontmatter(content: string): string {
  return content.replace(/^﻿?---[\s\S]*?\n---\s*\n?/, '')
}

interface Section {
  heading: string
  text: string
}

function splitIntoSections(body: string): Section[] {
  const lines = body.split('\n')
  const sections: Section[] = []
  let currentHeading = ''
  let buf: string[] = []

  const flush = () => {
    const text = buf.join('\n').trim()
    if (text) sections.push({ heading: currentHeading, text })
    buf = []
  }

  for (const line of lines) {
    const m = line.match(HEADING_RE)
    if (m && m[1].length <= 3) {
      // Neue Sektion an H1–H3. Die Überschrift bleibt im Sektionstext (der LLM
      // soll sie sehen), wird aber auch als `heading` für das Zitat gemerkt.
      flush()
      currentHeading = m[2].trim()
    }
    buf.push(line)
  }
  flush()
  return sections
}

function windowSection(section: Section, target: number, overlap: number): RawChunk[] {
  if (section.text.length <= target) {
    return [{ text: section.text, heading: section.heading, chunkIndex: 0 }]
  }

  const out: { text: string; heading: string }[] = []
  const paragraphs = section.text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)

  let cur = ''
  const push = (text: string) => {
    const t = text.trim()
    if (t) out.push({ text: t, heading: section.heading })
  }

  for (const p of paragraphs) {
    if (cur && cur.length + p.length + 2 > target) {
      push(cur)
      // Overlap: Schwanz des vorherigen Chunks voranstellen, damit eine an der
      // Grenze zerschnittene Aussage in beiden Chunks auffindbar bleibt.
      const tail = cur.slice(Math.max(0, cur.length - overlap))
      cur = `${tail}\n\n${p}`
    } else {
      cur = cur ? `${cur}\n\n${p}` : p
    }
    // Einzelner Riesen-Absatz: hart slicen.
    while (cur.length > target * 1.5) {
      push(cur.slice(0, target))
      cur = cur.slice(target - overlap)
    }
  }
  push(cur)

  return out.map((c, i) => ({ ...c, chunkIndex: i }))
}

/**
 * Zerlegt Markdown in eingebettungsfertige Chunks.
 * Reihenfolge: Frontmatter strippen → an H1–H3 in Sektionen → lange Sektionen
 * im Paragraph-Sliding-Window → Mini-Chunks mit Vorgänger verschmelzen.
 */
export function chunkMarkdown(content: string, opts: ChunkOptions = {}): RawChunk[] {
  const target = opts.targetChars ?? DEFAULT_TARGET
  const overlap = opts.overlapChars ?? DEFAULT_OVERLAP
  const min = opts.minChars ?? DEFAULT_MIN

  const body = stripFrontmatter(content)
  if (!body.trim()) return []

  const sections = splitIntoSections(body)
  const raw: { text: string; heading: string }[] = []
  for (const section of sections) {
    for (const c of windowSection(section, target, overlap)) {
      raw.push({ text: c.text, heading: c.heading })
    }
  }

  // Mini-Chunks an den Vorgänger anhängen (zu kurze Fragmente embedden schlecht).
  const merged: { text: string; heading: string }[] = []
  for (const c of raw) {
    if (c.text.length < min && merged.length > 0) {
      const prev = merged[merged.length - 1]
      prev.text = `${prev.text}\n\n${c.text}`
    } else {
      merged.push({ ...c })
    }
  }

  return merged
    .filter((c) => c.text.trim().length > 0)
    .map((c, i) => ({ text: c.text, heading: c.heading, chunkIndex: i }))
}
