// Regressionstests für die Sprachaufbereitung.
//
// Zwei Fehlerklassen hat die alte Regex-Kette still produziert und genau die müssen
// hier festgenagelt bleiben: (1) zeilenübergreifend gierige Muster, die Inhalt
// löschen, und (2) Frontmatter, das dem Filter entkommt und komplett vorgelesen wird.
// Beides fällt in der App nicht auf — man hört es nur, und dann ist die MP3 schon da.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { markdownToSpeakable, SPEAKABLE_SNIPPET } from './speakableText'

describe('markdownToSpeakable — Frontmatter', () => {
  it('entfernt normalen Frontmatter', () => {
    expect(markdownToSpeakable('---\ntitle: Test\n---\n\nHallo Welt.')).toBe('Hallo Welt.')
  })

  it('entfernt Frontmatter auch mit Windows-Zeilenenden', () => {
    const out = markdownToSpeakable('---\r\ntitle: Test\r\ntags: [a]\r\n---\r\n\r\nHallo Welt.')
    expect(out).toBe('Hallo Welt.')
    expect(out).not.toContain('title')
  })

  it('entfernt Frontmatter mit vorangestelltem BOM', () => {
    expect(markdownToSpeakable('﻿---\ntitle: Test\n---\n\nHallo Welt.')).toBe('Hallo Welt.')
  })

  it('entfernt Frontmatter, auch wenn die Datei am schließenden Zaun endet', () => {
    expect(markdownToSpeakable('---\ntitle: Test\n---')).toBe('')
  })
})

describe('markdownToSpeakable — kein Textverlust', () => {
  // Der reale Fall aus starter-vault-demo/Demo-Tour.md: ein einzelnes `[[` aus
  // Inline-Code fraß Satz und Überschrift bis zum nächsten `]]`.
  it('ein einzelnes doppeltes Klammerpaar frisst nicht den Folgeabsatz', () => {
    const md = [
      'Tippe `[[` in einer beliebigen Notiz.',
      '',
      '## 3. Notiz-Kategorien',
      '',
      '[[Digitalwoche Planung]] ist offen.'
    ].join('\n')
    const out = markdownToSpeakable(md)
    expect(out).toContain('3. Notiz-Kategorien')
    expect(out).toContain('Digitalwoche Planung ist offen.')
    // Die eckigen Klammern der ERSTEN Zeile sind Inhalt (dort wird die Syntax erklärt)
    // und dürfen bleiben — verschwinden darf nur, was dazwischen steht.
    expect(out.split('\n').filter((l) => l.includes('[['))).toHaveLength(1)
  })

  it('lässt Unterstriche in Bezeichnern unangetastet', () => {
    expect(markdownToSpeakable('Die Datei rate_2026_final.md liegt dort.')).toContain(
      'rate_2026_final.md'
    )
  })

  it('lässt fertige Antwortsätze unverändert (Sprachbefehle)', () => {
    const satz = 'Du hast heute 3 offene Aufgaben.'
    expect(markdownToSpeakable(satz)).toBe(satz)
  })
})

