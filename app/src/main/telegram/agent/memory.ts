// Agent Memory — persistente Fakten, die dem Telegram-Agenten und
// Briefing-Generator als Kontext dienen.
//
// Speicherort: <vault>/.mindgraph/agent-memory.json
//
// Bewusst simpel: ein Array von {id, key, value}-Einträgen, die der Nutzer
// manuell pflegt (oder die beim Onboarding automatisch gesetzt werden).
// Keine semantische Suche, kein automatisches Lernen — nur Fakten, die
// der Agent bei jedem Lauf in seinen System-Prompt injiziert bekommt.

import { promises as fs } from 'fs'
import path from 'path'

export interface AgentMemoryEntry {
  id: string
  key: string      // Kurze Bezeichnung, z.B. "Sprache", "Vault-Struktur", "Antwort-Stil"
  value: string    // Der Faktenwert, z.B. "Deutsch, locker, keine langen Listen"
}

export interface AgentMemoryStore {
  entries: AgentMemoryEntry[]
}

const DEFAULT_STORE: AgentMemoryStore = { entries: [] }

function getMemoryPath(vaultPath: string): string {
  return path.join(vaultPath, '.mindgraph', 'agent-memory.json')
}

export async function loadAgentMemory(vaultPath: string): Promise<AgentMemoryStore> {
  try {
    const raw = await fs.readFile(getMemoryPath(vaultPath), 'utf-8')
    const parsed = JSON.parse(raw) as Partial<AgentMemoryStore>
    if (Array.isArray(parsed.entries)) {
      return { entries: parsed.entries.filter(isValidEntry) }
    }
    return { ...DEFAULT_STORE }
  } catch {
    return { ...DEFAULT_STORE }
  }
}

export async function saveAgentMemory(vaultPath: string, store: AgentMemoryStore): Promise<void> {
  const memPath = getMemoryPath(vaultPath)
  await fs.mkdir(path.dirname(memPath), { recursive: true })
  await fs.writeFile(memPath, JSON.stringify(store, null, 2), 'utf-8')
}

function isValidEntry(e: unknown): e is AgentMemoryEntry {
  if (!e || typeof e !== 'object') return false
  const obj = e as Record<string, unknown>
  return typeof obj.id === 'string' &&
    typeof obj.key === 'string' &&
    typeof obj.value === 'string'
}

let idCounter = 0
function nextId(): string {
  idCounter += 1
  return `mem_${Date.now().toString(36)}_${idCounter}`
}

export async function addAgentMemoryEntry(vaultPath: string, key: string, value: string): Promise<AgentMemoryEntry> {
  const store = await loadAgentMemory(vaultPath)
  const entry: AgentMemoryEntry = { id: nextId(), key: key.trim(), value: value.trim() }
  store.entries.push(entry)
  await saveAgentMemory(vaultPath, store)
  return entry
}

export async function updateAgentMemoryEntry(vaultPath: string, id: string, key: string, value: string): Promise<boolean> {
  const store = await loadAgentMemory(vaultPath)
  const idx = store.entries.findIndex(e => e.id === id)
  if (idx === -1) return false
  store.entries[idx] = { id, key: key.trim(), value: value.trim() }
  await saveAgentMemory(vaultPath, store)
  return true
}

export async function removeAgentMemoryEntry(vaultPath: string, id: string): Promise<boolean> {
  const store = await loadAgentMemory(vaultPath)
  const before = store.entries.length
  store.entries = store.entries.filter(e => e.id !== id)
  if (store.entries.length === before) return false
  await saveAgentMemory(vaultPath, store)
  return true
}

/**
 * Formatiert die Memory-Einträge als Text-Block für den System-Prompt.
 * Gibt einen leeren String zurück, wenn keine Einträge vorhanden.
 */
export function formatAgentMemory(entries: AgentMemoryEntry[]): string {
  if (entries.length === 0) return ''
  const lines = entries.map(e => `- ${e.key}: ${e.value}`)
  return lines.join('\n')
}
