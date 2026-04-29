// Notes-Tools für den Telegram-Agent.
// note_search · note_read · note_create · note_append
//
// Pfade werden via path.resolve + Vault-Root-Check gegen Path-Traversal gesichert.

import { promises as fs } from 'fs'
import path from 'path'
import { searchVault } from '../../vaultQueries'
import type { AppTool, ToolContext } from './registry'

function resolveInVault(vaultRoot: string, relativePath: string): string {
  // Akzeptiert nur Vault-relative Pfade. Absolute Pfade werden abgewiesen.
  if (path.isAbsolute(relativePath)) {
    throw new Error('Absoluter Pfad nicht erlaubt — bitte Vault-relativen Pfad nutzen.')
  }
  const resolved = path.resolve(vaultRoot, relativePath)
  const rootResolved = path.resolve(vaultRoot)
  if (resolved !== rootResolved && !resolved.startsWith(rootResolved + path.sep)) {
    throw new Error('Pfad liegt außerhalb des Vaults.')
  }
  return resolved
}

function timestampYmdHm(): string {
  const d = new Date()
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
    String(d.getHours()).padStart(2, '0'),
    String(d.getMinutes()).padStart(2, '0')
  ].join('')
}

function sanitizeTitleForFilename(title: string): string {
  return title
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')
    .replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue')
    .replace(/ß/g, 'ss')
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 80) || 'Notiz'
}

function escapeYamlString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map(v => String(v ?? '').replace(/[\r\n:{}[\]|>&*!,#"']/g, '').trim())
    .filter(Boolean)
}

export const noteSearchTool: AppTool = {
  name: 'note_search',
  description: 'Sucht Notizen im Vault nach Stichworten. Gibt eine Liste der besten Treffer mit Pfad und Auszug zurück.',
  isWrite: false,
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Suchbegriffe, durch Leerzeichen getrennt.' },
      max_results: { type: 'integer', description: 'Maximale Anzahl Treffer (Default 5).' }
    },
    required: ['query']
  },
  async run(args, ctx: ToolContext) {
    const query = String(args.query ?? '').trim()
    if (!query) return { ok: false, content: 'Fehler: query ist leer.' }
    const maxResults = Number(args.max_results ?? 5)
    const hits = await searchVault({
      vaultPath: ctx.vaultPath,
      excludedFolders: ctx.excludedFolders,
      query,
      maxResults: Math.min(20, Math.max(1, maxResults)),
      maxChars: 6000
    })
    if (hits.length === 0) {
      return { ok: true, content: 'Keine Treffer.', display: `🔍 _Keine Treffer für „${query}"._` }
    }
    const json = JSON.stringify(hits.map(h => ({ path: h.notePath, excerpt: h.excerpt })), null, 2)
    return {
      ok: true,
      content: json,
      display: `🔍 _${hits.length} Treffer für „${query}"._`
    }
  }
}

export const noteReadTool: AppTool = {
  name: 'note_read',
  description: 'Liest den vollen Inhalt einer Notiz. Pfad ist relativ zum Vault-Root.',
  isWrite: false,
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Vault-relativer Pfad zur .md-Datei.' }
    },
    required: ['path']
  },
  async run(args, ctx: ToolContext) {
    const rel = String(args.path ?? '').trim()
    if (!rel) return { ok: false, content: 'Fehler: path fehlt.' }
    if (!rel.toLowerCase().endsWith('.md')) {
      return { ok: false, content: 'Fehler: note_read kann nur Markdown-Dateien (.md) lesen.' }
    }
    const abs = resolveInVault(ctx.vaultPath, rel)
    try {
      const content = await fs.readFile(abs, 'utf-8')
      const truncated = content.length > 8000 ? content.slice(0, 8000) + '\n\n[…gekürzt]' : content
      return { ok: true, content: truncated, display: `📄 _gelesen: ${rel} (${content.length} Zeichen)_` }
    } catch (err) {
      return { ok: false, content: `Fehler beim Lesen: ${err instanceof Error ? err.message : String(err)}` }
    }
  }
}

