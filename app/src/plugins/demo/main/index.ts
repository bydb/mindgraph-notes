// Demo-Plugin — Main-Entry (der ausführbare Teil im Main-Prozess).
//
// Importiert NIE rohes fs/net/electron — nur den getypten Host. Der Host zeigt hier
// genau `llm` + `log` (aus DEMO_CAPABILITIES); host.vault o.Ä. existiert nicht (Compile-Fehler).
// Siehe docs/plugin-system-plan.md, Entscheidungen #3, #8, #15.

import { definePluginMain } from '@mindgraph/plugin-api'
import { DEMO_CAPABILITIES, manifest } from '../manifest'

export default definePluginMain(
  { id: manifest.id, capabilities: DEMO_CAPABILITIES },
  ({ host, actions }) => {
    host.log('demo: register')

    actions.register('demo.echo', async (payload) => {
      const { text } = payload as { text: string }
      return { echo: text }
    })

    actions.register('demo.summarize', async (payload) => {
      const { text } = payload as { text: string }
      return host.llm.generate(`Fasse in einem Satz zusammen:\n${text}`, {
        module: 'mail-summary',
      })
    })
  },
  {
    async stop() {
      // Nichts zu räumen — Demo hält keine Ressourcen.
    },
  }
)
