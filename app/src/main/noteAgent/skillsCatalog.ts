// Agent-Skills Stufe 2 (docs/agent-skills-plan.md): kuratierter Skill-Katalog +
// Import vom Rechner. Der Katalog ist ein statisches JSON auf der Projekt-Website
// (docs/skills/index.json → mindgraph-notes.de) — bewusst JSON statt Roh-Markdown,
// damit GitHub Pages/Jekyll die Inhalte unverändert ausliefert.
//
// Pflicht-UX (Plan): Der komplette Skill-Inhalt wird VOR der Installation in der
// UI angezeigt. Installiert wird ausschließlich aus dem zuletzt geladenen Katalog
// (Main-seitiger Cache) — der Renderer liefert nie Inhalte an den Schreibpfad.

import { promises as fs } from 'fs'
import * as path from 'path'
import { SKILLS_DIRNAME } from './skillsLoader'

const CATALOG_URL = 'https://mindgraph-notes.de/skills/index.json'
const MAX_CATALOG_SKILLS = 100
const MAX_SKILL_CONTENT_CHARS = 40_000

export interface CatalogSkill {
  id: string
  name: string
  description: string
  language: string
  license: string
  source: string
  content: string // vollständige SKILL.md — für Vorschau-vor-Install
}

let lastCatalog: Map<string, CatalogSkill> | null = null

export async function fetchSkillsCatalog(): Promise<CatalogSkill[]> {
  const res = await fetch(CATALOG_URL, { signal: AbortSignal.timeout(10000) })
  if (!res.ok) throw new Error(`Katalog nicht erreichbar (HTTP ${res.status})`)
  const json = (await res.json()) as { skills?: unknown }
  if (!Array.isArray(json.skills)) throw new Error('Katalog hat ein unerwartetes Format')

  const skills: CatalogSkill[] = []
  for (const raw of json.skills.slice(0, MAX_CATALOG_SKILLS)) {
    const s = raw as Partial<CatalogSkill>
    if (typeof s.id !== 'string' || typeof s.name !== 'string' || typeof s.content !== 'string') continue
    if (!/^[a-z0-9-]{1,60}$/.test(s.id)) continue // id wird Ordnername — strikt halten
    if (s.content.length > MAX_SKILL_CONTENT_CHARS) continue
    skills.push({
      id: s.id,
      name: s.name,
      description: typeof s.description === 'string' ? s.description : '',
      language: typeof s.language === 'string' ? s.language : '',
      license: typeof s.license === 'string' ? s.license : '',
      source: typeof s.source === 'string' ? s.source : '',
      content: s.content
    })
  }
  lastCatalog = new Map(skills.map(s => [s.id, s]))
  return skills
}

// Installiert aus dem zuletzt geladenen Katalog — nie überschreiben.
export async function installCatalogSkill(vaultPath: string, id: string): Promise<{ relPath: string; folderName: string }> {
  const skill = lastCatalog?.get(id)
  if (!skill) throw new Error('Skill nicht im geladenen Katalog — Katalog zuerst laden')
  const dir = path.join(vaultPath, SKILLS_DIRNAME, skill.id)
  try {
    await fs.access(path.join(dir, 'SKILL.md'))
    throw new Error(`Skill "${skill.id}" existiert bereits im Vault`)
  } catch (e) {
    if (e instanceof Error && e.message.includes('existiert bereits')) throw e
  }
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(path.join(dir, 'SKILL.md'), skill.content, 'utf-8')
  return { relPath: `${SKILLS_DIRNAME}/${skill.id}/SKILL.md`, folderName: skill.id }
}

// Import vom Rechner: einzelne .md-Datei ODER ein Skill-Ordner mit SKILL.md.
// scripts/-Verzeichnisse werden bewusst nicht mitkopiert (der Notiz-Agent führt
// keinen Code aus) — der Aufrufer zeigt das dem Nutzer an.
export async function importSkillFromPath(
  vaultPath: string,
  chosenPath: string
): Promise<{ relPath: string; folderName: string; skippedScripts: boolean }> {
  const st = await fs.stat(chosenPath)

  if (st.isFile()) {
    if (!chosenPath.toLowerCase().endsWith('.md')) throw new Error('Nur Markdown-Dateien (.md) oder Skill-Ordner importierbar')
    const stem = path.basename(chosenPath).replace(/\.md$/i, '')
    const folderName = stem
      .toLowerCase()
      .replace(/[äöüß]/g, c => (({ 'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'ß': 'ss' })[c] || c))
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'importierter-skill'
    const dir = path.join(vaultPath, SKILLS_DIRNAME, folderName)
    try {
      await fs.access(path.join(dir, 'SKILL.md'))
      throw new Error(`Skill "${folderName}" existiert bereits im Vault`)
    } catch (e) {
      if (e instanceof Error && e.message.includes('existiert bereits')) throw e
    }
    await fs.mkdir(dir, { recursive: true })
    await fs.copyFile(chosenPath, path.join(dir, 'SKILL.md'))
    return { relPath: `${SKILLS_DIRNAME}/${folderName}/SKILL.md`, folderName, skippedScripts: false }
  }

  // Ordner-Import: muss eine SKILL.md enthalten.
  await fs.access(path.join(chosenPath, 'SKILL.md'))
  const folderName = path.basename(chosenPath)
  const targetDir = path.join(vaultPath, SKILLS_DIRNAME, folderName)
  try {
    await fs.access(targetDir)
    throw new Error(`Skill "${folderName}" existiert bereits im Vault`)
  } catch (e) {
    if (e instanceof Error && e.message.includes('existiert bereits')) throw e
  }

  let skippedScripts = false
  const copyDir = async (src: string, dest: string): Promise<void> => {
    await fs.mkdir(dest, { recursive: true })
    for (const entry of await fs.readdir(src, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue
      const from = path.join(src, entry.name)
      const to = path.join(dest, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === 'scripts') {
          skippedScripts = true
          continue
        }
        await copyDir(from, to)
      } else if (entry.isFile()) {
        await fs.copyFile(from, to)
      }
    }
  }
  await copyDir(chosenPath, targetDir)
  return { relPath: `${SKILLS_DIRNAME}/${folderName}/SKILL.md`, folderName, skippedScripts }
}
