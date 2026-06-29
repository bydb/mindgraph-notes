// Laufzeit-Validierung via ajv (JSON Schema, draft-07) — der EINZIGE Validator.
//
// TypeScript schützt nur compile-time. Manifest (aus Bundle/Disk), gespeicherte Config
// und IPC-Payloads vom (potenziell kompromittierten) Renderer sind Laufzeitdaten und
// MÜSSEN hier durch. Siehe docs/plugin-system-plan.md, Entscheidung #9.
//
// ajv 6.x ist bereits transitiv im Tree und wird als direkte Dep gepinnt (kein Zod).

import Ajv from 'ajv'
import type { ValidateFunction } from 'ajv'
import semver from 'semver'
import { API_VERSION } from './version'
import type { JsonSchema, PluginManifest } from './manifest'

const ajv = new Ajv({ allErrors: true, removeAdditional: false })

export interface ValidationResult {
  valid: boolean
  errors: string[]
}

/**
 * Diskriminator für einen terminalen Plugin-Fehlerzustand. Single-Source hier im Paket;
 * `shared/plugins/state.ts` zieht den Typ per `import type` (compile-time erased ⇒ kein
 * semver/ajv-Runtime-Leak in den Renderer).
 *  - `manifest-invalid`: Schema-/Semantik-Verstoß, inkl. ungültiger SemVer/URL/Pfad.
 *  - `incompatible-api`: gültige `apiVersion`-Range, die die laufende `API_VERSION` nicht erfüllt.
 *  - `incompatible-app`: gültige `minAppVersion`, aber laufende App-Version ist kleiner.
 */
export type PluginErrorKind = 'manifest-invalid' | 'incompatible-api' | 'incompatible-app'

/** Ergebnis eines Kompatibilitäts-Gates. `kind` ist nur bei `compatible: false` gesetzt. */
export interface CompatResult {
  compatible: boolean
  reason?: string
  kind?: PluginErrorKind
}

// Relative Artefakt-Pfade: kein führendes '/'/'\\', kein Schema (xxx:), kein führendes '..'.
// Der robuste „..-irgendwo"-Check läuft segmentweise in validateManifestSemantics.
const ENTRY_PATH_GUARD = '^(?![/\\\\])(?![A-Za-z][A-Za-z0-9+.-]*:)(?!\\.\\.(?:[/\\\\]|$))'
// Gebaute Artefakte: main/renderer MÜSSEN .js sein, styles .css — A1 verlässt sich darauf.
const ENTRY_JS_PATTERN = ENTRY_PATH_GUARD + '.+\\.js$'
const ENTRY_CSS_PATTERN = ENTRY_PATH_GUARD + '.+\\.css$'

