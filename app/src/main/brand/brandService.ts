/**
 * Hausdesign im Vault anlegen, laden, entfernen (docs/codex-collab/skill-builder-hausdesign.md).
 *
 * - Ort: ein verwalteter Skill-Ordner unter `Skills/` (Standard `hausdesign`, bei fremdem Ordner
 *   gleichen Namens `hausdesign-2` …; F11). Erkannt wird er NUR an `hausdesign.json` mit
 *   Besitzmarke, nie am Ordnernamen.
 * - Eine Wahrheit für „aktiv" (F03): `enabled` im Profil. Der Skill-Text erklärt nur.
 * - Schreiben (F10): jede Datei atomar über writeBinaryFileSafe (Zwischendatei + Umbenennen,
 *   Sicherung der alten Fassung), jeder Pfad symlink-sicher im Vault aufgelöst; das Profil als
 *   LETZTE Datei — ohne Profil gibt es kein Hausdesign, also nie eine halbe aktive Konfiguration.
 * - Entfernen löscht nur die im Profil aufgeführten Dateien; Fremdes bleibt (F11).
 */

import { promises as fs } from 'fs'
import * as path from 'path'
import { createHash } from 'crypto'
import { resolveInVaultSafe } from '../telegram/agent/tools/vaultPaths'
import { writeBinaryFileSafe } from '../binaryWrite'
import { bundledResourcesDir } from '../bundledResources'
import {
  BRAND_DEFAULT_FOLDER, BRAND_LIMITS, BRAND_LOGO_FILE, BRAND_MANAGED_BY, BRAND_PROFILE_FILE, BRAND_PROFILE_VERSION,
  brandFileStem, cleanBrandText, deriveBrandTokens, isHexColor, normalizeHex, parseBrandProfile,
  type BrandColors, type BrandContact, type BrandProfile, type BrandTokens
} from '../../shared/brand'
import { buildBrandDeck } from '../../shared/brandDeck'
import { buildBrandLetter } from '../../shared/brandLetter'
import { checkPptxConsistency } from '../../shared/pptxTemplate'

const SKILLS = 'Skills'
const STARTER_DECK = path.join('starter-skills', 'praesentation-nach-vorlage', 'MindGraph-Hausstil.pptx')

export interface BrandLocation {
  folder: string
  folderRel: string
  profile: BrandProfile
}

async function readSmall(vault: string, rel: string, max: number): Promise<Buffer> {
  const abs = await resolveInVaultSafe(vault, rel)
  const fh = await fs.open(abs, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0))
  try {
    const st = await fh.stat()
    if (!st.isFile()) throw new Error('keine Datei')
    if (st.size > max) throw new Error('zu groß')
    return await fh.readFile()
  } finally {
    await fh.close()
  }
}

/** Sucht das verwaltete Profil (erstes gültiges nach Ordnername). Fehler/kaputt → null. */
export async function findBrand(vault: string): Promise<BrandLocation | null> {
  let dirents: import('fs').Dirent[]
  try {
    dirents = await fs.readdir(path.join(vault, SKILLS), { withFileTypes: true })
  } catch {
    return null
  }
  const names = dirents.filter(d => d.isDirectory() && !d.name.startsWith('.')).map(d => d.name).sort()
  for (const folder of names) {
    const rel = `${SKILLS}/${folder}/${BRAND_PROFILE_FILE}`
    let raw: Buffer
    try {
      raw = await readSmall(vault, rel, BRAND_LIMITS.maxProfileBytes)
    } catch {
      continue
    }
    try {
      const profile = parseBrandProfile(JSON.parse(raw.toString('utf-8')))
      if (profile) return { folder, folderRel: `${SKILLS}/${folder}`, profile }
    } catch {
      /* kaputtes JSON: kein Profil */
    }
  }
  return null
}

