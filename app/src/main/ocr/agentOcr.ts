/**
 * Der Agent liest Bilder per lokaler Texterkennung (Rev. 7 Punkt 24, 4b;
 * docs/codex-collab/chat-verlauf-notizen-bilder.md).
 *
 * Ein Lauf hat EINEN Zustand: Einstellungen beim Start gelesen, Seitenbudget, Zwischenspeicher
 * je Inhalt. Damit kostet dieselbe Datei über `read_attachment`, `read_context_file` und
 * `folder_digest` nur eine Erkennung (F32). Die Prüfung „lokal + Vision“ sitzt im
 * gemeinsamen Einstieg `ocrImageLocal` und läuft vor jeder Seite.
 */

import { createHash } from 'crypto'
import { nativeImage } from 'electron'
import { fitImageSize } from '../../shared/chatImages'
import { jpegExifOrientation, orientPixels } from '../../shared/imageOrientation'
import { localOcrModel, ocrImageLocal } from './localOcr'

/** Seiten bzw. Bilder je Lauf. Eine Seite braucht lokal 2–11 s (Messung 02.11.2026). */
export const AGENT_OCR_PAGE_BUDGET = 40
/**
 * Gesamtzeit der Texterkennung je Lauf (Codex F48). 40 Seiten zu je bis zu 2 Minuten wären
 * sonst über eine Stunde; danach gilt der Rest als „Budget erschöpft“ und wird benannt.
 */
export const AGENT_OCR_TIME_BUDGET_MS = 15 * 60_000
const OCR_PAGE_TIMEOUT_MS = 120_000

/** Lange Seite für die Erkennung; Handyfotos haben 4000 px und mehr. */
export const AGENT_OCR_MAX_SIDE = 1600

export interface AgentOcrState {
  settings: Record<string, unknown>
  pagesLeft: number
  pagesUsed: number
  /** Ende des Zeitbudgets (ms seit Epoche). */
  deadline: number
  /** sha256 der Datei → erkannter Text samt Vermerk. */
  cache: Map<string, AgentOcrPage>
}

export function createAgentOcrState(settings: Record<string, unknown>, budget = AGENT_OCR_PAGE_BUDGET, timeBudgetMs = AGENT_OCR_TIME_BUDGET_MS): AgentOcrState {
  return { settings, pagesLeft: budget, pagesUsed: 0, deadline: Date.now() + timeBudgetMs, cache: new Map() }
}

/** Was ein Leser zur Erkennung braucht. Fehlt er, liest der Leser keine Bilder (Notiz-Chat). */
export interface OcrReadContext {
  state: AgentOcrState
  signal?: AbortSignal
  onStep?: (message: string) => void
  /** Für Tests. */
  ocr?: typeof ocrImageLocal
  prepare?: (buf: Buffer) => string
}

export const OCR_TEXT_NOTE = 'per Texterkennung auf diesem Rechner gelesen — kann Lesefehler enthalten, Zahlen vor Verwendung prüfen'

/** JPEG/PNG → gedrehtes, verkleinertes JPEG (base64). Ohne EXIF, weil neu kodiert. */
export function prepareImageForOcr(buf: Buffer): string {
  const img = nativeImage.createFromBuffer(buf)
  if (img.isEmpty()) throw new Error('Bild lässt sich nicht öffnen (unterstützt: JPEG, PNG)')
  const size = img.getSize()
  const fit = fitImageSize(size.width, size.height, AGENT_OCR_MAX_SIDE)
  const small = fit.width === size.width ? img : img.resize({ width: fit.width, height: fit.height, quality: 'best' })
  const orientation = jpegExifOrientation(buf)
  if (orientation <= 1) return small.toJPEG(85).toString('base64')
  const s = small.getSize()
  const turned = orientPixels(small.toBitmap(), s.width, s.height, orientation)
  return nativeImage.createFromBitmap(Buffer.from(turned.data), { width: turned.width, height: turned.height }).toJPEG(85).toString('base64')
}

/** Ob in diesem Lauf überhaupt erkannt werden kann — für eine frühe, klare Meldung. */
export function agentOcrUnavailable(state: AgentOcrState | undefined): string | undefined {
  if (!state) return 'Bilder liest die App nur in einem Agent-Auftrag per Texterkennung.'
  const m = localOcrModel(state.settings)
  return 'error' in m ? m.error : undefined
}

export interface AgentOcrPage {
  content: string
  incomplete?: boolean
  repeated?: boolean
}

/**
 * Erkennung mit Budget und Zwischenspeicher, ohne Vermerk. Wirft mit lesbarem Grund
 * (Budget, Modell, Erkennung fehlgeschlagen); `jpeg` = fertig aufbereitetes Seitenbild.
 */
export async function ocrForAgent(buf: Buffer, label: string, ctx: OcrReadContext, opts: { jpeg?: string } = {}): Promise<AgentOcrPage> {
  const off = agentOcrUnavailable(ctx.state)
  if (off) throw new Error(off)
  const hash = createHash('sha256').update(buf).digest('hex')
  const cached = ctx.state.cache.get(hash)
  if (cached !== undefined) return cached
  if (ctx.state.pagesLeft <= 0) throw new AgentOcrBudgetError(ctx.state.pagesUsed)
  const remaining = ctx.state.deadline - Date.now()
  if (remaining <= 5_000) throw new AgentOcrBudgetError(ctx.state.pagesUsed, true)
  const b64 = opts.jpeg ?? (ctx.prepare ?? prepareImageForOcr)(buf)
  ctx.state.pagesLeft--
  ctx.state.pagesUsed++
  ctx.onStep?.(`Texterkennung ${ctx.state.pagesUsed}/${ctx.state.pagesUsed + ctx.state.pagesLeft} · ${label}`)
  const r = await (ctx.ocr ?? ocrImageLocal)(b64, { settings: ctx.state.settings, signal: ctx.signal, timeoutMs: Math.min(OCR_PAGE_TIMEOUT_MS, remaining) })
  if (!r.success) throw new Error(`Texterkennung fehlgeschlagen: ${r.error ?? 'kein Text'}`)
  const page: AgentOcrPage = { content: r.content, ...(r.incomplete ? { incomplete: true } : {}), ...(r.repeated ? { repeated: true } : {}) }
  ctx.state.cache.set(hash, page)
  return page
}

export class AgentOcrBudgetError extends Error {
  constructor(used: number, time = false) {
    super(time
      ? `Texterkennung: Zeitbudget von ${Math.round(AGENT_OCR_TIME_BUDGET_MS / 60_000)} Minuten für diesen Lauf erschöpft (${used} Seiten/Bilder erkannt)`
      : `Texterkennung: Budget von ${used} Seiten/Bildern für diesen Lauf erschöpft`)
    this.name = 'AgentOcrBudgetError'
  }
}

/** Text eines Bildes samt Vermerk — für Bilddateien in Anhängen und Ordnern. */
export async function ocrImageForAgent(buf: Buffer, label: string, ctx: OcrReadContext): Promise<string> {
  const r = await ocrForAgent(buf, label, ctx)
  const flags = [r.incomplete ? 'möglicherweise unvollständig' : '', r.repeated ? 'Wiederholung des Modells entfernt' : ''].filter(Boolean)
  return `[Bild ${OCR_TEXT_NOTE}${flags.length ? `; ${flags.join('; ')}` : ''}]\n${r.content}`
}
