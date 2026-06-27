// edoobox-Plugin — Manifest (rein serialisierbar). Schritt-9-Vertikale: Veranstaltungs-Agent
// (Akkreditierung → edoobox-Push, Dashboard, Teilnehmer). Phase 1 = Backend: nur die reine
// fetch-API + Credentials + events.json-Persistenz. Marketing/DOCX/Formular bleiben in Phase 1
// noch im Core (brauchen dialog/files-Capabilities → Phase 2). Siehe docs/plugin-system-plan.md.

import type { PluginManifest } from '../../shared/plugins/manifest'

/** as const → bindet das Capability-Tupel für definePluginMain im Main-Entry. */
export const EDOOBOX_CAPABILITIES = ['http.fetch', 'secrets', 'vault.read', 'vault.write', 'dialog', 'resource'] as const

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
  // Baseline-Allowlist für den edoobox-Provider; der konkret konfigurierte Host (ui.edoobox.baseUrl)
  // wird zur Laufzeit aus den Settings ergänzt (resolveExtraAllowedHosts im Capability-Host).
  http: { allowedHosts: ['*.edoobox.com'] },
  credentials: [
    { key: 'apiKey', label: 'API Key', secret: true },
    { key: 'apiSecret', label: 'API Secret', secret: true },
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
  ],
  privacy: { containsPersonalData: true },
}

export default manifest
