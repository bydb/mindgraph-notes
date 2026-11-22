// „KI nur auf diesem Rechner" (`ollama.localOnly`, 11/2026, Profil Schulverwaltung) — im MAIN
// durchgesetzt, nicht im Renderer: Der Renderer könnte den Schalter umgehen, die gespeicherten
// Einstellungen liest er nicht mit.
//
// Wenn aktiv:
//   - Cloud-Anbieter (OpenRouter, LLMBase) werden abgewiesen.
//   - Ein Ollama-Modell muss `resolveLocalModel` bestehen (Cloud-Endung, `remote_model`/
//     `remote_host`, nicht installiert, kein Digest → abgewiesen). Mit `fresh: true`: Die
//     Modellliste wird bei jedem Aufruf neu geholt, damit ein gerade umgebogenes Modell nicht
//     15 s lang aus dem Cache als lokal durchgeht (wie embed.ts / vault-rag-answer).
//
// Die Einstellungen kommen über `configureLocalOnlyGuard` aus index.ts (loadUISettings) —
// index.ts ist der Einstiegspunkt und nicht importierbar. Ohne Konfiguration (Tests, sehr früher
// Start) gilt der Schalter als aus; das ist das Verhalten vor 11/2026.

import { resolveLocalModel, describeLocalModelError, type LocalModelOptions } from '../rag/localModel'

export class LocalOnlyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LocalOnlyError'
  }
}

type SettingsReader = () => Promise<Record<string, unknown>>
let readSettings: SettingsReader | null = null

export function configureLocalOnlyGuard(reader: SettingsReader | null): void {
  readSettings = reader
}

/** Pur: liest den Schalter aus gespeicherten UI-Settings. Nur ein echtes `true` zählt. */
export function isLocalOnlyInSettings(ui: Record<string, unknown> | null | undefined): boolean {
  const ollama = ui?.ollama as { localOnly?: unknown } | undefined
  return ollama?.localOnly === true
}

export async function isLocalOnlyActive(): Promise<boolean> {
  if (!readSettings) return false
  try {
    return isLocalOnlyInSettings(await readSettings())
  } catch {
    return false
  }
}

const CLOUD_BLOCKED =
  'KI nur auf diesem Rechner ist eingeschaltet: Anbieter im Netz sind gesperrt. Bitte ein lokales Modell wählen oder den Schalter unter Einstellungen → KI ausschalten.'

/** Wirft, wenn ein Cloud-Anbieter genutzt werden soll und „nur lokal" aktiv ist. */
export async function assertCloudAllowed(what = 'Cloud-Anbieter'): Promise<void> {
  if (await isLocalOnlyActive()) throw new LocalOnlyError(`${what}: ${CLOUD_BLOCKED}`)
}

/**
 * Prüft ein Ollama-Modell, wenn „nur lokal" aktiv ist; sonst nichts. Liefert den aufgelösten
 * Namen zurück (z. B. `bge-m3` → `bge-m3:latest`), damit der Aufrufer genau das geprüfte Modell nutzt.
 */
export async function assertLocalOllamaModel(model: string, opts: LocalModelOptions = {}): Promise<string> {
  if (!(await isLocalOnlyActive())) return model
  try {
    const resolved = await resolveLocalModel(model, { ...opts, fresh: true })
    return resolved.name
  } catch (err) {
    throw new LocalOnlyError(`KI nur auf diesem Rechner: ${describeLocalModelError(err)}`)
  }
}
