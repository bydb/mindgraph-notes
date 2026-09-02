// Ablage der Modell-Aufrufe auf Platte.
//
// Was hier leise schiefgehen würde: Ein Aufruf wird angehängt, während gerade
// verdichtet wird — ohne Warteschlange überschreibt das Verdichten die frische Zeile.
// Oder eine halb geschriebene Zeile macht die ganze Datei unlesbar und ein Jahr
// Geschichte ist weg. Beides fiele erst auf, wenn die Kurve eine Lücke hat.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'

let userDataDir = ''
vi.mock('electron', () => ({ app: { getPath: () => userDataDir } }))

import {
  appendTelemetryRun, readTelemetryRange, ledgerFile, resetTelemetryLedgerForTests, COMPACT_EVERY
} from './telemetryLedger'
import { TELEMETRY_RETENTION_DAYS, TELEMETRY_MAX_RUNS, type LlmRunMetrics } from '../../shared/llmTelemetry'

const VAULT = '/tmp/ein-vault'
const NOW = 1_800_000_000_000
const DAY = 86_400_000

function run(partial: Partial<LlmRunMetrics> = {}): LlmRunMetrics {
  return { at: NOW, module: 'chat', model: 'm', backend: 'ollama', wallMs: 1000, ...partial }
}

beforeEach(async () => {
  userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mg-telemetry-'))
  resetTelemetryLedgerForTests()
})

afterEach(async () => {
  await fs.rm(userDataDir, { recursive: true, force: true })
})

