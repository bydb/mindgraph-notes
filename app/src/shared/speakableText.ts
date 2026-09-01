// Bereitet Markdown für die Sprachausgabe auf (Vorlesen und MP3-Export).
//
// Warum zeilenorientiert und nicht als Regex-Kette (so war es bis 09/2026)?
// Die alte Kette in `renderer/utils/voice/tts.ts` arbeitete mit Mustern wie
// `/\[\[([^\]]+)\]\]/g`. `[^\]]` schließt `\n` ein — ein einzelnes `[[` (etwa aus
// Inline-Code, das der Schritt davor entklammert hatte) fraß deshalb alles bis zum
// nächsten `]]`. In `starter-vault-demo/Demo-Tour.md` verschwanden so ein ganzer Satz
// und eine Überschrift aus dem gesprochenen Text — still, ohne Fehlermeldung.
// Dieselbe Bauart hatten die Kursiv-Regeln: `rate_2026_final.md` wurde zu
// `rate2026final.md`.
//
// Hier läuft stattdessen erst ein Blockdurchlauf über die ZEILEN (ganze Zeilen werden
// verworfen), danach eine Inline-Bereinigung, die immer nur eine einzelne Zeile sieht.
// Die Fehlerklasse „gieriges Muster frisst den nächsten Absatz" ist damit konstruktiv
// ausgeschlossen, nicht bloß im bekannten Fall repariert.
//
// Emojis bleiben bewusst stehen (Nutzerentscheidung) — die Kategorien 🔴🟢🔵 gehören
// im Vault zum Titel. Wer sie nicht hören will, setzt `dropEmojis`.
//
// Bewusste Doppelung: Es gibt im Repo noch zwei weitere Markdown-Entstauber,
// `prepareTextForEmbedding` (`shared/rag/similarity.ts`) und `stripFrontmatter`
// (`shared/rag/chunking.ts`). Die werden NICHT zusammengelegt. Der Embedding-Entstauber
// bestimmt, welche Vektoren im Smart-Connections-Cache liegen — jede Änderung dort
// erzwingt ein Neuberechnen aller Embeddings. Sprache und Ähnlichkeitssuche brauchen
// außerdem verschiedene Dinge (Sprache will Satzzeichen, Embedding will Stichwörter).

import { stripFrontmatter } from './rag/chunking'

export interface SpeakableOptions {
  /** Tabellen komplett überspringen (Default: true). Vorgelesen sind sie Wortsalat. */
  dropTables?: boolean
  /** Aufgabenzeilen `- [ ]` / `- [x]` komplett überspringen (Default: true). */
  dropTasks?: boolean
  /** Emojis entfernen (Default: false — sie bleiben erhalten). */
  dropEmojis?: boolean
}

/** Ganze Notiz vorlesen: alles Strukturelle fliegt raus. */
export const SPEAKABLE_NOTE: SpeakableOptions = { dropTables: true, dropTasks: true }

/**
 * Kurzer Textschnipsel (Karteikarte, fertige Antwort eines Sprachbefehls):
 * nur Inline-Bereinigung, es wird KEINE Zeile verworfen.
 *
 * Eine Karteikarte kann aus genau einer Tabelle bestehen — würde die wegfallen,
 * sagt die Karte nichts mehr, und zwar ohne Fehlermeldung. Ein stummer Knopf sieht
 * aus wie ein kaputter Knopf.
 */
export const SPEAKABLE_SNIPPET: SpeakableOptions = { dropTables: false, dropTasks: false }

/**
 * Kopfzeilen der E-Mail-Notiz (`main/index.ts`, Template ab „# 📧 …").
 * Eigene Konstante, obwohl `rag/similarity.ts` eine fast gleiche Liste hat: dort fehlt
 * `CC`, und ein Angleichen dort würde den Embedding-Cache invalidieren.
 */
const EMAIL_HEADER_RE = /^\*\*(?:Von|An|CC|Datum|Relevanz|Stimmung|Kategorien|Betreff|From|To|Subject|Date):\*\*/i

/** Quellen-/Metadaten-Fußblöcke (Notiz-Agent, Readwise). */
const CUT_SECTION_RE = /^#{1,6}\s+(?:Quellen|Sources|Metadata)\s*$/i

