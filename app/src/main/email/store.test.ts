import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import {
  loadEmailStore,
  legacyEmailStorePath,
  saveEmailStore,
  mutateEmailStore,
  emailStorePath,
  validateEmailStore,
  computeRevision,
  serializeEmailStore,
  NO_REVISION,
  type EmailStoreData
} from './store'

let vault: string

beforeEach(async () => {
  vault = await fs.mkdtemp(path.join(os.tmpdir(), 'mg-emailstore-'))
})

afterEach(async () => {
  await fs.rm(vault, { recursive: true, force: true })
})

/** Schreibt an der Sperre vorbei — simuliert das ZWEITE Gerät, dessen Änderung
 *  per Sync in der Datei landet, ohne dass dieser Prozess davon weiß. */
async function foreignWrite(data: EmailStoreData): Promise<void> {
  const file = emailStorePath(vault)
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, serializeEmailStore(data), 'utf-8')
}

function store(ids: string[], extra: Record<string, unknown> = {}): EmailStoreData {
  return { emails: ids.map(id => ({ id })), lastFetchedAt: {}, ...extra }
}

function ids(data: EmailStoreData): string[] {
  return data.emails.map(e => String(e.id))
}

describe('validateEmailStore', () => {
  // Streng mit Absicht: Dass JSON.parse durchlaeuft, sagt nur, dass die Klammern
  // stimmen. Ein als „leer" durchgewinkter Stand wuerde beim naechsten Speichern
  // fuer bare Muenze genommen — und die volle Datei ueberschreiben.
  it('lehnt alles ab, was kein Mail-Bestand ist', () => {
    for (const input of [null, undefined, 42, 'x', [], true]) {
      expect(validateEmailStore(input).ok).toBe(false)
    }
  })

  it('lehnt eine emails-Liste ab, die keine Liste ist', () => {
    expect(validateEmailStore({ emails: 'kaputt' }).ok).toBe(false)
    expect(validateEmailStore({ emails: { 0: { id: 'a' } } }).ok).toBe(false)
  })

  it('lehnt beschädigte Einträge ab, statt sie stillschweigend wegzuwerfen', () => {
    expect(validateEmailStore({ emails: [{ id: 'a' }, null] }).ok).toBe(false)
    expect(validateEmailStore({ emails: [{ id: 'a' }, 'b'] }).ok).toBe(false)
    expect(validateEmailStore({ emails: [{ id: 'a' }, { betreff: 'ohne Kennung' }] }).ok).toBe(false)
    expect(validateEmailStore({ emails: [{ id: '' }] }).ok).toBe(false)
  })

  it('lehnt beschädigte Merker und Grabsteine ab', () => {
    expect(validateEmailStore({ emails: [], lastFetchedAt: 'x' }).ok).toBe(false)
    expect(validateEmailStore({ emails: [], lastFetchedAt: { k: 7 } }).ok).toBe(false)
    expect(validateEmailStore({ emails: [], deleted: { a: 7 } }).ok).toBe(false)
    expect(validateEmailStore({ emails: [], lastFetchedAtByDevice: { g: 'x' } }).ok).toBe(false)
    expect(validateEmailStore({ emails: [], lastFetchedAtByDevice: { g: { k: 7 } } }).ok).toBe(false)
  })

  it('nimmt einen unversehrten Bestand an und reicht unbekannte Felder durch', () => {
    const out = validateEmailStore({ emails: [{ id: 'a' }], lastFetchedAt: {}, zukunftsFeld: { a: 1 } })
    expect(out.ok).toBe(true)
    if (!out.ok) throw new Error('unerreichbar')
    expect(ids(out.data)).toEqual(['a'])
    expect(out.data.zukunftsFeld).toEqual({ a: 1 })
  })

  it('lehnt einen Rest ohne Pflichtfelder ab, wenn sie verlangt sind', () => {
    // Fuer email-store.json: Diese Datei schreibt nur diese App, und sie schreibt
    // beide Felder immer. Fehlt eines, ist das kein leerer Bestand, sondern ein
    // Rest — und wuerde beim naechsten Speichern als „da war nichts" durchgehen.
    expect(validateEmailStore({ storeVersion: 2 }, { requireFields: true }).ok).toBe(false)
    expect(validateEmailStore({ emails: [] }, { requireFields: true }).ok).toBe(false)
    expect(validateEmailStore({ lastFetchedAt: {} }, { requireFields: true }).ok).toBe(false)
    expect(validateEmailStore({ emails: [], lastFetchedAt: {} }, { requireFields: true }).ok).toBe(true)
  })

  it('bleibt bei der alten Datei nachsichtig — sie wird nur gelesen, nie geschrieben', () => {
    const out = validateEmailStore({ emails: [{ id: 'a' }] })
    expect(out.ok).toBe(true)
  })
})

