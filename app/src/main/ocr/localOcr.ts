/**
 * Gemeinsamer Einstieg für die lokale Texterkennung (Rev. 7 Punkt 23, Codex F28/F31,
 * docs/codex-collab/chat-verlauf-notizen-bilder.md).
 *
 * PDF-Knopf, Chat („Text aus dem Bild lesen“) und Agent rufen nur diese Funktion. Sie
 *   - liest Schalter und Modell aus ui-settings.json (`visionOcr`), nie aus Parametern;
 *   - prüft vor JEDER Seite mit frischen Ollama-Angaben, dass das Modell lokal rechnet und
 *     Bilder versteht — der 15-s-Cache von `resolveLocalModel` gilt hier nicht;
 *   - meldet die Erkennung als Ollama-Vordergrund an (der Vault-Index pausiert);
 *   - reicht das Abbruchsignal bis in den laufenden Aufruf durch.
 * `extractOcrPage` darf außer hier nur das Messskript importieren (Test in localOcr.test.ts).
 */

import { extractOcrPage, type OcrPageResult } from '../visionOcr'
import { describeLocalModelError, OLLAMA_LOCAL_URL, resolveLocalModel } from '../rag/localModel'
import { beginOllamaActivity } from '../rag/ollamaActivity'

export interface LocalOcrOptions {
  /** ui-settings.json, frisch gelesen vom Aufrufer. */
  settings: Record<string, unknown>
  pageNum?: number
  signal?: AbortSignal
  timeoutMs?: number
  /** Für Tests. */
  resolveLocal?: typeof resolveLocalModel
  extract?: typeof extractOcrPage
}

export const OCR_SETTINGS_HINT = 'Einstellungen → Integrationen → Vision OCR'

/** Modell aus den Einstellungen, oder warum es keine Erkennung gibt. */
export function localOcrModel(settings: Record<string, unknown>): { model: string } | { error: string } {
  const cfg = settings.visionOcr as { enabled?: unknown; model?: unknown } | undefined
  if (cfg?.enabled !== true) return { error: `Die Texterkennung (Vision OCR) ist ausgeschaltet. Einschalten unter ${OCR_SETTINGS_HINT}.` }
  const model = typeof cfg.model === 'string' ? cfg.model.trim() : ''
  if (!model) return { error: `Für die Texterkennung ist kein Modell gewählt (${OCR_SETTINGS_HINT}).` }
  return { model }
}

export async function ocrImageLocal(base64Image: string, opts: LocalOcrOptions): Promise<OcrPageResult> {
  const chosen = localOcrModel(opts.settings)
  if ('error' in chosen) return { success: false, content: '', error: chosen.error }
  let name: string
  try {
    const local = await (opts.resolveLocal ?? resolveLocalModel)(chosen.model, { fresh: true })
    // Ohne Fähigkeitsangabe nicht raten (Codex F45) — wie der Chat-Bildweg.
    if (!local.capabilities) {
      return { success: false, content: '', error: `Ollama meldet für „${local.name}“ nicht, ob es Bilder lesen kann. Bitte Ollama aktualisieren.` }
    }
    if (!local.capabilities.includes('vision')) {
      return { success: false, content: '', error: `„${local.name}“ kann keine Bilder lesen. Ein Vision-Modell wählen (${OCR_SETTINGS_HINT}).` }
    }
    name = local.name
  } catch (err) {
    return { success: false, content: '', error: `Die Texterkennung läuft nur mit Modellen auf diesem Rechner. ${describeLocalModelError(err)}` }
  }
  const end = beginOllamaActivity('vision-ocr')
  try {
    return await (opts.extract ?? extractOcrPage)(OLLAMA_LOCAL_URL, base64Image, name, opts.pageNum ?? 1, { signal: opts.signal, timeoutMs: opts.timeoutMs })
  } catch (err) {
    if (opts.signal?.aborted) throw new Error('Abgebrochen')
    return { success: false, content: '', error: err instanceof Error ? err.message : String(err) }
  } finally {
    end()
  }
}
