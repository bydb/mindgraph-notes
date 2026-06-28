// @mindgraph/plugin-api/validation — ajv-gestützte Laufzeit-Validatoren (Subpath).
//
// Getrennt vom Haupt-Entry, damit nur Code, der wirklich validiert (Main-Registry,
// Renderer-Katalog), Ajv mitzieht. Die eigentlichen Validatoren (validateManifest,
// validateAgainst, PLUGIN_MANIFEST_SCHEMA) wandern im Folge-Commit dieses Schritts hierher.
export {}