describe('computeRevision', () => {
  it('unterscheidet unterschiedlichen Inhalt und ist für gleichen Inhalt stabil', () => {
    expect(computeRevision('a')).toBe(computeRevision('a'))
    expect(computeRevision('a')).not.toBe(computeRevision('b'))
  })

  it('sieht auch reine Formatierungsunterschiede als Änderung', () => {
    // Zweifel gehen zugunsten „Konflikt" aus, nicht zugunsten „überschreiben".
    expect(computeRevision('{"a":1}')).not.toBe(computeRevision('{ "a": 1 }'))
  })
})

describe('loadEmailStore', () => {
  it('liefert bei fehlender Datei einen leeren Stand ohne Revision', async () => {
    const snap = await loadEmailStore(vault)
    expect(snap.exists).toBe(false)
    expect(snap.revision).toBe(NO_REVISION)
    expect(snap.data.emails).toEqual([])
  })

  it('schreibt beim Laden NICHTS zurück', async () => {
    await foreignWrite(store(['a']))
    const before = await fs.readFile(emailStorePath(vault), 'utf-8')
    const beforeStat = await fs.stat(emailStorePath(vault))
    await loadEmailStore(vault)
    await loadEmailStore(vault)
    expect(await fs.readFile(emailStorePath(vault), 'utf-8')).toBe(before)
    expect((await fs.stat(emailStorePath(vault))).mtimeMs).toBe(beforeStat.mtimeMs)
  })

  it('behandelt eine kaputte Datei als leer, lässt sie aber unangetastet', async () => {
    const file = emailStorePath(vault)
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file, '{ das ist kein JSON', 'utf-8')
    const snap = await loadEmailStore(vault)
    expect(snap.data.emails).toEqual([])
    expect(snap.exists).toBe(true)
    expect(snap.readable).toBe(false)
    expect(await fs.readFile(file, 'utf-8')).toBe('{ das ist kein JSON')
  })
})

