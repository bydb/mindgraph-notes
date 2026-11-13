import { describe, it, expect } from 'vitest'
import JSZip from 'jszip'
import { deflateSync } from 'zlib'
import {
  buildPptxFromTemplate,
  inspectPptxTemplate,
  describePptxTemplate,
  checkPptxConsistency,
  normalizeDrawingPlaceholderRuns,
  parseBodyText,
  estimateFill,
  readImageMeta,
  cleanText,
  crc32,
  PptxInputError
} from './pptxTemplate'

// ── Synthetische Mini-Vorlage ──────────────────────────────────────────────
// Master mit Logo-Bild, drei Layouts (Titel, Titel+Inhalt mit Fußzeile, Bild),
// optional eine Musterfolie mit Notiz, Kommentar und Abschnittsliste.

const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"'
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const D = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
const GRP = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>'

function rels(items: [string, string, string][]): string {
  return `${D}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${items.map(([id, t, target]) => `<Relationship Id="${id}" Type="${R}/${t}" Target="${target}"/>`).join('')}</Relationships>`
}

function ph(id: number, name: string, phAttrs: string, xfrm = '', text = ''): string {
  const sp = xfrm ? `<p:spPr><a:xfrm>${xfrm}</a:xfrm></p:spPr>` : '<p:spPr/>'
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${name}"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph ${phAttrs}/></p:nvPr></p:nvSpPr>${sp}<p:txBody><a:bodyPr/><a:lstStyle/><a:p>${text}</a:p></p:txBody></p:sp>`
}

const BOX = (x: number, y: number, cx: number, cy: number): string => `<a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/>`

