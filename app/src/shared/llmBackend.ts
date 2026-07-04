// Single-Source-of-Truth für die Cloud-Backend-Policy (OpenRouter).
// Prozessübergreifend genutzt: Renderer (Settings-UI, Modell-Picker) UND
// Main (Key-Handling). KEINE Renderer-/Node-Imports hier.
//
// Privacy-Modell (User-Entscheidung 2026-06-19/20):
//   - Default ist IMMER lokal (Ollama). Niemand landet ungewollt in der Cloud.
//   - OpenRouter ist ein globaler Opt-in-Schalter (`enabled`) + Key + Modell.
//   - Mail-Analyse: der Email-Picker (`email.analysisModel === OPENROUTER_MODEL_SENTINEL`)
//     ist die EINZIGE autoritative Routing-Quelle. `cloudModules` ist nur noch ein
//     „schon bestätigt"-Merker fürs ⚠️-Confirm, KEIN Routing-Gate.
//   - Notes-Chat & Inline-Edit: pro-Feature-Opt-in via `cloudFeatures` (canUseCloudForFeature).
//   - Das Brain-Modul kann NIE in die Cloud (hardcoded localhost — Privacy-Konstante).
//
// Siehe Memory: feedback-no-cloud-for-personal-data, project-openrouter-cloud-backend.

import type { ModuleId } from './modelCompatibility'

// Sentinel-Wert für „OpenRouter" als Eintrag in einem Modell-Picker (steht zwischen
// den lokalen Modellen; Auswahl = Cloud-Routing). EIN Wert für ALLE Oberflächen
// (Notes-Chat, Inline-Edit, Email-Analyse-Picker) — niemals lokal neu definieren.
export const OPENROUTER_MODEL_SENTINEL = '__openrouter__'

// Cloud-fähige Features, die KEINE Matrix-Module sind (allgemeine Textarbeit auf
// Notiz-Inhalten). Bewusst getrennt von ModuleId, damit die Benchmark-/Hard-Lock-
// Matrix sauber bleibt. Alle sind personenbezogen → in der UI mit ⚠️ + Opt-in.
export type CloudFeatureId = 'notes-chat' | 'note-edit' | 'quiz' | 'note-agent'

export const CLOUD_CAPABLE_FEATURES: CloudFeatureId[] = ['notes-chat', 'note-edit', 'quiz', 'note-agent']

// Die OpenRouter-bezogenen Settings (Teil von uiStore.ollama.openrouter).
export interface OpenRouterSettings {
  enabled: boolean                 // globaler Opt-in
  hasApiKey: boolean               // ob ein Key hinterlegt ist (der Key selbst liegt verschlüsselt im Main)
  model: string                    // Default-OpenRouter-Modell (z.B. 'qwen/qwen-2.5-7b-instruct')
  cloudModules: ModuleId[]         // „schon bestätigt"-Merker fürs Mail-⚠️-Confirm (KEIN Routing-Gate)
  cloudFeatures: CloudFeatureId[]  // pro-Feature-Opt-in für Notes-Chat/Inline-Edit
  moduleModelOverrides?: Partial<Record<ModuleId, string>> // optionales OpenRouter-Modell je Modul (Mail)
}

export const DEFAULT_OPENROUTER_SETTINGS: OpenRouterSettings = {
  enabled: false,
  hasApiKey: false,
  model: '',
  cloudModules: [],
  cloudFeatures: [],
  moduleModelOverrides: {}
}

// Basis-Verfügbarkeit: ist OpenRouter überhaupt einsatzbereit (global an, Key da,
// ein Default-Modell gewählt)? EINE Quelle für alle Cloud-Entscheidungen, damit die
// Prüfung nicht an mehreren Stellen divergiert (Mail-Routing UND Feature-Gates).
export function isOpenRouterReady(settings: OpenRouterSettings | undefined): boolean {
  return !!settings?.enabled && !!settings.hasApiKey && settings.model.trim().length > 0
}

// Darf `feature` (Nicht-Matrix-Feature wie notes-chat/note-edit) gerade Cloud nutzen?
// Basis-Verfügbarkeit + das Feature explizit freigeschaltet.
export function canUseCloudForFeature(
  feature: CloudFeatureId,
  settings: OpenRouterSettings | undefined
): boolean {
  if (!isOpenRouterReady(settings)) return false
  return Array.isArray(settings!.cloudFeatures) && settings!.cloudFeatures.includes(feature)
}
