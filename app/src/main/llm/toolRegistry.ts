// Generische Tool-Registry für LLM-Tool-Use (Phase-2-Prerequisite F06).
// Aus telegram/agent/tools/registry.ts extrahiert: die Abstraktion ist kontext-
// neutral — Telegram-Agent (ToolContext) und Notiz-Agent (NoteAgentContext) sind
// Instanziierungen. Gemeinsam sind Definition, Result-Vertrag und Allowlist-Filter.
//
// Zentrale Idee: jedes Tool hat
// - name + description + JSON-Schema (für das LLM)
// - isWrite-Flag (Semantik bestimmt der Aufrufer: Telegram = Confirm-Flow,
//   Notiz-Agent = Staging + Review)
// - run(args, ctx) — die eigentliche Implementierung

import type { ToolDefinition } from './chatClient'

export interface ToolResult {
  ok: boolean
  content: string // dem LLM zurückgegeben (string, JSON-stringified bei strukturierten Daten)
  display?: string // optionale, dem User angezeigte Zusammenfassung
}

export interface AppTool<TContext> {
  name: string
  description: string
  parameters: Record<string, unknown> // JSON Schema
  isWrite: boolean
  run: (args: Record<string, unknown>, ctx: TContext) => Promise<ToolResult>
}

export class ToolRegistry<TContext> {
  private tools = new Map<string, AppTool<TContext>>()

  register(tool: AppTool<TContext>): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool ${tool.name} bereits registriert`)
    }
    this.tools.set(tool.name, tool)
  }

  get(name: string): AppTool<TContext> | undefined {
    return this.tools.get(name)
  }

  /** Liefert die für das LLM sichtbaren Tool-Definitionen, gefiltert nach Allowlist. */
  toolDefinitionsFor(allowedNames: Set<string> | null): ToolDefinition[] {
    const defs: ToolDefinition[] = []
    for (const tool of this.tools.values()) {
      if (allowedNames && !allowedNames.has(tool.name)) continue
      defs.push({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters
      })
    }
    return defs
  }

  /** Tool-Namen, die Schreibrechte brauchen — für Settings-UI nützlich. */
  writeToolNames(): string[] {
    return Array.from(this.tools.values()).filter(t => t.isWrite).map(t => t.name)
  }

  allToolNames(): string[] {
    return Array.from(this.tools.keys())
  }
}
