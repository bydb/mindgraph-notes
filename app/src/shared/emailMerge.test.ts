import { describe, it, expect } from 'vitest'
import {
  mergeEmailLists,
  mergeEmailRecord,
  mergeAnalysis,
  mergeWorkflowRuns,
  mergeTombstones,
  pruneTombstones,
  pruneWithTombstones,
  MIN_TOMBSTONE_RETENTION_DAYS,
  readDeviceCursor,
  writeDeviceCursor,
  flattenDeviceCursors,
  mergeDeviceCursors,
  type MergeableEmail
} from './emailMerge'

const T = (iso: string): string => `2026-08-${iso}T10:00:00.000Z`

function mail(id: string, extra: Partial<MergeableEmail> = {}): MergeableEmail {
  return { id, fetchedAt: T('10'), date: T('10'), ...extra }
}

function ids(list: MergeableEmail[]): string[] {
  return list.map(e => e.id)
}

// ── Regel 1 ────────────────────────────────────────────────────────────────
describe('Regel 1: Vereinigung über die Mail-ID', () => {
  it('übernimmt, was nur die andere Seite kennt — der gemeldete Fall', () => {
    // Genau das ging verloren: Mail lag im Postfach, Notiz lag im Vault,
    // in der Liste fehlte sie, weil das andere Gerät zuletzt gespeichert hatte.
    const merged = mergeEmailLists([mail('a')], [mail('a'), mail('fehlende')])
    expect(ids(merged)).toEqual(['a', 'fehlende'])
  })

  it('übernimmt, was nur die eigene Seite kennt', () => {
    expect(ids(mergeEmailLists([mail('a'), mail('b')], [mail('a')]))).toEqual(['a', 'b'])
  })

  it('behält die eigene Reihenfolge und hängt Fremdes hinten an', () => {
    const merged = mergeEmailLists([mail('b'), mail('a')], [mail('c'), mail('a')])
    expect(ids(merged)).toEqual(['b', 'a', 'c'])
  })

  it('dupliziert nichts, egal aus welcher Richtung', () => {
    const mine = [mail('a'), mail('b')]
    const theirs = [mail('b'), mail('c')]
    expect(ids(mergeEmailLists(mine, theirs))).toEqual(['a', 'b', 'c'])
    expect(new Set(ids(mergeEmailLists(theirs, mine))).size).toBe(3)
  })

  it('überspringt Einträge ohne brauchbare ID, statt zu stolpern', () => {
    const kaputt = [{ } as MergeableEmail, mail('a'), null as unknown as MergeableEmail]
    expect(ids(mergeEmailLists(kaputt, [mail('b')]))).toEqual(['a', 'b'])
  })

  it('ist mit leeren Seiten verträglich', () => {
    expect(mergeEmailLists([], [])).toEqual([])
    expect(ids(mergeEmailLists([], [mail('a')]))).toEqual(['a'])
    expect(ids(mergeEmailLists([mail('a')], []))).toEqual(['a'])
  })
})

// ── Regel 2 ────────────────────────────────────────────────────────────────
describe('Regel 2: Server-Daten folgen dem jüngeren Abruf', () => {
  it('nimmt Flags und Ordner aus dem später geholten Datensatz', () => {
    const alt = mail('a', { fetchedAt: T('10'), flags: ['\\Seen'], folder: 'INBOX' })
    const neu = mail('a', { fetchedAt: T('12'), flags: [], folder: 'Archiv' })
    expect(mergeEmailRecord(alt, neu).flags).toEqual([])
    expect(mergeEmailRecord(alt, neu).folder).toBe('Archiv')
    // Richtung egal — es zählt der Zeitstempel, nicht wer merged.
    expect(mergeEmailRecord(neu, alt).folder).toBe('Archiv')
  })

  it('behält Felder, die dem jüngeren Abruf fehlen', () => {
    const alt = mail('a', { fetchedAt: T('10'), bodyHtml: '<p>Text</p>', attachmentNames: ['x.pdf'] })
    const neu = mail('a', { fetchedAt: T('12'), subject: 'Neu' })
    const merged = mergeEmailRecord(neu, alt)
    expect(merged.subject).toBe('Neu')
    expect(merged.bodyHtml).toBe('<p>Text</p>')
    expect(merged.attachmentNames).toEqual(['x.pdf'])
  })

  it('behandelt einen fehlenden Abrufzeitpunkt als älter', () => {
    const ohne = mail('a', { fetchedAt: undefined, subject: 'ohne' })
    const mit = mail('a', { fetchedAt: T('12'), subject: 'mit' })
    expect(mergeEmailRecord(ohne, mit).subject).toBe('mit')
    expect(mergeEmailRecord(mit, ohne).subject).toBe('mit')
  })
})

