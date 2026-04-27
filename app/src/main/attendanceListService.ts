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

export const MAX_ATTENDANCE_PARTICIPANTS = 9
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

export async function generateAttendanceList(data: AttendanceListData, outputPath: string): Promise<void> {
  if (data.participants.length > MAX_ATTENDANCE_PARTICIPANTS) {
    throw new Error(`Zu viele Teilnehmer (${data.participants.length}). Vorlage unterstützt maximal ${MAX_ATTENDANCE_PARTICIPANTS}.`)
  }

  const templatePath = getTemplatePath()
  const buffer = await fs.readFile(templatePath)
  const zip = await JSZip.loadAsync(buffer)

  const docFile = zip.file('word/document.xml')
  if (!docFile) throw new Error('word/document.xml not found in template')
  let xml = await docFile.async('string')

  const schuljahr = data.schuljahr || deriveSchuljahr(data.dates)
  const replacements: Record<string, string> = {
    '{{TITLE}}': escapeXml(data.title || ''),
    '{{LOCATION}}': escapeXml(data.location || ''),
    '{{LA_NR}}': escapeXml(data.laNr || ''),
    '{{AKKR_NR}}': escapeXml(data.akkrNr || ''),
    '{{SCHULJAHR}}': escapeXml(schuljahr)
  }

  for (let i = 0; i < MAX_ATTENDANCE_DATES; i++) {
    const iso = data.dates[i]
    const label = iso ? formatDateLabel(iso) : ''
    replacements[`{{DATE_${i + 1}}}`] = escapeXml(label)
  }

  for (let i = 0; i < MAX_ATTENDANCE_PARTICIPANTS; i++) {
    const p = data.participants[i]
    replacements[`{{P${i}_NAME}}`] = escapeXml(p?.name || '')
    replacements[`{{P${i}_VORNAME}}`] = escapeXml(p?.vorname || '')
    replacements[`{{P${i}_PERSONALNR}}`] = escapeXml(p?.personalNr || '')
    replacements[`{{P${i}_SCHULE}}`] = escapeXml(p?.schule || '')
  }

  for (const [placeholder, value] of Object.entries(replacements)) {
    xml = xml.split(placeholder).join(value)
  }

  zip.file('word/document.xml', xml)
  const out = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
  await fs.writeFile(outputPath, out)
}
