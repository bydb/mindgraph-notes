// Entscheidungsprobe für den Notiz-Agenten: Welches Werkzeug wählt das Modell, nachdem es
// das Manifest eines angehängten Ordners gesehen hat? Nutzt den ECHTEN Systemprompt
// (buildSystemPrompt), die echten Werkzeugdefinitionen und das echte Manifest — gemessen
// wird genau der eine Schritt nach list_context_folder, ohne ganzen Lauf.
//
//   node scripts/run-ts.mjs scripts/agent-tool-choice-probe.ts -- \
//     --vault <Test-Vault> --model qwen3.6:35b-a3b-nvfp4 --reps 5 [--label baseline]
//
// Nur lokales Ollama. Fälle stehen unten (CASES), Ordner relativ zum Vault.

import * as path from 'path'
import { registerContextFolder, clearContextAttachments } from '../src/main/noteAgent/contextFiles'
import { buildSystemPrompt } from '../src/main/noteAgent/loop'
import { createNoteAgentRegistry, type NoteAgentContext } from '../src/main/noteAgent/skills'
import { chatWithTools, type ChatMessage } from '../src/main/llm/chatClient'
import { AGENT_NUM_CTX } from '../src/shared/contextGuard'
import type { AgentRun } from '../src/main/noteAgent/runRegistry'

interface Case { id: string; folder: string; instruction: string; expect: 'folder_digest' | 'read_context_file' | 'any' }

const CASES: Case[] = [
  { id: 'zusagen-30', folder: 'Zusagen', instruction: 'Liste alle Zusagen aus dem Ordner Zusagen vollständig auf: wer hat was zugesagt, mit Datum. Keine auslassen.', expect: 'folder_digest' },
  { id: 'jahr-88', folder: 'Journal-Gross', instruction: 'Erstelle aus meinem Journal eine Jahreszusammenfassung als Notiz.', expect: 'folder_digest' },
  { id: 'journal-9', folder: 'Journal', instruction: 'Fasse mein Journal als Notiz zusammen.', expect: 'any' }
]

const ALLOWED = ['note_read', 'note_search', 'list_target_folder', 'write_xlsx', 'write_docx', 'write_note', 'write_html',
  'write_edumap', 'inspect_pptx_template', 'write_pptx', 'read_attachment', 'list_context_folder', 'read_context_file',
  'collect_table', 'peek_dataset', 'folder_digest']

function arg(name: string, def?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : def
}

async function main(): Promise<void> {
  const vault = arg('vault')
  const model = arg('model', 'qwen3.6:35b-a3b-nvfp4')!
  const reps = Number(arg('reps', '5'))
  const label = arg('label', 'probe')!
  const only = arg('cases')?.split(',')
  if (!vault) throw new Error('--vault fehlt')
  const registry = createNoteAgentRegistry()
  const tools = registry.toolDefinitionsFor(new Set(ALLOWED))
  const summary: Record<string, Record<string, number>> = {}
  let senderId = 990_000

  for (const c of CASES.filter(c => !only || only.includes(c.id))) {
    senderId++
    const reg = await registerContextFolder(senderId, path.join(vault, c.folder), false)
    if (!reg.ok) throw new Error(reg.error)
    const run = {
      runId: `probe-${c.id}`, senderId, attachmentIds: [reg.attachment.id], instruction: c.instruction,
      targetFolderRel: 'Ergebnisse', skills: [], abort: new AbortController(), sources: new Set<string>(),
      datasets: new Map(), folderReads: new Map(), collectedFolders: new Set(), vaultPath: vault
    } as unknown as AgentRun
    const ctx = { senderId, run, allowedTools: new Set(ALLOWED) } as unknown as NoteAgentContext
    const manifest = await registry.get('list_context_folder')!.run({ folder: c.folder }, ctx)
    const messages: ChatMessage[] = [
      { role: 'system', content: buildSystemPrompt(run, '', senderId, '', '') },
      { role: 'user', content: c.instruction },
      { role: 'assistant', content: '', tool_calls: [{ id: 'call_1', name: 'list_context_folder', arguments: { folder: c.folder } }] },
      { role: 'tool', tool_call_id: 'call_1', tool_name: 'list_context_folder', content: manifest.content }
    ]
    const tally: Record<string, number> = {}
    for (let r = 0; r < reps; r++) {
      const t0 = Date.now()
      const res = await chatWithTools(messages, tools, { backend: 'ollama', ollamaModel: model, numCtx: AGENT_NUM_CTX, timeoutMs: 600_000 })
      const names = res.toolCalls.map(t => t.name)
      const choice = names.includes('folder_digest') ? 'folder_digest'
        : names.includes('collect_table') ? 'collect_table'
        : names.includes('read_context_file') ? 'read_context_file'
        : names[0] ?? '(kein Werkzeug)'
      tally[choice] = (tally[choice] ?? 0) + 1
      console.log(`[${label}] ${c.id} #${r + 1}: ${choice}  (${names.length} Aufrufe: ${names.join(', ') || '-'}, ${Math.round((Date.now() - t0) / 1000)} s)`)
    }
    summary[c.id] = tally
    clearContextAttachments(senderId)
  }
  console.log(`\n[${label}] ${model}, ${reps} Wiederholungen je Fall`)
  for (const c of CASES.filter(c => summary[c.id])) {
    const t = summary[c.id]
    const hit = c.expect === 'any' ? '-' : `${t[c.expect] ?? 0}/${reps} wie erwartet (${c.expect})`
    console.log(`  ${c.id.padEnd(12)} ${JSON.stringify(t)}  ${hit}`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