const CAPABILITY_VALUES = [
  'vault.read',
  'vault.write',
  'secrets',
  'llm.generate',
  'http.fetch',
  'workflow.action',
  'device.usb',
  'pdf.render',
  'pdf.optimize',
  'dialog',
  'resource',
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
  definitions: {
    workflowPort: {
      type: 'object',
      required: ['id', 'label', 'kind'],
      properties: {
        id: { type: 'string', minLength: 1 },
        label: { type: 'string' },
        kind: { type: 'string', minLength: 1 },
        required: { type: 'boolean' },
        multiple: { type: 'boolean' },
      },
      additionalProperties: false,
    },
    // UI-Slot-Beitrag: strikt nur die zwei Slot-Kategorien; optional die speisende Action.
    // KEIN `view`-Feld (fromAction liefert die WidgetView, gegen WIDGET_VIEW_SCHEMA validiert).
    slotDecl: {
      type: 'object',
      required: ['slot'],
      properties: {
        slot: { enum: ['dashboard.widget', 'sidebar.panel'] },
        fromAction: { type: 'string', minLength: 1 },
      },
      additionalProperties: false,
    },
  },
  required: [
    'manifestVersion', 'id', 'version', 'label', 'description', 'category', 'capabilities',
    'apiVersion', 'minAppVersion', 'author', 'entrypoints',
  ],
  // STRIKT: unbekannte Top-Level-Felder abweisen — fängt Tippfehler (z.B. `capabilites`).
  additionalProperties: false,
  properties: {
    // v1 wird nicht mehr akzeptiert: hart const:2 + global required. v3 bekommt ein eigenes Schema.
    manifestVersion: { const: 2 },
    id: { type: 'string', pattern: '^[a-z][a-z0-9-]*$' },
    version: { type: 'string', minLength: 1 },
    label: { type: 'string', minLength: 1 },
    description: { type: 'string' },
    category: { type: 'string', enum: CATEGORY_VALUES as unknown as string[] },
    // SemVer-Form prüft die Semantik (validRange/valid); hier nur „nicht leer".
    apiVersion: { type: 'string', minLength: 1 },
    minAppVersion: { type: 'string', minLength: 1 },
    author: {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string', minLength: 1 },
        // url wird zusätzlich semantisch auf http(s) geprüft (isHttpUrl) — später klickbar im Store.
        url: { type: 'string' },
        email: { type: 'string', format: 'email' },
      },
      additionalProperties: false,
    },
    entrypoints: {
      type: 'object',
      // Mindestens ein Code-Einstieg (main ODER renderer); styles ist optional.
      anyOf: [{ required: ['main'] }, { required: ['renderer'] }],
      properties: {
        main: { type: 'string', minLength: 1, pattern: ENTRY_JS_PATTERN },
        renderer: { type: 'string', minLength: 1, pattern: ENTRY_JS_PATTERN },
        styles: { type: 'string', minLength: 1, pattern: ENTRY_CSS_PATTERN },
      },
      additionalProperties: false,
    },
    repo: { type: 'string' },
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
          required: { type: 'boolean' },
        },
        additionalProperties: false,
      },
    },
    module: {
      type: 'object',
      required: ['enabledPath'],
      properties: {
        id: { type: 'string', pattern: '^[a-z][a-z0-9-]*$' },
        enabledPath: { type: 'string', pattern: '^[a-zA-Z][a-zA-Z0-9]*(\\.[a-zA-Z][a-zA-Z0-9-]*)+$' },
        linkedEnabledPaths: {
          type: 'array',
          items: { type: 'string', pattern: '^[a-zA-Z][a-zA-Z0-9]*(\\.[a-zA-Z][a-zA-Z0-9-]*)+$' },
          uniqueItems: true,
        },
        legacyEnabledPath: { type: 'string', pattern: '^[a-zA-Z][a-zA-Z0-9]*(\\.[a-zA-Z][a-zA-Z0-9-]*)+$' },
      },
      additionalProperties: false,
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
          widgetProvider: { type: 'boolean' },
          privacy: { type: 'object' },
          hardLockModule: { type: 'string' },
        },
        // STRIKT: unbekannte Action-Felder abweisen — fängt z.B. `outputShema` statt `outputSchema`.
        additionalProperties: false,
      },
    },
    // Workflow-Canvas-Bausteine (Palette + Runner-Dispatch). Reine Metadaten — KEIN run().
    // Der Kern baut Palette und Runner generisch daraus auf; statische antares/edoobox-Einträge
    // gibt es nicht mehr (Deletion-Test).
    workflowActions: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'moduleId', 'label', 'inputs', 'outputs'],
        properties: {
          id: { type: 'string', minLength: 1 },
          moduleId: { type: 'string', minLength: 1 },
          moduleLabel: { type: 'string' },
          featureGate: { type: ['string', 'null'] },
          label: { type: 'string', minLength: 1 },
          description: { type: 'string' },
          inputs: { type: 'array', items: { $ref: '#/definitions/workflowPort' } },
          outputs: { type: 'array', items: { $ref: '#/definitions/workflowPort' } },
          isTrigger: { type: 'boolean' },
          isWrite: { type: 'boolean' },
          isTerminal: { type: 'boolean' },
          hardLockModule: { type: 'string' },
          privacy: { type: 'object' },
          config: { type: 'array', items: { type: 'object' } },
          simLine: { type: 'string' },
        },
        additionalProperties: false,
      },
    },
    ui: {
      type: 'object',
      properties: {
        settingsTab: { type: 'boolean' },
        // SlotDecl strikt: nur die zwei Slot-Kategorien; KEIN `view`-Template (fromAction liefert die WidgetView).
        dashboardWidget: { $ref: '#/definitions/slotDecl' },
        sidebarPanel: { $ref: '#/definitions/slotDecl' },
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
 *  - jede Action darf nur Capabilities verlangen, die das Plugin global deklariert hat;
 *  - Action-IDs müssen eindeutig sein (doppelte würden widersprüchliche Schemas/Executoren
 *    erzeugen — die Registry registriert sonst still den ersten und ignoriert den Rest).
 * Setzt voraus, dass `validateManifest` bereits grün war.
 */
export function validateManifestSemantics(manifest: PluginManifest): ValidationResult {
  const errors: string[] = []

  // — SemVer-/URL-/Pfad-Form (Klasse manifest-invalid; JSON Schema drückt das nicht aus) —
  if (!semver.valid(manifest.version)) {
    errors.push(`Ungültige SemVer-Version '${manifest.version}'.`)
  }
  if (!semver.valid(manifest.minAppVersion)) {
    errors.push(`Ungültige minAppVersion '${manifest.minAppVersion}' (konkrete SemVer erwartet).`)
  }
  if (!semver.validRange(manifest.apiVersion)) {
    errors.push(`Ungültige apiVersion-Range '${manifest.apiVersion}'.`)
  }
  if (manifest.repo !== undefined && !isHttpUrl(manifest.repo)) {
    errors.push(`repo ist keine gültige http(s)-URL: '${manifest.repo}'.`)
  }
  // author.url wird im Store klickbar — dieselbe http(s)-Strenge wie repo (kein javascript: o.ä.).
  if (manifest.author?.url !== undefined && !isHttpUrl(manifest.author.url)) {
    errors.push(`author.url ist keine gültige http(s)-URL: '${manifest.author.url}'.`)
  }
  // '..' an JEDER Stelle eines Entry-Pfads ablehnen (das ajv-Pattern fängt nur den Präfix).
  for (const [key, value] of Object.entries(manifest.entrypoints ?? {})) {
    if (typeof value === 'string' && value.split(/[/\\]/).includes('..')) {
      errors.push(`Entry-Point '${key}' enthält ein '..'-Segment: '${value}'.`)
    }
  }

  const declared = new Set<string>(manifest.capabilities)
  const seenActionIds = new Set<string>()
  for (const action of manifest.actions ?? []) {
    if (seenActionIds.has(action.id)) {
      errors.push(`Doppelte Action-ID '${action.id}'.`)
    }
    seenActionIds.add(action.id)
    for (const cap of action.requiredCapabilities) {
      if (!declared.has(cap)) {
        errors.push(
          `Action '${action.id}' verlangt Capability '${cap}', die das Manifest nicht deklariert.`
        )
      }
    }
  }

  // Widget-Provider-Vertrag (Renderer-Spike §4): eine `ui.{dashboardWidget,sidebarPanel}.fromAction`
  // MUSS eine EXISTIERENDE Action referenzieren, die BEIDE Marker trägt — `widgetProvider: true` UND
  // `isWrite: false` (nebenwirkungsfreier Datenlieferant). Sonst kein gültiger Widget-Datenkanal →
  // das Plugin wird abgelehnt (kein still-degradiertes Widget).
  const actionsById = new Map((manifest.actions ?? []).map((a) => [a.id, a]))
  for (const slotKey of ['dashboardWidget', 'sidebarPanel'] as const) {
    const fromAction = manifest.ui?.[slotKey]?.fromAction
    if (!fromAction) continue
    const action = actionsById.get(fromAction)
    if (!action) {
      errors.push(`ui.${slotKey}.fromAction '${fromAction}' referenziert keine deklarierte Action.`)
    } else if (action.widgetProvider !== true || action.isWrite === true) {
      errors.push(
        `ui.${slotKey}.fromAction '${fromAction}' muss eine Action mit widgetProvider:true UND isWrite:false sein.`
      )
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

function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

// — Kompatibilitäts-Gate (A0/2). Reine Funktionen über paket-eigene Daten (API_VERSION) bzw. die
//   per Aufruf übergebene App-Version — standalone testbar. Der Registry-Aufruf läuft NACH
//   validateManifest/validateManifestSemantics; eine ungültige Range/Version ist also bereits dort
//   als `manifest-invalid` abgefangen. Die defensiven valid-Checks hier machen die Funktionen
//   trotzdem für direkte (Fremd-)Aufrufer sicher.

/** Prüft, ob die laufende `API_VERSION` die vom Plugin deklarierte `apiVersion`-Range erfüllt. */
export function isApiCompatible(apiVersionRange: string): CompatResult {
  if (typeof apiVersionRange !== 'string' || !semver.validRange(apiVersionRange)) {
    return {
      compatible: false,
      kind: 'manifest-invalid',
      reason: `Ungültige apiVersion-Range '${apiVersionRange}'.`,
    }
  }
  if (!semver.satisfies(API_VERSION, apiVersionRange)) {
    return {
      compatible: false,
      kind: 'incompatible-api',
      reason: `Inkompatible API-Version: Plugin verlangt '${apiVersionRange}', App bietet '${API_VERSION}'.`,
    }
  }
  return { compatible: true }
}

/** Prüft, ob die laufende App-Version mindestens `minAppVersion` ist. */
export function isAppCompatible(minAppVersion: string, appVersion: string): CompatResult {
  if (typeof minAppVersion !== 'string' || !semver.valid(minAppVersion)) {
    return {
      compatible: false,
      kind: 'manifest-invalid',
      reason: `Ungültige minAppVersion '${minAppVersion}'.`,
    }
  }
  // Fail-CLOSED: kann der Host seine eigene Version nicht belegen, darf das Gate nicht offen
  // ausfallen — sonst umginge genau dieser Fall die Kompatibilitätsprüfung.
  if (!semver.valid(appVersion)) {
    return {
      compatible: false,
      kind: 'incompatible-app',
      reason: `App-Version unlesbar ('${appVersion}') — Kompatibilität nicht belegbar.`,
    }
  }
  if (semver.lt(appVersion, minAppVersion)) {
    return {
      compatible: false,
      kind: 'incompatible-app',
      reason: `App zu alt: Plugin verlangt mindestens '${minAppVersion}', App ist '${appVersion}'.`,
    }
  }
  return { compatible: true }
}
