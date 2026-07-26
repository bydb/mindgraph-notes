// Kern-Dateityp-Klassifikation — pures Modul (nur node:path), damit es testbar ist und als
// **Single Source** für ZWEI Konsumenten dient (R1-impl-F04, ADR plugin-renderer-host §8):
//   1. getFileType() (FileTree-/Watcher-Klassifikation im Main)
//   2. coreClaimedExtensions() = die Sperrmenge für Plugin-Datei-Editor-Claims (FileEditorResolver)
// Beide leiten aus CORE_EXTENSION_TYPES ab → eine vergessene Endung kann nicht still einen gültigen
// Plugin-Claim erzeugen. Ein Paritätstest (fileTypes.test.ts) zementiert das.

import { extname } from 'node:path'

export type CoreFileType = 'markdown' | 'pdf' | 'image' | 'excel' | 'word' | 'powerpoint' | 'code' | 'epub'

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.ico'] as const

// Code-Extensions (ohne führenden Punkt) — spiegelt codeLanguages.ts im Renderer (bewusste Duplikation:
// Main ↔ Renderer dürfen keinen Code teilen, der DOM/hljs importiert).
const CODE_EXTENSIONS = [
  'js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx',
  'py', 'pyw',
  // KEIN 'svg': SVG ist eine Bilddatei (IMAGE_EXTENSIONS) und muss im Bild-Viewer landen,
  // nicht im Code-Editor. Stand es in beiden Listen, gewann der spätere Map-Eintrag ('code') —
  // siehe DUPLICATE_CORE_EXTENSIONS unten.
  'html', 'htm', 'xml',
  'css', 'scss', 'sass', 'less',
  'json', 'jsonc',
  'yaml', 'yml',
  'sh', 'bash', 'zsh', 'fish',
  'markdown', 'mdx',
  'sql',
  'java', 'kt', 'kts',
  'c', 'h', 'cpp', 'cxx', 'cc', 'hpp', 'hxx',
  'cs',
  'go', 'rs', 'php', 'rb', 'swift',
  'diff', 'patch',
  'txt', 'log', 'conf', 'ini', 'toml', 'env',
] as const

/** Spezial-Dateinamen ohne (nutzbare) Extension → 'code'. Names, KEINE Endungen (für die Sperrmenge
 *  irrelevant: ein Plugin beansprucht Endungen, keine vollständigen Namen). */
const SPECIAL_CODE_FILENAMES = new Set(['dockerfile', 'makefile', '.gitignore', '.env'])

/** Endungen, die von ZWEI Typ-Listen beansprucht werden. `new Map([...])` lässt beim Spread still
 *  den SPÄTEREN Eintrag gewinnen: genau so wurde `.svg` (in IMAGE_EXTENSIONS **und** früher in
 *  CODE_EXTENSIONS) zur Code-Datei — SVGs öffneten als XML-Quelltext und `findImageInVault` fand
 *  sie nicht mehr, wodurch `![[bild.svg]]`-Embeds leer blieben. Der Konflikt ist jetzt sichtbar
 *  statt still; `fileTypes.test.ts` nagelt fest, dass die Liste leer bleibt. */
const duplicateExtensions: string[] = []

function buildCoreExtensionTypes(
  entries: ReadonlyArray<[string, CoreFileType]>
): ReadonlyMap<string, CoreFileType> {
  const map = new Map<string, CoreFileType>()
  for (const [ext, type] of entries) {
    if (map.has(ext)) duplicateExtensions.push(ext)
    map.set(ext, type)
  }
  return map
}

/** EINE Quelle: Endung (lowercase, '.'-präfixiert) → Kern-Dateityp. */
const CORE_EXTENSION_TYPES: ReadonlyMap<string, CoreFileType> = buildCoreExtensionTypes([
  ['.md', 'markdown'],
  ['.pdf', 'pdf'],
  ['.epub', 'epub'],
  ...IMAGE_EXTENSIONS.map((e) => [e, 'image'] as [string, CoreFileType]),
  ['.xlsx', 'excel'], ['.xls', 'excel'],
  ['.docx', 'word'], ['.doc', 'word'],
  ['.pptx', 'powerpoint'], ['.ppt', 'powerpoint'],
  ...CODE_EXTENSIONS.map((e) => [`.${e}`, 'code'] as [string, CoreFileType]),
])

/** Diagnose für den Paritätstest: doppelt beanspruchte Endungen (muss leer sein). */
export const DUPLICATE_CORE_EXTENSIONS: readonly string[] = duplicateExtensions

/** Klassifiziert einen Dateinamen in einen Kern-Dateityp oder `null` (unbekannt). */
export function getFileType(fileName: string): CoreFileType | null {
  const ext = extname(fileName).toLowerCase()
  const byExt = CORE_EXTENSION_TYPES.get(ext)
  if (byExt) return byExt
  if (SPECIAL_CODE_FILENAMES.has(fileName.toLowerCase())) return 'code'
  return null
}

/** Alle vom Kern beanspruchten Dateiendungen (normalisiert: lowercase, genau ein führender Punkt) —
 *  die Sperrmenge, die der FileEditorResolver als Kern-Kollision ablehnt (ADR §8). */
export function coreClaimedExtensions(): Set<string> {
  return new Set(CORE_EXTENSION_TYPES.keys())
}
