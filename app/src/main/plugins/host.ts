// Capability-Host — die PER-PLUGIN-Policy über den rohen App-Diensten.
//
// Generalisiert RunnerServices (main/workflows/runner.ts): ein Plugin bekommt GENAU die
// Dienste, die sein Manifest deklariert — nichts sonst. host.ts kennt selbst kein fs/net/
// electron; die rohen Primitiven kommen per DI (HostServices, in index.ts an writeFileSafe/
// safeStorage/Ollama/fetch gebunden). Hier liegt nur die Policy: Capability-Gating, Secret-
// Namespacing pro pluginId, allowedHosts-Allowlist. Siehe docs/plugin-system-plan.md #3, #15.
//
// WICHTIG: Das ist die LAUFZEIT-Grenze (anders als die reinen Typ-Generics in shared/host.ts).
// Fehlt eine Capability im Manifest, existiert der Dienst hier gar nicht — nicht nur im Typ.

import type { ModuleId as CompatModuleId } from '../../shared/modelCompatibility'
import type { PluginManifest } from '../../shared/plugins/manifest'
import type { AnyPluginHost } from '../../shared/plugins/host'
import type { HostFactory } from './registry'

/**
 * Rohe, app-gebundene Primitiven. In index.ts an den abgesicherten Schreibpfad
 * (writeFileSafe/assertSafePath), safeStorage, das Ollama-/Cloud-Gate und fetch gebunden.
 * KEINE Plugin-spezifische Policy hier — die fügt createHostFactory hinzu.
 */
export interface HostServices {
  readVaultFile: (relPath: string) => Promise<string>
  writeVaultFile: (relPath: string, content: string) => Promise<void>
  secretGet: (namespacedKey: string) => Promise<string | null>
  secretSet: (namespacedKey: string, value: string) => Promise<void>
  secretDelete: (namespacedKey: string) => Promise<void>
  /** Modell-Auflösung + isHardLocked + isCloudModel-Gate stecken in dieser Primitive. */
  llmGenerate: (prompt: string, opts: { module?: CompatModuleId; allowCloud?: boolean }) => Promise<string>
  /** Roher fetch — die allowedHosts-Allowlist erzwingt der Host, nicht diese Primitive. */
  httpFetch: (url: string, init?: RequestInit) => Promise<Response>
  emitWorkflow: (pluginId: string, actionId: string, payload: unknown) => Promise<void>
}

/** Prüft einen Hostnamen gegen die Allowlist; `*.example.com` matcht Sub-Domains + die Wurzel. */
export function isHostAllowed(allowedHosts: string[], hostname: string): boolean {
  return allowedHosts.some((entry) => {
    if (entry === hostname) return true
    if (entry.startsWith('*.')) {
      const base = entry.slice(2)
      return hostname === base || hostname.endsWith('.' + base)
    }
    return false
  })
}

/**
 * Baut aus den DI-Primitiven eine HostFactory. Pro Plugin entsteht ein Host, der NUR die
 * im Manifest deklarierten Capabilities trägt. vault.read + vault.write teilen den `vault`-
 * Schlüssel; secrets werden pro pluginId genamespacet; http prüft die allowedHosts.
 */
export function createHostFactory(services: HostServices): HostFactory {
  return (manifest: PluginManifest): AnyPluginHost => {
    const caps = new Set(manifest.capabilities)
    const id = manifest.id

    const host: Record<string, unknown> = {
      log: (msg: string) => console.log(`[plugin:${id}] ${msg}`),
    }

    if (caps.has('vault.read') || caps.has('vault.write')) {
      const vault: Record<string, unknown> = {}
      if (caps.has('vault.read')) {
        vault.read = (relPath: string) => services.readVaultFile(relPath)
      }
      if (caps.has('vault.write')) {
        vault.write = (relPath: string, content: string) => services.writeVaultFile(relPath, content)
      }
      host.vault = vault
    }

    if (caps.has('secrets')) {
      const ns = (key: string) => `plugin:${id}:${key}`
      host.secrets = {
        get: (key: string) => services.secretGet(ns(key)),
        set: (key: string, value: string) => services.secretSet(ns(key), value),
        delete: (key: string) => services.secretDelete(ns(key)),
      }
    }

    if (caps.has('llm.generate')) {
      host.llm = {
        generate: (prompt: string, opts?: { module?: CompatModuleId; allowCloud?: boolean }) =>
          services.llmGenerate(prompt, opts ?? {}),
      }
    }

    if (caps.has('http.fetch')) {
      const allowedHosts = manifest.http?.allowedHosts ?? []
      host.http = {
        fetch: (url: string, init?: RequestInit) => {
          let hostname: string
          try {
            hostname = new URL(url).hostname
          } catch {
            return Promise.reject(new Error(`Plugin '${id}': ungültige URL '${url}'`))
          }
          if (allowedHosts.length === 0) {
            return Promise.reject(new Error(`Plugin '${id}': http.fetch gesperrt (keine allowedHosts deklariert)`))
          }
          if (!isHostAllowed(allowedHosts, hostname)) {
            return Promise.reject(new Error(`Plugin '${id}': Host '${hostname}' nicht in allowedHosts`))
          }
          return services.httpFetch(url, init)
        },
      }
    }

    if (caps.has('workflow.action')) {
      host.workflow = {
        emit: (actionId: string, payload: unknown) => services.emitWorkflow(id, actionId, payload),
      }
    }

    return host as unknown as AnyPluginHost
  }
}
