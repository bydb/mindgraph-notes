// Tabellen-Weg (15.11.2026): Rechnen über einem Datensatz im Code statt im Modellkopf.
//
// Anlass: ERP-Messung mit deepseek-v4.1-flash über LLMBase (mcpErpScale.live.test.ts). Abruf und
// Filter liefen sauber, aber alle drei Fehlschläge waren Kopfrechnen über viele Zeilen: Rangliste
// über 250 Bestellungen (Platz 4/5 falsch), Zählen (135 statt 136), Abgleich zweier Listen
// (8 falsche Bestellungen). Ein größeres Kontextfenster hilft dagegen nicht.
//
// Hier liegt nur reine Logik (getestet): Zeilen aus einer Listenantwort lesen, Datensatz bauen,
// Abfrage (verknüpfen → filtern → gruppieren/aggregieren → sortieren → begrenzen → Spalten).
// Fehler werden laut gemeldet (unbekannte Spalte, unbekannter Operator), nie still übergangen.
import type { CollectedTable } from './tableCollect'

// ── Listenantworten lesen ────────────────────────────────────────────────────────────────

export interface ParsedListPage {
  rows: Array<Record<string, unknown>>
  /** Nächster Versatz aus `@odata.nextLink` (`skip=`/`$skip=`), sonst null. */
  nextSkip: number | null
  /** Hat die Antwort überhaupt einen Verweis auf eine nächste Seite? */
  hasNextLink: boolean
  /**
   * Verweis mit einem Cursor statt Zahlenversatz (z.B. `$skiptoken`, `cursor=`, `page_token=`):
   * Über ein Werkzeug lässt sich so ein Cursor nicht weiterreichen, also auch nicht in einen
   * Zahlenversatz umdeuten — sonst fehlen oder doppeln sich Zeilen (Codex F48).
   */
  cursorOnly: boolean
}

const LIST_KEYS = ['value', 'items', 'data', 'results', 'records', 'rows']

/**
 * Liest eine Seite aus dem Text einer Werkzeugantwort: JSON-Array oder Objekt mit einem
 * Listenfeld (`value` wie OData/Business Central, sonst items/data/results/records/rows).
 * Null, wenn der Text keine Liste von Objekten ist — dann kann der Tabellen-Weg nicht helfen.
 */
export function parseListPage(text: string): ParsedListPage | null {
  let json: unknown
  try { json = JSON.parse(text.trim()) } catch { return null }
  let list: unknown = null
  let nextLink: unknown = undefined
  if (Array.isArray(json)) list = json
  else if (json && typeof json === 'object') {
    const obj = json as Record<string, unknown>
    for (const k of LIST_KEYS) if (Array.isArray(obj[k])) { list = obj[k]; break }
    nextLink = obj['@odata.nextLink'] ?? obj.nextLink ?? obj.next
  }
  if (!Array.isArray(list)) return null
  if (!list.every(r => r && typeof r === 'object' && !Array.isArray(r))) return null
  const hasNextLink = typeof nextLink === 'string' && nextLink.trim() !== ''
  let nextSkip: number | null = null
  if (hasNextLink) {
    const m = /(?:^|[?&$])\$?skip=(\d+)/i.exec(nextLink as string)
    if (m) nextSkip = Number(m[1])
  }
  return { rows: list as Array<Record<string, unknown>>, nextSkip, hasNextLink, cursorOnly: hasNextLink && nextSkip === null }
}

/** Zellwert als Text: Zahlen und Wahrheitswerte unverändert lesbar, null leer, Objekte als JSON. */
export function cellText(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return JSON.stringify(v)
}

/** Datensatz aus Objektzeilen; Spalten in der Reihenfolge ihres ersten Auftretens. */
export function tableFromObjects(rows: Array<Record<string, unknown>>, source: { file: string; complete: boolean; message?: string }): CollectedTable {
  const columns: string[] = []
  const seen = new Set<string>()
  for (const r of rows) for (const k of Object.keys(r)) if (!seen.has(k)) { seen.add(k); columns.push(k) }
  // Je Spalte: nur echte JSON-Zahlen (kein JSON-Text) zählen als eindeutig (F54).
  const jsonNumberColumns = columns.map(c => {
    let seenNumber = false
    for (const r of rows) {
      const v = r[c]
      if (v === null || v === undefined) continue
      if (typeof v !== 'number') return false
      seenNumber = true
    }
    return seenNumber
  })
  return {
    columns,
    ...(jsonNumberColumns.some(Boolean) ? { jsonNumberColumns } : {}),
    rows: rows.map(r => columns.map(c => cellText(r[c]))),
    files: [{ file: source.file, status: source.complete ? 'ok' : 'teilweise', rows: rows.length, ...(source.message ? { message: source.message } : {}) }]
  }
}

