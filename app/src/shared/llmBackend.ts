// Single-Source-of-Truth für die Cloud-Backend-Policy (OpenRouter + LLMBase).
// Prozessübergreifend genutzt: Renderer (Settings-UI, Modell-Picker) UND
// Main (Key-Handling). KEINE Renderer-/Node-Imports hier.
//
// Privacy-Modell (User-Entscheidung 2026-06-19/20):
//   - Default ist IMMER lokal (Ollama). Niemand landet ungewollt in der Cloud.
//   - Jeder Cloud-Provider ist ein globaler Opt-in-Schalter (`enabled`) + Key + Modell.
//   - Mail-Analyse: der Email-Picker (`email.analysisModel === <Provider-Sentinel>`)
//     ist die EINZIGE autoritative Routing-Quelle. `cloudModules` ist nur noch ein
//     „schon bestätigt"-Merker fürs ⚠️-Confirm, KEIN Routing-Gate.
//   - Notes-Chat & Inline-Edit: pro-Feature-Opt-in via `cloudFeatures` (canUseCloudForFeature).
//   - Das Brain-Modul kann NIE in die Cloud (hardcoded localhost — Privacy-Konstante).
//
// Provider (2026-07-07): OpenRouter (US, größte Modellauswahl) und LLMBase
// (llmbase.ai, Eyloo GmbH — EU-Inference in DE/NL/FI/CH, DSGVO-Positionierung,
// Zero-Retention laut Anbieter). Beide OpenAI-kompatibel; identische Settings-Form.
//
// Siehe Memory: feedback-no-cloud-for-personal-data, project-openrouter-cloud-backend.

import type { ModuleId } from './modelCompatibility'

// Sentinel-Werte für Cloud-Provider als Eintrag in einem Modell-Picker (stehen zwischen
// den lokalen Modellen; Auswahl = Cloud-Routing). EIN Wert pro Provider für ALLE
// Oberflächen (Notes-Chat, Inline-Edit, Email-Analyse-Picker) — niemals lokal neu definieren.
export const OPENROUTER_MODEL_SENTINEL = '__openrouter__'
export const LLMBASE_MODEL_SENTINEL = '__llmbase__'

// Die zwei OpenAI-kompatiblen Cloud-Provider. Gemeinsame Settings-Form
// (CloudProviderSettings), getrennte Keys/Opt-ins.
export type CloudProviderId = 'openrouter' | 'llmbase'

export const CLOUD_PROVIDER_META: Record<CloudProviderId, {
  label: string
  sentinel: string
  keysUrl: string          // wo der User seinen API-Key bekommt
  privacyNote: { de: string; en: string }
}> = {
  openrouter: {
    label: 'OpenRouter',
    sentinel: OPENROUTER_MODEL_SENTINEL,
    keysUrl: 'https://openrouter.ai/keys',
    privacyNote: {
      de: 'US-Anbieter — Inhalte verlassen die EU.',
      en: 'US provider — content leaves the EU.'
    }
  },
  llmbase: {
    label: 'LLMBase',
    sentinel: LLMBASE_MODEL_SENTINEL,
    keysUrl: 'https://llmbase.ai',
    privacyNote: {
      de: 'EU-Inference (DE/NL/FI/CH), DSGVO-Positionierung mit AVV — Inhalte verlassen trotzdem deinen Rechner.',
      en: 'EU inference (DE/NL/FI/CH), GDPR positioning with DPA — content still leaves your computer.'
    }
  }
}

// Sentinel → Provider (null wenn kein Cloud-Sentinel). Für Picker-Routing.
export function cloudProviderForSentinel(value: string | null | undefined): CloudProviderId | null {
  if (value === OPENROUTER_MODEL_SENTINEL) return 'openrouter'
  if (value === LLMBASE_MODEL_SENTINEL) return 'llmbase'
  return null
}

// Cloud-fähige Features, die KEINE Matrix-Module sind (allgemeine Textarbeit auf
// Notiz-Inhalten). Bewusst getrennt von ModuleId, damit die Benchmark-/Hard-Lock-
// Matrix sauber bleibt. Alle sind personenbezogen → in der UI mit ⚠️ + Opt-in.
export type CloudFeatureId = 'notes-chat' | 'note-edit' | 'quiz' | 'note-agent'

