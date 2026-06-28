// reMarkable-Plugin — Manifest (rein serialisierbar). Stresstest-Vertikale: erstes Plugin
// mit echtem Schreibpfad (vault.write) und privilegierten Geräte-/PDF-Capabilities.
// Gerät = USB-Webinterface 10.11.99.1 (host.device, allowlisted). Siehe docs/plugin-system-plan.md.

import type { PluginManifest, JsonSchema } from '../../shared/plugins/manifest'

/** as const → bindet das Capability-Tupel für definePluginMain im Main-Entry. */
export const REMARKABLE_CAPABILITIES = [
  'vault.read',
  'vault.write',
  'device.usb',
  'pdf.render',
  'pdf.optimize',
] as const

// — Ausgabe-Schemas (Defense-in-Depth, Envelope-Ebene). Die Actions liefern `{success, …}`-
//   bzw. Status-Objekte mit je nach Erfolg/Fehler unterschiedlichen optionalen Feldern (teils
//   `undefined`). Geprüft werden daher nur die IMMER vorhandenen Felder strikt; der Rest bleibt
//   lenient (`additionalProperties: true`) — ein enumeriertes, aber undefined-wertiges Feld
//   würde ajv sonst fälschlich werfen.
const successEnvelope: JsonSchema = {
  type: 'object',
  required: ['success'],
  properties: { success: { type: 'boolean' } },
  additionalProperties: true,
}
const usbCheckResult: JsonSchema = {
  type: 'object',
  required: ['connected', 'mode'],
  properties: { connected: { type: 'boolean' }, mode: { type: 'string' } },
  additionalProperties: true,
}
const documentsResult: JsonSchema = {
  type: 'object',
  required: ['documents'],
  properties: { documents: { type: 'array', items: { type: 'object' } } },
  additionalProperties: true,
}

const pdfInput = {
  type: 'object' as const,
  required: ['relativePdfPath'],
  properties: { relativePdfPath: { type: 'string' } },
  additionalProperties: false,
}

export const manifest: PluginManifest = {
  id: 'remarkable',
  version: '1.0.0',
  label: 'reMarkable',
  description: 'reMarkable-Tablet über USB: Dokumente browsen/importieren, PDF exportieren, optimieren, als Buch umbrechen.',
  category: 'devices',
  icon: { text: '✎', color: '#111827' },
  capabilities: [...REMARKABLE_CAPABILITIES],
  // Statisches Gerät: das USB-Webinterface. Kein user-konfigurierter Host.
  http: { allowedHosts: ['10.11.99.1'] },
  actions: [
    { id: 'remarkable.usbCheck', label: 'USB-Verbindung prüfen', requiredCapabilities: ['device.usb'], outputSchema: usbCheckResult },
    { id: 'remarkable.usbDebugInfo', label: 'USB-Diagnose', requiredCapabilities: ['device.usb'], outputSchema: successEnvelope },
    {
      id: 'remarkable.listDocuments',
      label: 'Dokumente auflisten',
      requiredCapabilities: ['device.usb'],
      inputSchema: {
        type: 'object',
        properties: { folderId: { type: 'string' } },
        additionalProperties: false,
      },
      outputSchema: documentsResult,
    },
    {
      id: 'remarkable.download',
      label: 'Dokument importieren',
      requiredCapabilities: ['device.usb', 'vault.write'],
      isWrite: true,
      inputSchema: {
        type: 'object',
        required: ['id', 'name'],
        properties: { id: { type: 'string' }, name: { type: 'string' } },
        additionalProperties: false,
      },
      outputSchema: successEnvelope,
    },
    {
      id: 'remarkable.upload',
      label: 'PDF exportieren',
      requiredCapabilities: ['device.usb', 'vault.read'],
      inputSchema: pdfInput,
      outputSchema: successEnvelope,
    },
    {
      id: 'remarkable.optimize',
      label: 'PDF optimieren',
      requiredCapabilities: ['vault.read', 'vault.write', 'pdf.optimize'],
      isWrite: true,
      inputSchema: pdfInput,
      outputSchema: successEnvelope,
    },
    {
      id: 'remarkable.bookify',
      label: 'PDF als Buch umbrechen',
      requiredCapabilities: ['vault.read', 'vault.write', 'pdf.render'],
      isWrite: true,
      inputSchema: pdfInput,
      outputSchema: successEnvelope,
    },
  ],
  privacy: { localOnly: true },
}

export default manifest
