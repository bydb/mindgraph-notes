// Tasks-Tools für den Telegram-Agent.
// task_list · task_toggle
//
// task_toggle flippt - [ ] ↔ - [x] an einer bestimmten Zeile einer Notiz.
// Sicherheits-Check: die Zielzeile muss tatsächlich ein Task sein, sonst Fehler.

import { promises as fs } from 'fs'
import path from 'path'
import { tasksDueToday, tasksOverdue, tasksThisWeek, scanAllTasks } from '../../vaultQueries'
import type { AppTool, ToolContext } from './registry'

const TASK_LINE_REGEX = /^([\s]*[-*]\s*\[)([ xX])(\].*)$/

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

export const taskListTool: AppTool = {
  name: 'task_list',
  description: 'Listet offene Tasks aus dem Vault. filter steuert: today | overdue | week | all.',
  isWrite: false,
  parameters: {
    type: 'object',
    properties: {
      filter: {
        type: 'string',
        enum: ['today', 'overdue', 'week', 'all'],
        description: 'Welche Tasks zurückgegeben werden sollen. Default: today.'
      },
      limit: { type: 'integer', description: 'Maximale Anzahl Treffer (Default 30).' }
    }
  },
  async run(args, ctx: ToolContext) {
    const filter = String(args.filter ?? 'today')
    const limit = Math.min(100, Math.max(1, Number(args.limit ?? 30)))
    const opts = { vaultPath: ctx.vaultPath, excludedFolders: ctx.excludedFolders }
    let hits
    switch (filter) {
      case 'overdue': hits = await tasksOverdue(opts); break
      case 'week': hits = await tasksThisWeek(opts); break
      case 'all': hits = (await scanAllTasks(opts)).filter(h => !h.task.completed); break
      default: hits = await tasksDueToday(opts); break
    }
    const data = hits.slice(0, limit).map(h => ({
      text: h.task.text,
      due: h.task.dueDate ? h.task.dueDate.toISOString().slice(0, 16) : null,
      overdue: h.task.isOverdue ?? false,
      critical: h.task.isCritical ?? false,
      path: h.notePath,
      line: h.task.line
    }))
    return {
      ok: true,
      content: JSON.stringify({ filter, total: hits.length, returned: data.length, tasks: data }, null, 2),
      display: `📋 _${data.length} Tasks gefunden (${filter})._`
    }
  }
}

export const taskToggleTool: AppTool = {
  name: 'task_toggle',
  description: 'Schaltet einen Task in einer Notiz zwischen offen [ ] und erledigt [x]. Erwartet Vault-Pfad und Zeilennummer (1-basiert) — diese kommen typischerweise aus task_list.',
  isWrite: true,
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Vault-relativer Pfad zur Notiz.' },
      line: { type: 'integer', description: '1-basierte Zeilennummer des Tasks.' },
      done: { type: 'boolean', description: 'true = abhaken, false = wieder öffnen. Wenn weggelassen: toggelt.' }
    },
    required: ['path', 'line']
  },
  async run(args, ctx: ToolContext) {
    const rel = String(args.path ?? '').trim()
    const line = Number(args.line)
    const explicitDone = typeof args.done === 'boolean' ? (args.done as boolean) : null
    if (!rel) return { ok: false, content: 'Fehler: path fehlt.' }
    if (!Number.isInteger(line) || line < 1) return { ok: false, content: 'Fehler: line muss eine positive Ganzzahl sein.' }

    const abs = resolveInVault(ctx.vaultPath, rel)
    let content: string
    try {
      content = await fs.readFile(abs, 'utf-8')
    } catch (err) {
      return { ok: false, content: `Fehler beim Lesen: ${err instanceof Error ? err.message : String(err)}` }
    }
    const lines = content.split('\n')
    if (line > lines.length) return { ok: false, content: `Zeile ${line} liegt außerhalb der Datei (${lines.length} Zeilen).` }

    const target = lines[line - 1]
    const match = target.match(TASK_LINE_REGEX)
    if (!match) {
      return { ok: false, content: `Zeile ${line} ist kein Task: "${target.slice(0, 80)}"` }
    }
    const wasDone = match[2].toLowerCase() === 'x'
    const newState = explicitDone ?? !wasDone
    if (newState === wasDone) {
      return { ok: true, content: `Task war bereits ${wasDone ? 'erledigt' : 'offen'}, nichts geändert.`, display: `ℹ️ _Task bereits im Zielzustand._` }
    }
    const newChar = newState ? 'x' : ' '
    lines[line - 1] = `${match[1]}${newChar}${match[3]}`
    try {
      await fs.writeFile(abs, lines.join('\n'), 'utf-8')
      return {
        ok: true,
        content: `Task ${newState ? 'abgehakt' : 'wieder geöffnet'}: ${rel}:${line}`,
        display: `${newState ? '✅' : '🔓'} _Task ${newState ? 'abgehakt' : 'geöffnet'}:_ \`${rel}:${line}\``
      }
    } catch (err) {
      return { ok: false, content: `Fehler beim Schreiben: ${err instanceof Error ? err.message : String(err)}` }
    }
  }
}
