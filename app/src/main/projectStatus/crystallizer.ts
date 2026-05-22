/**
 * Projekt-Status-Crystallizer — Engine.
 *
 * Pattern-Match auf `main/brain/dailyConsolidation.ts`:
 *   - Hardcoded Ollama-Localhost (Privacy-Constraint)
 *   - Bilingualer Prompt (DE/EN)
 *   - `findFreshPath`-Konvention: nie überschreiben, statt dessen "(2)", "(3)" ...
 *   - `safePath`-Helper für Schreib-Pfade (vom IPC-Handler injiziert)
 *
 * Ablauf:
 *   1. Marker aus `_STATUS.md` lesen → keywords
 *   2. Brain-Tage filtern (letzte 7 Tage, ohne Frontmatter)
 *   3. Inbox-Notes filtern (letzte 30 Tage)
 *   4. Projekt-Dateien sammeln (alle `.md` außer `_STATUS*`)
 *   5. Prompt bauen
 *   6. Ollama-API aufrufen
 *   7. Output bereinigen (Code-Fences raus, nested `[[X[[Y]]]` reparieren)
 *   8. Vault-Index aufbauen + Lint laufen lassen → Findings-Section anhängen
 *   9. `_STATUS-<Woche>.md` schreiben (nie überschreiben)
 */

import * as path from 'path'
import * as fs from 'fs/promises'
import type {
  ProjectStatusCrystallizeInput,
  ProjectStatusResult,
  ProjectStatusBrainEntry,
  ProjectStatusSourceFile,
  ProjectStatusMarker
} from './types'
import { parseStatusMarker, stripFrontmatter, getISOWeekTag } from './discovery'
import { buildVaultIndex, lintContent, appendFindingsSection } from './wikilinkLint'
import { parseExcel, sheetToMarkdownTable } from '../office/officeService'

const OLLAMA_LOCAL_URL = 'http://localhost:11434'
const DEFAULT_BRAIN_FOLDER = '800 - 🧠 brain'
const DEFAULT_INBOX_FOLDER = '000 - 📥 inbox/010 - 📥 Notes'
const DEFAULT_EMAIL_FOLDER = '‼️📧 - emails'
const BRAIN_LOOKBACK_DAYS = 7
const INBOX_LOOKBACK_DAYS = 30
const EMAIL_LOOKBACK_DAYS = 30
const LARGE_FILE_THRESHOLD = 20000
const LARGE_FILE_LINE_CAP = 80

/**
 * Extrahiert aus einem Text NUR Sätze, die mindestens ein Keyword enthalten
 * (plus optional einen Satz davor/danach für Kontext). Nicht-relevante
 * Abschnitte werden durch `[…]` ersetzt.
 *
 * Sentence-Level statt Paragraph-Level: in einem Brain-Tag-Absatz steht oft
 * im selben Absatz „AIS.chat …" und „Fachforum Kassel" gemischt — ein
 * Paragraph-Filter ließe alles durch. Sentence-Filter ist invasiver, aber
 * der einzige zuverlässige Weg, das LLM vor Off-Topic-Kontext zu bewahren.
 *
 * Deterministisch — wir vertrauen nicht mehr nur Prompt-Anweisungen wie
 * „ignoriere das andere", weil die LLMs das ignorieren.
 */
function extractRelevantSnippets(
  text: string,
  keywords: string[],
  contextSentences: number = 0
): string {
  const lowerKw = keywords.map(k => k.toLowerCase()).filter(k => k.length > 0)
  if (lowerKw.length === 0) return text

  // Sentence-Split: Punkt/!/?/Newline-Grenze.
  // Verwende positive Lookbehind für Satzende-Punkte UND Zeilenwechsel als
  // weiteres Split-Kriterium (Listenpunkte, Bullets sind oft 1 Zeile = 1 Satz).
  const sentences: string[] = []
  // Erst: jede nicht-leere Zeile betrachten — Markdown-Listen sind oft pro Bullet 1 Aussage.
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    // Wenn die Zeile mehrere Sätze enthält, splitten.
    const parts = trimmed.split(/(?<=[.!?])\s+(?=[A-ZÄÖÜ\[])/)
    for (const p of parts) {
      if (p.trim()) sentences.push(p.trim())
    }
  }

  const hasKeyword = (s: string): boolean => {
    const sl = s.toLowerCase()
    return lowerKw.some(k => sl.includes(k))
  }

  const keepIdx = new Set<number>()
  for (let i = 0; i < sentences.length; i++) {
    if (hasKeyword(sentences[i])) {
      keepIdx.add(i)
      for (let j = 1; j <= contextSentences; j++) {
        if (i - j >= 0) keepIdx.add(i - j)
        if (i + j < sentences.length) keepIdx.add(i + j)
      }
    }
  }
  if (keepIdx.size === 0) return ''

  const sortedIdx = Array.from(keepIdx).sort((a, b) => a - b)
  const out: string[] = []
  let prev = -2
  for (const i of sortedIdx) {
    if (prev !== -2 && i > prev + 1) out.push('[…]')
    out.push(sentences[i])
    prev = i
  }
  return out.join('\n')
}

