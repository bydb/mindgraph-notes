import { describe, it, expect } from 'vitest'
import { isDerivedAiNote } from './indexPolicy'

describe('isDerivedAiNote', () => {
  it('gespeicherte Chat-Antwort (ki-typ) und Brain-Tagesnotiz sind abgeleitet', () => {
    expect(isDerivedAiNote('---\ntitle: "Antwort"\nki-modell: qwen3.8:27b-mlx\nki-typ: vault-chat-antwort\n---\n\nText')).toBe(true)
    expect(isDerivedAiNote('---\ntype: brain-day\ndate: 2026-09-19\n---\n\n## Heute im Fokus')).toBe(true)
  })
  it('KI-Provenienz allein (Mail-Notizen, Agent-Recherchen) bleibt Quelle', () => {
    expect(isDerivedAiNote('---\ntitle: Mail\nki-modell: qwen3.8:27b-mlx\nki-datum: 2026-09-20\n---\n\nVon: …')).toBe(false)
    expect(isDerivedAiNote('---\ntitle: x\ntags: [a]\n---\n\nIm Text steht ki-typ: vault-chat-antwort')).toBe(false)
    expect(isDerivedAiNote('# Ohne Frontmatter')).toBe(false)
  })
})
