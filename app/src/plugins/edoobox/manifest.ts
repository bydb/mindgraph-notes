// edoobox-Plugin — Manifest (rein serialisierbar). Schritt-9-Vertikale: Veranstaltungs-Agent
// (Akkreditierung → edoobox-Push, Dashboard, Teilnehmer). Phase 1 = Backend: nur die reine
// fetch-API + Credentials + events.json-Persistenz. Marketing/DOCX/Formular bleiben in Phase 1
// noch im Core (brauchen dialog/files-Capabilities → Phase 2). Siehe docs/plugin-system-plan.md.

import type { PluginManifest, JsonSchema } from '../../shared/plugins/manifest'

/** as const → bindet das Capability-Tupel für definePluginMain im Main-Entry. */
export const EDOOBOX_CAPABILITIES = ['http.fetch', 'secrets', 'vault.read', 'vault.write', 'dialog', 'resource', 'llm.generate'] as const

// — Ausgabe-Schemas (Defense-in-Depth, Envelope-Ebene). Die meisten Actions liefern die alte
//   {success,…}-IPC-Hülle mit je nach Erfolg/Fehler unterschiedlichen (z.T. undefined-wertigen)
//   Optionalfeldern → strikt geprüft wird nur das IMMER vorhandene `success:boolean`, der Rest
//   bleibt lenient. Fixe, intern gebaute Formen (Credentials, ausgewähltes Bild) sind strikt.
const boolResult: JsonSchema = { type: 'boolean' }
const successEnvelope: JsonSchema = {
  type: 'object',
  required: ['success'],
  properties: { success: { type: 'boolean' } },
  additionalProperties: true,
}
const objectArray: JsonSchema = { type: 'array', items: { type: 'object' } }
const nullableObject: JsonSchema = { anyOf: [{ type: 'null' }, { type: 'object' }] }
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
  id: 'edoobox',
  version: '1.0.0',
  label: 'Edoobox Modul',
  description: 'Veranstaltungs-Agent: Akkreditierung → edoobox-Push, Dashboard, Buchungen, Teilnehmerlisten.',
  category: 'business',
  icon: { text: '🎓', color: '#6366f1' },
  capabilities: [...EDOOBOX_CAPABILITIES],
  // Baseline-Allowlist: edoobox-Provider + Google Imagen (Marketing-Bildgenerierung). Der
  // konfigurierte edoobox- UND WordPress-Host (ui.edoobox.baseUrl, ui.marketing.wordpressUrl)
  // wird zur Laufzeit ergänzt (resolveExtraAllowedHosts im Capability-Host).
  http: { allowedHosts: ['*.edoobox.com', 'generativelanguage.googleapis.com'] },
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
    // — Marketing-Actions (Phase 2b): WordPress-Publishing + Ollama-Content + Imagen-Bilder. —
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
    {
      id: 'edoobox.marketingGenerateImage',
      requiredCapabilities: ['http.fetch'],
      inputSchema: {
        type: 'object',
        required: ['prompt', 'apiKey'],
        properties: { prompt: { type: 'string' }, apiKey: { type: 'string' } },
        additionalProperties: false,
      },
    },
    { id: 'edoobox.marketingSelectImage', requiredCapabilities: ['dialog'] },
  ],
  privacy: { containsPersonalData: true },
}

// Ausgabe-Schemas zentral je Action-ID zugeordnet — hält die große actions-Liste lesbar.
// Vollständigkeit (jede Action MUSS hier stehen) wird im Test erzwungen.
const EDOOBOX_OUTPUT_SCHEMAS: Record<string, JsonSchema> = {
  'edoobox.check': successEnvelope,
  'edoobox.listOffers': successEnvelope,
  'edoobox.listCategories': successEnvelope,
  'edoobox.listOffersDashboard': successEnvelope,
  'edoobox.listBookings': successEnvelope,
  'edoobox.listDates': successEnvelope,
  'edoobox.importEvent': successEnvelope,
  'edoobox.saveCredentials': boolResult,
  'edoobox.loadCredentials': apiCredentialsResult,
  'edoobox.loadEvents': objectArray,
  'edoobox.saveEvents': boolResult,
  'edoobox.parseFormular': nullableObject,
  'edoobox.generateIqReport': successEnvelope,
  'edoobox.generateAttendanceList': successEnvelope,
  'edoobox.marketingSaveCredentials': boolResult,
  'edoobox.marketingLoadCredentials': wpCredentialsResult,
  'edoobox.marketingCheckWordpress': successEnvelope,
  'edoobox.marketingGenerateContent': successEnvelope,
  'edoobox.marketingPublishWordpress': successEnvelope,
  'edoobox.marketingUploadImage': successEnvelope,
  'edoobox.marketingGenerateImage': successEnvelope,
  'edoobox.marketingSelectImage': selectedImageResult,
}
for (const action of manifest.actions ?? []) {
  action.outputSchema = EDOOBOX_OUTPUT_SCHEMAS[action.id]
}

export default manifest
