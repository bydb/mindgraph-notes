#!/usr/bin/env node
// Erzeugt resources/starter-skills/skill-versions.json: je mitgeliefertem Skill die Prüfsummen
// aller Fassungen der SKILL.md, die je im Repo standen (Git-Historie) plus der aktuellen im
// Arbeitsbaum. Der Skill-Updater erkennt daran, ob ein Skill im Vault eine alte, unveränderte
// Auslieferung ist (gefahrlos ersetzbar) oder vom Nutzer angepasst wurde.
//
// Aufruf (in app/):  node scripts/skill-versions.mjs
// Nötig nach JEDER Änderung an einer resources/starter-skills/*/SKILL.md — der Test
// main/noteAgent/skillUpdates.test.ts schlägt sonst fehl.
//
// Normalisierung und Prüfsumme MÜSSEN shared/skillUpdate.ts (fingerprintText) entsprechen;
// derselbe Test prüft die Übereinstimmung an den echten Dateien.
//
// Bestehende Prüfsummen bleiben erhalten (nur ergänzen): eine flache CI-Kopie ohne Historie
// darf die Liste nicht kürzen.

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const APP = join(dirname(fileURLToPath(import.meta.url)), '..')
const DIR = join(APP, 'resources', 'starter-skills')
const OUT = join(DIR, 'skill-versions.json')

// Zeile, die der Nutzer absichtlich ändert — zählt nicht zur Prüfsumme, wird beim Update übernommen.
const KEEP_LINES = {
  'praesentation-nach-vorlage': '^- Vorlage: '
}

const KEEP_TOKEN = '\u0000KEEP\u0000'
function fingerprint(text, keepLine) {
  const lines = (text.replace(/^﻿/, '').replace(/\r\n?/g, '\n').replace(/\n+$/, '') + '\n').split('\n')
  if (keepLine) {
    const re = new RegExp(keepLine)
    const i = lines.findIndex(l => re.test(l))
    if (i >= 0) lines[i] = KEEP_TOKEN
  }
  return createHash('sha256').update(lines.join('\n'), 'utf8').digest('hex')
}

function git(args) {
  return execFileSync('git', args, { cwd: APP, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
}

const previous = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : { skills: {} }
const skills = {}
for (const name of readdirSync(DIR, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name).sort()) {
  const file = join(DIR, name, 'SKILL.md')
  if (!existsSync(file)) continue
  const keepLine = KEEP_LINES[name]
  const hashes = []
  const add = h => { if (!hashes.includes(h)) hashes.push(h) }
  const prev = previous.skills?.[name]
  // Mit anderer keepLine gerechnete Prüfsummen passen nicht mehr — dann neu aus der Historie.
  if (prev && prev.keepLine === keepLine) for (const h of prev.hashes ?? []) add(h)
  const rel = `resources/starter-skills/${name}/SKILL.md`
  let commits = []
  try {
    commits = git(['log', '--format=%H', '--reverse', '--', rel]).split('\n').filter(Boolean)
  } catch {
    console.error(`Hinweis: keine Git-Historie für ${rel} lesbar`)
  }
  for (const c of commits) {
    try {
      add(fingerprint(git(['show', `${c}:app/${rel}`]), keepLine))
    } catch {
      /* in diesem Commit gelöscht */
    }
  }
  add(fingerprint(readFileSync(file, 'utf8'), keepLine))
  skills[name] = { ...(keepLine ? { keepLine } : {}), hashes }
  console.log(`${name.padEnd(32)} ${hashes.length} Fassung(en)`)
}
writeFileSync(OUT, JSON.stringify({ version: 1, skills }, null, 2) + '\n')
console.log(`\ngeschrieben: ${OUT}`)
