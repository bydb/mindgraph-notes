// Antares-Plugin — Manifest (rein serialisierbar). Erste echte Migration einer Spaghetti-
// Verdrahtung in eine Vertikale. Read-only Medienzentren-Verleih. Siehe docs/plugin-system-plan.md.

import type { PluginManifest } from '../../shared/plugins/manifest'

/** as const → bindet das Capability-Tupel für definePluginMain im Main-Entry. */
export const ANTARES_CAPABILITIES = ['http.fetch', 'secrets'] as const

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
  capabilities: [...ANTARES_CAPABILITIES],
  // Baseline-Allowlist für den üblichen Provider; der konkret konfigurierte Host wird
  // zur Laufzeit aus den Settings ergänzt (resolveExtraAllowedHosts im Capability-Host).
  http: { allowedHosts: ['*.datenbank-bildungsmedien.net'] },
  credentials: [
    { key: 'username', label: 'Benutzername' },
    { key: 'password', label: 'Passwort', secret: true },
  ],
  actions: [
    { id: 'antares.check', label: 'Verbindung testen', requiredCapabilities: ['http.fetch', 'secrets'], inputSchema: baseInput },
    { id: 'antares.dashboardCounts', requiredCapabilities: ['http.fetch', 'secrets'], inputSchema: baseInput },
    { id: 'antares.listOffeneRegistrierungen', requiredCapabilities: ['http.fetch', 'secrets'], inputSchema: baseInput },
    { id: 'antares.listMahnungenGeraete', requiredCapabilities: ['http.fetch', 'secrets'], inputSchema: baseInput, isTrigger: true },
    { id: 'antares.listMahnungenMedien', requiredCapabilities: ['http.fetch', 'secrets'], inputSchema: baseInput, isTrigger: true },
    { id: 'antares.listAusgabeliste', requiredCapabilities: ['http.fetch', 'secrets'], inputSchema: baseInput },
    { id: 'antares.listLizenzenAblauf', requiredCapabilities: ['http.fetch', 'secrets'], inputSchema: baseInput },
    { id: 'antares.listEntleiher', requiredCapabilities: ['http.fetch', 'secrets'], inputSchema: baseInput },
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
    },
    { id: 'antares.loadCredentials', requiredCapabilities: ['secrets'] },
  ],
  privacy: { containsPersonalData: true, localOnly: true },
}

export default manifest
