#!/usr/bin/env node
// Generiert docs/model-quality.html + docs/model-quality.json aus der produktiven
// Modell-Kompatibilitäts-Matrix (app/src/shared/modelCompatibility.ts).
//
// Motivation: Die Webseite soll dieselbe Quelle der Wahrheit zeigen wie die
// Settings-UI — eine manuell gepflegte Seite driftet zwangsläufig vom Code weg.
// Aufruf:  node scripts/generate-model-quality.mjs   (aus dem Repo-Root)
// Danach:  docs/ committen — Push = Veröffentlichung (GitHub Pages).

import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE = join(ROOT, 'app/src/shared/modelCompatibility.ts')
const ESBUILD = join(ROOT, 'app/node_modules/.bin/esbuild')
const OUT_HTML = join(ROOT, 'docs/model-quality.html')
const OUT_JSON = join(ROOT, 'docs/model-quality.json')

// TS → ESM bündeln (Typ-Import @mindgraph/plugin-api fällt beim Build weg).
const tmp = mkdtempSync(join(tmpdir(), 'modelq-'))
const bundle = join(tmp, 'modelCompatibility.mjs')
execFileSync(ESBUILD, [SOURCE, '--bundle', '--format=esm', `--outfile=${bundle}`, '--platform=node'])
const { MODEL_COMPATIBILITY, MODULES, RECOMMENDED_DEFAULTS } = await import(pathToFileURL(bundle).href)
rmSync(tmp, { recursive: true, force: true })

const MODULE_LABELS = {
  'brain':              { name: 'Brain — Tagesresümee', desc: 'Fasst den Tag aus Notizen, Mails und Journal zusammen. Geprüft: Format, Wikilink-Qualität, Anti-Bewertungs-Regel, Weglassen leerer Sektionen, Halluzinationen.' },
  'task-extraction':    { name: 'E-Mail — Task- & Termin-Extraktion', desc: 'Extrahiert Aufgaben, Termine und Fristen aus E-Mails (Two-Pass mit deterministischem Datums-Resolver). Fehler landen unbemerkt im Vault — darum das strengste Modul.' },
  'mail-summary':       { name: 'E-Mail — Zusammenfassung & Relevanz', desc: 'Zusammenfassung, Sentiment, Relevanz-Score und Antwort-Bedarf pro Mail. Geprüft u. a.: Relevanz-Kalibrierung und Halluzinations-Anteil in der Zusammenfassung.' },
  'dashboard-snapshot': { name: 'Dashboard-Radar', desc: 'Bewertet die Dringlichkeit von Notizen im Tageskontext. Notiz-Inhalt ist nicht vertrauenswürdiger Input — Prompt-Injection-Resistenz ist hier Teil der Messung.' },
  'smart-connections':  { name: 'Smart Connections', desc: 'Semantische Verknüpfungen über Embedding-Modelle — andere Methodik, Benchmarks stehen noch aus.' },
  'note-agent':         { name: 'Notiz-Agent (Tool-Loop)', desc: 'Mehrstufige Aufträge mit Werkzeug-Aufrufen (suchen, lesen, schreiben). Gemessen wird der Tool-Loop: Syntax, Argument-Treue, Ergebnis-Verwertung, Terminierung.' },
  'project-status':     { name: 'Projekt-Status', desc: 'Wöchentliche Status-Entwürfe aus Brain-Tagen und Aufgaben. Geprüft mit Ehrlichkeits-Scorer: keine Erfindungen, ehrliches „kein Fortschritt"-Signal.' }
}

const VERDICT = {
  green:    { icon: '✅', label: 'geeignet',            cls: 'green' },
  yellow:   { icon: '⚠️', label: 'mit Einschränkungen', cls: 'yellow' },
  red:      { icon: '🔴', label: 'gesperrt',            cls: 'red' },
  untested: { icon: '❔', label: 'ungetestet',          cls: 'untested' }
}

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function metricChips(m = {}) {
  const chips = []
  if (m.recallPct != null) chips.push(`Score ${m.recallPct} %`)
  if (m.directionAccuracyPct != null) chips.push(`Richtung ${m.directionAccuracyPct} %`)
  if (m.criticalTitlesLinkedPct != null) chips.push(`Krit. Titel ${m.criticalTitlesLinkedPct} %`)
  if (m.rule5CompliancePct != null) chips.push(`Regel 5: ${m.rule5CompliancePct} %`)
  if (m.wikilinkHallucinations) chips.push(`Halluzinationen: ${m.wikilinkHallucinations === 'none' ? 'keine' : m.wikilinkHallucinations}`)
  if (m.latencySecondsPerRun != null) chips.push(`~${m.latencySecondsPerRun} s/Lauf`)
  if (m.ramGigabytes != null) chips.push(`~${m.ramGigabytes} GB RAM`)
  return chips
}