// ────────────────────────────────────────────────────────────────────────────
// Brain-Tage einsammeln (vorgefiltert)
// ────────────────────────────────────────────────────────────────────────────

const BRAIN_FILE_RE = /^(\d{2})\.md$/

async function gatherBrainEntries(
  vaultPath: string,
  brainFolderRel: string,
  keywords: string[]
): Promise<ProjectStatusBrainEntry[]> {
  const brainAbs = path.join(vaultPath, brainFolderRel)
  const today = new Date()
  const cutoff = new Date(today)
  cutoff.setDate(cutoff.getDate() - BRAIN_LOOKBACK_DAYS)

  const lowerKeywords = keywords.map(k => k.toLowerCase()).filter(k => k.length > 0)
  if (lowerKeywords.length === 0) return []

  const entries: ProjectStatusBrainEntry[] = []

  let years: string[]
  try {
    years = (await fs.readdir(brainAbs)).filter(y => /^\d{4}$/.test(y))
  } catch {
    return []
  }

  for (const year of years) {
    const yearPath = path.join(brainAbs, year)
    let months: string[]
    try {
      months = (await fs.readdir(yearPath)).filter(m => /^\d{2}$/.test(m))
    } catch { continue }

    for (const month of months) {
      const monthPath = path.join(yearPath, month)
      let files: string[]
      try {
        files = await fs.readdir(monthPath)
      } catch { continue }

      for (const file of files) {
        const dm = file.match(BRAIN_FILE_RE)
        if (!dm) continue
        const dateStr = `${year}-${month}-${dm[1]}`
        const fileDate = new Date(`${dateStr}T00:00:00Z`)
        if (isNaN(fileDate.getTime())) continue
        if (fileDate < cutoff || fileDate > today) continue

        let raw: string
        try {
          raw = await fs.readFile(path.join(monthPath, file), 'utf-8')
        } catch { continue }

        const body = stripFrontmatter(raw)
        const lowerBody = body.toLowerCase()
        const evidence = lowerKeywords.filter(k => lowerBody.includes(k))
        if (evidence.length > 0) {
          // Originale Keywords zurückgeben (nicht die lowercase-Varianten)
          const originalEvidence = keywords.filter(k =>
            evidence.includes(k.toLowerCase())
          )
          // Paragraph-Vorfilter: nur Absätze rund um Keyword-Treffer.
          // Vermeidet, dass das LLM den dominanten OFF-Topic-Inhalt eines
          // Brain-Tags zur Status-Notiz „dieses Projekts" verarbeitet.
          const filteredBody = extractRelevantSnippets(body, keywords, 1)
          if (filteredBody.trim().length > 0) {
            entries.push({ date: dateStr, body: filteredBody, evidence: originalEvidence })
          }
        }
      }
    }
  }

  entries.sort((a, b) => a.date.localeCompare(b.date))
  return entries
}

// ────────────────────────────────────────────────────────────────────────────
// Inbox-Notes einsammeln
// ────────────────────────────────────────────────────────────────────────────

async function gatherInboxNotes(
  vaultPath: string,
  inboxFolderRel: string,
  keywords: string[]
): Promise<ProjectStatusSourceFile[]> {
  const inboxAbs = path.join(vaultPath, inboxFolderRel)
  let files: string[]
  try {
    files = await fs.readdir(inboxAbs)
  } catch {
    return []
  }

  const cutoffMs = Date.now() - INBOX_LOOKBACK_DAYS * 86400000
  const lowerKeywords = keywords.map(k => k.toLowerCase()).filter(k => k.length > 0)
  if (lowerKeywords.length === 0) return []

  const result: ProjectStatusSourceFile[] = []
  for (const file of files) {
    if (!file.endsWith('.md')) continue
    const full = path.join(inboxAbs, file)
    let stat: import('fs').Stats
    try {
      stat = await fs.stat(full)
    } catch { continue }
    if (stat.mtimeMs < cutoffMs) continue

    let raw: string
    try {
      raw = await fs.readFile(full, 'utf-8')
    } catch { continue }

    const body = stripFrontmatter(raw)
    const lower = body.toLowerCase()
    if (!lowerKeywords.some(k => lower.includes(k))) continue

    // Paragraph-Vorfilter — nur Absätze, die Keyword-Treffer haben.
    // Infomailings sind typisch sehr lang und multi-thematisch; ohne Filter
    // bringt eine einzelne Erwähnung des Projekt-Keywords den gesamten
    // Mailing-Inhalt ins LLM-Prompt.
    const filtered = extractRelevantSnippets(body, keywords, 1)
    if (filtered.trim().length === 0) continue

    result.push({
      name: file.slice(0, -3).normalize('NFC'),
      pathRel: path.join(inboxFolderRel, file),
      content: truncateContent(filtered),
      origin: 'inbox'
    })
  }

  return result
}

