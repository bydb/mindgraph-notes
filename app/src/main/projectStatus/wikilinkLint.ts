/**
 * Wikilink-Lint für Projekt-Status-Drafts.
 *
 * Klassifiziert jeden `[[X]]` und jedes orphan `[X]` im Status-Output in:
 *   - ⚠ Halluzination — Datei existiert nicht im Vault
 *   - 💡 Linkvervollständigung — Datei existiert mit ZK-ID-/Emoji-Präfix,
 *     volle Form wird vorgeschlagen
 *   - 📝 Markdown-Syntax — `[Text]` (single bracket) wo `[[Text]]` gemeint sein dürfte
 *
 * NFC-Normalisierung: macOS speichert Filenames als NFD (zerlegtes ä = a + ̈),
 * LLM-Output ist NFC (präkomponiertes ä). Ohne Normalisierung matched
 * "Zuständigkeiten" im Output nicht den File "Zuständigkeiten.md".
 *
 * Ports `~/dev/crystallizer-prototyp/lint-wikilinks.sh` nach TypeScript.
 */

import * as path from 'path'
import * as fs from 'fs/promises'
import type { LintFinding } from './types'

/** Vault-Index — basenames und Brain-Tage, beide NFC-normalisiert. */
export interface VaultIndex {
  basenames: Set<string>           // .md-Dateinamen ohne Extension
  brainDates: Set<string>          // YYYY-MM-DD aus 800-brain/-Pfaden
  indexSize: number                // für Audit
  brainCount: number               // für Audit
}

const SKIP_PATH_FRAGMENTS = [
  '/.obsidian/',
  '/.trash/',
  '/.sync-trash/',
  '/.smart-env/',
  '/.mindgraph/',
  '/node_modules/'
]

const BRAIN_DATE_RE = /\/(\d{4})\/(\d{2})\/(\d{2})\.md$/

/**
 * Crawlt den Vault rekursiv und sammelt alle .md-Basenames + Brain-Tage.
 * Alle Strings werden auf NFC normalisiert.
 */
export async function buildVaultIndex(vaultPath: string): Promise<VaultIndex> {
  const basenames = new Set<string>()
  const brainDates = new Set<string>()

  async function walk(dir: string): Promise<void> {
    let entries: import('fs').Dirent[]
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return // Nicht lesbarer Ordner — überspringen
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      const rel = full.slice(vaultPath.length).replace(/\\/g, '/')
      if (SKIP_PATH_FRAGMENTS.some(frag => rel.includes(frag))) continue
      if (entry.isDirectory()) {
        await walk(full)
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        const base = entry.name.slice(0, -3).normalize('NFC')
        basenames.add(base)
        const m = full.match(BRAIN_DATE_RE)
        if (m) {
          brainDates.add(`${m[1]}-${m[2]}-${m[3]}`)
        }
      }
    }
  }

  await walk(vaultPath)
  return {
    basenames,
    brainDates,
    indexSize: basenames.size,
    brainCount: brainDates.size
  }
}

/** Entfernt führende Emoji-/Status-Marker + Whitespace ("⏳ Foo" → "Foo"). */
function stripLeadingNonAlpha(s: string): string {
  if (!s) return s
  // Erstes Wort wegnehmen, wenn es keinen Buchstaben/Zahlen enthält.
  const m = s.match(/^[^\p{L}\p{N}]+\s+(.+)$/u)
  return m ? m[1] : s
}

/** Trimmt Wikilink-Alias (`|`) und Section (`#`) ab. */
function normalizeWikilinkTarget(inner: string): string {
  let t = inner.split('|')[0]
  t = t.split('#')[0]
  return t.trim().normalize('NFC')
}

/**
 * Klassifiziert einen einzelnen Wikilink-Target gegen den Index.
 * Liefert null wenn auflösbar, sonst eine Finding ohne `count` (wird später aggregiert).
 */
