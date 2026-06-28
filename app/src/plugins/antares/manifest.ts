// Antares-Plugin — Manifest (rein serialisierbar). Erste echte Migration einer Spaghetti-
// Verdrahtung in eine Vertikale. Read-only Medienzentren-Verleih. Siehe docs/plugin-system-plan.md.

import type { PluginManifest, JsonSchema } from '../../shared/plugins/manifest'

/** as const → bindet das Capability-Tupel für definePluginMain im Main-Entry. */
export const ANTARES_CAPABILITIES = ['http.fetch', 'secrets'] as const

// — Ausgabe-Schemas (Defense-in-Depth): prüfen die ENVELOPE-Form des Action-Ergebnisses,
//   bevor es über IPC in den Renderer geht. Antares ist reverse-engineert; verändertes
//   Server-HTML/JSON könnte sonst beliebige Formen durchreichen. Zeilen aus dem Fremdsystem
//   bleiben BEWUSST lenient (`items: { type: 'object' }`, kein additionalProperties:false),
//   damit Feld-Drift die Action nicht wirft — validiert wird nur die Grundform.
const boolResult: JsonSchema = { type: 'boolean' }
const rowArray: JsonSchema = { type: 'array', items: { type: 'object' } }
const totalRows: JsonSchema = {
  type: 'object',
  required: ['total', 'rows'],
  properties: { total: { type: 'number' }, rows: { type: 'array', items: { type: 'object' } } },
  additionalProperties: false,
}
// dashboardCounts wird intern aus dem HTML zu GENAU diesen 7 Zahlen gebaut → strikt prüfbar.
const dashboardCountsResult: JsonSchema = {
  type: 'object',
  required: [
    'offeneRegistrierungen', 'offeneAnfragenGeraete', 'offeneVorbestellungenGeraete',
    'stornierteVorbestellungen', 'ueberfaelligeGeraete', 'offeneVorbestellungenMedien', 'ueberfaelligeMedien',
  ],
  properties: {
    offeneRegistrierungen: { type: 'number' },
    offeneAnfragenGeraete: { type: 'number' },
    offeneVorbestellungenGeraete: { type: 'number' },
    stornierteVorbestellungen: { type: 'number' },
    ueberfaelligeGeraete: { type: 'number' },
    offeneVorbestellungenMedien: { type: 'number' },
    ueberfaelligeMedien: { type: 'number' },
  },
  additionalProperties: false,
}
// loadCredentials liefert das Paar ODER null (keine Zugangsdaten hinterlegt).
const credentialsResult: JsonSchema = {
  anyOf: [
    { type: 'null' },
    {
      type: 'object',
      required: ['username', 'password'],
      properties: { username: { type: 'string' }, password: { type: 'string' } },
      additionalProperties: false,
    },
  ],
}

// Eingabe mit Antares-Server-Koordinaten (baseUrl ist user-konfiguriert pro Medienzentrum).
const baseInput = {
  type: 'object' as const,
  required: ['baseUrl', 'context'],
  properties: {
    baseUrl: { type: 'string' },
    context: { type: 'string' },
    page: { type: 'number' },
    rows: { type: 'number' },
    daysAhead: { type: 'number' },
  },
  additionalProperties: false,
}

export const manifest: PluginManifest = {
  id: 'antares',
  version: '1.0.0',
  label: 'Antares Medienzentrum',
  description: 'Read-only Verleih-Daten aus Antares CS (Entleiher, Mahnungen Geräte/Medien, Lizenzen).',
  category: 'business',
  icon: { text: '📦', color: '#10b981' },
  module: {
    enabledPath: 'pluginConfig.antares.enabled',
    legacyEnabledPath: 'antares.enabled',
  },
  capabilities: [...ANTARES_CAPABILITIES],
  // Baseline-Allowlist für den üblichen Provider; der konkret konfigurierte Host wird
  // zur Laufzeit aus den Settings ergänzt (resolveExtraAllowedHosts im Capability-Host).
  http: { allowedHosts: ['*.datenbank-bildungsmedien.net'] },
  credentials: [
    { key: 'username', label: 'Benutzername' },
    { key: 'password', label: 'Passwort', secret: true },
  ],
  actions: [
    { id: 'antares.check', label: 'Verbindung testen', requiredCapabilities: ['http.fetch', 'secrets'], inputSchema: baseInput, outputSchema: boolResult },
    { id: 'antares.dashboardCounts', requiredCapabilities: ['http.fetch', 'secrets'], inputSchema: baseInput, outputSchema: dashboardCountsResult },
    { id: 'antares.listOffeneRegistrierungen', requiredCapabilities: ['http.fetch', 'secrets'], inputSchema: baseInput, outputSchema: rowArray },
    { id: 'antares.listMahnungenGeraete', requiredCapabilities: ['http.fetch', 'secrets'], inputSchema: baseInput, isTrigger: true, outputSchema: totalRows },
    { id: 'antares.listMahnungenMedien', requiredCapabilities: ['http.fetch', 'secrets'], inputSchema: baseInput, isTrigger: true, outputSchema: totalRows },
    { id: 'antares.listAusgabeliste', requiredCapabilities: ['http.fetch', 'secrets'], inputSchema: baseInput, outputSchema: totalRows },
    { id: 'antares.listLizenzenAblauf', requiredCapabilities: ['http.fetch', 'secrets'], inputSchema: baseInput, outputSchema: rowArray },
    { id: 'antares.listEntleiher', requiredCapabilities: ['http.fetch', 'secrets'], inputSchema: baseInput, outputSchema: totalRows },
    {
      id: 'antares.saveCredentials',
      requiredCapabilities: ['secrets'],
      isWrite: true,
      inputSchema: {
        type: 'object',
        required: ['username', 'password'],
        properties: { username: { type: 'string' }, password: { type: 'string' } },
        additionalProperties: false,
      },
      outputSchema: boolResult,
    },
    { id: 'antares.loadCredentials', requiredCapabilities: ['secrets'], outputSchema: credentialsResult },
  ],
  // Workflow-Canvas-Trigger (vorher statisch im Kern-Registry). Feuert bei neuer überfälliger
  // Rückgabe; der generische Text-Trigger-Executor im Runner gibt den vorformatierten Seed-Text aus.
  workflowActions: [
    {
      id: 'antares.mahnung',
      moduleId: 'antares',
      moduleLabel: 'Antares',
      featureGate: null,
      label: 'Überfällige Rückgabe (Auslöser)',
      description:
        'Startpunkt: eine neue überfällige Rückgabe aus Antares (Mahnung). Gibt Leihnr, Titel, Entleiher, Schule, Rückgabedatum und - falls vorhanden - die E-Mail-Adresse aus.',
      isTrigger: true,
      inputs: [],
      outputs: [
        { id: 'text', label: 'Mahnung', kind: 'text' },
        { id: 'email', label: 'Kontakt', kind: 'email' },
      ],
      privacy: { containsPersonalData: true, requiresCredential: true },
    },
  ],
  privacy: { containsPersonalData: true, localOnly: true },
}

export default manifest
