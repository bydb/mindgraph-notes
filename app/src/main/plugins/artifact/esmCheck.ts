// Single-File-ESM-Erzwingung für Renderer-Bundles (ADR plugin-renderer-host §5.3/I-S3, F12).
//
// R1 lädt das Renderer-`renderer.js` als BLOB-URL-`import()` (CSP `script-src … blob:`, KEIN unsafe-eval).
// Damit ist NUR ein selbstenthaltenes Single-File-ESM tragfähig: relative/bare statische ODER dynamische
// Sub-Imports, `new URL('./x', import.meta.url)`-Asset-/Worker-Pfade, `eval`/`new Function` haben keine
// Plugin-Verzeichnis-Basis bzw. sind gesperrt. Diese Prüfung ist die **Build-Zeit-Vertragsgrenze** im
// Pack/Sign-Pfad — KEIN Laufzeit-Sicherheitsversprechen (Codex-Impl-F12): die Sicherheitsgrenze bleibt
// Signatur + Autorvertrauen (Option A) + writeFileSafe. Sie gibt dem Plugin-Autor früh einen klaren Fehler,
// statt dass der Loader erst nach Top-Level-Seiteneffekten scheitert.
//
// Bewusst heuristisch (kein voller Parser): false positives auf `eval(`/`import.meta.url` in String-/
// Kommentar-Literalen sind ein Autor-Ärgernis, kein Sicherheitsloch. `data:`-Importe sind erlaubt (inline-Assets).

export interface EsmViolation {
  kind: string
  detail?: string
}

const BANNED: { re: RegExp; kind: string }[] = [
  { re: /\beval\s*\(/, kind: 'eval' },
  { re: /\bnew\s+Function\s*\(/, kind: 'new Function' },
  { re: /\bimport\.meta\.url\b/, kind: 'import.meta.url' },
]

// `import x from '...'` / `import { a } from '...'` / `export { x } from '...'` (Re-Export) — statischer Bezug.
// `[^;]*?` (lazy, erlaubt geschweifte Bindings + Zeilenumbrüche) stoppt am ersten `from`.
const STATIC_FROM = /(?:^|[\s;}])(?:import|export)\b[^;]*?\bfrom\s*['"]([^'"]+)['"]/g
// `import '...'` (Seiteneffekt-Import ohne Bindings).
const SIDE_EFFECT_IMPORT = /(?:^|[\s;}])import\s*['"]([^'"]+)['"]/g
// `import('...')` mit String-Literal (statisch auflösbarer dynamischer Import).
const DYNAMIC_IMPORT = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g

const isInlineSpecifier = (spec: string): boolean => spec.startsWith('data:')

/** Entfernt Block- und Zeilenkommentare, damit Kommentartext (z.B. „kein import.meta.url") keine
 *  False-Positives erzeugt. Heuristisch (kein Tokenizer); `//` in URLs (`http://`) bleibt unberührt. */
function stripComments(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:/])\/\/[^\n]*/g, '$1')
}

/** Findet alle Verstöße gegen den Single-File-ESM-Vertrag (leer = selbstenthalten). */
export function findEsmViolations(rawCode: string): EsmViolation[] {
  const code = stripComments(rawCode)
  const out: EsmViolation[] = []
  for (const b of BANNED) if (b.re.test(code)) out.push({ kind: b.kind })
  const checkSpec = (spec: string, kind: string): void => {
    if (!isInlineSpecifier(spec)) out.push({ kind, detail: spec })
  }
  for (const m of code.matchAll(STATIC_FROM)) checkSpec(m[1], 'static-import')
  for (const m of code.matchAll(SIDE_EFFECT_IMPORT)) checkSpec(m[1], 'side-effect-import')
  for (const m of code.matchAll(DYNAMIC_IMPORT)) checkSpec(m[1], 'dynamic-import')
  return out
}

/** Wirft, wenn `code` kein selbstenthaltenes Single-File-ESM ist (Pack/Sign-Gate, F12). */
export function assertSelfContainedEsm(code: string, label: string): void {
  const violations = findEsmViolations(code)
  if (!violations.length) return
  const detail = violations.map((v) => (v.detail ? `${v.kind}('${v.detail}')` : v.kind)).join(', ')
  throw new Error(
    `'${label}' ist kein selbstenthaltenes Single-File-ESM (ADR plugin-renderer-host §5.3, F12): ${detail}. ` +
      `Bündle ALLE Abhängigkeiten + Assets inline (data:); kein relativer/bare Import, kein import.meta.url, kein eval/new Function.`,
  )
}
