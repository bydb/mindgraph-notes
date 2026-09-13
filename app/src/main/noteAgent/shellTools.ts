import { promises as fs } from 'fs'
import * as path from 'path'
import { randomBytes } from 'crypto'
import type { AppTool } from '../llm/toolRegistry'
import type { NoteAgentContext } from './skills'
import { executeShell, requireShell, MAX_SHELL_TIMEOUT_MS } from './shellExecution'
import { registerResult, type AgentResultEntry } from './runRegistry'
import { sanitizeOutputFileName, writeStagingFile } from './staging'

export const shellExecuteTool: AppTool<NoteAgentContext> = {
  name: 'shell_execute',
  description: 'Führt einen Shell-Befehl oder ein Skript mit Benutzerrechten aus (Bash auf macOS/Linux, PowerShell auf Windows). Jeder Aufruf startet neu im Arbeitsordner; kein interaktives Terminal. Python/Node müssen installiert sein. stdout, stderr und Exit-Code kommen zurück. Ergebnisdateien im Arbeitsordner erzeugen und anschließend mit shell_stage_file zur Übernahme anbieten.',
  parameters: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'Vollständiger Befehl, mehrzeiliger Code erlaubt. Pfade korrekt für die Shell quoten.' },
      timeout_ms: { type: 'number', description: `Zeitlimit in Millisekunden, Standard 30000, höchstens ${MAX_SHELL_TIMEOUT_MS}.` }
    },
    required: ['command']
  },
  isWrite: true,
  run: async (args, ctx) => {
    const result = await executeShell(ctx.run, args.command, args.timeout_ms)
    const ok = result.exitCode === 0 && !result.timedOut
    ctx.onStep?.('shell_execute', `${ok ? 'Beendet' : 'Fehler'} · Exit ${result.exitCode ?? result.signal ?? '?'}${result.timedOut ? ' · Zeitlimit erreicht' : ''}${result.truncated ? ' · Ausgabe gekürzt' : ''}\n${result.stdout}${result.stderr ? `\nstderr:\n${result.stderr}` : ''}`)
    return { ok, content: JSON.stringify(result) }
  }
}

const OUTPUT_KINDS: Record<string, AgentResultEntry['kind']> = {
  '.md': 'md', '.txt': 'txt', '.csv': 'csv', '.xlsx': 'xlsx', '.docx': 'docx',
  '.html': 'html', '.htm': 'html', '.png': 'png', '.jpg': 'jpg', '.jpeg': 'jpg',
  '.pdf': 'pdf', '.pptx': 'pptx'
}
const MAX_RESULT_BYTES = 25 * 1024 * 1024

export const shellStageFileTool: AppTool<NoteAgentContext> = {
  name: 'shell_stage_file',
  description: 'Bietet eine im Shell-Arbeitsordner erzeugte Datei als Ergebnis zur Übernahme an. Unterstützt Markdown, Text, CSV, Excel, Word, PowerPoint, PDF, HTML, PNG und JPEG, höchstens 25 MB je Datei. Kopiert den aktuellen Stand; ersetzt kein bestehendes Ergebnis. Shell-Nebenwirkungen werden dadurch nicht rückgängig gemacht.',
  parameters: {
    type: 'object',
    properties: {
      file: { type: 'string', description: 'Relativer Pfad im Shell-Arbeitsordner.' },
      summary: { type: 'string', description: 'Kurze Beschreibung des erzeugten Ergebnisses.' }
    },
    required: ['file']
  },
  isWrite: true,
  run: async (args, ctx) => {
    const shell = requireShell(ctx.run)
    if (typeof args.file !== 'string' || !args.file.trim()) throw new Error('Dateipfad fehlt')
    if (ctx.run.results.size >= 10) throw new Error('Höchstens zehn Ergebnisse pro Shell-Lauf.')
    const root = await fs.realpath(shell.cwd)
    const lexical = path.resolve(root, args.file)
    if (!lexical.startsWith(root + path.sep)) throw new Error('Datei liegt außerhalb des Shell-Arbeitsordners')
    const real = await fs.realpath(lexical)
    if (!real.startsWith(root + path.sep)) throw new Error('Datei liegt außerhalb des Shell-Arbeitsordners')
    const ext = path.extname(lexical).toLowerCase()
    const kind = OUTPUT_KINDS[ext]
    if (!kind) throw new Error('Dieses Ergebnisformat wird nicht unterstützt')
    const handle = await fs.open(real, 'r')
    let data: Buffer
    try {
      const stat = await handle.stat()
      if (!stat.isFile() || stat.size === 0 || stat.size > MAX_RESULT_BYTES) throw new Error('Ergebnis muss eine nicht leere Datei mit höchstens 25 MB sein')
      data = Buffer.alloc(stat.size)
      let offset = 0
      while (offset < data.length) {
        const { bytesRead } = await handle.read(data, offset, data.length - offset, offset)
        if (!bytesRead) throw new Error('Datei hat sich beim Lesen verändert')
        offset += bytesRead
      }
      const after = await handle.stat()
      if (after.size !== stat.size || after.mtimeMs !== stat.mtimeMs) throw new Error('Datei hat sich beim Lesen verändert')
    } finally { await handle.close() }
    requireShell(ctx.run)
    const suggestedName = sanitizeOutputFileName(path.basename(lexical), ext)
    const stagingPath = await writeStagingFile(ctx.run, `shell-${randomBytes(8).toString('hex')}${ext}`, data)
    const entry = registerResult(ctx.run, {
      stagingPath, suggestedName, kind,
      summary: typeof args.summary === 'string' ? args.summary.slice(0, 500) : 'Mit Shell erzeugt',
      sources: [...ctx.run.sources, 'Shell-Ausführung']
    })
    if (!entry) {
      await fs.rm(stagingPath, { force: true })
      throw new Error('Abgebrochen')
    }
    return { ok: true, content: `Ergebnis zur Übernahme bereit: ${suggestedName} (${data.length} Bytes).` }
  }
}
