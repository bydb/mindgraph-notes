import { describe, expect, it } from 'vitest'
import { validateAgentMarkdownResult } from './agentResultQuality'

describe('validateAgentMarkdownResult', () => {
  const requirement = 'Erstelle eine Entscheidungsvorlage. Drei konkrete Rückfragen als Entwurf erstellen.'

  it('akzeptiert drei vollständige Rückfrageentwürfe', () => {
    const markdown = `# Entscheidung

## Rückfrageentwürfe

### Alpha
**Betreff:** Lieferzeit

### Bayern
**Betreff:** Preis

### Delta
**Betreff:** Nachweise
`
    expect(validateAgentMarkdownResult(markdown, requirement)).toEqual([])
  })

  it('lehnt Platzhalter und zu wenige Entwürfe gemeinsam ab', () => {
    const markdown = `# Entscheidung

## Kurzfazit
Noch auszufüllen.

## Rückfrageentwürfe
### Alpha
**Betreff:** Lieferzeit
`
    expect(validateAgentMarkdownResult(markdown, requirement).map(issue => issue.code))
      .toEqual(['placeholder', 'draft-count'])
  })

  it('lässt doppelte Hauptabschnitte bewusst durch', () => {
    // Eine Vergleichsvorlage darf „## Bewertung" je Anbieter führen. Der Fehler waere
    // beim Durchsehen ohnehin sofort sichtbar — ein Fehlalarm kostet einen ganzen Lauf.
    const markdown = '# Vergleich\n\n## Bewertung\nAnbieter A\n\n## Bewertung\nAnbieter B'
    expect(validateAgentMarkdownResult(markdown, 'Vergleiche die Angebote.')).toEqual([])
  })

  it('nimmt die geforderte Anzahl NUR aus der Nutzeranweisung', () => {
    // Eine gelesene Mail mit „drei Rückfragen" darf keine Anforderung erzwingen, die
    // der Nutzer nie gestellt hat — der zweite Parameter ist die einzige Quelle.
    const markdown = '# Ergebnis\n\n## Rückfragen\n### Alpha\n**Betreff:** Lieferzeit'
    expect(validateAgentMarkdownResult(markdown, 'Werte den Anhang aus.')).toEqual([])
  })

  it('erlaubt Platzhalter, wenn ausdrücklich eine leere Vorlage verlangt wurde', () => {
    const issues = validateAgentMarkdownResult(
      '# Leere Vorlage\n\n## Ergebnis\nNoch auszufüllen.',
      'Erstelle eine leere Vorlage zum Ausfüllen.'
    )
    expect(issues).toEqual([])
  })

  it('erkennt nicht geschlossene Markdown-Strukturen', () => {
    const issues = validateAgentMarkdownResult('# Ergebnis\n\n```ts\nconst x = 1\n\n**offen', '')
    expect(issues.map(issue => issue.code)).toEqual(['unclosed-code-fence', 'unbalanced-bold'])
  })
})
