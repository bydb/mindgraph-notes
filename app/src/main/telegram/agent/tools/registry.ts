// Tool-Registry für den Telegram-Agent — Instanziierung der generischen
// ToolRegistry (main/llm/toolRegistry.ts) mit dem Telegram-ToolContext.
// isWrite löst hier den Confirm-Flow aus (harte Sicherheitsgrenze, siehe loop.ts).

import { ToolRegistry as GenericToolRegistry, type AppTool as GenericAppTool, type ToolResult } from '../../../llm/toolRegistry'

export interface ToolContext {
  vaultPath: string
  excludedFolders: string[]
  inboxFolder: string                       // Default-Ordner für note_create (relativ zum Vault)
  projectsRootFolder: string                // Root für Projekt-Discovery (z.B. "100 - ✅ Projekte")
  embeddingModel: string                    // zentrales Projekt-RAG-Embedding-Modell (z.B. "bge-m3")
}

export type { ToolResult }
export type AppTool = GenericAppTool<ToolContext>

export class ToolRegistry extends GenericToolRegistry<ToolContext> {}
