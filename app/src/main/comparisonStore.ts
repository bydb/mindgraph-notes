// Ablage der Vergleichskampagnen (docs/comparison-mode-plan.md, Abschnitt 8).
//
// `userData/comparisons/<hash(vaultPath)>.json`, nicht im Vault — gleiche Begründung wie
// beim Tätigkeitsprotokoll: Über iCloud oder Dropbox liefe dieselbe Kampagne sonst auf
// mehreren Geräten und die Fallzahlen verdoppelten sich.
//
// Die Regeln der Kampagne werden HIER durchgesetzt, nicht in der Oberfläche: Der
// Renderer schickt Absichten („Fall anlegen", „abschließen"), der Main zieht den Weg,
// wendet die reinen Modellfunktionen an und schreibt das Ergebnis. Damit kann kein
// Renderer einen Fall umteilen oder löschen — und genau das entscheidet später, ob die
// Zahlen etwas wert sind.

import { app } from 'electron'
import { createHash, randomInt } from 'crypto'
import { promises as fs } from 'fs'
import path from 'path'
import type { Campaign, ComparisonCase } from '../shared/comparison/types'
import { isCampaign, isComparisonCase } from '../shared/comparison/validation'

export interface ComparisonData {
  campaigns: Campaign[]
  cases: ComparisonCase[]
}

const EMPTY: ComparisonData = { campaigns: [], cases: [] }

function storeFile(vaultPath: string): string {
  const key = createHash('sha256').update(vaultPath).digest('hex').slice(0, 16)
  return path.join(app.getPath('userData'), 'comparisons', `${key}.json`)
}

// Eine Schreiboperation je Datei gleichzeitig (wie im Tätigkeitsprotokoll) — sonst
// überschreiben zwei Aktionen einander und ein Fall verschwindet.
const queues = new Map<string, Promise<unknown>>()

function enqueue<T>(file: string, job: () => Promise<T>): Promise<T> {
  const previous = queues.get(file) ?? Promise.resolve()
  const next = previous.catch(() => undefined).then(job)
  queues.set(file, next.catch(() => undefined))
  return next
}

async function readData(file: string): Promise<ComparisonData> {
  try {
    const parsed = JSON.parse(await fs.readFile(file, 'utf-8')) as Record<string, unknown>
    const campaigns = Array.isArray(parsed.campaigns) ? parsed.campaigns.filter(isCampaign) : []
    const cases = Array.isArray(parsed.cases) ? parsed.cases.filter(isComparisonCase) : []
    return { campaigns, cases }
  } catch {
    return { campaigns: [], cases: [] }
  }
}

async function writeAtomic(file: string, data: ComparisonData): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf-8')
  await fs.rename(tmp, file)
}

export async function loadComparisons(vaultPath: string): Promise<ComparisonData> {
  if (!vaultPath) return EMPTY
  const file = storeFile(vaultPath)
  return enqueue(file, () => readData(file))
}

/**
 * Liest, wendet `change` an und schreibt zurück — alles innerhalb derselben Warteschlange.
 * Wirft `change` einen Fehler (verbotener Übergang), bleibt die Datei unverändert.
 */
export async function updateComparisons(
  vaultPath: string,
  change: (data: ComparisonData) => ComparisonData
): Promise<ComparisonData> {
  if (!vaultPath) throw new Error('Kein Vault angegeben.')
  const file = storeFile(vaultPath)
  return enqueue(file, async () => {
    const vorher = await readData(file)
    const nachher = change(vorher)
    await writeAtomic(file, nachher)
    return nachher
  })
}

/**
 * Zufallsquelle für die Zuteilung — kryptografisch, Main-seitig.
 *
 * Bewusst NICHT aus dem Renderer: Wer den Zufall liefert, bestimmt die Zuteilung. Und
 * bewusst ohne gespeicherten Startwert, damit sich aus der Datei nicht die nächste
 * Ziehung berechnen lässt.
 */
export function mainRandom(): number {
  return randomInt(0, 2 ** 31) / 2 ** 31
}