// ────────────────────────────────────────────────────────────────────────────
// Email-Notizen einsammeln (analog Inbox; eigener Ordner, da Mails den Großteil
// projektrelevanter Aktivität tragen — Stakeholder, offene Fäden, Termine).
// ────────────────────────────────────────────────────────────────────────────

async function gatherEmailNotes(
  vaultPath: string,
  emailFolderRel: string,
  keywords: string[]
): Promise<ProjectStatusSourceFile[]> {
  const emailAbs = path.join(vaultPath, emailFolderRel)
  let files: string[]
  try {
    files = await fs.readdir(emailAbs)
  } catch {
    return []
  }

  const cutoffMs = Date.now() - EMAIL_LOOKBACK_DAYS * 86400000
  const lowerKeywords = keywords.map(k => k.toLowerCase()).filter(k => k.length > 0)
  if (lowerKeywords.length === 0) return []

  const result: ProjectStatusSourceFile[] = []
  for (const file of files) {
    if (!file.endsWith('.md')) continue
    const full = path.join(emailAbs, file)
    let stat: import('fs').Stats
    try {
      stat = await fs.stat(full)
    } catch { continue }
    if (stat.mtimeMs < cutoffMs) continue

    let raw: string
    try {
      raw = await fs.readFile(full, 'utf-8')
    } catch { continue }

    const body = stripFrontmatter(raw)
    const lower = body.toLowerCase()
    if (!lowerKeywords.some(k => lower.includes(k))) continue

    // Email-Notizen sind kompakt (Zusammenfassung + Aufgaben + Kategorien);
    // Sentence-Snippet-Filter analog Inbox, contextSentences=1 für 1 Satz vorher/nachher.
    const filtered = extractRelevantSnippets(body, keywords, 1)
    if (filtered.trim().length === 0) continue

    result.push({
      name: file.slice(0, -3).normalize('NFC'),
      pathRel: path.join(emailFolderRel, file),
      content: truncateContent(filtered),
      origin: 'email'
    })
  }

  return result
}

// ────────────────────────────────────────────────────────────────────────────
// Projekt-Dateien einsammeln (alle `.md` außer `_STATUS*`)
// ────────────────────────────────────────────────────────────────────────────

async function gatherProjectFiles(
  projectAbs: string,
  projectFolderRel: string
): Promise<ProjectStatusSourceFile[]> {
  let entries: string[]
  try {
    entries = await fs.readdir(projectAbs)
  } catch {
    return []
  }
  const result: ProjectStatusSourceFile[] = []
  for (const file of entries) {
    // Excel-Lock-Files (~$Foo.xlsx) und versteckte Files überspringen
    if (file.startsWith('~$') || file.startsWith('.')) continue

    const lower = file.toLowerCase()
    const full = path.join(projectAbs, file)

    if (lower.endsWith('.md')) {
      if (file === '_STATUS.md') continue
      if (file.startsWith('_STATUS-')) continue
      let raw: string
      try {
        raw = await fs.readFile(full, 'utf-8')
      } catch { continue }
      result.push({
        name: file.slice(0, -3).normalize('NFC'),
        pathRel: path.join(projectFolderRel, file),
        content: truncateContent(raw),
        origin: 'project'
      })
    } else if (lower.endsWith('.xlsx')) {
      // Excel-Tabellen lesen — typischer Use-Case: Rebranding-Checklisten,
      // Statustabellen, Teilnehmerlisten. Pro Sheet eine Markdown-Tabelle.
      try {
        const excel = await parseExcel(full)
        const blocks: string[] = []
        for (const sheet of excel.sheets) {
          if (!sheet.rows || sheet.rows.length === 0) continue
          const md = sheetToMarkdownTable(sheet)
          if (md.trim()) {
            blocks.push(`#### Sheet: ${sheet.name}\n\n${md}`)
          }
        }
        if (blocks.length === 0) continue
        const combined = blocks.join('\n\n')
        result.push({
          name: file.slice(0, file.length - 5).normalize('NFC'),
          pathRel: path.join(projectFolderRel, file),
          content: truncateContent(`(Excel-Tabelle, ${excel.sheets.length} Blatt/Blätter)\n\n${combined}`),
          origin: 'project'
        })
      } catch {
        // XLSX-Parser-Fehler still ignorieren — kein Abbruch des ganzen Laufs
        continue
      }
    }
    // PDF/DOCX/PPTX/Bilder: für jetzt überspringen.
    // PDFs sind eine separate Diskussion (Vision-OCR oder Docling — beides
    // hat Setup-Kosten; lohnt sich erst, wenn Excel-Pfad sich bewährt hat).
  }
  return result
}

function truncateContent(raw: string): string {
  if (raw.length <= LARGE_FILE_THRESHOLD) return raw
  const lines = raw.split('\n').slice(0, LARGE_FILE_LINE_CAP)
  return lines.join('\n') + '\n\n[… gekürzt — Originalfile sehr groß]'
}

