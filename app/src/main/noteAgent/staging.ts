// Staging des Notiz-Agenten (Phase 2): alle Datei-Outputs landen zuerst in
// <vault>/.mindgraph/agent-staging/<runId>/ — der Loop schreibt NIE direkt ins
// Vault. Übernahme/Verwerfen laufen über die Run-Registry (opake Handles) und
// prüfen hier per realpath die Zugehörigkeit zum Run-Staging (F02).
// Der Ordner ist vom Sync ausgeschlossen (sync/fileTracker.ts) und für den
// Vault-Watcher unsichtbar (Dot-Verzeichnis).

import { promises as fs } from 'fs'
import * as path from 'path'
import type { AgentRun } from './runRegistry'

const STAGING_DIRNAME = 'agent-staging'
const MAX_STAGING_AGE_DAYS = 7

// Erlaubte Output-Endungen — deckungsgleich mit den Write-Skills.
const ALLOWED_OUTPUT_EXT = new Set(['.md', '.xlsx', '.docx', '.txt', '.csv'])

export function stagingRootFor(vaultPath: string): string {
  return path.join(vaultPath, '.mindgraph', STAGING_DIRNAME)
}

export function stagingDirFor(run: AgentRun): string {
  return path.join(stagingRootFor(run.vaultPath), run.runId)
}

// Dateinamen vom LLM sind untrusted: nur Basename, keine Steuerzeichen, Endung
// aus der Allowlist (sonst wird die Default-Endung angehängt).
export function sanitizeOutputFileName(raw: string, defaultExt: string): string {
  const base = path.basename(String(raw || '').trim())
    .replace(/[\x00-\x1F\x7F]/g, '')
    .replace(/[\\/:*?"<>|]/g, '-')
    .trim()
  const fallback = `Ergebnis${defaultExt}`
  if (!base || base === '.' || base === '..') return fallback
  const ext = path.extname(base).toLowerCase()
  if (!ALLOWED_OUTPUT_EXT.has(ext)) return `${base}${defaultExt}`
  return base
}

export async function writeStagingFile(run: AgentRun, fileName: string, data: Buffer | string): Promise<string> {
  const dir = stagingDirFor(run)
  await fs.mkdir(dir, { recursive: true })
  const target = path.join(dir, fileName)
  // temp schreiben + umbenennen: ein abgebrochener Lauf hinterlässt keine halben Dateien.
  const tmp = `${target}.tmp`
  await fs.writeFile(tmp, data)
  await fs.rename(tmp, target)
  return target
}

// F02: beweist per realpath, dass der Pfad in exakt DIESEM Run-Staging liegt.
export async function assertInsideRunStaging(run: AgentRun, absPath: string): Promise<string> {
  const real = await fs.realpath(absPath)
  const stagingReal = await fs.realpath(stagingDirFor(run))
  if (real !== stagingReal && !real.startsWith(stagingReal + path.sep)) {
    throw new Error('Pfad liegt außerhalb des Run-Stagings')
  }
  return real
}

// Kollisionsfreier Zielname im Zielordner: "Name (2).xlsx", "Name (3).xlsx" …
// (gleiche Konvention wie Brain-Tagesnotizen).
export async function collisionFreeName(dirAbs: string, fileName: string): Promise<string> {
  const ext = path.extname(fileName)
  const stem = fileName.slice(0, fileName.length - ext.length)
  let candidate = fileName
  for (let i = 2; i < 100; i++) {
    try {
      await fs.access(path.join(dirAbs, candidate))
      candidate = `${stem} (${i})${ext}`
    } catch {
      return candidate
    }
  }
  throw new Error(`Kein freier Dateiname für ${fileName} gefunden`)
}

// Beim App-/Feature-Start: Runs älter als 7 Tage abräumen.
export async function cleanupOldStaging(vaultPath: string): Promise<void> {
  const root = stagingRootFor(vaultPath)
  let entries
  try {
    entries = await fs.readdir(root, { withFileTypes: true })
  } catch {
    return
  }
  const cutoff = Date.now() - MAX_STAGING_AGE_DAYS * 24 * 60 * 60 * 1000
  for (const e of entries) {
    if (!e.isDirectory()) continue
    const dir = path.join(root, e.name)
    try {
      const st = await fs.stat(dir)
      if (st.mtimeMs < cutoff) await fs.rm(dir, { recursive: true, force: true })
    } catch {
      /* Aufräumen ist best effort */
    }
  }
}
