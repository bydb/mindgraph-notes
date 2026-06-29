// Main-Entry des Beispiel-Plugins (Main-only Template, A0/3).
//
// Regeln (siehe README): NUR `@mindgraph/plugin-api` importieren; KEINE Node-/Electron-Built-ins
// (der Build bricht sonst ab). Alle Host-Dienste kommen über `ctx.host` (capability-gated).
import { definePluginMain } from '@mindgraph/plugin-api'

export default definePluginMain(
  { id: 'example-plugin', capabilities: [] },
  ({ actions }) => {
    // Beispiel-Action; im Manifest unter `actions` deklariert.
    actions.register('example-plugin.ping', async () => ({ pong: true }))
  }
)