describe('saveEmailStore — Revisionsprüfung', () => {
  it('schreibt, wenn die Basisrevision noch stimmt', async () => {
    const first = await saveEmailStore(vault, store(['a']), NO_REVISION)
    expect(first.ok).toBe(true)

    const snap = await loadEmailStore(vault)
    const second = await saveEmailStore(vault, store(['a', 'b']), snap.revision)
    expect(second.ok).toBe(true)
    expect(ids((await loadEmailStore(vault)).data)).toEqual(['a', 'b'])
  })

  it('vereinigt, wenn ein anderes Gerät dazwischengeschrieben hat — beide Seiten überleben', async () => {
    await foreignWrite(store(['a', 'b']))
    const snap = await loadEmailStore(vault)

    // Zweites Gerät liefert per Sync eine Datei mit einer zusätzlichen Mail.
    await foreignWrite(store(['a', 'b', 'c']))

    // Unser Stand kennt 'c' nicht, hat dafür 'eigene'. Genau hier ging früher
    // eine der beiden Seiten verloren.
    const result = await saveEmailStore(vault, store(['a', 'b', 'eigene']), snap.revision)
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('unerreichbar')
    expect(result.merged).toBe(true)

    const final = ids((await loadEmailStore(vault)).data)
    expect(final).toContain('c')
    expect(final).toContain('eigene')
    expect(final).toHaveLength(4)
  })

  it('meldet einen glatten Schreibvorgang als nicht vereinigt', async () => {
    await foreignWrite(store(['a']))
    const snap = await loadEmailStore(vault)
    const result = await saveEmailStore(vault, store(['a', 'b']), snap.revision)
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('unerreichbar')
    expect(result.merged).toBe(false)
  })

  it('legt die Datei an, wenn es sie nicht gibt und der Aufrufer keine Basis hat', async () => {
    const result = await saveEmailStore(vault, store(['a']), null)
    expect(result.ok).toBe(true)
  })

  it('löscht nichts, wenn ohne Basis mit einer leeren Liste geschrieben wird', async () => {
    // Ohne Basis kann der Aufrufer nichts gemeint haben, was schon dasteht.
    await foreignWrite(store(['a', 'b']))
    const result = await saveEmailStore(vault, store([]), null)
    expect(result.ok).toBe(true)
    expect(ids((await loadEmailStore(vault)).data)).toEqual(['a', 'b'])
  })

  it('behält beim Vereinigen die vom Menschen gesetzten Marken beider Seiten', async () => {
    await foreignWrite({
      emails: [{ id: 'a', fetchedAt: '2026-08-10T10:00:00.000Z', analysis: { analyzedAt: '2026-08-10T10:00:00.000Z', replyHandled: true } }],
      lastFetchedAt: {}
    })
    const snap = await loadEmailStore(vault)

    // Anderes Gerät analysiert die Mail neu — ohne die Erledigt-Marke.
    await foreignWrite({
      emails: [
        { id: 'a', fetchedAt: '2026-08-11T10:00:00.000Z', analysis: { analyzedAt: '2026-08-14T10:00:00.000Z', summary: 'neu' } },
        { id: 'b', fetchedAt: '2026-08-11T10:00:00.000Z' }
      ],
      lastFetchedAt: {}
    })

    const result = await saveEmailStore(vault, snap.data, snap.revision)
    expect(result.ok).toBe(true)

    const final = await loadEmailStore(vault)
    const a = final.data.emails.find(e => e.id === 'a') as { analysis?: { replyHandled?: boolean; summary?: string } }
    expect(a.analysis?.replyHandled).toBe(true)
    expect(a.analysis?.summary).toBe('neu')
    expect(ids(final.data)).toContain('b')
  })

  it('führt die Abruf-Merker beider Geräte zusammen', async () => {
    await foreignWrite({ emails: [], lastFetchedAt: {}, lastFetchedAtByDevice: { 'geraet-b': { k1: '2026-08-20T10:00:00.000Z' } } })
    const snap = await loadEmailStore(vault)
    await foreignWrite({ emails: [], lastFetchedAt: {}, lastFetchedAtByDevice: { 'geraet-b': { k1: '2026-08-22T10:00:00.000Z' } } })

    await saveEmailStore(vault, { emails: [], lastFetchedAt: {}, lastFetchedAtByDevice: { 'geraet-a': { k1: '2026-08-21T10:00:00.000Z' } } }, snap.revision)

    const final = await loadEmailStore(vault)
    expect(final.data.lastFetchedAtByDevice).toEqual({
      'geraet-b': { k1: '2026-08-22T10:00:00.000Z' },
      'geraet-a': { k1: '2026-08-21T10:00:00.000Z' }
    })
    // Das alte Feld traegt den groessten Wert, damit eine aeltere App-Version
    // nicht das ganze Postfach neu zieht.
    expect(final.data.lastFetchedAt.k1).toBe('2026-08-22T10:00:00.000Z')
  })

  it('verbucht den Merker des Renderers im Fach seines Geräts, nicht im gemeinsamen', async () => {
    // Der Renderer bekommt beim Laden den geraeteeigenen Merker. Schriebe er ihn
    // ins gemeinsame Feld zurueck, koennte er den Stand aller Geraete
    // zurueckdrehen — und eine aeltere App-Version zoege das Postfach neu.
    await foreignWrite({
      emails: [],
      lastFetchedAt: { k1: '2026-08-22T10:00:00.000Z' },
      lastFetchedAtByDevice: { 'geraet-b': { k1: '2026-08-22T10:00:00.000Z' } }
    })
    const snap = await loadEmailStore(vault)

    await saveEmailStore(vault, { emails: [], lastFetchedAt: { k1: '2026-08-20T10:00:00.000Z' } }, snap.revision, { deviceId: 'geraet-a' })

    const final = await loadEmailStore(vault)
    expect(final.data.lastFetchedAtByDevice).toEqual({
      'geraet-b': { k1: '2026-08-22T10:00:00.000Z' },
      'geraet-a': { k1: '2026-08-20T10:00:00.000Z' }
    })
    // Gemeinsames Feld bleibt die Obergrenze und laeuft nicht rueckwaerts.
    expect(final.data.lastFetchedAt.k1).toBe('2026-08-22T10:00:00.000Z')
  })

  it('bewegt den Geräte-Merker auch beim Speichern nur vorwärts', async () => {
    await foreignWrite({ emails: [], lastFetchedAt: {}, lastFetchedAtByDevice: { 'geraet-a': { k1: '2026-08-22T10:00:00.000Z' } } })
    const snap = await loadEmailStore(vault)
    await saveEmailStore(vault, { emails: [], lastFetchedAt: { k1: '2026-08-10T10:00:00.000Z' } }, snap.revision, { deviceId: 'geraet-a' })
    const final = await loadEmailStore(vault)
    expect(final.data.lastFetchedAtByDevice?.['geraet-a'].k1).toBe('2026-08-22T10:00:00.000Z')
  })

  it('lässt eine per Grabstein gelöschte Mail nicht zurückkehren', async () => {
    await foreignWrite({ emails: [{ id: 'a' }, { id: 'weg', fetchedAt: '2026-08-10T10:00:00.000Z' }], lastFetchedAt: {} })
    const snap = await loadEmailStore(vault)

    // Anderes Gerät löscht 'weg' und hinterlässt einen Grabstein.
    await foreignWrite({ emails: [{ id: 'a' }], lastFetchedAt: {}, deleted: { weg: '2026-08-20T10:00:00.000Z' } })

    // Unser Stand kennt 'weg' noch — sie darf trotzdem nicht wiederkommen.
    await saveEmailStore(vault, snap.data, snap.revision)
    expect(ids((await loadEmailStore(vault)).data)).toEqual(['a'])
  })

  it('gibt eine Revision zurück, mit der sofort weitergeschrieben werden kann', async () => {
    const first = await saveEmailStore(vault, store(['a']), NO_REVISION)
    if (!first.ok) throw new Error('erster Write muss klappen')
    const second = await saveEmailStore(vault, store(['a', 'b']), first.revision)
    expect(second.ok).toBe(true)
  })

  it('behält Felder, die der Schreiber gar nicht kennt', async () => {
    // Ein neueres Gerät legt ein Zusatzfeld ab. Der Renderer schickt beim
    // Speichern nur emails + lastFetchedAt zurück — das Feld darf trotzdem
    // nicht verschwinden.
    await foreignWrite(store(['a'], { geraeteMerker: { laptop: '2026-08-30' } }))
    const snap = await loadEmailStore(vault)
    const result = await saveEmailStore(vault, { emails: [{ id: 'a' }, { id: 'b' }], lastFetchedAt: {} }, snap.revision)
    expect(result.ok).toBe(true)
    const after = await loadEmailStore(vault)
    expect(after.data.geraeteMerker).toEqual({ laptop: '2026-08-30' })
    expect(ids(after.data)).toEqual(['a', 'b'])
  })

  it('hinterlässt keine Temporärdateien', async () => {
    await saveEmailStore(vault, store(['a']), NO_REVISION)
    const entries = await fs.readdir(path.join(vault, '.mindgraph'))
    expect(entries).toEqual(['email-store.json'])
  })
})

