// Skills des Notiz-Agenten (Phase 2) — Instanziierung der generischen ToolRegistry.
// isWrite bedeutet hier: schreibt ins Staging (harmlos) — die Vertrauensgrenze ist
// die Übernahme durch den Nutzer (Ergebnis-Karten), NICHT ein Confirm-Flow.
// Entscheidung 11: Write-Skills nehmen strukturierte Daten, nie Binärformate vom LLM.

import { promises as fs } from 'fs'
import * as path from 'path'
import { ToolRegistry, type ToolResult } from '../llm/toolRegistry'
import { noteReadTool, noteSearchTool } from '../telegram/agent/tools/notes'
import type { ToolContext as TelegramToolContext } from '../telegram/agent/tools/registry'
import { getContextAttachmentInfos, readAttachmentRaw } from './contextFiles'
import { registerResult, type AgentRun } from './runRegistry'
import { sanitizeOutputFileName, writeStagingFile } from './staging'
import { markdownToDocx } from '../office/officeService'

export interface NoteAgentContext {
  senderId: number
  run: AgentRun
}

// Die Vault-Lese-Skills (note_read/note_search) sind Adapter auf die erprobten
// Telegram-Tools — gleiche Pfad-Schutzlogik (resolveInVault), anderer Kontext.
function telegramCtx(ctx: NoteAgentContext): TelegramToolContext {
  return {
    vaultPath: ctx.run.vaultPath,
    excludedFolders: [],
    inboxFolder: '',
    projectsRootFolder: '',
    embeddingModel: ''
  }
}

function err(message: string): ToolResult {
  return { ok: false, content: `Fehler: ${message}` }
}