export interface BrandRunContext {
  profile: BrandProfile
  folderRel: string
  tokens: BrandTokens
  logo: Buffer
  /** Inhaltsadressierter Name für HTML-Seiten (F07). */
  logoAssetName: string
  /** Aktive Briefkopf-Skills der Einrichtung (für die Rangfolge im Prompt, F03). */
  letterSkills: string[]
}

/** Für einen Agent-Lauf: nur wenn aktiv und das Logo zur Prüfsumme passt. */
export async function loadBrandForRun(vault: string, skills: Array<{ folderName: string; name: string; enabled: boolean }>): Promise<BrandRunContext | null> {
  const loc = await findBrand(vault)
  if (!loc || !loc.profile.enabled) return null
  let logo: Buffer
  try {
    logo = await readSmall(vault, `${loc.folderRel}/${loc.profile.logo.file}`, BRAND_LIMITS.maxLogoBytes)
  } catch {
    return null
  }
  const sha = createHash('sha256').update(logo).digest('hex')
  if (sha !== loc.profile.logo.sha256) return null
  const letterSkills = skills
    .filter(s => s.enabled && s.folderName !== loc.folder && (/briefkopf/i.test(s.folderName) || /briefkopf/i.test(s.name)))
    .map(s => `${SKILLS}/${s.folderName}`)
  return {
    profile: loc.profile,
    folderRel: loc.folderRel,
    tokens: deriveBrandTokens(loc.profile.colors),
    logo,
    logoAssetName: `logo-${sha.slice(0, 12)}.png`,
    letterSkills
  }
}

export interface BrandSaveInput {
  name: string
  subline?: string
  logoHasName: boolean
  contact: BrandContact
  colors: BrandColors
  withLetter: boolean
  enabled: boolean
}

export interface PendingLogo {
  png: Buffer
  width: number
  height: number
}

function cleanInput(input: BrandSaveInput): BrandSaveInput {
  const name = cleanBrandText(input.name, BRAND_LIMITS.name)
  if (!name) throw new Error('Name der Einrichtung fehlt')
  const c = input.colors
  if (!isHexColor(c?.primary) || !isHexColor(c?.dark) || (c.secondary !== undefined && c.secondary !== '' && !isHexColor(c.secondary))) {
    throw new Error('Farben müssen als #RRGGBB angegeben sein')
  }
  const ct = input.contact ?? {}
  return {
    name,
    subline: cleanBrandText(input.subline, BRAND_LIMITS.subline) || undefined,
    logoHasName: input.logoHasName === true,
    contact: {
      address: cleanBrandText(ct.address, BRAND_LIMITS.address, true) || undefined,
      phone: cleanBrandText(ct.phone, BRAND_LIMITS.phone) || undefined,
      email: cleanBrandText(ct.email, BRAND_LIMITS.email) || undefined,
      web: cleanBrandText(ct.web, BRAND_LIMITS.web) || undefined
    },
    colors: {
      primary: normalizeHex(c.primary),
      dark: normalizeHex(c.dark),
      ...(c.secondary ? { secondary: normalizeHex(c.secondary) } : {})
    },
    withLetter: input.withLetter === true,
    enabled: input.enabled !== false
  }
}

async function pickFolder(vault: string, existing: BrandLocation | null): Promise<string> {
  if (existing) return existing.folder
  for (let i = 1; i <= 9; i++) {
    const folder = i === 1 ? BRAND_DEFAULT_FOLDER : `${BRAND_DEFAULT_FOLDER}-${i}`
    try {
      await fs.lstat(path.join(vault, SKILLS, folder))
    } catch {
      return folder
    }
  }
  throw new Error('Kein freier Ordnername für das Hausdesign unter Skills/')
}