function classifyWikilink(
  target: string,
  index: VaultIndex
): Pick<LintFinding, 'kind' | 'suggestion'> | null {
  // 1) Datum-Pattern → gegen Brain-Tage prüfen
  if (/^\d{4}-\d{2}-\d{2}$/.test(target)) {
    if (index.brainDates.has(target)) return null
    // Datum, aber kein Brain-Tag → Halluzination
    return { kind: 'hallucination' }
  }

  // 2) Exakter Basename-Match
  if (index.basenames.has(target)) return null

  // 3) Emoji-Strip + Exakt
  const stripped = stripLeadingNonAlpha(target)
  if (stripped !== target && stripped && index.basenames.has(stripped)) {
    return { kind: 'suggestion', suggestion: stripped }
  }

  // 4) Suffix-Match (irgendein Basename endet auf " <target>")
  //    Fängt ZK-ID-/Emoji-Präfix: "202605121001 - 🔴 AIS.chat Umstellung Zeitplan"
  for (const base of index.basenames) {
    if (base.length > target.length + 1 && base.endsWith(target)) {
      const before = base.charAt(base.length - target.length - 1)
      if (before === ' ') {
        return { kind: 'suggestion', suggestion: base }
      }
    }
  }

  // 5) Prefix-Match nur für ZK-ID-artige Targets (≥8 Ziffern)
  if (/^\d{8,}$/.test(target)) {
    for (const base of index.basenames) {
      if (base.startsWith(target) && base.length > target.length) {
        const after = base.charAt(target.length)
        if (after === ' ' || after === '-') {
          return { kind: 'suggestion', suggestion: base }
        }
      }
    }
  }

  // 6) Truly bad
  return { kind: 'hallucination' }
}

/** Findet orphan `[Text]` Markdown-Pattern (nicht Wikilink, nicht echter MD-Link). */
function findMarkdownLinkCandidates(content: string): string[] {
  const candidates = new Set<string>()
  // Match `[Text]` mit Schutz:
  // - left lookbehind: kein `[`
  // - inner: kein `[` und kein `]`, min 3 Zeichen
  // - right lookahead: kein `(`, kein `]`, kein `:`
  // Footnotes wie [^1] schon im inner gefiltert ("^" zählt nicht als Letter)
  const re = /(?<!\[)\[([^[\]\n]{3,})\](?![\(\]:])/g
  let m: RegExpExecArray | null
  while ((m = re.exec(content)) !== null) {
    const inner = m[1].trim()
    // Skip Checkboxen / triviale Markers
    if (/^[ xX-]$/.test(inner)) continue
    if (/^\d+$/.test(inner)) continue // Footnote-Nummern
    candidates.add('[' + inner + ']')
  }
  return Array.from(candidates)
}

/** Sucht für ein einzelnes Markdown-Candidate eine plausible Vault-Datei. */
function findMarkdownLinkMatch(cand: string, index: VaultIndex): string | null {
  const inner = cand.slice(1, -1).normalize('NFC')

  // Exact
  if (index.basenames.has(inner)) return inner

  // Suffix (mit Space davor)
  for (const base of index.basenames) {
    if (base.length > inner.length + 1 && base.endsWith(inner)) {
      const before = base.charAt(base.length - inner.length - 1)
      if (before === ' ') return base
    }
  }

  // Emoji-Strip + Exact
  const stripped = stripLeadingNonAlpha(inner)
  if (stripped !== inner && stripped && index.basenames.has(stripped)) {
    return stripped
  }

  return null
}

/**
 * Hauptfunktion: prüft den Status-Inhalt und liefert eine Liste von Findings.
 * Modifiziert den Inhalt nicht — der Aufrufer entscheidet, ob Inline-Marker oder
 * Summary-Section angehängt werden.
 */
export function lintContent(content: string, index: VaultIndex): LintFinding[] {
  // Step 1: Wikilinks extrahieren + zählen
  const wikiCounts = new Map<string, number>()
  const wikilinkRe = /\[\[([^\]]+)\]\]/g
  let m: RegExpExecArray | null
  while ((m = wikilinkRe.exec(content)) !== null) {
    const full = m[0]
    wikiCounts.set(full, (wikiCounts.get(full) || 0) + 1)
  }

  const findings: LintFinding[] = []

  for (const [ref, count] of wikiCounts.entries()) {
    const inner = ref.slice(2, -2)
    const target = normalizeWikilinkTarget(inner)
    const classification = classifyWikilink(target, index)
    if (!classification) continue
    findings.push({
      kind: classification.kind,
      ref,
      count,
      suggestion: classification.suggestion
    })
  }

  // Step 2: Markdown-Single-Bracket-Kandidaten
  const mdCands = findMarkdownLinkCandidates(content)
  for (const cand of mdCands) {
    const suggestion = findMarkdownLinkMatch(cand, index)
    if (!suggestion) continue
    const candCount = (content.match(escapeForCount(cand)) || []).length
    findings.push({
      kind: 'markdown-link',
      ref: cand,
      count: candCount || 1,
      suggestion
    })
  }

  // Sortierung: hallucinations zuerst, dann suggestions, dann markdown-links
  const order: Record<string, number> = {
    hallucination: 0,
    suggestion: 1,
    'markdown-link': 2
  }
  findings.sort((a, b) => (order[a.kind] ?? 9) - (order[b.kind] ?? 9))
  return findings
}