// ── Regel 3 ────────────────────────────────────────────────────────────────
describe('Regel 3: vom Menschen gesetzte Marken gehen nie verloren', () => {
  it('behält noteCreated samt Pfad, auch wenn der andere Stand jünger ist', () => {
    const mit = mail('a', { fetchedAt: T('10'), noteCreated: true, notePath: 'emails/a.md' })
    const ohne = mail('a', { fetchedAt: T('12') })
    const merged = mergeEmailRecord(ohne, mit)
    expect(merged.noteCreated).toBe(true)
    expect(merged.notePath).toBe('emails/a.md')
  })

  it('behält sent aus beiden Richtungen', () => {
    expect(mergeEmailRecord(mail('a', { sent: true }), mail('a')).sent).toBe(true)
    expect(mergeEmailRecord(mail('a'), mail('a', { sent: true })).sent).toBe(true)
  })

  it('erfindet keine Marke, wenn keine Seite sie gesetzt hat', () => {
    const merged = mergeEmailRecord(mail('a'), mail('a'))
    expect(merged.noteCreated).toBeUndefined()
    expect(merged.sent).toBeUndefined()
  })

  it('behält replyHandled, auch wenn die jüngere Analyse es nicht kennt', () => {
    // Real: „habe ich am Telefon erledigt" auf Gerät A, danach Re-Analyse auf B.
    const erledigt = mail('a', { analysis: { analyzedAt: T('10'), replyHandled: true, replyHandledAt: T('11') } })
    const neuAnalysiert = mail('a', { analysis: { analyzedAt: T('14'), summary: 'neu' } })
    const merged = mergeEmailRecord(neuAnalysiert, erledigt)
    expect(merged.analysis?.replyHandled).toBe(true)
    expect(merged.analysis?.replyHandledAt).toBe(T('11'))
    expect(merged.analysis?.summary).toBe('neu')
  })

  it('nimmt den frühesten Erledigt-Zeitpunkt', () => {
    const a = { analyzedAt: T('10'), replyHandled: true, replyHandledAt: T('12') }
    const b = { analyzedAt: T('11'), replyHandled: true, replyHandledAt: T('11') }
    expect(mergeAnalysis(a, b)?.replyHandledAt).toBe(T('11'))
    expect(mergeAnalysis(b, a)?.replyHandledAt).toBe(T('11'))
  })

  it('vereinigt Workflow-Marker beider Seiten', () => {
    expect(mergeWorkflowRuns({ wf1: 'r1' }, { wf2: 'r2' })).toEqual({ wf1: 'r1', wf2: 'r2' })
    // Exactly-once: Beide kennen denselben Workflow — er darf nicht erneut laufen.
    expect(mergeWorkflowRuns({ wf1: 'r1' }, { wf1: 'r9' })).toEqual({ wf1: 'r1' })
    expect(mergeWorkflowRuns(undefined, undefined)).toBeUndefined()
  })

  it('zieht Workflow-Marker über eine jüngere Analyse hinweg', () => {
    const alt = mail('a', { analysis: { analyzedAt: T('10'), workflowRuns: { wf1: 'r1' } } })
    const neu = mail('a', { analysis: { analyzedAt: T('14') } })
    expect(mergeEmailRecord(neu, alt).analysis?.workflowRuns).toEqual({ wf1: 'r1' })
  })
})

