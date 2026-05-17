#!/usr/bin/env node
// Stresstest gegen den MindGraph-Coach-Bot.
//
// Lädt die KB exakt wie der Bot zur Laufzeit, baut denselben System-Prompt,
// schickt eine Testreihe an Ollama und bewertet die Antworten gegen
// Erwartungs- und Trap-Listen.
//
// Aufruf:
//   node scripts/coach-bot-stresstest.mjs [modell]
//   z.B. node scripts/coach-bot-stresstest.mjs qwen3.6:latest

import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const KB_ROOT = path.resolve(__dirname, '..', 'resources', 'coach-kb')
const OLLAMA_URL = 'http://localhost:11434'
const MODEL = process.argv[2] || 'qwen3.6:latest'

// ─── KB-Loader (identisch zu coachKbRetriever.ts) ────────────────────

const STOPWORDS = new Set([
  'der','die','das','den','dem','des','ein','eine','einen','einem','einer',
  'und','oder','aber','nicht','kein','keine','mit','für','von','zu','zur','zum',
  'auf','an','in','im','aus','ist','sind','war','waren','wie','was','wer',
  'ich','du','er','sie','es','wir','ihr','mein','dein','sein','ihren',
  'will','möchte','brauche','soll','kann','könnte','machen',
  'the','a','an','and','or','not','with','for','of','to','in','on',
  'is','are','was','were','how','what','who','i','you','we','they',
  'want','need','can','could','do','does','make','have','has'
])

function tokenize(text) {
  return text.toLowerCase()
    .split(/[\s,.;:!?()\[\]{}"'`/\\—–-]+/u)
    .map(t => t.trim())
    .filter(t => t.length >= 2 && !STOPWORDS.has(t))
}

function parseFrontmatter(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/)
  if (!m) return { fm: {}, body: raw }
  const fm = {}
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([a-zA-Z]+):\s*(.+)$/)
    if (!kv) continue
    const [, k, v] = kv
    if (k === 'keywords' || k === 'suggestsModules' || k === 'suggestsWidgets') {
      const list = v.match(/^\[(.*)\]$/)
      if (list) fm[k] = list[1].split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean)
    } else {
      fm[k] = v.replace(/^["']|["']$/g, '')
    }
  }
  return { fm, body: m[2] }
}

