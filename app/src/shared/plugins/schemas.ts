// Übergangs-Brücke (A0 · Schritt 1): die ajv-Validatoren leben jetzt auf dem Subpath
// @mindgraph/plugin-api/validation. Re-Export hält bestehende `shared/plugins/schemas`-Importe
// lauffähig, bis alle Konsumenten umgestellt sind (dann wird diese Datei gelöscht). NICHT neu nutzen.
export * from '@mindgraph/plugin-api/validation'