/** Hilfsfunktion: erzeugt eine RegExp, die das Literal exakt zählt. */
function escapeForCount(literal: string): RegExp {
  const escaped = literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(escaped, 'g')
}

/**
 * Hängt eine Markdown-Sektion mit den Findings an den Status-Inhalt an.
 * Bewusst keine Inline-Annotation — Status-Notiz bleibt sauber lesbar.
 */
export function appendFindingsSection(
  content: string,
  findings: LintFinding[],
  index: VaultIndex,
  lang: 'de' | 'en' = 'de'
): string {
  if (findings.length === 0) return content

  const halluc = findings.filter(f => f.kind === 'hallucination')
  const sugg = findings.filter(f => f.kind === 'suggestion')
  const mdLinks = findings.filter(f => f.kind === 'markdown-link')

  const lines: string[] = ['', '---', '']

  if (lang === 'de') {
    lines.push('## Hinweise zur Datenqualität')
    lines.push('')
    lines.push('Diese automatische Prüfung vergleicht jeden Verweis mit deinem Vault. Du musst nichts davon tun — es sind nur Hinweise.')
    lines.push('')
    if (halluc.length > 0) {
      lines.push(`### ⚠ Vermutlich erfunden (${halluc.length})`)
      lines.push('')
      for (const f of halluc) {
        lines.push(`- \`${f.ref}\` — ${f.count}× im Dokument, keine passende Notiz im Vault gefunden`)
      }
      lines.push('')
    }
    if (sugg.length > 0) {
      lines.push(`### 💡 Link-Vorschläge (${sugg.length})`)
      lines.push('')
      lines.push('Diese Verweise existieren als Datei — mit ZK-ID oder Emoji-Präfix. Für klickbare Links besser den vollen Namen verwenden:')
      lines.push('')
      for (const f of sugg) {
        lines.push(`- \`${f.ref}\` → \`[[${f.suggestion}]]\``)
      }
      lines.push('')
    }
    if (mdLinks.length > 0) {
      lines.push(`### 📝 Vielleicht ein Wikilink gemeint? (${mdLinks.length})`)
      lines.push('')
      for (const f of mdLinks) {
        lines.push(`- \`${f.ref}\` → vermutlich \`[[${f.suggestion}]]\``)
      }
      lines.push('')
    }
    lines.push(`*Geprüft gegen ${index.indexSize} Markdown-Dateien · ${index.brainCount} Brain-Tage.*`)
  } else {
    lines.push('## Data quality notes')
    lines.push('')
    lines.push('Automatic check against your vault. Suggestions only — you decide what to do with them.')
    lines.push('')
    if (halluc.length > 0) {
      lines.push(`### ⚠ Likely invented (${halluc.length})`)
      lines.push('')
      for (const f of halluc) {
        lines.push(`- \`${f.ref}\` — ${f.count}× in document, no matching note found in vault`)
      }
      lines.push('')
    }
    if (sugg.length > 0) {
      lines.push(`### 💡 Link suggestions (${sugg.length})`)
      lines.push('')
      lines.push('These references exist as files — with ID prefix or emoji marker. For clickable links use the full name:')
      lines.push('')
      for (const f of sugg) {
        lines.push(`- \`${f.ref}\` → \`[[${f.suggestion}]]\``)
      }
      lines.push('')
    }
    if (mdLinks.length > 0) {
      lines.push(`### 📝 Possibly meant as wikilink? (${mdLinks.length})`)
      lines.push('')
      for (const f of mdLinks) {
        lines.push(`- \`${f.ref}\` → likely \`[[${f.suggestion}]]\``)
      }
      lines.push('')
    }
    lines.push(`*Checked against ${index.indexSize} Markdown files · ${index.brainCount} Brain days.*`)
  }

  return content + lines.join('\n') + '\n'
}
