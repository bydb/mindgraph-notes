import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import * as path from 'path'

/**
 * Der native `title`-Tooltip bricht NICHT um.
 *
 * Ein langer Text wird dort zu einer einzigen Zeile, die über beide Fensterkanten
 * hinausläuft und an beiden Enden abgeschnitten ist — unlesbar, und es fällt erst auf,
 * wenn jemand mit der Maus stehen bleibt. Real passiert am 21.09.2026 mit dem
 * „Rechner"-Schalter (396 Zeichen).
 *
 * Deshalb diese Grenze. Sie ist keine Stilfrage: Ein Tooltip, der nicht in eine Zeile
 * passt, ist kein Tooltip. Ausführliches gehört als sichtbarer Hinweis unter das
 * Bedienelement (siehe `ComputerArmedHint.tsx`), nicht in ein `title`-Attribut.
 */
const MAX_TOOLTIP_CHARS = 120

const RENDERER_DIR = path.join(process.cwd(), 'src', 'renderer')
const TRANSLATIONS = path.join(RENDERER_DIR, 'utils', 'translations.ts')

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full))
    else if (/\.tsx?$/.test(entry) && !entry.endsWith('.test.ts') && !entry.endsWith('.test.tsx')) out.push(full)
  }
  return out
}

/** Übersetzungsschlüssel, die irgendwo als `title={t('…')}` landen. */
function tooltipKeys(): Set<string> {
  const keys = new Set<string>()
  for (const file of sourceFiles(RENDERER_DIR)) {
    const src = readFileSync(file, 'utf8')
    for (const m of src.matchAll(/title=\{t\('([^']+)'\)\}/g)) keys.add(m[1])
  }
  return keys
}

/** Alle Werte zu einem Schlüssel — deutsch UND englisch, beide erscheinen im Tooltip. */
function valuesFor(key: string, translations: string): string[] {
  const pattern = new RegExp(`'${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}':\\s*'((?:[^'\\\\]|\\\\.)*)'`, 'g')
  return [...translations.matchAll(pattern)].map(m => m[1])
}

describe('Tooltips passen in eine Zeile', () => {
  const translations = readFileSync(TRANSLATIONS, 'utf8')
  const keys = [...tooltipKeys()].sort()

  it('findet überhaupt Tooltip-Schlüssel (sonst prüft der Test nichts)', () => {
    expect(keys.length).toBeGreaterThan(50)
  })

  it(`hält jeden Tooltip unter ${MAX_TOOLTIP_CHARS} Zeichen`, () => {
    const zuLang: string[] = []
    for (const key of keys) {
      for (const value of valuesFor(key, translations)) {
        if (value.length > MAX_TOOLTIP_CHARS) zuLang.push(`${key} (${value.length} Zeichen)`)
      }
    }
    expect(zuLang, `Diese Tooltips laufen aus dem Fenster. Text kürzen oder als sichtbaren Hinweis unter das Bedienelement setzen:\n${zuLang.join('\n')}`)
      .toEqual([])
  })
})