// ── Regel 4 ────────────────────────────────────────────────────────────────
describe('Regel 4: Analysen', () => {
  it('nimmt die vorhandene Analyse, wenn die andere Seite keine hat', () => {
    const mit = mail('a', { analysis: { analyzedAt: T('10'), summary: 'da' } })
    expect(mergeEmailRecord(mail('a'), mit).analysis?.summary).toBe('da')
    expect(mergeEmailRecord(mit, mail('a')).analysis?.summary).toBe('da')
  })

  it('nimmt bei zwei Analysen die jüngere', () => {
    const alt = { analyzedAt: T('10'), summary: 'alt' }
    const neu = { analyzedAt: T('14'), summary: 'neu' }
    expect(mergeAnalysis(alt, neu)?.summary).toBe('neu')
    expect(mergeAnalysis(neu, alt)?.summary).toBe('neu')
  })

  it('behält bei gleichem Zeitstempel die eigene Seite', () => {
    const a = { analyzedAt: T('10'), summary: 'meine' }
    const b = { analyzedAt: T('10'), summary: 'fremde' }
    expect(mergeAnalysis(a, b)?.summary).toBe('meine')
  })

  it('lässt eine Analyse ohne Zeitstempel nicht gegen eine datierte gewinnen', () => {
    const ohne = { summary: 'ohne' }
    const mit = { analyzedAt: T('10'), summary: 'mit' }
    expect(mergeAnalysis(ohne, mit)?.summary).toBe('mit')
    expect(mergeAnalysis(mit, ohne)?.summary).toBe('mit')
  })

  it('gibt undefined zurück, wenn keine Seite eine Analyse hat', () => {
    expect(mergeAnalysis(undefined, undefined)).toBeUndefined()
    expect(mergeEmailRecord(mail('a'), mail('a')).analysis).toBeUndefined()
  })
})

// ── userProject ────────────────────────────────────────────────────────────
describe('userProject: gesetzt schlägt ungesetzt', () => {
  it('übernimmt die Zuordnung der anderen Seite, wenn die eigene keine hat', () => {
    const zugeordnet = mail('a', { userProject: 'Projekte/X' })
    expect(mergeEmailRecord(mail('a'), zugeordnet).userProject).toBe('Projekte/X')
  })

  it('behält ein ausdrückliches „kein Projekt" gegenüber „nicht entschieden"', () => {
    const merged = mergeEmailRecord(mail('a'), mail('a', { userProject: null }))
    expect(merged.userProject).toBeNull()
  })

  it('nimmt bei Widerspruch ohne Zeitstempel auf beiden Geräten denselben Wert', () => {
    // Willkürlich, aber gleich — „das rechnende Gerät gewinnt" ließe den Wert
    // zwischen den Geräten pendeln.
    const ab = mergeEmailRecord(mail('a', { userProject: 'X' }), mail('a', { userProject: 'Y' }))
    const ba = mergeEmailRecord(mail('a', { userProject: 'Y' }), mail('a', { userProject: 'X' }))
    expect(ab.userProject).toBe(ba.userProject)
  })

  it('lässt die spätere Entscheidung gewinnen', () => {
    const alt = mail('a', { userProject: 'X', userProjectChangedAt: T('10') })
    const neu = mail('a', { userProject: 'Y', userProjectChangedAt: T('14') })
    expect(mergeEmailRecord(alt, neu).userProject).toBe('Y')
    expect(mergeEmailRecord(neu, alt).userProject).toBe('Y')
  })

  it('überträgt ein Zurücksetzen auf automatische Zuordnung', () => {
    // Das Feld fehlt, der Zeitstempel ist da — das heißt ausdrücklich „auto".
    const zugeordnet = mail('a', { userProject: 'X', userProjectChangedAt: T('10') })
    const zurueckgesetzt = mail('a', { userProjectChangedAt: T('14') })
    expect(mergeEmailRecord(zugeordnet, zurueckgesetzt).userProject).toBeUndefined()
    expect(mergeEmailRecord(zurueckgesetzt, zugeordnet).userProject).toBeUndefined()
  })

  it('lässt eine datierte Entscheidung gegen eine undatierte gewinnen', () => {
    const undatiert = mail('a', { userProject: 'Alt' })
    const datiert = mail('a', { userProject: 'Neu', userProjectChangedAt: T('14') })
    expect(mergeEmailRecord(undatiert, datiert).userProject).toBe('Neu')
    expect(mergeEmailRecord(datiert, undatiert).userProject).toBe('Neu')
  })
})

