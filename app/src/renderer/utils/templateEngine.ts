// Template Engine für MindGraph Notes
// Inspiriert von Obsidian Templater

export interface TemplateVariable {
  name: string
  value: string | (() => string)
}

export interface ParsedTemplate {
  content: string
  cursorPosition?: number  // Position des {{cursor}} Markers
}

// Standard-Variablen
const getBuiltInVariables = (title?: string): Record<string, () => string> => ({
  // Datum & Zeit
  'date': () => formatDate(new Date(), 'YYYY-MM-DD'),
  'time': () => formatDate(new Date(), 'HH:mm'),
  'datetime': () => formatDate(new Date(), 'YYYY-MM-DD HH:mm'),
  'timestamp': () => formatDate(new Date(), 'YYYYMMDDHHmm'),

  // Notiz-Info
  'title': () => title || 'Unbenannt',

  // Zufalls-ID (für Zettelkasten)
  'random-id': () => generateRandomId(6),
  'uuid': () => generateUUID(),

  // Wochentag
  'weekday': () => {
    const days = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag']
    return days[new Date().getDay()]
  },

  // Kalenderwoche
  'week': () => getWeekNumber(new Date()).toString(),
})

// Datum formatieren
export function formatDate(date: Date, format: string): string {
  const pad = (n: number) => n.toString().padStart(2, '0')

  const replacements: Record<string, string> = {
    'YYYY': date.getFullYear().toString(),
    'YY': date.getFullYear().toString().slice(-2),
    'MM': pad(date.getMonth() + 1),
    'M': (date.getMonth() + 1).toString(),
    'DD': pad(date.getDate()),
    'D': date.getDate().toString(),
    'HH': pad(date.getHours()),
    'H': date.getHours().toString(),
    'mm': pad(date.getMinutes()),
    'm': date.getMinutes().toString(),
    'ss': pad(date.getSeconds()),
    's': date.getSeconds().toString(),
  }

  let result = format
  // Sortiere nach Länge absteigend um YYYY vor YY zu ersetzen
  const sortedKeys = Object.keys(replacements).sort((a, b) => b.length - a.length)
  for (const key of sortedKeys) {
    result = result.replace(new RegExp(key, 'g'), replacements[key])
  }

  return result
}

// Zufällige ID generieren
export function generateRandomId(length: number = 6): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

// UUID generieren
export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

// Kalenderwoche berechnen
function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
}

// Template parsen und Variablen ersetzen
export function parseTemplate(template: string, title?: string, customVariables?: Record<string, string>): ParsedTemplate {
  const builtInVars = getBuiltInVariables(title)
  let content = template
  let cursorPosition: number | undefined

  // Ersetze {{cursor}} und merke Position
  const cursorMatch = content.match(/\{\{cursor\}\}/i)
  if (cursorMatch && cursorMatch.index !== undefined) {
    // Berechne Position nach allen Ersetzungen
    const beforeCursor = content.substring(0, cursorMatch.index)
    content = content.replace(/\{\{cursor\}\}/gi, '')
    cursorPosition = parseTemplateVariables(beforeCursor, builtInVars, customVariables).length
  }

  // Ersetze alle anderen Variablen
  content = parseTemplateVariables(content, builtInVars, customVariables)

  return { content, cursorPosition }
}

// Variablen im Text ersetzen
function parseTemplateVariables(
  text: string,
  builtInVars: Record<string, () => string>,
  customVariables?: Record<string, string>
): string {
  // Pattern: {{variable}} oder {{date:FORMAT}}
  return text.replace(/\{\{([^}]+)\}\}/g, (match, variable) => {
    const trimmed = variable.trim().toLowerCase()

    // Prüfe auf Formatierung (z.B. {{date:DD.MM.YYYY}})
    if (trimmed.includes(':')) {
      const [varName, format] = trimmed.split(':').map((s: string) => s.trim())

      if (varName === 'date' || varName === 'time' || varName === 'datetime') {
        return formatDate(new Date(), format)
      }
    }

    // Built-in Variable
    if (builtInVars[trimmed]) {
      return builtInVars[trimmed]()
    }

    // Custom Variable
    if (customVariables && customVariables[trimmed]) {
      return customVariables[trimmed]
    }

    // Unbekannte Variable - behalte Original
    return match
  })
}

// Template-Datei erkennen
export function isTemplateFile(path: string): boolean {
  const lowerPath = path.toLowerCase()
  return lowerPath.includes('/templates/') ||
         lowerPath.includes('/vorlagen/') ||
         lowerPath.startsWith('templates/') ||
         lowerPath.startsWith('vorlagen/')
}

// Template-Info
export interface TemplateInfo {
  name: string
  path: string
  content: string
}

// Template-Konfiguration laden/speichern
export interface CustomTemplate {
  id: string
  name: string
  content: string
}

export interface TemplateConfig {
  dailyNote: string
  zettel: string
  meeting: string
  empty: string
  custom: CustomTemplate[]
}

export const DEFAULT_TEMPLATES: TemplateConfig = {
  custom: [],
  empty: `# {{title}}

{{cursor}}`,

  dailyNote: `---
date: {{date:YYYY-MM-DD}}
type: daily-note
tags:
  - daily
---

# {{date:DD.MM.YYYY}} - {{weekday}}

## Aufgaben

- [ ] {{cursor}}

## Notizen



## Reflexion

`,

  zettel: `---
id: {{timestamp}}
created: {{datetime}}
tags: []
---

# {{title}}

{{cursor}}

## Referenzen

`,

  meeting: `---
date: {{date:YYYY-MM-DD}}
time: {{time}}
type: meeting
tags:
  - meeting
participants: []
---

# Meeting: {{title}}

**Datum:** {{date:DD.MM.YYYY}}
**Zeit:** {{time}}
**Teilnehmer:**

## Agenda

1. {{cursor}}

## Notizen



## Action Items

- [ ]

## Nächste Schritte

`
}

// Für Abwärtskompatibilität
export const DEFAULT_DAILY_NOTE_TEMPLATE = DEFAULT_TEMPLATES.dailyNote
export const DEFAULT_ZETTEL_TEMPLATE = DEFAULT_TEMPLATES.zettel
export const DEFAULT_MEETING_TEMPLATE = DEFAULT_TEMPLATES.meeting

// Template-Config Dateiname
const TEMPLATE_CONFIG_FILE = '.mindgraph/templates.json'

// Templates aus Vault laden (oder Defaults verwenden)
export async function loadTemplateConfig(vaultPath: string): Promise<TemplateConfig> {
  try {
    const configPath = `${vaultPath}/${TEMPLATE_CONFIG_FILE}`
    const content = await window.electronAPI.readFile(configPath)
    const config = JSON.parse(content) as Partial<TemplateConfig>
    // Merge mit Defaults
    return { ...DEFAULT_TEMPLATES, ...config }
  } catch {
    // Datei existiert nicht - Defaults verwenden
    return DEFAULT_TEMPLATES
  }
}

// Templates in Vault speichern
export async function saveTemplateConfig(vaultPath: string, config: TemplateConfig): Promise<void> {
  const configPath = `${vaultPath}/${TEMPLATE_CONFIG_FILE}`
  // Stelle sicher dass .mindgraph Ordner existiert
  await window.electronAPI.ensureDir(`${vaultPath}/.mindgraph`)
  await window.electronAPI.writeFile(configPath, JSON.stringify(config, null, 2))
}