describe('markdownToSpeakable — verworfene Blöcke', () => {
  it('überspringt Tabellen komplett', () => {
    const md = 'Davor.\n\n| Spalte | Wert |\n|---|---|\n| a | 1 |\n\nDanach.'
    expect(markdownToSpeakable(md)).toBe('Davor.\n\nDanach.')
  })

  it('überspringt Aufgabenzeilen samt Fälligkeitsmarker', () => {
    const md = 'Davor.\n\n- [ ] Catering bestellen (@[[2026-07-10]]) #dringend\n- [x] Erledigt\n\nDanach.'
    const out = markdownToSpeakable(md)
    expect(out).not.toContain('Catering')
    expect(out).not.toContain('[ ]')
    expect(out).toContain('Danach.')
  })

  it('entfernt den E-Mail-Kopfblock', () => {
    const md = '# Betreff.\n**Von:** a@b.de\n**Datum:** Montag\n**Relevanz:** 82%\n\nEigentlicher Text.'
    const out = markdownToSpeakable(md)
    expect(out).not.toContain('Von:')
    expect(out).not.toContain('82%')
    expect(out).toContain('Eigentlicher Text.')
  })

  it('nimmt eingerückte Fortsetzungszeilen einer Aufgabe mit', () => {
    const md = 'Davor.\n\n- [ ] Catering bestellen\n    - Rückmeldung von Frau Weber\n\nDanach.'
    const out = markdownToSpeakable(md)
    expect(out).not.toContain('Frau Weber')
    expect(out).toBe('Davor.\n\nDanach.')
  })

  it('schneidet den Quellenblock des Agenten ab', () => {
    const md = 'Fließtext.\n\n## Quellen\n\n- [Titel](https://example.com) — abgerufen am 2026-09-01'
    expect(markdownToSpeakable(md)).toBe('Fließtext.')
  })

  it('schneidet NICHT ab, wenn unter „Quellen" Fließtext steht', () => {
    const md = 'Fließtext.\n\n## Quellen\n\nDie Angaben stammen aus dem Jahresbericht.\n\n## Fazit\n\nSchluss.'
    const out = markdownToSpeakable(md)
    expect(out).toContain('Jahresbericht')
    expect(out).toContain('Schluss.')
  })

  it('entfernt das Workflow-Herkunftsbanner', () => {
    const md = '> \u{1F501} Erstellt am 01.09.2026 per Workflow „Mail-Triage"\n\nInhalt.'
    expect(markdownToSpeakable(md)).toBe('Inhalt.')
  })

  it('verwirft Code-Blöcke, auch nicht geschlossene', () => {
    expect(markdownToSpeakable('Satz eins.\n\n```js\nconst a = 1\n```\n\nSatz zwei.')).toBe(
      'Satz eins.\n\nSatz zwei.'
    )
    expect(markdownToSpeakable('Satz eins.\n\n```\nnie geschlossen\nconst a = 1')).toBe('Satz eins.')
  })

  it('entfernt Bild und zugehörige Bildunterschrift', () => {
    const md = '![Header](bild.jpg)\n*Symbolbild — Bild: KI-generiert*\n\nErster echter Satz.'
    expect(markdownToSpeakable(md)).toBe('Erster echter Satz.')
  })

  it('entfernt Trennlinien, Fußnoten und HTML', () => {
    const md = 'Eins[^1].\n\n---\n\n<div class="box">\n\nZwei.\n\n[^1]: Die Anmerkung.'
    const out = markdownToSpeakable(md)
    expect(out).toBe('Eins.\n\nZwei.')
  })

  it('entfernt HTML-Kommentare, ein- wie mehrzeilig', () => {
    expect(markdownToSpeakable('Satz eins. <!-- anno: {"id":1} --> Satz zwei.')).toBe(
      'Satz eins. Satz zwei.'
    )
    expect(markdownToSpeakable('Davor.\n\n<!--\nversteckte Notiz\n-->\n\nDanach.')).toBe(
      'Davor.\n\nDanach.'
    )
  })

  it('entfernt auch Fett-Auszeichnung mit Unterstrichen', () => {
    expect(markdownToSpeakable('Das ist __wichtig__ heute.')).toBe('Das ist wichtig heute.')
  })

  it('entfernt eine Überschrift, unter der nichts mehr steht', () => {
    const md = '## Mermaid-Diagramme\n\n```mermaid\ngraph TD\n```\n\n## Weiter\n\nText.'
    const out = markdownToSpeakable(md)
    expect(out).not.toContain('Mermaid')
    expect(out).toContain('Weiter.')
  })

  it('behält eine Überschrift mit tieferer Unterüberschrift', () => {
    const out = markdownToSpeakable('## Oben\n\n### Unten\n\nText.')
    expect(out).toContain('Oben.')
    expect(out).toContain('Unten.')
  })
})

