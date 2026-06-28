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
import type { PluginManifest } from '@mindgraph/plugin-api'
import type { AnyPluginHost, UsbDeviceInfo } from '@mindgraph/plugin-api'
import type { HostFactory } from './registry'

/**
 * Rohe, app-gebundene Primitiven. In index.ts an den abgesicherten Schreibpfad
 * (writeFileSafe/assertSafePath), safeStorage, das Ollama-/Cloud-Gate und fetch gebunden.
 * KEINE Plugin-spezifische Policy hier — die fügt createHostFactory hinzu.
 */
export interface HostServices {
  readVaultFile: (relPath: string) => Promise<string>
  writeVaultFile: (relPath: string, content: string) => Promise<void>
  /** Binäres Vault-I/O (PDFs der reMarkable-Vertikale) — geht durch dieselben Pfad-Checks. */
  readVaultBytes: (relPath: string) => Promise<Uint8Array>
  writeVaultBytes: (relPath: string, bytes: Uint8Array) => Promise<void>
  vaultExists: (relPath: string) => Promise<boolean>
  secretGet: (namespacedKey: string) => Promise<string | null>
  secretSet: (namespacedKey: string, value: string) => Promise<void>
  secretDelete: (namespacedKey: string) => Promise<void>
  // — Geräte-/PDF-Primitiven (electron.net, BrowserWindow, Ghostscript) — der Host gated
  //   die device-URLs gegen allowedHosts; die Implementierungen liegen in nativeServices.ts.
  deviceRequest: (url: string, timeoutMs: number) => Promise<{ statusCode: number; text: string }>
  deviceDownload: (
    url: string,
    timeoutMs: number
  ) => Promise<{ ok: boolean; statusCode?: number; bytes?: Uint8Array }>
  deviceUpload: (
    url: string,
    fileName: string,
    content: Uint8Array,
    timeoutMs: number
  ) => Promise<{ statusCode: number; body: string }>
  listUsbDevices: () => Promise<UsbDeviceInfo[]>
  pdfHtmlToPdf: (fullHtml: string) => Promise<Uint8Array>
  pdfOptimize: (
    bytes: Uint8Array
  ) => Promise<{ bytes: Uint8Array; method: 'ghostscript' | 'qpdf' | 'unchanged' }>
  // — Dialog-/Ressourcen-Primitiven (electron.dialog, app-Ressourcen) — die Implementierungen
  //   liegen in nativeServices.ts. Lesen/Schreiben gilt NUR für die im Dialog gewählte Datei.
  dialogOpenFile: (opts: {
    title?: string
    filters?: { name: string; extensions: string[] }[]
  }) => Promise<{ path: string; bytes: Uint8Array } | null>
  dialogSaveFile: (
    opts: { title?: string; defaultPath?: string; filters?: { name: string; extensions: string[] }[] },
    bytes: Uint8Array
  ) => Promise<{ path: string } | null>
  /** Liest eine gebündelte App-Ressource (read-only, auf resources/ beschränkt). */
  readResource: (name: string) => Promise<Uint8Array>
  /** Modell-Auflösung + isHardLocked + isCloudModel-Gate stecken in dieser Primitive. */
  llmGenerate: (
    prompt: string,
    opts: { module?: CompatModuleId; allowCloud?: boolean; temperature?: number; maxTokens?: number }
  ) => Promise<string>
  /** Roher fetch — die allowedHosts-Allowlist erzwingt der Host, nicht diese Primitive. */
  httpFetch: (url: string, init?: RequestInit) => Promise<Response>
  /** Basic-Auth-Request mit Credentials in den Connection-Options (Apache-Auth-Quirk, WordPress). */
  httpFetchBasicAuth: (
    url: string,
    opts: {
      method: string
      headers?: Record<string, string>
      body?: string | Uint8Array
      username: string
      password: string
      timeoutMs?: number
    }
  ) => Promise<{ statusCode: number; text: string }>
  /**
   * Zusätzliche, zur LAUFZEIT erlaubte Hosts pro Plugin (über die statischen manifest.http.
   * allowedHosts hinaus). Für Plugins mit user-konfiguriertem Endpunkt (z.B. Antares: jedes
   * Medienzentrum hat einen eigenen Server) — der konfigurierte Host ist user-getrust.
   */
  resolveExtraAllowedHosts?: (pluginId: string) => Promise<string[]>
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

