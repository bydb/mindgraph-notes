// Antworttexte wie von Ollama 0.40.10 gemessen (28.10.2026).
import { describe, it, expect } from 'vitest'
import { friendlyOllamaError, ollamaErrorDetail } from './ollamaError'

describe('friendlyOllamaError', () => {
  it('nennt ein Embedding-Modell als Chat-Modell beim Namen', () => {
    const msg = friendlyOllamaError(400, '{"error":"\\"bge-m3:latest\\" does not support chat"}', 'bge-m3:latest')
    expect(msg).toContain('„bge-m3:latest“ kann keine Texte schreiben')
    expect(msg).not.toContain('400')
  })

  it('erkennt Bildmodelle und /api/generate', () => {
    expect(friendlyOllamaError(400, '{"error":"\\"x/flux2-klein:latest\\" does not support chat"}', 'x/flux2-klein:latest')).toContain('kann keine Texte schreiben')
    expect(friendlyOllamaError(400, '{"error":"\\"bge-m3\\" does not support generate"}', 'bge-m3')).toContain('kann keine Texte schreiben')
  })

  it('meldet ein fehlendes Modell', () => {
    expect(friendlyOllamaError(400, '{"error":"model is required"}', '')).toContain('kein Modell ausgewählt')
  })

  it('meldet ein nicht installiertes Modell mit pull-Befehl', () => {
    const msg = friendlyOllamaError(404, '{"error":"model \'gibtsnicht:1b\' not found"}', 'gibtsnicht:1b')
    expect(msg).toContain('ollama pull gibtsnicht:1b')
  })

  it('behält den Cloud-Login-Hinweis', () => {
    expect(friendlyOllamaError(403, '{"error":"unauthorized: cloud model requires sign in"}', 'qwen3.5:cloud')).toContain('ollama signin')
  })

  it('zeigt bei Unbekanntem Status und Ollamas Text statt nur der Nummer', () => {
    expect(friendlyOllamaError(500, '{"error":"llama runner process has terminated"}', 'qwen3.5:4b'))
      .toBe('Ollama-Fehler 500: llama runner process has terminated')
    expect(friendlyOllamaError(502, '', 'qwen3.5:4b')).toBe('Ollama-Fehler 502')
  })
})

describe('ollamaErrorDetail', () => {
  it('kürzt Nicht-JSON-Antworten', () => {
    expect(ollamaErrorDetail('x'.repeat(400))).toHaveLength(301)
  })
})
