/**
 * Synonym-Generator: erzeugt thematische Begriffe pro Projektordner.
 *
 * Liest _STATUS.md + die letzten 10 .md-Dateien aus dem Projektordner,
 * lässt Ollama 8–12 Synonyme/Topic-Begriffe extrahieren und schreibt
 * `<Projektordner>/.project-synonyms.json`.
 *
 * Ziel: das Email-Matching versteht „Fachtag" und „Fachforum" als
 * dasselbe Konzept, ohne dass der User Synonyme manuell pflegen muss.
 */

import * as path from 'path'
import * as fs from 'fs/promises'

const OLLAMA_LOCAL_URL = 'http://localhost:11434'
const MAX_FILES = 10
const MAX_CHARS_PER_FILE = 3000
const SYNONYM_FILE = '.project-synonyms.json'

export interface ProjectSynonymCache {
  synonyms: string[]
  generatedAt: string
  model: string
  sourceCount: number
}

interface FileWithMtime {
  name: string
  mtimeMs: number
}

async function listProjectMarkdownFiles(folderAbs: string): Promise<FileWithMtime[]> {
  let entries: string[]
  try {
    entries = await fs.readdir(folderAbs)
  } catch {
    return []
  }
  const result: FileWithMtime[] = []
  for (const name of entries) {
    if (!name.endsWith('.md')) continue
    if (name.startsWith('.')) continue
    if (name.startsWith('_STATUS')) continue
    try {
      const stat = await fs.stat(path.join(folderAbs, name))
      if (!stat.isFile()) continue
      result.push({ name, mtimeMs: stat.mtimeMs })
    } catch {
      continue
    }
  }
  result.sort((a, b) => b.mtimeMs - a.mtimeMs)
  return result.slice(0, MAX_FILES)
}

function clipFile(content: string): string {
  if (content.length <= MAX_CHARS_PER_FILE) return content
  return content.slice(0, MAX_CHARS_PER_FILE) + '\n…'
}

function buildPrompt(projectName: string, statusContent: string, files: { name: string; content: string }[]): string {
  const fileBlocks = files
    .map(f => `# Datei: ${f.name}\n${clipFile(f.content)}`)
    .join('\n\n---\n\n')

  return `Du bist ein Topic-Extraktor. Generiere 8 bis 12 Synonyme und Topic-Begriffe, mit denen Emails inhaltlich dem Projekt "${projectName}" zugeordnet werden können.

REGELN:
- Antworte AUSSCHLIESSLICH mit gültigem JSON in folgendem Schema:
  { "synonyms": ["wort1", "wort2", ...] }
- Jedes Wort ist EIN Begriff (kein Satz, keine Phrase mit Leerzeichen, max. 30 Zeichen).
- Verwende die SPRACHE des Quelltextes (deutsch falls deutsch, englisch falls englisch).
- KEINE Stopwörter, KEINE generischen Wörter wie "Projekt", "Dokument", "Datei".
- Achte auf Synonyme und thematische Nachbarschaften (z.B. "Fachtag", "Fachforum", "Tagung").
- KEIN Markdown, KEINE Erklärungen, NUR JSON.

KONTEXT — _STATUS.md des Projekts:
${statusContent || '(leer)'}

KONTEXT — letzte Projektdateien:
${fileBlocks || '(keine)'}

JSON-Antwort:`
}