// ────────────────────────────────────────────────────────────────────────────
// Prompt-Aufbau (bilingual)
// ────────────────────────────────────────────────────────────────────────────

function buildPrompt(
  marker: ProjectStatusMarker,
  weekTag: string,
  brainEntries: ProjectStatusBrainEntry[],
  projectFiles: ProjectStatusSourceFile[],
  inboxNotes: ProjectStatusSourceFile[],
  emailNotes: ProjectStatusSourceFile[],
  language: 'de' | 'en'
): string {
  const projectName = marker.project

  // Brain-Heading bewusst als [[YYYY-MM-DD]] + Treffer-Evidenz, damit das LLM
  // (a) die Wikilink-Form mimt und (b) weiß, welche Sätze aus dem Tag
  // tatsächlich projektrelevant sind. Brain-Tage mischen oft viele Themen.
  const brainBlock = brainEntries.length === 0
    ? (language === 'de'
        ? '(keine relevanten Brain-Tage in den letzten 7 Tagen)'
        : '(no relevant brain days in the last 7 days)')
    : brainEntries.map(e => {
        const evHint = e.evidence.length > 0
          ? (language === 'de'
              ? `\n(Keyword-Treffer in diesem Tag: ${e.evidence.map(x => `"${x}"`).join(', ')} — andere Tagesinhalte ignorieren)\n`
              : `\n(Keyword hits in this day: ${e.evidence.map(x => `"${x}"`).join(', ')} — ignore other day content)\n`)
          : ''
        return `### [[${e.date}]]${evHint}\n${e.body.trim()}`
      }).join('\n\n')

  // Brain-/Projekt-/Inbox-Heading mit Wikilink + Match-Evidenz.
  // Die Evidenz sagt dem LLM, **warum** dieser Quelltext im Prompt steht — und
  // implizit auch, dass NUR die Sätze rund um diese Treffer relevant sind.
  // Inbox-Match-Computation (vor Ort, billig):
  const lowerKw = marker.keywords.map(k => k.toLowerCase()).filter(k => k.length > 0)
  const evidenceFor = (text: string): string[] => {
    const lower = text.toLowerCase()
    const hits: string[] = []
    for (let i = 0; i < lowerKw.length; i++) {
      if (lower.includes(lowerKw[i])) hits.push(marker.keywords[i])
    }
    return hits
  }

  const formatEvidence = (ev: string[]): string => {
    if (ev.length === 0) return ''
    return language === 'de'
      ? `\n(Keyword-Treffer in dieser Quelle: ${ev.map(e => `"${e}"`).join(', ')})\n`
      : `\n(Keyword hits in this source: ${ev.map(e => `"${e}"`).join(', ')})\n`
  }

  const projectBlock = projectFiles.length === 0
    ? (language === 'de'
        ? '(keine Markdown-Dateien im Projektordner)'
        : '(no markdown files in the project folder)')
    : projectFiles.map(f =>
        `### [[${f.name}]]${formatEvidence(evidenceFor(f.content))}\n${f.content.trim()}`
      ).join('\n\n')

  const inboxBlock = inboxNotes.length === 0
    ? (language === 'de'
        ? '(keine themenverwandten Inbox-Notizen)'
        : '(no related inbox notes)')
    : inboxNotes.map(f =>
        `### [[${f.name}]]${formatEvidence(evidenceFor(f.content))}\n${f.content.trim()}`
      ).join('\n\n')

  const emailBlock = emailNotes.length === 0
    ? (language === 'de'
        ? '(keine themenverwandten Email-Notizen in den letzten 30 Tagen)'
        : '(no related email notes in the last 30 days)')
    : emailNotes.map(f =>
        `### [[${f.name}]]${formatEvidence(evidenceFor(f.content))}\n${f.content.trim()}`
      ).join('\n\n')

  if (language === 'de') {
    return `Du bist der Projekt-Status-Crystallizer. Aus den unten gelieferten Quellen schreibst du **einen ehrlichen, knappen Wochenstand** für ein Projekt — so wie ihn ein Geschäftsführer oder Projektleiter Sonntagabend lesen will.

PROJEKT: ${projectName}
WOCHE: ${weekTag}
KEYWORDS (zur Identifikation, nicht in den Output schreiben): ${marker.keywords.join(', ')}

HARTE REGELN:
1. NUR Inhalt, der nachweislich in den Quellen unten steht. KEINE Erfindung von Personen, Terminen, Zahlen, Zusagen.
2. Jede konkrete Aussage MUSS mit einem Wikilink belegt sein. SO und NUR SO:
   - Brain-Tag: \`[[2026-05-13]]\` — NUR das Datum in doppelten Klammern.
     RICHTIG: "...[[2026-05-13]]"
     FALSCH: "[[Brain-Tag 2026-05-13]]" oder "[[Tag 2026-05-13]]" oder "Brain-Tag [[2026-05-13]]"
   - Projektdatei oder Inbox-Notiz: \`[[Dateiname-ohne-Endung]]\` — übernimm exakt die Wikilink-Form aus den \`###\`-Überschriften der Quellen weiter unten.
     RICHTIG: "...gemäß [[202604301437 - 🔴 Infomailing SG3 - HMKB Telli und LeDi Café]]"
     RICHTIG: "...siehe [[Info zur Änderung von AIS Chat]]"
3. **PRO QUELLE NUR DAS, WAS DIE KEYWORDS BETRIFFT.** Brain-Tage und Inbox-Notizen mischen oft mehrere Themen. Wenn eine Quelle einen Keyword-Treffer hat (siehe „(Keyword-Treffer …)"-Hinweis in jeder Quell-Überschrift), zitiere NUR die Sätze rund um diesen Treffer. **Alles andere aus dieser Quelle ist NICHT für dieses Projekt relevant — auch nicht für „Diese Woche".**

   Beispiel: Eine Brain-Tag-Notiz erwähnt Fachforum NUR im Halbsatz „Regionales Fachforum Kassel über Infos Fachforum", der Rest dreht sich um AIS.chat. → Du nimmst NUR den Halbsatz zum Fachforum. AIS.chat-Inhalte gehören in eine andere Projekt-Statusseite, nicht hier.

4. **WAS GEHÖRT IN WELCHE SEKTION** (kritisch — Quellen-Vermischung ist der häufigste Fehler):

   - **„In einem Satz"** + **„Status"** beschreiben WAS DAS PROJEKT IST und WO ES STEHT.
     → Speise diese Sektionen aus den **Projekt-Dateien** (\`## B) Dateien im Projektordner\`).
     → Diese sagen dir, was das Projekt thematisch IST.
     → Brain-Tage NICHT zur Charakterisierung des Projekts heranziehen — Brain-Tage zeigen nur Wochenarbeit, nicht das Projekt selbst. Wenn Brain diese Woche viel über ein anderes Thema redet, ändert das NICHT, was dieses Projekt ist.

   - **„Diese Woche"** — NUR Aktionen aus den **Brain-Tagen** (diese Woche), und auch dort NUR die Sätze, die direkt das aktuelle Projekt-Keyword betreffen. Wenn nichts Substantielles zu finden ist, schreibe wörtlich:
     "Diese Woche keine konkrete Bewegung am Projekt sichtbar."
     **Niemals** alte Projekt-Notizen (z. B. ein Gespräch vom 27.03.) als „Diese Woche" verkaufen.

   - **„Stakeholder"**, **„Wichtige Daten"**, **„Risiken"** — primär aus **Projekt-Dateien** und **Email-Notizen**, auch wenn älter. Personen (Absender/Empfänger der Mails!), Termine und Risiken stehen oft in Emails konkreter als anderswo.

   - **„Offene Fäden"** — aus Brain-Tagen, Projekt-Dateien oder **Email-Notizen** (besonders Mails mit offenen Aufgaben oder ohne erkennbare Antwort), sofern aktuell unerledigt UND projektbezogen.

   - **Email-Notizen** (\`## D)\`) sind unsere primäre Quelle für **Wer hat was wann gesagt** — Absender werden im Frontmatter \`von:\` als Wikilink genannt; nutze diese Personen für „Stakeholder". Termine in Email-„Aufgaben"-Sektionen (\`@[[YYYY-MM-DD]]\`) gehören in „Wichtige Daten".

   **Faustregel**: Wenn dir nur die Brain-Tage sagen, „worum es im Projekt geht", liegt ein Quellen-Fehler vor — Brain-Tage charakterisieren niemals das Projekt selbst, nur dessen Wochenbewegung.
5. „Diese Woche": konkrete Aktionen aus Brain-Tagen, nicht Meta-Sätze. "Subdomain telli.mzgivb.de stillgelegt" — nicht "Dokumentation wurde gepflegt".
6. Stakeholder: NUR Personen, deren Beteiligung am AKTUELLEN Projekt klar aus den Quellen hervorgeht. Wenn jemand nur in einem Nebenkontext erwähnt wird (anderes Projekt, anderer Workshop), NICHT als Stakeholder dieses Projekts aufnehmen. Eckige-Klammer-Platzhalter wie \`[Koordination]\` sind KEINE Eigennamen — ignoriere sie. Wenn unsicher, lass die Sektion weg.
7. KEINE Floskeln wie "fortgeschritten", "vorangetrieben", "läuft gut". Schreibe, was gemacht wurde.
8. Strikt Markdown, KEINE Code-Fences, KEIN \`\`\`markdown-Wrapper.

OUTPUT-FORMAT — genau diese Sektionen, in dieser Reihenfolge:

## In einem Satz
[max 25 Wörter — was ist das Projekt aktuell?]

## Status
**Farbe:** 🔴 oder 🟡 oder 🟢
**Begründung:** [1–2 Sätze, woraus sich die Farbe ergibt]

## Diese Woche
[3–6 Bulletpoints konkreter Aktionen aus den Brain-Tagen dieser Woche, jeweils mit Backlink. Wenn keine konkrete Bewegung sichtbar ist: exakt den oben vorgegebenen Satz schreiben.]

## Offene Fäden
[Was hängt? Unbeantwortete Mails, ausstehende Bestätigungen, unklare Punkte — mit Backlinks. Max 5 Punkte. Wenn nichts offen ist, lass die Sektion weg.]

## Wichtige Daten
[Termine/Deadlines aus den Quellen, chronologisch. Format: **DD.MM.JJJJ** — Beschreibung. Wenn keine Daten genannt sind, lass die Sektion weg.]

## Stakeholder
[Personen aus den Quellen, eine pro Bullet: **Name** — Rolle/Aufgabe. Wenn keine Personen genannt sind, lass die Sektion weg.]

## Risiken
[Was kann schiefgehen? Welche Abhängigkeiten? Nur aus den Quellen ableitbar. Wenn unklar, lass die Sektion weg.]

═══════════════════════════════════════════════════════════════════
QUELLEN
═══════════════════════════════════════════════════════════════════

## A) Brain-Tage (vorgefiltert auf Projekt-Relevanz)

${brainBlock}

## B) Dateien im Projektordner

${projectBlock}

## C) Themenverwandte Inbox-Notizen

${inboxBlock}

## D) Themenverwandte Email-Notizen

${emailBlock}

═══════════════════════════════════════════════════════════════════

Beginne sofort mit \`## In einem Satz\`. KEINE Vorrede, KEINE Code-Fences.`
  }

  return `You are the Project-Status-Crystallizer. From the sources below, write **an honest, concise weekly status** for one project — like a manager or PM wants to read on a Sunday evening.

PROJECT: ${projectName}
WEEK: ${weekTag}
KEYWORDS (for identification, do not write in output): ${marker.keywords.join(', ')}

HARD RULES:
1. ONLY content provably in the sources. NO invention of people, dates, numbers, commitments.
2. Every concrete statement MUST be backed by a wikilink. EXACTLY THIS WAY:
   - Brain day: \`[[2026-05-13]]\` — JUST the date in double brackets.
     CORRECT: "...[[2026-05-13]]"
     WRONG: "[[Brain-Day 2026-05-13]]" or "[[Day 2026-05-13]]" or "Brain-Day [[2026-05-13]]"
   - Project file or inbox note: \`[[Filename-without-extension]]\` — copy the exact wikilink form from the \`###\` headings of the sources below.
     CORRECT: "...per [[202604301437 - 🔴 Infomailing SG3 - HMKB Telli und LeDi Café]]"
     CORRECT: "...see [[Info zur Änderung von AIS Chat]]"
3. **PER SOURCE: ONLY WHAT MATCHES THE KEYWORDS.** Brain days and inbox notes often mix multiple topics. When a source has a keyword hit (see "(Keyword hits …)" note in each source heading), quote ONLY the sentences around that hit. **Everything else from that source is NOT relevant to this project — not even for "This week".**

   Example: A brain entry mentions Fachforum only in a half-sentence "Regional Fachforum Kassel via Infos Fachforum", the rest is about AIS.chat. → Take ONLY that half-sentence about Fachforum. AIS.chat content belongs in a different project status, not here.

4. **WHICH SOURCE GOES INTO WHICH SECTION** (critical — source mixing is the most common bug):

   - **"In one sentence"** + **"Status"** describe WHAT THE PROJECT IS and WHERE IT STANDS.
     → Source these from **project files** (\`## B) Files in project folder\`).
     → They tell you what the project thematically IS.
     → Do NOT use brain days to characterize the project — brain days only show weekly activity, not the project itself. If brain this week talks about an unrelated topic, this does NOT change what this project is.

   - **"This week"** — ONLY actions from the **brain days** (this week), and only sentences directly touching the current project keyword. If nothing substantive: write literally:
     "No direct project activity visible this week."
     **Never** sell old project notes (e.g. a March 27 meeting) as "this week".

   - **"Stakeholders"**, **"Important dates"**, **"Risks"** — primarily from **project files** and **email notes**, even older ones. People (email senders/recipients!), dates and risks are often stated more concretely in emails than elsewhere.

   - **"Open threads"** — from brain days, project files, or **email notes** (especially mails with open tasks or no visible reply), as long as currently unresolved AND project-related.

   - **Email notes** (\`## D)\`) are our primary source for **who said what when** — senders appear in the \`von:\` (from) frontmatter as wikilinks; use these people for "Stakeholders". Dates inside email "Aufgaben"/Tasks sections (\`@[[YYYY-MM-DD]]\`) belong in "Important dates".

   **Rule of thumb**: If only the brain days tell you "what this project is about", you have a source bug — brain days never characterize the project itself, only its weekly motion.
5. "This week": concrete actions from brain days, not meta-sentences. "Subdomain telli.mzgivb.de shut down" — not "documentation was maintained".
6. Stakeholders: ONLY people whose involvement in THIS project clearly shows in the sources. If someone is mentioned only in a side context (different project, different workshop), do NOT include them as a stakeholder of this project. Bracket placeholders like \`[Coordinator]\` are NOT proper nouns — ignore them. If unsure, omit the section.
7. NO filler like "advanced", "progressing", "going well". Write what was done.
8. Strict Markdown, NO code fences, NO \`\`\`markdown wrapper.

OUTPUT FORMAT — exactly these sections, in this order:

## In one sentence
[max 25 words — what is this project currently?]

## Status
**Color:** 🔴 or 🟡 or 🟢
**Reasoning:** [1–2 sentences justifying the color]

## This week
[3–6 bullets of concrete actions from this week's brain days, each with a backlink. If no direct project activity is visible: write exactly the sentence specified above.]

## Open threads
[What's hanging? Unanswered mails, pending confirmations, unclear points — with backlinks. Max 5. If nothing is open, omit the section.]

## Important dates
[Deadlines/dates from sources, chronological. Format: **YYYY-MM-DD** — description. If none mentioned, omit the section.]

## Stakeholders
[People from the sources, one per bullet: **Name** — role/task. If none mentioned, omit the section.]

## Risks
[What could go wrong? Dependencies? Only what is derivable from sources. If unclear, omit the section.]

═══════════════════════════════════════════════════════════════════
SOURCES
═══════════════════════════════════════════════════════════════════

## A) Brain days (pre-filtered for project relevance)

${brainBlock}

## B) Files in project folder

${projectBlock}

## C) Topic-related inbox notes

${inboxBlock}

## D) Topic-related email notes

${emailBlock}

═══════════════════════════════════════════════════════════════════

Start immediately with \`## In one sentence\`. NO preamble, NO code fences.`
}

