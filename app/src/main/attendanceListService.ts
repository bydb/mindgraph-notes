import { promises as fs } from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import JSZip from 'jszip'

export interface AttendanceParticipant {
  name: string
  vorname: string
  personalNr?: string
  schule?: string
}

export interface AttendanceListData {
  title: string
  location?: string
  laNr?: string
  akkrNr?: string
  schuljahr?: string
  dates: string[]
  participants: AttendanceParticipant[]
}

/** Anzahl Teilnehmer-Zeilen pro Seite — entspricht dem fixen Tabellenraster im DOCX-Template. */
export const ATTENDANCE_PARTICIPANTS_PER_PAGE = 9
/** Obergrenze gesamt: bei mehr Teilnehmern werden mehrere Seiten angehängt. */
export const MAX_ATTENDANCE_PARTICIPANTS_TOTAL = 100
/** Beibehalten als Alias für bestehende Importe (Template-konstanten-bezogene Verwendung). */
export const MAX_ATTENDANCE_PARTICIPANTS = ATTENDANCE_PARTICIPANTS_PER_PAGE
export const MAX_ATTENDANCE_DATES = 8

function getTemplatePath(): string {
  const resourcesPath = app.isPackaged
    ? path.join(process.resourcesPath, 'resources')
    : path.join(app.getAppPath(), 'resources')
  return path.join(resourcesPath, 'anwesenheitsliste-template.docx')
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function deriveSchuljahr(dates: string[]): string {
  const ref = dates.find(Boolean)
  const d = ref ? new Date(ref) : new Date()
  if (isNaN(d.getTime())) return ''
  const month = d.getMonth() + 1
  const year = d.getFullYear()
  const startYear = month >= 8 ? year : year - 1
  return `${startYear}/${startYear + 1}`
}

function formatDateLabel(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.`
}

export function splitName(fullName: string): { name: string; vorname: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { name: '', vorname: '' }
  if (parts.length === 1) return { name: parts[0], vorname: '' }
  const name = parts[parts.length - 1]
  const vorname = parts.slice(0, -1).join(' ')
  return { name, vorname }
}

/** OOXML-Page-Break — wird zwischen Seiten eingefügt, wenn die Liste mehr als eine Seite umfasst. */
const PAGE_BREAK_XML = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>'

function buildPageReplacements(
  data: AttendanceListData,
  participantsOnPage: AttendanceParticipant[],
  schuljahr: string,
): Record<string, string> {
  const replacements: Record<string, string> = {
    '{{TITLE}}': escapeXml(data.title || ''),
    '{{LOCATION}}': escapeXml(data.location || ''),
    '{{LA_NR}}': escapeXml(data.laNr || ''),
    '{{AKKR_NR}}': escapeXml(data.akkrNr || ''),
    '{{SCHULJAHR}}': escapeXml(schuljahr),
  }

  for (let i = 0; i < MAX_ATTENDANCE_DATES; i++) {
    const iso = data.dates[i]
    const label = iso ? formatDateLabel(iso) : ''
    replacements[`{{DATE_${i + 1}}}`] = escapeXml(label)
  }

  for (let i = 0; i < ATTENDANCE_PARTICIPANTS_PER_PAGE; i++) {
    const p = participantsOnPage[i]
    replacements[`{{P${i}_NAME}}`] = escapeXml(p?.name || '')
    replacements[`{{P${i}_VORNAME}}`] = escapeXml(p?.vorname || '')
    replacements[`{{P${i}_PERSONALNR}}`] = escapeXml(p?.personalNr || '')
    replacements[`{{P${i}_SCHULE}}`] = escapeXml(p?.schule || '')
  }

  return replacements
}

function applyReplacements(xml: string, replacements: Record<string, string>): string {
  let out = xml
  for (const [placeholder, value] of Object.entries(replacements)) {
    out = out.split(placeholder).join(value)
  }
  return out
}

export async function generateAttendanceList(data: AttendanceListData, outputPath: string): Promise<void> {
  if (data.participants.length > MAX_ATTENDANCE_PARTICIPANTS_TOTAL) {
    throw new Error(`Zu viele Teilnehmer (${data.participants.length}). Maximum: ${MAX_ATTENDANCE_PARTICIPANTS_TOTAL}.`)
  }

  const templatePath = getTemplatePath()
  const buffer = await fs.readFile(templatePath)
  const zip = await JSZip.loadAsync(buffer)

  const docFile = zip.file('word/document.xml')
  if (!docFile) throw new Error('word/document.xml not found in template')
  const xml = await docFile.async('string')

  // Body-Inhalt extrahieren, damit wir ihn pro Seite (jeweils 9 Teilnehmer) klonen
  // und mit Seitenumbrüchen wieder zusammenkleben können. <w:sectPr> bleibt am Ende
  // einmalig stehen — das sind die Section-Properties (Papierformat etc.) für das gesamte Dokument.
  const bodyOpenTag = '<w:body>'
  const bodyCloseTag = '</w:body>'
  const bodyOpenIdx = xml.indexOf(bodyOpenTag)
  const bodyCloseIdx = xml.lastIndexOf(bodyCloseTag)
  if (bodyOpenIdx < 0 || bodyCloseIdx < 0) {
    throw new Error('Template body markers not found')
  }
  const beforeBody = xml.substring(0, bodyOpenIdx + bodyOpenTag.length)
  const afterBody = xml.substring(bodyCloseIdx)
  const bodyInner = xml.substring(bodyOpenIdx + bodyOpenTag.length, bodyCloseIdx)

  // Trailing <w:sectPr> einmalig vom klonbaren Body abtrennen.
  const sectPrIdx = bodyInner.lastIndexOf('<w:sectPr')
  let pageTemplate: string
  let sectPr: string
  if (sectPrIdx >= 0) {
    pageTemplate = bodyInner.substring(0, sectPrIdx)
    sectPr = bodyInner.substring(sectPrIdx)
  } else {
    pageTemplate = bodyInner
    sectPr = ''
  }

  // Die mitgelieferte Anwesenheitsliste-Vorlage enthält zwei identische Seiten-Layouts
  // (jeder Platzhalter taucht zweimal auf, getrennt durch <w:lastRenderedPageBreak/>).
  // Wenn wir das so klonen würden, käme bei jedem Chunk doppelter Inhalt heraus.
  // Erkennung über mehrfaches Vorkommen von {{TITLE}} und Trim auf die erste Hälfte.
  const titleOccurrences = (pageTemplate.match(/\{\{TITLE\}\}/g) || []).length
  if (titleOccurrences > 1) {
    const breakMarker = '<w:lastRenderedPageBreak/>'
    const breakIdx = pageTemplate.indexOf(breakMarker)
    if (breakIdx >= 0) {
      // Den Anfang des Paragraphen finden, der den Page-Break-Marker enthält —
      // das ist der Start der zweiten Seite. Alles ab da gehört zur Duplikat-Seite und wird verworfen.
      const pStartA = pageTemplate.lastIndexOf('<w:p ', breakIdx)
      const pStartB = pageTemplate.lastIndexOf('<w:p>', breakIdx)
      const pStart = Math.max(pStartA, pStartB)
      if (pStart > 0) {
        pageTemplate = pageTemplate.substring(0, pStart)
      }
    }
  }

  const schuljahr = data.schuljahr || deriveSchuljahr(data.dates)

  // Participants in Chunks á 9 zerlegen — bei 0 Teilnehmern trotzdem eine leere Seite erzeugen,
  // damit die Liste mit Header / Tabelle vorhanden ist.
  const chunks: AttendanceParticipant[][] = []
  for (let i = 0; i < data.participants.length; i += ATTENDANCE_PARTICIPANTS_PER_PAGE) {
    chunks.push(data.participants.slice(i, i + ATTENDANCE_PARTICIPANTS_PER_PAGE))
  }
  if (chunks.length === 0) chunks.push([])

  // Pro Chunk eine Seite rendern.
  const renderedPages = chunks.map(chunk =>
    applyReplacements(pageTemplate, buildPageReplacements(data, chunk, schuljahr))
  )

  // Seiten mit Page-Break verbinden, dann sectPr + body close anhängen.
  const newBodyContent = renderedPages.join(PAGE_BREAK_XML) + sectPr
  const newXml = beforeBody + newBodyContent + afterBody

  zip.file('word/document.xml', newXml)
  const out = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
  await fs.writeFile(outputPath, out)
}
