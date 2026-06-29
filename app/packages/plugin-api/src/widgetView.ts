// Deklaratives Widget-Vokabular (v1) für externe Renderer-Plugins (A1 Renderer-Spike, Tier 1).
// ADR docs/plugin-renderer-widgets-plan.md §4.
//
// Das ist die EINZIGE Datenform, die der Host für ein externes Plugin-Widget rendert: REINE DATEN,
// keine Präsentation. Bewusst KEINE Felder `style`/`class`/`className`/`id`/`html`/`url`/`href`/`src`
// (I-D2) — der Host besitzt 100 % des Stylings, Plugin-Strings werden als React-Text-Nodes
// gerendert (auto-escaped, KEIN `dangerouslySetInnerHTML`). Reine Typen/Daten, React-frei.
import type { JsonSchema } from './manifest'

/** Status-Farbe analog zu 🔴🟢🔵 (renderer utils/noteKind). */
export type WidgetStatus = 'red' | 'green' | 'blue'

/** Eine Widget-Ansicht — diskriminierte Union über `kind`. */
export type WidgetView =
  | { kind: 'stats'; items: Array<{ label: string; value: string; trend?: 'up' | 'down' | 'flat' }> }
  | { kind: 'list'; items: Array<{ title: string; subtitle?: string; badge?: string; status?: WidgetStatus }> }
  | { kind: 'keyValue'; rows: Array<{ key: string; value: string }> }
  | { kind: 'progress'; value: number; max: number; label?: string }
  | { kind: 'badge'; text: string; status?: WidgetStatus }

/** Die v1-`kind`-Werte. */
export const WIDGET_VIEW_KINDS = ['stats', 'list', 'keyValue', 'progress', 'badge'] as const

const STATUS = { enum: ['red', 'green', 'blue'] }

/**
 * Ajv-Schema für {@link WidgetView}. STRIKT: `additionalProperties:false` überall, nur Daten-Felder,
 * mit strukturellen Limits (Längen/Item-Zahlen) — strukturelle Härtung zusätzlich zu den
 * host-erzwungenen Laufzeit-Limits (Tier-2/Increment 2). Eine `fromAction`, die ein Widget speist,
 * deklariert dieses Schema (oder eine Teilmenge) als `outputSchema`; der Host validiert dagegen.
 */
export const WIDGET_VIEW_SCHEMA: JsonSchema = {
  oneOf: [
    {
      type: 'object', required: ['kind', 'items'], additionalProperties: false,
      properties: {
        kind: { const: 'stats' },
        items: {
          type: 'array', maxItems: 12,
          items: {
            type: 'object', required: ['label', 'value'], additionalProperties: false,
            properties: {
              label: { type: 'string', maxLength: 80 },
              value: { type: 'string', maxLength: 80 },
              trend: { enum: ['up', 'down', 'flat'] },
            },
          },
        },
      },
    },
    {
      type: 'object', required: ['kind', 'items'], additionalProperties: false,
      properties: {
        kind: { const: 'list' },
        items: {
          type: 'array', maxItems: 50,
          items: {
            type: 'object', required: ['title'], additionalProperties: false,
            properties: {
              title: { type: 'string', maxLength: 200 },
              subtitle: { type: 'string', maxLength: 200 },
              badge: { type: 'string', maxLength: 40 },
              status: STATUS,
            },
          },
        },
      },
    },
    {
      type: 'object', required: ['kind', 'rows'], additionalProperties: false,
      properties: {
        kind: { const: 'keyValue' },
        rows: {
          type: 'array', maxItems: 50,
          items: {
            type: 'object', required: ['key', 'value'], additionalProperties: false,
            properties: { key: { type: 'string', maxLength: 80 }, value: { type: 'string', maxLength: 200 } },
          },
        },
      },
    },
    {
      type: 'object', required: ['kind', 'value', 'max'], additionalProperties: false,
      properties: {
        kind: { const: 'progress' },
        value: { type: 'number' },
        max: { type: 'number', exclusiveMinimum: 0 },
        label: { type: 'string', maxLength: 80 },
      },
    },
    {
      type: 'object', required: ['kind', 'text'], additionalProperties: false,
      properties: { kind: { const: 'badge' }, text: { type: 'string', maxLength: 80 }, status: STATUS },
    },
  ],
}
