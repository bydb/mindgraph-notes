// Projekt-Tool für den Telegram-Agent: project_ask.
// Befragt einen Projektordner semantisch (On-demand-RAG, nur lokal). Read-only —
// daher isWrite: false, kein Confirm-Flow.

import { discoverProjects } from '../../../projectStatus/discovery'
import { ensureIndex, retrieve } from '../../../rag/retrieve'
import type { AppTool, ToolContext } from './registry'

// Für den Agenten brauchen wir assertSafePath — aber die RAG-Engine erwartet
// eine Validierungsfunktion. Im Telegram-Pfad gibt es keinen approvedVaultRoots-
// Mechanismus; wir prüfen stattdessen, dass der Pfad innerhalb des Vault-Roots
// bleibt (analog resolveInVault in notes.ts).
function makeVaultGuard(vaultRoot: string) {
  return async (requestedPath: string, _op: string): Promise<string> => {
    const path = await import('path')
    const resolved = path.resolve(requestedPath)
    const root = path.resolve(vaultRoot)
    if (resolved !== root && !resolved.startsWith(root + path.sep)) {
      throw new Error('Pfad außerhalb des Vaults.')
    }
    return resolved
  }
}

/** Findet das beste Projekt zu einem freien Namen (Ordnername oder Anzeigename). */
function matchProjectName<T extends { folderName: string; marker: { project: string } }>(
  projects: T[],
  needle: string
): T | T[] | null {
  const q = needle.toLowerCase().trim()
  if (!q) return null
  const exact = projects.filter(
    p => p.folderName.toLowerCase() === q || p.marker.project.toLowerCase() === q
  )
  if (exact.length === 1) return exact[0]
  const partial = projects.filter(
    p => p.folderName.toLowerCase().includes(q) || p.marker.project.toLowerCase().includes(q)
  )
  if (partial.length === 1) return partial[0]
  if (partial.length > 1) return partial // mehrdeutig → Auswahl zurückgeben
  return null
}

export const projectAskTool: AppTool = {
  name: 'project_ask',
  description:
    'Befragt einen Projektordner semantisch (lokales RAG). Liefert relevante Auszüge mit Quellenangabe. Nur lesend.',
  isWrite: false,
  parameters: {
    type: 'object',
    properties: {
      project: { type: 'string', description: 'Projektname oder Ordnername.' },
      query: { type: 'string', description: 'Frage/Stichworte zum Projekt.' }
    },
    required: ['project', 'query']
  },
  async run(args, ctx: ToolContext) {
    const projectName = String(args.project ?? '').trim()
    const query = String(args.query ?? '').trim()
    if (!projectName) return { ok: false, content: 'Fehler: project ist leer.' }
    if (!query) return { ok: false, content: 'Fehler: query ist leer.' }

    let projects
    try {
      projects = await discoverProjects(ctx.vaultPath, ctx.projectsRootFolder)
    } catch (e) {
      return { ok: false, content: `Fehler beim Laden der Projekte: ${e instanceof Error ? e.message : 'unbekannt'}` }
    }
    if (projects.length === 0) {
      return { ok: true, content: 'Keine markierten Projekte gefunden.', display: '📁 _Keine Projekte._' }
    }

    const match = matchProjectName(projects, projectName)
    if (!match) {
      const names = projects.map(p => p.folderName).slice(0, 10).join(', ')
      return { ok: false, content: `Kein Projekt „${projectName}" gefunden. Verfügbar: ${names}` }
    }
    if (Array.isArray(match)) {
      const names = match.map(p => p.folderName).join(', ')
      return { ok: false, content: `Mehrdeutig — welches Projekt? ${names}` }
    }

    const embedModel = ctx.embeddingModel || 'bge-m3'
    try {
      const guard = makeVaultGuard(ctx.vaultPath)
      const index = await ensureIndex(ctx.vaultPath, match.folderRel, embedModel, guard)
      const chunks = await retrieve(index, query, embedModel)
      if (chunks.length === 0) {
        return {
          ok: true,
          content: `Keine relevanten Inhalte im Projekt „${match.folderName}" zu „${query}".`,
          display: `📁 _Nichts gefunden in „${match.folderName}"._`
        }
      }
      const json = JSON.stringify(
        chunks.map(c => ({ source: c.fileRel, heading: c.heading, text: c.text, score: Number(c.score.toFixed(3)) })),
        null,
        2
      )
      return {
        ok: true,
        content: json,
        display: `📁 _${chunks.length} Auszüge aus „${match.folderName}"._`
      }
    } catch (e) {
      return { ok: false, content: `RAG-Fehler: ${e instanceof Error ? e.message : 'unbekannt'}` }
    }
  }
}
