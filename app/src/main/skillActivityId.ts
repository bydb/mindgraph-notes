// Opake Skill-Kennung für das Tätigkeitsprotokoll und die Skill-Referenzen der Zeitbilanz.
//
// Der Skill-Ordnername ist frei gewählt und kann einen Kunden oder ein Projekt nennen —
// er gehört nicht ins Protokoll, das nur Art, Zeit und Status trägt (Codex F05). Der
// Vault-Pfad geht mit ein, damit gleichnamige Skills zweier Vaults keine Referenz teilen
// (F02). Derselbe Pfad-String wie beim Ledger-Dateinamen (activityLedger.ts), damit ein
// Vault-Umzug Protokoll und Referenzen gemeinsam „verliert", nicht getrennt.
//
// Eigene Datei ohne Electron-Import: use_skill (noteAgent/skills.ts) und die Tests brauchen
// die Funktion, ohne den Ledger samt `app` zu laden.

import { createHash } from 'crypto'

/** Opake Vault-Kennung — derselbe Hash wie der Ledger-Dateiname (activityLedger.ts ledgerFile). */
export function vaultActivityKey(vaultPath: string): string {
  return createHash('sha256').update(vaultPath).digest('hex').slice(0, 16)
}

export function skillActivityId(vaultPath: string, folderName: string): string {
  return 'sk-' + createHash('sha256').update(`skill\u0000${vaultPath}\u0000${folderName}`).digest('hex').slice(0, 16)
}
