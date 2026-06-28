import { describe, it, expect } from 'vitest'
import { API_VERSION } from './version'
import pkg from '../package.json'

// Koppelt die exportierte API-Version an die package.json-Version, damit beide nicht
// auseinanderlaufen (das spätere Manifest-`apiVersion`/Kompat-Gate liest API_VERSION).
// Bei einem Versions-Bump müssen beide Stellen gemeinsam wandern.
describe('@mindgraph/plugin-api — API_VERSION', () => {
  it('stimmt mit der Paketversion überein (kein Drift)', () => {
    expect(API_VERSION).toBe(pkg.version)
  })
})