describe('mutateEmailStore — Lesen-Ändern-Schreiben', () => {
  it('arbeitet auf dem frischen Stand, nicht auf einem alten Schnappschuss', async () => {
    await foreignWrite(store(['a']))
    // Anderes Gerät schiebt 'b' nach, während der Abruf läuft.
    await foreignWrite(store(['a', 'b']))

    const out = await mutateEmailStore(vault, (data) => ({
      data: { ...data, emails: [...data.emails, { id: 'neu' }] },
      result: data.emails.length
    }))

    expect(out.written).toBe(true)
    expect(out.result).toBe(2)
    expect(ids((await loadEmailStore(vault)).data)).toEqual(['a', 'b', 'neu'])
  })

  it('schreibt nicht, wenn der Mutator nichts zu tun hat', async () => {
    await foreignWrite(store(['a']))
    const before = (await fs.stat(emailStorePath(vault))).mtimeMs
    const out = await mutateEmailStore(vault, () => null)
    expect(out.written).toBe(false)
    expect((await fs.stat(emailStorePath(vault))).mtimeMs).toBe(before)
  })

  it('serialisiert nebenläufige Änderungen — kein Lost Update im selben Prozess', async () => {
    await saveEmailStore(vault, store([]), NO_REVISION)

    // 20 gleichzeitige Anhänge. Ohne Sperre würden die meisten davon einander
    // überschreiben (jeder liest denselben leeren Stand).
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        mutateEmailStore(vault, (data) => ({
          data: { ...data, emails: [...data.emails, { id: `m${i}` }] },
          result: null
        }))
      )
    )

    const final = await loadEmailStore(vault)
    expect(final.data.emails).toHaveLength(20)
    expect(new Set(ids(final.data)).size).toBe(20)
  })

  it('reißt die Warteschlange nicht ab, wenn ein Mutator wirft', async () => {
    await saveEmailStore(vault, store(['a']), NO_REVISION)
    await expect(mutateEmailStore(vault, () => { throw new Error('kaputt') })).rejects.toThrow('kaputt')

    // Der nächste Zugriff muss trotzdem durchkommen.
    const out = await mutateEmailStore(vault, (data) => ({
      data: { ...data, emails: [...data.emails, { id: 'b' }] },
      result: null
    }))
    expect(out.written).toBe(true)
    expect(ids((await loadEmailStore(vault)).data)).toEqual(['a', 'b'])
  })

  it('reiht sich hinter einen laufenden saveEmailStore ein', async () => {
    await saveEmailStore(vault, store(['a']), NO_REVISION)
    const snap = await loadEmailStore(vault)

    const [saved, mutated] = await Promise.all([
      saveEmailStore(vault, store(['a', 'renderer']), snap.revision),
      mutateEmailStore(vault, (data) => ({
        data: { ...data, emails: [...data.emails, { id: 'abruf' }] },
        result: null
      }))
    ])

    // Die Sperre arbeitet in Aufrufreihenfolge ab: erst der Renderer-Write auf
    // seiner noch gültigen Revision, dann der Mutator, der dessen Ergebnis
    // frisch liest. Beide Änderungen überleben.
    expect(saved.ok).toBe(true)
    expect(mutated.written).toBe(true)
    const final = ids((await loadEmailStore(vault)).data)
    expect(final).toContain('abruf')
    expect(final).toContain('renderer')
  })
})

