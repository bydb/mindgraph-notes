// Demo-Plugin — Architektur-Spike (Schritt 3). Beweist die Vertikale von Ende zu Ende:
// Manifest (rein) + Main-Entry (Code) + Renderer-Entry (Slot), gekoppelt nur über `id`.
// Kein Produkt-Feature — Vorlage + Testobjekt für die echten Migrationen (Antares zuerst).

import type { PluginManifest } from '../../shared/plugins/manifest'

/** as const bewahrt das Capability-Tupel für definePluginMain im Main-Entry. */
export const DEMO_CAPABILITIES = ['llm.generate'] as const

export const manifest: PluginManifest = {
  id: 'demo',
  version: '0.1.0',
  label: 'Demo-Plugin',
  description: 'Architektur-Spike für das Plugin-System (kein Produkt-Feature).',
  category: 'ai',
  icon: { text: '🧪', color: '#9b87f5' },
  capabilities: [...DEMO_CAPABILITIES],
  actions: [
    {
      // Reine Action ohne Capability — testet Schema-Validierung im Transport.
      id: 'demo.echo',
      label: 'Echo',
      requiredCapabilities: [],
      inputSchema: {
        type: 'object',
        required: ['text'],
        properties: { text: { type: 'string' } },
        additionalProperties: false,
      },
      outputSchema: {
        type: 'object',
        required: ['echo'],
        properties: { echo: { type: 'string' } },
        additionalProperties: false,
      },
    },
    {
      // Nutzt host.llm — testet Capability-gebundenen Host-Zugriff.
      id: 'demo.summarize',
      label: 'Zusammenfassen',
      requiredCapabilities: ['llm.generate'],
      inputSchema: {
        type: 'object',
        required: ['text'],
        properties: { text: { type: 'string' } },
        additionalProperties: false,
      },
    },
  ],
  ui: {
    dashboardWidget: { slot: 'dashboard.widgets', fromAction: 'demo.echo' },
  },
}

export default manifest
