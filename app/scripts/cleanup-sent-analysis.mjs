#!/usr/bin/env node
// Cleanup: entfernt vom Bug erzeugte `analysis`-Objekte auf GESENDETEN Mails.
//
// Hintergrund: Bis zum Sent-Filter-Fix (index.ts:7539 / emailStore.ts:103) wurden
// auch selbst gesendete Mails (sent:true) auf Relevanz/needsReply analysiert — das
// ist fachlich sinnlos und hat bei langsamen Modellen 5-Min-Timeouts verbrannt. Die
// bereits geschriebenen analysis-Objekte sind harmlose Altlast; dieses Skript räumt sie weg.
//
// SICHERHEIT:
//   - Dry-Run per Default (zeigt nur, was passieren würde). Schreiben erst mit --apply.
//   - Vor jedem Schreiben wird emails.json nach <vault>/.mindgraph/backups/<datum>/ gesichert
//     (dieser Ordner ist vom Sync ausgeschlossen).
//   - Idempotent: ein zweiter Lauf findet nichts mehr.
//   - Anhänge-/Notiz-DATEIEN werden NICHT angefasst. Das Skript löscht keine Markdown-Notizen,
//     listet aber die notePaths gesendeter Mails auf, damit du sie bei Bedarf manuell prüfst.
//
// WICHTIG ZUM TIMING: Lauf das Cleanup, während KEINE App auf den Vault schreibt
//   (installierte App + `npm run dev` schließen) — sonst Race mit dem Vault-Writer.
//   Und benutze danach nur eine App MIT dem Sent-Filter-Fix; eine alte Version ohne Fix
//   könnte eine gerade gestrippte Sent-Mail erneut analysieren.
//
// Aufruf:
//   node app/scripts/cleanup-sent-analysis.mjs <vaultPfad>            # Dry-Run (Vorschau)
//   node app/scripts/cleanup-sent-analysis.mjs <vaultPfad> --apply    # tatsächlich schreiben
//   node app/scripts/cleanup-sent-analysis.mjs <vaultPfad> --apply --clear-note-flags
//
// Optionen:
//   --apply             Änderungen schreiben (sonst nur Vorschau).
//   --clear-note-flags  zusätzlich noteCreated/notePath auf Sent-Mails entfernen
//                       (die Notiz-DATEI bleibt, nur die Verknüpfung im Datensatz fällt weg).

import fs from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)
const flags = new Set(args.filter((a) => a.startsWith('--')))
const positional = args.filter((a) => !a.startsWith('--'))

const vaultPath = positional[0]
const apply = flags.has('--apply')
const clearNoteFlags = flags.has('--clear-note-flags')

if (!vaultPath) {
  console.error('Fehler: Vault-Pfad fehlt.\n')
  console.error('  node app/scripts/cleanup-sent-analysis.mjs <vaultPfad> [--apply] [--clear-note-flags]')
  process.exit(1)
}

const emailsPath = path.join(vaultPath, '.mindgraph', 'emails.json')
if (!fs.existsSync(emailsPath)) {
  console.error(`Fehler: ${emailsPath} existiert nicht.`)
  process.exit(1)
}

const raw = fs.readFileSync(emailsPath, 'utf-8')
let data
try {
  data = JSON.parse(raw)
} catch (e) {
  console.error(`Fehler: ${emailsPath} ist kein gültiges JSON: ${e.message}`)
  process.exit(1)
}

const emails = Array.isArray(data.emails) ? data.emails : []
const sent = emails.filter((e) => e && e.sent === true)
const withAnalysis = sent.filter((e) => e.analysis)
const withNoteFlags = sent.filter((e) => e.noteCreated || e.notePath)

console.log(`Vault:        ${vaultPath}`)
console.log(`emails.json:  ${emails.length} Mails gesamt, ${sent.length} gesendet (sent:true)`)
console.log(`Zu bereinigen: ${withAnalysis.length} Sent-Mails mit analysis-Objekt`)
if (clearNoteFlags) {
  console.log(`               + ${withNoteFlags.length} Sent-Mails mit noteCreated/notePath (--clear-note-flags)`)
}

if (withAnalysis.length === 0 && (!clearNoteFlags || withNoteFlags.length === 0)) {
  console.log('\nNichts zu tun. (idempotent)')
  process.exit(0)
}

// Vorschau: welche Mails sind betroffen + welche Notiz-Dateien hängen dran
console.log('\nBetroffene Sent-Mails:')
for (const e of sent) {
  const touch = []
  if (e.analysis) touch.push('analysis')
  if (clearNoteFlags && (e.noteCreated || e.notePath)) touch.push('noteCreated/notePath')
  if (touch.length === 0) continue
  console.log(`  • "${e.subject}"  [${e.folder || '-'}]  → entferne: ${touch.join(', ')}`)
  if (e.notePath) console.log(`      ↳ verknüpfte Notiz (bleibt erhalten): ${e.notePath}`)
}

if (!apply) {
  console.log('\n── DRY-RUN ── Nichts geschrieben. Mit --apply ausführen.')
  process.exit(0)
}

// ── Apply: erst Backup, dann schreiben ──────────────────────────────────────
const now = new Date()
const dateDir = now.toISOString().slice(0, 10) // YYYY-MM-DD
const stamp = now.toISOString().replace(/[:.]/g, '-')
const backupDir = path.join(vaultPath, '.mindgraph', 'backups', dateDir)
fs.mkdirSync(backupDir, { recursive: true })
const backupPath = path.join(backupDir, `emails.json.${stamp}.cleanup.bak`)
fs.writeFileSync(backupPath, raw, 'utf-8')
console.log(`\nBackup: ${backupPath}`)

let strippedAnalysis = 0
let clearedFlags = 0
for (const e of sent) {
  if (e.analysis) {
    delete e.analysis
    strippedAnalysis++
  }
  if (clearNoteFlags) {
    if ('noteCreated' in e) {
      delete e.noteCreated
      clearedFlags++
    }
    if ('notePath' in e) delete e.notePath
  }
}

// Format wie die App: JSON.stringify(data, null, 2)
fs.writeFileSync(emailsPath, JSON.stringify(data, null, 2), 'utf-8')

console.log(`\nFertig:`)
console.log(`  analysis entfernt von:        ${strippedAnalysis} Sent-Mails`)
if (clearNoteFlags) console.log(`  noteCreated/notePath entfernt: ${clearedFlags} Sent-Mails`)
console.log(`  geschrieben:                  ${emailsPath}`)
console.log(`\nHinweis: Etwaige Notiz-DATEIEN wurden NICHT gelöscht — bei Bedarf manuell im Vault entfernen.`)
