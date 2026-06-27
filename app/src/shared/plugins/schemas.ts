// Laufzeit-Validierung via ajv (JSON Schema, draft-07) — der EINZIGE Validator.
//
// TypeScript schützt nur compile-time. Manifest (aus Bundle/Disk), gespeicherte Config
// und IPC-Payloads vom (potenziell kompromittierten) Renderer sind Laufzeitdaten und
// MÜSSEN hier durch. Siehe docs/plugin-system-plan.md, Entscheidung #9.
//
// ajv 6.x ist bereits transitiv im Tree und wird als direkte Dep gepinnt (kein Zod).

import Ajv from 'ajv'
import type { ValidateFunction } from 'ajv'
import type { JsonSchema, PluginManifest } from './manifest'

const ajv = new Ajv({ allErrors: true, removeAdditional: false })

export interface ValidationResult {
  valid: boolean
  errors: string[]
}

const CAPABILITY_VALUES = [
  'vault.read',
  'vault.write',
  'secrets',
  'llm.generate',
  'http.fetch',
  'workflow.action',
] as const

const CATEGORY_VALUES = [
  'ai',
  'communication',
  'business',
  'learning',
  'research',
  'devices',
  'documents',
] as const

/**
 * Handgeschriebenes draft-07-Schema für ein gültiges PluginManifest. Das einzige
 * Laufzeit-Tor für Manifeste, die aus Bundles/Disk geladen werden.
 */
export const PLUGIN_MANIFEST_SCHEMA: JsonSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  required: ['id', 'version', 'label', 'description', 'category', 'capabilities'],
  additionalProperties: true,
  properties: {
    id: { type: 'string', pattern: '^[a-z][a-z0-9-]*$' },
    version: { type: 'string', minLength: 1 },
    label: { type: 'string', minLength: 1 },
    description: { type: 'string' },
    category: { type: 'string', enum: CATEGORY_VALUES as unknown as string[] },
    icon: {
      type: 'object',
      properties: { text: { type: 'string' }, color: { type: 'string' } },
      additionalProperties: false,
    },
    capabilities: {
      type: 'array',
      items: { type: 'string', enum: CAPABILITY_VALUES as unknown as string[] },
      uniqueItems: true,
    },
    http: {
      type: 'object',
      required: ['allowedHosts'],
      properties: { allowedHosts: { type: 'array', items: { type: 'string' } } },
      additionalProperties: false,
    },
    credentials: {
      type: 'array',
      items: {
        type: 'object',
        required: ['key', 'label'],
        properties: {
          key: { type: 'string' },
          label: { type: 'string' },
          secret: { type: 'boolean' },
        },
        additionalProperties: false,
      },
    },
    settingsSchema: { type: 'object' },
    actions: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'requiredCapabilities'],
        properties: {
          id: { type: 'string', minLength: 1 },
          label: { type: 'string' },
          requiredCapabilities: {
            type: 'array',
            items: { type: 'string', enum: CAPABILITY_VALUES as unknown as string[] },
            uniqueItems: true,
          },
          inputSchema: { type: 'object' },
          outputSchema: { type: 'object' },
          isTrigger: { type: 'boolean' },
          isWrite: { type: 'boolean' },
          privacy: { type: 'object' },
          hardLockModule: { type: 'string' },
        },
        additionalProperties: true,
      },
    },
    ui: {
      type: 'object',
      properties: {
        settingsTab: { type: 'boolean' },
        dashboardWidget: { type: 'object' },
        sidebarPanel: { type: 'object' },
      },
      additionalProperties: false,
    },
    privacy: {
      type: 'object',
      properties: {
        containsPersonalData: { type: 'boolean' },
        localOnly: { type: 'boolean' },
      },
      additionalProperties: false,
    },
  },
}

function formatErrors(fn: ValidateFunction): string[] {
  return (fn.errors ?? []).map((e) => {
    const where = e.dataPath || e.schemaPath || ''
    return `${where} ${e.message ?? 'ungültig'}`.trim()
  })
}

const validateManifestFn = ajv.compile(PLUGIN_MANIFEST_SCHEMA)

/** Prüft ein unbekanntes Objekt gegen das Manifest-Schema. */
export function validateManifest(value: unknown): ValidationResult {
  const valid = validateManifestFn(value) as boolean
  return { valid, errors: valid ? [] : formatErrors(validateManifestFn) }
}

/**
 * Zusätzliche semantische Prüfungen, die JSON Schema nicht ausdrückt:
 * jede Action darf nur Capabilities verlangen, die das Plugin global deklariert hat.
 * Setzt voraus, dass `validateManifest` bereits grün war.
 */
export function validateManifestSemantics(manifest: PluginManifest): ValidationResult {
  const errors: string[] = []
  const declared = new Set<string>(manifest.capabilities)
  for (const action of manifest.actions ?? []) {
    for (const cap of action.requiredCapabilities) {
      if (!declared.has(cap)) {
        errors.push(
          `Action '${action.id}' verlangt Capability '${cap}', die das Manifest nicht deklariert.`
        )
      }
    }
  }
  return { valid: errors.length === 0, errors }
}

// — Generischer, gecachter Validator für Action-IO und Settings —

const compiledCache = new Map<string, ValidateFunction>()

/** Kompiliert (und cached per Key) ein beliebiges Schema. Key = stabile Action/Settings-ID. */
export function getValidator(key: string, schema: JsonSchema): ValidateFunction {
  let fn = compiledCache.get(key)
  if (!fn) {
    fn = ajv.compile(schema)
    compiledCache.set(key, fn)
  }
  return fn
}

/** Validiert einen Wert gegen ein Schema. `key` aktiviert Caching der kompilierten Funktion. */
export function validateAgainst(
  schema: JsonSchema,
  value: unknown,
  key?: string
): ValidationResult {
  const fn = key ? getValidator(key, schema) : ajv.compile(schema)
  const valid = fn(value) as boolean
  return { valid, errors: valid ? [] : formatErrors(fn) }
}