async function loadKb() {
  const docs = []
  async function walk(dir, relBase = '') {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    for (const e of entries) {
      const childRel = relBase ? `${relBase}/${e.name}` : e.name
      const childAbs = path.join(dir, e.name)
      if (e.isDirectory()) {
        await walk(childAbs, childRel)
      } else if (e.isFile() && e.name.endsWith('.md')) {
        const raw = await fs.readFile(childAbs, 'utf-8')
        const { fm, body } = parseFrontmatter(raw)
        const h1 = body.match(/^#\s+(.+)$/m)
        const headings = [...body.matchAll(/^##\s+(.+)$/gm)].map(m => m[1].trim())
        docs.push({
          id: fm.id || path.basename(e.name, '.md'),
          relPath: childRel,
          title: h1 ? h1[1].trim() : path.basename(e.name, '.md'),
          frontmatter: fm,
          body: body.trim(),
          headings
        })
      }
    }
  }
  await walk(KB_ROOT)
  return docs
}

function scoreDoc(doc, queryTokens) {
  if (!queryTokens.length) return 0
  const kw = new Set((doc.frontmatter.keywords || []).map(k => k.toLowerCase()))
  const titleTok = new Set(tokenize(doc.title))
  const headTok = new Set(doc.headings.flatMap(h => tokenize(h)))
  let score = 0
  for (const t of queryTokens) {
    if (kw.has(t)) score += 3
    if (titleTok.has(t)) score += 2
    if (headTok.has(t)) score += 1
  }
  return score
}

function retrieve(docs, query, topK = 4) {
  const tokens = tokenize(query)
  return docs.map(d => ({ doc: d, score: scoreDoc(d, tokens) }))
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
}

function snippet(doc, maxChars = 900) {
  const hints = []
  if (doc.frontmatter.suggestsModules?.length) hints.push(`Module: ${doc.frontmatter.suggestsModules.join(', ')}`)
  if (doc.frontmatter.suggestsProfile) hints.push(`Profil: ${doc.frontmatter.suggestsProfile}`)
  let body = doc.body
  if (body.length > maxChars) {
    const cut = body.lastIndexOf(' ', maxChars)
    body = body.slice(0, cut > 0 ? cut : maxChars) + '…'
  }
  return `[${doc.relPath}] ${doc.title}\n${hints.length ? `(${hints.join(' · ')})\n` : ''}${body}`
}

// ─── System-Prompt (gekürzte Variante von coachPrompt.ts) ────────────

function buildPrompt(kbDocs) {
  const intro = `Du bist der MindGraph-Coach-Bot — ein kleiner Helfer im Header der App. Beantworte Fragen zu MindGraph Notes klar und kurz, basierend AUSSCHLIESSLICH auf der Wissensbasis unten. Wenn du etwas nicht sicher weißt, sag es offen und schlage vor, wo man nachschauen könnte (Settings-Tab, Help-Guide, README.md). Mach keine Setup-Vorschläge. Du bist nur ein Auskunfts-Bot.

ANTI-HALLUZINATION (kritisch): Erfinde KEINE Features, Modi, Menüpunkte, Tastenkürzel oder UI-Elemente, die in der Wissensbasis nicht stehen. Markdown-Editoren in anderen Apps haben oft "Vorschau" oder "Split-View" — das hier ist MindGraph, nicht VS Code, nicht Obsidian, nicht Typora. Übernimm exakt die Bezeichnungen aus der Wissensbasis. Im Zweifel lieber zugeben "das weiß ich nicht sicher" als raten.`

  const kbBlock = kbDocs.length > 0
    ? `WISSENSBASIS:\n\n${kbDocs.map(d => snippet(d.doc ?? d)).join('\n\n---\n\n')}`
    : 'WISSENSBASIS: (keine passenden Einträge gefunden — sei ehrlich, dass du es nicht weißt)'

  const rules = `Antwortregeln:
1. Normale Frage: 2–6 Sätze Markdown. Bei strukturierten Antworten gerne Bullet-Liste.
2. Bei "Kurs", "Tutorial", "Schritt für Schritt", "Zeig mir wie" UND passender KB: längere Antwort mit Lektionen, Beispielen, Code-Blöcken (15-40 Zeilen).
3. Keine coach-actions-Fences, keine JSON-Aktionen, keine Setup-Aufforderungen.
4. Bei KB-Zitat hänge eine Quellenzeile an, z.B. "_Quelle: app/notiz-kategorien.md_".
5. Wenn Frage außerhalb des Wissens: in einem Satz zugeben + Anlaufpunkt vorschlagen.
6. Keine Marketing-Sprache, keine generischen Floskeln.`

  return [intro, '', kbBlock, '', rules].join('\n')
}

// ─── Ollama-Call ─────────────────────────────────────────────────────

async function askOllama(systemPrompt, userQuestion) {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userQuestion }
      ],
      stream: false,
      options: { temperature: 0.2 }
    })
  })
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`)
  const json = await res.json()
  return json.message?.content ?? ''
}

// ─── Test-Cases ──────────────────────────────────────────────────────

const TESTS = [
  {
    id: '01-kategorien',
    cat: 'Wissen (drin)',
    q: 'Wofür sind die roten, grünen und blauen Punkte in Notizen?',
    mustIncludeAll: [/rot|🔴/i, /grün|🟢/i, /blau|🔵/i],
    mustIncludeAny: [/problem/i, /lösung|wissen|guide/i, /info|reader/i],
    forbidden: []
  },
  {
    id: '02-editor-modi',
    cat: 'Anti-Halluzination',
    q: 'Was sind die drei Editor-Modi in MindGraph?',
    mustIncludeAll: [/markdown/i, /schreiben|live-preview/i, /lesen|preview/i],
    forbidden: [/split-?view/i, /split-?modus/i, /zwei panels/i, /vorschau-modus/i, /split-?ansicht/i]
  },
  {
    id: '03-sokratisch',
    cat: 'Wissen (drin)',
    q: 'Was macht der sokratische Modus im Notes-Chat?',
    mustIncludeAny: [/rückfrage/i, /frage[n]? stell/i, /nachdenken/i],
    forbidden: [/direkte antwort gibt/i]
  },
  {
    id: '04-daily-note',
    cat: 'Wissen (drin)',
    q: 'Wie aktiviere ich die tägliche Notiz?',
    mustIncludeAny: [/einstellung|settings/i, /tägliche notiz|daily/i],
    forbidden: []
  },
  {
    id: '05-brain-backend',
    cat: 'Privacy-Constraint',
    q: 'Welches KI-Backend nutzt das Brain für die Tageskonsolidierung?',
    mustIncludeAll: [/ollama/i, /lokal/i],
    forbidden: [/anthropic.*brain|brain.*anthropic/i, /openai.*brain|brain.*openai/i, /cloud-fallback/i]
  },
  {
    id: '06-dataview-klauseln',
    cat: 'Wissen (drin)',
    q: 'Welche Klauseln kann ich in einer Dataview-Query verwenden?',
    mustIncludeAll: [/from/i, /where/i],
    mustIncludeAny: [/sort|limit|table|list/i],
    forbidden: []
  },
  {
    id: '07-split-trap',
    cat: 'Halluzinations-Trap',
    q: 'Hat MindGraph einen Split-View als Editor-Modus, wo links der Quelltext und rechts die Vorschau steht?',
    mustIncludeAny: [/nein|kein|gibt es nicht|existiert nicht|nicht als editor-modus/i],
    forbidden: [/ja, mindgraph hat einen split/i, /split-view editor-modus.*ist/i]
  },
  {
    id: '08-fake-feature',
    cat: 'Nicht in KB',
    q: 'Wie nutze ich den Buchhalter-Modus von MindGraph für meine Steuererklärung?',
    mustIncludeAny: [/nicht|weiß|unbekannt|keine|kenne/i],
    forbidden: [/buchhalter-modus aktivierst|so nutzt du den buchhalter/i]
  },
  {
    id: '09-source-cite',
    cat: 'Format',
    q: 'Was bedeutet eine 🔴 Notiz?',
    mustIncludeAny: [/quelle/i],
    forbidden: []
  },
  {
    id: '10-terminal-was',
    cat: 'Wissen (drin)',
    q: 'Was kann ich im Terminal in MindGraph machen?',
    mustIncludeAny: [/opencode|claude.?code|claude/i, /vault/i],
    forbidden: [/touch \[datei\]|rm \[datei\]/i] // generische zsh-Basics → schlechte Antwort
  },
  {
    id: '11-dataview-kurs',
    cat: 'Kurs-Modus',
    q: 'Mach mir einen kleinen Schritt-für-Schritt-Kurs zu Dataview.',
    mustIncludeAll: [/list/i, /from/i, /where/i],
    mustIncludeAny: [/lektion|schritt|beispiel/i],
    minLines: 12,
    forbidden: []
  },
  {
    id: '12-greeting',
    cat: 'Edge',
    q: 'Hi',
    mustIncludeAny: [/.+/], // alles passt — wir wollen nur sehen, dass eine sinnvolle Antwort kommt
    forbidden: [/loading|error|exception/i]
  }
]

// ─── Bewertung ───────────────────────────────────────────────────────

function evaluate(test, answer) {
  const fails = []
  if (test.mustIncludeAll) {
    for (const re of test.mustIncludeAll) {
      if (!re.test(answer)) fails.push(`missing-all: ${re}`)
    }
  }
  if (test.mustIncludeAny) {
    const ok = test.mustIncludeAny.some(re => re.test(answer))
    if (!ok) fails.push(`missing-any: ${test.mustIncludeAny.map(r => r.source).join(' | ')}`)
  }
  if (test.forbidden) {
    for (const re of test.forbidden) {
      if (re.test(answer)) fails.push(`forbidden: ${re}`)
    }
  }
  if (test.minLines) {
    const lines = answer.split('\n').filter(l => l.trim()).length
    if (lines < test.minLines) fails.push(`too-short: ${lines} < ${test.minLines}`)
  }
  return { pass: fails.length === 0, fails }
}

// ─── Runner ──────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🤖 MindGraph Coach-Bot Stresstest`)
  console.log(`   Modell:    ${MODEL}`)
  console.log(`   KB-Pfad:   ${KB_ROOT}\n`)

  const docs = await loadKb()
  console.log(`   KB-Docs:   ${docs.length} geladen`)
  console.log(`   Tests:     ${TESTS.length}\n`)
  console.log('─'.repeat(80))

  const results = []
  for (const test of TESTS) {
    const hits = retrieve(docs, test.q, 4)
    const sys = buildPrompt(hits)
    const topHit = hits[0]?.doc.relPath || '(keine KB-Treffer)'
    let answer = '', err = null
    const t0 = Date.now()
    try {
      answer = await askOllama(sys, test.q)
    } catch (e) {
      err = e.message
    }
    const ms = Date.now() - t0
    const evalRes = err ? { pass: false, fails: [`ollama-error: ${err}`] } : evaluate(test, answer)
    const icon = evalRes.pass ? '✅' : '❌'

    console.log(`\n${icon} [${test.id}] ${test.cat}`)
    console.log(`   Frage:   ${test.q}`)
    console.log(`   Top-KB:  ${topHit}`)
    console.log(`   Latenz:  ${ms} ms`)
    if (err) {
      console.log(`   FEHLER:  ${err}`)
    } else {
      const preview = answer.replace(/\n/g, ' ⏎ ').slice(0, 240)
      console.log(`   Antwort: ${preview}${answer.length > 240 ? '…' : ''}`)
    }
    if (!evalRes.pass) {
      for (const f of evalRes.fails) console.log(`   ⚠️  ${f}`)
    }
    results.push({ ...test, pass: evalRes.pass, fails: evalRes.fails, answer, ms, topHit })
  }

  console.log('\n' + '═'.repeat(80))
  const passed = results.filter(r => r.pass).length
  const failed = results.length - passed
  console.log(`\n  Ergebnis:  ${passed}/${results.length} passed  (${failed} failed)`)
  const avg = (results.reduce((a, r) => a + r.ms, 0) / results.length).toFixed(0)
  console.log(`  Latenz Ø:  ${avg} ms\n`)

  if (failed > 0) {
    console.log('  Fehlgeschlagen:')
    for (const r of results.filter(x => !x.pass)) {
      console.log(`    - [${r.id}] ${r.cat}: ${r.fails.join('; ')}`)
    }
    console.log()
  }

  process.exit(failed > 0 ? 1 : 0)
}

main().catch(err => {
  console.error('FATAL:', err)
  process.exit(2)
})
