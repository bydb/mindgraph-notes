import { describe, expect, it } from 'vitest'
import { taskDisplayText } from './taskExtractor'

describe('taskDisplayText', () => {
  it('zeigt den Alias statt des Pfads', () => {
    expect(taskDisplayText('[[200 - Angebote/Muster GmbH Angebot|Muster GmbH]] wegen fehlendem Nachweis kennzeichnen'))
      .toBe('Muster GmbH wegen fehlendem Nachweis kennzeichnen')
  })
  it('nimmt ohne Alias den Notiznamen ohne Ordner und Abschnitt', () => {
    expect(taskDisplayText('Termin von [[100 - Projekte/Beispiel/_STATUS#Fristen]] klären')).toBe('Termin von _STATUS klären')
  })
  it('lässt Text ohne Wikilinks unverändert', () => {
    expect(taskDisplayText('Angebot nachrechnen #kritisch')).toBe('Angebot nachrechnen #kritisch')
  })
  it('übersteht beschädigte Klammern mit Backslashes', () => {
    expect(taskDisplayText('Rechnung an \\[\\[Beispiel AG\\]\\] schicken')).toBe('Rechnung an Beispiel AG schicken')
  })
})
