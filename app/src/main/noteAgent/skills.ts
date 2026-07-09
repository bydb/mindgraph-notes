// Skills des Notiz-Agenten (Phase 2) — Instanziierung der generischen ToolRegistry.
// isWrite bedeutet hier: schreibt ins Staging (harmlos) — die Vertrauensgrenze ist
// die Übernahme durch den Nutzer (Ergebnis-Karten), NICHT ein Confirm-Flow.
// Entscheidung 11: Write-Skills nehmen strukturierte Daten, nie Binärformate vom LLM.

import { promises as fs } from 'fs'
import * as path from 'path'
import { ToolRegistry, type ToolResult } from '../llm/toolRegistry'
import { noteReadTool, noteSearchTool } from '../telegram/agent/tools/notes'
import type { ToolContext as TelegramToolContext } from '../telegram/agent/tools/registry'
import { getContextAttachmentInfos, readAttachmentRaw, extractFileContentRaw } from './contextFiles'
import { registerResult, type AgentRun } from './runRegistry'
import { sanitizeOutputFileName, writeStagingFile } from './staging'
import { readSkillBody, listSkillFiles, resolveSkillFile } from './skillsLoader'
import { markdownToDocx } from '../office/officeService'
import { fillDocxTableCells, MAX_FILL_ENTRIES, type DocxCellEntry } from '../../shared/docxTableFill'
import { buildScientificHtmlPage, looksLikeFullHtmlDocument } from '../../shared/scientificHtmlPage'

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

