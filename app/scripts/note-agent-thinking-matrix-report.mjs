#!/usr/bin/env node
// Gepaarter Vergleich der Thinking-Arme (discard | preserve | off).
//
// Gepaart heißt: verglichen wird nur, was denselben Fall UND dieselbe
// Wiederholung (= denselben Seed) hat. Mittelwerte über unterschiedlich
// besetzte Zellen wären hier die häufigste Fehlerquelle.

import fs from 'node:fs/promises'
import path from 'node:path'

const ARMS = ['discard', 'preserve', 'off']

async function loadArm(file) {
  const raw = JSON.parse(await fs.readFile(file, 'utf8'))
  const byKey = new Map()
  for (const run of raw.runs) {
    byKey.set(`${run.caseId}#${run.rep}`, {
      pass: run.score.pass,
      seconds: run.seconds,
      seed: run.seed ?? null,
      iterations: run.iterations,
      thinkingTurns: run.thinkingTurns ?? 0,
      failures: run.score.failures ?? []
    })
  }
  return { meta: raw.meta, byKey }
}

function pct(value) {
  return `${(value * 100).toFixed(1)} %`
}

async function main() {
  const dir = process.argv[2]
  if (!dir) throw new Error('Aufruf: node scripts/note-agent-thinking-matrix-report.mjs <ergebnis-verzeichnis> [präfix]')
  const prefix = process.argv[3] ?? 'qwen3.8-27b-matrix'
  const arms = new Map()
  for (const arm of ARMS) {
    const file = path.join(dir, `${prefix}-${arm}-2026-08-25.json`)
    try {
      arms.set(arm, await loadArm(file))
    } catch {
      console.error(`(fehlt: ${path.basename(file)})`)
    }
  }
  if (arms.size < 2) throw new Error('Weniger als zwei Arme vorhanden — kein Vergleich möglich')

  // Nur Zellen, die in ALLEN vorhandenen Armen existieren.
  const keySets = [...arms.values()].map(a => new Set(a.byKey.keys()))
  const common = [...keySets[0]].filter(key => keySets.every(set => set.has(key))).sort()
  const dropped = [...new Set(keySets.flatMap(set => [...set]))].filter(key => !common.includes(key))
  if (dropped.length) console.error(`Nicht in allen Armen vorhanden, ausgelassen: ${dropped.join(', ')}`)

  console.log(`Gepaarte Zellen: ${common.length} (Fall × Wiederholung)\n`)
  console.log('Zelle'.padEnd(42) + ARMS.map(a => a.padEnd(18)).join(''))
  for (const key of common) {
    const cells = ARMS.map(arm => {
      const run = arms.get(arm)?.byKey.get(key)
      if (!run) return '—'.padEnd(18)
      return `${run.pass ? 'PASS' : 'FAIL'} ${String(Math.round(run.seconds)).padStart(4)}s`.padEnd(18)
    })
    console.log(key.padEnd(42) + cells.join(''))
  }

  console.log('\nArm-Bilanz (nur gepaarte Zellen)')
  const summary = new Map()
  for (const arm of ARMS) {
    const entry = arms.get(arm)
    if (!entry) continue
    const runs = common.map(key => entry.byKey.get(key))
    const passed = runs.filter(r => r.pass).length
    const seconds = runs.reduce((sum, r) => sum + r.seconds, 0)
    summary.set(arm, { passed, total: runs.length, seconds })
    console.log(`  ${arm.padEnd(10)} bestanden ${passed}/${runs.length} (${pct(passed / runs.length)}) · Gesamtzeit ${Math.round(seconds)}s · Ø ${(seconds / runs.length).toFixed(1)}s`)
  }

  const base = summary.get('discard')
  if (base) {
    console.log('\nGegen discard (Entscheidungsregel: mehr bestandene Fälle ODER bei gleicher Quote ≥ 20 % schneller)')
    for (const arm of ARMS.filter(a => a !== 'discard')) {
      const arm_ = summary.get(arm)
      if (!arm_) continue
      const fasterBy = (base.seconds - arm_.seconds) / base.seconds
      const verdict = arm_.passed > base.passed
        ? 'besser (mehr bestandene Fälle)'
        : arm_.passed < base.passed
          ? 'schlechter (weniger bestandene Fälle)'
          : fasterBy >= 0.2
            ? 'gleiche Quote, aber ≥ 20 % schneller'
            : 'kein ausreichender Vorteil'
      console.log(`  ${arm.padEnd(10)} Δ bestanden ${arm_.passed - base.passed} · Δ Zeit ${pct(fasterBy)} schneller · ${verdict}`)
    }
  }

  // Seed-Kontrolle: gleiche Wiederholung muss in allen Armen denselben Seed gesehen haben.
  const mismatched = common.filter(key => new Set(ARMS.map(a => arms.get(a)?.byKey.get(key)?.seed).filter(s => s !== undefined)).size > 1)
  if (mismatched.length) console.error(`\nWARNUNG: unterschiedliche Seeds in ${mismatched.join(', ')}`)
  else console.log('\nSeed-Kontrolle: alle gepaarten Zellen liefen mit identischem Seed.')
}

main().catch(error => {
  console.error(`Fehler: ${error.message}`)
  process.exit(1)
})
