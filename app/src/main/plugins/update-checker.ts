// A2 (docs/plugin-store-A2-plan.md, Baustein 8): Plugin-Update-Checker.
//
// READ-ONLY: vergleicht je installiertem Plugin (das `manifest.repo` deklariert) die installierte
// Version mit dem neuesten GitHub-Release. Lädt NICHTS — das eigentliche Update läuft user-ausgelöst
// über `plugin:installFromGithub`. Plugins ohne `repo` (oder mit nicht-github/ungültiger URL) werden
// still übersprungen; ein einzelner Fehlschlag (404/Netz/Rate-Limit) kippt nicht den ganzen Check.

import { isNewerVersion } from '@mindgraph/plugin-api/validation'
import { parseRepoUrl, resolveReleaseAsset, type FetchLike } from './download'

export interface InstalledPluginRef {
  id: string
  version: string
  repo?: string
}

export interface PluginUpdate {
  id: string
  repo: string // owner/repo
  current: string
  latest: string
  hasUpdate: boolean
}

export async function checkPluginUpdates(
  installed: readonly InstalledPluginRef[],
  fetchImpl: FetchLike = fetch
): Promise<PluginUpdate[]> {
  const out: PluginUpdate[] = []
  for (const p of installed) {
    if (!p.repo) continue // ohne Quell-Repo nicht prüfbar
    let ref
    try {
      ref = parseRepoUrl(p.repo)
    } catch {
      continue // nicht-github / ungültige Repo-URL → überspringen
    }
    try {
      const asset = await resolveReleaseAsset(ref, undefined, fetchImpl)
      out.push({
        id: p.id,
        repo: `${ref.owner}/${ref.repo}`,
        current: p.version,
        latest: asset.version,
        hasUpdate: isNewerVersion(asset.version, p.version),
      })
    } catch {
      // einzelnes Plugin scheitert → überspringen, Rest weiter prüfen
    }
  }
  return out
}
