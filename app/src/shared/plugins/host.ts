// Capability-Host — generalisiert RunnerServices (main/workflows/runner.ts) auf alle Plugins.
//
// Kernidee: Ein Plugin bekommt statisch UND zur Laufzeit GENAU die Dienste, die sein
// Manifest in `capabilities` deklariert — nicht mehr. Fehlt 'vault.write', existiert
// `host.vault.write` für dieses Plugin nicht (Compile-Fehler). Jeder Dienst führt durch
// dieselben abgesicherten Kern-Grenzen. Siehe docs/plugin-system-plan.md, Entscheidungen #3, #15.
//
// WICHTIG: Die Generics sind Compile-Time-Assist, NICHT die Sicherheitsgrenze. Die echte
// Grenze ist der Laufzeit-Capability-Check in der Registry (#3).

import type { ModuleId as CompatModuleId } from '../modelCompatibility'
import type { PluginCapability } from './manifest'

// — Dienst-Interfaces, je ein Tor durch eine Kern-Grenze —

/** Vault lesen (relativer Pfad im aktiven Vault). */
export interface VaultReadService {
  read(relPath: string): Promise<string>
}

/** Vault schreiben — delegiert an writeFileSafe (assertSafePath + Backup + Auto-Heal). */
export interface VaultWriteService {
  write(relPath: string, content: string): Promise<void>
}

/** Secrets — pro Plugin-ID genamespacet, verschlüsselt via electron.safeStorage. */
export interface SecretsService {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
  delete(key: string): Promise<void>
}

/** LLM-Generierung — durchläuft isHardLocked + isCloudModel-Gate des Kerns. */
export interface LlmService {
  generate(
    prompt: string,
    opts?: { module?: CompatModuleId; allowCloud?: boolean }
  ): Promise<string>
}

/** HTTP — nur gegen Hosts aus manifest.http.allowedHosts; sonst wirft fetch. */
export interface HttpService {
  fetch(url: string, init?: RequestInit): Promise<Response>
}

/** Workflow-Anbindung — Plugin emittiert Daten an seine deklarierten Workflow-Actions. */
export interface WorkflowActionService {
  emit(actionId: string, payload: unknown): Promise<void>
}

/**
 * Abbildung Capability → freigeschalteter Host-Oberfläche. Jeder Eintrag ist ein
 * Objekt mit dem Namespace-Schlüssel, sodass die Intersection (siehe unten) bei
 * mehreren Capabilities sauber zu einem Host-Objekt verschmilzt — und bei gleichem
 * Schlüssel (vault.read + vault.write) die Werte intersектет.
 */
export interface CapabilityServiceMap {
  'vault.read': { vault: VaultReadService }
  'vault.write': { vault: VaultWriteService }
  secrets: { secrets: SecretsService }
  'llm.generate': { llm: LlmService }
  'http.fetch': { http: HttpService }
  'workflow.action': { workflow: WorkflowActionService }
}

/** Union → Intersection. `{vault:R} | {vault:W}` ⇒ `{vault: R & W}`. */
type UnionToIntersection<U> = (U extends unknown ? (k: U) => void : never) extends (
  k: infer I
) => void
  ? I
  : never

/** Die konkreten Host-Dienste für ein Capability-Tupel C. */
export type CapabilityServicesFor<C extends readonly PluginCapability[]> =
  UnionToIntersection<CapabilityServiceMap[C[number]]>

/** Der vollständige Host, den ein Plugin mit Capabilities C sieht. */
export type PluginHostFor<C extends readonly PluginCapability[]> =
  CapabilityServicesFor<C> & {
    log: (msg: string) => void
  }

/** Maximaler Host (alle Capabilities) — für untypisierte Registry-internen Code. */
export type AnyPluginHost = PluginHostFor<PluginCapability[]>
