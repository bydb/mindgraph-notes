// Der Schlüssel entscheidet, wann eine Antwort noch gilt. Er war zu grob: Er zählte
// Ordner, statt sie zu lesen — ein Austausch bei gleicher Anzahl blieb unbemerkt, und
// die Vorlaufzeit ging gar nicht ein. Folge: bis zu 60 Sekunden alte Aufgaben, obwohl
// der Nutzer die Einstellung gerade geändert hatte.

import { describe, it, expect } from 'vitest'
import { computeSettingsRevision } from './dashboardSnapshotProvider'

const lead = { critical: 3, high: 2, normal: 1 }
const basis = { excludedFolders: ['Archiv'], includedFolders: ['Projekte'], taskLeadTime: lead }

describe('computeSettingsRevision', () => {
  it('ändert sich, wenn ein Ordner gegen einen anderen getauscht wird', () => {
    expect(computeSettingsRevision({ ...basis, excludedFolders: ['Papierkorb'] }))
      .not.toBe(computeSettingsRevision(basis))
  })

  it('ändert sich, wenn die Vorlaufzeit geändert wird', () => {
    expect(computeSettingsRevision({ ...basis, taskLeadTime: { ...lead, critical: 7 } }))
      .not.toBe(computeSettingsRevision(basis))
  })

  it('unterscheidet ein- und ausgeschlossene Ordner', () => {
    expect(computeSettingsRevision({ excludedFolders: ['A'], includedFolders: [], taskLeadTime: lead }))
      .not.toBe(computeSettingsRevision({ excludedFolders: [], includedFolders: ['A'], taskLeadTime: lead }))
  })

  it('bleibt gleich bei unveränderten Einstellungen', () => {
    expect(computeSettingsRevision({ ...basis })).toBe(computeSettingsRevision({ ...basis }))
  })

  it('unterscheidet Reihenfolge nicht als Zufall, sondern als Änderung', () => {
    // Die Reihenfolge stammt aus der Oberfläche und ist stabil; ein Unterschied hier
    // kostet nur eine Neuberechnung und ist nie falsch.
    expect(computeSettingsRevision({ ...basis, excludedFolders: ['A', 'B'] }))
      .not.toBe(computeSettingsRevision({ ...basis, excludedFolders: ['B', 'A'] }))
  })
})