    // Geteilte Allowlist-Prüfung für http.fetch UND device.usb: statische manifest-Hosts
    // ∪ zur Laufzeit erlaubte (user-konfigurierter Endpunkt). Leere Liste ⇒ komplett gesperrt.
    const staticHosts = manifest.http?.allowedHosts ?? []
    const ensureHostAllowed = async (url: string): Promise<void> => {
      let hostname: string
      try {
        hostname = new URL(url).hostname
      } catch {
        throw new Error(`Plugin '${id}': ungültige URL '${url}'`)
      }
      const extra = services.resolveExtraAllowedHosts ? await services.resolveExtraAllowedHosts(id) : []
      const allowedHosts = [...staticHosts, ...extra]
      if (allowedHosts.length === 0) {
        throw new Error(`Plugin '${id}': Netzzugriff gesperrt (keine allowedHosts deklariert)`)
      }
      if (!isHostAllowed(allowedHosts, hostname)) {
        throw new Error(`Plugin '${id}': Host '${hostname}' nicht in allowedHosts`)
      }
    }

    if (caps.has('vault.read') || caps.has('vault.write')) {
      const vault: Record<string, unknown> = {}
      if (caps.has('vault.read')) {
        vault.read = (relPath: string) => services.readVaultFile(relPath)
        vault.readBytes = (relPath: string) => services.readVaultBytes(relPath)
        vault.exists = (relPath: string) => services.vaultExists(relPath)
      }
      if (caps.has('vault.write')) {
        vault.write = (relPath: string, content: string) => services.writeVaultFile(relPath, content)
        vault.writeBytes = (relPath: string, bytes: Uint8Array) => services.writeVaultBytes(relPath, bytes)
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
        generate: (
          prompt: string,
          opts?: { module?: CompatModuleId; allowCloud?: boolean; temperature?: number; maxTokens?: number }
        ) => services.llmGenerate(prompt, opts ?? {}),
      }
    }

    if (caps.has('http.fetch')) {
      host.http = {
        fetch: async (url: string, init?: RequestInit) => {
          await ensureHostAllowed(url)
          return services.httpFetch(url, init)
        },
        fetchBasicAuth: async (
          url: string,
          opts: {
            method: string
            headers?: Record<string, string>
            body?: string | Uint8Array
            username: string
            password: string
            timeoutMs?: number
          }
        ) => {
          await ensureHostAllowed(url)
          return services.httpFetchBasicAuth(url, opts)
        },
      }
    }

    if (caps.has('device.usb')) {
      host.device = {
        request: async (url: string, timeoutMs: number) => {
          await ensureHostAllowed(url)
          return services.deviceRequest(url, timeoutMs)
        },
        download: async (url: string, timeoutMs: number) => {
          await ensureHostAllowed(url)
          return services.deviceDownload(url, timeoutMs)
        },
        upload: async (url: string, fileName: string, content: Uint8Array, timeoutMs: number) => {
          await ensureHostAllowed(url)
          return services.deviceUpload(url, fileName, content, timeoutMs)
        },
        // Lokaler USB-Diagnose-Read (kein Netz) — nicht über die Host-Allowlist gegated.
        listUsbDevices: () => services.listUsbDevices(),
      }
    }

    if (caps.has('pdf.render') || caps.has('pdf.optimize')) {
      const pdf: Record<string, unknown> = {}
      if (caps.has('pdf.render')) {
        pdf.htmlToPdf = (fullHtml: string) => services.pdfHtmlToPdf(fullHtml)
      }
      if (caps.has('pdf.optimize')) {
        pdf.optimize = (bytes: Uint8Array) => services.pdfOptimize(bytes)
      }
      host.pdf = pdf
    }

    if (caps.has('dialog')) {
      host.dialog = {
        openFile: (opts: { title?: string; filters?: { name: string; extensions: string[] }[] }) =>
          services.dialogOpenFile(opts),
        saveFile: (
          opts: { title?: string; defaultPath?: string; filters?: { name: string; extensions: string[] }[] },
          bytes: Uint8Array
        ) => services.dialogSaveFile(opts, bytes),
      }
    }

    if (caps.has('resource')) {
      host.resource = {
        read: (name: string) => services.readResource(name),
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
