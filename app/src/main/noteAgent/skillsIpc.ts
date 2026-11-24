// Agent-Skills: IPC-Handler für die Skill-Verwaltung (Liste, Aktivierung, Anlegen,
// Starter-Skills, Katalog, Import).
//
// Am 23.11.2026 unverändert aus main/index.ts herausgelöst (Muster: main/email/ipc.ts).
// Die Handler werden erst in registerNoteSkillsIpc() angemeldet, nicht beim Import.
import { ipcMain, dialog } from 'electron'
import * as path from 'path'
import * as fs from 'fs/promises'
import { isTrustedSender } from '../plugins/transport'
import { bundledResourcesDir } from '../bundledResources'
import { skillActivityId, vaultActivityKey } from '../skillActivityId'
import { listVaultSkillsDetailed, setSkillEnabled, createSkill, SKILLS_DIRNAME, MAX_SKILL_BODY_CHARS } from './skillsLoader'
import { fetchSkillsCatalog, installCatalogSkill, importSkillFromPath } from './skillsCatalog'
import { applySkillUpdates, checkSkillUpdates, previewSkillUpdate } from './skillUpdates'

export interface NoteSkillsIpcDeps {
  assertApprovedVault: (vaultPath: string, op: string) => void
  copyDirectoryRecursive: (src: string, dest: string) => Promise<void>
  /** Sicherung einer .md-Datei unter .mindgraph/backups, bevor sie überschrieben wird. */
  backupMarkdownBeforeWrite: (filePath: string, nextContent: string) => Promise<void>
}