/** Code-, Mermaid- und Dataview-Blöcke. Ein nie geschlossener Zaun schluckt den Rest. */
const FENCE_RE = /^\s{0,3}(?:```|~~~)/

/** Herkunftsbanner des Workflow-Runners (`main/index.ts`, „> 🔁 Erstellt am …"). */
const PROVENANCE_RE = /^>\s*\u{1F501}/u

const TABLE_ROW_RE = /^\|/
const TASK_RE = /^[-*+]\s*\[[ xX]\]/
const LIST_ITEM_RE = /^(?:[-*+]\s+|\d+\.\s+)/
const FOOTNOTE_DEF_RE = /^\[\^[^\]]+\]:/
const THEMATIC_BREAK_RE = /^([-*_])\s*(?:\1\s*){2,}$/
const IMAGE_ONLY_RE = /^(?:!\[[^\]]*\]\([^)]*\)|!\[\[[^\]]*\]\])$/
const CAPTION_RE = /^\*[^*]+\*$/
const HEADING_RE = /^(#{1,6})\s+(.+?)\s*#*$/
const EMOJI_RE = /[\p{Extended_Pictographic}️‍]/gu

/** Zeile besteht nur aus HTML-Tags und enthält keinen sprechbaren Satz. */
function isMarkupOnlyLine(line: string): boolean {
  if (!/^<\/?[a-zA-Z]/.test(line)) return false
  return line.replace(/<[^>]*>/g, '').trim().length < 3
}

function indentOf(line: string): number {
  return line.length - line.trimStart().length
}

/**
 * Darf ab dieser Überschrift bis Dateiende abgeschnitten werden?
 *
 * Nur wenn danach ausschließlich Aufzählungspunkte kommen — das ist der Quellenblock,
 * den `shared/webResearch.ts` deterministisch anhängt. Eine Literaturnotiz, die mitten
 * im Text ein `## Quellen` mit Fließtext führt, behält ihren Inhalt. Sonst hätten wir
 * genau die Fehlerklasse zurück, die dieser Umbau beseitigen soll.
 */
function isTrailingReferenceBlock(lines: string[], from: number): boolean {
  let sawItem = false
  for (let i = from; i < lines.length; i++) {
    const l = lines[i].trim()
    if (l === '') continue
    if (!LIST_ITEM_RE.test(l)) return false
    sawItem = true
  }
  return sawItem
}

/** Inline-Bereinigung. Sieht immer nur EINE Zeile — kann also nichts überspringen. */
function cleanInline(line: string, dropEmojis: boolean): string {
  let s = line
    // HTML-Kommentare (z.B. der Anker <!-- anno: … --> der Lesemodus-Markierungen)
    .replace(/<!--.*?-->/g, '')
    // Inline-Code: Backticks weg, Inhalt bleibt sprechbar
    .replace(/`([^`]*)`/g, '$1')
    // Einbettungen ![[bild.png]] und Bilder ![alt](url) ganz weg
    .replace(/!\[\[[^\]]*\]\]/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    // Wikilink mit Alias -> Alias
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    // Wikilink -> Titel, ohne Anker und ohne Zettel-ID-Präfix (202604221336 - Titel)
    .replace(/\[\[([^\]]+)\]\]/g, (_m, target: string) =>
      target.split('#')[0].replace(/^\d{8,14}\s*-\s*/, '').trim()
    )
    // Markdown-Link -> Linktext (URL fällt weg)
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    // Fußnoten-Verweise
    .replace(/\[\^[^\]]+\]/g, '')
    // Hervorhebung ==Text== und Durchgestrichenes
    .replace(/==([^=]+)==/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    // Fett/Kursiv mit Sternchen
    .replace(/\*\*\*([^*]+)\*\*\*|\*\*([^*]+)\*\*|\*([^*]+)\*/g, (_m, a, b, c) => a ?? b ?? c)
    // Fett/Kursiv mit Unterstrich — nur an Wortgrenzen. Ein Zeilenumbruch allein
    // rettet `rate_2026_final.md` nicht, der Name steht ja in EINER Zeile.
    .replace(/(^|[\s(])___([^_]+)___(?=[\s.,;:!?)]|$)/g, '$1$2')
    .replace(/(^|[\s(])__([^_]+)__(?=[\s.,;:!?)]|$)/g, '$1$2')
    .replace(/(^|[\s(])_([^_\s][^_]*)_(?=[\s.,;:!?)]|$)/g, '$1$2')
    // Fälligkeitsmarker
    .replace(/@\[\[(\d{4}-\d{2}-\d{2})\]\]/g, '')
    .replace(/@\d{4}-\d{2}-\d{2}/g, '')
    // Tags
    .replace(/(^|\s)#[A-Za-zÄÖÜäöüß][\w/-]*/g, '$1')
    // HTML-Reste
    .replace(/<\/?[a-zA-Z][^>]*>/g, '')
    // Nackte URLs
    .replace(/https?:\/\/\S+/g, '')
    // LaTeX bleibt unsprechbar — Formelzeichen entfernen
    .replace(/\$\$?[^$]*\$\$?/g, '')
    // Markdown-Escapes auflösen: „5 \* 3" soll nicht „Backslash Stern" werden
    .replace(/\\([\\`*_{}[\]()#+\-.!])/g, '$1')

  if (dropEmojis) s = s.replace(EMOJI_RE, '')

  return s
    .replace(/\(\s*\)/g, '')
    .replace(/[ \t]+/g, ' ')
    .trim()
}

/** Normalisiert Zeilenenden, BOM und führende Leerzeilen — vor allem anderen. */
function normalize(markdown: string): string {
  return markdown.replace(/\r\n?/g, '\n').replace(/^﻿/, '').replace(/^\s*\n/, '')
}