// ── Regel 5 ────────────────────────────────────────────────────────────────
describe('Regel 5: Grabsteine', () => {
  it('hält eine gelöschte Mail draußen, statt sie zurückkehren zu lassen', () => {
    const merged = mergeEmailLists([mail('a')], [mail('a'), mail('geloescht')], {
      tombstones: { geloescht: T('20') }
    })
    expect(ids(merged)).toEqual(['a'])
  })

  it('lässt eine Mail zurück, die nach der Löschung erneut vom Server kam', () => {
    const wieder = mail('zurueck', { fetchedAt: T('22') })
    const merged = mergeEmailLists([wieder], [], { tombstones: { zurueck: T('20') } })
    expect(ids(merged)).toEqual(['zurueck'])
  })

  it('streicht auch eine Mail, die nur die eigene Seite noch hat', () => {
    const merged = mergeEmailLists([mail('weg', { fetchedAt: T('10') })], [], { tombstones: { weg: T('20') } })
    expect(merged).toEqual([])
  })

  it('nimmt beim Vereinigen zweier Grabstein-Listen den späteren Zeitpunkt', () => {
    expect(mergeTombstones({ a: T('10') }, { a: T('14'), b: T('11') })).toEqual({ a: T('14'), b: T('11') })
    expect(mergeTombstones(undefined, { a: T('10') })).toEqual({ a: T('10') })
  })

  it('räumt abgelaufene Grabsteine weg', () => {
    const now = new Date('2026-08-30T10:00:00.000Z').getTime()
    const alt = new Date(now - 200 * 24 * 3600 * 1000).toISOString()
    const frisch = new Date(now - 5 * 24 * 3600 * 1000).toISOString()
    const out = pruneTombstones({ alt, frisch }, 60, now)
    expect(out).toEqual({ frisch })
  })

  it('hält die Mindest-Aufbewahrung ein, auch wenn kürzer verlangt wird', () => {
    // Eine kurze Anzeige-Einstellung darf die Grabsteine nicht vorzeitig
    // wegräumen — sonst kehren gelöschte Mails vom Zweitgerät zurück.
    const now = new Date('2026-08-30T10:00:00.000Z').getTime()
    const vorZwanzigTagen = new Date(now - 20 * 24 * 3600 * 1000).toISOString()
    expect(pruneTombstones({ x: vorZwanzigTagen }, 1, now)).toEqual({ x: vorZwanzigTagen })
    expect(MIN_TOMBSTONE_RETENTION_DAYS).toBeGreaterThanOrEqual(30)
  })
})

// ── Aufräumen mit Spur ─────────────────────────────────────────────────────
describe('pruneWithTombstones', () => {
  const now = new Date('2026-08-30T10:00:00.000Z').getTime()
  const altesDatum = new Date(now - 90 * 24 * 3600 * 1000).toISOString()
  const neuesDatum = new Date(now - 2 * 24 * 3600 * 1000).toISOString()

  it('setzt für jede entfernte Mail einen Grabstein', () => {
    const out = pruneWithTombstones([mail('alt', { date: altesDatum }), mail('neu', { date: neuesDatum })], {}, 30, now)
    expect(ids(out.emails)).toEqual(['neu'])
    expect(Object.keys(out.tombstones)).toEqual(['alt'])
  })

  it('sorgt dafür, dass die entfernte Mail nicht zurückkommt', () => {
    const bestand = [mail('alt', { date: altesDatum, fetchedAt: altesDatum })]
    const out = pruneWithTombstones(bestand, {}, 30, now)
    // Das andere Gerät hat die Mail noch — nach dem Abgleich muss sie weg bleiben.
    const nachAbgleich = mergeEmailLists(out.emails, bestand, { tombstones: out.tombstones })
    expect(nachAbgleich).toEqual([])
  })

  it('löscht nichts ohne Datum', () => {
    const out = pruneWithTombstones([mail('ohne', { date: undefined })], {}, 30, now)
    expect(ids(out.emails)).toEqual(['ohne'])
    expect(out.tombstones).toEqual({})
  })

  it('löscht nichts, wenn kein Fenster gesetzt ist', () => {
    const out = pruneWithTombstones([mail('alt', { date: altesDatum })], {}, 0, now)
    expect(ids(out.emails)).toEqual(['alt'])
  })
})

