// Deterministische Mindestprüfung für vom Notiz-Agenten erzeugtes Markdown.
//
// Diese Prüfung bewertet KEINE fachliche Wahrheit. Sie fängt nur Fehler, die der Host
// sicher erkennen kann UND die einem Menschen beim Durchsehen des Ergebnisses leicht
// entgehen: stehengebliebene Platzhalter, kaputte Markdown-Strukturen und eine im
// Auftrag ausdrücklich geforderte Anzahl von Entwürfen.
//
// Bewusst NICHT geprüft wird, ob Hauptabschnitte doppelt vorkommen. Das war im
// Beschaffungs-Härtetest zwar zu sehen, ist aber beim Überfliegen sofort sichtbar —
// und eine Vergleichsvorlage mit „## Bewertung" je Anbieter wäre ein Fehlalarm, der
// einen mehrminütigen Lauf kostet. Das Tor blockiert nur, was still durchrutscht.
//
// Die geforderte Anzahl wird ausschließlich aus der NUTZERANWEISUNG gelesen, nie aus
// gelesenen Anhängen: Sonst könnte eine Mail mit „drei Rückfragen" eine Anforderung
// erzwingen, die der Nutzer nie gestellt hat. Fachliche Kriterien gehören in ein
// separates, domänenspezifisches Eval-Harness.

export interface AgentResultQualityIssue {
  code: 'placeholder' | 'draft-count' | 'unclosed-code-fence' | 'unbalanced-bold'
  message: string
}

const NUMBER_WORDS: Record<string, number> = {
  ein: 1,
  eine: 1,
  einen: 1,
  zwei: 2,
  drei: 3,
  vier: 4,
  fünf: 5,
  sechs: 6,
  seven: 7,
  sieben: 7,
  acht: 8,
  nine: 9,
  neun: 9,
  ten: 10,
  zehn: 10,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6
}

function requestedDraftCount(context: string): number | null {
  const patterns = [
    /\b(\d+|ein(?:e|en)?|zwei|drei|vier|fünf|sechs|sieben|acht|neun|zehn|one|two|three|four|five|six|seven|nine|ten)\b[^.\n]{0,60}\b(?:Rückfragen?|Rückfrageentwürfe?|E-?Mails?|Mailentwürfe?|email drafts?)\b/iu,
    /\b(?:Rückfragen?|Rückfrageentwürfe?|E-?Mails?|Mailentwürfe?|email drafts?)\b[^.\n]{0,40}\b(\d+|ein(?:e|en)?|zwei|drei|vier|fünf|sechs|sieben|acht|neun|zehn|one|two|three|four|five|six|seven|nine|ten)\b/iu
  ]
  for (const pattern of patterns) {
    const raw = context.match(pattern)?.[1]?.toLowerCase()
    if (!raw) continue
    const value = /^\d+$/.test(raw) ? Number(raw) : NUMBER_WORDS[raw]
    if (Number.isInteger(value) && value >= 1 && value <= 10) return value
  }
  return null
}

function isExplicitTemplateRequest(context: string): boolean {
  return /\b(?:leere|wiederverwendbare)\s+(?:\w+\s+){0,2}vorlage\b|\bvorlage\s+(?:zum\s+Ausfüllen|mit\s+Platzhaltern)|\btemplate\s+(?:erstellen|anlegen|with\s+placeholders)/iu.test(context)
}

function actualDraftCount(markdown: string): number {
  const lines = markdown.split(/\r?\n/)
  const start = lines.findIndex(line => /^##\s+.*(?:Rückfrag|Mail|E-Mail|email)/iu.test(line))
  let inSection = start >= 0
  let subheadings = 0
  if (inSection) {
    for (let index = start + 1; index < lines.length; index++) {
      if (/^##\s+/.test(lines[index])) break
      if (/^###\s+/.test(lines[index])) subheadings += 1
    }
  }
  const subjects = [...markdown.matchAll(/^\s*(?:\*\*)?Betreff:(?:\*\*)?\s*.+$/gimu)].length
  const englishSubjects = [...markdown.matchAll(/^\s*(?:\*\*)?Subject:(?:\*\*)?\s*.+$/gimu)].length
  return Math.max(subheadings, subjects + englishSubjects)
}

export function validateAgentMarkdownResult(
  markdown: string,
  trustedInstruction: string
): AgentResultQualityIssue[] {
  const issues: AgentResultQualityIssue[] = []

  // Nur die direkte Nutzeranweisung darf die Platzhalterprüfung abschalten. Inhalte
  // aus Anhängen sind untrusted und könnten sonst „Erstelle eine leere Vorlage“
  // einschleusen, um einen unfertigen Output durch die Prüfung zu bringen.
  if (!isExplicitTemplateRequest(trustedInstruction)) {
    const placeholder = markdown.match(/noch\s+auszufüllen|\bTBD\b|\[einfügen\]|\{\{[^}]+\}\}|\?\?\?/iu)?.[0]
    if (placeholder) issues.push({ code: 'placeholder', message: `Stehengebliebener Platzhalter: „${placeholder}“` })
  }

  const requested = requestedDraftCount(trustedInstruction)
  if (requested !== null) {
    const actual = actualDraftCount(markdown)
    if (actual !== requested) {
      issues.push({ code: 'draft-count', message: `${requested} Entwürfe gefordert, ${actual} erkannt` })
    }
  }

  const fences = [...markdown.matchAll(/^```/gm)].length
  if (fences % 2 !== 0) issues.push({ code: 'unclosed-code-fence', message: 'Nicht geschlossener Codeblock' })

  const boldMarkers = [...markdown.matchAll(/\*\*/g)].length
  if (boldMarkers % 2 !== 0) issues.push({ code: 'unbalanced-bold', message: 'Nicht geschlossene Fettschrift-Markierung' })

  return issues
}
