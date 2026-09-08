// Textbausteine der Tagesbilanz — der wiederkehrende Fehlertyp: Die Rechnung stimmt, die
// Sätze drumherum brechen an Randfällen („25 − 6 = 15", „4 − 1 = 4"). Beide sind real in der
// Dev-App aufgetreten (08.09.2026). Geprüft wird deshalb nicht der Text, sondern ob die
// gezeigten Zahlen aufgehen.

import { describe, it, expect } from 'vitest'
import { savedBasisLine, wastedLine, grossMinutes } from './impactText'
import { estimateSavedMinutes, summarizeActivity, type ActivityEvent, type SavedTimeLine } from '../../shared/activityLog'

const M = 60_000
const NOW = new Date('2026-09-08T12:00:00').getTime()
const RANGE = { from: NOW - M, to: NOW + M }

// Übersetzung als Rechenprobe: liefert die Platzhalter als Text, damit der Test die
// Zahlen prüfen kann, ohne an einer Formulierung zu hängen.
const t = (key: string, p: Record<string, string | number> = {}): string =>
  key === 'voiceCommand.card.underOneMinute' ? 'unter 1' : `${key} ${JSON.stringify(p)}`

function zeile(events: ActivityEvent[], ref: number): SavedTimeLine {
  const saved = estimateSavedMinutes(summarizeActivity(events, RANGE), { 'table-merge': ref })
  return saved.lines[0]
}

describe('savedBasisLine', () => {
  it('zeigt die Rechnung der übernommenen Läufe ohne den Abzug der Fehlversuche', () => {
    const line = zeile([
      { at: NOW, kind: 'agent-run-finished', runId: 'a', durationMs: M, instructionMs: 2 * M, activityType: 'table-merge', resultCount: 1, status: 'ok' },
      { at: NOW, kind: 'agent-result-accepted', runId: 'a', format: 'xlsx', reviewMs: 3 * M, waitingMs: M },
      { at: NOW, kind: 'agent-run-finished', runId: 'b', durationMs: M, instructionMs: 2 * M, activityType: 'table-merge', resultCount: 0, status: 'failed' },
      { at: NOW, kind: 'agent-run-finished', runId: 'c', durationMs: M, instructionMs: M, activityType: 'table-merge', resultCount: 1, status: 'ok' },
      { at: NOW, kind: 'agent-result-discarded', runId: 'c', format: 'xlsx', reviewMs: M }
    ], 25)
    expect(line.savedMinutes).toBe(15)
    // 25 − 6 = 19, nicht „= 15"
    expect(savedBasisLine(line, t)).toContain('"reference":25')
    expect(savedBasisLine(line, t)).toContain('"active":6')
    expect(savedBasisLine(line, t)).toContain('"saved":19')
    // 19 − 4 = 15
    expect(wastedLine(line, t)).toContain('"count":2')
    expect(wastedLine(line, t)).toContain('"minutes":4')
    expect(wastedLine(line, t)).toContain('"net":15')
  })

  it('leitet die aktive Zeit aus der Gleichung ab — 4 − 1 = 4 darf nicht mehr vorkommen', () => {
    const line = zeile([
      { at: NOW, kind: 'agent-run-finished', runId: 'a', durationMs: M, instructionMs: 30_000, activityType: 'table-merge', resultCount: 1, status: 'ok' },
      { at: NOW, kind: 'agent-result-accepted', runId: 'a', format: 'xlsx', reviewMs: 0 }
    ], 4)
    // 0,5 min aktiv → 3,5 gespart rundet auf 4 → gezeigt „4 − unter 1 = 4"
    expect(savedBasisLine(line, t)).toContain('"active":"unter 1"')
    expect(savedBasisLine(line, t)).toContain('"saved":4')
  })

  it('lässt bei mehreren Vorgängen den Faktor sehen und rechnet ihn korrekt', () => {
    const line = zeile([
      { at: NOW, kind: 'agent-run-finished', runId: 'a', durationMs: M, instructionMs: 10 * M, activityType: 'table-merge', resultCount: 1, status: 'ok' },
      { at: NOW, kind: 'agent-result-accepted', runId: 'a', format: 'xlsx', reviewMs: 0 },
      { at: NOW, kind: 'agent-run-finished', runId: 'b', durationMs: M, instructionMs: 10 * M, activityType: 'table-merge', resultCount: 1, status: 'ok' },
      { at: NOW, kind: 'agent-result-accepted', runId: 'b', format: 'xlsx', reviewMs: 0 }
    ], 30)
    expect(savedBasisLine(line, t)).toContain('savedBasisMany')
    expect(savedBasisLine(line, t)).toContain('"runs":2')
    expect(savedBasisLine(line, t)).toContain('"reference":30')
    expect(savedBasisLine(line, t)).toContain('"active":20')
    expect(savedBasisLine(line, t)).toContain('"saved":40')
    expect(grossMinutes(line)).toBe(40)
  })

  it('sagt beim zweiten Kanal eines Vorgangs, wo die Zeit steht, statt „0 min aktiv (gemessen)"', () => {
    const events: ActivityEvent[] = [
      { at: NOW, kind: 'job-started', jobId: 'mk-1', jobKind: 'marketing', pluginId: 'edoobox' },
      { at: NOW, kind: 'job-outcome', jobId: 'mk-1', jobType: 'wp-post', outcome: 'draft', pluginId: 'wordpress', activeMs: 7 * M },
      { at: NOW, kind: 'job-outcome', jobId: 'mk-1', jobType: 'ig-caption', outcome: 'used', pluginId: 'edoobox', activeMs: 7 * M }
    ]
    const saved = estimateSavedMinutes(summarizeActivity(events, RANGE), { 'wp-post': 20, 'ig-caption': 10 })
    const ig = saved.lines.find(l => l.activityType === 'ig-caption')!
    expect(savedBasisLine(ig, t)).toContain('savedBasisShared')
    expect(savedBasisLine(ig, t)).toContain('"reference":10')
    expect(savedBasisLine(ig, t)).toContain('"saved":10')
    const wp = saved.lines.find(l => l.activityType === 'wp-post')!
    expect(savedBasisLine(wp, t)).toContain('"reference":20')
    expect(savedBasisLine(wp, t)).toContain('"active":7')
    expect(savedBasisLine(wp, t)).toContain('"saved":13')
  })

  it('nennt bei ausschließlich Fehlversuchen Abzug und Netto mit gleichem Betrag', () => {
    const line = zeile([
      { at: NOW, kind: 'agent-run-finished', runId: 'x', durationMs: M, instructionMs: 4 * M, activityType: 'table-merge', resultCount: 1, status: 'ok' }
    ], 30)
    expect(line.runs).toBe(0)
    expect(wastedLine(line, t)).toContain('"count":1')
    expect(wastedLine(line, t)).toContain('"minutes":4')
    expect(wastedLine(line, t)).toContain('"net":-4')
  })
})
