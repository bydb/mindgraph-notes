// edoobox-Plugin — Manifest (rein serialisierbar). Schritt-9-Vertikale: Veranstaltungs-Agent
// (Akkreditierung → edoobox-Push, Dashboard, Teilnehmer). Phase 1 = Backend: nur die reine
// fetch-API + Credentials + events.json-Persistenz. Marketing/DOCX/Formular bleiben in Phase 1
// noch im Core (brauchen dialog/files-Capabilities → Phase 2). Siehe docs/plugin-system-plan.md.

import type { PluginManifest, JsonSchema } from '@mindgraph/plugin-api'

/** as const → bindet das Capability-Tupel für definePluginMain im Main-Entry. */
export const EDOOBOX_CAPABILITIES = ['http.fetch', 'secrets', 'vault.read', 'vault.write', 'dialog', 'resource', 'llm.generate'] as const

// — Ausgabe-Schemas (Defense-in-Depth). Die meisten Actions liefern die alte {success,…}-IPC-
//   Hülle. `success:boolean` ist IMMER da → required; die vom Renderer/Workflow KONSUMIERTEN
//   Datenfelder (offers/bookings/dates/IDs/Texte) werden per Typ geprüft, WENN sie vorhanden
//   sind (auf dem Fehlerpfad {success:false,error} fehlen sie ⇒ nicht required). `undefined`-
//   wertige Felder kommen hier nicht vor (sie werden auf dem Fehlerpfad weggelassen), daher ist
//   die Typprüfung „wenn vorhanden" sicher. additionalProperties bleibt offen.
const str: JsonSchema = { type: 'string' }
const num: JsonSchema = { type: 'number' }
const arr: JsonSchema = { type: 'array' }
/** Baut eine {success,…}-Hülle, die `success` erzwingt und die genannten Felder typt-wenn-vorhanden. */
const envelope = (fields: Record<string, JsonSchema> = {}): JsonSchema => ({
  type: 'object',
  required: ['success'],
  properties: { success: { type: 'boolean' }, ...fields },
  additionalProperties: true,
})
const boolResult: JsonSchema = { type: 'boolean' }
const objectArray: JsonSchema = { type: 'array', items: { type: 'object' } }
const nullableObject: JsonSchema = { anyOf: [{ type: 'null' }, { type: 'object' }] }

const plainEnvelope = envelope()
const offersEnvelope = envelope({ offers: arr })
const categoriesEnvelope = envelope({ categories: arr })
const bookingsEnvelope = envelope({ bookings: arr })
const datesEnvelope = envelope({ dates: arr })
const importEventEnvelope = envelope({ offerId: str })
const fileExportEnvelope = envelope({ filePath: str, canceled: { type: 'boolean' } })
const contentEnvelope = envelope({ blogPost: str, igCaption: str })
const wpCheckEnvelope = envelope({ userName: str })
const publishEnvelope = envelope({ postId: num, postUrl: str, status: str })
const uploadEnvelope = envelope({ mediaId: num, imageUrl: str })
const apiCredentialsResult: JsonSchema = {
  anyOf: [
    { type: 'null' },
    { type: 'object', required: ['apiKey', 'apiSecret'], properties: { apiKey: { type: 'string' }, apiSecret: { type: 'string' } }, additionalProperties: false },
  ],
}
const wpCredentialsResult: JsonSchema = {
  anyOf: [
    { type: 'null' },
    { type: 'object', required: ['wpAppPassword'], properties: { wpAppPassword: { type: 'string' } }, additionalProperties: false },
  ],
}
const selectedImageResult: JsonSchema = {
  anyOf: [
    { type: 'null' },
    { type: 'object', required: ['fileName', 'imageBase64'], properties: { fileName: { type: 'string' }, imageBase64: { type: 'string' } }, additionalProperties: false },
  ],
}

// Eingabe mit edoobox-Server-Koordinaten (baseUrl + apiVersion kommen aus den Settings).
const apiInput = {
  type: 'object' as const,
  required: ['baseUrl', 'apiVersion'],
  properties: {
    baseUrl: { type: 'string' },
    apiVersion: { type: 'string' },
  },
  additionalProperties: false,
}

