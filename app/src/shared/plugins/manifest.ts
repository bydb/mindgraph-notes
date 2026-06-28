// Plugin-Manifest — REIN SERIALISIERBARE Metadaten (JSON-fähig, KEIN Code/JSX).
//
// Single-Source des Plugin-Vertrags. Das Manifest beschreibt, WAS ein Plugin ist
// und welche Capabilities es braucht — nie WIE es etwas tut (das lebt in den
// getrennten Main-/Renderer-Entries). Siehe docs/plugin-system-plan.md, Entscheidung #8.

import type { ModuleId as CompatModuleId } from '../modelCompatibility'
import type { WorkflowPrivacyMetadata, WorkflowActionDefinition } from '../workflow/types'

/**
 * Plugin-Kategorie. Spiegelt bewusst `ModuleCategory` aus uiStore (renderer),
 * weil `shared/` nicht aus `renderer/` importieren darf. Langfristiger Heimatort
 * dieser Union ist hier; uiStore sollte sie später von hier beziehen.
 */
export type PluginCategory =
  | 'ai'
  | 'communication'
  | 'business'
  | 'learning'
  | 'research'
  | 'devices'
  | 'documents'

/**
 * Capabilities = die einzigen Host-Dienste, die ein Plugin anfordern kann.
 * Jede ist ein Tor durch die abgesicherte Kern-Grenze (writeFileSafe, safeStorage,
 * isHardLocked/isCloudModel, Domain-Allowlist). UI-Beiträge sind KEINE Capability —
 * sie laufen über die Renderer-Registry an benannte Slots.
 */
export type PluginCapability =
  | 'vault.read'
  | 'vault.write'
  | 'secrets'
  | 'llm.generate'
  | 'http.fetch'
  | 'workflow.action'
  // Geräte-/Dokument-Capabilities (reMarkable-Vertikale): jede ein schmales, zweck-
  // spezifisches Tor durch eine privilegierte Kern-Grenze (electron.net an einen
  // allowlisteten Host, BrowserWindow→PDF, Ghostscript/qpdf) — kein generisches exec/net.
  | 'device.usb'
  | 'pdf.render'
  | 'pdf.optimize'
  // Dokument-Capabilities (edoobox-Vertikale, Phase 2): schmale Tore für User-Datei-Dialoge
  // (nur die im Dialog gewählte Datei wird gelesen/geschrieben) und gebündelte App-Ressourcen
  // (read-only auf das resources/-Verzeichnis) — kein generisches Datei-System-Tor.
  | 'dialog'
  | 'resource'

/**
 * JSON Schema (draft-07) als reine serialisierbare Daten. Bewusst lose getypt —
 * der ajv-Compile-Schritt (schemas.ts) ist das echte Laufzeit-Tor, nicht dieser Typ.
 */
export type JsonSchema = Record<string, unknown>

/** Ein vom Plugin benötigtes Credential. `secret: true` ⇒ nur über host.secrets (safeStorage). */
export interface CredentialRequirement {
  key: string
  label: string
  secret?: boolean
  /** Default true. `false` ⇒ optionales Credential (z.B. WordPress-Passwort der Marketing-
   *  Teilfunktion von edoobox) — zählt NICHT in die Readiness-Prüfung (needs-configuration). */
  required?: boolean
}

/**
 * Eine aufrufbare Plugin-Action. Deklariert ihren Vertrag (Schemas), ihr feineres
 * Capability-Scoping (kann ein Subset der Plugin-Capabilities sein) und ihre
 * Privacy-/Hard-Lock-Metadaten. KEIN `run()` — die Implementierung lebt im Main-Entry
 * und wird über die Action-Registry angemeldet.
 */
export interface ActionDef {
  /** Namespaced über die Plugin-ID, z.B. 'antares.listMahnungen'. */
  id: string
  label?: string
  /** Per-Action-Scoping (feiner als pro Plugin). Muss Subset von manifest.capabilities sein. */
  requiredCapabilities: PluginCapability[]
  inputSchema?: JsonSchema
  outputSchema?: JsonSchema
  isTrigger?: boolean
  isWrite?: boolean
  privacy?: WorkflowPrivacyMetadata
  /** Bei LLM-Actions auf untrusted Input: erzwingt isHardLocked-Check im Runner. */
  hardLockModule?: CompatModuleId
}

/** Deklaration eines UI-Slot-Beitrags: WELCHER Slot + optional WELCHE Action ihn speist. */
export interface SlotDecl {
  slot: string
  fromAction?: string
}

/** Deklariert, wie ein Plugin im Modul-Tab erscheint und wo sein Enabled-Flag persistiert ist. */
export interface PluginModuleDecl {
  /** Modul-ID in der Settings-UI; standardmäßig identisch zur Plugin-ID. */
  id?: string
  /** Primärer Boolean-Pfad im UI-State, der den Main-Lifecycle dieses Plugins steuert. */
  enabledPath: string
  /** Weitere Flags, die derselbe Modulschalter gemeinsam setzt (z.B. ein Feature-Bundle). */
  linkedEnabledPaths?: string[]
  /** Übergangs-Pfad für bestehende Installationen während einer Config-Migration. */
  legacyEnabledPath?: string
}

/**
 * Das vollständige Plugin-Manifest. Muss JSON-serialisierbar bleiben:
 * keine Funktionen, keine React-Komponenten, keine Klassen.
 */
export interface PluginManifest {
  /** Stabile ID — verbindet Manifest, Main-Entry, Renderer-Entry und alle Action-IDs. */
  id: string
  /** SemVer — Grundlage für Config-Migration. */
  version: string
  label: string
  description: string
  category: PluginCategory
  icon?: { text?: string; color?: string }

  capabilities: PluginCapability[]
  /** Domain-Allowlist für host.http.fetch. Fehlt sie, ist http.fetch gesperrt. */
  http?: { allowedHosts: string[] }
  credentials?: CredentialRequirement[]
  /** Metadaten für den generisch aus Manifesten aufgebauten Modulschalter. */
  module?: PluginModuleDecl
  /** Einfache Settings werden hieraus generiert; komplexe UI bleibt React. */
  settingsSchema?: JsonSchema
  actions?: ActionDef[]
  /**
   * Workflow-Canvas-Bausteine, die dieses Plugin zur Palette + zum Runner beisteuert
   * (z.B. ein Trigger). Reine, serialisierbare Metadaten. Der Kern registriert sie generisch
   * (registerWorkflowActions) — kein statischer antares/edoobox-Eintrag im Kern.
   */
  workflowActions?: WorkflowActionDefinition[]
  ui?: {
    settingsTab?: boolean
    dashboardWidget?: SlotDecl
    sidebarPanel?: SlotDecl
  }
  privacy?: { containsPersonalData?: boolean; localOnly?: boolean }
}
