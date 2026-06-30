// Plugin-Katalog-Fetcher (A3-Voll, Discovery). Lädt die zentrale catalog.json (Obsidian-Muster:
// EINE Datei im zentralen `mindgraph-plugins`-Repo) host-allowlisted + size-capped + schema-validiert.
//
// UNSIGNIERT — bewusst: der Katalog ist reine Discovery. Vertrauen wird beim Install gegen
// OFFICIAL_KEYS erzwungen (Signaturprüfung in installAndActivate), nicht beim Katalog-Laden. Ein
// manipulierter Katalog kann also keinen Schadcode installieren, nur Listing/Beschreibungen verfälschen.
// `fetch` ist injizierbar → ohne Netz testbar. Kein Electron-Import → als pure Logik unit-testbar.

import { validateCatalog, validateCatalogSemantics } from '@mindgraph/plugin-api/validation'
import type { CatalogDocument, CatalogEntry } from '@mindgraph/plugin-api'
import { ARTIFACT_LIMITS, ArtifactError } from './artifact/limits'
import { downloadCapped, parseRepoRef, type FetchLike } from './download'

/** Offizieller Katalog: EINE Datei im zentralen `mindgraph-plugins`-Repo (raw.githubusercontent.com,
 *  bereits in der Download-Host-Allowlist via `*.githubusercontent.com`). */
export const CATALOG_URL = 'https://raw.githubusercontent.com/bydb/mindgraph-plugins/main/catalog.json'

/** catalog.json ist klein — eigener harter Cap statt der 100-MiB-Artefaktgrenze. */
const CATALOG_MAX_BYTES = 512 * 1024

/**
 * Dev-Override (NUR in ungepackten Builds) auf einen lokalen/Test-Katalog; sonst der offizielle URL.
 * `isPackaged` kommt vom Aufrufer (index.ts: `app.isPackaged`) — kein Electron-Import hier.
 */
export function resolveCatalogUrl(isPackaged: boolean): string {
  const override = process.env.MINDGRAPH_PLUGIN_CATALOG_URL
  if (!isPackaged && override) return override
  return CATALOG_URL
}

/**
 * Lädt + validiert den Katalog → Liste der Einträge. Wirft `ArtifactError` bei Netz-/Schema-Fehlern
 * (`download-*`/`rate-limited`/`archive-too-large`/`catalog-invalid`). Einträge mit ungültigem
 * `owner/repo` werden ÜBERSPRUNGEN (geloggt) statt den ganzen Katalog zu kippen.
 */
export async function fetchCatalog(
  url: string = CATALOG_URL,
  fetchImpl: FetchLike = fetch
): Promise<CatalogEntry[]> {
  const buf = await downloadCapped(
    url,
    { ...ARTIFACT_LIMITS, maxArchiveBytes: CATALOG_MAX_BYTES },
    fetchImpl
  )

  let parsed: unknown
  try {
    parsed = JSON.parse(buf.toString('utf8'))
  } catch {
    throw new ArtifactError('catalog-invalid', 'catalog.json ist kein gültiges JSON')
  }

  const schema = validateCatalog(parsed)
  if (!schema.valid) {
    throw new ArtifactError('catalog-invalid', `Katalog ungültig: ${schema.errors.join('; ')}`)
  }
  const doc = parsed as CatalogDocument
  const sem = validateCatalogSemantics(doc)
  if (!sem.valid) {
    throw new ArtifactError('catalog-invalid', `Katalog-Semantik ungültig: ${sem.errors.join('; ')}`)
  }

  // Repo-Härtung: nur Einträge mit gültigem owner/repo behalten (single-sourced über parseRepoRef).
  const out: CatalogEntry[] = []
  for (const entry of doc.plugins) {
    try {
      parseRepoRef(entry.repo)
      out.push(entry)
    } catch {
      console.warn(`[plugin:catalog] Eintrag '${entry.id}' hat ungültiges repo '${entry.repo}' — übersprungen`)
    }
  }
  return out
}
