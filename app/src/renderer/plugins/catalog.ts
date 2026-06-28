// Buildzeit-Katalog der reinen Plugin-Manifeste für den Renderer.
//
// A-pre Schritt 2: Modul-Metadaten und Gates kommen aus den Manifesten statt aus einer
// handgepflegten Liste im Kern. Beim Runtime-Loader (A1) wird nur die Quelle dieses Katalogs
// ausgetauscht; seine Konsumenten bleiben unverändert.

import type { PluginManifest } from '@mindgraph/plugin-api'

const modules = import.meta.glob<{ default?: PluginManifest; manifest?: PluginManifest }>(
  '../../plugins/*/manifest.ts',
  { eager: true }
)

export const pluginManifests: readonly PluginManifest[] = Object.values(modules)
  .map((mod) => mod.default ?? mod.manifest)
  .filter((manifest): manifest is PluginManifest => !!manifest)

