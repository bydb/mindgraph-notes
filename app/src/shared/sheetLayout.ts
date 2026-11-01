// Spaltenbreiten und Autofilter für Excel-Dateien des Notiz-Agenten. SheetJS schreibt ohne
// `!cols` jede Spalte in Standardbreite — Namen, Schulen und E-Mail-Adressen waren in der
// Teilnehmerliste abgeschnitten (real, 31.10.2026). Fettdruck kann die Community-Ausgabe
// von SheetJS nicht schreiben; der Autofilter markiert die Kopfzeile trotzdem sichtbar.

const MIN_WIDTH = 6
const MAX_WIDTH = 60

/** Breite je Spalte in Zeichen (`wch`): längster Wert der Spalte, längste Zeile bei Umbrüchen. */
export function sheetColumnWidths(aoa: unknown[][]): Array<{ wch: number }> {
  const columns = Math.max(0, ...aoa.map(r => r.length))
  const widths: Array<{ wch: number }> = []
  for (let c = 0; c < columns; c++) {
    let longest = 0
    aoa.forEach((row, r) => {
      const v = row[c]
      if (v === null || v === undefined) return
      // Kopfzeile: zwei Zeichen extra für den Filterknopf des Autofilters.
      const extra = r === 0 ? 2 : 0
      for (const line of String(v).split('\n')) longest = Math.max(longest, [...line].length + extra)
    })
    widths.push({ wch: Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, longest + 2)) })
  }
  return widths
}

/** Spaltenbuchstabe(n) für einen 0-basierten Index (0 → A, 26 → AA). */
function columnName(index: number): string {
  let n = index + 1, s = ''
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26) }
  return s
}

/** Autofilter-Bereich über Kopf + Daten, z.B. `A1:F9`; null ohne Kopf oder Daten. */
export function autofilterRef(aoa: unknown[][]): string | null {
  const columns = Math.max(0, ...aoa.map(r => r.length))
  if (aoa.length < 2 || columns === 0) return null
  return `A1:${columnName(columns - 1)}${aoa.length}`
}
