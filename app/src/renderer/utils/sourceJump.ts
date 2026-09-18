/**
 * Quellenklick aus dem Vault-Chat (F28, Nachprüfung Runde 4): reine Logik ohne React, damit
 * Reihenfolge, Vault-Bindung und Pfadauflösung testbar sind.
 *
 * - Jeder Klick bekommt VOR dem IPC-Aufruf ein Token. Nach dem Warten gilt nur der neueste
 *   Klick im weiterhin gleichen Vault; verspätete Antworten älterer Klicks oder aus einem
 *   anderen Vault werden verworfen (nie „Auswahl B, dann A“).
 * - Der Quellenpfad wird ausschließlich exakt aufgelöst: Notizpfade werden gegen den
 *   aktiven Vault relativiert und müssen dem `fileRel` der Quelle gleichen — kein Suffix-Raten.
 * - `changed` (Hash weicht ab, keine eindeutige Stelle) öffnet die Notiz ausdrücklich am
 *   Anfang (Ziel ohne Hash, Zeile 1) mit sichtbarem Hinweis.
 */

import type { VaultLocateSourceResult, VaultRagHitDto } from '../../shared/types'
import type { PendingSourceTarget } from '../stores/tabStore'

export type SourceJumpNotice = 'other-vault' | 'missing' | 'changed' | 'relocated' | 'error'

export interface SourceJumpDeps {
  getVaultPath: () => string | null
  locate: (vaultPath: string, ref: { fileRel: string; sourceHash: string; chunkHash: string; sourceStart: number; sourceEnd: number; startLine: number }) => Promise<{ success: boolean; result?: VaultLocateSourceResult; error?: string }>
  /** Exakte Auflösung des vault-relativen Pfads auf eine Notiz-ID (siehe `findNoteByVaultPath`). */
  resolveNoteId: (fileRel: string, vaultPath: string) => string | null
  selectNote: (noteId: string) => void
  setPendingTarget: (target: PendingSourceTarget | null) => void
  notify: (kind: SourceJumpNotice, detail?: string) => void
}

export type SourceJumpOutcome = 'jump' | 'top' | 'notice' | 'ignored'

export function normalizeVaultRelPath(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\.?\/+/, '').normalize('NFC')
}

/**
 * Exakte Pfadauflösung: absolute Notizpfade werden gegen den Vault relativiert, alles andere
 * gilt bereits als vault-relativ; Treffer nur bei Gleichheit. `x.md` trifft nie `a/x.md`.
 */
export function findNoteByVaultPath<T extends { id: string; path: string }>(notes: readonly T[], fileRel: string, vaultPath: string): T | null {
  const target = normalizeVaultRelPath(fileRel)
  if (!target) return null
  const vault = normalizeVaultRelPath(vaultPath).replace(/\/+$/, '')
  for (const note of notes) {
    let rel = normalizeVaultRelPath(note.path)
    if (vault && rel.startsWith(vault + '/')) rel = rel.slice(vault.length + 1)
    if (rel === target) return note
  }
  return null
}

export function createSourceOpener(deps: SourceJumpDeps): (msg: { vaultPath?: string }, hit: VaultRagHitDto) => Promise<SourceJumpOutcome> {
  let latest = 0
  return async (msg, hit) => {
    const vaultAtClick = deps.getVaultPath()
    if (!vaultAtClick || msg.vaultPath !== vaultAtClick) {
      deps.notify('other-vault')
      return 'notice'
    }
    const token = ++latest
    const res = await deps.locate(vaultAtClick, {
      fileRel: hit.fileRel, sourceHash: hit.sourceHash, chunkHash: hit.chunkHash,
      sourceStart: hit.sourceStart, sourceEnd: hit.sourceEnd, startLine: hit.startLine
    })
    // Nur der neueste Klick im weiterhin gleichen Vault darf etwas verändern.
    if (token !== latest || deps.getVaultPath() !== vaultAtClick) return 'ignored'
    if (!res.success || !res.result) {
      deps.notify('error', res.error)
      return 'notice'
    }
    const r = res.result
    const noteId = deps.resolveNoteId(r.fileRel, vaultAtClick)
    if (r.status === 'missing' || !noteId) {
      deps.notify('missing')
      return 'notice'
    }
    if (r.status === 'changed') {
      deps.setPendingTarget({ noteId, vaultPath: vaultAtClick, line: 1, sourceHash: null, token })
      deps.selectNote(noteId)
      deps.notify('changed')
      return 'top'
    }
    deps.setPendingTarget({ noteId, vaultPath: vaultAtClick, line: r.startLine, sourceHash: r.sourceHash, token })
    deps.selectNote(noteId)
    if (r.status === 'relocated') deps.notify('relocated')
    return 'jump'
  }
}
