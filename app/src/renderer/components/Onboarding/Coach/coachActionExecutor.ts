// Coach-Action-Executor: führt eine vom User akzeptierte CoachAction tatsächlich
// im Renderer aus. Mapped die acht Action-Types auf bestehende electronAPI-
// Aufrufe und uiStore-Setter.
//
// Wichtig: hier passiert die echte Mutation (Modul aktivieren, Notiz schreiben).
// Sicherheits-Gating gegen Path-Traversal erledigt der Main-Prozess
// (assertSafePath in main/index.ts) — hier nur "happy path".

import { useUIStore } from '../../../stores/uiStore'
import type { UserProfile, DashboardWidgetId } from '../../../stores/uiStore'
import { setModuleEnabled } from '../../../utils/modules'
import type { ModuleDescriptor } from '../../../stores/uiStore'
import type { CoachAction } from '../../../stores/coachStore'

type EditorMode = 'edit' | 'live-preview' | 'preview'

export interface VaultContext {
  vaultPath: string | null
  /** Wird gesetzt nach choose-vault, aktualisiert Onboarding-Container-State. */
  onVaultChosen: (path: string) => void
}

export interface ExecuteResult {
  ok: boolean
  error?: string
}

async function executeChooseVault(
  action: CoachAction,
  ctx: VaultContext,
  language: 'de' | 'en'
): Promise<ExecuteResult> {
  const mode = action.payload.mode
  try {
    if (mode === 'existing') {
      const path = await window.electronAPI.openVault()
      if (!path) return { ok: false, error: language === 'de' ? 'Vault-Auswahl abgebrochen' : 'Vault selection cancelled' }
      await window.electronAPI.setLastVault(path)
      ctx.onVaultChosen(path)
      return { ok: true }
    }
    if (mode === 'starter') {
      const target = await window.electronAPI.selectVaultDirectory()
      if (!target) return { ok: false, error: language === 'de' ? 'Kein Zielordner gewählt' : 'No target folder chosen' }
      const isEmpty = await window.electronAPI.checkDirectoryEmpty(target)
      if (!isEmpty) {
        const ok = window.confirm(language === 'de'
          ? 'Der Ordner ist nicht leer. Trotzdem als Starter-Vault verwenden?'
          : 'The folder is not empty. Use it as starter vault anyway?')
        if (!ok) return { ok: false, error: language === 'de' ? 'Vom Nutzer abgebrochen' : 'Cancelled by user' }
      }
      await window.electronAPI.createStarterVault(target, language)
      await window.electronAPI.setLastVault(target)
      ctx.onVaultChosen(target)
      return { ok: true }
    }
    return { ok: false, error: `Unknown choose-vault mode: ${String(mode)}` }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

function executeSetEditorMode(action: CoachAction): ExecuteResult {
  const mode = action.payload.mode as EditorMode
  try {
    useUIStore.getState().setEditorDefaultView(mode)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

function executeEnableModule(action: CoachAction): ExecuteResult {
  const id = action.payload.id as ModuleDescriptor['id']
  try {
    setModuleEnabled(id, true)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

function executeSetWidgets(action: CoachAction): ExecuteResult {
  const widgets = action.payload.widgets as DashboardWidgetId[]
  try {
    useUIStore.getState().setDashboard({ widgets })
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

function executeSuggestProfile(action: CoachAction): ExecuteResult {
  const profile = action.payload.profile as Exclude<UserProfile, null>
  try {
    // Wir setzen nur den Vorschlag — applyProfileDefaults läuft am Ende
    // von Onboarding.completeOnboarding wie bisher.
    useUIStore.getState().setCoachCompleted(useUIStore.getState().coach.completed, {
      suggestedProfile: profile
    })
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

function joinVaultPath(vault: string, rel: string): string {
  const sep = vault.includes('\\') && !vault.includes('/') ? '\\' : '/'
  const v = vault.endsWith(sep) ? vault.slice(0, -1) : vault
  const r = rel.startsWith(sep) ? rel.slice(1) : rel
  return `${v}${sep}${r}`
}

async function executeCreateFolder(action: CoachAction, ctx: VaultContext): Promise<ExecuteResult> {
  if (!ctx.vaultPath) return { ok: false, error: 'No vault active' }
  const rel = String(action.payload.relPath || '')
  try {
    await window.electronAPI.createDirectory(joinVaultPath(ctx.vaultPath, rel))
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

async function executeCreateNote(action: CoachAction, ctx: VaultContext): Promise<ExecuteResult> {
  if (!ctx.vaultPath) return { ok: false, error: 'No vault active' }
  const rel = String(action.payload.relPath || '')
  const title = String(action.payload.title || 'Notiz')
  const body = String(action.payload.body || '')
  try {
    let finalRel = rel
    if (!finalRel.endsWith('.md')) finalRel = `${finalRel}.md`
    let abs = joinVaultPath(ctx.vaultPath, finalRel)

    // Dedup: wenn Datei existiert → Suffix -coach.md
    try {
      await window.electronAPI.readFile(abs)
      // existiert — Suffix anhängen
      abs = abs.replace(/\.md$/, '-coach.md')
    } catch {
      // Datei existiert nicht — gut
    }

    // Parent-Dir sicherstellen (createDirectory ist idempotent in den meisten
    // FS-Backends; wir ignorieren Fehler)
    const lastSlash = Math.max(abs.lastIndexOf('/'), abs.lastIndexOf('\\'))
    if (lastSlash > ctx.vaultPath.length) {
      const parentDir = abs.slice(0, lastSlash)
      try { await window.electronAPI.createDirectory(parentDir) } catch { /* ok */ }
    }

    await window.electronAPI.createNote(abs)
    const content = body.trim() ? `# ${title}\n\n${body.trim()}\n` : `# ${title}\n\n`
    await window.electronAPI.writeFile(abs, content)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

function executeOpenSettings(_action: CoachAction): ExecuteResult {
  try {
    // Aktuell öffnen wir nur das Settings-Modal — kein Section-Routing im Renderer
    // bekannt (Settings.tsx managed seinen eigenen aktiven Tab). MVP-akzeptabel.
    useUIStore.getState().setOnboardingOpen(false)
    // Settings-Open-Flag setzen, falls existent — sonst überspringen
    const ui = useUIStore.getState() as unknown as { setSettingsOpen?: (open: boolean) => void }
    if (typeof ui.setSettingsOpen === 'function') {
      ui.setSettingsOpen(true)
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

function executeOpenHelp(_action: CoachAction): ExecuteResult {
  try {
    useUIStore.getState().setHelpGuideOpen(true)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function executeAction(
  action: CoachAction,
  ctx: VaultContext,
  language: 'de' | 'en'
): Promise<ExecuteResult> {
  switch (action.type) {
    case 'choose-vault':    return executeChooseVault(action, ctx, language)
    case 'set-editor-mode': return executeSetEditorMode(action)
    case 'enable-module':   return executeEnableModule(action)
    case 'set-widgets':     return executeSetWidgets(action)
    case 'suggest-profile': return executeSuggestProfile(action)
    case 'create-folder':   return executeCreateFolder(action, ctx)
    case 'create-note':     return executeCreateNote(action, ctx)
    case 'open-settings':   return executeOpenSettings(action)
    case 'open-help':       return executeOpenHelp(action)
    default:
      return { ok: false, error: `Unknown action type: ${(action as { type: string }).type}` }
  }
}
