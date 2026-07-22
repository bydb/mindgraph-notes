// WordPress-Plugin — Manifest (rein serialisierbar). Herausgelöst aus der edoobox-Marketing-
// Vertikale (Paket 3 der Modul-Entflechtung): Publishing ist eigenständig nutzbar (Editor →
// „Zu WordPress veröffentlichen") und wird vom edoobox-Marketing-Tab nur MITBENUTZT (via
// wordpressServiceBridge). Eigenes Modul-Gate — unabhängig von mz-suite.

import type { PluginManifest, JsonSchema } from '@mindgraph/plugin-api'

/** as const → bindet das Capability-Tupel für definePluginMain im Main-Entry. */
export const WORDPRESS_CAPABILITIES = ['http.fetch', 'secrets'] as const

const boolResult: JsonSchema = { type: 'boolean' }
const str: JsonSchema = { type: 'string' }
const num: JsonSchema = { type: 'number' }

/** Envelope-Form { success, ...felder?, error? } — wie bei den edoobox-Actions. */
const envelope = (props: Record<string, JsonSchema>): JsonSchema => ({
  type: 'object',
  required: ['success'],
  properties: { success: { type: 'boolean' }, error: str, ...props },
  additionalProperties: false,
})

const checkEnvelope = envelope({ userName: str })
const publishEnvelope = envelope({ postId: num, postUrl: str, status: str })
const uploadEnvelope = envelope({ mediaId: num, imageUrl: str })

// loadCredentials liefert das App-Passwort ODER null (keins hinterlegt).
const credentialsResult: JsonSchema = {
  anyOf: [
    { type: 'null' },
    {
      type: 'object',
      required: ['wpAppPassword'],
      properties: { wpAppPassword: { type: 'string' } },
      additionalProperties: false,
    },
  ],
}

// Ziel-Koordinaten (Site-URL + Benutzer sind user-konfiguriert, pluginConfig.wordpress).
const siteInput = {
  siteUrl: { type: 'string' } as JsonSchema,
  username: { type: 'string' } as JsonSchema,
}

export const manifest: PluginManifest = {
  manifestVersion: 2,
  id: 'wordpress',
  version: '1.0.0',
  label: 'WordPress',
  description: 'Notizen und Inhalte als Blog-Posts zu WordPress veröffentlichen (REST API, App-Passwort).',
  category: 'business',
  apiVersion: '^0.2.0',
  minAppVersion: '0.8.14',
  author: { name: 'Jochen Leeder', url: 'https://mindgraph-notes.de' },
  entrypoints: { main: 'main.js', renderer: 'renderer.js' },
  icon: { text: 'W', color: '#21759b' },
  module: {
    enabledPath: 'pluginConfig.wordpress.enabled',
  },
  capabilities: [...WORDPRESS_CAPABILITIES],
  // Keine statische Allowlist: der konfigurierte WordPress-Host (pluginConfig.wordpress.baseUrl)
  // wird zur Laufzeit ergänzt (resolveExtraAllowedHosts, generischer baseUrl-Zweig).
  http: { allowedHosts: [] },
  credentials: [
    { key: 'wpAppPassword', label: 'WordPress App-Passwort', secret: true },
  ],
  actions: [
    {
      id: 'wordpress.saveCredentials',
      requiredCapabilities: ['secrets'],
      isWrite: true,
      inputSchema: {
        type: 'object',
        required: ['appPassword'],
        properties: { appPassword: { type: 'string' } },
        additionalProperties: false,
      },
      outputSchema: boolResult,
    },
    {
      id: 'wordpress.loadCredentials',
      requiredCapabilities: ['secrets'],
      outputSchema: credentialsResult,
    },
    {
      id: 'wordpress.check',
      label: 'Verbindung testen',
      requiredCapabilities: ['http.fetch', 'secrets'],
      inputSchema: {
        type: 'object',
        required: ['siteUrl', 'username'],
        properties: { ...siteInput },
        additionalProperties: false,
      },
      outputSchema: checkEnvelope,
    },
    {
      id: 'wordpress.publishPost',
      requiredCapabilities: ['http.fetch', 'secrets'],
      isWrite: true,
      inputSchema: {
        type: 'object',
        required: ['siteUrl', 'username', 'title', 'content', 'status'],
        properties: {
          ...siteInput,
          title: { type: 'string' },
          content: { type: 'string' },
          status: { type: 'string' },
          featuredMediaId: { type: 'number' },
        },
        additionalProperties: false,
      },
      outputSchema: publishEnvelope,
    },
    {
      id: 'wordpress.uploadImage',
      requiredCapabilities: ['http.fetch', 'secrets'],
      isWrite: true,
      inputSchema: {
        type: 'object',
        required: ['siteUrl', 'username', 'imageBase64', 'fileName'],
        properties: {
          ...siteInput,
          imageBase64: { type: 'string' },
          fileName: { type: 'string' },
          caption: { type: 'string' },
        },
        additionalProperties: false,
      },
      outputSchema: uploadEnvelope,
    },
  ],
  privacy: { containsPersonalData: false },
}

export default manifest