function moduleSection(mod) {
  const entries = Object.entries(MODEL_COMPATIBILITY.modules[mod.id] || {})
  const label = MODULE_LABELS[mod.id] || { name: mod.id, desc: '' }
  const order = { green: 0, yellow: 1, red: 2, untested: 3 }
  entries.sort((a, b) => order[a[1].verdict] - order[b[1].verdict])
  const recommended = RECOMMENDED_DEFAULTS[mod.id]

  const rows = entries.length === 0
    ? `<p class="empty">Für dieses Modul liegen noch keine Benchmark-Verdicts vor.</p>`
    : entries.map(([tag, v]) => {
        const vd = VERDICT[v.verdict] || VERDICT.untested
        const chips = metricChips(v.metrics).map(c => `<span class="chip">${esc(c)}</span>`).join('')
        const reasons = (v.reasons || []).map(r => `<li>${esc(r)}</li>`).join('')
        const details = (v.notes || reasons)
          ? `<details><summary>Details</summary>${reasons ? `<ul>${reasons}</ul>` : ''}${v.notes ? `<p>${esc(v.notes)}</p>` : ''}</details>`
          : ''
        return `<div class="model ${vd.cls}">
          <div class="model-head">
            <span class="verdict" title="${vd.label}">${vd.icon}</span>
            <code>${esc(tag)}</code>
            ${tag === recommended ? '<span class="badge">Empfehlung</span>' : ''}
            <span class="verdict-label">${vd.label}</span>
          </div>
          ${chips ? `<div class="chips">${chips}</div>` : ''}
          ${details}
        </div>`
      }).join('\n')

  return `<section class="module" id="${mod.id}">
    <h2>${esc(label.name)} ${mod.damageRelevant ? '<span class="damage" title="Bei rotem Verdict wird das Modul für dieses Modell in der App gesperrt (Hard-Lock).">schadensrelevant</span>' : ''}</h2>
    <p class="module-desc">${esc(label.desc)}</p>
    ${rows}
  </section>`
}

const generatedAt = MODEL_COMPATIBILITY.version
const sections = MODULES.map(moduleSection).join('\n')