// ── Zahlen ───────────────────────────────────────────────────────────────────────────────

/**
 * Zahl aus einer Zelle: JSON-Schreibweise („12345.67“), deutsch („12.345,67“) oder mit
 * Tausender-Komma („12,345.67“). Leer oder nicht eindeutig → null, nie 0.
 *
 * Mehrdeutig ist genau ein Trennzeichen mit drei Ziffern danach: „12.345“ (deutsch zwölftausend
 * oder JSON zwölf Komma drei) und „1,234“ (englisch tausend oder deutsch eins Komma zwei). Im
 * Modus `json` (Datensatz aus JSON-Zahlen) gilt der Punkt als Dezimalzeichen; sonst → null, damit
 * die Abfrage den Wert als „keine eindeutige Zahl“ meldet statt still falsch zu rechnen (Codex F53).
 */
export function parseNumber(s: string, mode: 'json' | 'text' = 'text'): number | null {
  const t = s.trim().replace(/[\s ']/g, '').replace(/(EUR|€|%)$/i, '')
  if (!t) return null
  if (/^[+-]?\d{1,3},\d{3}$/.test(t)) return null
  if (/^[+-]?\d{1,3}\.\d{3}$/.test(t) && mode !== 'json') return null
  if (/^[+-]?\d+(\.\d+)?(e[+-]?\d+)?$/i.test(t)) return Number(t)
  if (/^[+-]?\d{1,3}(\.\d{3})+(,\d+)?$/.test(t) || /^[+-]?\d+,\d+$/.test(t)) return Number(t.replace(/\./g, '').replace(',', '.'))
  if (/^[+-]?\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) return Number(t.replace(/,/g, ''))
  return null
}

/** Summe ohne Gleitkomma-Drift bei Geldbeträgen: in Millionstel gerechnet. */
function exactSum(values: number[]): number {
  let scaled = 0n
  for (const v of values) scaled += BigInt(Math.round(v * 1e6))
  return Number(scaled) / 1e6
}

function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return String(n)
  return String(Math.round(n * 1e6) / 1e6)
}

// ── Abfrage ──────────────────────────────────────────────────────────────────────────────

export type WhereOp = 'eq' | 'ne' | 'gt' | 'ge' | 'lt' | 'le' | 'contains' | 'in' | 'empty' | 'not_empty'
export const WHERE_OPS: readonly WhereOp[] = ['eq', 'ne', 'gt', 'ge', 'lt', 'le', 'contains', 'in', 'empty', 'not_empty']
export type AggOp = 'count' | 'count_distinct' | 'sum' | 'avg' | 'min' | 'max'
export const AGG_OPS: readonly AggOp[] = ['count', 'count_distinct', 'sum', 'avg', 'min', 'max']

export interface WhereClause { column: string; op: WhereOp; value?: string | number | boolean | Array<string | number> }
export interface Aggregate { op: AggOp; column?: string; as?: string }
export interface JoinSpec { dataset: string; left: string; right: string; columns?: string[] }
export interface OrderSpec { column: string; desc?: boolean }

export interface DatasetQuery {
  join?: JoinSpec
  where?: WhereClause[]
  group_by?: string[]
  aggregates?: Aggregate[]
  order_by?: OrderSpec[]
  limit?: number
  select?: string[]
}

export class DatasetQueryError extends Error {}

export const QUERY_MAX_ROWS = 50_000

function colIndex(columns: string[], name: string, where: string): number {
  let i = columns.indexOf(name)
  if (i < 0) {
    const lower = name.trim().toLowerCase()
    const hits = columns.map((c, j) => [c.toLowerCase(), j] as const).filter(([c]) => c === lower)
    if (hits.length === 1) i = hits[0][1]
  }
  if (i < 0) throw new DatasetQueryError(`${where}: Spalte „${name}“ gibt es nicht. Vorhanden: ${columns.join(', ')}`)
  return i
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}([T ][\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/

/** Vergleich: Zahl mit Zahl, ISO-Datum mit ISO-Datum (Text), sonst Text ohne Groß/Klein. */
function compare(a: string, b: string, mode: 'json' | 'text'): number {
  const na = parseNumber(a, mode)
  const nb = parseNumber(b, mode)
  if (na !== null && nb !== null && !(ISO_DATE.test(a.trim()) || ISO_DATE.test(b.trim()))) return na - nb
  const x = a.trim()
  const y = b.trim()
  if (ISO_DATE.test(x) && ISO_DATE.test(y)) return x < y ? -1 : x > y ? 1 : 0
  return x.localeCompare(y, 'de', { sensitivity: 'base', numeric: true })
}

function equalCell(cell: string, value: string, mode: 'json' | 'text'): boolean {
  const nc = parseNumber(cell, mode)
  const nv = parseNumber(value, mode)
  if (nc !== null && nv !== null && !ISO_DATE.test(cell.trim())) return nc === nv
  return cell.trim().toLowerCase() === value.trim().toLowerCase()
}

function whereTest(columns: string[], w: WhereClause, modeOf: (i: number) => 'json' | 'text'): (row: string[]) => boolean {
  if (!WHERE_OPS.includes(w.op)) throw new DatasetQueryError(`where: Operator „${String(w.op)}“ unbekannt. Erlaubt: ${WHERE_OPS.join(', ')}`)
  const i = colIndex(columns, w.column, 'where')
  const mode = modeOf(i)
  if (w.op === 'empty') return r => r[i].trim() === ''
  if (w.op === 'not_empty') return r => r[i].trim() !== ''
  if (w.op === 'in') {
    if (!Array.isArray(w.value) || w.value.length === 0) throw new DatasetQueryError(`where „${w.column} in“: value muss eine nicht-leere Liste sein`)
    const vals = w.value.map(v => String(v))
    return r => vals.some(v => equalCell(r[i], v, mode))
  }
  if (w.value === undefined || w.value === null || Array.isArray(w.value)) throw new DatasetQueryError(`where „${w.column} ${w.op}“: value fehlt`)
  const v = String(w.value)
  switch (w.op) {
    case 'eq': return r => equalCell(r[i], v, mode)
    case 'ne': return r => !equalCell(r[i], v, mode)
    case 'contains': return r => r[i].toLowerCase().includes(v.toLowerCase())
    // Leere Zellen erfüllen nie eine Größer/Kleiner-Bedingung.
    case 'gt': return r => r[i].trim() !== '' && compare(r[i], v, mode) > 0
    case 'ge': return r => r[i].trim() !== '' && compare(r[i], v, mode) >= 0
    case 'lt': return r => r[i].trim() !== '' && compare(r[i], v, mode) < 0
    case 'le': return r => r[i].trim() !== '' && compare(r[i], v, mode) <= 0
  }
  throw new DatasetQueryError(`where: Operator „${w.op}“ unbekannt`)
}

function aggName(a: Aggregate): string {
  return a.as?.trim() || (a.op === 'count' && !a.column ? 'Anzahl' : `${a.op}(${a.column})`)
}

export interface QueryResult {
  table: CollectedTable
  /** Zeilen vor `limit` — damit „Top 5 von 87“ ehrlich gesagt werden kann. */
  totalBeforeLimit: number
  /** Zellen, die in einer Summe/einem Mittel/Min/Max NICHT als Zahl lesbar waren. */
  nonNumeric: Array<{ column: string; count: number; example: string }>
}

/**
 * Führt eine Abfrage aus: join → where → group_by/aggregates → order_by → limit → select.
 * `getDataset` liefert den Partner einer Verknüpfung. Wirft DatasetQueryError mit Klartext.
 */
export function queryDataset(base: CollectedTable, q: DatasetQuery, getDataset: (id: string) => CollectedTable | null): QueryResult {
  let columns = [...base.columns]
  let rows = base.rows
  const nonNumeric = new Map<string, { count: number; example: string }>()
  // Zahlenmodus je Spalte (F53/F54): nur Spalten aus echten JSON-Zahlen lesen „1.125“ als Dezimalzahl.
  let jsonCol: boolean[] = columns.map((_, i) => !!base.jsonNumberColumns?.[i])
  const modeOf = (i: number): 'json' | 'text' => (jsonCol[i] ? 'json' : 'text')

  if (q.join) {
    const other = getDataset(q.join.dataset)
    if (!other) throw new DatasetQueryError(`join: Datensatz „${q.join.dataset}“ gibt es nicht`)
    const li = colIndex(columns, q.join.left, 'join.left')
    const ri = colIndex(other.columns, q.join.right, `join.right (${q.join.dataset})`)
    const wanted = (q.join.columns && q.join.columns.length ? q.join.columns : other.columns).map(c => colIndex(other.columns, c, `join.columns (${q.join!.dataset})`))
    const index = new Map<string, string[][]>()
    for (const r of other.rows) {
      const k = r[ri].trim().toLowerCase()
      const list = index.get(k)
      if (list) list.push(r)
      else index.set(k, [r])
    }
    const names = wanted.map(j => (columns.includes(other.columns[j]) ? `${q.join!.dataset}.${other.columns[j]}` : other.columns[j]))
    const out: string[][] = []
    for (const r of rows) {
      for (const m of index.get(r[li].trim().toLowerCase()) ?? []) {
        out.push([...r, ...wanted.map(j => m[j])])
        if (out.length > QUERY_MAX_ROWS) throw new DatasetQueryError(`join: mehr als ${QUERY_MAX_ROWS.toLocaleString('de-DE')} Zeilen — Schlüssel ist nicht eindeutig, vorher filtern`)
      }
    }
    columns = [...columns, ...names]
    jsonCol = [...jsonCol, ...wanted.map(j => !!other.jsonNumberColumns?.[j])]
    rows = out
  }

  for (const w of q.where ?? []) {
    const test = whereTest(columns, w, modeOf)
    rows = rows.filter(test)
  }

  const aggs = q.aggregates ?? []
  if ((q.group_by && q.group_by.length) || aggs.length) {
    for (const a of aggs) {
      if (!AGG_OPS.includes(a.op)) throw new DatasetQueryError(`aggregates: Operator „${String(a.op)}“ unbekannt. Erlaubt: ${AGG_OPS.join(', ')}`)
      if (a.op !== 'count' && !a.column) throw new DatasetQueryError(`aggregates: „${a.op}“ braucht eine Spalte (column)`)
    }
    const gIdx = (q.group_by ?? []).map(g => colIndex(columns, g, 'group_by'))
    const aIdx = aggs.map(a => (a.column ? colIndex(columns, a.column, `aggregates ${a.op}`) : -1))
    const groups = new Map<string, { key: string[]; rows: string[][] }>()
    for (const r of rows) {
      const key = gIdx.map(i => r[i])
      const k = JSON.stringify(key.map(x => x.trim().toLowerCase()))
      const g = groups.get(k)
      if (g) g.rows.push(r)
      else groups.set(k, { key, rows: [r] })
    }
    // Ohne group_by gibt es genau eine Gruppe — auch bei null Zeilen (Anzahl 0, nicht „keine Zeile“).
    if (gIdx.length === 0 && groups.size === 0) groups.set('[]', { key: [], rows: [] })
    const outCols = [...(q.group_by ?? []).map(g => columns[colIndex(columns, g, 'group_by')]), ...aggs.map(aggName)]
    const outRows: string[][] = []
    for (const g of groups.values()) {
      const cells = [...g.key]
      aggs.forEach((a, n) => {
        const i = aIdx[n]
        if (a.op === 'count') { cells.push(String(i < 0 ? g.rows.length : g.rows.filter(r => r[i].trim() !== '').length)); return }
        if (a.op === 'count_distinct') { cells.push(String(new Set(g.rows.map(r => r[i].trim().toLowerCase()).filter(Boolean)).size)); return }
        const nums: number[] = []
        for (const r of g.rows) {
          if (r[i].trim() === '') continue
          const v = parseNumber(r[i], modeOf(i))
          if (v === null) {
            const prev = nonNumeric.get(columns[i])
            nonNumeric.set(columns[i], { count: (prev?.count ?? 0) + 1, example: prev?.example ?? r[i] })
          } else nums.push(v)
        }
        if (nums.length === 0) { cells.push(''); return }
        if (a.op === 'sum') cells.push(formatNumber(exactSum(nums)))
        else if (a.op === 'avg') cells.push(formatNumber(exactSum(nums) / nums.length))
        else if (a.op === 'min') cells.push(formatNumber(Math.min(...nums)))
        else cells.push(formatNumber(Math.max(...nums)))
      })
      outRows.push(cells)
    }
    // Gruppenschlüssel behalten ihren Modus; Ergebnisse von count/sum/avg/min/max sind JS-Zahlen.
    jsonCol = [...gIdx.map(i => jsonCol[i]), ...aggs.map(() => true)]
    columns = outCols
    rows = outRows
  }

  if (q.order_by && q.order_by.length) {
    const keys = q.order_by.map(o => ({ i: colIndex(columns, o.column, 'order_by'), desc: !!o.desc }))
    rows = [...rows].sort((a, b) => {
      for (const k of keys) {
        // Leere Zellen immer ans Ende, egal in welche Richtung sortiert wird.
        const ea = a[k.i].trim() === ''
        const eb = b[k.i].trim() === ''
        if (ea !== eb) return ea ? 1 : -1
        const c = compare(a[k.i], b[k.i], modeOf(k.i))
        if (c !== 0) return k.desc ? -c : c
      }
      return 0
    })
  }

  const totalBeforeLimit = rows.length
  if (q.limit !== undefined) {
    if (!Number.isInteger(q.limit) || q.limit < 1) throw new DatasetQueryError('limit muss eine ganze Zahl ≥ 1 sein')
    rows = rows.slice(0, q.limit)
  }

  if (q.select && q.select.length) {
    const idx = q.select.map(s => colIndex(columns, s, 'select'))
    columns = idx.map(i => columns[i])
    jsonCol = idx.map(i => jsonCol[i])
    rows = rows.map(r => idx.map(i => r[i]))
  }

  return {
    table: { columns, rows, files: base.files, ...(jsonCol.some(Boolean) ? { jsonNumberColumns: jsonCol } : {}) },
    totalBeforeLimit,
    nonNumeric: [...nonNumeric].map(([column, v]) => ({ column, ...v }))
  }
}

/** Markdown-Tabelle eines Datensatzes (für Bericht und Notiz-Platzhalter). */
export function markdownTable(table: Pick<CollectedTable, 'columns' | 'rows'>, maxRows = Infinity): string {
  const esc = (c: string) => c.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')
  const lines = [`| ${table.columns.map(esc).join(' | ')} |`, `| ${table.columns.map(() => '---').join(' | ')} |`]
  for (const r of table.rows.slice(0, maxRows)) lines.push(`| ${r.map(esc).join(' | ')} |`)
  return lines.join('\n')
}

/** Platzhalter `{{datensatz:tabelle3}}` in einer Notiz durch die Tabelle ersetzen. */
export const DATASET_PLACEHOLDER = /\{\{\s*datensatz\s*:\s*([A-Za-z0-9_-]+)\s*\}\}/g

/**
 * Zellwert aus einem fremden System als reiner Text für Markdown (Codex F52): Links, Bilder,
 * Wikilinks und HTML werden über HTML-Entitäten neutralisiert, damit ein präparierter Feldwert
 * nicht als Verweis oder Einbettung in die Notiz gelangt. Angezeigt wird derselbe Text.
 */
export function inertCell(c: string): string {
  return c.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\[/g, '&#91;').replace(/\]/g, '&#93;').replace(/`/g, '&#96;')
}

export function fillDatasetPlaceholders(markdown: string, getDataset: (id: string) => CollectedTable | null, maxRows = 2_000): { markdown: string; missing: string[]; tooLarge: string[] } {
  const missing: string[] = []
  const tooLarge: string[] = []
  const out = markdown.replace(DATASET_PLACEHOLDER, (all, id: string) => {
    const t = getDataset(id)
    if (!t) { missing.push(id); return all }
    if (t.rows.length > maxRows) { tooLarge.push(id); return all }
    if (!t.foreign) return t.rows.length ? markdownTable(t) : '_(keine Zeilen)_'
    // Fremde Tabelle: feste Herkunftszeile + entschärfte Zellen (F52), Unvollständiges sichtbar —
    // auch, wenn keine Zeile übrig ist (F58).
    const partial = t.files.filter(f => f.status !== 'ok')
    const head = `_Daten aus „${inertCell(t.foreign.label)}“ (externes System), wörtlich übernommen${partial.length ? ` — UNVOLLSTÄNDIG: ${inertCell(partial.map(f => f.message ?? f.status).join('; '))}` : ''}._`
    if (!t.rows.length) return `${head}\n\n_(keine Zeilen)_`
    return `${head}\n\n${markdownTable({ columns: t.columns.map(inertCell), rows: t.rows.map(r => r.map(inertCell)) })}`
  })
  return { markdown: out, missing, tooLarge }
}
