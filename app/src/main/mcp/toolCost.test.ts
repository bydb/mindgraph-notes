// Kosten eines fremden Werkzeugs im Modellkontext (Codex F44): aus genau der Definition, die das
// Modell bekommt — langer Name, Vorspann mit Serverlabel, Schema — plus Aufschlag.
import { describe, it, expect } from 'vitest'
import { mcpToolTokenCost } from './agentTools'
import { estimateTokens } from '../../shared/contextBudget'
import { MCP_TOOL_TOKEN_RESERVE } from '../../shared/mcp'

const def = { name: 'notion-search', description: 'Sucht in Notion.', inputSchema: { type: 'object', properties: { query: { type: 'string' } } } }

describe('mcpToolTokenCost', () => {
  it('zählt den Namen mcp__<server>__…, den Vorspann und den Aufschlag', () => {
    const bare = estimateTokens(JSON.stringify({ name: def.name, description: def.description, parameters: def.inputSchema }))
    const cost = mcpToolTokenCost('notion', 'Notion', def)
    expect(cost).toBeGreaterThan(Math.ceil(bare * MCP_TOOL_TOKEN_RESERVE))
  })
  it('ein langes Serverlabel kostet mehr', () => {
    expect(mcpToolTokenCost('notion', 'Notion Arbeitsbereich der Fortbildungsabteilung', def)).toBeGreaterThan(mcpToolTokenCost('notion', 'Notion', def))
  })
})
