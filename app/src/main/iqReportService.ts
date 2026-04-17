import { promises as fs } from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import JSZip from 'jszip'

export interface IqReportData {
  title: string
  dateStart?: string
  dateEnd?: string
  location?: string
  laNr?: string
  veranstaltungsNr?: string
  countTotal: number
  countTeachers: number
  countPrincipals: number
  checkFragebogen: boolean
  checkZielscheibe: boolean
  checkPositionieren: boolean
  checkMuendlich: boolean
  checkSonstiges: boolean
  checkDokumentiert: boolean
}

function getTemplatePath(): string {
  const resourcesPath = app.isPackaged
    ? path.join(process.resourcesPath, 'resources')
    : path.join(app.getAppPath(), 'resources')
  return path.join(resourcesPath, 'iq-template.docx')
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function formatBegin(dateStart?: string, dateEnd?: string): string {
  if (!dateStart) return ''
  const start = new Date(dateStart)
  if (isNaN(start.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  const datePart = `${pad(start.getDate())}.${pad(start.getMonth() + 1)}.${start.getFullYear()}`
  const startTime = `${pad(start.getHours())}:${pad(start.getMinutes())}`

  if (dateEnd) {
    const end = new Date(dateEnd)
    if (!isNaN(end.getTime())) {
      const endTime = `${pad(end.getHours())}:${pad(end.getMinutes())}`
      return `${datePart}, ${startTime} Uhr bis ${endTime} Uhr`
    }
  }
  return `${datePart}, ${startTime} Uhr`
}

function setCheckbox(xml: string, name: string, checked: boolean): string {
  const value = checked ? '1' : '0'
  const re = new RegExp(
    `(<w:name w:val="${name}"/>[\\s\\S]*?<w:default w:val=")[01](\"/>)`,
  )
  if (!re.test(xml)) {
    console.warn(`[iqReport] Checkbox ${name} not found in template`)
    return xml
  }
  return xml.replace(re, (_m, p1, p2) => `${p1}${value}${p2}`)
}

export async function generateIqReport(data: IqReportData, outputPath: string): Promise<void> {
  const templatePath = getTemplatePath()
  const buffer = await fs.readFile(templatePath)
  const zip = await JSZip.loadAsync(buffer)

  const docFile = zip.file('word/document.xml')
  if (!docFile) throw new Error('word/document.xml not found in template')
  let xml = await docFile.async('string')

  const replacements: Record<string, string> = {
    '{{TITLE}}': escapeXml(data.title || ''),
    '{{BEGIN}}': escapeXml(formatBegin(data.dateStart, data.dateEnd)),
    '{{LOCATION}}': escapeXml(data.location || ''),
    '{{LA_NR}}': escapeXml(data.laNr || ''),
    '{{VERANSTALTUNGSNR}}': escapeXml(data.veranstaltungsNr || ''),
    '{{COUNT_TOTAL}}': String(data.countTotal),
    '{{COUNT_TEACHERS}}': String(data.countTeachers),
    '{{COUNT_PRINCIPALS}}': String(data.countPrincipals)
  }

  for (const [placeholder, value] of Object.entries(replacements)) {
    xml = xml.split(placeholder).join(value)
  }

  xml = setCheckbox(xml, 'CB_FRAGEBOGEN', data.checkFragebogen)
  xml = setCheckbox(xml, 'CB_ZIELSCHEIBE', data.checkZielscheibe)
  xml = setCheckbox(xml, 'CB_POSITIONIEREN', data.checkPositionieren)
  xml = setCheckbox(xml, 'CB_MUENDLICH', data.checkMuendlich)
  xml = setCheckbox(xml, 'CB_SONSTIGES', data.checkSonstiges)
  xml = setCheckbox(xml, 'CB_DOKUMENTIERT', data.checkDokumentiert)

  zip.file('word/document.xml', xml)

  const out = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
  await fs.writeFile(outputPath, out)
}
