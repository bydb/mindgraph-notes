/**
 * Linkziel für eine Vault-Datei — gemeinsam genutzt von der `[[`-Vervollständigung
 * und vom Ziehen aus dem Dateibaum (docs/codex-collab/filetree-drag-link.md).
 *
 * Regeln:
 * - Kurzname, wenn er eindeutig auflöst; sonst der vault-relative Pfad.
 *   Notizen: Kurzname = Dateiname ohne `.md`. `findNoteForWikilink` prüft nach dem
 *   vollen Pfad zuerst den H1-Titel, dann den Dateinamen — ein Kurzname ist deshalb
 *   nur eindeutig, wenn ihn keine ANDERE Notiz als Dateiname ODER als H1 trägt
 *   (Codex F21: `A.md` mit H1 „B“ würde `[[B]]` sonst auf A umlenken).
 *   Andere Dateien: Dateiname mit Endung, eindeutig über alle Vault-Dateien.
 * - Zeichen, die einen Wikilink zerbrechen (`| # ^ [ ]`), werden im tatsächlich
 *   ausgegebenen Ziel geprüft, nicht nur im Dateinamen (F18: Ordner `Projekt #3`).
 *   Dann gibt es keinen Link, sondern eine Begründung (F03: kein Ersatz-Link,
 *   der beim Klick nicht funktioniert).
 * - Bilder und PDFs werden beim Ziehen eingebettet, alles andere verlinkt.
 */

import { straightenQuotes } from './quoteNormalize'

export type VaultFileKind = 'note' | 'image' | 'pdf' | 'office' | 'other'

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'])
const OFFICE_EXTENSIONS = new Set(['docx', 'doc', 'xlsx', 'xls', 'pptx', 'ppt'])

/** Zeichen, die in einem Wikilink-Ziel nicht vorkommen dürfen. */
export const LINK_BREAKING_CHARS = ['|', '#', '^', '[', ']'] as const

function extensionOf(path: string): string {
  const base = baseName(path)
  const dot = base.lastIndexOf('.')
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : ''
}

function baseName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1)
}

function stripMd(path: string): string {
  return path.toLowerCase().endsWith('.md') ? path.slice(0, -3) : path
}

/** Vergleichsform wie in `findNoteForWikilink`: gerade Anführungszeichen, ohne Groß/klein. */
function key(text: string): string {
  return straightenQuotes(text.trim()).toLowerCase()
}

export function vaultFileKind(path: string): VaultFileKind {
  const ext = extensionOf(path)
  if (ext === 'md') return 'note'
  if (IMAGE_EXTENSIONS.has(ext)) return 'image'
  if (ext === 'pdf') return 'pdf'
  if (OFFICE_EXTENSIONS.has(ext)) return 'office'
  return 'other'
}

interface TreeEntry {
  path: string
  isDirectory: boolean
  children?: TreeEntry[]
}

/** Alle Dateien des Dateibaums in Baum-Reihenfolge, ohne Ordner. */
export function flattenFilePaths(tree: readonly TreeEntry[]): string[] {
  const out: string[] = []
  const walk = (entries: readonly TreeEntry[]) => {
    for (const e of entries) {
      if (e.isDirectory) {
        if (e.children) walk(e.children)
      } else {
        out.push(e.path)
      }
    }
  }
  walk(tree)
  return out
}

export interface LinkTargetContext {
  /** Alle Dateien des Vaults (vault-relativ), z. B. aus `flattenFilePaths`. */
  allPaths: readonly string[]
  /** Notizen mit ihrem H1-Titel — der Resolver prüft den Titel vor dem Dateinamen. */
  notes: ReadonlyArray<{ path: string; title: string }>
}

export type LinkTargetResult =
  | { ok: true; target: string; kind: VaultFileKind; embedByDefault: boolean }
  | { ok: false; reason: 'unsupported-name'; chars: string[]; kind: VaultFileKind }

function shortNameIsUnique(relPath: string, kind: VaultFileKind, ctx: LinkTargetContext): boolean {
  if (kind === 'note') {
    const wanted = key(stripMd(baseName(relPath)))
    const ownPath = key(relPath)
    for (const p of ctx.allPaths) {
      if (key(p) === ownPath || vaultFileKind(p) !== 'note') continue
      if (key(stripMd(baseName(p))) === wanted) return false
    }
    for (const n of ctx.notes) {
      if (key(n.path) === ownPath) continue
      if (key(n.title) === wanted) return false
    }
    return true
  }
  const wanted = key(baseName(relPath))
  const ownPath = key(relPath)
  for (const p of ctx.allPaths) {
    if (key(p) === ownPath) continue
    if (key(baseName(p)) === wanted) return false
  }
  return true
}

export function buildFileLinkTarget(relPath: string, ctx: LinkTargetContext): LinkTargetResult {
  const kind = vaultFileKind(relPath)
  const unique = shortNameIsUnique(relPath, kind, ctx)
  const full = kind === 'note' ? stripMd(relPath) : relPath
  const target = unique ? (kind === 'note' ? stripMd(baseName(relPath)) : baseName(relPath)) : full
  const chars = LINK_BREAKING_CHARS.filter(c => target.includes(c))
  if (chars.length > 0) return { ok: false, reason: 'unsupported-name', chars: [...chars], kind }
  return { ok: true, target, kind, embedByDefault: kind === 'image' || kind === 'pdf' }
}

/** Fertiges Markdown für einen Drop: Bild/PDF eingebettet, sonst Link. */
export function fileDropMarkdown(result: Extract<LinkTargetResult, { ok: true }>): string {
  return result.embedByDefault ? `![[${result.target}]]` : `[[${result.target}]]`
}

/** Datentyp, den der Dateibaum beim Ziehen mitgibt: JSON-Liste vault-relativer Dateipfade. */
export const VAULT_FILES_DRAG_TYPE = 'application/x-mindgraph-vault-files'

/** Liest die Pfadliste aus dem Drag-Datentyp; alles Unerwartete ergibt eine leere Liste. */
export function parseVaultFilesDrag(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((p): p is string => typeof p === 'string' && p.length > 0) : []
  } catch {
    return []
  }
}

export interface FileDropPlan {
  /** Einzufügendes Markdown; leer, wenn nichts verlinkbar war. */
  markdown: string
  /** Als eigener Block (eigene Zeile) einfügen: bei Einbettungen oder mehreren Dateien. */
  block: boolean
  /** Dateinamen, die wegen `# | ^ [ ]` nicht verlinkt wurden — für den Hinweis. */
  skipped: string[]
}

/**
 * Was ein Drop aus dem Dateibaum einfügt. Mehrere Dateien: je eine Zeile in der gegebenen
 * (Dateibaum-)Reihenfolge. Die geöffnete Notiz selbst wird übersprungen; nicht verlinkbare
 * Namen werden gesammelt, die übrigen trotzdem eingefügt (Codex F16).
 */
export function planFileDrop(paths: readonly string[], ctx: LinkTargetContext, currentNotePath: string | null): FileDropPlan {
  const lines: string[] = []
  const skipped: string[] = []
  let hasEmbed = false
  for (const p of paths) {
    if (currentNotePath && p === currentNotePath) continue
    const r = buildFileLinkTarget(p, ctx)
    if (!r.ok) {
      skipped.push(baseName(p))
      continue
    }
    if (r.embedByDefault) hasEmbed = true
    lines.push(fileDropMarkdown(r))
  }
  return { markdown: lines.join('\n'), block: hasEmbed || lines.length > 1, skipped }
}
