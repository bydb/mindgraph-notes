/**
 * Bilder einer Petrol-Chat-Anfrage im Main prüfen und zuordnen (Rev. 7 Punkt 20–22,
 * docs/codex-collab/chat-verlauf-notizen-bilder.md).
 *
 * Reihenfolge: Bytes prüfen → Verlaufsregel (höchstens zwei ältere Bilder) → Weg frisch
 * einstufen → Prüfstelle. Erst danach wandelt der Aufrufer Bilder in eine Anbieter-Nutzlast
 * um. Jede Ablehnung beendet die ganze Anfrage mit Grund; ein Bild wird nie still weggelassen.
 */

import { nativeImage } from 'electron'
import {
  CHAT_IMAGE_MAX_IN_HISTORY,
  CHAT_IMAGE_MAX_SIDE,
  CHAT_IMAGE_MAX_PER_MESSAGE,
  checkChatImagesWire,
  estimateImageTokens,
  imageOmittedNote,
  planImageHistory,
  type ChatImageDelivery,
  type ImageHistoryMessage
} from '../../shared/chatImages'
import { CHAT_IMAGE_CLOUD_CONSENT_VERSION, decideChatImageRoute, type ChatImageRoute } from '../../shared/chatImageGate'
import { resolveContextWindow } from '../../shared/contextBudget'
import { LocalModelError, resolveLocalModel } from '../rag/localModel'

export interface ChatImageRequestInput {
  mode: string
  web: boolean
  messages: readonly ImageHistoryMessage[]
  images: unknown
  /** Ollama-Modell (lokaler oder Ollama-Cloud-Weg), wenn kein Cloud-Anbieter gewählt ist. */
  ollamaModel?: string
  cloud?: { provider: 'openrouter' | 'llmbase'; model: string } | null
  lmstudio?: boolean
  /** ui-settings.json → `chatImageCloudConsent` (je Anbieter die zugestimmte Version). */
  consent?: unknown
  /** Nur Cloud: Bildeingabe und Kontextfenster laut Katalog. */
  cloudCatalog?: () => Promise<{ vision: 'yes' | 'no' | 'unknown'; contextLength: number | null }>
  /** Für Tests. */
  resolveLocal?: typeof resolveLocalModel
  /**
   * Neu kodieren im Main (Codex F42): Was hinausgeht, ist nie die Nutzlast des Renderers,
   * sondern ein frisch kodiertes JPEG — ohne Metadaten-Blöcke, Kommentare oder Bytes hinter
   * dem Bildende. Für Tests ersetzbar.
   */
  reencode?: (bytes: Buffer) => { dataBase64: string; width: number; height: number }
}

/** Standard: Electrons nativeImage dekodiert und kodiert neu (JPEG 85). */
function reencodeWithNativeImage(bytes: Buffer): { dataBase64: string; width: number; height: number } {
  const img = nativeImage.createFromBuffer(bytes)
  if (img.isEmpty()) throw new Error('Bild lässt sich nicht dekodieren.')
  const size = img.getSize()
  return { dataBase64: img.toJPEG(85).toString('base64'), width: size.width, height: size.height }
}

/** Kennungen aus der rohen Eingabe — damit auch eine frühe Ablehnung je Bild gemeldet wird (F51). */
function rawImageIds(raw: unknown, messages: readonly ImageHistoryMessage[]): string[] {
  const ids = new Set<string>()
  if (Array.isArray(raw)) for (const item of raw) {
    const id = (item as { id?: unknown } | null)?.id
    if (typeof id === 'string' && /^[\w-]{1,64}$/.test(id)) ids.add(id)
  }
  for (const m of messages) for (const id of Array.isArray(m.imageIds) ? m.imageIds : []) {
    if (typeof id === 'string' && /^[\w-]{1,64}$/.test(id)) ids.add(id)
  }
  return [...ids]
}

export interface PlannedChatMessage {
  role: string
  content: string
  /** base64-JPEGs, die mit dieser Nachricht ans Modell gehen. */
  images: string[]
}

export type ChatImageRequestResult =
  | { kind: 'none' }
  | { kind: 'ok'; messages: PlannedChatMessage[]; delivery: Record<string, ChatImageDelivery>; imageTokens: number }
  | { kind: 'rejected'; error: string; delivery: Record<string, ChatImageDelivery> }

export function hasImageConsent(consent: unknown, provider: 'openrouter' | 'llmbase'): boolean {
  const v = (consent as Record<string, unknown> | null | undefined)?.[provider]
  return typeof v === 'number' && v >= CHAT_IMAGE_CLOUD_CONSENT_VERSION
}

