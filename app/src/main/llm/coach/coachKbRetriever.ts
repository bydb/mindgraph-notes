// Coach-Knowledge-Base: lädt die Markdown-KB aus app/resources/coach-kb beim
// Main-Start einmal in eine In-Memory-Map und liefert per Keyword-Scoring die
// Top-K Treffer zu einer Nutzer-Query zurück.
//
// Bewusste Vereinfachung gegenüber einem Embedding-Index: die KB ist klein
// (≤30 Dateien), das LLM verträgt einen unscharfen Keyword-Treffer und braucht
// keine semantische Nähe — Synonyme stehen explizit in der Frontmatter.

import { app } from 'electron'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'

interface KbFrontmatter {
  id?: string
  moduleId?: string
  keywords?: string[]
  suggestsModules?: string[]
  suggestsWidgets?: string[]
  suggestsProfile?: string
}

export interface KbDoc {
  id: string                  // Stable-ID (frontmatter.id ODER Dateiname ohne .md)
  relPath: string             // z.B. modules/notes-chat.md
  title: string               // erste H1 oder Dateiname
  frontmatter: KbFrontmatter
  body: string                // Markdown ohne Frontmatter
  headings: string[]          // alle H2 für Score-Mischung
}

let kbCache: KbDoc[] | null = null
let kbLoadPromise: Promise<KbDoc[]> | null = null

// Deutsche + englische Stopwords. Reicht für Keyword-Scoring, kein Wörterbuch.
const STOPWORDS = new Set([
  'der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einen', 'einem', 'einer',
  'und', 'oder', 'aber', 'nicht', 'kein', 'keine', 'mit', 'für', 'von', 'zu', 'zur', 'zum',
  'auf', 'an', 'in', 'im', 'aus', 'ist', 'sind', 'war', 'waren', 'wie', 'was', 'wer',
  'ich', 'du', 'er', 'sie', 'es', 'wir', 'ihr', 'mein', 'dein', 'sein', 'ihren',
  'will', 'möchte', 'brauche', 'soll', 'kann', 'könnte', 'machen', 'machen',
  'the', 'a', 'an', 'and', 'or', 'not', 'with', 'for', 'of', 'to', 'in', 'on',
  'is', 'are', 'was', 'were', 'how', 'what', 'who', 'i', 'you', 'we', 'they',
  'want', 'need', 'can', 'could', 'do', 'does', 'make', 'have', 'has'
])

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s,.;:!?()\[\]{}"'`/\\—–-]+/u)
    .map(t => t.trim())
    .filter(t => t.length >= 2 && !STOPWORDS.has(t))
}

// Minimaler Frontmatter-Parser — nur die Subsets die wir brauchen.
// Akzeptiert: ---\n<yaml>\n---\n<body>
function parseFrontmatter(raw: string): { fm: KbFrontmatter; body: string } {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/)
  if (!m) return { fm: {}, body: raw }
  const yamlBlock = m[1]
  const body = m[2]
  const fm: KbFrontmatter = {}
  for (const line of yamlBlock.split(/\r?\n/)) {
    const kvMatch = line.match(/^([a-zA-Z]+):\s*(.+)$/)
    if (!kvMatch) continue
    const key = kvMatch[1].trim()
    const value = kvMatch[2].trim()
    if (key === 'keywords' || key === 'suggestsModules' || key === 'suggestsWidgets') {
      // Liste: [a, b, c]
      const listMatch = value.match(/^\[(.*)\]$/)
      if (listMatch) {
        const items = listMatch[1].split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean)
        ;(fm as Record<string, unknown>)[key] = items
      }
    } else if (key === 'id' || key === 'moduleId' || key === 'suggestsProfile') {
      ;(fm as Record<string, unknown>)[key] = value.replace(/^["']|["']$/g, '')
    }
  }
  return { fm, body }
}