function requireString(args: Record<string, unknown>, key: string): string | null {
  const v = args[key]
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

async function registerStagedResult(
  ctx: NoteAgentContext,
  fileName: string,
  kind: 'md' | 'xlsx' | 'docx' | 'txt' | 'csv',
  data: Buffer | string,
  summary: string
): Promise<ToolResult> {
  const stagingPath = await writeStagingFile(ctx.run, fileName, data)
  const entry = registerResult(ctx.run, {
    stagingPath,
    suggestedName: fileName,
    kind,
    summary,
    sources: Array.from(ctx.run.sources)
  })
  if (!entry) {
    await fs.rm(stagingPath, { force: true }).catch(() => undefined)
    return err('Lauf wurde abgebrochen — Ergebnis verworfen')
  }
  return {
    ok: true,
    content: `Datei "${fileName}" wurde erzeugt (${summary}). Sie wird dem Nutzer als Ergebnis-Karte zur Übernahme in den Zielordner angezeigt. Erzeuge sie NICHT erneut.`,
    display: `${fileName} — ${summary}`
  }
}

export function createNoteAgentRegistry(): ToolRegistry<NoteAgentContext> {
  const registry = new ToolRegistry<NoteAgentContext>()

  registry.register({
    name: 'read_attachment',
    description: 'Liest eine vom Nutzer angehängte Kontext-Datei (oder ein Ordner-Manifest mit Inhalten). Parameter: name = exakter Dateiname aus der Anhang-Liste.',
    parameters: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Dateiname des Anhangs, z.B. "liste.xlsx"' } },
      required: ['name']
    },
    isWrite: false,
    run: async (args, ctx) => {
      const name = requireString(args, 'name')
      if (!name) return err('Parameter "name" fehlt')
      const infos = getContextAttachmentInfos(ctx.senderId, ctx.run.attachmentIds)
      const info = infos.find(i => i.name === name) || infos.find(i => i.name.toLowerCase() === name.toLowerCase())
      if (!info) return err(`Anhang "${name}" nicht gefunden. Verfügbar: ${infos.map(i => i.name).join(', ') || '(keine)'}`)
      const res = await readAttachmentRaw(ctx.senderId, info.id, ctx.run.instruction)
      ctx.run.sources.add(info.name)
      return { ok: true, content: res.content, display: `read_attachment: ${info.name}` }
    }
  })

  registry.register({
    name: 'note_read',
    description: noteReadTool.description,
    parameters: noteReadTool.parameters,
    isWrite: false,
    run: async (args, ctx) => {
      const res = await noteReadTool.run(args, telegramCtx(ctx))
      const rel = requireString(args, 'path')
      if (res.ok && rel) ctx.run.sources.add(`[[${path.basename(rel, '.md')}]]`)
      // display neutral halten (Telegram-Displays tragen Emojis — hier Klartext-Protokoll).
      return { ...res, display: rel ? `note_read: ${rel}` : undefined }
    }
  })

  registry.register({
    name: 'note_search',
    description: noteSearchTool.description,
    parameters: noteSearchTool.parameters,
    isWrite: false,
    run: async (args, ctx) => {
      const res = await noteSearchTool.run(args, telegramCtx(ctx))
      const query = requireString(args, 'query')
      return { ...res, display: query ? `note_search: „${query}"` : undefined }
    }
  })

  registry.register({
    name: 'list_target_folder',
    description: 'Listet die Dateien im Zielordner (für Namenskollisionen und vorhandene Vorlagen).',
    parameters: { type: 'object', properties: {} },
    isWrite: false,
    run: async (_args, ctx) => {
      const dir = path.join(ctx.run.vaultPath, ctx.run.targetFolderRel)
      const entries = await fs.readdir(dir, { withFileTypes: true })
      const files = entries.filter(e => e.isFile() && !e.name.startsWith('.')).map(e => e.name)
      return { ok: true, content: files.length ? files.join('\n') : '(Zielordner ist leer)', display: 'list_target_folder' }
    }
  })

  registry.register({
    name: 'write_xlsx',
    description: 'Erzeugt eine Excel-Datei im Staging. Parameter: file_name, columns (Spaltenüberschriften), rows (Zeilen als Array von String-Arrays, gleiche Länge wie columns).',
    parameters: {
      type: 'object',
      properties: {
        file_name: { type: 'string' },
        columns: { type: 'array', items: { type: 'string' } },
        rows: { type: 'array', items: { type: 'array', items: { type: 'string' } } }
      },
      required: ['file_name', 'columns', 'rows']
    },
    isWrite: true,
    run: async (args, ctx) => {
      const rawName = requireString(args, 'file_name')
      const columns = args.columns
      const rows = args.rows
      if (!rawName) return err('Parameter "file_name" fehlt')
      if (!Array.isArray(columns) || columns.length === 0 || !columns.every(c => typeof c === 'string')) {
        return err('Parameter "columns" muss ein nicht-leeres Array aus Strings sein')
      }
      if (!Array.isArray(rows) || !rows.every(r => Array.isArray(r))) {
        return err('Parameter "rows" muss ein Array aus Zeilen-Arrays sein')
      }
      const fileName = sanitizeOutputFileName(rawName, '.xlsx')
      const XLSX = await import('xlsx')
      const aoa = [columns as string[], ...(rows as unknown[][]).map(r => r.map(cell => String(cell ?? '')))]
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Tabelle1')
      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
      return registerStagedResult(ctx, fileName, 'xlsx', buf, `${rows.length} Zeilen, ${columns.length} Spalten`)
    }
  })

  registry.register({
    name: 'write_docx',
    description: 'Erzeugt eine Word-Datei aus Markdown im Staging. Parameter: file_name, markdown.',
    parameters: {
      type: 'object',
      properties: { file_name: { type: 'string' }, markdown: { type: 'string' } },
      required: ['file_name', 'markdown']
    },
    isWrite: true,
    run: async (args, ctx) => {
      const rawName = requireString(args, 'file_name')
      const markdown = requireString(args, 'markdown')
      if (!rawName) return err('Parameter "file_name" fehlt')
      if (!markdown) return err('Parameter "markdown" fehlt oder ist leer')
      const fileName = sanitizeOutputFileName(rawName, '.docx')
      // markdownToDocx schreibt selbst — in eine temp-Datei im Staging rendern lassen.
      const stagingPath = await writeStagingFile(ctx.run, fileName, '')
      await markdownToDocx(markdown, stagingPath)
      await fs.rm(stagingPath + '.tmp', { force: true }).catch(() => undefined)
      const entry = registerResult(ctx.run, {
        stagingPath,
        suggestedName: fileName,
        kind: 'docx',
        summary: `${markdown.split(/\s+/).length} Wörter`,
        sources: Array.from(ctx.run.sources)
      })
      if (!entry) {
        await fs.rm(stagingPath, { force: true }).catch(() => undefined)
        return err('Lauf wurde abgebrochen — Ergebnis verworfen')
      }
      return {
        ok: true,
        content: `Datei "${fileName}" wurde erzeugt. Sie wird dem Nutzer zur Übernahme angezeigt. Erzeuge sie NICHT erneut.`,
        display: `${fileName} — Word-Dokument`
      }
    }
  })

  registry.register({
    name: 'write_note',
    description: 'Erzeugt eine Markdown-Notiz im Staging. Parameter: file_name, markdown.',
    parameters: {
      type: 'object',
      properties: { file_name: { type: 'string' }, markdown: { type: 'string' } },
      required: ['file_name', 'markdown']
    },
    isWrite: true,
    run: async (args, ctx) => {
      const rawName = requireString(args, 'file_name')
      const markdown = requireString(args, 'markdown')
      if (!rawName) return err('Parameter "file_name" fehlt')
      if (!markdown) return err('Parameter "markdown" fehlt oder ist leer')
      const fileName = sanitizeOutputFileName(rawName, '.md')
      return registerStagedResult(ctx, fileName, 'md', markdown, `${markdown.split(/\s+/).length} Wörter`)
    }
  })

  return registry
}
