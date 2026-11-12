// Mess-Harness: Wie viel liest und behält der Notiz-Agent, wenn das Material nicht ins Fenster passt?
//
// Läuft NUR auf ausdrücklichen Wunsch gegen ein echtes lokales Modell (Ollama), nie in der
// normalen Testreihe:
//
//   MINDGRAPH_AGENT_EVAL=1 EVAL_VARIANT=on EVAL_REPS=3 \
//     EVAL_OUT=/pfad/ergebnisse.jsonl npx vitest run src/main/noteAgent/eval/contextEval.live.test.ts
//
// EVAL_VARIANT: „on“ (Verdichten an, Standard der App) oder „off“ (aus, Vergleichslauf).
// EVAL_SCENARIO: „fakten“ (Standard, 14 Notizen, drei Werte je Schule), „zitat“ (wörtlicher Satz je
// Schule) oder „gross“ (28 Notizen). EVAL_MODEL: Ollama-Tag, Standard qwen3.8:27b-mlx. EVAL_REPS: Wiederholungen, Standard 1.
//
// Es läuft der echte Loop (loop.ts) mit den echten Werkzeugen gegen einen erzeugten Testbestand
// (contextEvalFixture.ts). Gewertet wird die geschriebene Ergebnisnotiz gegen die bekannten
// Werte — richtig, fehlend, falsch. Kein Modell als Richter.
//
// Electron gibt es hier nicht: `net.fetch` wird durch einen kleinen node:http-Abruf ersetzt.
// Nodes eingebautes fetch bricht nach 300 s ohne Antwortkopf ab — ein großes lokales Modell
// braucht für einen langen Schreibaufruf länger (dieselbe Falle wie im Benchmark-Harness).

import { describe, it, expect, vi } from 'vitest'
import { promises as fs } from 'fs'
import * as http from 'node:http'
import * as os from 'os'
import * as path from 'path'

function httpFetch(url: string, init: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal } = {}): Promise<Response> {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const req = http.request({
      hostname: u.hostname, port: u.port, path: u.pathname + u.search,
      method: init.method ?? 'GET', headers: init.headers, signal: init.signal
    }, res => {
      const chunks: Buffer[] = []
      res.on('data', c => chunks.push(c as Buffer))
      res.on('end', () => resolve(new Response(Buffer.concat(chunks), { status: res.statusCode ?? 500, headers: res.headers as Record<string, string> })))
      res.on('error', reject)
    })
    req.on('error', reject)
    if (init.body) req.write(init.body)
    req.end()
  })
}

vi.mock('electron', () => ({
  net: { fetch: (url: string, init: never) => httpFetch(url, init) },
  app: { getPath: () => os.tmpdir(), getName: () => 'mindgraph-eval', getVersion: () => '0.0.0', isPackaged: false },
  BrowserWindow: { getAllWindows: () => [] }
}))

import { runNoteAgentLoop } from '../loop'
import type { AgentRun } from '../runRegistry'
import { EVAL_FOLDER, FOLLOW_UP_ANSWER, noteFileName, scenarioCount, scenarioInstruction, scenarioNote, schoolFacts, scoreQuotes, scoreResult, type EvalScenario } from './contextEvalFixture'

const ENABLED = process.env.MINDGRAPH_AGENT_EVAL === '1'
const MODEL = process.env.EVAL_MODEL ?? 'qwen3.8:27b-mlx'
const VARIANT = process.env.EVAL_VARIANT === 'off' ? 'off' : 'on'
const SCENARIO: EvalScenario = process.env.EVAL_SCENARIO === 'zitat' ? 'zitat' : process.env.EVAL_SCENARIO === 'gross' ? 'gross' : process.env.EVAL_SCENARIO === 'nachfrage' ? 'nachfrage' : 'fakten'
const FACTS = schoolFacts(scenarioCount(SCENARIO))
const REPS = Math.max(1, Number(process.env.EVAL_REPS ?? 1))
const OUT = process.env.EVAL_OUT ?? path.join(os.tmpdir(), 'mindgraph-context-eval.jsonl')

