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
      ['Titel und Inhalt', 'content'],
      ['Zwei Inhalte', 'two-content'],
      ['Abschnitt', 'section'],
      ['Nur Titel', 'title-only'],
      ['Bild mit Text', 'picture'],
      ['Abschluss', 'content'], // Dachzeile zählt nicht als Inhaltsfläche
      ['Drei Karten', 'cards'],
      ['Vier Karten', 'cards'],
      ['Karten mit Kernaussage', 'cards'],
      ['Text mit Kernaussage', 'content'], // Kernaussage zählt nicht als Inhaltsfläche
      ['Drei Schritte', 'cards'],
      ['Vier Schritte', 'cards'],
      ['Kennzahlen', 'cards']
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
    const layout = await text(await open(res.bytes), 'ppt/slideLayouts/slideLayout2.xml')
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
    expect(await text(await open(four.bytes), 'ppt/slides/_rels/slide2.xml.rels')).toContain('slideLayout9.xml') // Vier Karten
    const three = await buildPptxFromTemplate(tpl, { slides: [{ title: 'Start' }, { title: 'T', items: [1, 2, 3].map(n => ({ title: `K${n}` })), takeaway: 'Satz' }] })
    expect(await text(await open(three.bytes), 'ppt/slides/_rels/slide2.xml.rels')).toContain('slideLayout10.xml') // Karten mit Kernaussage
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
    expect(await pick({ layout: 'cards', title: 'T', items: [1, 2, 3, 4].map(n => ({ title: `K${n}` })) })).toBe('9') // Vier Karten, nicht Vier Schritte
    expect(await pick({ layout: 'cards', title: 'T', items: [1, 2, 3].map(n => ({ title: `K${n}` })), takeaway: 'Satz' })).toBe('10') // Karten mit Kernaussage
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
})
