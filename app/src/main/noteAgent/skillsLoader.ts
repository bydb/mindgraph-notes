// Agent-Skills Stufe 1 (docs/agent-skills-plan.md): Vault-Skills im offenen
// SKILL.md-Standard (agentskills.io) — <vault>/Skills/<ordner>/SKILL.md.
// Skills sind reine Markdown-Anleitungen des Nutzers (KEIN Code; scripts/ wird
// bewusst nicht ausgeführt). Identität für Aktivierung ist der Ordnername;
// der Anzeigename kommt aus dem Frontmatter. Deaktivierte Skills stehen in
// vault-settings.json unter `skillsDisabled` (SKILL.md bleibt spec-rein).

import { promises as fs } from 'fs'
import * as path from 'path'

export const SKILLS_DIRNAME = 'Skills'
const MAX_SKILLS = 50
const MAX_SKILL_BODY_CHARS = 12_000
const MAX_SKILL_FILE_BYTES = 512 * 1024

export interface VaultSkillHeader {
  name: string // Anzeigename (Frontmatter `name`, Fallback Ordnername)
  description: string
  folderName: string // stabile Identität (Aktivierung, use_skill-Lookup)
}

export interface VaultSkillInfo extends VaultSkillHeader {
  relPath: string // vault-relativer Pfad zur SKILL.md
  enabled: boolean
}

// Minimaler Frontmatter-Parser für die zwei Spec-Pflichtfelder — bewusst ohne
// YAML-Dependency (einzeilige `name:`/`description:`-Werte, wie in der Spec üblich).
function parseSkillFile(content: string): { name?: string; description?: string; body: string } {
  const m = content.match(/^---\n([\s\S]*?)\n---\n?/)
  if (!m) return { body: content }
  const body = content.slice(m[0].length)
  const pick = (key: string): string | undefined => {
    const line = m[1].match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))
    return line ? line[1].trim().replace(/^["']|["']$/g, '') : undefined
  }
  return { name: pick('name'), description: pick('description'), body }
}

async function readSkillsDisabled(vaultPath: string): Promise<Set<string>> {
  try {
    const raw = await fs.readFile(path.join(vaultPath, '.mindgraph', 'vault-settings.json'), 'utf-8')
    const parsed = JSON.parse(raw) as { skillsDisabled?: unknown }
    if (Array.isArray(parsed.skillsDisabled)) {
      return new Set(parsed.skillsDisabled.filter((s): s is string => typeof s === 'string'))
    }
  } catch {
    /* keine Settings-Datei → alles aktiviert */
  }
  return new Set()
}

export async function listVaultSkills(vaultPath: string): Promise<VaultSkillInfo[]> {
  const skillsDir = path.join(vaultPath, SKILLS_DIRNAME)
  let dirents
  try {
    dirents = await fs.readdir(skillsDir, { withFileTypes: true })
  } catch {
    return []
  }
  const disabled = await readSkillsDisabled(vaultPath)
  const out: VaultSkillInfo[] = []
  for (const d of dirents) {
    if (!d.isDirectory() || d.name.startsWith('.')) continue
    if (out.length >= MAX_SKILLS) break
    const skillFile = path.join(skillsDir, d.name, 'SKILL.md')
    try {
      const st = await fs.stat(skillFile)
      if (!st.isFile() || st.size > MAX_SKILL_FILE_BYTES) continue
      const parsed = parseSkillFile(await fs.readFile(skillFile, 'utf-8'))
      out.push({
        name: parsed.name || d.name,
        description: parsed.description || '',
        folderName: d.name,
        relPath: `${SKILLS_DIRNAME}/${d.name}/SKILL.md`,
        enabled: !disabled.has(d.name)
      })
    } catch {
      /* Ordner ohne SKILL.md überspringen */
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, 'de'))
}

export async function listEnabledSkillHeaders(vaultPath: string): Promise<VaultSkillHeader[]> {
  const all = await listVaultSkills(vaultPath)
  return all.filter(s => s.enabled).map(({ name, description, folderName }) => ({ name, description, folderName }))
}

// Voller Skill-Body für use_skill — ohne Frontmatter, Budget-gekappt.
export async function readSkillBody(vaultPath: string, folderName: string): Promise<string> {
  const safeFolder = path.basename(folderName)
  const skillFile = path.join(vaultPath, SKILLS_DIRNAME, safeFolder, 'SKILL.md')
  const content = await fs.readFile(skillFile, 'utf-8')
  const { body } = parseSkillFile(content)
  const trimmed = body.trim()
  if (!trimmed) throw new Error(`Skill "${safeFolder}" hat keinen Anleitungstext`)
  return trimmed.length > MAX_SKILL_BODY_CHARS
    ? trimmed.slice(0, MAX_SKILL_BODY_CHARS) + '\n[gekürzt: Skill-Budget erreicht]'
    : trimmed
}

// Deaktivierungs-Liste in vault-settings.json fortschreiben — andere Felder
// (features etc.) bleiben unangetastet.
export async function setSkillEnabled(vaultPath: string, folderName: string, enabled: boolean): Promise<void> {
  const settingsFile = path.join(vaultPath, '.mindgraph', 'vault-settings.json')
  let settings: Record<string, unknown> = {}
  try {
    settings = JSON.parse(await fs.readFile(settingsFile, 'utf-8')) as Record<string, unknown>
  } catch {
    /* Datei fehlt → neu anlegen */
  }
  const current = new Set(
    Array.isArray(settings.skillsDisabled) ? (settings.skillsDisabled as unknown[]).filter((s): s is string => typeof s === 'string') : []
  )
  if (enabled) current.delete(folderName)
  else current.add(folderName)
  settings.skillsDisabled = Array.from(current).sort()
  await fs.mkdir(path.dirname(settingsFile), { recursive: true })
  await fs.writeFile(settingsFile, JSON.stringify(settings, null, 2), 'utf-8')
}

// Neuen Skill aus Template anlegen. Gibt den vault-relativen Pfad zur SKILL.md zurück.
export async function createSkill(vaultPath: string, rawName: string): Promise<{ relPath: string; folderName: string }> {
  const displayName = rawName.trim()
  if (!displayName) throw new Error('Skill-Name fehlt')
  const folderName = displayName
    .toLowerCase()
    .replace(/[äöüß]/g, c => (({ 'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'ß': 'ss' })[c] || c))
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  if (!folderName) throw new Error('Skill-Name ergibt keinen gültigen Ordnernamen')
  const dir = path.join(vaultPath, SKILLS_DIRNAME, folderName)
  try {
    await fs.access(path.join(dir, 'SKILL.md'))
    throw new Error(`Skill "${folderName}" existiert bereits`)
  } catch (e) {
    if (e instanceof Error && e.message.includes('existiert bereits')) throw e
  }
  await fs.mkdir(dir, { recursive: true })
  const template = `---
name: ${displayName}
description: <Wann soll der Agent diesen Skill anwenden? Ein Satz.>
---

# ${displayName}

## Wann anwenden

<Beschreibe die Aufgaben, für die diese Anleitung gilt.>

## Vorgehen

1. <Schritt>
2. <Schritt>
3. <Schritt>

## Regeln

- <Konvention, die immer gelten soll>
`
  await fs.writeFile(path.join(dir, 'SKILL.md'), template, 'utf-8')
  return { relPath: `${SKILLS_DIRNAME}/${folderName}/SKILL.md`, folderName }
}