// 1x1-PNG (gültige Signatur und IHDR) — reicht für Verweise und Maße.
const PNG_1x1 = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'))
// Echtes, vollständiges PNG (Graustufen) mit gültigen Prüfsummen.
function makePng(w: number, h: number): Uint8Array {
  const chunk = (type: string, data: Uint8Array): Buffer => {
    const td = Buffer.concat([Buffer.from(type, 'ascii'), Buffer.from(data)])
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(td))
    return Buffer.concat([len, td, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8 // Bittiefe
  ihdr[9] = 0 // Graustufen
  const raw = Buffer.alloc((w + 1) * h)
  return new Uint8Array(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', new Uint8Array())]))
}

interface TplOpts {
  samples?: 'none' | 'plain' | 'footer'
  notesMaster?: boolean
  sections?: boolean
  layoutHf?: string
  mainCt?: string
  footerText?: string
}

async function buildTemplate(o: TplOpts = {}): Promise<Uint8Array> {
  const samples = o.samples ?? 'plain'
  const zip = new JSZip()
  const overrides: string[] = [
    '<Override PartName="/ppt/presentation.xml" ContentType="' + (o.mainCt ?? 'application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml') + '"/>',
    '<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>',
    '<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>',
    '<Override PartName="/ppt/slideLayouts/slideLayout2.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>',
    '<Override PartName="/ppt/slideLayouts/slideLayout3.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>',
    '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>'
  ]
  zip.file('_rels/.rels', rels([['rId1', 'officeDocument', 'ppt/presentation.xml']]))

  // Master: Titel/Text/Fußzeile mit Geometrie, Logo als freies Bild, Textstile.
  zip.file(
    'ppt/slideMasters/slideMaster1.xml',
    `${D}<p:sldMaster ${NS}><p:cSld><p:spTree>${GRP}` +
      ph(2, 'Titel', 'type="title"', BOX(457200, 274638, 8229600, 1143000)) +
      ph(3, 'Text', 'type="body" idx="1"', BOX(457200, 1600200, 8229600, 4525963)) +
      ph(4, 'Fußzeile', 'type="ftr" sz="quarter" idx="3"', BOX(3124200, 6356350, 2895600, 365125)) +
      ph(5, 'Foliennummer', 'type="sldNum" sz="quarter" idx="4"', BOX(6553200, 6356350, 2133600, 365125)) +
      `<p:pic><p:nvPicPr><p:cNvPr id="9" name="Logo"/><p:cNvPicPr/><p:nvPr userDrawn="1"/></p:nvPicPr><p:blipFill><a:blip r:embed="rId9"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm>${BOX(7000000, 100000, 1500000, 400000)}</a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>` +
      `</p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>` +
      '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/><p:sldLayoutId id="2147483650" r:id="rId2"/><p:sldLayoutId id="2147483651" r:id="rId3"/></p:sldLayoutIdLst>' +
      '<p:txStyles><p:titleStyle><a:lvl1pPr><a:defRPr sz="4400"/></a:lvl1pPr></p:titleStyle><p:bodyStyle><a:lvl1pPr><a:defRPr sz="2800"/></a:lvl1pPr></p:bodyStyle><p:otherStyle><a:lvl1pPr><a:defRPr sz="1800"/></a:lvl1pPr></p:otherStyle></p:txStyles></p:sldMaster>'
  )
  zip.file(
    'ppt/slideMasters/_rels/slideMaster1.xml.rels',
    rels([
      ['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml'],
      ['rId2', 'slideLayout', '../slideLayouts/slideLayout2.xml'],
      ['rId3', 'slideLayout', '../slideLayouts/slideLayout3.xml'],
      ['rId4', 'theme', '../theme/theme1.xml'],
      ['rId9', 'image', '../media/logo.png']
    ])
  )
  zip.file('ppt/media/logo.png', PNG_1x1)
  zip.file('ppt/theme/theme1.xml', `${D}<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Test"><a:themeElements/></a:theme>`)

  const footer = o.footerText ?? 'Medienzentrum · {{VERAN</a:t></a:r><a:r><a:rPr b="1"/><a:t>STALTUNG}}'
  const footerRun = `<a:r><a:rPr lang="de-DE"/><a:t>${footer}</a:t></a:r>`
  const hf = o.layoutHf ?? ''
  zip.file(
    'ppt/slideLayouts/slideLayout1.xml',
    `${D}<p:sldLayout ${NS} type="title"><p:cSld name="Titelfolie"><p:spTree>${GRP}` +
      ph(2, 'Titel 1', 'type="ctrTitle"', BOX(685800, 2130425, 7772400, 1470025)) +
      ph(3, 'Untertitel 2', 'type="subTitle" idx="1"', BOX(1371600, 3886200, 6400800, 1752600)) +
      ph(4, 'Fußzeile 3', 'type="ftr" sz="quarter" idx="11"', '', footerRun) +
      `</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>${hf}</p:sldLayout>`
  )
  zip.file(
    'ppt/slideLayouts/slideLayout2.xml',
    `${D}<p:sldLayout ${NS} type="cust"><p:cSld name="Inhalt Hausstil"><p:spTree>${GRP}` +
      ph(2, 'Titel 1', 'type="title"') +
      ph(3, 'Inhalt 2', 'idx="1"') +
      ph(4, 'Fußzeile 3', 'type="ftr" sz="quarter" idx="11"', '', footerRun) +
      ph(5, 'Foliennummer 4', 'type="sldNum" sz="quarter" idx="12"', '', '<a:fld id="{1}" type="slidenum"><a:rPr lang="de-DE"/><a:t>‹#›</a:t></a:fld>') +
      `</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>${hf}</p:sldLayout>`
  )
  zip.file(
    'ppt/slideLayouts/slideLayout3.xml',
    `${D}<p:sldLayout ${NS} type="picTx"><p:cSld name="Bild mit Text"><p:spTree>${GRP}` +
      ph(2, 'Titel 1', 'type="title"', BOX(457200, 274638, 4000000, 1000000)) +
      `<p:sp><p:nvSpPr><p:cNvPr id="3" name="Bild 2"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="pic" idx="1"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm>${BOX(4800000, 1600000, 4000000, 4000000)}</a:xfrm></p:spPr></p:sp>` +
      ph(4, 'Text 3', 'type="body" sz="half" idx="2"', BOX(457200, 1600000, 4000000, 4000000)) +
      `</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`
  )
  for (let i = 1; i <= 3; i++) zip.file(`ppt/slideLayouts/_rels/slideLayout${i}.xml.rels`, rels([['rId1', 'slideMaster', '../slideMasters/slideMaster1.xml']]))

  const presRels: [string, string, string][] = [['rId1', 'slideMaster', 'slideMasters/slideMaster1.xml'], ['rId2', 'theme', 'theme/theme1.xml']]
  let sldIdLst = ''
  let notesMasterIdLst = ''
  if (o.notesMaster) {
    presRels.push(['rId3', 'notesMaster', 'notesMasters/notesMaster1.xml'])
    notesMasterIdLst = '<p:notesMasterIdLst><p:notesMasterId r:id="rId3"/></p:notesMasterIdLst>'
    zip.file('ppt/notesMasters/notesMaster1.xml', `${D}<p:notesMaster ${NS}><p:cSld><p:spTree>${GRP}</p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/></p:notesMaster>`)
    zip.file('ppt/notesMasters/_rels/notesMaster1.xml.rels', rels([['rId1', 'theme', '../theme/theme1.xml']]))
    overrides.push('<Override PartName="/ppt/notesMasters/notesMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesMaster+xml"/>')
  }
  if (samples !== 'none') {
    presRels.push(['rId10', 'slide', 'slides/slide1.xml'])
    sldIdLst = '<p:sldIdLst><p:sldId id="256" r:id="rId10"/></p:sldIdLst>'
    const footerShapes = samples === 'footer' ? ph(4, 'Fußzeile', 'type="ftr" sz="quarter" idx="11"', '', '<a:r><a:t>x</a:t></a:r>') + ph(5, 'Nummer', 'type="sldNum" sz="quarter" idx="12"') : ''
    zip.file(
      'ppt/slides/slide1.xml',
      `${D}<p:sld ${NS}><p:cSld><p:spTree>${GRP}${ph(2, 'Titel', 'type="title"', '', '<a:r><a:t>Muster</a:t></a:r>')}` +
        `<p:pic><p:nvPicPr><p:cNvPr id="3" name="Beispielfoto"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rId3"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr/></p:pic>${footerShapes}` +
        '</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>'
    )
    const slideRels: [string, string, string][] = [['rId1', 'slideLayout', '../slideLayouts/slideLayout2.xml'], ['rId2', 'comments', '../comments/comment1.xml'], ['rId3', 'image', '../media/foto.png']]
    zip.file('ppt/comments/comment1.xml', `${D}<p:cmLst ${NS}/>`)
    zip.file('ppt/media/foto.png', PNG_1x1)
    overrides.push('<Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>')
    overrides.push('<Override PartName="/ppt/comments/comment1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.comments+xml"/>')
    if (o.notesMaster) {
      slideRels.push(['rId4', 'notesSlide', '../notesSlides/notesSlide1.xml'])
      zip.file('ppt/notesSlides/notesSlide1.xml', `${D}<p:notes ${NS}><p:cSld><p:spTree>${GRP}</p:spTree></p:cSld></p:notes>`)
      zip.file('ppt/notesSlides/_rels/notesSlide1.xml.rels', rels([['rId1', 'notesMaster', '../notesMasters/notesMaster1.xml'], ['rId2', 'slide', '../slides/slide1.xml']]))
      overrides.push('<Override PartName="/ppt/notesSlides/notesSlide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml"/>')
    }
    zip.file('ppt/slides/_rels/slide1.xml.rels', rels(slideRels))
  }
  const sections = o.sections
    ? '<p:extLst><p:ext uri="{521415D9-36F7-43E2-AB2F-B90AF26B5E84}"><p14:sectionLst xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main"><p14:section name="Teil 1" id="{A}"><p14:sldIdLst><p14:sldId id="256"/></p14:sldIdLst></p14:section></p14:sectionLst></p:ext></p:extLst>'
    : ''
  zip.file(
    'ppt/presentation.xml',
    `${D}<p:presentation ${NS}><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>${notesMasterIdLst}${sldIdLst}<p:sldSz cx="9144000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/>${sections}</p:presentation>`
  )
  zip.file('ppt/_rels/presentation.xml.rels', rels(presRels))
  zip.file('docProps/app.xml', '<?xml version="1.0"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Slides>1</Slides><Notes>1</Notes></Properties>')
  overrides.push('<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>')
  zip.file(
    '[Content_Types].xml',
    `${D}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/>${overrides.join('')}</Types>`
  )
  zip.file('_rels/.rels', rels([['rId1', 'officeDocument', 'ppt/presentation.xml'], ['rId2', 'extended-properties', 'docProps/app.xml']]))
  return zip.generateAsync({ type: 'uint8array' })
}

async function open(bytes: Uint8Array): Promise<JSZip> {
  return JSZip.loadAsync(bytes)
}
async function text(zip: JSZip, path: string): Promise<string> {
  const f = zip.file(path)
  if (!f) throw new Error(`fehlt: ${path}`)
  return f.async('string')
}

// ── Vorlage lesen ──────────────────────────────────────────────────────────

describe('inspectPptxTemplate', () => {
  it('liest Layouts mit Art, Platzhaltern und Feldern', async () => {
    const info = await inspectPptxTemplate(await buildTemplate())
    expect(info.layouts.map(l => [l.name, l.kind])).toEqual([
      ['Titelfolie', 'title'],
      ['Inhalt Hausstil', 'content'], // type="cust" → aus den Platzhaltern abgeleitet
      ['Bild mit Text', 'picture']
    ])
    // Geometrie und Schrift erbt der Inhaltsplatzhalter vom Master-Textbereich.
    const content = info.layouts[1].placeholders.find(p => p.type === 'obj')!
    expect(content.box?.cy).toBe(4525963)
    expect(content.fontPt).toBe(28)
    // {{VERANSTALTUNG}} ist über zwei Läufe zerlegt und wird trotzdem gefunden.
    expect(info.fields).toEqual(['VERANSTALTUNG'])
    expect(info.sampleSlideCount).toBe(1)
  })

  it('meldet Gestaltung, die nur auf Musterfolien liegt', async () => {
    const info = await inspectPptxTemplate(await buildTemplate())
    expect(info.sampleDecorations).toEqual([{ slide: 1, layoutName: 'Inhalt Hausstil', pictures: 1, shapes: 0, background: false }])
    expect(describePptxTemplate(info)).toContain('fehlt auf neuen Folien')
  })

  it('lehnt Makro-, Strict- und Nicht-ZIP-Dateien verständlich ab', async () => {
    await expect(inspectPptxTemplate(new TextEncoder().encode('kein zip'))).rejects.toThrow(/kein ZIP/)
    await expect(inspectPptxTemplate(await buildTemplate({ mainCt: 'application/vnd.ms-powerpoint.presentation.macroEnabled.main+xml' }))).rejects.toThrow(/Makros/)
    const strict = await open(await buildTemplate())
    strict.file('ppt/presentation.xml', (await text(strict, 'ppt/presentation.xml')).replace('xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"', 'xmlns:p="http://purl.oclc.org/ooxml/presentationml/main"'))
    await expect(inspectPptxTemplate(await strict.generateAsync({ type: 'uint8array' }))).rejects.toThrow(/Strict/)
  })

  it('lehnt Archive mit zu vielen Teilen ab, bevor entpackt wird', async () => {
    const zip = await open(await buildTemplate())
    for (let i = 0; i < 3001; i++) zip.file(`junk/${i}.xml`, '')
    await expect(inspectPptxTemplate(await zip.generateAsync({ type: 'uint8array' }))).rejects.toThrow(/zu viele Teile/)
  })
})

// ── Präsentation bauen ─────────────────────────────────────────────────────

describe('buildPptxFromTemplate', () => {
  it('ersetzt die Musterfolien durch neue Folien und bleibt konsistent', async () => {
    const res = await buildPptxFromTemplate(await buildTemplate({ notesMaster: true, sections: true }), {
      slides: [
        { title: 'Willkommen', subtitle: 'Fortbildung' },
        { title: 'Agenda', body: '- Eins\n- Zwei\n  - Unterpunkt\n**Fazit** ohne Punkt', notes: 'Begrüßen' }
      ]
    })
    expect(res.slideCount).toBe(2)
    expect(await checkPptxConsistency(res.bytes)).toEqual([])
    const zip = await open(res.bytes)
    // Musterfolie samt Kommentar, Notiz und Beispielfoto ist weg, das Master-Logo bleibt.
    expect(zip.file('ppt/comments/comment1.xml')).toBeNull()
    expect(zip.file('ppt/media/foto.png')).toBeNull()
    expect(zip.file('ppt/media/logo.png')).not.toBeNull()
    const pres = await text(zip, 'ppt/presentation.xml')
    expect(pres).not.toContain('sectionLst') // zeigte auf die gelöschte Folie
    expect(pres.match(/<p:sldId /g)).toHaveLength(2)
    expect(await text(zip, 'docProps/app.xml')).toContain('<Slides>2</Slides>')
    const ct = await text(zip, '[Content_Types].xml')
    expect(ct).not.toContain('comment1.xml')
  })

  it('setzt Titel/Untertitel in die Platzhalter des gewählten Layouts', async () => {
    const res = await buildPptxFromTemplate(await buildTemplate(), { slides: [{ title: 'Hallo & „Welt"', subtitle: 'Zweite Zeile' }] })
    const zip = await open(res.bytes)
    const slide = await text(zip, 'ppt/slides/slide1.xml')
    expect(slide).toContain('<p:ph type="ctrTitle"/>')
    expect(slide).toContain('<p:ph type="subTitle" idx="1"/>')
    expect(slide).toContain('Hallo &amp; „Welt&quot;')
    expect(await text(zip, 'ppt/slides/_rels/slide1.xml.rels')).toContain('slideLayout1.xml')
  })

  it('schreibt Aufzählungsebenen, Nummern, Absätze ohne Punkt und Fettdruck', async () => {
    const res = await buildPptxFromTemplate(await buildTemplate(), { slides: [{ layout: 'Inhalt Hausstil', title: 'T', body: 'Einleitung\n- A\n  - B\n1. Erster\n- **fett** normal' }] })
    const slide = await text(await open(res.bytes), 'ppt/slides/slide1.xml')
    expect(slide).toContain('<a:pPr marL="0" indent="0"><a:buNone/></a:pPr>')
    expect(slide).toContain('<a:pPr lvl="1"/>')
    expect(slide).toContain('<a:buAutoNum type="arabicPeriod"/>')
    expect(slide).toMatch(/b="1"[^>]*\/><a:t>fett<\/a:t>/)
  })

  it('füllt zerlegte {{FELDER}} in Layouts und meldet leere', async () => {
    const res = await buildPptxFromTemplate(await buildTemplate({ samples: 'none' }), {
      slides: [{ layout: 'content', title: 'T', body: '- x' }],
      fields: { veranstaltung: 'KI-Tag 2026' }
    })
    expect(res.filled).toEqual(['VERANSTALTUNG'])
    const zip = await open(res.bytes)
    expect(await text(zip, 'ppt/slideLayouts/slideLayout2.xml')).toContain('Medienzentrum · KI-Tag 2026')
    // Auf der Folie steht eine Kopie der Fußzeile (PowerPoint zeigt sonst keine).
    expect(await text(zip, 'ppt/slides/slide1.xml')).toContain('Medienzentrum · KI-Tag 2026')

    const empty = await buildPptxFromTemplate(await buildTemplate({ samples: 'none' }), { slides: [{ layout: 'content', title: 'T' }] })
    expect(empty.unfilled).toEqual(['VERANSTALTUNG'])
    expect(empty.notes.join(' ')).toContain('Felder ohne Wert')
  })

  describe('Fußzeile', () => {
    const footerOf = async (bytes: Uint8Array, n = 1): Promise<string[]> => {
      const slide = await text(await open(bytes), `ppt/slides/slide${n}.xml`)
      return [...slide.matchAll(/<p:ph type="(ftr|sldNum|dt)"/g)].map(m => m[1])
    }
    it('ohne Musterfolien: Fußzeilentext und Nummer, aber nicht auf der Titelfolie', async () => {
      const res = await buildPptxFromTemplate(await buildTemplate({ samples: 'none' }), { slides: [{ title: 'A' }, { layout: 'content', title: 'B', body: '- x' }], fields: { VERANSTALTUNG: 'X' } })
      expect(await footerOf(res.bytes, 1)).toEqual([])
      expect(await footerOf(res.bytes, 2)).toEqual(['ftr', 'sldNum'])
      expect(await text(await open(res.bytes), 'ppt/slides/slide2.xml')).toContain('type="slidenum"')
    })
    it('p:hf des Layouts schaltet ab', async () => {
      const res = await buildPptxFromTemplate(await buildTemplate({ samples: 'none', layoutHf: '<p:hf sldNum="0"/>' }), { slides: [{ layout: 'content', title: 'B', body: '- x' }] })
      expect(await footerOf(res.bytes)).toEqual(['ftr'])
    })
    it('mit Musterfolien zählt, was die Musterfolien zeigen', async () => {
      const without = await buildPptxFromTemplate(await buildTemplate({ samples: 'plain' }), { slides: [{ layout: 'content', title: 'B', body: '- x' }] })
      expect(await footerOf(without.bytes)).toEqual([])
      const withFooter = await buildPptxFromTemplate(await buildTemplate({ samples: 'footer' }), { slides: [{ layout: 'content', title: 'B', body: '- x' }] })
      expect(await footerOf(withFooter.bytes)).toEqual(['ftr', 'sldNum'])
    })
    it('Musterfolien zählen nur für ihr eigenes Layout', async () => {
      // Musterfolie (ohne Fußzeile) nutzt "Inhalt Hausstil"; "Bild mit Text" hat keine Musterfolie
      // und auch keine Fußzeilen-Platzhalter → dort entsteht keine Fußzeile, aber auch kein Fehler.
      const res = await buildPptxFromTemplate(await buildTemplate({ samples: 'footer' }), { slides: [{ layout: 'Bild mit Text', title: 'B', body: 'x' }] })
      expect(await footerOf(res.bytes)).toEqual([])
    })
  })

  it('legt Sprechernotizen an — auch wenn die Vorlage keinen Notizenmaster hat', async () => {
    const res = await buildPptxFromTemplate(await buildTemplate({ notesMaster: false }), { slides: [{ layout: 'content', title: 'T', body: '- x', notes: 'Zeile 1\nZeile 2' }] })
    expect(await checkPptxConsistency(res.bytes)).toEqual([])
    const zip = await open(res.bytes)
    const pres = await text(zip, 'ppt/presentation.xml')
    // Schema-Reihenfolge: notesMasterIdLst direkt nach sldMasterIdLst, vor sldIdLst.
    expect(pres).toMatch(/<\/p:sldMasterIdLst><p:notesMasterIdLst><p:notesMasterId r:id="rId\d+"\/><\/p:notesMasterIdLst><p:sldIdLst>/)
    const notesRels = await text(zip, 'ppt/notesSlides/_rels/notesSlide1.xml.rels')
    expect(notesRels).toContain('notesMaster')
    expect(notesRels).toContain('../slides/slide1.xml')
    expect(await text(zip, 'ppt/notesSlides/notesSlide1.xml')).toContain('Zeile 2')
    expect(await text(zip, 'ppt/slides/_rels/slide1.xml.rels')).toContain('notesSlide')
    // Theme des neuen Notizenmasters ist eine Kopie, kein geteilter Part.
    expect(await text(zip, 'ppt/notesMasters/_rels/notesMaster1.xml.rels')).toContain('theme2.xml')
  })

  it('setzt ein Bild beschnitten in den Bildplatzhalter (keine Verzerrung)', async () => {
    const res = await buildPptxFromTemplate(await buildTemplate(), {
      slides: [{ title: 'Bild', body: 'Text daneben', image: 'foto.png' }],
      images: { 'foto.png': makePng(400, 100) }
    })
    expect(await checkPptxConsistency(res.bytes)).toEqual([])
    const zip = await open(res.bytes)
    const slide = await text(zip, 'ppt/slides/slide1.xml')
    expect(slide).toContain('<p:ph type="pic" idx="1"/>')
    // 4:1-Bild in quadratischen Rahmen: links und rechts je 37,5 % weg.
    expect(slide).toContain('<a:srcRect l="37500" r="37500"/>')
    expect(await text(zip, 'ppt/slides/_rels/slide1.xml.rels')).toMatch(/media\/mgimage1\.png/)
  })

  it('lehnt unbekannte Layouts mit Liste, fehlende Bilder und zu viel Text ab', async () => {
    const tpl = await buildTemplate()
    const err = await buildPptxFromTemplate(tpl, { slides: [{ layout: 'Gibt es nicht', title: 'x' }] }).catch(e => e)
    expect(err).toBeInstanceOf(PptxInputError)
    expect(err.message).toContain('"Inhalt Hausstil" (content)')
    await expect(buildPptxFromTemplate(tpl, { slides: [{ title: 'x', image: 'fehlt.png' }] })).rejects.toThrow(/liegt nicht vor/)
    const long = Array.from({ length: 20 }, (_, i) => `- Punkt ${i} mit einem langen Satz, der sicher umbricht und Platz braucht`).join('\n')
    await expect(buildPptxFromTemplate(tpl, { slides: [{ layout: 'content', title: 'x', body: long }] })).rejects.toThrow(/zu viel Text/)
    await expect(buildPptxFromTemplate(tpl, { slides: [] })).rejects.toThrow(/Keine Folien/)
    await expect(buildPptxFromTemplate(tpl, { slides: Array.from({ length: 41 }, () => ({ title: 'x' })) })).rejects.toThrow(/Zu viele Folien/)
  })

  it('verkleinert knapp zu vollen Text per normAutofit statt abzulehnen', async () => {
    const body = Array.from({ length: 8 }, (_, i) => `- Punkt ${i} mit etwas Text dazu`).join('\n')
    const res = await buildPptxFromTemplate(await buildTemplate(), { slides: [{ layout: 'content', title: 'x', body }] })
    const slide = await text(await open(res.bytes), 'ppt/slides/slide1.xml')
    expect(slide).toMatch(/<a:normAutofit fontScale="\d+000"/)
    expect(res.notes.join(' ')).toMatch(/Schrift auf \d+ % verkleinert/)
  })

  it('lehnt Titel/Untertitel ab, für die das Layout keinen Platz hat (statt sie still zu verlieren)', async () => {
    const tpl = await buildTemplate()
    await expect(buildPptxFromTemplate(tpl, { slides: [{ layout: 'Inhalt Hausstil', title: 'T', subtitle: 'weg?' }] })).rejects.toThrow(/keinen Untertitelbereich/)
  })

  it('Notizfolie trägt dieselben Platzhalter-Indizes wie der Notizenmaster', async () => {
    const res = await buildPptxFromTemplate(await buildTemplate({ notesMaster: false }), { slides: [{ layout: 'content', title: 'T', body: '- x', notes: 'n' }] })
    const zip = await open(res.bytes)
    const nm = await text(zip, 'ppt/notesMasters/notesMaster1.xml')
    const ns = await text(zip, 'ppt/notesSlides/notesSlide1.xml')
    for (const type of ['sldImg', 'body']) {
      const idx = new RegExp(`<p:ph type="${type}"[^>]*idx="(\\d+)"`).exec(nm)![1]
      expect(ns).toContain(`<p:ph type="${type}" idx="${idx}"/>`)
    }
  })

  it('wählt gleichnamige Layouts nur mit [Master n] und lehnt die mehrdeutige Angabe ab', async () => {
    const zip = await open(await buildTemplate())
    // Zweites Layout umbenennen, sodass zwei Layouts "Titelfolie" heißen (gleicher Master reicht für die Mehrdeutigkeit).
    zip.file('ppt/slideLayouts/slideLayout2.xml', (await text(zip, 'ppt/slideLayouts/slideLayout2.xml')).replace('name="Inhalt Hausstil"', 'name="Titelfolie"'))
    const tpl = await zip.generateAsync({ type: 'uint8array' })
    await expect(buildPptxFromTemplate(tpl, { slides: [{ layout: 'Titelfolie', title: 'x' }] })).rejects.toThrow(/mehrfach.*#1, #2/)
    // Per Nummer eindeutig wählbar.
    const ok = await buildPptxFromTemplate(tpl, { slides: [{ layout: '#2', title: 'x', body: '- y' }] })
    expect(await text(await open(ok.bytes), 'ppt/slides/_rels/slide1.xml.rels')).toContain('slideLayout2.xml')
  })

  it('liest Kommentare und rohe > in Attributen nicht als Struktur', async () => {
    const zip = await open(await buildTemplate({ samples: 'none' }))
    const l2 = await text(zip, 'ppt/slideLayouts/slideLayout2.xml')
    zip.file(
      'ppt/slideLayouts/slideLayout2.xml',
      l2.replace('<p:cSld name="Inhalt Hausstil">', '<p:cSld name="Inhalt Hausstil"><!-- <p:sp><p:nvSpPr><p:nvPr><p:ph type="pic"/></p:nvPr></p:nvSpPr></p:sp> -->').replace('name="Titel 1"', 'name="Titel 1" descr="a > b"')
    )
    const info = await inspectPptxTemplate(await zip.generateAsync({ type: 'uint8array' }))
    const l = info.layouts.find(x => x.name === 'Inhalt Hausstil')!
    expect(l.placeholders.map(p => p.type)).toEqual(['title', 'obj', 'ftr', 'sldNum'])
  })

  describe('Quellenfolie (Webrecherche)', () => {
    const src = (n: number, url = `https://beispiel${n}.de/artikel`) => ({ title: `Artikel ${n}`, url, fetchedAt: '2026-10-01T12:00:00Z' })

    it('kennzeichnet nur teilweise gelesene Seiten auf der Quellenfolie (Codex F17)', async () => {
      const res = await buildPptxFromTemplate(await buildTemplate({ samples: 'none' }), {
        slides: [{ layout: 'content', title: 'Inhalt', body: '- x' }],
        sources: [{ ...src(1), partial: true }, src(2)]
      })
      expect(await checkPptxConsistency(res.bytes)).toEqual([])
      const slide = await text(await open(res.bytes), 'ppt/slides/slide2.xml')
      expect(slide).toContain('beispiel1.de · abgerufen am 01.10.2026 · nur Seitenanfang gelesen')
      expect(slide).toContain('beispiel2.de · abgerufen am 01.10.2026</a:t>')
    })

    it('nicht lesbare Seite steht mit Vermerk, ohne Datum (Codex F18)', async () => {
      const res = await buildPptxFromTemplate(await buildTemplate({ samples: 'none' }), {
        slides: [{ layout: 'content', title: 'Inhalt', body: '- x' }],
        sources: [src(1), { title: 'shop.de', url: 'https://shop.de/stores', fetchedAt: '', unread: true }]
      })
      expect(await checkPptxConsistency(res.bytes)).toEqual([])
      const slide = await text(await open(res.bytes), 'ppt/slides/slide2.xml')
      expect(slide).toContain('shop.de · nicht gelesen, nur im Browser lesbar')
    })

    it('hängt eine Folie „Quellen" mit echten Links an und ersetzt die des Modells', async () => {
      const res = await buildPptxFromTemplate(await buildTemplate({ samples: 'none' }), {
        slides: [{ layout: 'content', title: 'Inhalt', body: '- x' }, { layout: 'content', title: 'Quellen', body: '- erfundene Quelle' }],
        sources: [src(1), src(2), src(1)] // doppelt → einmal
      })
      expect(await checkPptxConsistency(res.bytes)).toEqual([])
      expect(res.slideCount).toBe(2)
      expect(res.notes.join(' ')).toContain('Eigene Quellenfolie(n) des Modells entfernt und durch die belegte Quellenliste ersetzt: „Quellen"')
      const zip = await open(res.bytes)
      const slide = await text(zip, 'ppt/slides/slide2.xml')
      expect(slide).toContain('<a:t>Quellen</a:t>')
      expect(slide).not.toContain('erfundene Quelle')
      expect(slide.match(/<a:hlinkClick r:id="rId\d+"\/>/g)).toHaveLength(2)
      expect(slide).toContain('beispiel1.de · abgerufen am 01.10.2026')
      const rels = await text(zip, 'ppt/slides/_rels/slide2.xml.rels')
      expect(rels).toContain('Target="https://beispiel1.de/artikel" TargetMode="External"')
    })

    it('verteilt viele Quellen auf Folgefolien und lässt unsichere Adressen weg', async () => {
      const res = await buildPptxFromTemplate(await buildTemplate({ samples: 'none' }), {
        slides: [{ layout: 'content', title: 'Inhalt', body: '- x' }],
        sources: [...Array.from({ length: 7 }, (_, k) => src(k)), src(99, 'javascript:alert(1)'), src(98, 'file:///etc/passwd')]
      })
      expect(res.slideCount).toBe(3)
      const zip = await open(res.bytes)
      expect(await text(zip, 'ppt/slides/slide3.xml')).toContain('Quellen (Fortsetzung)')
      const all = (await text(zip, 'ppt/slides/_rels/slide2.xml.rels')) + (await text(zip, 'ppt/slides/_rels/slide3.xml.rels'))
      expect(all).not.toContain('javascript:')
      expect(all).not.toContain('file:')
    })

    it('meldet „ohne Webquellen", fremde Links im Text und erkennt Titelvarianten', async () => {
      const res = await buildPptxFromTemplate(await buildTemplate({ samples: 'none' }), {
        slides: [
          { layout: 'content', title: 'Inhalt', body: '- siehe https://fremd.example/x und https://beispiel1.de/artikel', notes: 'Mehr: https://noch.example' },
          { layout: 'content', title: 'Weiterführende Links', body: '- https://fremd.example' },
          { layout: 'content', title: 'Quellen 1', body: '- erfunden' }
        ],
        sources: [src(1)]
      })
      expect(res.slideCount).toBe(2) // Inhalt + App-Quellenfolie, beide Modell-Quellenfolien raus
      const all = res.notes.join(' ')
      expect(all).toContain('Ungeprüfte Links im Folientext')
      expect(all).toContain('https://fremd.example/x')
      expect(all).toContain('https://noch.example')
      expect(all).not.toMatch(/Ungeprüfte[^]*beispiel1\.de/) // abgerufen → belegt

      const none = await buildPptxFromTemplate(await buildTemplate({ samples: 'none' }), { slides: [{ layout: 'content', title: 'X', body: '- y' }], sources: [] })
      expect(none.slideCount).toBe(1)
      expect(none.notes.join(' ')).toContain('Ohne Webquellen')
    })

    it('nimmt lange, aber gültig abgerufene Adressen auf (bis 2048 Zeichen)', async () => {
      const long = `https://beispiel.de/${'a'.repeat(2020)}`
      const res = await buildPptxFromTemplate(await buildTemplate({ samples: 'none' }), { slides: [{ layout: 'content', title: 'X', body: '- y' }], sources: [src(1, long)] })
      expect(await text(await open(res.bytes), 'ppt/slides/_rels/slide2.xml.rels')).toContain(long)
    })

    it('lehnt ab, wenn kein Layout Titel und Inhalt für die Quellenfolie hat', async () => {
      const zip = await open(await buildTemplate({ samples: 'none' }))
      // Inhaltsplatz aus Layout 2 und Text aus Layout 3 entfernen → kein nutzbares Quellenlayout.
      zip.file('ppt/slideLayouts/slideLayout2.xml', (await text(zip, 'ppt/slideLayouts/slideLayout2.xml')).replace(/<p:sp><p:nvSpPr><p:cNvPr id="3" name="Inhalt 2"\/>[\s\S]*?<\/p:sp>/, ''))
      zip.file('ppt/slideLayouts/slideLayout3.xml', (await text(zip, 'ppt/slideLayouts/slideLayout3.xml')).replace(/<p:sp><p:nvSpPr><p:cNvPr id="4" name="Text 3"\/>[\s\S]*?<\/p:sp>/, ''))
      const tpl = await zip.generateAsync({ type: 'uint8array' })
      await expect(buildPptxFromTemplate(tpl, { slides: [{ layout: 'Titelfolie', title: 'X' }], sources: [src(1)] })).rejects.toThrow(/Quellenfolie/)
    })

    it('eine Folie „Links" (linke Seite) bleibt, lange Quellentitel werden sichtbar gekürzt', async () => {
      const res = await buildPptxFromTemplate(await buildTemplate({ samples: 'none' }), {
        slides: [{ layout: 'content', title: 'Links', body: '- Argument für links' }],
        sources: [{ title: 'T'.repeat(300), url: 'https://beispiel.de/a', fetchedAt: '2026-10-01' }]
      })
      expect(res.slideCount).toBe(2)
      const zip = await open(res.bytes)
      expect(await text(zip, 'ppt/slides/slide1.xml')).toContain('Argument für links')
      expect(await text(zip, 'ppt/slides/slide2.xml')).toContain(`${'T'.repeat(109)}…`)
    })

    it('ohne Webrecherche bleibt eine Folie „Quellen" des Modells unangetastet', async () => {
      const res = await buildPptxFromTemplate(await buildTemplate({ samples: 'none' }), { slides: [{ layout: 'content', title: 'Quellen', body: '- Buch' }] })
      expect(await text(await open(res.bytes), 'ppt/slides/slide1.xml')).toContain('Buch')
    })
  })

  it('macht aus einer .potx-Vorlage eine normale Präsentation', async () => {
    const res = await buildPptxFromTemplate(await buildTemplate({ mainCt: 'application/vnd.openxmlformats-officedocument.presentationml.template.main+xml' }), { slides: [{ title: 'x' }] })
    const ct = await text(await open(res.bytes), '[Content_Types].xml')
    expect(ct).toContain('presentationml.presentation.main+xml')
    expect(ct).not.toContain('template.main+xml')
  })

  it('entfernt in XML verbotene Zeichen aus dem Text', async () => {
    const res = await buildPptxFromTemplate(await buildTemplate(), { slides: [{ title: 'A\u0000B\u0007C\uD800' }] })
    const slide = await text(await open(res.bytes), 'ppt/slides/slide1.xml')
    expect(slide).toContain('<a:t>ABC</a:t>')
  })
})

// ── Bausteine ──────────────────────────────────────────────────────────────

describe('Bausteine', () => {
  it('parseBodyText erkennt Ebenen, Nummern und Absätze', () => {
    expect(parseBodyText('Intro\n- a\n  - b\n    - c\n      - d\n1. n\n\n## Kopf')).toEqual([
      { level: 0, kind: 'plain', text: 'Intro' },
      { level: 0, kind: 'bullet', text: 'a' },
      { level: 1, kind: 'bullet', text: 'b' },
      { level: 2, kind: 'bullet', text: 'c' },
      { level: 3, kind: 'bullet', text: 'd' },
      { level: 0, kind: 'number', text: 'n' },
      { level: 0, kind: 'plain', text: 'Kopf' }
    ])
  })

  it('normalizeDrawingPlaceholderRuns zieht nur zerlegte Platzhalter zusammen', () => {
    const split = '<a:p><a:r><a:rPr b="1"/><a:t>Hallo {{NA</a:t></a:r><a:r><a:t>ME}}</a:t></a:r></a:p>'
    expect(normalizeDrawingPlaceholderRuns(split)).toBe('<a:p><a:r><a:rPr b="1"/><a:t>Hallo {{NAME}}</a:t></a:r></a:p>')
    // Läufe vor und nach dem zerlegten Platzhalter behalten ihre Formatierung.
    const around = '<a:p><a:r><a:rPr i="1"/><a:t>Vorne </a:t></a:r><a:r><a:t>{{A</a:t></a:r><a:r><a:rPr b="1"/><a:t>B}}</a:t></a:r><a:r><a:rPr u="sng"/><a:t> hinten</a:t></a:r></a:p>'
    // Tabulator zwischen den Hälften: kein Platzhalter, nichts wird zusammengezogen.
    const tab = '<a:p><a:r><a:t>{{NA</a:t></a:r><a:tab/><a:r><a:t>ME}}</a:t></a:r></a:p>'
    expect(normalizeDrawingPlaceholderRuns(tab)).toBe(tab)
    expect(normalizeDrawingPlaceholderRuns(around)).toBe('<a:p><a:r><a:rPr i="1"/><a:t>Vorne </a:t></a:r><a:r><a:t>{{AB}}</a:t></a:r><a:r><a:rPr u="sng"/><a:t> hinten</a:t></a:r></a:p>')
    const whole = '<a:p><a:r><a:t>{{NAME}}</a:t></a:r><a:r><a:rPr i="1"/><a:t> danach</a:t></a:r></a:p>'
    expect(normalizeDrawingPlaceholderRuns(whole)).toBe(whole)
  })

  it('estimateFill wächst mit Textmenge', () => {
    const box = { x: 0, y: 0, cx: 8229600, cy: 4525963 }
    const few = estimateFill([{ level: 0, text: 'kurz' }], box, 28)
    const many = estimateFill(Array.from({ length: 12 }, () => ({ level: 0, text: 'ein mittellanger Aufzählungspunkt' })), box, 28)
    expect(few).toBeLessThan(0.3)
    expect(many).toBeGreaterThan(1)
  })

  it('readImageMeta prüft die Signatur, nicht den Namen', () => {
    expect(readImageMeta(makePng(640, 480))).toEqual({ ext: 'png', width: 640, height: 480 })
    expect(readImageMeta(new TextEncoder().encode('<svg></svg>'))).toBeNull()
    // Minimaler JPEG-Kopf: SOI, APP0 (Länge 16), SOF0 mit 200x100.
    const jpegHead = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, ...new Array(14).fill(0), 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x64, 0x00, 0xc8, 0x03, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    const sos = [0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0x12, 0x34]
    expect(readImageMeta(Uint8Array.from([...jpegHead, ...sos, 0xff, 0xd9]))).toEqual({ ext: 'jpeg', width: 200, height: 100 })
    // Kopf + Endmarker ohne Scan-Daten ist kein Bild.
    expect(readImageMeta(Uint8Array.from([...jpegHead, 0xff, 0xd9]))).toBeNull()
    // PNG mit Anhängsel hinter IEND wird abgelehnt.
    expect(readImageMeta(Uint8Array.from([...makePng(4, 4), 1, 2, 3]))).toBeNull()
    // Abgeschnitten (kein End-of-Image) und verfälschtes PNG werden abgelehnt.
    expect(readImageMeta(Uint8Array.from(jpegHead))).toBeNull()
    const broken = makePng(10, 10)
    broken[20] ^= 0xff // Höhe im IHDR verändert, Prüfsumme passt nicht mehr
    expect(readImageMeta(broken)).toBeNull()
    expect(readImageMeta(makePng(10, 10).slice(0, 40))).toBeNull()
  })

  it('cleanText lässt Umlaute, Emojis und Zeilenumbrüche stehen', () => {
    expect(cleanText('Grüße 👋\nTab\tok')).toBe('Grüße 👋\nTab\tok')
  })
})

// ── Mitgelieferte Vorlage „MindGraph Hausstil" ─────────────────────────────

describe('MindGraph-Hausstil-Vorlage', () => {
  const load = async (): Promise<Uint8Array> => {
    const { readFile } = await import('fs/promises')
    const { fileURLToPath } = await import('url')
    const p = fileURLToPath(new URL('../../resources/starter-skills/praesentation-nach-vorlage/MindGraph-Hausstil.pptx', import.meta.url))
    return new Uint8Array(await readFile(p))
  }

  it('ist selbst konsistent und hat die erwarteten Layouts', async () => {
    const tpl = await load()
    expect(await checkPptxConsistency(tpl)).toEqual([])
    const info = await inspectPptxTemplate(tpl)
    expect(info.layouts.map(l => [l.name, l.kind])).toEqual([
      ['Titelfolie', 'title'],
      ['Titelfolie mit Bild', 'title'],
      ['Titel und Inhalt', 'content'],
      ['Zwei Inhalte', 'two-content'],
      ['Abschnitt', 'section'],
      ['Nur Titel', 'title-only'],
      ['Bild mit Text', 'picture'],
      ['Abschluss', 'content'], // Dachzeile zählt nicht als Inhaltsfläche
      ['Drei Karten', 'cards'],
      ['Vier Karten', 'cards'],
      ['Karten mit Kernaussage', 'cards'],
      ['Vier Karten mit Kernaussage', 'cards'],
      ['Text mit Kernaussage', 'content'], // Kernaussage zählt nicht als Inhaltsfläche
      ['Drei Schritte', 'cards'],
      ['Vier Schritte', 'cards'],
      ['Kennzahlen', 'cards'],
      ['Drei Punkte', 'cards'],
      ['Vier Punkte', 'cards'],
      ['Fünf Punkte', 'cards'],
      ['Vier Punkte mit Kernaussage', 'cards'],
      ['Dokument und Erläuterung', 'two-content'],
      ['Zeitleiste', 'title-only'],
      ['Ablauf mit Schleife', 'title-only'],
      ['Balkendiagramm', 'title-only'],
      ['Balkendiagramm mit Text', 'content']
    ])
    expect(info.fields).toEqual(['ANLASS'])
    expect(describePptxTemplate(info)).toContain('Dachzeile, Titel, Inhalt')
  })

  it('setzt die Dachzeile in ihren Platzhalter, nie in den Inhalt', async () => {
    const res = await buildPptxFromTemplate(await load(), {
      slides: [{ layout: 'Bild mit Text', kicker: 'Beispiel', title: 'T', body: '- Text links' }]
    })
    const slide = await text(await open(res.bytes), 'ppt/slides/slide1.xml')
    expect(slide).toMatch(/name="Dachzeile"[\s\S]*?<a:t>Beispiel<\/a:t>/)
    expect(slide).toMatch(/idx="2"[\s\S]*?<a:t>Text links<\/a:t>/) // Text-Platzhalter, nicht die Dachzeile (idx 13)
  })

  it('erkennt die Dachzeile nur am ganzen Namen, nicht an Teilwörtern', async () => {
    const zip = await open(await buildTemplate({ samples: 'none' }))
    // Inhaltsplatzhalter heißt „Rubrik-Inhalt" → bleibt Inhalt; „Dachzeile 1" wäre eine Dachzeile.
    zip.file('ppt/slideLayouts/slideLayout2.xml', (await text(zip, 'ppt/slideLayouts/slideLayout2.xml')).replace('name="Inhalt 2"', 'name="Rubrik-Inhalt"'))
    const res = await buildPptxFromTemplate(await zip.generateAsync({ type: 'uint8array' }), { slides: [{ layout: 'content', title: 'T', body: '- x' }] })
    expect(await text(await open(res.bytes), 'ppt/slides/slide1.xml')).toMatch(/name="Rubrik-Inhalt"[\s\S]*?<a:t>x<\/a:t>/)
  })

  it('lehnt eine Dachzeile auf Layouts ohne Dachzeile ab', async () => {
    await expect(buildPptxFromTemplate(await load(), { slides: [{ layout: 'Titelfolie', kicker: 'X', title: 'T' }] })).rejects.toThrow(/keine Dachzeile/)
  })

  it('Fußzeile ohne Anlass endet nicht auf einem Trennpunkt', async () => {
    const res = await buildPptxFromTemplate(await load(), { slides: [{ layout: 'Titel und Inhalt', title: 'T', body: '- x' }] })
    const layout = await text(await open(res.bytes), 'ppt/slideLayouts/slideLayout3.xml')
    expect(layout).toContain('<a:t>MindGraph Notes</a:t>')
    expect(res.unfilled).toEqual(['ANLASS'])
  })

  it('setzt Karten in ihre Plätze: Rubrik, Titel, Text als Ebenen; Hervorhebung über die Akzentfarbe', async () => {
    const res = await buildPptxFromTemplate(await load(), {
      slides: [{
        layout: 'Karten mit Kernaussage', kicker: 'Lage', title: 'T',
        items: [{ label: 'Eins', title: 'Erste', text: 'Kurz.' }, { title: 'Zweite', text: '- Punkt' }, { title: 'Dritte', highlight: true }],
        takeaway: 'Ein Satz.'
      }]
    })
    expect(await checkPptxConsistency(res.bytes)).toEqual([])
    const slide = await text(await open(res.bytes), 'ppt/slides/slide1.xml')
    expect(slide).toMatch(/name="Karte 1"[\s\S]*?<a:pPr lvl="0"\/>[\s\S]*?<a:t>Eins<\/a:t>[\s\S]*?<a:pPr lvl="1"\/>[\s\S]*?<a:t>Erste<\/a:t>[\s\S]*?<a:pPr lvl="2"\/>[\s\S]*?<a:t>Kurz\.<\/a:t>/)
    expect(slide).toContain('<a:t>– Punkt</a:t>')
    expect(slide).toMatch(/name="Karte 3"[^]*?<a:schemeClr val="accent1"><a:lumMod/)
    expect(slide.match(/<a:schemeClr val="accent1"><a:lumMod/g)).toHaveLength(1)
    expect(slide).toMatch(/name="Kernaussage"[\s\S]*?<a:t>Ein Satz\.<\/a:t>/)
  })

  it('wählt ohne Layoutangabe das Karten-Layout mit passender Platzzahl', async () => {
    const tpl = await load()
    const four = await buildPptxFromTemplate(tpl, { slides: [{ title: 'Start' }, { title: 'T', items: [1, 2, 3, 4].map(n => ({ title: `K${n}` })) }] })
    expect(await text(await open(four.bytes), 'ppt/slides/_rels/slide2.xml.rels')).toContain('slideLayout10.xml') // Vier Karten
    const three = await buildPptxFromTemplate(tpl, { slides: [{ title: 'Start' }, { title: 'T', items: [1, 2, 3].map(n => ({ title: `K${n}` })), takeaway: 'Satz' }] })
    expect(await text(await open(three.bytes), 'ppt/slides/_rels/slide2.xml.rels')).toContain('slideLayout11.xml') // Karten mit Kernaussage
  })

  it('lehnt Karten ohne Plätze, zu viele Karten und Kernaussage ohne Balken ab', async () => {
    const tpl = await load()
    await expect(buildPptxFromTemplate(tpl, { slides: [{ layout: 'Titel und Inhalt', title: 'T', items: [{ title: 'x' }] }] })).rejects.toThrow(/keine Karten-Plätze/)
    await expect(buildPptxFromTemplate(tpl, { slides: [{ layout: 'Drei Karten', title: 'T', items: [1, 2, 3, 4].map(n => ({ title: `K${n}` })) }] })).rejects.toThrow(/nur 3 Plätze/)
    await expect(buildPptxFromTemplate(tpl, { slides: [{ layout: 'Titel und Inhalt', title: 'T', body: '- x', takeaway: 'Satz' }] })).rejects.toThrow(/Kernaussage/)
    await expect(buildPptxFromTemplate(tpl, { slides: [{ layout: 'Drei Karten', title: 'T', items: [{ title: 'K', text: 'x'.repeat(401) }] }] })).rejects.toThrow(/Text zu lang/)
  })

  it('Schritte und Kennzahlen: weniger Einträge als Plätze werden gemeldet', async () => {
    const res = await buildPptxFromTemplate(await load(), { slides: [{ layout: 'Kennzahlen', title: 'T', items: [{ label: 'A', title: '78 %', text: 'nutzen es' }, { title: '41 %' }] }] })
    expect(res.notes.join(' ')).toContain('2 von 3 Plätzen belegt')
  })

  it('Schritte: Anzahl muss passen, Hervorhebung als Rahmen statt Füllung', async () => {
    const tpl = await load()
    const steps = (n: number) => Array.from({ length: n }, (_, k) => ({ title: `S${k + 1}` }))
    await expect(buildPptxFromTemplate(tpl, { slides: [{ layout: 'Vier Schritte', title: 'T', items: steps(3) }] })).rejects.toThrow(/fest 4 nummerierte Schritte/)
    await expect(buildPptxFromTemplate(tpl, { slides: [{ layout: 'Drei Schritte', title: 'T' }] })).rejects.toThrow(/fest 3 nummerierte Schritte/)
    const res = await buildPptxFromTemplate(tpl, { slides: [{ layout: 'Drei Schritte', title: 'T', items: [{ title: 'A' }, { title: 'B', highlight: true }, { title: 'C' }] }] })
    const slide = await text(await open(res.bytes), 'ppt/slides/slide1.xml')
    expect(slide).toMatch(/name="Schritt 2"[^]*?<p:spPr><a:noFill\/><a:ln w="28575">/)
    // Gefüllte Karten werden weiter getönt, nicht umrandet.
    const cards = await buildPptxFromTemplate(tpl, { slides: [{ layout: 'Drei Karten', title: 'T', items: [{ title: 'A', highlight: true }, { title: 'B' }, { title: 'C' }] }] })
    const cs = await text(await open(cards.bytes), 'ppt/slides/slide1.xml')
    expect(cs).toContain('<a:lumMod val="13000"/>')
    expect(cs).not.toContain('w="28575"')
  })

  it('layout "cards" wählt nach Anzahl und Kernaussage; Schritte nur bei genauer Anzahl', async () => {
    const tpl = await load()
    const pick = async (slide: Record<string, unknown>) =>
      (await text(await open((await buildPptxFromTemplate(tpl, { slides: [slide as never] })).bytes), 'ppt/slides/_rels/slide1.xml.rels')).match(/slideLayout(\d+)\.xml/)![1]
    expect(await pick({ layout: 'cards', title: 'T', items: [1, 2, 3, 4].map(n => ({ title: `K${n}` })) })).toBe('10') // Vier Karten, nicht Vier Schritte oder Vier Punkte
    expect(await pick({ layout: 'cards', title: 'T', items: [1, 2, 3].map(n => ({ title: `K${n}` })), takeaway: 'Satz' })).toBe('11') // Karten mit Kernaussage, nicht Kennzahlen oder Drei Schritte
    expect(await pick({ layout: 'cards', title: 'T', items: [1, 2, 3, 4].map(n => ({ title: `K${n}` })), takeaway: 'Satz' })).toBe('12') // Vier Karten mit Kernaussage
  })

  it('highlight nur als true/false und höchstens einmal je Folie; Links in Karten werden geprüft', async () => {
    const tpl = await load()
    await expect(buildPptxFromTemplate(tpl, { slides: [{ layout: 'Drei Karten', title: 'T', items: [{ title: 'A', highlight: 'false' as never }] }] })).rejects.toThrow(/true oder false/)
    await expect(buildPptxFromTemplate(tpl, { slides: [{ layout: 'Drei Karten', title: 'T', items: [{ title: 'A', highlight: true }, { title: 'B', highlight: true }] }] })).rejects.toThrow(/höchstens eine Karte/)
    const res = await buildPptxFromTemplate(tpl, {
      slides: [{ layout: 'Drei Karten', title: 'T', items: [{ title: 'A', text: 'siehe https://fremd.example/karte' }, { title: 'B' }, { title: 'C' }] }],
      sources: [{ title: 'Q', url: 'https://beispiel.de/q', fetchedAt: '2026-10-01' }]
    })
    expect(res.notes.join(' ')).toContain('https://fremd.example/karte')
  })
  it('Symbole: Kreis in der Akzentfarbe und Linienzeichnung je Karte; unbekannter Name wird gemeldet, nie leer', async () => {
    const res = await buildPptxFromTemplate(await load(), {
      slides: [{ layout: 'Drei Karten', title: 'T', items: [{ title: 'A', icon: 'lupe' }, { title: 'B', icon: 'Chat' }, { title: 'C', icon: 'einhorn' }] }]
    })
    expect(await checkPptxConsistency(res.bytes)).toEqual([])
    const slide = await text(await open(res.bytes), 'ppt/slides/slide1.xml')
    expect(slide.match(/name="Symbolkreis \d"/g)).toHaveLength(3)
    expect(slide).toMatch(/name="Symbolkreis 1"[^]*?<a:prstGeom prst="ellipse">[^]*?<a:schemeClr val="accent1"\/>/)
    expect(slide).toMatch(/name="Symbol lupe"[^]*?<a:custGeom>[^]*?<a:path w="2400" h="2400" fill="none">/)
    expect(slide).toContain('name="Symbol sprechblase"') // „Chat" ist ein anderes Wort dafür
    expect(slide).toContain('name="Symbolpunkt 3"')
    expect(res.notes.join(' ')).toContain('Symbol "einhorn" gibt es nicht')
    // Der Kreis liegt dort, wo das Layout „Symbol 1" hinlegt — die Form selbst bleibt im Layout unsichtbar.
    const layout = await text(await open(res.bytes), 'ppt/slideLayouts/slideLayout9.xml')
    const anchor = /name="Symbol 1"[^]*?<a:off x="(\d+)" y="(\d+)"\/>/.exec(layout)!
    expect(slide).toContain(`<a:off x="${anchor[1]}" y="${anchor[2]}"/>`)
    expect(layout).toMatch(/name="Symbol 1"[^]*?<a:noFill\/><a:ln><a:noFill\/><\/a:ln>/)
  })

  it('Symbole ohne Angabe: Punkt im Kreis; Layout ohne Symbolplätze lässt icon weg und sagt es', async () => {
    const tpl = await load()
    const plain = await buildPptxFromTemplate(tpl, { slides: [{ layout: 'Drei Karten', title: 'T', items: [{ title: 'A' }, { title: 'B' }, { title: 'C' }] }] })
    expect((await text(await open(plain.bytes), 'ppt/slides/slide1.xml')).match(/name="Symbolpunkt \d"/g)).toHaveLength(3)
    expect(plain.notes.join(' ')).not.toContain('Symbol')
    const rows = await buildPptxFromTemplate(tpl, { slides: [{ layout: 'Drei Punkte', title: 'T', items: [{ title: 'A', icon: 'lupe' }, { title: 'B' }, { title: 'C' }] }] })
    expect(await text(await open(rows.bytes), 'ppt/slides/slide1.xml')).not.toContain('custGeom')
    expect(rows.notes.join(' ')).toContain('zeigt keine Symbole')
    await expect(buildPptxFromTemplate(tpl, { slides: [{ layout: 'Drei Karten', title: 'T', items: [{ title: 'A', icon: 7 as never }] }] })).rejects.toThrow(/"icon" muss Text sein/)
  })

  it('Abschnittsfolie trägt das Symbol der Folie im großen Kreis', async () => {
    const tpl = await load()
    const res = await buildPptxFromTemplate(tpl, { slides: [{ layout: 'Abschnitt', kicker: 'Teil 1 · 20 Min.', title: 'Grundlagen', subtitle: 'Worum es geht', icon: 'Glühbirne' }, { layout: 'Titel und Inhalt', title: 'T', body: '- x', icon: 'lupe' }] })
    expect(await checkPptxConsistency(res.bytes)).toEqual([])
    const zip = await open(res.bytes)
    expect(await text(zip, 'ppt/slides/slide1.xml')).toMatch(/name="Symbol gluehbirne"[^]*?<a:schemeClr val="bg1"\/>/)
    expect(await text(zip, 'ppt/slides/slide2.xml')).not.toContain('custGeom')
    expect(res.notes.join(' ')).toContain('keinen Platz für ein Symbol')
    expect(describePptxTemplate(await inspectPptxTemplate(tpl))).toMatch(/"Abschnitt" — section — .*Symbol der Folie \(icon\)[^]*Symbole \(nur diese Namen\): .*lupe/)
  })

  it('Hinweisbalken: takeaway landet bei Schritten im hellen „Merksatz"', async () => {
    const tpl = await load()
    const res = await buildPptxFromTemplate(tpl, { slides: [{ layout: 'Drei Schritte', title: 'T', items: [{ title: 'A' }, { title: 'B' }, { title: 'C' }], takeaway: 'Achtung: nur im Testvault.' }] })
    expect(await text(await open(res.bytes), 'ppt/slides/slide1.xml')).toMatch(/name="Merksatz"[\s\S]*?<a:t>Achtung: nur im Testvault\.<\/a:t>/)
    expect(describePptxTemplate(await inspectPptxTemplate(tpl))).toContain('Hinweisbalken (takeaway)')
  })

  it('Punktelisten verlangen die genaue Anzahl; die Tafel links nimmt die Kernaussage', async () => {
    const tpl = await load()
    const pts = (n: number) => Array.from({ length: n }, (_, k) => ({ title: `P${k + 1}`, text: 'kurz' }))
    await expect(buildPptxFromTemplate(tpl, { slides: [{ layout: 'Fünf Punkte', title: 'T', items: pts(4) }] })).rejects.toThrow(/fest 5 nummerierte Schritte/)
    const res = await buildPptxFromTemplate(tpl, { slides: [{ layout: 'Vier Punkte mit Kernaussage', title: 'T', items: pts(4), takeaway: 'Ein Satz.' }] })
    expect(await checkPptxConsistency(res.bytes)).toEqual([])
    expect(await text(await open(res.bytes), 'ppt/slides/slide1.xml')).toMatch(/name="Kernaussage"[\s\S]*?<a:t>Ein Satz\.<\/a:t>/)
  })

  it('erste Folie mit Bild nimmt von selbst die Titelfolie mit Bildhälfte, ohne Bild die schlichte', async () => {
    const tpl = await load()
    const layoutOf = async (bytes: Uint8Array) => (await text(await open(bytes), 'ppt/slides/_rels/slide1.xml.rels')).match(/slideLayout(\d+)\.xml/)![1]
    const withImage = await buildPptxFromTemplate(tpl, { slides: [{ title: 'Start', subtitle: 'Anlass', image: 'foto.png' }], images: { 'foto.png': makePng(400, 300) } })
    expect(await layoutOf(withImage.bytes)).toBe('2')
    expect(await text(await open(withImage.bytes), 'ppt/slides/slide1.xml')).toMatch(/<p:pic>[^]*?<p:ph type="pic" idx="2"\/>/)
    expect(await layoutOf((await buildPptxFromTemplate(tpl, { slides: [{ title: 'Start', subtitle: 'Anlass' }] })).bytes)).toBe('1')
  })

  it('Dokument und Erläuterung: body links im Blatt, body2 rechts', async () => {
    const res = await buildPptxFromTemplate(await load(), { slides: [{ layout: 'Dokument und Erläuterung', title: 'T', body: 'name: Protokoll', body2: '- Erklärung' }] })
    const slide = await text(await open(res.bytes), 'ppt/slides/slide1.xml')
    expect(slide).toMatch(/name="Dokument"[\s\S]*?<a:t>name: Protokoll<\/a:t>/)
    expect(slide).toMatch(/name="Erläuterung"[\s\S]*?<a:t>Erklärung<\/a:t>/)
  })

  it('Zeitleiste und Balkendiagramm: Layout findet sich von selbst, gezeichnet wird in die Fläche des Layouts', async () => {
    const tpl = await load()
    const blocks = [{ label: 'Einstieg', value: 10 }, { label: 'Werkstatt', value: 35, highlight: true }]
    const bars = [{ label: 'klein', value: 3.4 }, { label: 'groß', value: 19, highlight: true }]
    const res = await buildPptxFromTemplate(tpl, {
      slides: [
        { title: 'Ablauf', timeline: { blocks } },
        { title: 'Zahlen', chart: { bars } },
        { title: 'Zahlen mit Text', chart: { bars }, body: '- Erklärung' },
        { title: 'Zahlen mit Satz', chart: { bars }, takeaway: 'Ein Satz.' }
      ]
    })
    expect(await checkPptxConsistency(res.bytes)).toEqual([])
    const zip = await open(res.bytes)
    const layoutOf = async (n: number) => (await text(zip, `ppt/slides/_rels/slide${n}.xml.rels`)).match(/slideLayout(\d+)\.xml/)![1]
    expect([await layoutOf(1), await layoutOf(2), await layoutOf(3), await layoutOf(4)]).toEqual(['22', '24', '25', '24'])
    const s1 = await text(zip, 'ppt/slides/slide1.xml')
    expect(s1).toContain('name="Zeitleiste Werkstatt"')
    const ids = [...s1.matchAll(/<p:cNvPr id="(\d+)"/g)].map(m => m[1])
    expect(new Set(ids).size).toBe(ids.length) // auch mit Fußzeile dahinter keine doppelte ID
    expect(await text(zip, 'ppt/slides/slide3.xml')).toMatch(/name="Diagramm Balken 2"[^]*<a:t>Erklärung<\/a:t>|<a:t>Erklärung<\/a:t>[^]*name="Diagramm Balken 2"/)
    expect(await text(zip, 'ppt/slides/slide4.xml')).toMatch(/name="Kernaussage"[\s\S]*?<a:t>Ein Satz\.<\/a:t>/)
    expect(describePptxTemplate(await inspectPptxTemplate(tpl))).toMatch(/"Zeitleiste" — title-only — .*Zeitleiste \(timeline\)[^]*"Balkendiagramm" — title-only — .*Balkendiagramm \(chart\)/)
  })

  it('Grafik ohne passende Fläche wird abgelehnt, Grafik-Layouts werden ohne Grafik nie von selbst gewählt', async () => {
    const tpl = await load()
    const blocks = [{ label: 'A', value: 10 }]
    await expect(buildPptxFromTemplate(tpl, { slides: [{ layout: 'Titel und Inhalt', title: 'T', timeline: { blocks } }] })).rejects.toThrow(/keine Fläche für eine Zeitleiste/)
    await expect(buildPptxFromTemplate(tpl, { slides: [{ layout: 'Zeitleiste', title: 'T', chart: { bars: [{ label: 'a', value: 1 }, { label: 'b', value: 2 }] } }] })).rejects.toThrow(/keine Fläche für ein Balkendiagramm/)
    await expect(buildPptxFromTemplate(tpl, { slides: [{ title: 'T', timeline: { blocks: [{ label: 'A', value: 'lang' as never }] } }] })).rejects.toThrow(/Folie 1, Abschnitt 1: "value"/)
    // Nur Titel bzw. Titel + Kernaussage: nie ein Layout mit leerer Grafikfläche.
    const res = await buildPptxFromTemplate(tpl, { slides: [{ title: 'Start' }, { title: 'Nur ein Titel', kicker: 'X' }, { title: 'Satz', takeaway: 'Ein Satz.' }] })
    const zip = await open(res.bytes)
    for (const n of [2, 3]) expect(Number((await text(zip, `ppt/slides/_rels/slide${n}.xml.rels`)).match(/slideLayout(\d+)\.xml/)![1])).toBeLessThan(22)
  })

  it('Schritte: Symbol nur, wenn eines genannt ist — dunkler Kreis neben der Ziffer, kein Ersatzpunkt', async () => {
    const tpl = await load()
    const res = await buildPptxFromTemplate(tpl, { slides: [{ layout: 'Drei Schritte', title: 'T', items: [{ title: 'A', icon: 'auge' }, { title: 'B' }, { title: 'C', icon: 'einhorn' }] }] })
    expect(await checkPptxConsistency(res.bytes)).toEqual([])
    const slide = await text(await open(res.bytes), 'ppt/slides/slide1.xml')
    expect(slide.match(/name="Symbolkreis \d"/g)).toEqual(['name="Symbolkreis 1"'])
    expect(slide).toMatch(/name="Symbolkreis 1"[^]*?<a:schemeClr val="tx2"\/>/)
    expect(slide).toContain('name="Symbol auge"')
    expect(slide).not.toContain('Symbolpunkt')
    expect(res.notes.join(' ')).toContain('Schritt 3: Symbol "einhorn" gibt es nicht — weggelassen')
    expect(describePptxTemplate(await inspectPptxTemplate(tpl))).toMatch(/"Drei Schritte" — cards — .*Symbol je Schritt möglich/)
  })

  it('Ablauf mit Schleife: Layout findet sich von selbst, Hinweisbalken darunter, falsche Schleife wird abgelehnt', async () => {
    const tpl = await load()
    const steps = [{ label: 'Auftrag' }, { label: 'Überlegen', loop: true }, { label: 'Handeln', loop: true }, { label: 'Entwurf', text: 'liegt bereit' }]
    const res = await buildPptxFromTemplate(tpl, { slides: [{ title: 'Schleife', flow: { steps, loopLabel: 'wiederholt sich' }, takeaway: 'Die App führt aus.' }] })
    expect(await checkPptxConsistency(res.bytes)).toEqual([])
    const zip = await open(res.bytes)
    expect((await text(zip, 'ppt/slides/_rels/slide1.xml.rels')).match(/slideLayout(\d+)\.xml/)![1]).toBe('23')
    const slide = await text(zip, 'ppt/slides/slide1.xml')
    expect(slide).toContain('name="Ablauf Rückpfeil Spitze"')
    expect(slide).toMatch(/name="Ablauf Handeln"[^]*?<a:solidFill><a:schemeClr val="accent1"\/>/)
    expect(slide).toMatch(/name="Merksatz"[\s\S]*?<a:t>Die App führt aus\.<\/a:t>/)
    const ids = [...slide.matchAll(/<p:cNvPr id="(\d+)"/g)].map(m => m[1])
    expect(new Set(ids).size).toBe(ids.length)
    const broken = [{ label: 'A', loop: true }, { label: 'B' }, { label: 'C', loop: true }]
    await expect(buildPptxFromTemplate(tpl, { slides: [{ title: 'T', flow: { steps: broken } }] })).rejects.toThrow(/nebeneinander/)
    await expect(buildPptxFromTemplate(tpl, { slides: [{ layout: 'Zeitleiste', title: 'T', flow: { steps } }] })).rejects.toThrow(/keine Fläche für einen Ablauf/)
  })

  it('F02: sichtbare oder beschriftete Formen namens „Diagramm"/„Symbol" sind Gestaltung, keine Plätze', async () => {
    const zip = await open(await load())
    const deco = (name: string, fill: string, textXml: string) =>
      `<p:sp><p:nvSpPr><p:cNvPr id="90" name="${name}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="6000000" y="2000000"/><a:ext cx="3000000" cy="2000000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom>${fill}</p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p>${textXml}</a:p></p:txBody></p:sp>`
    const red = '<a:solidFill><a:srgbClr val="FF0000"/></a:solidFill><a:ln><a:noFill/></a:ln>'
    const none = '<a:noFill/><a:ln><a:noFill/></a:ln>'
    const add = async (n: number, xml: string) => zip.file(`ppt/slideLayouts/slideLayout${n}.xml`, (await text(zip, `ppt/slideLayouts/slideLayout${n}.xml`)).replace('</p:spTree>', `${xml}</p:spTree>`))
    await add(3, deco('Diagramm', red, '')) // gefüllt
    await add(4, deco('Zeitleiste', none, '<a:r><a:rPr lang="de-DE"/><a:t>Beschriftung</a:t></a:r>')) // unsichtbar, aber mit Text
    await add(6, deco('Symbol', '<a:noFill/>', '')) // Linie nicht ausdrücklich aus → kann aus dem Stil kommen
    const tpl = await zip.generateAsync({ type: 'uint8array' })
    const info = await inspectPptxTemplate(tpl)
    expect(info.layouts[2].areas).toBeUndefined()
    expect(info.layouts[3].areas).toBeUndefined()
    expect(info.layouts[5].iconAnchors).toBeUndefined()
    // Das Layout bleibt in der Automatik: eine gewöhnliche Textfolie nimmt weiter „Titel und Inhalt".
    const res = await buildPptxFromTemplate(tpl, { slides: [{ title: 'Start' }, { title: 'Text', body: '- Punkt' }] })
    expect(await text(await open(res.bytes), 'ppt/slides/_rels/slide2.xml.rels')).toContain('slideLayout3.xml')
  })

  it('F03: eine zu kleine Fläche lehnt ab, statt über den Rand zu zeichnen', async () => {
    const zip = await open(await load())
    const p = 'ppt/slideLayouts/slideLayout22.xml'
    zip.file(p, (await text(zip, p)).replace(/(<p:cNvPr id="\d+" name="Zeitleiste"\/>[^]*?<a:ext cx=")\d+(")/, `$1${4 * 914400}$2`))
    const blocks = Array.from({ length: 8 }, (_, i) => ({ label: `B${i}`, value: 10 }))
    await expect(buildPptxFromTemplate(await zip.generateAsync({ type: 'uint8array' }), { slides: [{ title: 'T', timeline: { blocks } }] })).rejects.toThrow(/Zeitleiste braucht mindestens 8,2 Zoll Breite, die Fläche hat 4,0/)
  })

  it('F06: fehlt nur einzelnen Karten der Symbolplatz, wird jedes verlorene Symbol gemeldet', async () => {
    const zip = await open(await load())
    const p = 'ppt/slideLayouts/slideLayout9.xml'
    zip.file(p, (await text(zip, p)).replace('name="Symbol 2"', 'name="Zier 2"').replace('name="Symbol 3"', 'name="Zier 3"'))
    const res = await buildPptxFromTemplate(await zip.generateAsync({ type: 'uint8array' }), { slides: [{ layout: 'Drei Karten', title: 'T', items: [{ title: 'A', icon: 'lupe' }, { title: 'B', icon: 'auge' }, { title: 'C', icon: 'buch' }] }] })
    const lost = res.notes.filter(n => n.includes('keinen Symbolplatz'))
    expect(lost).toHaveLength(2)
    expect(lost[0]).toContain('Karte 2')
    // Ohne jeden Symbolplatz bleibt es bei EINEM Hinweis je Folie — auch wenn erst die zweite Karte ein Symbol nennt.
    const rows = await buildPptxFromTemplate(await load(), { slides: [{ layout: 'Drei Punkte', title: 'T', items: [{ title: 'A' }, { title: 'B', icon: 'lupe' }, { title: 'C', icon: 'auge' }] }] })
    expect(rows.notes.filter(n => n.includes('zeigt keine Symbole'))).toHaveLength(1)
  })

  it('F01: überlaufender Zahlentext erreicht die Folie nicht', async () => {
    await expect(buildPptxFromTemplate(await load(), { slides: [{ title: 'T', timeline: { blocks: [{ label: 'A', value: '9'.repeat(400) as never }] } }] })).rejects.toThrow(/Abschnitt 1: "value"/)
  })

  it('F08: eine Steuerform in einer Gruppe ist kein Platz — ihre Koordinaten gelten nur in der Gruppe', async () => {
    const zip = await open(await load())
    const sp = (name: string) => `<p:sp><p:nvSpPr><p:cNvPr id="91" name="${name}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="3000000" cy="2000000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></p:spPr></p:sp>`
    const grp = (inner: string) => `<p:grpSp><p:nvGrpSpPr><p:cNvPr id="90" name="Gruppe"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="7315200" y="1828800"/><a:ext cx="3000000" cy="2000000"/><a:chOff x="0" y="0"/><a:chExt cx="3000000" cy="2000000"/></a:xfrm></p:grpSpPr>${inner}</p:grpSp>`
    const add = async (n: number, xml: string) => zip.file(`ppt/slideLayouts/slideLayout${n}.xml`, (await text(zip, `ppt/slideLayouts/slideLayout${n}.xml`)).replace('</p:spTree>', `${xml}</p:spTree>`))
    await add(3, grp(sp('Diagramm')))
    await add(6, grp(grp(sp('Symbol')))) // auch verschachtelt
    const info = await inspectPptxTemplate(await zip.generateAsync({ type: 'uint8array' }))
    expect(info.layouts[2].areas).toBeUndefined()
    expect(info.layouts[5].iconAnchors).toBeUndefined()
    // Freie Steuerformen der mitgelieferten Vorlage bleiben erkannt.
    expect(info.layouts[21].areas?.timeline).toBeDefined()
    expect(info.layouts[8].iconAnchors).toHaveLength(3)
    expect(info.layouts[4].iconAnchors?.[0].index).toBe(0)
  })

  it('F15: mehr Gruppen als die Sicherheitsgrenze — dann gibt es auf dem Layout keine Plätze statt falscher', async () => {
    const zip = await open(await load())
    const grp = (id: number, inner: string) => `<p:grpSp><p:nvGrpSpPr><p:cNvPr id="${id}" name="G${id}"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>${inner}</p:grpSp>`
    const hidden = '<p:sp><p:nvSpPr><p:cNvPr id="9999" name="Diagramm"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="3000000" cy="2000000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></p:spPr></p:sp>'
    const many = Array.from({ length: 600 }, (_, i) => grp(1000 + i, '')).join('') + grp(2000, hidden)
    const p = 'ppt/slideLayouts/slideLayout3.xml'
    zip.file(p, (await text(zip, p)).replace('</p:spTree>', `${many}</p:spTree>`))
    const info = await inspectPptxTemplate(await zip.generateAsync({ type: 'uint8array' }))
    expect(info.layouts[2].areas).toBeUndefined()
  })
})
