// Tool-Registry für den Telegram-Agent.
// Sammelt alle Tools, mappt sie auf das Ollama-Schema und führt sie aus.
//
// Zentrale Idee: jedes Tool hat
// - name + description + JSON-Schema (für das LLM)
// - isWrite-Flag (steuert, ob Confirm nötig ist)
// - run(args, ctx) — die eigentliche Implementierung

import type { ToolDefinition } from '../../../llm/chatClient'

export interface ToolContext {
  vaultPath: string
  excludedFolders: string[]
  inboxFolder: string                       // Default-Ordner für note_create (relativ zum Vault)
}

export interface ToolResult {
  ok: boolean
  content: string                           // dem LLM zurückgegeben (string, JSON-stringified bei strukturierten Daten)
  display?: string                          // optionale, dem User in Telegram angezeigte Zusammenfassung
}

export interface AppTool {
  name: string
  description: string
  parameters: Record<string, unknown>       // JSON Schema
  isWrite: boolean
  run: (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>
}

export class ToolRegistry {
  private tools = new Map<string, AppTool>()

  register(tool: AppTool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool ${tool.name} bereits registriert`)
    }
    this.tools.set(tool.name, tool)
  }

  get(name: string): AppTool | undefined {
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