export const manifest: PluginManifest = {
  manifestVersion: 2,
  id: 'edoobox',
  version: '1.0.0',
  label: 'Edoobox Modul',
  description: 'Veranstaltungs-Agent: Akkreditierung → edoobox-Push, Dashboard, Buchungen, Teilnehmerlisten.',
  category: 'business',
  apiVersion: '^0.2.0',
  minAppVersion: '0.8.14',
  author: { name: 'Jochen Leeder', url: 'https://mindgraph-notes.de' },
  entrypoints: { main: 'main.js', renderer: 'renderer.js' },
  icon: { text: '🎓', color: '#6366f1' },
  module: {
    id: 'mz-suite',
    enabledPath: 'pluginConfig.edoobox.enabled',
    linkedEnabledPaths: ['pluginConfig.marketing.enabled'],
    legacyEnabledPath: 'edoobox.enabled',
  },
  capabilities: [...EDOOBOX_CAPABILITIES],
  // Baseline-Allowlist: edoobox-Provider. Der konfigurierte edoobox- UND WordPress-Host
  // (ui.edoobox.baseUrl, ui.marketing.wordpressUrl) wird zur Laufzeit ergänzt
  // (resolveExtraAllowedHosts im Capability-Host). Bild-Generierung (Google Imagen) ist
  // seit der Modul-Entflechtung ein CORE-Modul (image-generation) — kein Imagen-Host mehr hier.
  http: { allowedHosts: ['*.edoobox.com'] },
  credentials: [
    { key: 'apiKey', label: 'API Key', secret: true },
    { key: 'apiSecret', label: 'API Secret', secret: true },
    // Optional: nur für die Marketing-Teilfunktion (WordPress). Fehlt es, ist edoobox trotzdem
    // „bereit" — die Marketing-Action wirft erst beim Aufruf, wenn das Passwort fehlt.
    { key: 'wpAppPassword', label: 'WordPress App-Passwort', secret: true, required: false },
  ],
  actions: [
    { id: 'edoobox.check', label: 'Verbindung testen', requiredCapabilities: ['http.fetch', 'secrets'], inputSchema: apiInput },
    { id: 'edoobox.listOffers', requiredCapabilities: ['http.fetch', 'secrets'], inputSchema: apiInput },
    { id: 'edoobox.listCategories', requiredCapabilities: ['http.fetch', 'secrets'], inputSchema: apiInput },
    {
      id: 'edoobox.listOffersDashboard',
      requiredCapabilities: ['http.fetch', 'secrets'],
      inputSchema: {
        type: 'object',
        required: ['baseUrl', 'apiVersion'],
        properties: {
          baseUrl: { type: 'string' },
          apiVersion: { type: 'string' },
          scope: { type: 'string' },
        },
        additionalProperties: false,
      },
    },
    {
      id: 'edoobox.listBookings',
      requiredCapabilities: ['http.fetch', 'secrets'],
      isTrigger: true,
      inputSchema: {
        type: 'object',
        required: ['baseUrl', 'apiVersion', 'offerId'],
        properties: {
          baseUrl: { type: 'string' },
          apiVersion: { type: 'string' },
          offerId: { type: 'string' },
        },
        additionalProperties: false,
      },
    },
    {
      id: 'edoobox.listDates',
      requiredCapabilities: ['http.fetch', 'secrets'],
      inputSchema: {
        type: 'object',
        required: ['baseUrl', 'apiVersion', 'offerId'],
        properties: {
          baseUrl: { type: 'string' },
          apiVersion: { type: 'string' },
          offerId: { type: 'string' },
        },
        additionalProperties: false,
      },
    },
    {
      id: 'edoobox.importEvent',
      requiredCapabilities: ['http.fetch', 'secrets'],
      isWrite: true,
      inputSchema: {
        type: 'object',
        required: ['baseUrl', 'apiVersion', 'event'],
        properties: {
          baseUrl: { type: 'string' },
          apiVersion: { type: 'string' },
          event: { type: 'object' },
        },
        additionalProperties: false,
      },
    },
    {
      id: 'edoobox.saveCredentials',
      requiredCapabilities: ['secrets'],
      isWrite: true,
      inputSchema: {
        type: 'object',
        required: ['apiKey', 'apiSecret'],
        properties: { apiKey: { type: 'string' }, apiSecret: { type: 'string' } },
        additionalProperties: false,
      },
    },
    { id: 'edoobox.loadCredentials', requiredCapabilities: ['secrets'] },
    { id: 'edoobox.loadEvents', requiredCapabilities: ['vault.read'] },
    {
      id: 'edoobox.saveEvents',
      requiredCapabilities: ['vault.write'],
      isWrite: true,
      inputSchema: {
        type: 'object',
        required: ['events'],
        properties: { events: { type: 'array' } },
        additionalProperties: false,
      },
    },
    // — Dokument-Actions (Phase 2): Akkreditierungsformular-Import (DOCX→Event) +
    //   IQ-/Anwesenheitsliste-Export (DOCX). Datei-I/O nur über host.dialog (User-gewählt)
    //   + host.resource (gebündelte Vorlagen).
    { id: 'edoobox.parseFormular', label: 'Akkreditierungsformular importieren', requiredCapabilities: ['dialog'] },
    {
      id: 'edoobox.generateIqReport',
      label: 'IQ-Auswertung exportieren',
      requiredCapabilities: ['resource', 'dialog'],
      isWrite: true,
      inputSchema: {
        type: 'object',
        required: ['data', 'suggestedFileName'],
        properties: { data: { type: 'object' }, suggestedFileName: { type: 'string' } },
        additionalProperties: false,
      },
    },
    {
      id: 'edoobox.generateAttendanceList',
      label: 'Teilnehmerliste exportieren',
      requiredCapabilities: ['resource', 'dialog'],
      isWrite: true,
      inputSchema: {
        type: 'object',
        required: ['data', 'suggestedFileName'],
        properties: { data: { type: 'object' }, suggestedFileName: { type: 'string' } },
        additionalProperties: false,
      },
    },
    // — Marketing-Actions (Phase 2b): WordPress-Publishing + Ollama-Content. —
    {
      id: 'edoobox.marketingSaveCredentials',
      requiredCapabilities: ['secrets'],
      isWrite: true,
      inputSchema: {
        type: 'object',
        required: ['wpAppPassword'],
        properties: { wpAppPassword: { type: 'string' } },
        additionalProperties: false,
      },
    },
    { id: 'edoobox.marketingLoadCredentials', requiredCapabilities: ['secrets'] },
    {
      id: 'edoobox.marketingCheckWordpress',
      requiredCapabilities: ['http.fetch', 'secrets'],
      inputSchema: {
        type: 'object',
        required: ['siteUrl', 'username'],
        properties: { siteUrl: { type: 'string' }, username: { type: 'string' } },
        additionalProperties: false,
      },
    },
    {
      id: 'edoobox.marketingGenerateContent',
      requiredCapabilities: ['llm.generate'],
      inputSchema: {
        type: 'object',
        required: ['offerData'],
        properties: { offerData: { type: 'object' } },
        additionalProperties: false,
      },
    },
    {
      id: 'edoobox.marketingPublishWordpress',
      requiredCapabilities: ['http.fetch', 'secrets'],
      isWrite: true,
      inputSchema: {
        type: 'object',
        required: ['siteUrl', 'username', 'title', 'content', 'status'],
        properties: {
          siteUrl: { type: 'string' },
          username: { type: 'string' },
          title: { type: 'string' },
          content: { type: 'string' },
          status: { type: 'string' },
          featuredMediaId: { type: 'number' },
        },
        additionalProperties: false,
      },
    },
    {
      id: 'edoobox.marketingUploadImage',
      requiredCapabilities: ['http.fetch', 'secrets'],
      isWrite: true,
      inputSchema: {
        type: 'object',
        required: ['siteUrl', 'username', 'imageBase64', 'fileName'],
        properties: {
          siteUrl: { type: 'string' },
          username: { type: 'string' },
          imageBase64: { type: 'string' },
          fileName: { type: 'string' },
          caption: { type: 'string' },
        },
        additionalProperties: false,
      },
    },
    { id: 'edoobox.marketingSelectImage', requiredCapabilities: ['dialog'] },
  ],
  // Workflow-Canvas-Trigger (vorher statisch im Kern-Registry). Feuert bei steigender
  // Buchungszahl; der generische Text-Trigger-Executor gibt den vorformatierten Seed-Text aus.
  workflowActions: [
    {
      id: 'edoobox.newBooking',
      moduleId: 'edoobox',
      moduleLabel: 'edoobox',
      featureGate: 'edoobox',
      label: 'Neue Anmeldung (Auslöser)',
      description:
        'Startpunkt: eine neue Anmeldung in einem edoobox-Angebot. Gibt Angebotsname, Teilnehmer und E-Mail-Adresse aus.',
      isTrigger: true,
      inputs: [],
      outputs: [
        { id: 'text', label: 'Anmeldung', kind: 'text' },
        { id: 'email', label: 'Teilnehmer', kind: 'email' },
      ],
      privacy: { containsPersonalData: true, requiresCredential: true },
      simLine: 'Auslöser: neue Anmeldung für „Marslandschaft gestalten"',
    },
  ],
  privacy: { containsPersonalData: true },
}

