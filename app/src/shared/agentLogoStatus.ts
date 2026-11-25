// Das Logo im Kopf des Agent-Tabs als Statusanzeige (24.11.2026). Das Zeichen hat einen
// Mittelknoten und drei Außenknoten — genau die vier Dinge eines Auftrags: Agent (Mitte),
// Auftrag (oben), Unterlagen (unten links), Ergebnis (unten rechts). Hier nur die Zuordnung
// „welcher Protokollschritt ist welche Tätigkeit“; pur und getestet.

export type LogoActivity = 'read' | 'write' | 'think'

/** Schreibende Werkzeuge: alles, was ein Ergebnis erzeugt. */
function isWriteStep(skill: string): boolean {
  return skill.startsWith('write_') || skill === 'fill_docx_form' || skill === 'generate_image' || skill === 'shell_stage_file'
}

/** Schritte der App selbst — keine Tätigkeit des Agenten an Unterlagen oder Ergebnis. */
const APP_STEPS = new Set(['kontext', 'shell_access', 'computer_access', 'bild'])

/**
 * Tätigkeit zu einem Protokollschritt. Alles, was weder schreibt noch ein Schritt der App ist,
 * holt etwas herein (Dateien, Notizen, Suche, Webseiten, Skills, externe Dienste) → 'read'.
 */
export function stepActivity(skill: string): LogoActivity {
  const s = skill.trim()
  if (!s || APP_STEPS.has(s)) return 'think'
  return isWriteStep(s) ? 'write' : 'read'
}