function skillMarkdown(p: BrandProfile, folderRel: string): string {
  const name = p.name.replace(/[\r\n]/g, ' ')
  const lines = [
    '---',
    `name: Hausdesign ${name}`,
    `description: Erscheinungsbild von ${name} (Logo, Hausfarbe ${p.colors.primary}) für Präsentationen${p.letterFile ? ', Briefe' : ''}, Mindmaps, HTML-Seiten und Infografiken. Anwenden, wenn etwas „im Hausdesign“, „mit unserem Logo“ oder für die Einrichtung entstehen soll.`,
    '---',
    '',
    `# Hausdesign ${name}`,
    '',
    'Angelegt mit dem Hausdesign-Builder (Einstellungen → Skills). Ob das Hausdesign gilt, steuert der Schalter dort — nicht diese Datei. Änderungen hier überschreibt der Builder beim nächsten Speichern.',
    '',
    '## Was automatisch passiert',
    '',
    `- **Präsentationen:** Vorlage \`${folderRel}/${p.deckFile}\` (alle Layouts der MindGraph-Vorlage: Karten mit Symbolen, Schritte, Punktelisten, Kennzahlen, Abschnitt, Abschluss). Wer die mitgelieferte Vorlage nennt, bekommt diese.`,
    '- **Mindmaps:** Mitte, Linien und Äste in der Hausfarbe; die Kategorie-Farben (Problem, Lösung, Info) bleiben.',
    '- **HTML-Seiten:** Logo im Seitenkopf, Links und Hervorhebungen in der Hausfarbe (auch im Dunkelmodus lesbar).',
    '- **Infografiken:** Der Bildauftrag bekommt die Farbcodes mit (kein Logo im Bild).',
    ...(p.letterFile ? [`- **Briefe:** \`write_docx\` mit \`template: "${folderRel}/${p.letterFile}"\` und den Feldern \`DATUM\`, \`BETREFF\`, \`EMPFAENGER\` (Anschrift, Zeilen mit Zeilenumbruch). Gibt es einen eigenen Briefkopf-Skill der Einrichtung, hat der Vorrang.`] : []),
    '',
    '## Rangfolge',
    '',
    '1. Ausdrücklicher Wunsch im Auftrag',
    '2. Eigener Briefkopf-Skill der Einrichtung',
    '3. Ausdrücklich genannte eigene Vorlage',
    '4. Dieses Hausdesign',
    ''
  ]
  return lines.join('\n')
}