async function makeVault(): Promise<string> {
  const vault = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'mindgraph-context-eval-')))
  await fs.mkdir(path.join(vault, EVAL_FOLDER), { recursive: true })
  await fs.mkdir(path.join(vault, 'Ziel'), { recursive: true })
  for (const f of FACTS) await fs.writeFile(path.join(vault, EVAL_FOLDER, noteFileName(f.nr)), scenarioNote(SCENARIO, f), 'utf8')
  return vault
}

describe.skipIf(!ENABLED)(`Kontext-Harness (${MODEL}, Szenario ${SCENARIO}, Verdichten ${VARIANT})`, () => {
  for (let rep = 1; rep <= REPS; rep++) {
    it(`Lauf ${rep}`, async () => {
      const vault = await makeVault()
      const run = {
        runId: `eval-${VARIANT}-${rep}-${Date.now()}`, senderId: 990_000 + rep, noteId: 'eval', vaultPath: vault,
        targetFolderRel: 'Ziel', targetFolderAbs: path.join(vault, 'Ziel'),
        attachmentIds: [], instruction: scenarioInstruction(SCENARIO), model: MODEL, skills: [], skillsUsed: [],
        status: 'running', abort: new AbortController(), seq: 0,
        results: new Map(), sources: new Set<string>(), datasets: new Map(),
        folderReads: new Map(), collectedFolders: new Set(), toolsUsed: new Set()
      } as unknown as AgentRun

      const steps: Array<{ skill: string; summary: string }> = []
      let rounds = 0
      let maxRounds = 0
      let peakShare = 0
      const started = Date.now()
      let error = ''
      let text = ''
      let hitMaxIterations = false
      try {
        const res = await runNoteAgentLoop({
          run, noteContent: '', agentMemory: '',
          chatOptions: { backend: 'ollama', ollamaModel: MODEL } as never,
          compaction: VARIANT === 'on',
          onStep: (_seq, skill, summary) => { steps.push({ skill, summary }) },
          onContext: (snapshot, turns) => {
            peakShare = Math.max(peakShare, snapshot.used / snapshot.window)
            if (turns) { rounds = turns.used; maxRounds = turns.max }
          }
        })
        text = res.text
        hitMaxIterations = res.hitMaxIterations
      } catch (e) {
        error = e instanceof Error ? e.message : String(e)
      }
      // Szenario „nachfrage“: Folgelauf wie „Antworten und weitermachen“ in der App — neuer Lauf,
      // Verlauf des Vorgängers, Auftrag = alter Auftrag + Nachtrag. Gewertet wird SEIN Ergebnis.
      let firstRun: { rooms: number; rounds: number } | undefined
      let scoredRun = run
      if (SCENARIO === 'nachfrage' && !error) {
        const firstMd = Array.from(run.results.values()).filter(r => r.kind === 'md')
        const firstText = firstMd.length > 0 ? await fs.readFile(firstMd[firstMd.length - 1].stagingPath, 'utf8') : ''
        firstRun = { rooms: scoreResult(firstText, FACTS).perSchool.filter(p => p.room === 'ok').length, rounds }
        const follow = {
          ...run, runId: `${run.runId}-f`, senderId: run.senderId + 500,
          instruction: `${run.instruction}\n\nNachtrag: ${FOLLOW_UP_ANSWER}`,
          status: 'running', abort: new AbortController(), seq: 0, results: new Map(), toolsUsed: new Set()
        } as unknown as AgentRun
        try {
          const res = await runNoteAgentLoop({
            run: follow, noteContent: '', agentMemory: '',
            chatOptions: { backend: 'ollama', ollamaModel: MODEL } as never,
            compaction: VARIANT === 'on',
            continuation: { priorMessages: run.transcript ?? [], answer: FOLLOW_UP_ANSWER, priorTokens: run.transcriptTokens },
            onStep: (_seq, skill, summary) => { steps.push({ skill: `F:${skill}`, summary }) },
            onContext: (snapshot, turns) => {
              peakShare = Math.max(peakShare, snapshot.used / snapshot.window)
              if (turns) { rounds = turns.used; maxRounds = turns.max }
            }
          })
          text = res.text
          hitMaxIterations = res.hitMaxIterations
        } catch (e) {
          error = e instanceof Error ? e.message : String(e)
        }
        scoredRun = follow
      }
      const seconds = Math.round((Date.now() - started) / 1000)

      // Ergebnisnotiz: die zuletzt geschriebene Markdown-Datei des Laufs.
      const mdResults = Array.from(scoredRun.results.values()).filter(r => r.kind === 'md')
      let resultMd = mdResults.length > 0 ? await fs.readFile(mdResults[mdResults.length - 1].stagingPath, 'utf8') : ''
      let resultKind = resultMd ? 'md' : ''
      // Der Auftrag verlangt eine Notiz. Schreibt das Modell stattdessen eine Excel-Tabelle, wird
      // deren Inhalt trotzdem gewertet (als Pipe-Zeilen) und das Format im Protokoll vermerkt —
      // sonst sähe ein inhaltlich richtiges Ergebnis wie ein leeres aus.
      const xlsxResults = Array.from(scoredRun.results.values()).filter(r => r.kind === 'xlsx')
      if (!resultMd && xlsxResults.length > 0) {
        const XLSX = await import('xlsx')
        const book = XLSX.read(await fs.readFile(xlsxResults[xlsxResults.length - 1].stagingPath))
        const rows = XLSX.utils.sheet_to_json<unknown[]>(book.Sheets[book.SheetNames[0]], { header: 1 })
        resultMd = rows.map(r => `| ${(r as unknown[]).map(c => String(c ?? '')).join(' | ')} |`).join('\n')
        resultKind = 'xlsx'
      }
      const score = scoreResult(resultMd, FACTS)
      const quotes = SCENARIO === 'zitat' ? scoreQuotes(resultMd, FACTS) : undefined
      const readOk = new Set<string>()
      const failed = (i: number): boolean => steps[i + 1]?.skill === 'note_read' && steps[i + 1].summary.startsWith('Fehler')
      steps.forEach((s, i) => { if (s.skill === 'note_read' && !s.summary.startsWith('Fehler') && !failed(i)) readOk.add(s.summary) })

      const record = {
        at: new Date().toISOString(), model: MODEL, scenario: SCENARIO, total: SCENARIO === 'zitat' ? FACTS.length : FACTS.length * 3, quotes, firstRun,
        rereads: steps.filter(s => s.skill === 'F:note_read' && !s.summary.startsWith('Fehler')).length, variant: VARIANT, rep,
        label: process.env.EVAL_LABEL ?? VARIANT, wrote: resultMd.length > 0, resultKind, rows: score.rows, correct: score.correct, missing: score.missing, wrong: score.wrong,
        notesRead: readOk.size, compactions: steps.filter(s => s.skill === 'kontext' && s.summary.startsWith('Gelesenes verdichtet')).length,
        readErrors: steps.filter(s => s.skill === 'note_read' && s.summary.startsWith('Fehler')).length,
        rounds, maxRounds, hitMaxIterations, peakShare: Math.round(peakShare * 100) / 100, seconds, error,
        perSchool: score.perSchool, steps, text, resultMd,
        // Kurzfassungen, mit denen der gewertete Lauf am Ende gearbeitet hat — zur Fehlersuche.
        digests: (scoredRun.transcript ?? []).filter(m => m.role === 'tool' && (m.content ?? '').startsWith('[Verdichtet')).map(m => m.content)
      }
      await fs.appendFile(OUT, JSON.stringify(record) + '\n', 'utf8')
      await fs.rm(vault, { recursive: true, force: true })
      console.log(`[eval] ${VARIANT} #${rep}: richtig ${score.correct}/42, fehlend ${score.missing}, falsch ${score.wrong}, gelesen ${readOk.size}/${FACTS.length}, Runden ${rounds}/${maxRounds}, ${seconds}s${error ? `, Fehler: ${error}` : ''}`)
      // Das Harness misst — es soll nicht „bestehen“. Nur ein Lauf ohne jede Auswertung wäre ein Harness-Fehler.
      expect(record.seconds).toBeGreaterThan(0)
    }, 3 * 60 * 60 * 1000)
  }
})