const html = `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Modell-Kompatibilität &amp; Qualitätssicherung | MindGraph Notes</title>
<meta name="description" content="Welche lokalen KI-Modelle MindGraph Notes pro Modul empfiehlt, einschränkt oder sperrt — mit Messwerten, Methodik und Grenzen. Generiert aus der produktiven Kompatibilitäts-Matrix, Datenstand ${esc(generatedAt)}.">
<link rel="icon" href="favicon-32x32.png">
<style>
  :root { --accent:#0f766e; --accent-light:#f0fdfa; --text:#1f2937; --text-mid:#4b5563; --text-muted:#9ca3af; --border:#e5e7eb; --card:#fff; --bg:#fafaf9; --radius:14px; }
  @media (prefers-color-scheme: dark) { :root { --accent:#2dd4bf; --accent-light:#134e4a33; --text:#f3f4f6; --text-mid:#d1d5db; --text-muted:#6b7280; --border:#374151; --card:#111827; --bg:#0b1020; } }
  * { box-sizing:border-box; margin:0; }
  body { font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; background:var(--bg); color:var(--text); line-height:1.6; }
  main { max-width:900px; margin:0 auto; padding:3rem 1.5rem 5rem; }
  a { color:var(--accent); }
  .top { font-size:.85rem; margin-bottom:2.2rem; } .top a { text-decoration:none; }
  h1 { font-size:2rem; line-height:1.2; margin-bottom:.6rem; }
  .lead { color:var(--text-mid); max-width:44rem; }
  .stamp { display:inline-block; margin:1.1rem 0 0; padding:.3rem .8rem; font-size:.8rem; background:var(--accent-light); border:1px solid var(--border); border-radius:100px; color:var(--text-mid); }
  .box { margin:2.4rem 0; padding:1.4rem 1.6rem; background:var(--card); border:1px solid var(--border); border-radius:var(--radius); }
  .box h2 { font-size:1.05rem; margin-bottom:.6rem; }
  .box p, .box li { font-size:.92rem; color:var(--text-mid); }
  .box ul { padding-left:1.2rem; }
  .legend { display:flex; flex-wrap:wrap; gap:1rem 1.6rem; font-size:.88rem; color:var(--text-mid); margin:1.6rem 0 0; }
  section.module { margin-top:3rem; }
  section.module h2 { font-size:1.25rem; margin-bottom:.3rem; }
  .damage { vertical-align:middle; margin-left:.5rem; padding:.15rem .55rem; font-size:.66rem; font-weight:650; letter-spacing:.05em; text-transform:uppercase; color:#b91c1c; background:#fee2e2; border-radius:100px; }
  @media (prefers-color-scheme: dark) { .damage { color:#fecaca; background:#7f1d1d55; } }
  .module-desc { font-size:.9rem; color:var(--text-mid); max-width:44rem; margin-bottom:1.1rem; }
  .model { margin:.6rem 0; padding: .9rem 1.1rem; background:var(--card); border:1px solid var(--border); border-left-width:4px; border-radius:10px; }
  .model.green { border-left-color:#16a34a; } .model.yellow { border-left-color:#d97706; } .model.red { border-left-color:#dc2626; } .model.untested { border-left-color:var(--text-muted); }
  .model-head { display:flex; align-items:center; gap:.6rem; flex-wrap:wrap; }
  .model-head code { font-size:.92rem; font-weight:600; }
  .verdict-label { font-size:.8rem; color:var(--text-muted); }
  .badge { padding:.12rem .55rem; font-size:.68rem; font-weight:650; color:#fff; background:var(--accent); border-radius:100px; }
  .chips { display:flex; flex-wrap:wrap; gap:.4rem; margin-top:.55rem; }
  .chip { padding:.12rem .6rem; font-size:.75rem; background:var(--accent-light); border:1px solid var(--border); border-radius:100px; color:var(--text-mid); }
  details { margin-top:.6rem; font-size:.86rem; color:var(--text-mid); }
  details summary { cursor:pointer; color:var(--accent); font-weight:550; }
  details ul { margin:.5rem 0; padding-left:1.2rem; } details p { margin-top:.4rem; }
  .empty { font-size:.9rem; color:var(--text-muted); }
  footer { margin-top:4rem; padding-top:1.4rem; border-top:1px solid var(--border); font-size:.8rem; color:var(--text-muted); }
</style>
</head>
<body>
<main>
  <nav class="top"><a href="index.html">← MindGraph Notes</a></nav>
  <h1>Modell-Kompatibilität, transparent.</h1>
  <p class="lead">MindGraph Notes läuft mit lokalen KI-Modellen — und nicht jedes Modell ist für jede Aufgabe gut genug. Diese Seite zeigt ungeschönt, welche Modelle wir pro Modul empfehlen, mit Einschränkungen zulassen oder sperren. Sie wird direkt aus derselben Kompatibilitäts-Matrix generiert, die auch in der App die Empfehlungen und Sperren steuert — was du hier liest, ist exakt das, was die Software tut.</p>
  <span class="stamp">Datenstand: ${esc(generatedAt)} · automatisch generiert aus der produktiven Matrix</span>

  <div class="box">
    <h2>Methodik</h2>
    <p>Jedes Modul wird mit einem eigenen Test-Harness gegen realistische, aber synthetische deutsche Eingaben gemessen (E-Mails, Tagesnotizen, Projektwochen). Die Bewertung ist deterministisch — JSON-Validität, Datums-Treffer, Wikilink-Abdeckung, Score-Bänder, Prompt-Injection-Verhalten — nicht „gefühlt". Der komplette Harness inklusive aller Testfälle und Roh-Ergebnisse ist offen: <a href="https://github.com/bydb/brain-model-benchmark" rel="noopener">brain-model-benchmark auf GitHub</a>.</p>
    <div class="legend">
      <span>✅ geeignet — produktiv empfohlen</span>
      <span>⚠️ mit Einschränkungen — nicht für schadensrelevante Pfade</span>
      <span>🔴 gesperrt — Hard-Lock in der App</span>
      <span>❔ ungetestet — Hinweis, keine Sperre</span>
    </div>
  </div>

  <div class="box">
    <h2>Grenzen dieser Messung — bitte zuerst lesen</h2>
    <ul>
      <li>Ein Benchmark <strong>beweist nicht, dass ein Modell „gut" ist</strong> — nur, dass es im definierten Testset einen bestimmten Score erreicht. Reale Eingaben sind variabler.</li>
      <li>Die Testfälle sind synthetisch (an realen Mustern orientiert), einige Läufe sind Einzelmessungen; die Halluzinations-Quote ist eine grobe Wortlisten-Metrik.</li>
      <li>Verdicts gelten für die gemessenen Modell-Versionen und Prompts. Bei Prompt-Änderungen messen wir nach — und dokumentieren beides im Changelog der Matrix.</li>
      <li>Sicherheits-Sperren lösen wir bewusst konservativ: Ein Modell, das einmal auf Prompt-Injection hereinfiel, bleibt gesperrt, auch wenn es mit verbessertem Prompt einen sauberen Lauf zeigt — eine einzelne Messung hebt keinen Schutz auf.</li>
    </ul>
  </div>

  ${sections}

  <footer>
    <p>Quelle: <code>modelCompatibility.ts</code> (produktive Matrix der App, AGPL-3.0) · Test-Harness &amp; Roh-Daten: <a href="https://github.com/bydb/brain-model-benchmark" rel="noopener">github.com/bydb/brain-model-benchmark</a> · Diese Seite wird per Skript generiert (<code>scripts/generate-model-quality.mjs</code>) und ändert sich nur, wenn sich die Matrix ändert. Verantwortlich: Jochen Leeder, CEO bydb.</p>
  </footer>
</main>
</body>
</html>
`

writeFileSync(OUT_HTML, html)
writeFileSync(OUT_JSON, JSON.stringify({ generatedFrom: 'app/src/shared/modelCompatibility.ts', version: MODEL_COMPATIBILITY.version, modules: MODEL_COMPATIBILITY.modules, recommendedDefaults: RECOMMENDED_DEFAULTS }, null, 2))
console.log(`OK: docs/model-quality.html + docs/model-quality.json (Datenstand ${generatedAt})`)