describe('beschädigte Datei', () => {
  const kaputt = '{ "emails": [ {"id": "a"'

  async function writeKaputt(): Promise<void> {
    const file = emailStorePath(vault)
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file, kaputt, 'utf-8')
  }

  it('wird nicht von einer leeren Liste überschrieben', async () => {
    await writeKaputt()
    const result = await saveEmailStore(vault, store([]), null)
    expect(result.ok).toBe(false)
    expect(await fs.readFile(emailStorePath(vault), 'utf-8')).toBe(kaputt)
  })

  it('wird auch mit passender Revision nicht überschrieben', async () => {
    await writeKaputt()
    const snap = await loadEmailStore(vault)
    const result = await saveEmailStore(vault, store([]), snap.revision)
    expect(result.ok).toBe(false)
    expect(await fs.readFile(emailStorePath(vault), 'utf-8')).toBe(kaputt)
  })

  it('wird von mutateEmailStore in Ruhe gelassen', async () => {
    await writeKaputt()
    const out = await mutateEmailStore(vault, (data) => ({
      data: { ...data, emails: [...data.emails, { id: 'neu' }] },
      result: null
    }))
    expect(out.written).toBe(false)
    expect(await fs.readFile(emailStorePath(vault), 'utf-8')).toBe(kaputt)
  })
})

