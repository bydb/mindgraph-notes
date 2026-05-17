// Action-Schema für den Coach. Wird im Main parsiert/validiert und im Renderer
// auf die jeweilige uiStore-/electronAPI-Operation gemappt.
//
// Wichtig: hier nur Schemas + Validatoren. Die tatsächliche Ausführung liegt im
// Renderer (coachActionExecutor.ts) — der Coach ist *Berater*, nicht Agent.

export type CoachActionType =
  | 'choose-vault'
  | 'set-editor-mode'
  | 'enable-module'
  | 'set-widgets'
  | 'suggest-profile'
  | 'create-folder'
  | 'create-note'
  | 'open-settings'
  | 'open-help'

export type CoachActionStatus = 'pending' | 'accepted' | 'declined' | 'executed' | 'failed'

export interface CoachAction {
  actionId: string
  type: CoachActionType
  title: string
  description: string
  payload: Record<string, unknown>
  status: CoachActionStatus
  error?: string
}

// Single Source of Truth — auch im Renderer importierbar.
export const COACH_MODULE_IDS = [
  'notes-chat', 'smart-connections', 'language-tool', 'email', 'mz-suite',
  'antares', 'flashcards', 'semantic-scholar', 'zotero', 'readwise',
  'remarkable', 'docling', 'vision-ocr', 'speech'
] as const

export const COACH_WIDGET_IDS = [
  'focus', 'radar', 'activity', 'tasks', 'emails', 'calendar', 'bookings',
  'antares', 'project-status', 'sync'
] as const

export const COACH_PROFILES = [
  'student', 'researcher', 'professional', 'writer', 'developer', 'viewer'
] as const

export const COACH_SETTINGS_SECTIONS = [
  'modules', 'ollama', 'email', 'agents'
] as const

// Editor-Modi entsprechen genau dem EditorViewMode-Type im uiStore
// (renderer/stores/uiStore.ts) — bei Erweiterung dort auch hier ergänzen.
export const COACH_EDITOR_MODES = ['edit', 'live-preview', 'preview'] as const

// ─── Validierung ──────────────────────────────────────────────────────────

function isString(x: unknown): x is string {
  return typeof x === 'string' && x.length > 0
}

function isStringArray(x: unknown): x is string[] {
  return Array.isArray(x) && x.every(isString)
}

function isRelPath(x: unknown): x is string {
  if (!isString(x)) return false
  // keine Pfad-Traversal, kein absoluter Pfad, keine Backslashes (Windows-Spec
  // bewusst nicht — der Coach soll plattformneutrale Slashes ausgeben)
  if (x.startsWith('/') || x.startsWith('\\') || x.includes('..') || x.startsWith('~')) return false
  return true
}

interface ValidationOk {
  ok: true
  action: CoachAction
}
interface ValidationFail {
  ok: false
  reason: string
}
type ValidationResult = ValidationOk | ValidationFail

export function validateAction(raw: unknown, vaultReady: boolean): ValidationResult {
  if (!raw || typeof raw !== 'object') return { ok: false, reason: 'not an object' }
  const r = raw as Record<string, unknown>
  if (!isString(r.actionId) || !isString(r.type) || !isString(r.title) || !isString(r.description)) {
    return { ok: false, reason: 'missing actionId/type/title/description' }
  }
  if (typeof r.payload !== 'object' || r.payload === null) {
    return { ok: false, reason: 'missing payload object' }
  }
  const type = r.type as CoachActionType
  const payload = r.payload as Record<string, unknown>

  if (!vaultReady && type !== 'choose-vault') {
    return { ok: false, reason: `action ${type} requires vault (not yet chosen)` }
  }

  switch (type) {
    case 'choose-vault':
      if (payload.mode !== 'starter' && payload.mode !== 'existing') {
        return { ok: false, reason: 'choose-vault.mode must be starter|existing' }
      }
      break
    case 'set-editor-mode':
      if (!isString(payload.mode) || !(COACH_EDITOR_MODES as readonly string[]).includes(payload.mode)) {
        return { ok: false, reason: `set-editor-mode.mode must be one of ${COACH_EDITOR_MODES.join(',')}` }
      }
      break
    case 'enable-module':
      if (!isString(payload.id) || !(COACH_MODULE_IDS as readonly string[]).includes(payload.id)) {
        return { ok: false, reason: `enable-module.id must be one of ${COACH_MODULE_IDS.join(',')}` }
      }
      break
    case 'set-widgets':
      if (!isStringArray(payload.widgets)) {
        return { ok: false, reason: 'set-widgets.widgets must be string[]' }
      }
      for (const w of payload.widgets) {
        if (!(COACH_WIDGET_IDS as readonly string[]).includes(w)) {
          return { ok: false, reason: `set-widgets.widgets contains invalid id: ${w}` }
        }
      }
      break
    case 'suggest-profile':
      if (!isString(payload.profile) || !(COACH_PROFILES as readonly string[]).includes(payload.profile)) {
        return { ok: false, reason: `suggest-profile.profile must be one of ${COACH_PROFILES.join(',')}` }
      }
      break
    case 'create-folder':
      if (!isRelPath(payload.relPath)) {
        return { ok: false, reason: 'create-folder.relPath must be a safe relative path' }
      }
      break
    case 'create-note':
      if (!isRelPath(payload.relPath)) {
        return { ok: false, reason: 'create-note.relPath must be a safe relative path' }
      }
      if (!isString(payload.title)) {
        return { ok: false, reason: 'create-note.title required' }
      }
      // body darf leer sein
      if (payload.body !== undefined && typeof payload.body !== 'string') {
        return { ok: false, reason: 'create-note.body must be string' }
      }
      break
    case 'open-settings':
      if (!isString(payload.section) || !(COACH_SETTINGS_SECTIONS as readonly string[]).includes(payload.section)) {
        return { ok: false, reason: `open-settings.section must be one of ${COACH_SETTINGS_SECTIONS.join(',')}` }
      }
      break
    case 'open-help':
      if (!isString(payload.topic)) {
        return { ok: false, reason: 'open-help.topic required' }
      }
      break
    default:
      return { ok: false, reason: `unknown action type: ${type}` }
  }

  return {
    ok: true,
    action: {
      actionId: r.actionId,
      type,
      title: r.title,
      description: r.description,
      payload,
      status: 'pending'
    }
  }
}

// Parsing-Helper: zieht ```coach-actions … ``` aus einem LLM-Output und liefert
// (text-ohne-fence, raw-array). Tolerant gegenüber Whitespace und führendem
// Sprachname ohne -.
const FENCE_RE = /```coach[-_]?actions\s*\r?\n([\s\S]*?)\r?\n```/

export function extractActionFence(output: string): { text: string; rawActions: unknown[] } {
  const match = output.match(FENCE_RE)
  if (!match) return { text: output.trim(), rawActions: [] }
  const jsonBlock = match[1].trim()
  const textWithout = output.replace(FENCE_RE, '').trim()
  try {
    const parsed = JSON.parse(jsonBlock)
    if (Array.isArray(parsed)) return { text: textWithout, rawActions: parsed }
    return { text: textWithout, rawActions: [] }
  } catch (err) {
    console.warn('[coach] action fence is not valid JSON:', err)
    return { text: textWithout, rawActions: [] }
  }
}
