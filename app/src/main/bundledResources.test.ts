// `bundledResourcesDir()` hängt im gepackten Build an einer Annahme über die
// electron-builder-Konfiguration: dass `app/resources` als Unterordner
// `resources` neben app.asar landet. Stimmt die Annahme nicht mehr, zeigt der
// Pfad ins Leere — und zwar ausschließlich im Installer, nie im Dev-Modus.
// Genau so ist der Fehler entstanden, der Starter-Vaults und Starter-Skills in
// jedem gepackten Build mit ENOENT hat scheitern lassen.
//
// Der Test prüft deshalb die Konfiguration selbst, nicht die Funktion: er
// schlägt fehl, sobald jemand das Mapping ändert, ohne bundledResources.ts
// mitzuziehen.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import * as path from 'path'

interface ExtraResource {
  from?: string
  to?: string
}

const pkg = JSON.parse(
  readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf-8')
) as { build?: { extraResources?: ExtraResource[]; files?: string[] } }

describe('gebündelte Ressourcen: Build-Konfiguration', () => {
  it('kopiert app/resources nach Contents/Resources/resources', () => {
    const entries = pkg.build?.extraResources ?? []
    const mapping = entries.find(e => e.from === 'resources')

    expect(
      mapping,
      'build.extraResources hat kein Mapping mehr für "resources" — bundledResourcesDir() findet den Ordner dann nicht'
    ).toBeDefined()

    expect(
      mapping?.to,
      'Zielordner geändert: bundledResourcesDir() setzt process.resourcesPath + "resources" zusammen und muss angepasst werden'
    ).toBe('resources')
  })

  it('bündelt resources zusätzlich in app.asar (Basis der __dirname-Pfade)', () => {
    // Fenster-Icon, Transport-Fenster und die KaTeX-Assets lesen bewusst über
    // __dirname aus dem Archiv statt über extraResources. Fällt dieser Eintrag
    // weg, brechen die — unabhängig vom Mapping oben.
    expect(pkg.build?.files ?? []).toContain('resources/**/*')
  })
})