// ── Der gemeldete Fall ─────────────────────────────────────────────────────
describe('der gemeldete Fall aus docs/email-store-multi-device-plan.md', () => {
  it('verliert keine Mails mehr, wenn zwei Geräte abwechselnd speichern', async () => {
    // Ausgangslage wie im Befund: Die Konflikt-Kopie hatte 198 Mails, die
    // Datei danach 186 — zwölf waren weg, weil das zweite Gerät seinen
    // kürzeren Stand komplett zurückschrieb.
    const alle = Array.from({ length: 198 }, (_, i) => `mail-${i}`)
    const nurAufGeraetB = alle.slice(0, 186)

    await saveEmailStore(vault, store(alle), NO_REVISION)

    // Gerät B hat die Liste vor einer Weile geladen (kennt nur 186) …
    const standVonB = store(nurAufGeraetB)
    // … und speichert zwischendurch, ohne den neuen Stand gesehen zu haben.
    const result = await saveEmailStore(vault, standVonB, 'veraltete-revision')
    expect(result.ok).toBe(true)

    const final = await loadEmailStore(vault)
    expect(final.data.emails).toHaveLength(198)
    for (const id of alle) {
      expect(ids(final.data)).toContain(id)
    }
  })

  it('lässt eine Mail überleben, die nur EIN Gerät je geholt hat', async () => {
    await saveEmailStore(vault, store(['bekannt']), NO_REVISION)
    const snap = await loadEmailStore(vault)

    // Gerät A holt eine Mail, die Gerät B nie gesehen hat.
    await foreignWrite(store(['bekannt', 'nur-auf-geraet-a']))

    // Gerät B speichert seinen Stand ohne diese Mail — früher war sie damit weg,
    // und weil der Abruf-Merker mitgewandert war, holte B sie auch nie nach.
    await saveEmailStore(vault, snap.data, snap.revision)

    expect(ids((await loadEmailStore(vault)).data)).toContain('nur-auf-geraet-a')
  })
})