// ── Abruf-Merker pro Gerät ─────────────────────────────────────────────────
describe('Abruf-Merker pro Gerät', () => {
  it('erbt beim ersten Mal den alten gemeinsamen Merker', () => {
    // Kein voller Neu-Abruf beim Update — sonst zieht jedes Gerät einmalig das
    // ganze Fenster über IMAP.
    expect(readDeviceCursor(undefined, { k1: T('10') }, 'geraet-a')).toEqual({ k1: T('10') })
    expect(readDeviceCursor({}, { k1: T('10') }, 'geraet-a')).toEqual({ k1: T('10') })
  })

  it('nimmt danach den eigenen Merker, nicht den des anderen Geräts', () => {
    const byDevice = { 'geraet-a': { k1: T('10') }, 'geraet-b': { k1: T('20') } }
    expect(readDeviceCursor(byDevice, { k1: T('20') }, 'geraet-a')).toEqual({ k1: T('10') })
  })

  it('lässt ein Gerät ohne eigenen Eintrag nicht leer ausgehen', () => {
    const byDevice = { 'geraet-b': { k1: T('20') } }
    expect(readDeviceCursor(byDevice, { k1: T('11') }, 'geraet-neu')).toEqual({ k1: T('11') })
  })

  it('schreibt nur den eigenen Merker und lässt fremde stehen', () => {
    const out = writeDeviceCursor({ 'geraet-b': { k1: T('20') } }, 'geraet-a', { k1: T('12') })
    expect(out).toEqual({ 'geraet-b': { k1: T('20') }, 'geraet-a': { k1: T('12') } })
  })

  it('bewegt den eigenen Merker nur vorwärts', () => {
    const out = writeDeviceCursor({ 'geraet-a': { k1: T('20') } }, 'geraet-a', { k1: T('10') })
    expect(out['geraet-a'].k1).toBe(T('20'))
  })

  it('füllt das alte Feld mit dem größten Wert je Schlüssel', () => {
    const flat = flattenDeviceCursors({ a: { k1: T('10'), k2: T('14') }, b: { k1: T('20') } })
    expect(flat).toEqual({ k1: T('20'), k2: T('14') })
  })

  it('vereinigt zwei Karten je Gerät und Schlüssel', () => {
    const merged = mergeDeviceCursors(
      { a: { k1: T('10') } },
      { a: { k1: T('20'), k2: T('11') }, b: { k1: T('12') } }
    )
    expect(merged).toEqual({ a: { k1: T('20'), k2: T('11') }, b: { k1: T('12') } })
  })
})

// ── Zurücknehmen von „beantwortet" ─────────────────────────────────────────
describe('replyHandled lässt sich zurücknehmen', () => {
  it('überträgt ein späteres Zurücknehmen, statt es zu verschlucken', () => {
    // Die Oberfläche schaltet die Marke um (InboxPanel). Ohne Zeitstempel wurde
    // beim Zusammenführen ODER gebildet — der Undo-Klick war bei jedem
    // gleichzeitigen Fremdstand wieder weg.
    const erledigt = mail('a', { analysis: { analyzedAt: T('10'), replyHandled: true, replyHandledAt: T('11'), replyHandledChangedAt: T('11') } })
    const zurueck = mail('a', { analysis: { analyzedAt: T('10'), replyHandled: false, replyHandledChangedAt: T('13') } })
    // `false` bleibt ausdrücklich stehen — sonst wäre die Entscheidung im
    // Ergebnis nicht mehr von „nie etwas gesetzt" zu unterscheiden.
    expect(mergeEmailRecord(erledigt, zurueck).analysis?.replyHandled).toBe(false)
    expect(mergeEmailRecord(zurueck, erledigt).analysis?.replyHandled).toBe(false)
  })

  it('lässt ein späteres Setzen gegen ein früheres Zurücknehmen gewinnen', () => {
    const zurueck = mail('a', { analysis: { analyzedAt: T('10'), replyHandled: false, replyHandledChangedAt: T('11') } })
    const erledigt = mail('a', { analysis: { analyzedAt: T('10'), replyHandled: true, replyHandledAt: T('13'), replyHandledChangedAt: T('13') } })
    expect(mergeEmailRecord(zurueck, erledigt).analysis?.replyHandled).toBe(true)
    expect(mergeEmailRecord(erledigt, zurueck).analysis?.replyHandled).toBe(true)
  })

  it('bleibt bei altem Bestand ohne Zeitstempel bei ODER', () => {
    // Damals wurde ein Zurücknehmen nirgends festgehalten — ein vergessenes
    // „erledigt" wäre der schlechtere Fehler.
    const erledigt = mail('a', { analysis: { analyzedAt: T('10'), replyHandled: true, replyHandledAt: T('11') } })
    const ohne = mail('a', { analysis: { analyzedAt: T('14') } })
    expect(mergeEmailRecord(ohne, erledigt).analysis?.replyHandled).toBe(true)
  })

  it('lässt eine datierte Änderung gegen einen undatierten Altstand gewinnen', () => {
    const altErledigt = mail('a', { analysis: { analyzedAt: T('10'), replyHandled: true, replyHandledAt: T('11') } })
    const neuZurueck = mail('a', { analysis: { analyzedAt: T('10'), replyHandled: false, replyHandledChangedAt: T('14') } })
    expect(mergeEmailRecord(altErledigt, neuZurueck).analysis?.replyHandled).toBe(false)
    expect(mergeEmailRecord(neuZurueck, altErledigt).analysis?.replyHandled).toBe(false)
  })
})