export async function prepareChatImageRequest(input: ChatImageRequestInput): Promise<ChatImageRequestResult> {
  const anyRefs = input.messages.some(m => (m.imageIds?.length ?? 0) > 0)
  const wireEmpty = input.images === undefined || input.images === null || (Array.isArray(input.images) && input.images.length === 0)
  if (!anyRefs && wireEmpty) return { kind: 'none' }

  const reject = (error: string, ids: string[] = []): ChatImageRequestResult => ({
    kind: 'rejected',
    error,
    delivery: Object.fromEntries(ids.map(id => [id, { kind: 'rejected', reason: error } as ChatImageDelivery]))
  })

  const checked = checkChatImagesWire(input.images, CHAT_IMAGE_MAX_PER_MESSAGE + CHAT_IMAGE_MAX_IN_HISTORY)
  if ('error' in checked) return reject(checked.error, rawImageIds(input.images, input.messages))
  // Neu kodieren, bevor irgendetwas weitergeht (F42). Die Maße zählen danach, nicht die gemeldeten.
  const reencode = input.reencode ?? reencodeWithNativeImage
  const fresh: typeof checked.images = []
  for (const img of checked.images) {
    try {
      const r = reencode(Buffer.from(img.dataBase64, 'base64'))
      if (Math.max(r.width, r.height) > CHAT_IMAGE_MAX_SIDE) return reject(`Bild ist größer als ${CHAT_IMAGE_MAX_SIDE} px.`, rawImageIds(input.images, input.messages))
      fresh.push({ ...img, dataBase64: r.dataBase64, width: r.width, height: r.height, bytes: Math.floor(r.dataBase64.length * 0.75) })
    } catch (e) {
      return reject(e instanceof Error ? e.message : String(e), rawImageIds(input.images, input.messages))
    }
  }
  const byId = new Map(fresh.map(i => [i.id, i]))
  const allIds = [...byId.keys()]
  const lastUser = [...input.messages].reverse().find(m => m.role === 'user')
  if ((lastUser?.imageIds?.length ?? 0) > CHAT_IMAGE_MAX_PER_MESSAGE) return reject(`Höchstens ${CHAT_IMAGE_MAX_PER_MESSAGE} Bilder je Nachricht.`, allIds)
  const plan = planImageHistory(input.messages, new Set(allIds))
  if ('error' in plan) return reject(plan.error, allIds)
  if (plan.dropped.length) return reject('Bilder: der Verlauf schickt mehr ältere Bilder als erlaubt.', allIds)

  const imageTokens = plan.sent.reduce((sum, id) => {
    const img = byId.get(id)!
    return sum + estimateImageTokens(img.width, img.height)
  }, 0)

  // Weg frisch einstufen — nie aus dem Renderer übernehmen.
  let route: ChatImageRoute
  if (input.cloud?.model) {
    const catalog = input.cloudCatalog ? await input.cloudCatalog().catch(() => ({ vision: 'unknown' as const, contextLength: null })) : { vision: 'unknown' as const, contextLength: null }
    route = {
      kind: 'cloud',
      provider: input.cloud.provider,
      model: input.cloud.model,
      imageConsent: hasImageConsent(input.consent, input.cloud.provider),
      vision: catalog.vision,
      contextWindow: resolveContextWindow(input.cloud.provider, undefined, catalog.contextLength).tokens
    }
  } else if (input.lmstudio) {
    route = { kind: 'lmstudio' }
  } else {
    const model = (input.ollamaModel ?? '').trim()
    try {
      const local = await (input.resolveLocal ?? resolveLocalModel)(model, { fresh: true })
      route = { kind: 'ollama-local', model: local.name, capabilities: local.capabilities }
    } catch (err) {
      if (err instanceof LocalModelError && (err.reason === 'cloud-tag' || err.reason === 'remote')) route = { kind: 'ollama-cloud', model }
      else route = { kind: 'ollama-unresolved', model, reason: err instanceof Error ? err.message : String(err) }
    }
  }

  const gate = decideChatImageRoute({ mode: input.mode, web: input.web, route, imageTokens })
  if (!gate.ok) {
    // Hat die neue Frage selbst kein Bild, stehen Bilder nur im Verlauf: ohne sie weiterfragen
    // statt das ganze Gespräch zu sperren (Nutzerentscheidung 02.11.2026, z. B. nach Widerruf
    // der Bild-Freigabe oder Wechsel auf ein Modell ohne Bildverständnis). Der Vermerk im Text
    // sagt dem Modell, dass dort ein Bild war; die Antwort sagt es dem Nutzer.
    if ((lastUser?.imageIds?.length ?? 0) === 0) {
      return {
        kind: 'ok',
        imageTokens: 0,
        delivery: Object.fromEntries(plan.sent.map(id => [id, { kind: 'history-dropped', reason: gate.reason } as ChatImageDelivery])),
        messages: plan.messages.map(m => ({
          role: m.role,
          content: m.imageIds.length ? `${m.content}\n${imageOmittedNote(m.imageIds.length)}` : m.content,
          images: []
        }))
      }
    }
    return reject(gate.reason, allIds)
  }

  const delivery: Record<string, ChatImageDelivery> = {}
  for (const id of plan.sent) delivery[id] = { kind: 'image', route: gate.route, target: gate.target }
  return {
    kind: 'ok',
    imageTokens,
    delivery,
    messages: plan.messages.map(m => ({ role: m.role, content: m.content, images: m.imageIds.map(id => byId.get(id)!.dataBase64) }))
  }
}
