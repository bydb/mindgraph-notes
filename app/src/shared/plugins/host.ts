// Übergangs-Brücke (A0 · Schritt 1): die Capability-Host-Interfaces leben jetzt in
// @mindgraph/plugin-api. Re-Export hält bestehende `shared/plugins/host`-Importe lauffähig,
// bis alle Konsumenten umgestellt sind (dann wird diese Datei gelöscht). NICHT neu nutzen.
export * from '@mindgraph/plugin-api'
