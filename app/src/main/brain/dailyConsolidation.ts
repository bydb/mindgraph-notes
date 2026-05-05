import * as path from 'path'
import * as fs from 'fs/promises'
import type { BrainConsolidateInput, BrainConsolidateResult } from './types'

const OLLAMA_LOCAL_URL = 'http://localhost:11434'
const DEFAULT_BRAIN_FOLDER = '800 - 🧠 brain'

function sanitizeFolderPath(input: string | undefined): string {
  const value = (input || '').trim()
  if (!value) return DEFAULT_BRAIN_FOLDER
  // Keine absoluten Pfade, keine '..'-Komponenten — Pfad bleibt im Vault.
  if (path.isAbsolute(value)) return DEFAULT_BRAIN_FOLDER
  const parts = value.split(/[/\\]+/).filter(Boolean)
  if (parts.some(p => p === '..' || p === '.')) return DEFAULT_BRAIN_FOLDER
  return parts.join('/')
}

function buildPrompt(input: BrainConsolidateInput): string {
  const lang = input.language

  const noteTitles = input.sensors.notes.map(n => n.title)

  const notesLines = input.sensors.notes.length === 0
    ? (lang === 'de' ? '- (keine berührten Notizen)' : '- (no touched notes)')
    : input.sensors.notes.map(n => {
        const evs: string[] = []
        if (n.events.created) evs.push(lang === 'de' ? 'neu' : 'new')
        if (n.events.opened > 0) evs.push(lang === 'de' ? `geöffnet ×${n.events.opened}` : `opened ×${n.events.opened}`)
        if (n.events.updated > 0) evs.push(lang === 'de' ? `geändert ×${n.events.updated}` : `edited ×${n.events.updated}`)
        const tags = n.tags.length > 0 ? ` — tags: ${n.tags.map(t => '#' + t).join(' ')}` : ''
        const evsStr = evs.length > 0 ? ` (${evs.join(', ')})` : ''
        return `- [[${n.title}]]${evsStr}${tags}`
      }).join('\n')

  const journalBlock = input.sensors.journal
    ? (lang === 'de'
        ? `\nTagesjournal heute (Auszug aus [[${input.sensors.journal.title}]]):\n${input.sensors.journal.excerpt}\n`
        : `\nToday's journal entry (excerpt from [[${input.sensors.journal.title}]]):\n${input.sensors.journal.excerpt}\n`)
    : ''

  const tasksBlock = lang === 'de'
    ? `- abgeschlossen: ${input.sensors.tasks.completed}\n- neu: ${input.sensors.tasks.created}` +
      (input.sensors.tasks.examples.length > 0
        ? `\n- Beispiele: ${input.sensors.tasks.examples.map(e => `"${e}"`).join(', ')}`
        : '')
    : `- completed: ${input.sensors.tasks.completed}\n- created: ${input.sensors.tasks.created}` +
      (input.sensors.tasks.examples.length > 0
        ? `\n- examples: ${input.sensors.tasks.examples.map(e => `"${e}"`).join(', ')}`
        : '')

  const emailsBlock = lang === 'de'
    ? `- empfangen: ${input.sensors.emails.received}\n- beantwortet: ${input.sensors.emails.replied}` +
      (input.sensors.emails.topRelevant.length > 0
        ? '\n- relevanteste:\n' + input.sensors.emails.topRelevant.map(e =>
            `  - "${e.from}: ${e.subject}" (Relevanz ${e.relevance}%${e.needsReply ? ', Antwort offen' : ''})`
          ).join('\n')
        : '')
    : `- received: ${input.sensors.emails.received}\n- replied: ${input.sensors.emails.replied}` +
      (input.sensors.emails.topRelevant.length > 0
        ? '\n- most relevant:\n' + input.sensors.emails.topRelevant.map(e =>
            `  - "${e.from}: ${e.subject}" (relevance ${e.relevance}%${e.needsReply ? ', reply pending' : ''})`
          ).join('\n')
        : '')

  const wikilinkList = noteTitles.length > 0
    ? noteTitles.map(t => `[[${t}]]`).join(', ')
    : ''

  if (lang === 'de') {
    return `Du bist das lokale Tagesgedächtnis dieses Nutzers. Fasse den Tag in der Ich-Form zusammen. Keine Erfindungen — wenn etwas unklar ist, lass es weg.

Datum: ${input.date}

Berührte Notizen heute:
${notesLines}

Aufgaben heute:
${tasksBlock}

Mails heute:
${emailsBlock}
${journalBlock}

REGELN — beachte alle:

1. FORMAT: genau diese vier Überschriften, in dieser Reihenfolge:
   ## Heute im Fokus
   ## Was ich gemacht habe
   ## Offene Fäden
   ## Beobachtung
   Antworte als Markdown, keine Code-Fences, kein YAML-Frontmatter. Maximal 220 Wörter.

2. WIKILINKS — verpflichtend: Wenn du eine der folgenden Notizen erwähnst, schreibe sie EXAKT in Doppelklammern. Verwende für eine andere Bezeichnung die Alias-Syntax [[Titel|Anzeigetext]].
   Verfügbare Notizen: ${wikilinkList || '(keine)'}
   Beispiel richtig: "Ich aktualisierte [[20260507_TO_Dienstversammlung]] und schrieb an [[Quantencomputer-Anwendungen|Quantencomputer]]."
   Beispiel falsch: "Ich aktualisierte die Dienstversammlung." (ohne Wikilink)

3. OFFENE FÄDEN — nur substantielle Fäden: anstehende Antworten, ungelöste Themen, Termine. KEINE Mikrotasks (Wasser trinken, Mittagessen, Pause). Maximal 3 Punkte. Wenn keine substantiellen Fäden offen sind, lass die Sektion ganz weg.

4. BEOBACHTUNG — beschreibend, nicht bewertend. Beschreibe ein Muster im Tag, kein Urteil über den Nutzer.
   Beispiel richtig: "Heute viel Mail-Verkehr, kaum Vault-Bearbeitung."
   Beispiel falsch: "Wirkt erschöpft." / "Klingt nach Ausrede." / "Sollte mehr X tun."
   Wenn dir kein neutraler Befund einfällt, lass die Sektion weg.

5. SEKTIONEN: Wenn eine Sektion leer wäre, lass sie KOMPLETT weg, statt "keine" zu schreiben.`
  }

  return `You are this user's local daily memory. Summarize the day in first person. No inventions — if something is unclear, leave it out.

Date: ${input.date}

Touched notes today:
${notesLines}

Tasks today:
${tasksBlock}

Mails today:
${emailsBlock}
${journalBlock}

RULES — follow all:

1. FORMAT: exactly these four headings, in this order:
   ## Today's focus
   ## What I did
   ## Open threads
   ## Observation
   Respond as Markdown, no code fences, no YAML frontmatter. Max 220 words.

2. WIKILINKS — mandatory: When mentioning one of the following notes, write it EXACTLY in double brackets. For a different display label, use [[Title|display]].
   Available notes: ${wikilinkList || '(none)'}
   Right: "I updated [[20260507_TO_Dienstversammlung]] and wrote to [[Quantencomputer-Anwendungen|Quantencomputer]]."
   Wrong: "I updated the staff meeting." (no wikilink)

3. OPEN THREADS — only substantive threads: pending replies, unresolved topics, appointments. NO micro-tasks (drink water, lunch, break). Max 3 items. If no substantive threads, omit the section.

4. OBSERVATION — descriptive, not evaluative. Describe a pattern in the day, not a judgment about the user.
   Right: "Lots of email traffic today, little vault editing."
   Wrong: "Seems exhausted." / "Sounds like an excuse." / "Should do more X."
   If no neutral pattern comes to mind, omit the section.

5. SECTIONS: If a section would be empty, omit it entirely rather than writing "none".`
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
      options: { temperature: 0.2, num_predict: 800 }
    })
  })
  if (!response.ok) {
    const errText = await response.text().catch(() => '')
    throw new Error(`Ollama API ${response.status} ${errText.slice(0, 200)}`)
  }
  const data = await response.json()
  const result = (data.response || '').trim()
  if (!result) throw new Error('Ollama lieferte leere Antwort')
  return stripCodeFences(result)
}

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

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Sicherheitsnetz: wenn das Modell einen exakten Notiz-Titel als Klartext schreibt,
// wickeln wir ihn nachträglich in Wikilinks. Bestehende [[…]]-Vorkommen werden nicht
// doppelt gewrappt. Sehr kurze Titel (< 4 Zeichen) werden ignoriert, um false positives
// bei generischen Wörtern zu vermeiden.
function injectWikilinks(body: string, titles: string[]): string {
  if (!titles.length) return body
  // Längere Titel zuerst, damit Übersnippets nicht von Teilstrings überlagert werden.
  const sorted = [...titles].filter(t => t && t.length >= 4).sort((a, b) => b.length - a.length)
  let result = body
  for (const title of sorted) {
    const escaped = escapeRegex(title)
    // Nur ersetzen, wenn nicht bereits in [[…]] eingebettet (Negative Lookbehind/-ahead).
    const re = new RegExp(`(?<!\\[\\[)(?<!\\[\\[[^\\]]*\\|)${escaped}(?!\\]\\])(?![^\\[]*\\]\\])`, 'g')
    result = result.replace(re, `[[${title}]]`)
  }
  return result
}

