// Skill-Updater (Main): mitgelieferte Skills im Vault gegen die Fassung dieser App prüfen und
// auf Wunsch ersetzen. Pure Regeln und Begründung: shared/skillUpdate.ts.
//
// Grenzen, die hier erzwungen werden (der Renderer kann sie nicht umgehen):
//   - nur Skills, die die App mitliefert (Ordnername im Manifest UND im Paket)
//   - ein angepasster Skill (`modified`) wird nur ersetzt, wenn der Aufruf ihn ausdrücklich
//     als bestätigt nennt; der Zustand wird beim Anwenden NEU bestimmt, nicht geglaubt
//   - vor dem Schreiben die Sicherung (`backup`), schlägt sie fehl, wird nicht geschrieben
//   - Verknüpfungen (Symlinks) als Skill-Ordner oder SKILL.md werden nicht angefasst
//   - Zusatzdateien eines Skills (Vorlage, references/) werden nur ERGÄNZT, nie überschrieben

import { createHash } from 'crypto'
import * as fs from 'fs/promises'
import * as path from 'path'
import {
  SKILL_VERSIONS_FILE, carryKeptLine, classifySkillVersion, fingerprintText, normalizeSkillText, parseSkillVersionsManifest,
  type SkillUpdateState, type SkillVersionsManifest
} from '../../shared/skillUpdate'
import { SKILLS_DIRNAME } from './skillsLoader'

const MAX_SKILL_FILE_BYTES = 512 * 1024

export interface SkillUpdateInfo {
  folderName: string
  state: Exclude<SkillUpdateState, 'current'>
}

export interface SkillUpdatePreview {
  folderName: string
  state: SkillUpdateState
  oldText: string
  newText: string
  /** Vom Nutzer eingetragene Zeile, die in die neue Fassung übernommen wird (oder null). */
  carried: string | null
}

export interface SkillUpdateResult {
  updated: string[]
  /** Angepasste Skills, die ohne Bestätigung übersprungen wurden. */
  needsConfirm: string[]
  failed: Array<{ folderName: string; error: string }>
}

function hashOf(text: string, keepLine?: string): string {
  return createHash('sha256').update(fingerprintText(text, keepLine), 'utf8').digest('hex')
}

export async function readSkillVersionsManifest(starterDir: string): Promise<SkillVersionsManifest> {
  try {
    return parseSkillVersionsManifest(JSON.parse(await fs.readFile(path.join(starterDir, SKILL_VERSIONS_FILE), 'utf-8')))
  } catch {
    return { version: 1, skills: {} } // ohne Manifest gibt es keine Aussage — dann auch kein Update-Angebot
  }
}

/** Liest eine SKILL.md nur, wenn Ordner und Datei echte Einträge sind (keine Verknüpfung) und klein genug. */
async function readRegularSkillFile(dir: string): Promise<string | null> {
  try {
    const d = await fs.lstat(dir)
    if (!d.isDirectory() || d.isSymbolicLink()) return null
    const file = path.join(dir, 'SKILL.md')
    const f = await fs.lstat(file)
    if (!f.isFile() || f.isSymbolicLink() || f.size > MAX_SKILL_FILE_BYTES) return null
    return await fs.readFile(file, 'utf-8')
  } catch {
    return null
  }
}

interface Inspected {
  folderName: string
  state: SkillUpdateState
  oldText: string
  newText: string
  carried: string | null
  targetDir: string
  sourceDir: string
}

async function inspect(vaultPath: string, starterDir: string, manifest: SkillVersionsManifest, folderName: string): Promise<Inspected | null> {
  if (!/^[a-z0-9-]{1,60}$/.test(folderName)) return null
  const entry = manifest.skills[folderName]
  if (!entry) return null
  const sourceDir = path.join(starterDir, folderName)
  const targetDir = path.join(vaultPath, SKILLS_DIRNAME, folderName)
  const [bundled, inVault] = await Promise.all([readRegularSkillFile(sourceDir), readRegularSkillFile(targetDir)])
  if (bundled === null || inVault === null) return null
  const state = classifySkillVersion(hashOf(inVault, entry.keepLine), hashOf(bundled, entry.keepLine), entry.hashes)
  const { text, carried } = carryKeptLine(bundled, inVault, entry.keepLine)
  return { folderName, state, oldText: normalizeSkillText(inVault), newText: text, carried, targetDir, sourceDir }
}