// Ausgabe-Schemas zentral je Action-ID zugeordnet — hält die große actions-Liste lesbar.
// Vollständigkeit (jede Action MUSS hier stehen) wird im Test erzwungen.
const EDOOBOX_OUTPUT_SCHEMAS: Record<string, JsonSchema> = {
  'edoobox.check': plainEnvelope,
  'edoobox.listOffers': offersEnvelope,
  'edoobox.listCategories': categoriesEnvelope,
  'edoobox.listOffersDashboard': offersEnvelope,
  'edoobox.listBookings': bookingsEnvelope,
  'edoobox.listDates': datesEnvelope,
  'edoobox.importEvent': importEventEnvelope,
  'edoobox.saveCredentials': boolResult,
  'edoobox.loadCredentials': apiCredentialsResult,
  'edoobox.loadEvents': objectArray,
  'edoobox.saveEvents': boolResult,
  'edoobox.parseFormular': nullableObject,
  'edoobox.generateIqReport': fileExportEnvelope,
  'edoobox.generateAttendanceList': fileExportEnvelope,
  'edoobox.marketingSaveCredentials': boolResult,
  'edoobox.marketingLoadCredentials': wpCredentialsResult,
  'edoobox.marketingCheckWordpress': wpCheckEnvelope,
  'edoobox.marketingGenerateContent': contentEnvelope,
  'edoobox.marketingPublishWordpress': publishEnvelope,
  'edoobox.marketingUploadImage': uploadEnvelope,
  'edoobox.marketingSelectImage': selectedImageResult,
}
for (const action of manifest.actions ?? []) {
  action.outputSchema = EDOOBOX_OUTPUT_SCHEMAS[action.id]
}

export default manifest
