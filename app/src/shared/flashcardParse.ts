// Karteikarten aus einer Modellantwort lesen (`flashcards-generate`).
//
// Cloud-Aufrufe laufen im JSON-Modus, und der erzwingt EIN Objekt — der Prompt verlangte aber ein
// Array. LLMBase/deepseek lieferte deshalb genau eine Karte als Objekt, der Parser fand kein Array,
// und der Nutzer sah „Konnte keine Karteikarten … extrahieren“ (Schülertest 07.11.2026). Jetzt
// verlangt der Prompt `{"cards": [...]}` (geht in beiden Modi), und gelesen wird jede der Formen.

export interface ParsedCard { front: string; back: string; topic: string }

function tryJson(s: string): unknown {
  try {
    return JSON.parse(s.replace(/,\s*]/g, ']').replace(/,\s*}/g, '}'))
  } catch {
    return undefined
  }
}

function asCards(v: unknown): unknown[] | null {
  if (Array.isArray(v)) return v
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    for (const k of ['cards', 'flashcards', 'karten']) if (Array.isArray(o[k])) return o[k] as unknown[]
    if (typeof o.front === 'string' && typeof o.back === 'string') return [o]
  }
  return null
}

export function parseFlashcardReply(raw: string, max: number): ParsedCard[] {
  const text = raw.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
  const candidates: string[] = []
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) candidates.push(fence[1].trim())
  candidates.push(text)
  const a = text.indexOf('['), b = text.lastIndexOf(']')
  if (a !== -1 && b > a) candidates.push(text.slice(a, b + 1))
  const c = text.indexOf('{'), d = text.lastIndexOf('}')
  if (c !== -1 && d > c) candidates.push(text.slice(c, d + 1))
  for (const cand of candidates) {
    const list = asCards(tryJson(cand))
    if (!list) continue
    const cards = list
      .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
      .filter((x) => typeof x.front === 'string' && typeof x.back === 'string' && x.front.trim() !== '' && x.back.trim() !== '')
      .map((x) => ({ front: (x.front as string).trim(), back: (x.back as string).trim(), topic: typeof x.topic === 'string' ? x.topic.trim() : '' }))
      .slice(0, max)
    if (cards.length) return cards
  }
  return []
}