export async function saveBrand(vault: string, raw: BrandSaveInput, logo: PendingLogo | null): Promise<BrandLocation> {
  const input = cleanInput(raw)
  const existing = await findBrand(vault)
  if (!logo && !existing) throw new Error('Bitte zuerst ein Logo wählen')
  const folder = await pickFolder(vault, existing)
  const folderRel = `${SKILLS}/${folder}`
  const stem = brandFileStem(input.name)
  const deckFile = `${stem}-Praesentation.pptx`
  const letterFile = input.withLetter ? `${stem}-Briefkopf.docx` : undefined

  let logoPng: Buffer
  let logoW: number
  let logoH: number
  if (logo) {
    logoPng = logo.png; logoW = logo.width; logoH = logo.height
  } else {
    logoPng = await readSmall(vault, `${folderRel}/${existing!.profile.logo.file}`, BRAND_LIMITS.maxLogoBytes)
    logoW = existing!.profile.logo.width; logoH = existing!.profile.logo.height
  }
  if (logoPng.length > BRAND_LIMITS.maxLogoBytes) throw new Error('Logo ist nach dem Umwandeln zu groß')

  const template = await fs.readFile(path.join(bundledResourcesDir(), STARTER_DECK))
  const deck = await buildBrandDeck({
    template: new Uint8Array(template), name: input.name, logoHasName: input.logoHasName,
    colors: input.colors, logoPng: new Uint8Array(logoPng), logoWidth: logoW, logoHeight: logoH
  })
  const problems = await checkPptxConsistency(deck)
  if (problems.length) throw new Error(`Präsentationsvorlage fehlerhaft: ${problems.slice(0, 3).join('; ')}`)
  const letter = letterFile
    ? await buildBrandLetter({
        name: input.name, subline: input.subline, logoHasName: input.logoHasName, contact: input.contact,
        colors: input.colors, logoPng: new Uint8Array(logoPng), logoWidth: logoW, logoHeight: logoH
      })
    : null

  const files = [BRAND_LOGO_FILE, 'SKILL.md', deckFile, ...(letterFile ? [letterFile] : [])]
  const profile: BrandProfile = {
    version: BRAND_PROFILE_VERSION,
    managedBy: BRAND_MANAGED_BY,
    enabled: input.enabled,
    name: input.name,
    ...(input.subline ? { subline: input.subline } : {}),
    logoHasName: input.logoHasName,
    contact: Object.fromEntries(Object.entries(input.contact).filter(([, v]) => v)) as BrandContact,
    colors: input.colors,
    logo: { file: BRAND_LOGO_FILE, width: logoW, height: logoH, sha256: createHash('sha256').update(logoPng).digest('hex') },
    files,
    deckFile,
    ...(letterFile ? { letterFile } : {}),
    updatedAt: new Date().toISOString()
  }
  if (!parseBrandProfile(profile)) throw new Error('Hausdesign-Profil ungültig')

  const write = async (file: string, bytes: Uint8Array | string) => {
    const abs = await resolveInVaultSafe(vault, `${folderRel}/${file}`)
    const real = await fs.realpath(path.resolve(vault))
    await writeBinaryFileSafe(real, abs, typeof bytes === 'string' ? Buffer.from(bytes, 'utf-8') : bytes)
  }
  await write(BRAND_LOGO_FILE, logoPng)
  await write(deckFile, deck)
  if (letter && letterFile) await write(letterFile, letter)
  await write('SKILL.md', skillMarkdown(profile, folderRel))
  // Veraltete, SELBST angelegte Dateien (z. B. Name geändert → neuer Dateiname) entfernen.
  if (existing) {
    for (const old of existing.profile.files) {
      if (files.includes(old)) continue
      try { await fs.unlink(await resolveInVaultSafe(vault, `${folderRel}/${old}`)) } catch { /* schon weg */ }
    }
  }
  await write(BRAND_PROFILE_FILE, JSON.stringify(profile, null, 2) + '\n')
  return { folder, folderRel, profile }
}

export async function setBrandEnabled(vault: string, enabled: boolean): Promise<BrandLocation | null> {
  const loc = await findBrand(vault)
  if (!loc) return null
  const profile = { ...loc.profile, enabled, updatedAt: new Date().toISOString() }
  const abs = await resolveInVaultSafe(vault, `${loc.folderRel}/${BRAND_PROFILE_FILE}`)
  await writeBinaryFileSafe(await fs.realpath(path.resolve(vault)), abs, Buffer.from(JSON.stringify(profile, null, 2) + '\n', 'utf-8'))
  return { ...loc, profile }
}

/** Entfernt nur, was der Builder angelegt hat; Ordner nur, wenn danach leer. */
export async function removeBrand(vault: string): Promise<{ removed: number; keptFolder: boolean }> {
  const loc = await findBrand(vault)
  if (!loc) return { removed: 0, keptFolder: false }
  let removed = 0
  // Profil ZUERST: ein Abbruch mittendrin hinterlässt dann kein aktives Hausdesign.
  for (const f of [BRAND_PROFILE_FILE, ...loc.profile.files]) {
    try {
      await fs.unlink(await resolveInVaultSafe(vault, `${loc.folderRel}/${f}`))
      removed++
    } catch { /* fehlt schon */ }
  }
  let keptFolder = false
  try {
    await fs.rmdir(await resolveInVaultSafe(vault, loc.folderRel))
  } catch {
    keptFolder = true
  }
  return { removed, keptFolder }
}

/** Logo für die Anzeige in den Einstellungen. */
export async function readBrandLogo(vault: string): Promise<Buffer | null> {
  const loc = await findBrand(vault)
  if (!loc) return null
  try {
    return await readSmall(vault, `${loc.folderRel}/${loc.profile.logo.file}`, BRAND_LIMITS.maxLogoBytes)
  } catch {
    return null
  }
}