function extractHeadings(body: string): string[] {
  return [...body.matchAll(/^##\s+(.+)$/gm)].map(m => m[1].trim())
}

function extractTitle(body: string, fallback: string): string {
  const h1 = body.match(/^#\s+(.+)$/m)
  return h1 ? h1[1].trim() : fallback
}

async function loadFile(absPath: string, relPath: string): Promise<KbDoc | null> {
  try {
    const raw = await fs.readFile(absPath, 'utf-8')
    const { fm, body } = parseFrontmatter(raw)
    const title = extractTitle(body, path.basename(relPath, '.md'))
    const id = fm.id || path.basename(relPath, '.md')
    return {
      id,
      relPath,
      title,
      frontmatter: fm,
      body: body.trim(),
      headings: extractHeadings(body)
    }
  } catch (err) {
    console.warn(`[coach-kb] Failed to load ${relPath}:`, err)
    return null
  }
}

async function walkKb(rootDir: string, relBase = ''): Promise<KbDoc[]> {
  const entries = await fs.readdir(rootDir, { withFileTypes: true })
  const docs: KbDoc[] = []
  for (const entry of entries) {
    const childRel = relBase ? `${relBase}/${entry.name}` : entry.name
    const childAbs = path.join(rootDir, entry.name)
    if (entry.isDirectory()) {
      docs.push(...await walkKb(childAbs, childRel))
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      const doc = await loadFile(childAbs, childRel)
      if (doc) docs.push(doc)
    }
  }
  return docs
}

function resolveKbRoot(): string {
  // Im Build: app.getAppPath() zeigt auf den asar-Root. Resources liegen in
  // process.resourcesPath. Im Dev-Modus (electron-vite) liegt die KB unter
  // <repo>/app/resources/coach-kb relativ zum Working Dir.
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'coach-kb')
  }
  // Dev: relative zum Cwd
  return path.join(app.getAppPath(), 'resources', 'coach-kb')
}

export async function loadKb(): Promise<KbDoc[]> {
  if (kbCache) return kbCache
  if (kbLoadPromise) return kbLoadPromise
  kbLoadPromise = (async () => {
    const root = resolveKbRoot()
    try {
      const docs = await walkKb(root)
      kbCache = docs
      console.log(`[coach-kb] Loaded ${docs.length} docs from ${root}`)
      return docs
    } catch (err) {
      console.error(`[coach-kb] Failed to load KB from ${root}:`, err)
      kbCache = []
      return []
    } finally {
      kbLoadPromise = null
    }
  })()
  return kbLoadPromise
}

function scoreDoc(doc: KbDoc, queryTokens: string[]): number {
  if (queryTokens.length === 0) return 0
  let score = 0
  // Implizite Keywords: die id (z.B. "smart-connections") und der
  // Dateiname-Stamm (z.B. "smart-connections" aus "modules/smart-connections.md")
  // werden tokenisiert und als hochgewichtete Keywords behandelt — sonst
  // findet "smart connections was ist das" den entsprechenden Eintrag nicht,
  // wenn der KB-Autor vergessen hat, das Modul-Wort manuell zu listen.
  const explicitKeywords = (doc.frontmatter.keywords || []).map(k => k.toLowerCase())
  const idTokens = tokenize(doc.id)
  const fileTokens = tokenize(doc.relPath.replace(/\.md$/, '').split('/').pop() || '')
  const keywords = new Set<string>([...explicitKeywords, ...idTokens, ...fileTokens])
  const titleTokens = new Set(tokenize(doc.title))
  const headingTokens = new Set(doc.headings.flatMap(h => tokenize(h)))
  for (const tok of queryTokens) {
    if (keywords.has(tok)) score += 3
    if (titleTokens.has(tok)) score += 2
    if (headingTokens.has(tok)) score += 1
  }
  return score
}

export interface KbRetrievalResult {
  doc: KbDoc
  score: number
}

export async function retrieveKb(query: string, topK = 3): Promise<KbRetrievalResult[]> {
  const docs = await loadKb()
  const tokens = tokenize(query)
  const scored = docs
    .map(doc => ({ doc, score: scoreDoc(doc, tokens) }))
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
  return scored
}

// Liefert ein kompaktes Snippet für den System-Prompt: Titel + Frontmatter-Hints
// + Body (auf max ~800 Zeichen gekürzt, an Wortgrenze).
export function snippetForPrompt(doc: KbDoc, maxChars = 800): string {
  const hints: string[] = []
  if (doc.frontmatter.suggestsModules?.length) {
    hints.push(`Module: ${doc.frontmatter.suggestsModules.join(', ')}`)
  }
  if (doc.frontmatter.suggestsWidgets?.length) {
    hints.push(`Widgets: ${doc.frontmatter.suggestsWidgets.join(', ')}`)
  }
  if (doc.frontmatter.suggestsProfile) {
    hints.push(`Profil: ${doc.frontmatter.suggestsProfile}`)
  }
  let body = doc.body
  if (body.length > maxChars) {
    const cut = body.lastIndexOf(' ', maxChars)
    body = body.slice(0, cut > 0 ? cut : maxChars) + '…'
  }
  const hintLine = hints.length ? `(${hints.join(' · ')})\n` : ''
  return `[${doc.relPath}] ${doc.title}\n${hintLine}${body}`
}