function escapeYamlString(value: string): string {
  return value.replace(/[\\"]/g, '\\$&')
}

function buildFrontmatter(input: BrainConsolidateInput): string {
  const tagCounts = new Map<string, number>()
  for (const note of input.sensors.notes) {
    for (const tag of note.tags) {
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1)
    }
  }
  const topTags = Array.from(tagCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([t]) => t)

  const themesYaml = topTags.length > 0
    ? '\n' + topTags.map(t => `  - "${escapeYamlString(t)}"`).join('\n')
    : ' []'

  const notesCreated = input.sensors.notes.filter(n => n.events.created).length

  const sources: string[] = ['notes', 'tasks', 'emails']
  if (input.sensors.journal) sources.push('journal')
  const sourcesYaml = sources.map(s => `  - ${s}`).join('\n')

  return `---
type: brain-day
date: ${input.date}
generated_at: ${input.generatedAtIso}
generated_by: "ollama:${escapeYamlString(input.model)}"
language: ${input.language}
sources:
${sourcesYaml}
counts:
  notes_touched: ${input.sensors.notes.length}
  notes_created: ${notesCreated}
  tasks_completed: ${input.sensors.tasks.completed}
  tasks_created: ${input.sensors.tasks.created}
  emails_received: ${input.sensors.emails.received}
  emails_replied: ${input.sensors.emails.replied}
themes:${themesYaml}
---`
}

async function findFreshPath(vaultPath: string, folderPath: string, date: string): Promise<string> {
  const [year, month, day] = date.split('-')
  if (!year || !month || !day) {
    throw new Error('Ungültiges Datum (erwartet YYYY-MM-DD)')
  }
  // vaultPath wurde vom IPC-Handler bereits via assertApprovedVault geprüft.
  // folderPath wurde via sanitizeFolderPath gesäubert (kein absoluter Pfad, kein '..').
  const dir = path.join(vaultPath, folderPath, year, month)
  await fs.mkdir(dir, { recursive: true })

  let candidate = path.join(dir, `${day}.md`)
  let counter = 2
  for (let i = 0; i < 100; i++) {
    try {
      await fs.access(candidate)
      candidate = path.join(dir, `${day} (${counter}).md`)
      counter++
    } catch {
      return candidate
    }
  }
  throw new Error('Zu viele bestehende Brain-Notizen für diesen Tag')
}

export async function consolidateDay(
  input: BrainConsolidateInput,
  safePath: (p: string, op: string) => Promise<string>
): Promise<BrainConsolidateResult> {
  const prompt = buildPrompt(input)

  let body: string
  try {
    body = await callOllama(input.model, prompt)
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Ollama-Aufruf fehlgeschlagen'
    }
  }

  body = injectWikilinks(body, input.sensors.notes.map(n => n.title))

  const frontmatter = buildFrontmatter(input)
  const content = `${frontmatter}\n\n${body}\n`

  const folderPath = sanitizeFolderPath(input.folderPath)

  let targetPath: string
  try {
    targetPath = await findFreshPath(input.vaultPath, folderPath, input.date)
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Pfad-Erstellung fehlgeschlagen'
    }
  }

  try {
    // Defensive Tiefenprüfung: Parent existiert nun (mkdir -p), realpath-Check
    // stellt sicher, dass kein Symlink aus dem Vault herausführt.
    const safeTarget = await safePath(targetPath, 'brain-consolidate-day:write')
    await fs.writeFile(safeTarget, content, 'utf-8')
    return { success: true, notePath: safeTarget }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Schreiben fehlgeschlagen'
    }
  }
}
