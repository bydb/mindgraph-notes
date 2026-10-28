// Ollama-Fehler in handlungsleitende Meldungen übersetzen (Gegenstück zu
// `friendlyLmStudioError` in main/llm/chatClient.ts).
//
// Anlass (28.10.2026): Nutzer sahen nur „Ollama API Fehler: 400". Der Grund steht in
// Ollamas Antwort (`{"error": "…"}`), landete aber nur im Log. Gemessen an Ollama
// 0.40.10: 400 heißt meist „Modell kann nicht chatten" (Embedding- oder Bildmodell als
// Chat-Modell gewählt) oder „kein Modell gewählt"; 404 heißt „nicht installiert".

/** Liest `error` aus Ollamas JSON-Antwort; sonst den gekürzten Rohtext. */
export function ollamaErrorDetail(body: string): string {
  const text = body.trim()
  try {
    const parsed = JSON.parse(text) as { error?: unknown }
    if (typeof parsed.error === 'string' && parsed.error.trim()) return parsed.error.trim()
  } catch { /* kein JSON */ }
  return text.length > 300 ? `${text.slice(0, 300)}…` : text
}

export function friendlyOllamaError(status: number, body: string, model: string): string {
  const detail = ollamaErrorDetail(body)
  const name = model.trim()

  if (/model is required/i.test(detail) || !name) {
    return 'Ollama: Es ist kein Modell ausgewählt. Bitte in den Einstellungen unter KI & Modelle ein Chat-Modell wählen.'
  }
  if (/does not support (chat|generate|completion)/i.test(detail)) {
    return `Ollama: „${name}“ kann keine Texte schreiben (z. B. ein Embedding- oder Bildmodell). Bitte ein Chat-Modell wählen, etwa qwen3.5:4b.`
  }
  if (/does not support tools/i.test(detail)) {
    return `Ollama: „${name}“ unterstützt keine Werkzeugaufrufe. Für den Agenten ein Modell mit Werkzeugen wählen (z. B. qwen3.x, llama3.1).`
  }
  if (/does not support thinking/i.test(detail)) {
    return `Ollama: „${name}“ unterstützt keinen Denkmodus. Bitte ein anderes Modell wählen.`
  }
  if (/does not support (images|vision)/i.test(detail)) {
    return `Ollama: „${name}“ kann keine Bilder lesen. Bitte ein Modell mit Bildverständnis wählen.`
  }
  if (status === 404 || /not found/i.test(detail)) {
    return `Ollama: „${name}“ ist nicht installiert. Im Terminal mit „ollama pull ${name}“ laden oder ein installiertes Modell wählen.`
  }
  if (status === 403 && /cloud/i.test(detail)) {
    return `Ollama-Cloud-Modell nicht verfügbar — bist du eingeloggt? Führe \`ollama signin\` im Terminal aus, oder wähle ein lokales Modell. (Details: ${detail})`
  }
  return detail ? `Ollama-Fehler ${status}: ${detail}` : `Ollama-Fehler ${status}`
}