// ── Rechenregeln ───────────────────────────────────────────────────────────
//
// Drei Eigenschaften, auf die es bei einer Datei ankommt, die von mehreren
// Geräten in beliebiger Reihenfolge zusammengeführt wird:
//   vertauschbar  — merge(a,b) = merge(b,a): sonst hängt das Ergebnis davon ab,
//                   welches Gerät gerade rechnet, und der Wert pendelt
//   gruppierbar   — merge(merge(a,b),c) = merge(a,merge(b,c))
//   wiederholbar  — merge(a,a) = a: ein zweiter Durchlauf ändert nichts mehr
describe('Rechenregeln der Vereinigung', () => {
  const a = mail('gemeinsam', {
    fetchedAt: T('10'), subject: 'A',
    analysis: { analyzedAt: T('10'), summary: 'alt', replyHandled: true, replyHandledAt: T('11'), replyHandledChangedAt: T('11'), workflowRuns: { wf1: 'r1' } },
    userProject: 'X', userProjectChangedAt: T('10'), noteCreated: true, notePath: 'p.md'
  })
  const b = mail('gemeinsam', {
    fetchedAt: T('12'), subject: 'B',
    analysis: { analyzedAt: T('14'), summary: 'neu', replyHandled: false, replyHandledChangedAt: T('15'), workflowRuns: { wf2: 'r2' } },
    userProject: null, userProjectChangedAt: T('16')
  })
  const c = mail('gemeinsam', {
    fetchedAt: T('11'), subject: 'C',
    analysis: { analyzedAt: T('12'), summary: 'mittel' },
    sent: true
  })

  /** Stabile Textform über ALLE Ebenen. `JSON.stringify(obj, keys)` wäre hier
   *  eine Falle: Die Schlüsselliste wirkt rekursiv und hätte die Felder
   *  innerhalb von `analysis` stillschweigend ausgeblendet — die Tests wären
   *  dann grün geworden, ohne etwas zu prüfen. */
  const norm = (value: unknown): string => {
    if (Array.isArray(value)) return `[${value.map(norm).join(',')}]`
    if (value && typeof value === 'object') {
      const o = value as Record<string, unknown>
      return `{${Object.keys(o).sort().filter(k => o[k] !== undefined).map(k => `${JSON.stringify(k)}:${norm(o[k])}`).join(',')}}`
    }
    return JSON.stringify(value) ?? 'null'
  }

  it('ist vertauschbar', () => {
    expect(norm(mergeEmailRecord(a, b))).toBe(norm(mergeEmailRecord(b, a)))
    expect(norm(mergeEmailRecord(a, c))).toBe(norm(mergeEmailRecord(c, a)))
    expect(norm(mergeEmailRecord(b, c))).toBe(norm(mergeEmailRecord(c, b)))
  })

  it('ist gruppierbar', () => {
    const links = mergeEmailRecord(mergeEmailRecord(a, b), c)
    const rechts = mergeEmailRecord(a, mergeEmailRecord(b, c))
    expect(norm(links)).toBe(norm(rechts))
  })

  it('ist wiederholbar', () => {
    for (const e of [a, b, c]) {
      expect(norm(mergeEmailRecord(e, e))).toBe(norm(e))
    }
    const einmal = mergeEmailRecord(a, b)
    expect(norm(mergeEmailRecord(einmal, einmal))).toBe(norm(einmal))
    // Und ein zweiter Durchlauf gegen eine der Ausgangsseiten ändert nichts mehr.
    expect(norm(mergeEmailRecord(einmal, a))).toBe(norm(einmal))
    expect(norm(mergeEmailRecord(einmal, b))).toBe(norm(einmal))
  })

  it('gilt auch für ganze Listen', () => {
    const links = mergeEmailLists(mergeEmailLists([a], [b]), [c])
    const rechts = mergeEmailLists([a], mergeEmailLists([b], [c]))
    expect(links.map(norm)).toEqual(rechts.map(norm))
    expect(mergeEmailLists(links, links).map(norm)).toEqual(links.map(norm))
  })
})
