import { describe, it, expect } from 'vitest'
import {
  COMPUTER_VERBS, DEFAULT_COMPUTER_CONTROL, activeComputerVerbs, describeComputerControl,
  computerVerbLabel, isPrintable, isValidAppPath, isValidBundleId, isValidComputerName, isValidEmailAddress,
  normalizeComputerControl, resolveAllowedApp
} from './computerControl'

describe('Einstellungen einlesen', () => {
  it('fällt bei unbekannter Form auf den Standard zurück', () => {
    expect(normalizeComputerControl(undefined)).toEqual(DEFAULT_COMPUTER_CONTROL)
    expect(normalizeComputerControl('kaputt')).toEqual(DEFAULT_COMPUTER_CONTROL)
    expect(normalizeComputerControl({ verbs: 'ja', apps: 'Word' })).toEqual(DEFAULT_COMPUTER_CONTROL)
  })

  it('hält Drucken standardmäßig aus', () => {
    expect(DEFAULT_COMPUTER_CONTROL.verbs.print).toBe(false)
  })

  it('übernimmt nur echte Wahrheitswerte je Vorgang', () => {
    const s = normalizeComputerControl({ verbs: { print: true, open: 'ja', reveal: false } })
    expect(s.verbs.print).toBe(true)
    expect(s.verbs.reveal).toBe(false)
    expect(s.verbs.open).toBe(DEFAULT_COMPUTER_CONTROL.verbs.open)
  })

  it('wirft ungültige und doppelte Einträge aus den Freigabelisten', () => {
    const s = normalizeComputerControl({
      apps: [
        { id: 'com.microsoft.Word', label: 'Microsoft Word', path: '/Applications/Microsoft Word.app' },
        { id: 'com.microsoft.word', label: 'Word nochmal', path: '/Applications/Microsoft Word.app' }, // gleicher Pfad
        { id: 'com.apple.Preview', label: 'Microsoft Word', path: '/System/Applications/Preview.app' }, // gleicher Name
        { id: 'com.apple.Terminal; rm -rf /', label: 'Terminal', path: '/System/Applications/Utilities/Terminal.app' },
        { id: 'com.apple.Preview', path: '/System/Applications/Preview.app' },   // ohne Namen
        { id: 'com.apple.Preview', label: 'Vorschau' },            // ohne bestätigten Pfad
        { id: 'com.apple.Preview', label: 'Vorschau', path: 'Preview.app' },     // kein absoluter Pfad
        'Microsoft Word',                                          // alte Form: nur ein Name
        42
      ],
    })
    expect(s.apps).toEqual([{ id: 'com.microsoft.Word', label: 'Microsoft Word', path: '/Applications/Microsoft Word.app' }])
  })

  it('verlangt den bestätigten Programmpfad — eine blosse Kennung reicht nicht', () => {
    // Die Kennung stammt aus der Selbstauskunft des Bundles; ein präpariertes .app kann
    // jede beliebige behaupten. Gebunden wird an den Pfad, den der Nutzer ausgewählt hat.
    expect(normalizeComputerControl({ apps: [{ id: 'com.apple.Preview', label: 'Vorschau' }] }).apps).toEqual([])
    expect(isValidAppPath('/System/Applications/Preview.app')).toBe(true)
    for (const bad of ['Preview.app', '/Applications/Preview', '', '/Applications/x.app\0', 42]) {
      expect(isValidAppPath(bad), JSON.stringify(bad)).toBe(false)
    }
  })

  it('nimmt einen getippten Programmnamen NICHT als Freigabe an', () => {
    // Der Grund steht im Modul: `open -a` kennt keine lokalisierten Namen („Vorschau"
    // scheitert, nur „Preview" trägt). Eine Freigabe ohne Bundle-Kennung wäre eine Falle,
    // die erst mitten im Lauf zuschnappt — real aufgetreten bei der Gegenprobe.
    expect(normalizeComputerControl({ apps: ['Vorschau'] }).apps).toEqual([])
  })

  it('prüft Bundle-Kennungen eng', () => {
    expect(isValidBundleId('com.apple.Preview')).toBe(true)
    expect(isValidBundleId('org.mozilla.firefox-esr')).toBe(true)
    for (const bad of ['', '.leading', 'mit leerzeichen', 'a"b', 'a\nb', 'x'.repeat(200)]) {
      expect(isValidBundleId(bad), JSON.stringify(bad)).toBe(false)
    }
  })

  it('deckelt die Listenlänge', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ id: `com.test.app${i}`, label: `Programm ${i}`, path: `/Applications/App${i}.app` }))
    expect(normalizeComputerControl({ apps: many }).apps).toHaveLength(25)
  })
})