// ────────────────────────────────────────────────────────────────────────────
// Ollama-Call (analog brain/dailyConsolidation.callOllama)
// ────────────────────────────────────────────────────────────────────────────

async function callOllama(model: string, prompt: string): Promise<string> {
  const response = await fetch(`${OLLAMA_LOCAL_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt,
      stream: false,
      think: false,
      options: { temperature: 0.2, num_predict: 1400 }
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

// ────────────────────────────────────────────────────────────────────────────
// Output-Bereinigung
// ────────────────────────────────────────────────────────────────────────────

function stripCodeFences(text: string): string {
  const trimmed = text.trim()
  if (trimmed.startsWith('```')) {
    const firstNl = trimmed.indexOf('\n')
    if (firstNl > -1) {
      const inner = trimmed.slice(firstNl + 1)
      const closeIdx = inner.lastIndexOf('```')
      return (closeIdx > -1 ? inner.slice(0, closeIdx) : inner).trim()
    }
  }
  return trimmed
}

/**
 * Repariert "[[Teilversion[[Vollversion]]]"-Muster, die Gemma manchmal
 * produziert, wenn es sich beim Wikilink-Schreiben umentscheidet.
 * Die innere (zweite) Variante ist die gewählte — äußere wird entfernt.
 */
function fixNestedWikilinks(text: string): string {
  // Match: [[ ... not-bracket ... [[ ... not-bracket ... ]] optional-extra-]
  // Replace with inner [[X]]
  return text.replace(/\[\[[^[\]]*\[\[([^[\]]+)\]\]\]?/g, '[[$1]]')
}

function cleanupOutput(raw: string): string {
  let out = stripCodeFences(raw)
  out = fixNestedWikilinks(out)
  return out
}

// ────────────────────────────────────────────────────────────────────────────
// Pfad-Hygiene: nie überschreiben
// ────────────────────────────────────────────────────────────────────────────

async function findFreshPath(
  projectAbs: string,
  weekTag: string
): Promise<string> {
  let candidate = path.join(projectAbs, `_STATUS-${weekTag}.md`)
  let counter = 2
  for (let i = 0; i < 100; i++) {
    try {
      await fs.access(candidate)
      candidate = path.join(projectAbs, `_STATUS-${weekTag} (${counter}).md`)
      counter++
    } catch {
      return candidate
    }
  }
  throw new Error('Zu viele Drafts für diese Woche')
}

// ────────────────────────────────────────────────────────────────────────────
// Frontmatter für den Output-Draft
// ────────────────────────────────────────────────────────────────────────────

function buildDraftFrontmatter(
  marker: ProjectStatusMarker,
  weekTag: string,
  model: string,
  brainEntries: ProjectStatusBrainEntry[],
  inboxNotes: ProjectStatusSourceFile[],
  emailNotes: ProjectStatusSourceFile[],
  language: 'de' | 'en',
  generatedAtIso: string
): string {
  const includedBrain = brainEntries.map(b => b.date).join(', ') || '(keine)'
  const inboxList = inboxNotes.map(n => n.name).slice(0, 8).join(' · ') || '(keine)'
  const emailList = emailNotes.map(n => n.name).slice(0, 8).join(' · ') || '(keine)'

  const escapeYaml = (s: string) => s.replace(/"/g, '\\"')
  return `---
type: project-status-draft
project: "${escapeYaml(marker.project)}"
week: ${weekTag}
generated_at: ${generatedAtIso}
generated_by: "ollama:${escapeYaml(model)}"
language: ${language}
brain_days_included: "${escapeYaml(includedBrain)}"
inbox_notes_included: "${escapeYaml(inboxList)}"
emails_included: "${escapeYaml(emailList)}"
---`
}

// ────────────────────────────────────────────────────────────────────────────
// Hauptfunktion
// ────────────────────────────────────────────────────────────────────────────

export async function crystallizeProject(
  input: ProjectStatusCrystallizeInput,
  safePath: (p: string, op: string) => Promise<string>
): Promise<ProjectStatusResult> {
  const generatedAtIso = new Date().toISOString()

  // 1) Marker aus _STATUS.md lesen
  const projectAbs = path.join(input.vaultPath, input.projectFolderRel)
  const statusFile = path.join(projectAbs, '_STATUS.md')
  let markerRaw: string
  try {
    markerRaw = await fs.readFile(statusFile, 'utf-8')
  } catch {
    return { success: false, error: '_STATUS.md im Projektordner nicht gefunden — Projekt nicht markiert.' }
  }
  const marker = parseStatusMarker(markerRaw)
  if (!marker) {
    return { success: false, error: '_STATUS.md hat kein gültiges Frontmatter (keywords/priority).' }
  }

  const weekTag = getISOWeekTag()
  const brainFolderRel = input.brainFolderRel || DEFAULT_BRAIN_FOLDER
  const inboxFolderRel = input.inboxFolderRel || DEFAULT_INBOX_FOLDER
  const emailFolderRel = input.emailFolderRel || DEFAULT_EMAIL_FOLDER

  // 2) Quellen einsammeln
  const [brainEntries, projectFiles, inboxNotes, emailNotes] = await Promise.all([
    gatherBrainEntries(input.vaultPath, brainFolderRel, marker.keywords),
    gatherProjectFiles(projectAbs, input.projectFolderRel),
    gatherInboxNotes(input.vaultPath, inboxFolderRel, marker.keywords),
    gatherEmailNotes(input.vaultPath, emailFolderRel, marker.keywords)
  ])

  if (
    brainEntries.length === 0 &&
    projectFiles.length === 0 &&
    inboxNotes.length === 0 &&
    emailNotes.length === 0
  ) {
    return {
      success: false,
      error: 'Keine Quellen gefunden — keine Brain-Tage, keine Projektdateien, keine themenverwandten Inbox- oder Email-Notizen. Prüfe deine Keywords.'
    }
  }

  // 3) Prompt + LLM-Call
  const prompt = buildPrompt(marker, weekTag, brainEntries, projectFiles, inboxNotes, emailNotes, input.language)

  let body: string
  try {
    body = await callOllama(input.model, prompt)
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Ollama-Aufruf fehlgeschlagen'
    }
  }

  body = cleanupOutput(body)

  // 4) Lint
  let findings: import('./types').LintFinding[] = []
  let annotatedBody = body
  try {
    const index = await buildVaultIndex(input.vaultPath)
    findings = lintContent(body, index)
    annotatedBody = appendFindingsSection(body, findings, index, input.language)
  } catch (err) {
    // Lint-Fehler ist nicht fatal — Output trotzdem schreiben
    console.warn('[crystallizer] Lint fehlgeschlagen:', err)
  }

  // 5) Schreiben
  const frontmatter = buildDraftFrontmatter(
    marker, weekTag, input.model, brainEntries, inboxNotes, emailNotes, input.language, generatedAtIso
  )
  const titlePrefix = input.language === 'de'
    ? `# ${marker.project} · Status ${weekTag}\n\n`
    : `# ${marker.project} · Status ${weekTag}\n\n`
  const fullContent = `${frontmatter}\n\n${titlePrefix}${annotatedBody}\n`

  let targetPath: string
  try {
    targetPath = await findFreshPath(projectAbs, weekTag)
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Pfadwahl fehlgeschlagen' }
  }

  try {
    const safeTarget = await safePath(targetPath, 'project-status-crystallize:write')
    await fs.writeFile(safeTarget, fullContent, 'utf-8')
    return {
      success: true,
      notePath: safeTarget,
      weekTag,
      brainEntriesUsed: brainEntries.length,
      inboxNotesUsed: inboxNotes.length,
      emailNotesUsed: emailNotes.length,
      findings
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Schreiben fehlgeschlagen'
    }
  }
}
