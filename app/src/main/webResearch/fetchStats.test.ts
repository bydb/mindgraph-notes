// Codex F25: zwei App-Instanzen mit demselben Profil dürfen sich die Zählung nicht überschreiben.
// Eine echte zweite Instanz lässt sich hier nicht starten; nachgestellt wird ihr Schreibvorgang
// zwischen zwei Zählungen dieses Prozesses.

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { clearFetchStats, flushFetchStats, getFetchStatsSummary, noteFetchOutcome, setFetchStatsPathForTests } from './fetchStats'
import { emptyFetchStats, localDay, recordFetchStat } from '../../shared/webFetchStats'

let dir: string
let file: string

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mg-fetchstats-'))
  file = path.join(dir, 'web-fetch-stats.json')
  setFetchStatsPathForTests(file)
})

afterEach(async () => {
  setFetchStatsPathForTests(null)
  await fs.rm(dir, { recursive: true, force: true })
})

describe('fetchStats: mehrere Instanzen (Codex F25)', () => {
  it('liest vor jedem Schreiben frisch — der Eintrag einer anderen Instanz bleibt erhalten', async () => {
    noteFetchOutcome('chat', 'ok', 'a.de')
    await flushFetchStats()
    // „Andere Instanz“: liest, zählt und schreibt dieselbe Datei.
    const other = recordFetchStat(JSON.parse(await fs.readFile(file, 'utf-8')), { channel: 'agent', kind: 'http', host: 'douglas.de', day: localDay() })
    await fs.writeFile(file, JSON.stringify(other))
    noteFetchOutcome('chat', 'browser-only', 'bdkparfums.com')
    await flushFetchStats()
    const s = await getFetchStatsSummary()
    expect(s.chat).toEqual({ ok: 1, 'browser-only': 1 })
    expect(s.agent).toEqual({ http: 1 })
  })

  it('hinterlässt keine Temp-Dateien, auch bei vielen Zählungen hintereinander', async () => {
    for (let i = 0; i < 20; i++) noteFetchOutcome('chat', 'ok', `h${i}.de`)
    await flushFetchStats()
    expect((await getFetchStatsSummary()).chat.ok).toBe(20)
    expect((await fs.readdir(dir)).filter(f => f.endsWith('.tmp'))).toEqual([])
  })

  it('Löschen entfernt die Datei; danach ist die Zählung leer', async () => {
    await fs.writeFile(file, JSON.stringify(recordFetchStat(emptyFetchStats(), { channel: 'chat', kind: 'ok', host: 'a.de', day: localDay() })))
    await clearFetchStats()
    await expect(fs.access(file)).rejects.toThrow()
    expect((await getFetchStatsSummary()).since).toBeNull()
  })
})