// Vault-relative Pfadauflösung mit Traversal-Schutz — gleiche Logik wie
// resolveInVault in telegram/agent/tools/notes.ts (dort nicht exportiert).
function resolveInVault(vaultRoot: string, relativePath: string): string {
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

const MAX_FORM_TEMPLATE_BYTES = 10 * 1024 * 1024

function requireString(args: Record<string, unknown>, key: string): string | null {
  const v = args[key]
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

async function registerStagedResult(
  ctx: NoteAgentContext,
  fileName: string,
  kind: 'md' | 'xlsx' | 'docx' | 'txt' | 'csv' | 'html',
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
    name: 'use_skill',
    description: 'Lädt die vollständige Arbeitsanleitung (Skill) des Nutzers. Parameter: name = Skill-Name aus der Skill-Liste. Passt ein Skill zur Aufgabe, lies ihn ZUERST und folge seiner Anleitung.',
    parameters: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Skill-Name aus der Liste im System-Prompt' } },
      required: ['name']
    },
    isWrite: false,
    run: async (args, ctx) => {
      const name = requireString(args, 'name')
      if (!name) return err('Parameter "name" fehlt')
      const skill =
        ctx.run.skills.find(s => s.name === name || s.folderName === name) ||
        ctx.run.skills.find(s => s.name.toLowerCase() === name.toLowerCase() || s.folderName.toLowerCase() === name.toLowerCase())
      if (!skill) {
        return err(`Skill "${name}" nicht gefunden. Verfügbar: ${ctx.run.skills.map(s => s.name).join(', ') || '(keine)'}`)
      }
      const body = await readSkillBody(ctx.run.vaultPath, skill.folderName)
      ctx.run.sources.add(`Skill: ${skill.name}`)
      // references/assets sichtbar machen (Stufe 3) — gelesen wird per read_skill_file.
      const files = await listSkillFiles(ctx.run.vaultPath, skill.folderName)
      const filesNote = files.length
        ? `\n\n[Zusatzdateien dieses Skills — bei Bedarf mit read_skill_file lesen: ${files.join(', ')}]`
        : ''
      return { ok: true, content: body + filesNote, display: `use_skill: ${skill.name}` }
    }
  })

  registry.register({
    name: 'read_skill_file',
    description: 'Liest eine Zusatzdatei eines Skills (references/, assets/). Parameter: skill = Skill-Name, file = Pfad aus der Zusatzdatei-Liste von use_skill.',
    parameters: {
      type: 'object',
      properties: {
        skill: { type: 'string', description: 'Skill-Name' },
        file: { type: 'string', description: 'Relativer Pfad innerhalb des Skills, z.B. references/vorlage.md' }
      },
      required: ['skill', 'file']
    },
    isWrite: false,
    run: async (args, ctx) => {
      const skillName = requireString(args, 'skill')
      const fileRel = requireString(args, 'file')
      if (!skillName || !fileRel) return err('Parameter "skill" und "file" sind erforderlich')
      const skill =
        ctx.run.skills.find(s => s.name === skillName || s.folderName === skillName) ||
        ctx.run.skills.find(s => s.name.toLowerCase() === skillName.toLowerCase() || s.folderName.toLowerCase() === skillName.toLowerCase())
      if (!skill) return err(`Skill "${skillName}" nicht gefunden`)
      const abs = await resolveSkillFile(ctx.run.vaultPath, skill.folderName, fileRel)
      const content = await extractFileContentRaw(abs)
      return { ok: true, content, display: `read_skill_file: ${skill.name}/${fileRel}` }
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

  // Formular-Vorlagen (amtliche DOCX ohne {{Platzhalter}}) zellenweise füllen —
  // Entscheidung 11 bleibt gewahrt: das LLM liefert strukturierte Zell-Einträge,
  // die Binärdatei baut deterministischer Code (shared/docxTableFill).
  // Die Feld→Zeilen-Zuordnung kommt aus der jeweiligen Vault-Skill (references/),
  // damit KEIN formular-spezifisches Wissen in den App-Code wandert.
  registry.register({
    name: 'fill_docx_form',
    description:
      'Füllt Tabellenzellen einer Word-Formularvorlage (.docx) aus dem Vault und erzeugt die ausgefüllte Datei im Staging. Für amtliche Formulare ohne Platzhalter — die Feld→Zeilen-Zuordnung steht in der zugehörigen Skill (use_skill/read_skill_file). Parameter: template (vault-relativer Pfad zur .docx-Vorlage), file_name, entries (Array aus {table, row, cell, text}; Indizes 0-basiert, text mit \\n für Absätze). Nur Felder mit Inhalt angeben.',
    parameters: {
      type: 'object',
      properties: {
        template: { type: 'string', description: 'Vault-relativer Pfad zur .docx-Vorlage' },
        file_name: { type: 'string', description: 'Dateiname der ausgefüllten .docx' },
        entries: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              table: { type: 'number', description: 'Top-Level-Tabellenindex, 0-basiert' },
              row: { type: 'number', description: 'Zeilenindex, 0-basiert' },
              cell: { type: 'number', description: 'Zellenindex, 0-basiert' },
              text: { type: 'string', description: 'Zellinhalt; \\n = neuer Absatz' }
            },
            required: ['table', 'row', 'cell', 'text']
          }
        }
      },
      required: ['template', 'file_name', 'entries']
    },
    isWrite: true,
    run: async (args, ctx) => {
      const templateRel = requireString(args, 'template')
      const rawName = requireString(args, 'file_name')
      if (!templateRel) return err('Parameter "template" fehlt')
      if (!rawName) return err('Parameter "file_name" fehlt')
      if (!templateRel.toLowerCase().endsWith('.docx')) return err('Vorlage muss eine .docx-Datei sein')
      const rawEntries = args.entries
      if (!Array.isArray(rawEntries) || rawEntries.length === 0) {
        return err('Parameter "entries" muss ein nicht-leeres Array sein')
      }
      if (rawEntries.length > MAX_FILL_ENTRIES) {
        return err(`Zu viele Einträge (${rawEntries.length}). Maximum: ${MAX_FILL_ENTRIES}.`)
      }
      const entries: DocxCellEntry[] = []
      for (const raw of rawEntries) {
        const e = raw as Record<string, unknown>
        if (typeof e !== 'object' || e === null) return err('Jeder Eintrag muss ein Objekt {table, row, cell, text} sein')
        const { table, row, cell, text } = e
        if (typeof table !== 'number' || typeof row !== 'number' || typeof cell !== 'number' || typeof text !== 'string') {
          return err('Eintrag unvollständig — table/row/cell als Zahlen, text als String erforderlich')
        }
        if (!text.trim()) continue // leere Felder still überspringen (bleiben in der Vorlage leer)
        entries.push({ table, row, cell, text })
      }
      if (entries.length === 0) return err('Alle Einträge waren leer — nichts zu schreiben')

      let templateBytes: Buffer
      try {
        const abs = resolveInVault(ctx.run.vaultPath, templateRel)
        const st = await fs.stat(abs)
        if (!st.isFile()) return err(`Vorlage "${templateRel}" ist keine Datei`)
        if (st.size > MAX_FORM_TEMPLATE_BYTES) return err(`Vorlage ist zu groß (${Math.round(st.size / 1024 / 1024)} MB, max. 10 MB)`)
        templateBytes = await fs.readFile(abs)
      } catch (e) {
        return err(`Vorlage "${templateRel}" konnte nicht gelesen werden: ${e instanceof Error ? e.message : String(e)}`)
      }

      try {
        const filled = await fillDocxTableCells(new Uint8Array(templateBytes), entries)
        const fileName = sanitizeOutputFileName(rawName, '.docx')
        ctx.run.sources.add(templateRel)
        return registerStagedResult(ctx, fileName, 'docx', Buffer.from(filled), `${entries.length} Formularfelder aus Vorlage ${path.basename(templateRel)}`)
      } catch (e) {
        return err(e instanceof Error ? e.message : String(e))
      }
    }
  })

  // Wissenschaftliche HTML-Seite (Entscheidung 11: LLM liefert Titel + Body-Inhalt,
  // das Dokument baut buildScientificHtmlPage). LaTeX bleibt als Quelltext in der
  // Datei und wird client-seitig von lokalem KaTeX gerendert; die Assets kopiert
  // der Accept-Handler neben die Seite (htmlAssets.ts).
  registry.register({
    name: 'write_html',
    description:
      'Erzeugt eine wissenschaftliche HTML-Seite im Staging (Formeln via LaTeX, Grafiken als Inline-SVG). Parameter: file_name, title (Seitentitel — wird als Überschrift gesetzt, NICHT im Body wiederholen), body_html (NUR vollständig ausgearbeiteter Artikel-Inhalt — niemals Platzhalter, Auslassungspunkte oder leere Gerüst-Elemente; kein html/head/body-Gerüst), optional lang ("de"/"en"). CSS-Klassen des Seiten-Templates: div.equation umschließt eine $$-Display-Formel (wird automatisch nummeriert); Inline-Formeln in \\( \\); figure.fig enthält ein Inline-SVG plus figcaption (wird automatisch als Abbildung nummeriert); div.abstract für die Zusammenfassung; div.table-wrap um Tabellen; section.references mit ol fürs Literaturverzeichnis, Textverweise als sup.cite-Anker. SVG-Regeln: viewBox setzen (z.B. 0 0 640 300), alle Koordinaten innerhalb der viewBox, polyline-points NUR mit Leerzeichen/Komma trennen (keine Semikolons), Farben aus var(--fig-line), var(--fig-line-2), var(--muted), var(--fig-grid) oder currentColor, Beschriftung als text-Elemente ohne LaTeX.',
    parameters: {
      type: 'object',
      properties: {
        file_name: { type: 'string' },
        title: { type: 'string', description: 'Seitentitel' },
        body_html: { type: 'string', description: 'Artikel-Inhalt als HTML (Sektionen, Formeln, SVG) — ohne Dokumentgerüst und ohne <h1>' },
        lang: { type: 'string', description: '"de" (Default) oder "en"' }
      },
      required: ['file_name', 'title', 'body_html']
    },
    isWrite: true,
    run: async (args, ctx) => {
      const rawName = requireString(args, 'file_name')
      const title = requireString(args, 'title')
      const bodyHtml = requireString(args, 'body_html')
      if (!rawName) return err('Parameter "file_name" fehlt')
      if (!title) return err('Parameter "title" fehlt')
      if (!bodyHtml) return err('Parameter "body_html" fehlt oder ist leer')
      if (looksLikeFullHtmlDocument(bodyHtml)) {
        return err('body_html enthält ein Dokumentgerüst (<html>/<head>/<body>) — übergib NUR den Artikel-Inhalt, das Seiten-Template kommt von der App')
      }
      const fileName = sanitizeOutputFileName(rawName, '.html')
      const html = buildScientificHtmlPage({
        title,
        bodyHtml,
        lang: typeof args.lang === 'string' ? args.lang : 'de'
      })
      return registerStagedResult(ctx, fileName, 'html', html, `${bodyHtml.split(/\s+/).length} Wörter, wissenschaftliche HTML-Seite`)
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
