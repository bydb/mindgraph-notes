// Übergangs-Brücke (A0 · Schritt 1): die Manifest-Typen leben jetzt in @mindgraph/plugin-api.
// Dieser Re-Export hält bestehende `shared/plugins/manifest`-Importe lauffähig, bis alle
// Konsumenten auf das Paket umgestellt sind (dann wird diese Datei gelöscht). NICHT neu nutzen.
export * from '@mindgraph/plugin-api'
