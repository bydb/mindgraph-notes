// Texterkennung einer PDF-Seite über ein lokales Ollama-Vision-Modell.
// Eigene Datei, damit das Messskript genau diesen Weg aufruft (scripts/ocr-bench.ts).
import { recordLlmRun } from './llm/telemetry'
import { fromOllamaResponse, type OllamaTimings } from '../shared/llmTelemetry'
import { friendlyOllamaError } from '../shared/ollamaError'
import { looksLikeOcrLoop, trimOcrRepetition } from '../shared/ocrRepetition'

// Obergrenze pro Seite: eine dichte Seite braucht real unter 3000 Token.
export const VISION_OCR_MAX_TOKENS = 8192

export interface OcrPageResult {
  success: boolean
  content: string
  error?: string
  /** Das Modell wiederholte die Seite; die Wiederholung wurde abgeschnitten. */
  repeated?: boolean
  /** Ausgabegrenze erreicht ohne erkennbare Wiederholung — Seite evtl. unvollständig. */
  incomplete?: boolean
}

export async function extractOcrPage(ollamaUrl: string, base64Image: string, model: string, pageNum: number): Promise<OcrPageResult> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 120000) // 2 min per page
  const startedAt = Date.now()

  // Gestreamt, damit eine Wiederholungsschleife (glm-ocr unter Ollama 0.40)
  // nach dem zweiten Durchgang abgebrochen wird statt erst an der Ausgabegrenze.
  const response = await fetch(`${ollamaUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{
        role: 'user',
        content: `Extract ALL text content from this document page and format it as clean Markdown.
Rules:
- Use headings (#, ##, ###) for section titles
- Use bullet points for lists, numbered lists for sequences
- Format tables as Markdown tables
- Use **bold** and *italic* where appropriate
- For handwritten text, transcribe as accurately as possible
- For mathematical formulas, use LaTeX notation ($...$)
- Output ONLY the extracted Markdown content, no preamble or explanation
- Do NOT use <think> tags or internal reasoning`,
        images: [base64Image]
      }],
      stream: true,
      think: false,
      options: { temperature: 0.1, num_predict: VISION_OCR_MAX_TOKENS }
    }),
    signal: controller.signal
  })

  if (!response.ok || !response.body) {
    clearTimeout(timeoutId)
    throw new Error(friendlyOllamaError(response.status, await response.text().catch(() => ''), model))
  }

  let raw = ''
  let looped = false
  let hitLimit = false
  let timings: OllamaTimings = {}
  let checkedAt = 0
  const decoder = new TextDecoder()
  let buffer = ''
  const reader = response.body.getReader()
  try {
    read: while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let nl: number
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl).trim()
        buffer = buffer.slice(nl + 1)
        if (!line) continue
        const chunk = JSON.parse(line) as { message?: { content?: string }; done?: boolean; done_reason?: string; error?: string } & OllamaTimings
        if (chunk.error) throw new Error(chunk.error)
        raw += chunk.message?.content ?? ''
        if (chunk.done) {
          timings = chunk
          hitLimit = chunk.done_reason === 'length'
          break read
        }
        if (raw.length - checkedAt >= 400) {
          checkedAt = raw.length
          if (looksLikeOcrLoop(raw)) {
            looped = true
            controller.abort()
            break read
          }
        }
      }
    }
  } catch (err) {
    // Den eigenen Abbruch nach erkannter Schleife nicht als Fehler werten.
    if (!looped) throw err
  } finally {
    clearTimeout(timeoutId)
    reader.cancel().catch(() => {})
  }

  recordLlmRun(fromOllamaResponse(timings, { module: 'vision-ocr', model, wallMs: Date.now() - startedAt, at: startedAt }))
  let pageText = raw.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
  let repeated = false
  if (looped || hitLimit) {
    const trimmed = trimOcrRepetition(pageText)
    pageText = trimmed.text
    repeated = trimmed.trimmed
    console.warn(`[VisionOCR] Page ${pageNum}: ${looped ? 'Wiederholung erkannt, abgebrochen' : 'Ausgabegrenze erreicht'}${repeated ? ', Wiederholung abgeschnitten' : ''} (${raw.length} → ${pageText.length} Zeichen)`)
  }

  if (!pageText) {
    return { success: false, content: '', error: 'Das Modell hat für diese Seite keinen Text geliefert.' }
  }
  // Ausgabegrenze ohne erkennbare Wiederholung: die Seite kann unvollständig sein.
  return { success: true, content: pageText, repeated, incomplete: hitLimit && !repeated }
}