// ── Übernahme des Altbestands ──────────────────────────────────────────────
describe('Übernahme der alten emails.json', () => {
  async function writeLegacy(data: unknown): Promise<void> {
    const file = legacyEmailStorePath(vault)
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file, JSON.stringify(data, null, 2), 'utf-8')
  }

  it('bringt den Altbestand beim ersten Laden ein', async () => {
    await writeLegacy(store(['alt-1', 'alt-2']))
    const snap = await loadEmailStore(vault, { deviceId: 'geraet-a' })
    expect(ids(snap.data)).toEqual(['alt-1', 'alt-2'])
    expect(snap.data.storeVersion).toBe(2)
  })

  it('lässt die alte Datei dabei unangetastet — sie ist die Arbeitsdatei alter Geräte', async () => {
    await writeLegacy(store(['alt-1']))
    const vorher = await fs.readFile(legacyEmailStorePath(vault), 'utf-8')
    await loadEmailStore(vault, { deviceId: 'geraet-a' })
    expect(await fs.readFile(legacyEmailStorePath(vault), 'utf-8')).toBe(vorher)
  })

  it('bringt ihn kein zweites Mal ein', async () => {
    await writeLegacy(store(['alt-1']))
    await loadEmailStore(vault, { deviceId: 'geraet-a' })

    // Die Mail wird geloescht und ein Grabstein gesetzt — sie darf beim
    // naechsten Start nicht aus der Altdatei wieder auferstehen.
    const snap = await loadEmailStore(vault, { deviceId: 'geraet-a' })
    await saveEmailStore(vault, { ...snap.data, emails: [], deleted: { 'alt-1': '2026-08-25T10:00:00.000Z' } }, snap.revision)

    const danach = await loadEmailStore(vault, { deviceId: 'geraet-a' })
    expect(ids(danach.data)).toEqual([])
  })

  it('lässt ein später aktualisiertes Zweitgerät seinen eigenen Altbestand einbringen', async () => {
    // Geraet A ist schon umgestiegen und hat seinen Stand im neuen Format.
    await writeLegacy(store(['gemeinsam']))
    await loadEmailStore(vault, { deviceId: 'geraet-a' })

    // Wochen spaeter aktualisiert Geraet B. Dessen alte Datei hat inzwischen
    // eigene Mails — die duerfen beim Wechsel nicht verloren gehen.
    await writeLegacy(store(['gemeinsam', 'nur-auf-geraet-b']))
    const snapB = await loadEmailStore(vault, { deviceId: 'geraet-b' })

    expect(ids(snapB.data)).toContain('nur-auf-geraet-b')
    expect(ids(snapB.data)).toContain('gemeinsam')
    expect(Object.keys(snapB.data.legacyImported || {}).sort()).toEqual(['geraet-a', 'geraet-b'])
  })

  it('übernimmt eine beschädigte alte Datei nicht und lässt sie liegen', async () => {
    const file = legacyEmailStorePath(vault)
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file, '{ kaputt', 'utf-8')
    const snap = await loadEmailStore(vault, { deviceId: 'geraet-a' })
    expect(snap.data.emails).toEqual([])
    expect(await fs.readFile(file, 'utf-8')).toBe('{ kaputt')
  })

  it('vermerkt auch ohne Altdatei, dass dieses Gerät durch ist', async () => {
    const snap = await loadEmailStore(vault, { deviceId: 'geraet-a' })
    expect(snap.data.legacyImported?.['geraet-a']).toBeTruthy()
  })

  it('rührt nichts an, wenn keine Geräte-Kennung übergeben wird', async () => {
    await writeLegacy(store(['alt-1']))
    const snap = await loadEmailStore(vault)
    expect(snap.exists).toBe(false)
  })
})

// ── Fail-closed beim Lesen ─────────────────────────────────────────────────
describe('Lesefehler und beschädigte Struktur', () => {
  it('meldet strukturell beschädigte Dateien als unlesbar und schützt sie', async () => {
    for (const inhalt of ['[]', 'null', '{"emails":"kaputt"}', '{"emails":[{"betreff":"ohne Kennung"}]}', '{"emails":[],"lastFetchedAt":{},"deleted":{"a":7}}', '{"storeVersion":2}', '{"emails":[]}']) {
      const file = emailStorePath(vault)
      await fs.mkdir(path.dirname(file), { recursive: true })
      await fs.writeFile(file, inhalt, 'utf-8')

      const snap = await loadEmailStore(vault)
      expect(snap.readable, inhalt).toBe(false)
      expect(snap.reason, inhalt).toBeTruthy()

      const result = await saveEmailStore(vault, store([]), snap.revision)
      expect(result.ok, inhalt).toBe(false)
      expect(await fs.readFile(file, 'utf-8'), inhalt).toBe(inhalt)
    }
  })

  it('hält ein Verzeichnis an der Stelle der Datei nicht für „gibt es nicht"', async () => {
    // Irgendein Lesefehler, der NICHT ENOENT ist. Frueher galt jeder Fehler als
    // „Datei fehlt" — und der naechste Schreibvorgang haette losgelegt.
    await fs.mkdir(emailStorePath(vault), { recursive: true })
    const snap = await loadEmailStore(vault)
    expect(snap.exists).toBe(true)
    expect(snap.readable).toBe(false)
  })
})