export function registerNoteSkillsIpc(deps: NoteSkillsIpcDeps): void {
  const { assertApprovedVault, copyDirectoryRecursive, backupMarkdownBeforeWrite } = deps
  const starterDir = (): string => path.join(bundledResourcesDir(), 'starter-skills')

  // ── Agent-Skills Stufe 1: Vault-Skills verwalten (docs/agent-skills-plan.md) ──
  ipcMain.handle('note-skills-list', async (event, vaultPath: string) => {
    if (!isTrustedSender(event)) return { skills: [], error: 'Nicht autorisierter Aufrufer' }
    try {
      assertApprovedVault(vaultPath, 'note-skills-list')
      // activityId: dieselbe opake Kennung, die use_skill ins Protokoll schreibt — die
      // Zeitbilanz-Einstellung schlüsselt Skill-Referenzen danach (vault-gebunden).
      // skipped/bodyLimit: was in der Liste fehlt bzw. gekürzt beim Modell ankommt, soll in den
      // Einstellungen sichtbar sein statt still zu passieren (Codex F01).
      const { skills, skipped } = await listVaultSkillsDetailed(vaultPath)
      return {
        skills: skills.map(s => ({ ...s, activityId: skillActivityId(vaultPath, s.folderName) })),
        vaultKey: vaultActivityKey(vaultPath),
        skipped,
        bodyLimit: MAX_SKILL_BODY_CHARS
      }
    } catch (error) {
      return { skills: [], error: error instanceof Error ? error.message : 'Unbekannter Fehler' }
    }
  })

  ipcMain.handle('note-skills-set-enabled', async (event, vaultPath: string, folderName: string, enabled: boolean) => {
    if (!isTrustedSender(event)) return { success: false, error: 'Nicht autorisierter Aufrufer' }
    try {
      assertApprovedVault(vaultPath, 'note-skills-set-enabled')
      await setSkillEnabled(vaultPath, path.basename(folderName), enabled)
      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unbekannter Fehler' }
    }
  })

  ipcMain.handle('note-skills-create', async (event, vaultPath: string, name: string) => {
    if (!isTrustedSender(event)) return { success: false, error: 'Nicht autorisierter Aufrufer' }
    try {
      assertApprovedVault(vaultPath, 'note-skills-create')
      const res = await createSkill(vaultPath, name)
      return { success: true, ...res }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unbekannter Fehler' }
    }
  })

  // Gebündelte Starter-Skills (resources/starter-skills/*) in den Vault kopieren —
  // vorhandene Skill-Ordner werden NIE überschrieben.
  ipcMain.handle('note-skills-install-starter', async (event, vaultPath: string) => {
    if (!isTrustedSender(event)) return { success: false, installed: [], error: 'Nicht autorisierter Aufrufer' }
    try {
      assertApprovedVault(vaultPath, 'note-skills-install-starter')
      const sourceDir = path.join(bundledResourcesDir(), 'starter-skills')
      const entries = await fs.readdir(sourceDir, { withFileTypes: true })
      const installed: string[] = []
      for (const e of entries) {
        if (!e.isDirectory()) continue
        const target = path.join(vaultPath, SKILLS_DIRNAME, e.name)
        try {
          await fs.access(target)
          continue // existiert — nicht überschreiben
        } catch {
          /* frei — kopieren */
        }
        await copyDirectoryRecursive(path.join(sourceDir, e.name), target)
        installed.push(e.name)
      }
      return { success: true, installed }
    } catch (error) {
      return { success: false, installed: [], error: error instanceof Error ? error.message : 'Unbekannter Fehler' }
    }
  })

  // ── Skill-Updater (24.11.2026): mitgelieferte Skills, für die diese App eine neuere Fassung hat ──
  // Regeln in skillUpdates.ts. Der Zustand wird bei jedem Aufruf im Main neu bestimmt.
  ipcMain.handle('note-skills-updates', async (event, vaultPath: string) => {
    if (!isTrustedSender(event)) return { updates: [], error: 'Nicht autorisierter Aufrufer' }
    try {
      assertApprovedVault(vaultPath, 'note-skills-updates')
      return { updates: await checkSkillUpdates(vaultPath, starterDir()) }
    } catch (error) {
      return { updates: [], error: error instanceof Error ? error.message : 'Unbekannter Fehler' }
    }
  })

  ipcMain.handle('note-skills-update-preview', async (event, vaultPath: string, folderName: string) => {
    if (!isTrustedSender(event)) return { success: false, error: 'Nicht autorisierter Aufrufer' }
    try {
      assertApprovedVault(vaultPath, 'note-skills-update-preview')
      const preview = await previewSkillUpdate(vaultPath, starterDir(), String(folderName))
      return preview ? { success: true, preview } : { success: false, error: 'Kein mitgelieferter Skill oder nicht lesbar' }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unbekannter Fehler' }
    }
  })

  ipcMain.handle('note-skills-update-apply', async (event, vaultPath: string, folderNames: string[], confirmedModified: string[]) => {
    const empty = { updated: [], needsConfirm: [], failed: [] }
    if (!isTrustedSender(event)) return { success: false, ...empty, error: 'Nicht autorisierter Aufrufer' }
    try {
      assertApprovedVault(vaultPath, 'note-skills-update-apply')
      const names = Array.isArray(folderNames) ? folderNames.filter((n): n is string => typeof n === 'string') : []
      const confirmed = Array.isArray(confirmedModified) ? confirmedModified.filter((n): n is string => typeof n === 'string') : []
      const res = await applySkillUpdates(vaultPath, starterDir(), names, confirmed, { backup: backupMarkdownBeforeWrite })
      return { success: true, ...res }
    } catch (error) {
      return { success: false, ...empty, error: error instanceof Error ? error.message : 'Unbekannter Fehler' }
    }
  })

  // ── Agent-Skills Stufe 2: kuratierter Katalog + Import (docs/agent-skills-plan.md) ──
  ipcMain.handle('note-skills-catalog', async (event) => {
    if (!isTrustedSender(event)) return { skills: [], error: 'Nicht autorisierter Aufrufer' }
    try {
      return { skills: await fetchSkillsCatalog() }
    } catch (error) {
      return { skills: [], error: error instanceof Error ? error.message : 'Unbekannter Fehler' }
    }
  })

  ipcMain.handle('note-skills-catalog-install', async (event, vaultPath: string, id: string) => {
    if (!isTrustedSender(event)) return { success: false, error: 'Nicht autorisierter Aufrufer' }
    try {
      assertApprovedVault(vaultPath, 'note-skills-catalog-install')
      const res = await installCatalogSkill(vaultPath, id)
      return { success: true, ...res }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unbekannter Fehler' }
    }
  })

  // Import vom Rechner: SKILL.md-Datei oder Skill-Ordner — die Dialog-Auswahl ist die Freigabe.
  ipcMain.handle('note-skills-import-dialog', async (event, vaultPath: string) => {
    if (!isTrustedSender(event)) return { success: false, error: 'Nicht autorisierter Aufrufer' }
    try {
      assertApprovedVault(vaultPath, 'note-skills-import-dialog')
      const result = await dialog.showOpenDialog({
        title: 'Skill importieren (SKILL.md oder Skill-Ordner)',
        properties: ['openFile', 'openDirectory']
      })
      if (result.canceled || result.filePaths.length === 0) return { success: false, cancelled: true }
      const res = await importSkillFromPath(vaultPath, result.filePaths[0])
      return { success: true, ...res }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unbekannter Fehler' }
    }
  })
}
