// F37: Der collect_table-Bericht wird nie nachträglich abgelehnt (der Datensatz ist dann
// schon registriert) — er verdichtet sich selbst, bis er ins Kontextbudget passt.

import { describe, expect, it } from 'vitest'
import { promises as fs } from 'fs'
import * as os from 'os'
import * as path from 'path'
import { registerContextFolder, clearContextAttachments } from './contextFiles'
import { createNoteAgentRegistry, type NoteAgentContext } from './skills'
import { estimateTokens } from '../../shared/contextBudget'
import type { AgentRun } from './runRegistry'

describe('collect_table unter Kontextbudget', () => {
  it('verdichtet den Bericht und nennt die Datensatz-ID immer', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mindgraph-collect-budget-'))
    const senderId = 941_101
    try {
      const folder = path.join(root, 'Rückläufe')
      await fs.mkdir(folder, { recursive: true })
      for (let i = 0; i < 12; i++) {
        const rows = Array.from({ length: 30 }, (_, r) => `Person ${i}-${r};Grundschule Musterstadt ${i};${'Bemerkung '.repeat(8)}`)
        await fs.writeFile(path.join(folder, `schule-${i}.csv`), `Name;Schule;Bemerkung\n${rows.join('\n')}\n`, 'utf8')
      }
      const reg = await registerContextFolder(senderId, folder, false)
      if (!reg.ok) throw new Error(reg.error)
      const run = {
        runId: 'r', senderId, attachmentIds: [reg.attachment.id], abort: new AbortController(),
        sources: new Set<string>(), datasets: new Map(), folderReads: new Map(), collectedFolders: new Set()
      } as unknown as AgentRun
      const tool = createNoteAgentRegistry().get('collect_table')!
      const args = { folder: 'Rückläufe', columns: ['Name', 'Schule', 'Bemerkung'] }

      const roomy = await tool.run(args, { senderId, run, maxResultTokens: () => 100_000 } as NoteAgentContext)
      const tight = await tool.run(args, { senderId, run, maxResultTokens: () => 900 } as NoteAgentContext)
      expect(roomy.ok && tight.ok).toBe(true)
      expect(estimateTokens(tight.content)).toBeLessThan(estimateTokens(roomy.content))
      expect(estimateTokens(tight.content)).toBeLessThanOrEqual(900)
      expect(tight.content).toMatch(/Datensatz "tabelle2" erstellt: 360 Zeilen/)
      expect(tight.content).toContain('dataset="tabelle2"')
    } finally {
      clearContextAttachments(senderId)
      await fs.rm(root, { recursive: true, force: true })
    }
  })
})