/**
 * Entfernt Überschriften, unter denen gar kein Text mehr steht — etwa
 * „## Mermaid-Diagramme" über einem Block, der komplett verworfen wurde.
 * Eine Überschrift mit tieferer Unterüberschrift bleibt erhalten.
 */
function dropEmptyHeadings(entries: Array<{ level: number; text: string }>): string[] {
  const keep = entries.map((entry, i) => {
    if (entry.level === 0) return true
    for (let j = i + 1; j < entries.length; j++) {
      const next = entries[j]
      if (next.level === 0) {
        if (next.text.trim() === '') continue
        return true // echter Text gehört zu dieser Überschrift
      }
      // nächste Überschrift: nur eine TIEFERE trägt noch Inhalt bei
      return next.level > entry.level
    }
    return false // nichts folgt mehr
  })
  return entries.filter((_, i) => keep[i]).map((e) => e.text)
}

/** Minimalfassung für den Fall, dass die scharfe Bereinigung alles wegnimmt. */
function minimalFallback(markdown: string, dropEmojis: boolean): string {
  return stripFrontmatter(normalize(markdown))
    .split('\n')
    .map((l) => cleanInline(l.replace(/^\s*(?:[-*+]|\d+\.)\s+/, '').replace(/^\s*#{1,6}\s+/, '').replace(/\|/g, ' '), dropEmojis))
    .filter((l) => l.length > 0)
    .join('\n')
    .trim()
}

/**
 * Entfernt Markdown-Syntax und App-Beiwerk, damit die Sprachausgabe nur den Text
 * spricht. Gibt nie einen leeren String zurück, solange die Eingabe Text enthielt.
 */
export function markdownToSpeakable(markdown: string, options: SpeakableOptions = {}): string {
  const dropTables = options.dropTables ?? true
  const dropTasks = options.dropTasks ?? true
  const dropEmojis = options.dropEmojis ?? false

  const lines = stripFrontmatter(normalize(markdown)).split('\n')

  const out: Array<{ level: number; text: string }> = []
  let inFence = false
  let inComment = false
  let afterImage = false
  let taskIndent: number | null = null

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]

    if (FENCE_RE.test(raw)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue

    // Mehrzeilige HTML-Kommentare überspringen. Einzeilige erledigt `cleanInline`.
    if (inComment) {
      if (raw.includes('-->')) inComment = false
      continue
    }
    if (raw.includes('<!--') && !raw.includes('-->')) {
      inComment = true
      continue
    }

    const line = raw.trim()

    // Eingerückte Fortsetzungszeilen einer verworfenen Aufgabe gehen mit —
    // sonst liest die App verwaiste Unterpunkte vor.
    if (taskIndent !== null) {
      if (line === '' || indentOf(raw) > taskIndent) continue
      taskIndent = null
    }

    if (line === '') {
      out.push({ level: 0, text: '' })
      afterImage = false
      continue
    }
    if (CUT_SECTION_RE.test(line) && isTrailingReferenceBlock(lines, i + 1)) break
    if (dropTables && TABLE_ROW_RE.test(line)) continue
    if (dropTasks && TASK_RE.test(line)) {
      taskIndent = indentOf(raw)
      continue
    }
    if (FOOTNOTE_DEF_RE.test(line)) continue
    if (THEMATIC_BREAK_RE.test(line)) continue
    if (EMAIL_HEADER_RE.test(line)) continue
    if (PROVENANCE_RE.test(line)) continue
    if (isMarkupOnlyLine(line)) continue
    if (IMAGE_ONLY_RE.test(line)) {
      afterImage = true
      continue
    }
    // Bildunterschrift: allein stehende kursive Zeile direkt unter einem Bild
    if (afterImage && CAPTION_RE.test(line)) {
      afterImage = false
      continue
    }
    afterImage = false

    // Callout-Kopf („> [!info]+ Titel") und Zitatzeichen abstreifen
    let text = line.replace(/^>\s*\[![^\]]+\][+-]?\s*/, '').replace(/^>\s?/, '')

    const heading = HEADING_RE.exec(text)
    if (heading) {
      const title = heading[2].trim()
      // Punkt nur setzen, wenn die Überschrift nicht schon Satzzeichen trägt —
      // sonst wird aus „Was ist neu?" ein „Was ist neu?."
      const cleaned = cleanInline(/[.?!:;…]$/.test(title) ? title : `${title}.`, dropEmojis)
      if (cleaned) out.push({ level: heading[1].length, text: cleaned })
      continue
    }

    text = text.replace(/^(?:[-*+]|\d+\.)\s+/, '')
    const cleaned = cleanInline(text, dropEmojis)
    if (cleaned) out.push({ level: 0, text: cleaned })
  }

  const result = dropEmptyHeadings(out).join('\n').replace(/\n{3,}/g, '\n\n').trim()

  // Nie stumm werden: lieber holprig vorlesen als ohne Fehlermeldung schweigen.
  if (!result && markdown.trim()) return minimalFallback(markdown, dropEmojis)
  return result
}
