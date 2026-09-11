// Entwurfsablage für das Compose-Fenster — pro Vault im localStorage.
//
// Vorher lebte ein Entwurf nur im Arbeitsspeicher: X, „Zurück" oder ein
// Neustart, und der halb geschriebene Text war weg. Jetzt wird jeder
// angefasste Entwurf gesichert; Schließen behält ihn, nur „Verwerfen" und
// erfolgreiches Senden entfernen ihn. Unangefasste Entwürfe (nur Signatur,
// leerer Empfänger) werden beim Schließen still verworfen.
//
// Kein stilles Löschen: Es gibt keine Obergrenze, die den ältesten Entwurf
// wegwirft. Scheitert das Schreiben (Speicher voll, gesperrt), meldet
// `saveDraft` das — der Aufrufer zeigt es an, statt eine Sicherung zu
// behaupten, die es nicht gibt.
//
// Anhänge werden als Pfade gesichert, nie als Bytes. Das Speicherziel ist
// austauschbar (`DraftStorage`), damit die Logik ohne Browser testbar bleibt.

import type { ComposeEmail } from '../../shared/types'

export interface EmailDraft {
  id: string
  updatedAt: string
  compose: ComposeEmail
}

export interface DraftStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface DraftWriteResult {
  drafts: EmailDraft[]
  /** false = die Ablage konnte nicht geschrieben werden; `drafts` ist dann
   *  der Stand im Speicher, nicht der auf der Platte. */
  ok: boolean
  error?: string
}

export function draftStorageKey(vaultPath: string): string {
  return `mindgraph:email-drafts:${vaultPath}`
}

export function loadDrafts(storage: DraftStorage, vaultPath: string): EmailDraft[] {
  try {
    const raw = storage.getItem(draftStorageKey(vaultPath))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((d): d is EmailDraft =>
      d && typeof d.id === 'string' && typeof d.updatedAt === 'string' && d.compose && typeof d.compose === 'object'
    )
  } catch {
    return []
  }
}

function writeDrafts(storage: DraftStorage, vaultPath: string, drafts: EmailDraft[]): { ok: boolean; error?: string } {
  try {
    if (drafts.length === 0) storage.removeItem(draftStorageKey(vaultPath))
    else storage.setItem(draftStorageKey(vaultPath), JSON.stringify(drafts))
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/** Legt an oder aktualisiert; neueste zuerst. Ohne `draftId` wird nichts geschrieben. */
export function saveDraft(storage: DraftStorage, vaultPath: string, compose: ComposeEmail, now = new Date()): DraftWriteResult {
  if (!compose.draftId) return { drafts: loadDrafts(storage, vaultPath), ok: true }
  const others = loadDrafts(storage, vaultPath).filter(d => d.id !== compose.draftId)
  const entry: EmailDraft = { id: compose.draftId, updatedAt: now.toISOString(), compose }
  const next = [entry, ...others]
  const written = writeDrafts(storage, vaultPath, next)
  return { drafts: next, ok: written.ok, error: written.error }
}

export function removeDraft(storage: DraftStorage, vaultPath: string, draftId: string): EmailDraft[] {
  const next = loadDrafts(storage, vaultPath).filter(d => d.id !== draftId)
  writeDrafts(storage, vaultPath, next)
  return next
}

/** Unangefasst = nichts, was verloren gehen könnte. `pristine` setzt der Store
 *  beim Anlegen und nimmt es bei der ersten Änderung zurück. */
export function draftHasContent(compose: ComposeEmail): boolean {
  return compose.pristine !== true
}

export function newDraftId(): string {
  return `d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}
