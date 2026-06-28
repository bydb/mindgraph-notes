// Antares-Plugin — Main-Entry. Registriert die read-only Verleih-Actions.
//
// Importiert NIE rohes fs/net/electron: Netzwerk läuft über host.http.fetch (allowedHosts-
// Gate), Credentials über host.secrets (safeStorage, pro Plugin genamespacet). Der konfigurierte
// Antares-Host wird vom Capital-Host dynamisch zur Allowlist ergänzt (user-konfiguriert).

import { definePluginMain } from '@mindgraph/plugin-api'
import { AntaresService } from '../service'
import { ANTARES_CAPABILITIES, manifest } from '../manifest'

interface BasePayload {
  baseUrl: string
  context: string
  page?: number
  rows?: number
  daysAhead?: number
}

export default definePluginMain(
  { id: manifest.id, capabilities: ANTARES_CAPABILITIES },
  ({ host, actions }) => {
    host.log('register')

    // Baut einen authentifizierten Service aus Payload-Koordinaten + hinterlegten Credentials.
    const makeService = async (payload: unknown): Promise<AntaresService> => {
      const { baseUrl, context } = payload as BasePayload
      const username = await host.secrets.get('username')
      const password = await host.secrets.get('password')
      if (!username || !password) throw new Error('Keine Antares-Zugangsdaten hinterlegt')
      return new AntaresService(baseUrl, username, password, context, host.http.fetch)
    }

    actions.register('antares.check', async (p) => (await makeService(p)).checkConnection())
    actions.register('antares.dashboardCounts', async (p) => (await makeService(p)).fetchDashboardCounts())
    actions.register('antares.listOffeneRegistrierungen', async (p) =>
      (await makeService(p)).listOffeneRegistrierungen())
    actions.register('antares.listMahnungenGeraete', async (p) => (await makeService(p)).listMahnungenGeraete())
    actions.register('antares.listMahnungenMedien', async (p) => (await makeService(p)).listMahnungenMedien())
    actions.register('antares.listAusgabeliste', async (p) => (await makeService(p)).listAusgabeliste())
    actions.register('antares.listLizenzenAblauf', async (p) => {
      const { daysAhead } = p as BasePayload
      return (await makeService(p)).listLizenzenAblauf(daysAhead ?? 365)
    })
    actions.register('antares.listEntleiher', async (p) => {
      const { page, rows } = p as BasePayload
      return (await makeService(p)).listEntleiher({ page, rows })
    })

    actions.register('antares.saveCredentials', async (p) => {
      const { username, password } = p as { username: string; password: string }
      await host.secrets.set('username', username)
      await host.secrets.set('password', password)
      return true
    })
    actions.register('antares.loadCredentials', async () => {
      const username = await host.secrets.get('username')
      const password = await host.secrets.get('password')
      if (!username || !password) return null
      return { username, password }
    })
  }
)