describe('appendTelemetryRun', () => {
  it('liegt außerhalb des Vaults, je Vault eine Datei, ohne den Pfad preiszugeben', async () => {
    await appendTelemetryRun(VAULT, run(), NOW)
    await appendTelemetryRun('/tmp/anderer-vault', run(), NOW)
    const files = await fs.readdir(path.join(userDataDir, 'telemetry'))
    expect(files).toHaveLength(2)
    for (const name of files) {
      expect(name).toMatch(/^[0-9a-f]{16}\.jsonl$/)
      expect(name).not.toContain('vault')
    }
    expect(ledgerFile(VAULT).startsWith(userDataDir)).toBe(true)
    expect(ledgerFile(VAULT).startsWith(VAULT)).toBe(false)
  })

  it('verliert bei gleichzeitigen Aufrufen keinen Eintrag — auch nicht den, der mit dem Verdichten zusammenfällt', async () => {
    const runs = Array.from({ length: 40 }, (_, i) => run({ at: NOW + i }))
    await Promise.all(runs.map(r => appendTelemetryRun(VAULT, r, NOW)))
    const gelesen = await readTelemetryRange(VAULT, { from: NOW, to: NOW + 1000 }, NOW)
    expect(gelesen).toHaveLength(40)
    expect(gelesen.map(r => r.at)).toEqual(runs.map(r => r.at))
  })

  it('behält die Lauf-Kennung und die Kostenfelder unverändert', async () => {
    const r = run({ runId: 'run-7', backend: 'openrouter', costUsd: 0.0012, costSource: 'reported', promptTokens: 900, outputTokens: 120 })
    await appendTelemetryRun(VAULT, r, NOW)
    const [gelesen] = await readTelemetryRange(VAULT, { from: NOW - 1, to: NOW + 1 }, NOW)
    expect(gelesen).toEqual(r)
  })

  it('überlebt eine halb geschriebene letzte Zeile — nur sie geht verloren', async () => {
    await appendTelemetryRun(VAULT, run({ at: NOW }), NOW)
    await appendTelemetryRun(VAULT, run({ at: NOW + 1 }), NOW)
    // Absturz mitten im Schreiben: Der Umbruch steht (er geht dem Eintrag voraus),
    // die Zeile selbst bricht ab.
    await fs.appendFile(ledgerFile(VAULT), '\n{"at":' + (NOW + 2) + ',"module":"ch', 'utf-8')
    const gelesen = await readTelemetryRange(VAULT, { from: NOW, to: NOW + 10 }, NOW)
    expect(gelesen.map(r => r.at)).toEqual([NOW, NOW + 1])
    // Und danach lässt sich weiter anhängen, ohne dass der Torso stört.
    await appendTelemetryRun(VAULT, run({ at: NOW + 3 }), NOW)
    const danach = await readTelemetryRange(VAULT, { from: NOW, to: NOW + 10 }, NOW)
    expect(danach.map(r => r.at)).toEqual([NOW, NOW + 1, NOW + 3])
  })

  it('verwirft von Hand verfälschte Zeilen mit NaN oder falschem Backend statt sie zu summieren', async () => {
    await appendTelemetryRun(VAULT, run({ at: NOW }), NOW)
    await fs.appendFile(ledgerFile(VAULT),
      JSON.stringify({ at: NOW + 1, module: 'chat', model: 'm', backend: 'ollama', wallMs: 'schnell' }) + '\n' +
      JSON.stringify({ at: NOW + 2, module: 'chat', model: 'm', backend: 'wolke', wallMs: 5 }) + '\n' +
      JSON.stringify({ at: NOW + 3, module: 'chat', model: 'm', backend: 'ollama', wallMs: 5, costUsd: -1 }) + '\n',
      'utf-8')
    const gelesen = await readTelemetryRange(VAULT, { from: NOW, to: NOW + 10 }, NOW)
    expect(gelesen.map(r => r.at)).toEqual([NOW])
  })

  it('wirft beim Verdichten Einträge älter als die Aufbewahrungsfrist weg', async () => {
    const alt = run({ at: NOW - (TELEMETRY_RETENTION_DAYS + 1) * DAY })
    const frisch = run({ at: NOW - DAY })
    await appendTelemetryRun(VAULT, alt, NOW - TELEMETRY_RETENTION_DAYS * DAY)
    await appendTelemetryRun(VAULT, frisch, NOW)
    // Neuer Prozessstart → nächstes Anhängen verdichtet.
    resetTelemetryLedgerForTests()
    await appendTelemetryRun(VAULT, run({ at: NOW }), NOW)
    const raw = await fs.readFile(ledgerFile(VAULT), 'utf-8')
    const zeilen = raw.trim().split('\n')
    expect(zeilen).toHaveLength(2)
    expect(raw).not.toContain(String(alt.at))
  })

  it('zeigt einen abgelaufenen Eintrag auch vor der nächsten Verdichtung nicht mehr an', async () => {
    const alt = run({ at: NOW - (TELEMETRY_RETENTION_DAYS + 1) * DAY })
    await appendTelemetryRun(VAULT, alt, alt.at)
    const gelesen = await readTelemetryRange(VAULT, { from: 0, to: NOW + 1 }, NOW)
    expect(gelesen).toHaveLength(0)
  })

  it('hält die Obergrenze und behält die jüngsten Einträge', async () => {
    // Datei direkt füllen — 50 000 einzelne Anhänge wären hier nur langsam, nicht lehrreich.
    const viele = Array.from({ length: TELEMETRY_MAX_RUNS + 5 }, (_, i) => JSON.stringify(run({ at: NOW - TELEMETRY_MAX_RUNS - 5 + i })))
    await fs.mkdir(path.dirname(ledgerFile(VAULT)), { recursive: true })
    await fs.writeFile(ledgerFile(VAULT), viele.join('\n') + '\n', 'utf-8')
    await appendTelemetryRun(VAULT, run({ at: NOW }), NOW)
    const gelesen = await readTelemetryRange(VAULT, { from: 0, to: NOW + 1 }, NOW)
    expect(gelesen).toHaveLength(TELEMETRY_MAX_RUNS)
    expect(gelesen[gelesen.length - 1].at).toBe(NOW)
    expect(gelesen[0].at).toBe(NOW - TELEMETRY_MAX_RUNS + 1)
  })

  it('hängt zwischen zwei Verdichtungen nur an, statt die Datei neu zu schreiben', async () => {
    await appendTelemetryRun(VAULT, run({ at: NOW }), NOW)
    // Eine ungültige Zeile bleibt zwischen den Verdichtungen stehen — Beleg dafür,
    // dass wirklich nur angehängt wird.
    await fs.appendFile(ledgerFile(VAULT), 'kaputt\n', 'utf-8')
    await appendTelemetryRun(VAULT, run({ at: NOW + 1 }), NOW)
    expect(await fs.readFile(ledgerFile(VAULT), 'utf-8')).toContain('kaputt')
    // Nach COMPACT_EVERY Anhängen ist sie weg.
    for (let i = 2; i < COMPACT_EVERY + 2; i++) await appendTelemetryRun(VAULT, run({ at: NOW + i }), NOW)
    expect(await fs.readFile(ledgerFile(VAULT), 'utf-8')).not.toContain('kaputt')
  })

  it('schreibt ohne Vault nichts', async () => {
    await appendTelemetryRun('', run(), NOW)
    await expect(fs.readdir(path.join(userDataDir, 'telemetry'))).rejects.toThrow()
    expect(await readTelemetryRange('', { from: 0, to: NOW + 1 }, NOW)).toEqual([])
  })
})

describe('readTelemetryRange', () => {
  it('liefert nur den Zeitraum, Anfang einschließlich, Ende ausschließlich, aufsteigend', async () => {
    for (const at of [NOW + 5, NOW, NOW + 10, NOW + 3]) await appendTelemetryRun(VAULT, run({ at }), NOW)
    const gelesen = await readTelemetryRange(VAULT, { from: NOW, to: NOW + 10 }, NOW)
    expect(gelesen.map(r => r.at)).toEqual([NOW, NOW + 3, NOW + 5])
  })

  it('liefert für einen unbekannten Vault eine leere Liste', async () => {
    expect(await readTelemetryRange('/tmp/nie-gesehen', { from: 0, to: NOW }, NOW)).toEqual([])
  })
})