describe('Namensprüfung', () => {
  it('nimmt echte Programmnamen an', () => {
    for (const name of ['Microsoft Word', 'Vorschau', 'Numbers', 'Adobe Acrobat (64-bit)', 'Mail+']) {
      expect(isValidComputerName(name), name).toBe(true)
    }
  })

  it('lehnt alles ab, was in einem Aufruf zu einem zweiten Argument werden könnte', () => {
    for (const name of ['-a', '"Word"', "Word'; osascript", 'Word\nMail', 'a'.repeat(65), '', '   ', '$(whoami)']) {
      expect(isValidComputerName(name), JSON.stringify(name)).toBe(false)
    }
  })


  it('findet das freigegebene Programm über Anzeigenamen oder Kennung', () => {
    const apps = [{ id: 'com.apple.Preview', label: 'Vorschau', path: '/System/Applications/Preview.app' }]
    expect(resolveAllowedApp(apps, 'vorschau')?.id).toBe('com.apple.Preview')
    expect(resolveAllowedApp(apps, 'com.apple.Preview')?.label).toBe('Vorschau')
    expect(resolveAllowedApp(apps, 'Preview')).toBeNull()
    expect(resolveAllowedApp([], 'Vorschau')).toBeNull()
  })
})

describe('Freigegebene Vorgänge', () => {

  it('meldet ehrlich, wenn nichts freigegeben ist', () => {
    const off = normalizeComputerControl({ verbs: { open: false, reveal: false, mail_draft: false, print: false } })
    expect(activeComputerVerbs(off)).toHaveLength(0)
    expect(describeComputerControl(off)).toBe('kein Vorgang freigegeben')
    expect(describeComputerControl(off, 'en')).toBe('no operations enabled')
  })

  it('nennt in der Beschreibung jeden freigegebenen Vorgang samt Programmen', () => {
    const s = normalizeComputerControl({ verbs: { print: true }, apps: [{ id: 'com.microsoft.Word', label: 'Microsoft Word', path: '/Applications/Microsoft Word.app' }] })
    const text = describeComputerControl(s)
    for (const verb of COMPUTER_VERBS) expect(text, verb).toContain(computerVerbLabel(verb))
    expect(text).toContain('Mail-Entwurf')
    expect(text).toContain('Microsoft Word')
  })

  it('sagt ohne Programmliste, dass nur das Standardprogramm möglich ist', () => {
    expect(describeComputerControl(DEFAULT_COMPUTER_CONTROL)).toContain('nur Standardprogramm')
  })
})

describe('Druckbare Formate', () => {
  it('lässt durch, was CUPS wirklich rendert', () => {
    expect(isPrintable('Teilnehmerliste.pdf')).toBe(true)
    expect(isPrintable('notiz.MD')).toBe(true)
    expect(isPrintable('scan.jpeg')).toBe(true)
  })
  it('lehnt Office-Formate ab statt Zeichensalat zu drucken', () => {
    expect(isPrintable('Teilnehmerliste.docx')).toBe(false)
    expect(isPrintable('Liste.xlsx')).toBe(false)
  })
})

describe('E-Mail-Adressen', () => {
  it('nimmt normale Adressen an', () => {
    expect(isValidEmailAddress('vorname.name@medienzentrum-beispiel.de')).toBe(true)
  })
  it('lehnt Sammelfelder und Zeilenumbrüche ab — ein Feld ist ein Empfänger', () => {
    for (const bad of ['a@b.de, c@d.de', 'a@b.de; c@d.de', 'a@b.de\nc@d.de', 'Name <a@b.de>', 'a@b', '', 'kein-at-zeichen.de']) {
      expect(isValidEmailAddress(bad), JSON.stringify(bad)).toBe(false)
    }
  })
})
