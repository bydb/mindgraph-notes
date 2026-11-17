import { describe, expect, it } from 'vitest'
import { buildFileLinkTarget, fileDropMarkdown, flattenFilePaths, parseVaultFilesDrag, planFileDrop, vaultFileKind } from './fileLinkTarget'

const ctx = (allPaths: string[], notes: Array<{ path: string; title: string }> = []) => ({ allPaths, notes })

describe('vaultFileKind', () => {
  it('erkennt die Dateiarten', () => {
    expect(vaultFileKind('a/Notiz.md')).toBe('note')
    expect(vaultFileKind('Bild.PNG')).toBe('image')
    expect(vaultFileKind('x/Bericht.pdf')).toBe('pdf')
    expect(vaultFileKind('Plan.xlsx')).toBe('office')
    expect(vaultFileKind('skizze.excalidraw')).toBe('other')
  })
})

describe('flattenFilePaths', () => {
  it('liefert nur Dateien in Baum-Reihenfolge', () => {
    const tree = [
      { path: 'A', isDirectory: true, children: [{ path: 'A/x.md', isDirectory: false }] },
      { path: 'b.pdf', isDirectory: false }
    ]
    expect(flattenFilePaths(tree)).toEqual(['A/x.md', 'b.pdf'])
  })
})

describe('buildFileLinkTarget', () => {
  it('Notiz mit eindeutigem Dateinamen → Dateiname ohne .md, verlinkt', () => {
    const r = buildFileLinkTarget('Projekte/Bericht.md', ctx(['Projekte/Bericht.md', 'x.pdf'], [{ path: 'Projekte/Bericht.md', title: 'Zusammenfassung' }]))
    expect(r).toEqual({ ok: true, target: 'Bericht', kind: 'note', embedByDefault: false })
    if (r.ok) expect(fileDropMarkdown(r)).toBe('[[Bericht]]')
  })

  it('Notiz-Dateiname doppelt → Pfad ohne .md', () => {
    const r = buildFileLinkTarget('A/Notiz.md', ctx(['A/Notiz.md', 'B/Notiz.md']))
    expect(r.ok && r.target).toBe('A/Notiz')
  })

  it('anderer Notiz-Titel gleich dem Dateinamen → Pfad (F21)', () => {
    const r = buildFileLinkTarget('B.md', ctx(['A.md', 'B.md'], [{ path: 'A.md', title: 'B' }, { path: 'B.md', title: 'Etwas' }]))
    expect(r.ok && r.target).toBe('B')
    // Pfad ohne Ordner ist hier identisch mit dem Kurznamen — der Resolver prüft den
    // vollen Pfad zuerst, `[[B]]` trifft also B.md. Mit Ordner wird der Unterschied sichtbar:
    const r2 = buildFileLinkTarget('X/B.md', ctx(['A.md', 'X/B.md'], [{ path: 'A.md', title: 'B' }]))
    expect(r2.ok && r2.target).toBe('X/B')
  })

  it('eigener Titel zählt nicht als Kollision', () => {
    const r = buildFileLinkTarget('Ordner/Notiz.md', ctx(['Ordner/Notiz.md'], [{ path: 'Ordner/Notiz.md', title: 'Notiz' }]))
    expect(r.ok && r.target).toBe('Notiz')
  })

  it('Kollision ohne Groß/klein und mit typografischem Apostroph', () => {
    const r = buildFileLinkTarget('A/You’ll.md', ctx(['A/You’ll.md', "B/you'll.md"]))
    expect(r.ok && r.target).toBe('A/You’ll')
  })

  it('Bild und PDF werden eingebettet', () => {
    const img = buildFileLinkTarget('img/foto.png', ctx(['img/foto.png']))
    const pdf = buildFileLinkTarget('docs/Bericht.pdf', ctx(['docs/Bericht.pdf']))
    expect(img.ok && fileDropMarkdown(img)).toBe('![[foto.png]]')
    expect(pdf.ok && fileDropMarkdown(pdf)).toBe('![[Bericht.pdf]]')
  })

  it('gleichnamiges Bild in zwei Ordnern → Pfad mit Endung', () => {
    const r = buildFileLinkTarget('a/foto.png', ctx(['a/foto.png', '.attachments/foto.png']))
    expect(r.ok && r.target).toBe('a/foto.png')
  })

  it('Office-Datei wird verlinkt, nicht eingebettet', () => {
    const r = buildFileLinkTarget('Plan.docx', ctx(['Plan.docx']))
    expect(r.ok && fileDropMarkdown(r)).toBe('[[Plan.docx]]')
  })

  it('PDF und Notiz gleichen Stamms kollidieren nicht', () => {
    const r = buildFileLinkTarget('Bericht.pdf', ctx(['Bericht.pdf', 'Bericht.md']))
    expect(r.ok && r.target).toBe('Bericht.pdf')
  })

  it('Sonderzeichen im Dateinamen → kein Link', () => {
    const r = buildFileLinkTarget('Angebot #2.pdf', ctx(['Angebot #2.pdf']))
    expect(r).toEqual({ ok: false, reason: 'unsupported-name', chars: ['#'], kind: 'pdf' })
  })

  it('Sonderzeichen nur im Ordner zählt, sobald der Pfad ausgegeben wird (F18)', () => {
    const unique = buildFileLinkTarget('Projekt #3/foto.png', ctx(['Projekt #3/foto.png']))
    expect(unique.ok && unique.target).toBe('foto.png')
    const doubled = buildFileLinkTarget('Projekt #3/foto.png', ctx(['Projekt #3/foto.png', 'x/foto.png']))
    expect(doubled).toMatchObject({ ok: false, chars: ['#'] })
  })
})


describe('planFileDrop', () => {
  const all = ['A/Notiz.md', 'B/Bericht.pdf', 'Angebot #2.pdf', 'Plan.docx']
  it('eine Notiz → Link im Fließtext', () => {
    expect(planFileDrop(['A/Notiz.md'], ctx(all), 'X.md')).toEqual({ markdown: '[[Notiz]]', block: false, skipped: [] })
  })
  it('ein PDF → Einbettung als Block', () => {
    expect(planFileDrop(['B/Bericht.pdf'], ctx(all), null)).toEqual({ markdown: '![[Bericht.pdf]]', block: true, skipped: [] })
  })
  it('Mehrfachauswahl: je Zeile, Selbstlink weg, Sonderzeichen gemeldet', () => {
    const plan = planFileDrop(['A/Notiz.md', 'Angebot #2.pdf', 'Plan.docx', 'X.md'], ctx([...all, 'X.md']), 'X.md')
    expect(plan).toEqual({ markdown: '[[Notiz]]\n[[Plan.docx]]', block: true, skipped: ['Angebot #2.pdf'] })
  })
  it('nur die eigene Notiz → nichts', () => {
    expect(planFileDrop(['X.md'], ctx(['X.md']), 'X.md').markdown).toBe('')
  })
})

describe('parseVaultFilesDrag', () => {
  it('liest nur Zeichenketten aus einer JSON-Liste', () => {
    expect(parseVaultFilesDrag('["a.md", 3, "", "b.pdf"]')).toEqual(['a.md', 'b.pdf'])
    expect(parseVaultFilesDrag('kein json')).toEqual([])
    expect(parseVaultFilesDrag('{"a":1}')).toEqual([])
  })
})