describe('markdownToSpeakable — Inline-Bereinigung', () => {
  it('reduziert Wikilinks auf den sprechbaren Titel', () => {
    expect(markdownToSpeakable('Siehe [[202604221336 - Digitalwoche]].')).toBe('Siehe Digitalwoche.')
    expect(markdownToSpeakable('Siehe [[Notiz#Abschnitt]].')).toBe('Siehe Notiz.')
    expect(markdownToSpeakable('Siehe [[Notiz|hier]].')).toBe('Siehe hier.')
  })

  it('entfernt Einbettungen statt sie als Dateinamen vorzulesen', () => {
    expect(markdownToSpeakable('Text ![[bericht.pdf]] Ende.')).toBe('Text Ende.')
  })

  it('entfernt Tags, nackte URLs und Hervorhebungszeichen', () => {
    expect(markdownToSpeakable('Wichtig #kritisch siehe https://example.com hier.')).toBe(
      'Wichtig siehe hier.'
    )
    expect(markdownToSpeakable('Das ist ==hervorgehoben==.')).toBe('Das ist hervorgehoben.')
  })

  it('löst Markdown-Escapes auf', () => {
    expect(markdownToSpeakable('5 \\* 3 ist 15.')).toBe('5 * 3 ist 15.')
  })

  it('hängt an Überschriften nur dann einen Punkt, wenn Satzzeichen fehlt', () => {
    expect(markdownToSpeakable('## Was ist neu?\n\nText.')).toContain('Was ist neu?')
    expect(markdownToSpeakable('## Was ist neu?\n\nText.')).not.toContain('?.')
    expect(markdownToSpeakable('## Einleitung\n\nText.')).toContain('Einleitung.')
  })

  it('entfernt den Faltmarker aus Callout-Köpfen', () => {
    expect(markdownToSpeakable('> [!quote]+ Seite 12\n> Der Satz.')).toBe('Seite 12\nDer Satz.')
  })
})

describe('markdownToSpeakable — Emojis und Schutzregeln', () => {
  it('behält Emojis standardmäßig', () => {
    expect(markdownToSpeakable('Status 🔴 offen.')).toContain('🔴')
  })

  it('entfernt Emojis auf Wunsch', () => {
    expect(markdownToSpeakable('Status 🔴 offen.', { dropEmojis: true })).toBe('Status offen.')
  })

  it('gibt nie leer zurück, wenn die Eingabe Text enthielt', () => {
    // Karteikarte, die nur aus einer Tabelle besteht: lieber holprig als stumm.
    const out = markdownToSpeakable('| Begriff | Bedeutung |\n|---|---|\n| Vault | Notizsammlung |')
    expect(out).not.toBe('')
    expect(out).toContain('Begriff')
  })

  it('lässt im Schnipsel-Profil Tabellen und Aufgaben stehen', () => {
    const md = '| Begriff | Bedeutung |\n|---|---|\n| Vault | Notizsammlung |'
    expect(markdownToSpeakable(md, SPEAKABLE_SNIPPET)).toContain('Vault')
    expect(markdownToSpeakable('- [ ] Karteikarten-Aufgabe', SPEAKABLE_SNIPPET)).toContain(
      'Karteikarten-Aufgabe'
    )
  })

  it('gibt bei leerer Eingabe leer zurück', () => {
    expect(markdownToSpeakable('   \n\n')).toBe('')
  })
})

describe('markdownToSpeakable — Invariante an einer echten Vault-Notiz', () => {
  // Stärkster Beleg gegen die ganze Fehlerklasse: keine Überschrift der Demo-Tour
  // darf aus dem gesprochenen Text verschwinden. Genau das ist vorher passiert.
  it('behält jede Überschrift aus Demo-Tour.md', () => {
    const file = join(__dirname, '../../resources/starter-vault-demo/Demo-Tour.md')
    const raw = readFileSync(file, 'utf-8')
    const spoken = markdownToSpeakable(raw)
    const headings = raw
      .split('\n')
      .filter((l) => /^##\s+/.test(l))
      .map((l) => l.replace(/^##\s+/, '').trim())
    expect(headings.length).toBeGreaterThan(3)
    for (const heading of headings) {
      expect(spoken).toContain(heading)
    }
  })
})
