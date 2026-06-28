import { describe, it, expect } from 'vitest'
import { buildEdooboxEvent } from './workflowTrigger'
import type { WorkflowTriggerLedger } from '../../../shared/plugins/workflowTrigger'
import type { EdooboxBooking, EdooboxOfferDashboard } from '../../../shared/types'

function fakeLedger(initial: Record<string, string> = {}): WorkflowTriggerLedger & { raw: Record<string, string> } {
  const raw: Record<string, string> = { ...initial }
  return {
    raw,
    get: (k) => raw[k],
    set: (k, v) => { raw[k] = v },
    delete: (k) => { delete raw[k] },
    keys: () => Object.keys(raw),
  }
}

function offer(id: string, bookingCount: number): EdooboxOfferDashboard {
  return { id, name: `Angebot ${id}`, number: id, status: 'open', bookingCount, maxParticipants: 20, bookings: [] }
}
function booking(id: string, offerId: string, bookedAt: string): EdooboxBooking {
  return { id, offerId, userName: `User ${id}`, userEmail: `${id}@x.de`, status: 'ok', bookedAt }
}

describe('buildEdooboxEvent', () => {
  it('Erstbaseline: erstes Sehen erzeugt KEINE Items, afterRun setzt die Baseline', async () => {
    const ledger = fakeLedger() // keine Baseline vorhanden
    const ev = await buildEdooboxEvent([offer('A', 3)], async () => [], ledger)
    expect(ev.items).toHaveLength(0)
    // Baseline ist noch NICHT gesetzt — erst afterRun (vom Kern nur bei Erfolg) rückt vor.
    expect(ledger.raw['edoobox-count:A']).toBeUndefined()
    ev.afterRun?.(ledger)
    expect(ledger.raw['edoobox-count:A']).toBe('3')
  })

  it('Delta: bookingCount über Baseline erzeugt Items für die neuen Buchungen', async () => {
    const ledger = fakeLedger({ 'edoobox-count:A': '1' })
    const getBookings = async (offerId: string): Promise<EdooboxBooking[]> => [
      booking('b3', offerId, '2026-03-03'),
      booking('b2', offerId, '2026-03-02'),
      booking('b1', offerId, '2026-03-01'),
    ]
    const ev = await buildEdooboxEvent([offer('A', 3)], getBookings, ledger)
    // newCount = 3 - 1 = 2 → die zwei jüngsten Buchungen.
    expect(ev.items.map(i => i.itemKey)).toEqual(['booking:A:b3', 'booking:A:b2'])
    // Baseline rückt erst über afterRun von 1 → 3.
    expect(ledger.raw['edoobox-count:A']).toBe('1')
    ev.afterRun?.(ledger)
    expect(ledger.raw['edoobox-count:A']).toBe('3')
  })

  it('ohne abrufbare Buchungen fällt es auf ein Angebots-Item zurück', async () => {
    const ledger = fakeLedger({ 'edoobox-count:A': '0' })
    const ev = await buildEdooboxEvent([offer('A', 2)], async () => [], ledger)
    expect(ev.items).toHaveLength(1)
    expect(ev.items[0].itemKey).toBe('booking:A:2')
  })
})