export const CLOUD_CAPABLE_FEATURES: CloudFeatureId[] = ['notes-chat', 'note-edit', 'quiz', 'note-agent']

// Die Provider-Settings (Teil von uiStore.ollama.openrouter bzw. uiStore.ollama.llmbase).
// EINE Form für beide Provider — divergiert nicht.
export interface CloudProviderSettings {
  enabled: boolean                 // globaler Opt-in
  hasApiKey: boolean               // ob ein Key hinterlegt ist (der Key selbst liegt verschlüsselt im Main)
  model: string                    // Default-Modell des Providers (z.B. 'qwen/qwen-2.5-7b-instruct')
  cloudModules: ModuleId[]         // „schon bestätigt"-Merker fürs Mail-⚠️-Confirm (KEIN Routing-Gate)
  cloudFeatures: CloudFeatureId[]  // pro-Feature-Opt-in für Notes-Chat/Inline-Edit
  moduleModelOverrides?: Partial<Record<ModuleId, string>> // optionales Provider-Modell je Modul (Mail)
}

// Historischer Name — bestehende Importe bleiben gültig.
export type OpenRouterSettings = CloudProviderSettings

export const DEFAULT_OPENROUTER_SETTINGS: CloudProviderSettings = {
  enabled: false,
  hasApiKey: false,
  model: '',
  cloudModules: [],
  cloudFeatures: [],
  moduleModelOverrides: {}
}

export const DEFAULT_LLMBASE_SETTINGS: CloudProviderSettings = {
  enabled: false,
  hasApiKey: false,
  model: '',
  cloudModules: [],
  cloudFeatures: [],
  moduleModelOverrides: {}
}

// Basis-Verfügbarkeit: ist der Provider überhaupt einsatzbereit (global an, Key da,
// ein Default-Modell gewählt)? EINE Quelle für alle Cloud-Entscheidungen, damit die
// Prüfung nicht an mehreren Stellen divergiert (Mail-Routing UND Feature-Gates).
export function isCloudProviderReady(settings: CloudProviderSettings | undefined): boolean {
  return !!settings?.enabled && !!settings.hasApiKey && settings.model.trim().length > 0
}

// Historischer Name — identische Prüfung, gilt für beide Provider-Settings.
export const isOpenRouterReady = isCloudProviderReady

// Darf `feature` (Nicht-Matrix-Feature wie notes-chat/note-edit) gerade Cloud nutzen?
// Basis-Verfügbarkeit + das Feature explizit freigeschaltet. Pro Provider prüfen.
export function canUseCloudForFeature(
  feature: CloudFeatureId,
  settings: CloudProviderSettings | undefined
): boolean {
  if (!isCloudProviderReady(settings)) return false
  return Array.isArray(settings!.cloudFeatures) && settings!.cloudFeatures.includes(feature)
}

// Hilfsform für Renderer-Picker: alle Provider, die `feature` gerade bedienen dürfen —
// je mit Sentinel + Anzeige-Label (`OpenRouter · <modell>`), in stabiler Reihenfolge.
export interface CloudFeatureRoute {
  provider: CloudProviderId
  sentinel: string
  label: string
  model: string
}
export function cloudRoutesForFeature(
  feature: CloudFeatureId,
  providers: { openrouter?: CloudProviderSettings; llmbase?: CloudProviderSettings }
): CloudFeatureRoute[] {
  const routes: CloudFeatureRoute[] = []
  for (const id of ['openrouter', 'llmbase'] as CloudProviderId[]) {
    const settings = providers[id]
    if (!canUseCloudForFeature(feature, settings)) continue
    const meta = CLOUD_PROVIDER_META[id]
    routes.push({
      provider: id,
      sentinel: meta.sentinel,
      label: `${meta.label} · ${settings!.model.trim()}`,
      model: settings!.model.trim()
    })
  }
  return routes
}
