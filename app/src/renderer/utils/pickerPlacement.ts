// Aufklapp-Richtung und Höhe für die Kontext-/Zielordner-Picker der Macher-Leiste.
//
// Die Picker öffnen historisch NACH OBEN — richtig in der Macher-Leiste, die am
// unteren Rand des Editors klebt. Im Agent-Tab sitzt dieselbe Zeile aber knapp
// unter der Überschrift, und `.agent-view` ist ein Scroll-Container: Alles, was
// nach oben aus ihm herausragt, wird abgeschnitten.
//
// Entscheidend ist dabei, WAS abgeschnitten wird. Nach oben geklappt liegt das
// Suchfeld am äußersten Ende des Panels — es verschwindet also zuerst, während
// die Trefferliste stehen bleibt (genau der gemeldete Fehler). Nach unten
// geklappt sitzt das Suchfeld direkt am Knopf und bleibt immer sichtbar; zu
// wenig Platz kürzt dann nur die Trefferliste. Deshalb hat „nach unten" im
// Zweifel Vorrang, und die Panel-Höhe wird zusätzlich gedeckelt.

// Höhe eines voll ausgefahrenen Pickers (Suchfeld + 8 Treffer + zwei Fußzeilen-
// Buttons + Innenabstand).
export const PICKER_HEIGHT_ESTIMATE = 300

// Darunter lohnt sich Aufklappen nicht mehr — Suchfeld plus zwei, drei Treffer.
export const PICKER_MIN_USABLE = 140

// Abstand zwischen Knopf und Panel (spiegelt `calc(100% + 6px)` im CSS).
const GAP = 6

export type PickerPlacement = 'above' | 'below'

export interface PickerLayout {
  placement: PickerPlacement
  // Deckel für die Panel-Höhe, damit es nie über den Rand hinausragt.
  maxHeight: number
}

// Reine Entscheidung, damit sie ohne DOM prüfbar bleibt.
export function choosePlacement(spaceAbove: number, spaceBelow: number, needed = PICKER_HEIGHT_ESTIMATE): PickerLayout {
  // Oben passt alles → alte, gewohnte Richtung (Macher-Leiste am unteren Rand).
  if (spaceAbove >= needed) return { placement: 'above', maxHeight: spaceAbove }
  // Oben zu eng: nach unten, sobald dort überhaupt brauchbar Platz ist. Das
  // rettet das Suchfeld, auch wenn unten in Summe weniger Platz wäre.
  if (spaceBelow >= PICKER_MIN_USABLE) return { placement: 'below', maxHeight: spaceBelow }
  // Beides zu eng (sehr flaches Fenster) → die größere Seite, gedeckelt.
  return spaceBelow > spaceAbove
    ? { placement: 'below', maxHeight: spaceBelow }
    : { placement: 'above', maxHeight: spaceAbove }
}

// Nächster Vorfahre, der überhaupt abschneidet (overflow != visible). Genau der
// begrenzt den sichtbaren Bereich — nicht das Fenster.
function clippingRect(el: HTMLElement): { top: number; bottom: number } {
  let node: HTMLElement | null = el.parentElement
  while (node && node !== document.body) {
    const style = getComputedStyle(node)
    const overflow = `${style.overflow}${style.overflowX}${style.overflowY}`
    if (/(auto|scroll|hidden|clip)/.test(overflow)) {
      const r = node.getBoundingClientRect()
      return { top: Math.max(0, r.top), bottom: Math.min(window.innerHeight, r.bottom) }
    }
    node = node.parentElement
  }
  return { top: 0, bottom: window.innerHeight }
}

// Richtung und Höhendeckel für einen Picker, der an `anchor` hängt.
export function measurePlacement(anchor: HTMLElement | null): PickerLayout {
  if (!anchor) return { placement: 'above', maxHeight: PICKER_HEIGHT_ESTIMATE }
  const rect = anchor.getBoundingClientRect()
  const clip = clippingRect(anchor)
  return choosePlacement(rect.top - clip.top - GAP, clip.bottom - rect.bottom - GAP)
}
