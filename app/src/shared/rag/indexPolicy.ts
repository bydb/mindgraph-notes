/**
 * Welche Notizen KEINE Quellen für den Vault-Chat sind, obwohl sie im Vault liegen (Phase 3):
 * die eigenen gespeicherten Chat-Antworten und Brain-Tagesnotizen. Real (20.09.2026): eine als
 * Notiz gespeicherte Chat-Antwort stand bei der nächsten ähnlichen Frage selbst auf Rang 1 der
 * Quellen — die App hätte sich selbst zitiert. Brain-Tagesnotizen (KI-Zusammenfassungen der
 * eigenen Aktivität) drängten sich als kurze Listen vor die eigentlichen Notizen; ohne sie stieg
 * die MRR am Tuning-Set von 0,78 auf 0,80 bei gleicher Trefferzahl.
 *
 * BEWUSST NICHT ausgeschlossen: alles, was nur `ki-modell` (KI-Provenienz) trägt — das sind auch
 * Mail-Notizen und vom Agenten erstellte Recherchen mit echtem Inhalt. Ein erster Versuch mit
 * `ki-modell` als Kriterium warf 591 von 2964 Notizen aus dem Index und kostete drei Treffer.
 *
 * Erkannt wird am Frontmatter: `ki-typ: vault-chat-antwort` (setzt „Als neue Notiz speichern“)
 * oder `type: brain-day`.
 */

export const VAULT_CHAT_ANSWER_TYPE = 'vault-chat-antwort'

/**
 * Version der Indexregeln (welche Dateien überhaupt Quellen sein dürfen). Ändert sie sich, ist ein
 * bestehender Index inhaltlich veraltet: unveränderte Dateien würden im inkrementellen Lauf ungelesen
 * übernommen, eine schon indexierte Brain-Notiz bliebe also Quelle. Die Version gehört deshalb in die
 * Index-Identität (neuer Dateiname, sichtbarer Hinweis „neu aufbauen“), NICHT in
 * `embeddingsCompatible` — die Vektoren unveränderter Chunks bleiben gültig und werden übernommen.
 *
 * 1: Ausgangsstand (nur Nutzer-Ausschlüsse, Vorlagen-Ordner)
 * 2: Skills-Ordner und node_modules permanent aus; Ordnervergleich in Normalform;
 *    gespeicherte Vault-Antworten (`ki-typ`) und Brain-Tagesnotizen nicht mehr indexieren
 */
export const INDEX_POLICY_VERSION = 2

const FRONTMATTER_RE = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/

export function isDerivedAiNote(content: string): boolean {
  const m = FRONTMATTER_RE.exec(content)
  if (!m) return false
  const fm = m[1]
  if (new RegExp(`^ki-typ\\s*:\\s*["']?${VAULT_CHAT_ANSWER_TYPE}["']?\\s*$`, 'm').test(fm)) return true
  if (/^type\s*:\s*["']?brain-day["']?\s*$/m.test(fm)) return true
  return false
}