/** Mitgelieferte Skills im Vault, für die diese App eine andere Fassung hat. */
export async function checkSkillUpdates(vaultPath: string, starterDir: string): Promise<SkillUpdateInfo[]> {
  const manifest = await readSkillVersionsManifest(starterDir)
  const out: SkillUpdateInfo[] = []
  for (const folderName of Object.keys(manifest.skills).sort()) {
    const r = await inspect(vaultPath, starterDir, manifest, folderName)
    if (r && r.state !== 'current') out.push({ folderName, state: r.state })
  }
  return out
}

export async function previewSkillUpdate(vaultPath: string, starterDir: string, folderName: string): Promise<SkillUpdatePreview | null> {
  const manifest = await readSkillVersionsManifest(starterDir)
  const r = await inspect(vaultPath, starterDir, manifest, path.basename(folderName))
  return r ? { folderName: r.folderName, state: r.state, oldText: r.oldText, newText: r.newText, carried: r.carried } : null
}

/** Dateien des Pakets, die im Vault-Ordner fehlen, ergänzen (max. 2 Ebenen, keine Verknüpfungen). */
async function addMissingFiles(sourceDir: string, targetDir: string, depth = 0): Promise<void> {
  if (depth > 2) return
  for (const e of await fs.readdir(sourceDir, { withFileTypes: true })) {
    if (e.isSymbolicLink() || e.name === 'SKILL.md') continue
    const src = path.join(sourceDir, e.name)
    const dst = path.join(targetDir, e.name)
    if (e.isDirectory()) {
      try {
        const st = await fs.lstat(dst)
        if (!st.isDirectory() || st.isSymbolicLink()) continue // dort liegt etwas anderes — nicht anfassen
      } catch {
        await fs.mkdir(dst)
      }
      await addMissingFiles(src, dst, depth + 1)
    } else if (e.isFile()) {
      try {
        await fs.lstat(dst) // vorhanden (auch als Verknüpfung): nicht überschreiben
      } catch {
        await fs.copyFile(src, dst, fs.constants.COPYFILE_EXCL)
      }
    }
  }
}

export interface ApplySkillUpdatesDeps {
  /** Sicherung der alten Fassung vor dem Schreiben; wirft, wenn sie misslingt. */
  backup: (filePath: string, nextContent: string) => Promise<void>
}

/**
 * Ersetzt die genannten Skills durch die Fassung dieser App. `confirmedModified` nennt die
 * angepassten Skills, deren Überschreiben der Nutzer nach Ansicht der Unterschiede bestätigt hat.
 */
export async function applySkillUpdates(
  vaultPath: string,
  starterDir: string,
  folderNames: string[],
  confirmedModified: string[],
  deps: ApplySkillUpdatesDeps
): Promise<SkillUpdateResult> {
  const manifest = await readSkillVersionsManifest(starterDir)
  const confirmed = new Set(confirmedModified.map(n => path.basename(n)))
  const result: SkillUpdateResult = { updated: [], needsConfirm: [], failed: [] }
  for (const raw of Array.from(new Set(folderNames.map(n => path.basename(String(n))))).slice(0, 100)) {
    try {
      const r = await inspect(vaultPath, starterDir, manifest, raw)
      if (!r) { result.failed.push({ folderName: raw, error: 'Kein mitgelieferter Skill oder nicht lesbar' }); continue }
      if (r.state === 'current') continue
      if (r.state === 'modified' && !confirmed.has(r.folderName)) { result.needsConfirm.push(r.folderName); continue }
      const file = path.join(r.targetDir, 'SKILL.md')
      await deps.backup(file, r.newText)
      await fs.writeFile(file, r.newText, 'utf-8')
      await addMissingFiles(r.sourceDir, r.targetDir)
      result.updated.push(r.folderName)
    } catch (e) {
      result.failed.push({ folderName: raw, error: e instanceof Error ? e.message : String(e) })
    }
  }
  return result
}