async function callOllama(model: string, prompt: string): Promise<string> {
  const response = await fetch(`${OLLAMA_LOCAL_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt,
      stream: false,
      think: false,
      format: 'json',
      options: { temperature: 0.2, num_predict: 400 }
    })
  })
  if (!response.ok) {
    const errText = await response.text().catch(() => '')
    throw new Error(`Ollama API ${response.status} ${errText.slice(0, 200)}`)
  }
  const data = await response.json() as { response?: string }
  const result = (data.response || '').trim()
  if (!result) throw new Error('Ollama lieferte leere Antwort')
  return result
}

function parseSynonyms(raw: string): string[] {
  // Versuch 1: strikt JSON parsen
  try {
    const parsed = JSON.parse(raw) as { synonyms?: unknown }
    if (parsed && Array.isArray(parsed.synonyms)) {
      return cleanSynonymList(parsed.synonyms)
    }
  } catch {
    // weiter mit Versuch 2
  }

  // Versuch 2: erstes JSON-Objekt im Fließtext extrahieren
  const objMatch = raw.match(/\{[\s\S]*\}/)
  if (objMatch) {
    try {
      const parsed = JSON.parse(objMatch[0]) as { synonyms?: unknown }
      if (parsed && Array.isArray(parsed.synonyms)) {
        return cleanSynonymList(parsed.synonyms)
      }
    } catch {
      // weiter mit Versuch 3
    }
  }

  // Versuch 3: Zeilen-Extraktion (Bullet-Listen)
  const lines = raw.split('\n')
    .map(l => l.replace(/^[\s\-*•"']+/, '').replace(/[\s,"']+$/, '').trim())
    .filter(l => l.length > 0 && l.length <= 30 && !l.includes(' ') && !/^[{}\[\]]/.test(l))
  return cleanSynonymList(lines)
}

function cleanSynonymList(arr: unknown[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of arr) {
    if (typeof item !== 'string') continue
    const trimmed = item.trim().replace(/^[\-*•"']+|[\-*•"',]+$/g, '').trim()
    if (!trimmed) continue
    if (trimmed.length > 30) continue
    const key = trimmed.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(trimmed)
    if (out.length >= 15) break
  }
  return out
}

export async function generateProjectSynonyms(
  vaultPath: string,
  projectFolderRel: string,
  model: string
): Promise<ProjectSynonymCache> {
  const folderAbs = path.join(vaultPath, projectFolderRel)
  const projectName = path.basename(folderAbs).replace(/^\d+\s*-\s*/, '').trim()

  let statusContent = ''
  try {
    statusContent = await fs.readFile(path.join(folderAbs, '_STATUS.md'), 'utf-8')
  } catch {
    // _STATUS.md fehlt → projektDescription bleibt leer; LLM arbeitet mit Dateinamen + Inhalten
  }

  const fileEntries = await listProjectMarkdownFiles(folderAbs)
  const files: { name: string; content: string }[] = []
  for (const entry of fileEntries) {
    try {
      const content = await fs.readFile(path.join(folderAbs, entry.name), 'utf-8')
      files.push({ name: entry.name, content })
    } catch {
      continue
    }
  }

  const prompt = buildPrompt(projectName, statusContent, files)
  const raw = await callOllama(model, prompt)
  const synonyms = parseSynonyms(raw)

  const cache: ProjectSynonymCache = {
    synonyms,
    generatedAt: new Date().toISOString(),
    model,
    sourceCount: files.length + (statusContent ? 1 : 0)
  }

  await fs.writeFile(
    path.join(folderAbs, SYNONYM_FILE),
    JSON.stringify(cache, null, 2),
    'utf-8'
  )

  return cache
}

export async function loadProjectSynonyms(
  vaultPath: string,
  projectFolderRel: string
): Promise<ProjectSynonymCache | null> {
  const filePath = path.join(vaultPath, projectFolderRel, SYNONYM_FILE)
  try {
    const raw = await fs.readFile(filePath, 'utf-8')
    const parsed = JSON.parse(raw) as ProjectSynonymCache
    if (!Array.isArray(parsed.synonyms)) return null
    return parsed
  } catch {
    return null
  }
}

export function isSynonymCacheStale(cache: ProjectSynonymCache | null, maxAgeDays = 7): boolean {
  if (!cache) return true
  const generated = new Date(cache.generatedAt).getTime()
  if (isNaN(generated)) return true
  const ageMs = Date.now() - generated
  return ageMs > maxAgeDays * 24 * 60 * 60 * 1000
}
