import { describe, expect, it } from 'vitest'
import { stepActivity } from './agentLogoStatus'

describe('stepActivity', () => {
  it('ordnet Lesen, Schreiben und Schritte der App zu', () => {
    for (const s of ['read_context_file', 'list_context_folder', 'note_read', 'vault_search', 'web_fetch', 'use_skill', 'describe_image', 'mcp__notion__search']) expect(stepActivity(s)).toBe('read')
    for (const s of ['write_note', 'write_excalidraw', 'write_xlsx', 'fill_docx_form', 'generate_image', 'shell_stage_file']) expect(stepActivity(s)).toBe('write')
    for (const s of ['kontext', 'bild', 'shell_access', '', '  ']) expect(stepActivity(s)).toBe('think')
  })
})
