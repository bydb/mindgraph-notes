/**
 * Cleanup-Funktionen für bereits erzeugte _STATUS-Drafts.
 *
 * Use-Case: Der Nutzer reviewt einen Draft und stellt fest, dass bestimmte
 * Wikilinks (insb. die in der „Hinweise zur Datenqualität"-Sektion gemeldeten)
 * inhaltlich nicht ins Projekt gehören — er will sie mit einem Klick raus.
 *
 * Strategie:
 *   1. Lint-Sektion vom Body trennen (Marker = "## Hinweise zur Datenqualität"
 *      oder "## Data quality notes").
 *   2. Im Body: jede Zeile entfernen, die einen der angegebenen Wikilinks
 *      enthält. Auch tieferliegende Listen-Indentation wird bereinigt.
 *   3. Lint frisch laufen lassen — Findings-Sektion neu erzeugen.
 *   4. Datei schreiben.
 *
 * Sicherheit: vor dem Schreiben wird via `safePath` validiert.
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import { buildVaultIndex, lintContent, appendFindingsSection } from './wikilinkLint'
import type { LintFinding } from './types'

const FINDINGS_SECTION_MARKERS = [
  '## Hinweise zur Datenqualität',
  '## Data quality notes'
]

export interface CleanupResult {
  success: boolean
  removedLineCount?: number
  remainingFindings?: LintFinding[]
  error?: string
}

/**
 * Trennt Body und Findings-Sektion. Liefert den Body inklusive eventueller
 * "---"-Trenner direkt vor der Sektion — die werden später mit der frischen
 * Sektion neu angehängt.
 */
function splitOffFindingsSection(content: string): { body: string; hadFindings: boolean } {
  const lines = content.split('\n')
  let cutAt = -1
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim()
    if (FINDINGS_SECTION_MARKERS.some(m => l === m)) {
      cutAt = i
      break
    }
  }
  if (cutAt === -1) return { body: content, hadFindings: false }

  // Eine vorhergehende "---"-Trennzeile + Leerzeile mit abschneiden,
  // damit beim erneuten appendFindingsSection nichts doppelt erscheint.
  let stopAt = cutAt
  if (stopAt > 0 && lines[stopAt - 1].trim() === '') stopAt--
  if (stopAt > 0 && lines[stopAt - 1].trim() === '---') stopAt--
  if (stopAt > 0 && lines[stopAt - 1].trim() === '') stopAt--

  const body = lines.slice(0, stopAt).join('\n')
  return { body: body.replace(/\s+$/, ''), hadFindings: true }
}

/**
 * Entfernt aus dem Body jede Zeile, die mindestens einen der angegebenen
 * Wikilink-Refs enthält. Refs werden literal (substring) verglichen.
 */
function removeLinesContainingRefs(body: string, refs: string[]): { body: string; removed: number } {
  if (refs.length === 0) return { body, removed: 0 }
  const lines = body.split('\n')
  const kept: string[] = []
  let removed = 0
  for (const line of lines) {
    if (refs.some(ref => line.includes(ref))) {
      removed++
      continue
    }
    kept.push(line)
  }
  // Aufeinanderfolgende Leerzeilen kollabieren (max 2)
  const cleaned: string[] = []
  let blankRun = 0
  for (const l of kept) {
    if (l.trim() === '') {
      blankRun++
      if (blankRun > 2) continue
    } else {
      blankRun = 0
    }
    cleaned.push(l)
  }
  return { body: cleaned.join('\n'), removed }
}

/**
 * Hauptfunktion: ein bereits erzeugtes Status-Markdown nachträglich aufräumen.
 */
export async function cleanupFindings(
  vaultPath: string,
  filePath: string,
  refsToRemove: string[],
  language: 'de' | 'en',
  safePath: (p: string, op: string) => Promise<string>
): Promise<CleanupResult> {
  if (!Array.isArray(refsToRemove) || refsToRemove.length === 0) {
    return { success: false, error: 'Keine Wikilinks zum Entfernen angegeben.' }
  }

  let content: string
  try {
    const safeRead = await safePath(filePath, 'project-status-cleanup:read')
    content = await fs.readFile(safeRead, 'utf-8')
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Konnte Datei nicht lesen'
    }
  }

  // 1) Findings-Sektion abtrennen
  const { body } = splitOffFindingsSection(content)

  // 2) Zeilen mit den angegebenen Refs entfernen
  const { body: cleanedBody, removed } = removeLinesContainingRefs(body, refsToRemove)

  if (removed === 0) {
    return {
      success: false,
      error: 'Keine der angegebenen Verweise wurde in der Notiz gefunden.'
    }
  }

  // 3) Frischen Lint anhängen
  let remainingFindings: LintFinding[] = []
  let finalContent = cleanedBody
  try {
    const index = await buildVaultIndex(vaultPath)
    remainingFindings = lintContent(cleanedBody, index)
    finalContent = appendFindingsSection(cleanedBody, remainingFindings, index, language)
  } catch {
    // Lint-Fehler ist nicht fatal — wir schreiben den Body trotzdem
    finalContent = cleanedBody + '\n'
  }

  // 4) Schreiben
  try {
    const safeWrite = await safePath(filePath, 'project-status-cleanup:write')
    await fs.writeFile(safeWrite, finalContent, 'utf-8')
    return {
      success: true,
      removedLineCount: removed,
      remainingFindings
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Schreiben fehlgeschlagen'
    }
  }
}

/**
 * Löscht eine konkrete `_STATUS-WW(*).md`-Datei.
 *
 * Beschränkt sich bewusst auf Status-Drafts (Dateinamen-Pattern), damit ein
 * Tippfehler im aufrufenden Code niemals eine projektrelevante Datei wegputzt.
 */
export interface DeleteDraftResult {
  success: boolean
  error?: string
}

export async function deleteDraftFile(
  filePath: string,
  safePath: (p: string, op: string) => Promise<string>
): Promise<DeleteDraftResult> {
  const basename = path.basename(filePath)
  // Erlaubt: _STATUS-<YYYY>-W<WW>.md  oder mit Suffix "(2)", "(3)", ...
  if (!/^_STATUS-\d{4}-W\d{2}(?: \(\d+\))?\.md$/.test(basename)) {
    return {
      success: false,
      error: `Verweigert — Dateiname "${basename}" ist kein Status-Draft.`
    }
  }
  try {
    const safe = await safePath(filePath, 'project-status-delete-draft')
    await fs.unlink(safe)
    return { success: true }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Löschen fehlgeschlagen'
    }
  }
}
