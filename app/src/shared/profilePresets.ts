// Voreinstellungen der Erststart-Profile (Onboarding → „Wofür nutzen Sie MindGraph?").
//
// Vorher standen die Werte als `switch` direkt in `uiStore.applyProfileDefaults`. Hier liegen sie
// als reine Daten mit DENSELBEN Schlüsseln wie die uiStore-Felder — damit eine spätere zentrale
// Vorgabedatei der IT (`policy.json`, Ebene `defaults`) dieselben Schlüssel nutzen kann, ohne ein
// zweites Profilsystem. Verschachtelte Objekte (`email`, `ollama.openrouter`, `pluginConfig.<id>`)
// werden beim Anwenden mit dem aktuellen Zustand VERSCHMOLZEN, nicht ersetzt.
//
// KEINE Renderer-/Node-Importe (pur, getestet).

export type ProfileId =
  | 'office'
  | 'school-admin'
  | 'student'
  | 'researcher'
  | 'professional'
  | 'writer'
  | 'developer'
  | 'viewer'

export type PresetValue = string | number | boolean | null | PresetObject
export interface PresetObject { [key: string]: PresetValue }

/** Plugin-Vertikalen, die das Medienzentrum betreffen. */
const MZ_PLUGINS_OFF: PresetObject = {
  antares: { enabled: false },
  edoobox: { enabled: false },
  marketing: { enabled: false },
  remarkable: { enabled: false },
}

export const PROFILE_PRESETS: Record<ProfileId, PresetObject> = {
  office: {
    flashcardsEnabled: false,
    pdfCompanionEnabled: false,
    smartConnectionsEnabled: false,
    notesChatEnabled: true,
    editorDefaultView: 'preview',
    showFormattingToolbar: true,
    showRawEditor: false,
    email: { enabled: true },
    dashboard: { enabled: true },
  },
  // Schulverwaltung (11/2026): Sekretariats-PC, meist ohne eigene IT und ohne GPU. Alle
  // Verbindungen nach außen, die nicht zum Kern (Notizen + Mail) gehören, starten AUS; die KI
  // bleibt auf diesem Rechner (`ollama.localOnly`, im Main durchgesetzt). Alles ist vom Nutzer
  // wieder einschaltbar — eine harte Sperre ist erst Sache einer späteren policy.json.
  // Bewusst NICHT angefasst: `updateCheckOnStart` (ohne eigene IT sind Updates der Sicherheitsweg).
  'school-admin': {
    flashcardsEnabled: false,
    pdfCompanionEnabled: false,
    semanticScholarEnabled: false,
    zoteroEnabled: false,
    smartConnectionsEnabled: false,
    workflowCanvasEnabled: false,
    webResearchEnabled: false,
    imageGenerationEnabled: false,
    agentShellEnabled: false,
    notesChatEnabled: true,
    editorDefaultView: 'preview',
    showFormattingToolbar: true,
    showRawEditor: false,
    email: { enabled: true },
    dashboard: { enabled: true },
    languageTool: { enabled: false },
    readwise: { enabled: false },
    telegramBot: { enabled: false },
    speech: { ttsEngine: 'system' },
    ollama: {
      localOnly: true,
      defaultCloudProvider: null,
      openrouter: { enabled: false },
      llmbase: { enabled: false },
    },
    pluginConfig: MZ_PLUGINS_OFF,
  },
  student: {
    flashcardsEnabled: true,
    pdfCompanionEnabled: true,
    smartConnectionsEnabled: false,
    notesChatEnabled: true,
    visionOcr: { enabled: true },
    editorDefaultView: 'preview',
    showFormattingToolbar: true,
    showRawEditor: false,
  },
  researcher: {
    flashcardsEnabled: true,
    pdfCompanionEnabled: true,
    semanticScholarEnabled: true,
    zoteroEnabled: true,
    smartConnectionsEnabled: false,
    notesChatEnabled: true,
    visionOcr: { enabled: true },
    editorDefaultView: 'preview',
  },
  professional: {
    flashcardsEnabled: false,
    pdfCompanionEnabled: false,
    smartConnectionsEnabled: false,
    notesChatEnabled: true,
    editorDefaultView: 'preview',
  },
  writer: {
    flashcardsEnabled: false,
    smartConnectionsEnabled: false,
    notesChatEnabled: true,
    showFormattingToolbar: true,
    editorShowWordCount: true,
    editorDefaultView: 'preview',
  },
  developer: {
    flashcardsEnabled: false,
    smartConnectionsEnabled: true,
    notesChatEnabled: true,
    showRawEditor: false,
    editorDefaultView: 'preview',
  },
  // Reiner Read-Only-Modus: alles Schwere aus, nur Preview + Sidebar + Graph
  viewer: {
    smartConnectionsEnabled: false,
    notesChatEnabled: false,
    flashcardsEnabled: false,
    semanticScholarEnabled: false,
    zoteroEnabled: false,
    pdfCompanionEnabled: false,
    languageTool: { enabled: false },
    email: { enabled: false },
    pluginConfig: MZ_PLUGINS_OFF,
    readwise: { enabled: false },
    docling: { enabled: false },
    visionOcr: { enabled: false },
    dashboard: { enabled: false },
    transport: { enabled: false, showTitlebarButton: false },
    editorDefaultView: 'preview',
    showFormattingToolbar: false,
    showRawEditor: false,
  },
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function mergeDeep(current: unknown, preset: PresetValue): unknown {
  if (!isPlainObject(preset)) return preset
  const base = isPlainObject(current) ? current : {}
  const out: Record<string, unknown> = { ...base }
  for (const [k, v] of Object.entries(preset)) out[k] = mergeDeep(base[k], v)
  return out
}

/**
 * Baut aus dem aktuellen Zustand und einem Profil den Patch für `set()`: nur die Schlüssel des
 * Profils, verschachtelte Objekte mit dem aktuellen Stand verschmolzen. Pur.
 */
export function buildProfilePatch(
  state: Record<string, unknown>,
  profile: ProfileId
): Record<string, unknown> {
  const preset = PROFILE_PRESETS[profile]
  const patch: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(preset)) patch[k] = mergeDeep(state[k], v)
  return patch
}

/**
 * Fähigkeitskarten im KI-Schritt des Onboardings. Das Profil Schulverwaltung (erkennbar an
 * „KI nur auf diesem Rechner") schaltet Lernkarten aus — dort wirbt der Schritt stattdessen mit
 * der Mail-Hilfe, statt etwas zu versprechen, das das Profil gerade abgeschaltet hat.
 */
export function onboardingAiCapabilities(localOnly: boolean): Array<'quiz' | 'mail' | 'chat' | 'tools'> {
  return localOnly ? ['mail', 'chat', 'tools'] : ['quiz', 'chat', 'tools']
}
