// Modus und Grenzen von generate_image — pur, damit Schreibweisen und Grenzen testbar sind.
//
// Ein unbekannter Modus darf NICHT still zur Illustration werden: „Infografik" oder
// „info-grafik" ergaben sonst ein textloses Titelbild, also genau den Fehler, für den
// der Infografik-Modus gebaut wurde (Codex F02, 27.10.2026).

export type ImageMode = 'illustration' | 'infografik'

export const IMAGE_MODES: readonly ImageMode[] = ['illustration', 'infografik']

// Layout + wörtliche Beschriftungen brauchen mehr als die 50 Wörter eines Titelbilds,
// aber mehr Text im Prompt heißt mehr (unleserliche) Schrift im Bild. Die Zeichengrenze
// fängt lange Ketten ohne Leerraum ab, die die Wortzählung als ein Wort sähe (Codex F05).
export const INFOGRAPHIC_PROMPT_MAX_WORDS = 400
export const INFOGRAPHIC_PROMPT_MAX_CHARS = 3000

const ALIASES: Record<string, ImageMode> = {
  illustration: 'illustration',
  bild: 'illustration',
  image: 'illustration',
  infografik: 'infografik',
  infographic: 'infografik'
}

/** Liest den Modus tolerant (Groß-/Kleinschreibung, Leerraum, Bindestrich). Fehlt er, gilt Illustration. */
export function parseImageMode(raw: unknown): { mode: ImageMode } | { error: string } {
  if (raw === undefined || raw === null || raw === '') return { mode: 'illustration' }
  if (typeof raw !== 'string') return { error: unknownModeMessage(String(raw)) }
  const key = raw.trim().toLowerCase().replace(/[\s_-]+/g, '')
  if (key === '') return { mode: 'illustration' }
  const mode = ALIASES[key]
  return mode ? { mode } : { error: unknownModeMessage(raw) }
}

function unknownModeMessage(raw: string): string {
  return `Unbekannter Modus "${raw.slice(0, 40)}". Erlaubt sind "illustration" (Titel- und Stimmungsbild ohne Text) und "infografik" (Bild mit Beschriftungen). Rufe generate_image mit einem dieser Werte erneut auf.`
}

/** Prüft die Länge eines Infografik-Prompts; null = in Ordnung. */
export function infographicPromptError(prompt: string): string | null {
  const text = prompt.trim()
  const words = text.split(/\s+/).filter(Boolean).length
  if (words > INFOGRAPHIC_PROMPT_MAX_WORDS) {
    return `Der Infografik-Prompt hat ${words} Wörter, erlaubt sind ${INFOGRAPHIC_PROMPT_MAX_WORDS}. Weniger Beschriftungen, kürzere Texte — eine Infografik mit zu viel Text wird unlesbar.`
  }
  if (text.length > INFOGRAPHIC_PROMPT_MAX_CHARS) {
    return `Der Infografik-Prompt hat ${text.length} Zeichen, erlaubt sind ${INFOGRAPHIC_PROMPT_MAX_CHARS}. Weniger Beschriftungen, kürzere Texte — eine Infografik mit zu viel Text wird unlesbar.`
  }
  return null
}