export const noteCreateTool: AppTool = {
  name: 'note_create',
  description: 'Erstellt eine neue Notiz im Inbox-Ordner (oder im angegebenen Ordner) im MindGraph-Quick-Capture-Format.',
  isWrite: true,
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Titel der Notiz (wird als YAML-title und Dateiname verwendet).' },
      content: { type: 'string', description: 'Markdown-Inhalt der Notiz.' },
      folder: { type: 'string', description: 'Optionaler Ordner relativ zum Vault. Default: Inbox-Ordner aus den Bot-Settings.' },
      category: { type: 'string', description: 'Optionales Kategorie-Emoji für Dateiname und Frontmatter. Default: 🟢.' },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optionale Tags ohne führendes #.'
      }
    },
    required: ['title', 'content']
  },
  async run(args, ctx: ToolContext) {
    const title = String(args.title ?? '').trim()
    if (!title) return { ok: false, content: 'Fehler: title fehlt.' }
    const content = String(args.content ?? '').trim()
    const folder = String(args.folder ?? ctx.inboxFolder ?? '').trim()
    const category = String(args.category ?? '🟢').trim() || '🟢'
    const tags = normalizeTags(args.tags)
    const safeTitle = sanitizeTitleForFilename(title)
    const filename = `${timestampYmdHm()} - ${category} ${safeTitle}.md`
    const relPath = folder ? path.join(folder, filename) : filename
    const abs = resolveInVault(ctx.vaultPath, relPath)
    try {
      await fs.mkdir(path.dirname(abs), { recursive: true })
      // Falls Datei existiert: nicht überschreiben — Suffix anhängen
      let finalAbs = abs
      let finalRel = relPath
      let attempt = 1
      while (await fileExists(finalAbs)) {
        attempt += 1
        const variant = `${timestampYmdHm()} - ${category} ${safeTitle} (${attempt}).md`
        finalRel = folder ? path.join(folder, variant) : variant
        finalAbs = resolveInVault(ctx.vaultPath, finalRel)
      }

      const frontmatterLines = ['---']
      frontmatterLines.push(`title: "${escapeYamlString(title)}"`)
      frontmatterLines.push(`date: ${new Date().toISOString()}`)
      if (tags.length > 0) {
        frontmatterLines.push('tags:')
        for (const tag of tags) frontmatterLines.push(`  - ${tag}`)
      }
      frontmatterLines.push(`category: ${category}`)
      frontmatterLines.push('---')
      frontmatterLines.push('')

      const bodyContent = content || title
      const body = `${frontmatterLines.join('\n')}${bodyContent}\n`
      await fs.writeFile(finalAbs, body, 'utf-8')
      return { ok: true, content: `Notiz erstellt: ${finalRel}`, display: `✅ _Notiz angelegt:_ \`${finalRel}\`` }
    } catch (err) {
      return { ok: false, content: `Fehler beim Erstellen: ${err instanceof Error ? err.message : String(err)}` }
    }
  }
}

export const noteAppendTool: AppTool = {
  name: 'note_append',
  description: 'Hängt Text ans Ende einer existierenden Notiz an (mit führender Leerzeile).',
  isWrite: true,
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Vault-relativer Pfad zur .md-Datei.' },
      content: { type: 'string', description: 'Text, der ans Ende angehängt wird.' }
    },
    required: ['path', 'content']
  },
  async run(args, ctx: ToolContext) {
    const rel = String(args.path ?? '').trim()
    const content = String(args.content ?? '')
    if (!rel) return { ok: false, content: 'Fehler: path fehlt.' }
    if (!content) return { ok: false, content: 'Fehler: content ist leer.' }
    const abs = resolveInVault(ctx.vaultPath, rel)
    if (!(await fileExists(abs))) return { ok: false, content: `Datei nicht gefunden: ${rel}` }
    try {
      const existing = await fs.readFile(abs, 'utf-8')
      const sep = existing.endsWith('\n\n') ? '' : existing.endsWith('\n') ? '\n' : '\n\n'
      await fs.writeFile(abs, existing + sep + content + '\n', 'utf-8')
      return { ok: true, content: `Angehängt an ${rel}`, display: `✅ _Notiz erweitert:_ \`${rel}\`` }
    } catch (err) {
      return { ok: false, content: `Fehler beim Anhängen: ${err instanceof Error ? err.message : String(err)}` }
    }
  }
}

async function fileExists(abs: string): Promise<boolean> {
  try {
    await fs.access(abs)
    return true
  } catch {
    return false
  }
}
