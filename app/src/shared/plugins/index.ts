// Plugin-System — Barrel.
//
// Der öffentliche Vertrag (Manifest, Host, Entry, Workflow-Beiträge) lebt jetzt im
// Paket @mindgraph/plugin-api; die ajv-Validatoren auf dessen `/validation`-Subpath.
// App-intern bleiben hier nur die nicht-öffentlichen Teile: Lebenszyklus-State,
// das IPC-Wire-Format und die uiStore-Pfad-Mechanik des Modulschalters.
// Siehe docs/plugin-api-package-plan.md (A0 · Schritt 1).

export * from '@mindgraph/plugin-api'
export * from '@mindgraph/plugin-api/validation'

export * from './state'
export * from './transport'
export * from './moduleGate'
