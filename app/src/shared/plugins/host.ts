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

/** Vault lesen (relativer Pfad im aktiven Vault). Text + Binär + Existenzprüfung. */
export interface VaultReadService {
  read(relPath: string): Promise<string>
  /** Binär lesen — z.B. PDF-Bytes für die reMarkable-Vertikale. */
  readBytes(relPath: string): Promise<Uint8Array>
  exists(relPath: string): Promise<boolean>
}

/** Vault schreiben — Text via writeFileSafe (Backup + Auto-Heal), Binär als reiner Write. */
export interface VaultWriteService {
  write(relPath: string, content: string): Promise<void>
  /** Binär schreiben (legt Elternordner an) — markdown-Auto-Heal/Backup entfällt. */
  writeBytes(relPath: string, bytes: Uint8Array): Promise<void>
}

/** Ein per USB erkanntes Gerät (macOS via ioreg; sonst leere Liste). */
export interface UsbDeviceInfo {
  vendorName?: string
  productName?: string
  vendorId?: number
  productId?: number
}

/**
 * Geräte-HTTP über electron.net, gegated auf manifest.http.allowedHosts (z.B. das
 * reMarkable-USB-Webinterface 10.11.99.1). Liefert Text/Bytes; die Protokoll-/Retry-
 * Logik bleibt im Plugin. listUsbDevices ist ein lokaler Diagnose-Read.
 */
export interface DeviceUsbService {
  request(url: string, timeoutMs: number): Promise<{ statusCode: number; text: string }>
  download(
    url: string,
    timeoutMs: number
  ): Promise<{ ok: boolean; statusCode?: number; bytes?: Uint8Array }>
  upload(
    url: string,
    fileName: string,
    content: Uint8Array,
    timeoutMs: number
  ): Promise<{ statusCode: number; body: string }>
  listUsbDevices(): Promise<UsbDeviceInfo[]>
}

/** HTML → PDF-Bytes über ein verstecktes BrowserWindow + printToPDF (preferCSSPageSize). */
export interface PdfRenderService {
  htmlToPdf(fullHtml: string): Promise<Uint8Array>
}

/** PDF verkleinern über Ghostscript → qpdf-Fallback; gibt die kleinere Variante zurück. */
export interface PdfOptimizeService {
  optimize(
    bytes: Uint8Array
  ): Promise<{ bytes: Uint8Array; method: 'ghostscript' | 'qpdf' | 'unchanged' }>
}

/** Datei-Filter für die OS-Dialoge (z.B. nur `.docx`). */
export interface DialogFileFilter {
  name: string
  extensions: string[]
}

/**
 * OS-Datei-Dialoge — das schmale Tor zu User-gewählten Dateien. Das Plugin bekommt NUR
 * Bytes der Datei, die der User aktiv im Open-Dialog wählt, und schreibt NUR an den im
 * Save-Dialog gewählten Pfad. Kein generisches Lesen/Schreiben beliebiger Pfade.
 */
export interface DialogService {
  openFile(opts: { title?: string; filters?: DialogFileFilter[] }): Promise<{ path: string; bytes: Uint8Array } | null>
  saveFile(
    opts: { title?: string; defaultPath?: string; filters?: DialogFileFilter[] },
    bytes: Uint8Array
  ): Promise<{ path: string } | null>
}

/** Gebündelte App-Ressourcen (read-only, auf das `resources/`-Verzeichnis beschränkt) —
 *  z.B. die DOCX-Vorlagen der edoobox-Vertikale. */
export interface ResourceService {
  read(name: string): Promise<Uint8Array>
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
  'device.usb': { device: DeviceUsbService }
  // pdf.render + pdf.optimize verschmelzen über den gemeinsamen `pdf`-Schlüssel zu
  // einem host.pdf mit beiden Methoden (analog vault.read + vault.write).
  'pdf.render': { pdf: PdfRenderService }
  'pdf.optimize': { pdf: PdfOptimizeService }
  dialog: { dialog: DialogService }
  resource: { resource: ResourceService }
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
