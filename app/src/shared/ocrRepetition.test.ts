import { describe, expect, it } from 'vitest'
import { looksLikeOcrLoop, trimOcrRepetition } from './ocrRepetition'

const PAGE = `# Protokoll der Fachkonferenz Mathematik

Sitzung vom 14. Oktober 2026, Raum B 213

## 1. Neue Lehrbücher

Die Fachkonferenz beschließt, für die Jahrgänge 5 und 6 das Lehrwerk „Mathe Plus" einzuführen.
Die Kosten betragen pro Schüler 24,95 Euro, insgesamt 3.742,50 Euro für 150 Exemplare.

## 2. Förderkurse

Ab dem 3. November finden dienstags von 13:45 bis 14:30 Uhr Förderkurse statt.`

const NOTE = `Notizen Elternabend 7b

- Klassenfahrt nach Bad Wildungen, 4.-8. Mai
- Kosten ca. 285 € pro Kind
- Anzahlung 80 € bis 15. Januar`

const asTable = (text: string) =>
  '<table>' + text.split('\n').filter(Boolean).map(l => `<tr><td>${l}</td></tr>`).join('') + '</table>'

describe('looksLikeOcrLoop', () => {
  it('meldet eine normale Seite nicht', () => {
    expect(looksLikeOcrLoop(PAGE)).toBe(false)
  })

  it('erkennt den Neubeginn derselben Seite', () => {
    expect(looksLikeOcrLoop(`${PAGE}\n${PAGE}\n${PAGE.slice(0, 200)}`)).toBe(true)
  })

  it('erkennt die Wiederholung auch in anderer Form (Code-Fence, HTML-Tabelle)', () => {
    expect(looksLikeOcrLoop(`${PAGE}\n\`\`\`markdown\n${PAGE}\n\`\`\``)).toBe(true)
    expect(looksLikeOcrLoop(`${NOTE}\n${asTable(NOTE)}\n${asTable(NOTE)}`)).toBe(false) // erst 2 Kopien, unter 300 Zeichen
    expect(looksLikeOcrLoop(`${NOTE}\n${asTable(NOTE)}\n${asTable(NOTE)}\n${asTable(NOTE)}\n${asTable(NOTE)}`)).toBe(true)
  })

  it('wertet eine kurze wiederkehrende Zeile (Skalenbeschriftung) nicht als Schleife', () => {
    const scale = 'trifft gar nicht zu · trifft eher nicht zu · teils/teils · trifft eher zu · trifft voll zu'
    const form = [1, 2, 3, 4, 5].map(i => `${i}. Aussage Nummer ${i} über das Denken\n${scale}`).join('\n\n')
    expect(looksLikeOcrLoop(form)).toBe(false)
  })
})

describe('trimOcrRepetition', () => {
  it('lässt eine Seite ohne Wiederholung unverändert', () => {
    expect(trimOcrRepetition(`${PAGE}\n`)).toEqual({ text: PAGE, trimmed: false })
  })

  it('schneidet am Neubeginn ab und entfernt die offene Fence-Zeile', () => {
    const out = trimOcrRepetition(`${PAGE}\n\`\`\`markdown\n${PAGE}\n\`\`\`\n\`\`\`\n${PAGE.slice(0, 300)}`)
    expect(out).toEqual({ text: PAGE, trimmed: true })
  })

  it('schneidet eine kurze Seite ab, die als HTML-Tabelle wiederkommt', () => {
    const out = trimOcrRepetition(`${NOTE}\n${asTable(NOTE)}\n${asTable(NOTE)}\n<table><tr><td>Notizen Eltern`)
    expect(out).toEqual({ text: NOTE, trimmed: true })
  })

  it('schneidet auch, wenn die Kopie erst mitten in der Seite einsetzt', () => {
    const head = 'gesis\nLeibniz-Institut\nfür Sozialwissenschaften\n\n'
    const body = 'Kurzskala Need for Cognition\nNFC-K\n\nZitierung\nBeißert, H., Köhler, M., Rempel, M., & Beierlein, C. (2015).\nZusammenstellung sozialwissenschaftlicher Items und Skalen'
    const out = trimOcrRepetition(`${head}${body}\n\`\`\`markdown\n${body}\n\`\`\`\n${head}${body}`)
    expect(out).toEqual({ text: `${head}${body}`, trimmed: true })
  })

  it('schließt einen Code-Block, der vor dem Schnitt offen blieb', () => {
    const code = 'Beispiel:\n```python\nfor i in range(10):\n    print("Zeile", i, "der Ausgabe mit etwas mehr Text")'
    const out = trimOcrRepetition(`${code}\n${code}\n${code}`)
    expect(out.trimmed).toBe(true)
    expect(out.text.endsWith('```')).toBe(true)
    expect(out.text.split('```').length - 1).toBe(2)
  })
})
