// Schutz gegen den stillen Kontext-Überlauf.
//
// Ollama/llama.cpp wirft beim Überlauf die MITTE der Konversation weg und meldet
// das NICHT: System-Prompt und letzte Nachricht überleben, der Auftrag des Nutzers
// und alle bisherigen Tool-Ergebnisse nicht. Der Lauf sieht danach erfolgreich aus
// und produziert ein plausibles, aber auftragsfremdes Ergebnis.
//
// Empirisch geprüft 2026-07-26 gegen qwen3.5:4b und qwen3.6:latest (identisch, es
// ist llama.cpp-Ebene): Bei 60.000 gesendeten Zeichen gegen num_ctx 4096 fiel
// prompt_eval_count von 106 auf 59 Token — übrig blieben System-Prompt und die
// letzte Tool-Antwort. Beide Modelle schrieben danach ein Ergebnis ohne den im
// Auftrag geforderten Titel, ohne den Verlust zu erwähnen.
//
// Andere Backends (zur Einordnung, nicht von diesem Modul abgedeckt):
//   - OpenRouter bricht bei Überlauf mit einem Fehler ab — AUSSER bei Endpunkten
//     mit ≤8k Kontext, dort ist die "middle-out"-Kompression per Default an und
//     kürzt ebenfalls die Mitte (gleiche Klasse von stillem Verlust).
//   - LM Studio hat eine konfigurierbare Overflow-Policy; die App kennt sie nicht.
// Deshalb ist die Prüfung backend-unabhängig formuliert: Sie stützt sich nur auf
// die vom Server gemeldeten Prompt-Token, die alle drei Wire-Formate liefern.

// Kontextfenster, das der Notiz-Agent explizit anfordert (Ollama `options.num_ctx`).
// Ohne diese Angabe erbt der Request Ollamas globale Einstellung, die die App nicht
// kennt — der Überlauf hinge dann von einer Einstellung ab, die der Nutzer irgendwann
// mal gesetzt hat.
export const AGENT_NUM_CTX = 32_768

// Mit Webrecherche wird es deutlich mehr: bis zu 10 Fetches à 8.000 Zeichen
// (WEB_PAGE_CONTEXT_MAX_CHARS) plus 8 Suchen à 8 Treffer — rund 144.000 Zeichen,
// also grob 50.000 Token. 65.536 deckt das mit Reserve ab und kostet auf einem
// 32-GB-Mac gemessen ~1 GB mehr als 32k (qwen3.6:latest: 24 → 25 GB).
export const AGENT_NUM_CTX_WEB = 65_536

// Zeichen pro Token — bewusst großzügig (deutscher Text liegt eher bei 3). Der Wert
// wird nur für eine UNTERE Schranke benutzt: Die echten Prompt-Token liegen wegen der
// Tool-Schemata immer darüber. Ein zu hoher Divisor macht die Prüfung also stumpfer,
// nie falsch-positiv.
const CHARS_PER_TOKEN = 4

// Wie weit die Prompt-Token gegenüber dem vorherigen Durchlauf fallen dürfen, bevor
// wir von Kürzung ausgehen. Die Historie wächst monoton (es wird nur angehängt), ein
// echter Rückgang ist also nicht erklärbar. 10 % Toleranz für Tokenizer-Rauschen.
const SHRINK_TOLERANCE = 0.9

// Anteil der geschätzten Untergrenze, unter dem der erste Durchlauf als gekürzt gilt.
const FIRST_CALL_FLOOR = 0.6

export interface ContextTruncationInput {
  // Vom Server gemeldete Prompt-Token (Ollama `prompt_eval_count`,
  // OpenAI-kompatibel `usage.prompt_tokens`). Undefined = keine Aussage möglich.
  promptTokens?: number
  // Prompt-Token des vorherigen Durchlaufs desselben Laufs.
  previousPromptTokens?: number
  // Zeichen, die in dieser Runde gesendet wurden (Summe aller Nachrichteninhalte).
  sentChars: number
}

// true, wenn die Konversation nachweislich nicht vollständig verarbeitet wurde.
// Im Zweifel false: lieber eine Kürzung übersehen als einen gesunden Lauf abbrechen.
export function looksTruncated(input: ContextTruncationInput): boolean {
  const { promptTokens, previousPromptTokens, sentChars } = input
  if (typeof promptTokens !== 'number' || promptTokens <= 0) return false

  // Stärkstes Signal: Die Historie ist gewachsen, die verarbeiteten Token sind
  // gefallen. Das kann nur Kürzung sein.
  if (typeof previousPromptTokens === 'number' && previousPromptTokens > 0) {
    if (promptTokens < previousPromptTokens * SHRINK_TOLERANCE) return true
  }

  // Auch der ERSTE Aufruf kann schon überlaufen (großer Notiz-Kontext, große Skill).
  // Dann gibt es keinen Vorwert — hier hilft nur die Abschätzung aus den Zeichen.
  const lowerBound = sentChars / CHARS_PER_TOKEN
  if (lowerBound > 0 && promptTokens < lowerBound * FIRST_CALL_FLOOR) return true

  return false
}

// Fehlertext für den abgebrochenen Lauf. Bewusst handlungsleitend — und die Abhilfe
// muss zur Ursache passen: Der Agent sendet num_ctx SELBST (AGENT_NUM_CTX*), die
// Server-Einstellung OLLAMA_CONTEXT_LENGTH ist für diesen Request also wirkungslos.
// Was wirklich hilft, ist die Konversation zu verkleinern — oder das Modell selbst
// hat ein kleineres Maximum als angefordert, dann hilft nur ein anderes Modell.
export function contextTruncationMessage(promptTokens: number, expectedAtLeast: number, requestedCtx?: number): string {
  const window = requestedCtx
    ? `Angefordert waren ${requestedCtx.toLocaleString('de-DE')} Token — wurde trotzdem gekürzt, ist das Maximum des Modells vermutlich kleiner. `
    : ''
  return (
    `Das Kontextfenster reicht für diesen Lauf nicht — die Konversation wurde gekürzt ` +
    `(verarbeitet: ${promptTokens} Token, erwartet mindestens ~${Math.round(expectedAtLeast)}). ` +
    `Dabei geht der Auftrag mitsamt den bisherigen Zwischenergebnissen verloren, deshalb wurde der Lauf abgebrochen. ` +
    window +
    `Abhilfe: weniger oder kleinere Anhänge mitgeben, den Auftrag kleiner schneiden, ` +
    `oder ein Modell mit größerem Kontextfenster wählen.`
  )
}
