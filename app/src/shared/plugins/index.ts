// Plugin-System — geteilte Verträge (prozessübergreifend, Single-Source).
//
// Manifest = reine Daten · Entry = Code-Hooks · Host = Capability-Dienste ·
// State = 3-Dimensionen-Lebenszyklus · Schemas = ajv-Laufzeitvalidierung.
// Siehe docs/plugin-system-plan.md.

export type {
  PluginCategory,
  PluginCapability,
  JsonSchema,
  CredentialRequirement,
  ActionDef,
  SlotDecl,
  PluginManifest,
} from './manifest'

export type {
  VaultReadService,
  VaultWriteService,
  SecretsService,
  LlmService,
  HttpService,
  WorkflowActionService,
  CapabilityServiceMap,
  CapabilityServicesFor,
  PluginHostFor,
  AnyPluginHost,
} from './host'

export type {
  PluginActionExecutor,
  PluginActionRegistry,
  PluginMainContext,
  PluginMainEntry,
  PluginMainLifecycle,
  SlotRegistry,
  PluginRendererEntry,
} from './entry'
export { definePluginMain } from './entry'

export type {
  InstallationState,
  ActivationState,
  ReadinessState,
  PluginErrorInfo,
  PluginRuntimeState,
} from './state'
export { initialPluginState, isPluginUsable, isPluginInvokable, pluginBlockedReason } from './state'

export type { PluginInvokeResult } from './transport'

export type { ValidationResult } from './schemas'
export {
  PLUGIN_MANIFEST_SCHEMA,
  validateManifest,
  validateManifestSemantics,
  getValidator,
  validateAgainst,
} from './schemas'
