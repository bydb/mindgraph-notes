// Workflow Canvas — Runner (Main-Prozess).
//
// Reine Ausführungslogik: topologische Reihenfolge, Input-Sammlung, Dispatch
// über eine Executor-Map, Hard-Lock-Enforce (Decision #11), Modul-aktiv-Check
// (#11b), terminaler Hand-off (#6). Fähigkeiten kommen per Dependency Injection
// (RunnerServices) — der Runner kennt weder fs noch Ollama direkt.
//
// Schreibende Aktionen laufen ausschließlich über die injizierten Services, die
// in index.ts an den abgesicherten Schreibpfad (assertSafePath + Backup) gebunden
// sind — eine einzige Schreibgrenze (Decision #3).

import type { ModuleId as CompatModuleId } from '../../shared/modelCompatibility'
import {
  getActionById
} from '../../shared/workflow/registry'
import { topoSort } from '../../shared/workflow/validation'
import type {
  Workflow,
  WorkflowNode,
  WorkflowRun,
  WorkflowRunStep,
  WorkflowRunMode,
  WorkflowRunTrigger,
  WorkflowHandoff
} from '../../shared/workflow/model'

export interface SeedEmail {
  id?: string
  subject?: string
  bodyText?: string
  from?: string
  name?: string
}

/** Generischer Seed eines Laufs. Email-Trigger füllen `email`,
 *  Text-Trigger (Mahnung/Buchung/Aufgabe/Zeitplan) füllen `text` (+ `meta`). */
export interface RunSeed {
  email?: SeedEmail
  text?: string
  meta?: Record<string, unknown>
}

/** Event-Lauf (kein manueller ▶-Lauf) → Hand-off legt eine Aufgabe an statt
 *  das Compose-Fenster zu öffnen. Eine Stelle für alle Event-Trigger. */
export function isEventTrigger(trigger: WorkflowRunTrigger): boolean {
  return trigger !== 'manual'
}

export interface RunnerServices {
  /** node.config.model → Modul-Override → globales Modell. */
  resolveModel: (override: string | undefined, hint?: CompatModuleId) => string
  isHardLocked: (model: string, moduleId: CompatModuleId) => boolean
  /** Ist `model` ein gehostetes Ollama-Cloud-Modell (`:cloud`/`-cloud`)? Tag-basiert,
   *  NICHT endpunkt-basiert — On-Prem/Edge-Server mit normalen Modellen zählen nicht. */
  isCloudModel: (model: string) => boolean
  /** Ist das Workflow-Modul (email/project/…) im Vault aktiv? */
  isModuleActive: (workflowModuleId: string) => boolean

  ollamaGenerate: (prompt: string, model: string) => Promise<string>
  matchProject: (email: SeedEmail) => Promise<{ folderName: string; folderRel: string } | null>
  loadProjectContext: (folderRel: string) => Promise<string>
  /** Projekt-RAG: semantisches Retrieval über den Projektordner (lokal). */
  ragRetrieve: (folderRel: string, query: string) => Promise<{ contextText: string; chunkCount: number }>
  createNote: (folder: string, title: string, content: string) => Promise<string>
  appendNote: (noteRel: string, text: string) => Promise<string>
  searchNotes: (query: string) => Promise<string[]>
  createTask: (taskLine: string) => Promise<string>
}

export interface RunOptions {
  mode: WorkflowRunMode
  trigger: WorkflowRunTrigger
  /** Generischer Seed (bevorzugt). */
  seed?: RunSeed | null
  /** @deprecated Back-Compat-Alias — wird beim Lauf nach seed.email normalisiert. */
  seedEmail?: SeedEmail | null
  services: RunnerServices
}

interface ExecResult {
  outputs: Record<string, unknown>
  log: string[]
  handoff?: WorkflowHandoff
}

type NodeOutputs = Map<string, Record<string, unknown>>

function nowIso() { return new Date().toISOString() }
function genId(p: string) { return `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }

/** Sammelt die Eingangswerte eines Nodes aus den Ausgaben der Vorgänger. */
function gatherInputs(node: WorkflowNode, workflow: Workflow, outputs: NodeOutputs): Record<string, unknown> {
  const inputs: Record<string, unknown> = {}
  for (const edge of workflow.edges) {
    if (edge.toNodeId !== node.id) continue
    const srcOut = outputs.get(edge.fromNodeId)
    if (srcOut && edge.fromPortId in srcOut) {
      inputs[edge.toPortId] = srcOut[edge.fromPortId]
    }
  }
  return inputs
}

function asEmail(v: unknown): SeedEmail {
  return (v && typeof v === 'object') ? (v as SeedEmail) : {}
}
function asText(v: unknown): string {
  if (typeof v === 'string') return v
  if (v && typeof v === 'object') return JSON.stringify(v)
  return String(v ?? '')
}
function asNoteRel(v: unknown): string {
  if (Array.isArray(v)) return v.map(item => asText(item).trim()).find(Boolean) || ''
  return asText(v).trim()
}
/** Erkennt leeren oder un-crystallisierten (Stub-)Projektkontext, damit der Lauf
 *  das zurückmeldet statt stillschweigend Frontmatter-Rauschen weiterzureichen. */
function isEffectivelyEmptyContext(ctx: string): boolean {
  if (!ctx || !ctx.trim()) return true
  if (/noch nicht crystallisiert|not yet crystallized/i.test(ctx)) return true
  const body = ctx
    .replace(/^---[\s\S]*?---/m, '')      // YAML-Frontmatter
    .replace(/^#{1,6}\s.*$/gm, '')        // Überschriften
    .replace(/^\s*\*\(.*\)\*\s*$/gm, '')  // *(Platzhalter)*-Zeilen
    .trim()
  return body.length < 30
}

type Executor = (node: WorkflowNode, inputs: Record<string, unknown>, opts: RunOptions) => Promise<ExecResult>

/** Email-Trigger (selectedEmail/replyReceived/icsReceived): gibt die geseedete Mail aus. */
const triggerEmailExecutor: Executor = async (_node, _inputs, opts) => {
  const email = opts.seed?.email
  if (!email) throw new Error('Keine Eingangs-Mail (im Mail-Client eine Mail auswählen).')
  return { outputs: { email }, log: [`Eingabe: ${email.subject || '(ohne Betreff)'}`] }
}

/** Text-Trigger (Mahnung/Buchung/Aufgabe/Zeitplan): gibt den vorformatierten Seed-Text aus. */
const triggerTextExecutor: Executor = async (_node, _inputs, opts) => {
  const text = opts.seed?.text || ''
  const first = text.split('\n').find(l => l.trim()) || '(leer)'
  return {
    outputs: { text, ...(opts.seed?.email ? { email: opts.seed.email } : {}) },
    log: [`Auslöser: ${first.slice(0, 80)}`]
  }
}

function seededRecipient(opts: RunOptions, inputs: Record<string, unknown> = {}): { to?: string; toName?: string; subject?: string } {
  const meta = opts.seed?.meta || {}
  const email = { ...opts.seed?.email, ...asEmail(inputs.email) }
  const to = String(meta.recipientEmail || meta.userEmail || meta.email || email?.from || '').trim()
  const toName = String(meta.recipientName || meta.userName || email?.name || '').trim()
  const subject = String(meta.subject || email?.subject || '').trim()
  return {
    ...(to ? { to } : {}),
    ...(toName ? { toName } : {}),
    ...(subject ? { subject } : {})
  }
}

/** actionId → Implementierung. */
const EXECUTORS: Record<string, Executor> = {
  'email.selectedEmail': triggerEmailExecutor,
  // Layer A/B: verhalten sich am Port wie email.selectedEmail — sie geben die
  // geseedete Mail aus. Welche Mails sie seeden, entscheidet das Trigger-Prädikat
  // im Renderer (workflowStore), nicht der Runner.
  'email.replyReceived': triggerEmailExecutor,
  'email.icsReceived': triggerEmailExecutor,

  // Layer E/F: Kern-Text-Trigger — geben den vorformatierten Seed-Text aus. Plugin-Text-Trigger
  // (antares.mahnung, edoobox.newBooking) sind NICHT mehr hier hartverdrahtet: sie kommen aus den
  // Manifesten und werden generisch über den isTrigger-Fallback (resolveExecutor) bedient.
  'tasks.dueSoon': triggerTextExecutor,
  'schedule.timer': triggerTextExecutor,

  'email.analyze': async (node, inputs, opts) => {
    const email = asEmail(inputs.email)
    const model = opts.services.resolveModel(node.config.model as string | undefined, 'task-extraction')
    const prompt = `Analysiere die folgende E-Mail. Gib eine kurze Zusammenfassung (1 Satz) und liste erkannte Aufgaben als Bulletpoints.\n\nBetreff: ${email.subject || ''}\n\n${email.bodyText || ''}`
    const out = await opts.services.ollamaGenerate(prompt, model)
    return {
      outputs: { analysis: { summary: out.slice(0, 400) }, text: email.bodyText || out },
      log: [`Analyse mit ${model}: ${out.split('\n')[0].slice(0, 80)}`]
    }
  },

  'email.composeDraft': async (_node, inputs) => {
    const email = asEmail(inputs.email)
    const text = asText(inputs.text).trim()
    const subject = email.subject ? `Betreff: ${email.subject}\n\n` : ''
    return {
      outputs: { draft: `${subject}${text}`.trim() },
      log: [`E-Mail-Entwurf vorbereitet${email.from ? ` für ${email.from}` : ''}`]
    }
  },

  'project.match': async (_node, inputs, opts) => {
    const email = asEmail(inputs.email)
    const project = await opts.services.matchProject(email)
    return {
      outputs: { project },
      log: [project ? `Projekt erkannt: ${project.folderName}` : 'Kein Projekt erkannt']
    }
  },

  'project.context': async (_node, inputs, opts) => {
    const project = inputs.project as { folderRel?: string; folderName?: string } | null
    if (!project?.folderRel) return { outputs: { context: '', summary: '' }, log: ['Kein Projekt erkannt — kein Kontext.'] }
    const ctx = await opts.services.loadProjectContext(project.folderRel)
    if (isEffectivelyEmptyContext(ctx)) {
      return {
        outputs: { context: '', summary: '' },
        log: [`Projektkontext für „${project.folderName}" ist leer / nicht crystallisiert — Antwort wird ohne Projektwissen erstellt.`]
      }
    }
    return { outputs: { context: ctx, summary: ctx.slice(0, 300) }, log: [`Kontext geladen: ${project.folderName} (${ctx.length} Zeichen)`] }
  },

  'project.rag': async (_node, inputs, opts) => {
    const project = inputs.project as { folderRel?: string; folderName?: string } | null
    const query = asText(inputs.query)
    if (!project?.folderRel) return { outputs: { context: '', text: '' }, log: ['Kein Projekt — kein RAG-Kontext.'] }
    if (!query.trim()) return { outputs: { context: '', text: '' }, log: ['Keine Frage — kein RAG-Kontext.'] }
    try {
      const res = await opts.services.ragRetrieve(project.folderRel, query)
      return {
        outputs: { context: res.contextText, text: res.contextText },
        log: [`Projekt-RAG: ${res.chunkCount} Auszüge aus „${project.folderName}".`]
      }
    } catch (e) {
      // RAG-Fehler (Ollama down / Modell fehlt) darf den Workflow nicht brechen.
      return { outputs: { context: '', text: '' }, log: [`Projekt-RAG übersprungen: ${e instanceof Error ? e.message : 'Fehler'}`] }
    }
  },

  'ollama.summarize': async (node, inputs, opts) => {
    const model = opts.services.resolveModel(node.config.model as string | undefined, 'task-extraction')
    const out = await opts.services.ollamaGenerate(`Fasse den folgenden Text prägnant zusammen:\n\n${asText(inputs.text)}`, model)
    return { outputs: { text: out }, log: [`Zusammengefasst mit ${model}`] }
  },

  'ollama.generateReply': async (node, inputs, opts) => {
    const model = opts.services.resolveModel(node.config.model as string | undefined, 'task-extraction')
    const email = asEmail(inputs.email)
    const context = asText(inputs.context)
    const anrede = (node.config.anrede as string) || 'sie'
    const anredeHinweis =
      anrede === 'du'
        ? 'Sprich die empfangende Person durchgängig mit "du" an (informell, kollegial).'
        : anrede === 'auto'
          ? 'Übernimm die Anrede-Form der eingegangenen Mail: siezt sie, antworte mit "Sie"; duzt sie, mit "du". Im Zweifel die förmliche Höflichkeitsform "Sie".'
          : 'Sprich die empfangende Person durchgängig mit der förmlichen Höflichkeitsform "Sie"/"Ihnen"/"Ihr" an — niemals "du".'
    const regeln = [
      'Stütze dich AUSSCHLIESSLICH auf Fakten aus der E-Mail und dem Projektkontext unten. Erfinde nichts.',
      'Du hast etwaige Anhänge (Bilder, PDFs, Dateien) NICHT gesehen. Behaupte nicht, Material geprüft, bewertet oder freigegeben zu haben.',
      'Triff KEINE Zusagen, Freigaben oder Qualitätsurteile, die du nicht belegen kannst. Bittet die Mail um Abnahme/Feedback zu nicht einsehbarem Material, bleib neutral und stelle die Prüfung in Aussicht (z.B. "ich sehe mir die Entwürfe an und melde mich kurz").',
      'Ist kein Projektkontext vorhanden, schreibe keine projektspezifischen Details.'
    ].map(r => `- ${r}`).join('\n')
    const prompt = `Entwirf eine freundliche, professionelle Antwort auf die folgende E-Mail.\n${anredeHinweis}\n\nWichtige Regeln:\n${regeln}\n\nLeichte Formatierung ist erlaubt (Markdown: **fett**, *kursiv*, Listen mit "• "). KEINE "Betreff:"-Zeile, beginne direkt mit der Anrede. Gib NUR den Antworttext zurück.\n\n=== E-Mail ===\nBetreff: ${email.subject || ''}\n${email.bodyText || ''}\n\n=== Projektkontext ===\n${context || '(keiner)'}`
    const out = await opts.services.ollamaGenerate(prompt, model)
    return { outputs: { draft: out }, log: [`Antwortentwurf mit ${model} erzeugt (Anrede: ${anrede})`] }
  },

  'ollama.extractTasks': async (node, inputs, opts) => {
    const model = opts.services.resolveModel(node.config.model as string | undefined, 'task-extraction')
    const out = await opts.services.ollamaGenerate(
      `Extrahiere konkrete, umsetzbare Aufgaben aus dem folgenden Text. Gib NUR eine Liste, eine Aufgabe pro Zeile. Keine Einleitung, keine Überschrift. Wenn keine Aufgaben enthalten sind, antworte mit einer leeren Zeile.\n\n${asText(inputs.text)}`,
      model
    )
    // Robust normalisieren: beliebiges Format (•, *, 1., - [ ], Klartext) → "- [ ] …".
    const tasks = out
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean)
      .filter(l => !/[:：]\s*$/.test(l))                 // Header-/Einleitungszeilen ("Aufgaben:") weg
      .map(l =>
        l
          .replace(/^[-*•▪‣·]\s*/, '')                   // führendes Bullet
          .replace(/^\[[ xX]\]\s*/, '')                  // führende Checkbox
          .replace(/^\d+[.)]\s*/, '')                    // führende Nummerierung
          .trim()
      )
      .filter(Boolean)
      .map(l => `- [ ] ${l}`)
    return {
      outputs: { tasks, text: tasks.join('\n') },
      log: [`${tasks.length} Aufgabe(n) extrahiert (${model})`]
    }
  },

  'ollama.classify': async (node, inputs, opts) => {
    const model = opts.services.resolveModel(node.config.model as string | undefined, 'task-extraction')
    const out = await opts.services.ollamaGenerate(`Klassifiziere den folgenden Text in eine Kategorie. Antworte knapp.\n\n${asText(inputs.text)}`, model)
    return { outputs: { result: { raw: out } }, log: [`Klassifiziert mit ${model}`] }
  },

  'ollama.transformText': async (node, inputs, opts) => {
    const model = opts.services.resolveModel(node.config.model as string | undefined, 'task-extraction')
    const userPrompt = (node.config.prompt as string) || 'Bearbeite den folgenden Text.'
    const out = await opts.services.ollamaGenerate(`${userPrompt}\n\n${asText(inputs.text)}`, model)
    return { outputs: { text: out }, log: [`Text transformiert mit ${model}`] }
  },

  'notes.create': async (node, inputs, opts) => {
    const folder = (node.config.folder as string) || '000 - 📥 inbox/010 - 📥 Notes'
    const title = (node.config.title as string) || 'Workflow-Notiz'
    const rel = await opts.services.createNote(folder, title, asText(inputs.text))
    return { outputs: { note: rel }, log: [`Notiz angelegt: ${rel}`] }
  },

  'notes.append': async (_node, inputs, opts) => {
    const noteRel = asNoteRel(inputs.note)
    const rel = await opts.services.appendNote(noteRel, asText(inputs.text))
    return { outputs: { note: rel }, log: [`An Notiz angehängt: ${rel}`] }
  },

  // Abnehmer für den `task`-Ausgang: hängt die Aufgaben als Markdown-Checkboxen
  // an eine bestehende Notiz an (delegiert an die eine Schreibgrenze appendNote).
  'tasks.writeToNote': async (_node, inputs, opts) => {
    const noteRel = asNoteRel(inputs.note)
    const raw = inputs.tasks
    const list = Array.isArray(raw)
      ? raw.map(t => String(t).trim()).filter(Boolean)
      : asText(raw).split('\n').map(s => s.trim()).filter(Boolean)
    // extractTasks liefert bereits „- [ ] …"; fremde Quellen ggf. zur Checkbox normalisieren.
    const lines = list.map(l => (/^[-*]\s*\[[ xX]\]/.test(l) ? l : `- [ ] ${l.replace(/^[-*]\s+/, '')}`))
    const rel = await opts.services.appendNote(noteRel, lines.join('\n'))
    return { outputs: { note: rel }, log: [`${lines.length} Aufgabe(n) an Notiz angehängt: ${rel}`] }
  },

  'notes.search': async (_node, inputs, opts) => {
    const results = await opts.services.searchNotes(asText(inputs.text))
    return { outputs: { notes: results }, log: [`${results.length} Treffer`] }
  },

  'human.reviewText': async (_node, inputs, opts) => {
    const text = asText(inputs.text)
    if (isEventTrigger(opts.trigger)) {
      const taskRel = await opts.services.createTask(`- [ ] 📝 Prüfen: ${text.slice(0, 80)}`)
      return { outputs: { approval: 'pending' }, log: ['Aufgabe zur Prüfung angelegt'], handoff: { kind: 'task', payload: { taskRel, text } } }
    }
    return { outputs: { approval: 'pending' }, log: ['Wartet auf Prüfung durch den Menschen'], handoff: { kind: 'note', payload: { text } } }
  },

  'human.reviewDraftReply': async (_node, inputs, opts) => {
    const draft = asText(inputs.draft)
    const recipient = seededRecipient(opts, inputs)
    if (isEventTrigger(opts.trigger)) {
      const suffix = recipient.to ? ` an ${recipient.to}` : ''
      const taskRel = await opts.services.createTask(`- [ ] ✉️ Entwurf prüfen und senden${suffix}`)
      return {
        outputs: { approval: 'pending' },
        log: ['Aufgabe „Entwurf prüfen" angelegt'],
        handoff: { kind: 'task', payload: { taskRel, draft, ...recipient } }
      }
    }
    return {
      outputs: { approval: 'pending' },
      log: ['Entwurf bereit zur Prüfung im Compose-Fenster'],
      handoff: { kind: 'compose', payload: { draft, emailId: opts.seed?.email?.id, ...recipient } }
    }
  }
}

/**
 * Löst den Executor einer Action auf. Explizit gemappte Kern-Actions gewinnen; jede andere
 * REGISTRIERTE Trigger-Action (z.B. ein plugin-beigesteuerter Text-Trigger wie antares.mahnung)
 * fällt generisch auf den Text-Trigger-Executor zurück — der Runner kennt keinen Plugin-Namen.
 * Eine Action, die weder gemappt noch ein registrierter Trigger ist (z.B. nach Plugin-Löschung),
 * liefert undefined → der Schritt wird sauber übersprungen.
 */
export function resolveExecutor(actionId: string): Executor | undefined {
  const explicit = EXECUTORS[actionId]
  if (explicit) return explicit
  return getActionById(actionId)?.isTrigger ? triggerTextExecutor : undefined
}

export async function runWorkflow(workflow: Workflow, opts: RunOptions): Promise<WorkflowRun> {
  const startedAt = nowIso()
  // Seed normalisieren: seedEmail (Back-Compat) → seed.email. Executoren lesen nur opts.seed.
  if (!opts.seed && opts.seedEmail) opts.seed = { email: opts.seedEmail }
  const order = topoSort(workflow)
  const baseRun: WorkflowRun = {
    id: genId('run'),
    workflowId: workflow.id,
    mode: opts.mode,
    trigger: opts.trigger,
    status: 'running',
    startedAt,
    steps: []
  }

  if (order === null) {
    return { ...baseRun, status: 'failed', finishedAt: nowIso(), error: 'Zyklus — keine ausführbare Reihenfolge.' }
  }

  const nodeById = new Map(workflow.nodes.map(n => [n.id, n]))
  const outputs: NodeOutputs = new Map()
  const steps: WorkflowRunStep[] = []
  let handoff: WorkflowHandoff | undefined

  for (const nodeId of order) {
    const node = nodeById.get(nodeId)
    if (!node) continue
    const action = getActionById(node.actionId)
    const step: WorkflowRunStep = {
      nodeId, actionId: node.actionId, label: action?.label || node.actionId,
      status: 'running', startedAt: nowIso(), log: []
    }

    if (!action) {
      step.status = 'failed'; step.error = 'Unbekannte Action'; step.finishedAt = nowIso(); steps.push(step)
      return { ...baseRun, status: 'failed', finishedAt: nowIso(), steps, error: step.error }
    }

    // Modul aktiv?
    if (!opts.services.isModuleActive(action.moduleId)) {
      step.status = 'failed'; step.error = `Modul „${action.moduleId}" ist deaktiviert.`; step.finishedAt = nowIso(); steps.push(step)
      return { ...baseRun, status: 'failed', finishedAt: nowIso(), steps, error: step.error }
    }

    // LLM-Guards. Der Cloud-Guard hing früher AUSSCHLIESSLICH an `hardLockModule` —
    // eine künftige LLM-Action ohne hardLockModule hätte beide Guards still umgangen.
    // Daher entkoppelt: sobald die Action ein Modell auflöst (hardLockModule ODER ein
    // konfiguriertes `model`-Feld), läuft der Cloud-Guard. Der Hard-Lock (Prompt-
    // Injection-Schutz) bleibt korrekt auf untrusted-Input-Actions beschränkt.
    const usesModel = Boolean(action.hardLockModule) || node.config.model != null
    if (usesModel) {
      const model = opts.services.resolveModel(node.config.model as string | undefined, action.hardLockModule)
      // Hard-Lock nur für LLM-Aktionen mit untrusted Input (hardLockModule benannt).
      if (action.hardLockModule && opts.services.isHardLocked(model, action.hardLockModule)) {
        step.status = 'failed'
        step.error = `Modell „${model}" ist für ${action.hardLockModule} gesperrt (Prompt-Injection-Schutz).`
        step.finishedAt = nowIso(); steps.push(step)
        return { ...baseRun, status: 'failed', finishedAt: nowIso(), steps, error: step.error }
      }
      // Privacy-Hard-Lock: gehostete Ollama-Cloud-Modelle (`:cloud`/`-cloud`) leiten die
      // Inferenz an Ollama-Server weiter → personenbezogene Mail-/Buchungs-/Mahnungs-
      // Inhalte würden den Rechner verlassen. Der Block hängt am Modell-TAG, nicht am
      // Endpunkt: lokale UND selbst-gehostete (On-Prem/Edge) Modelle laufen normal weiter.
      // Setzt die harte Regel „keine personenbezogenen Daten in die Cloud" im Code durch
      // (unabhängig vom Verdict der Matrix, der Cloud-Modelle nur als 'yellow' warnt).
      if (opts.services.isCloudModel(model)) {
        step.status = 'failed'
        step.error = `Modell „${model}" ist ein Ollama-Cloud-Modell und für Workflow-Schritte mit personenbezogenen Inhalten gesperrt — die Inhalte würden den Rechner verlassen. Bitte ein lokales oder selbst-gehostetes Modell wählen.`
        step.finishedAt = nowIso(); steps.push(step)
        return { ...baseRun, status: 'failed', finishedAt: nowIso(), steps, error: step.error }
      }
    }

    const executor = resolveExecutor(node.actionId)
    if (!executor) {
      step.status = 'skipped'; step.log.push('Keine Implementierung (Phase 2).'); step.finishedAt = nowIso(); steps.push(step)
      outputs.set(nodeId, {})
      continue
    }

    try {
      const inputs = gatherInputs(node, workflow, outputs)
      const result = await executor(node, inputs, opts)
      outputs.set(nodeId, result.outputs)
      step.outputs = result.outputs
      step.log = result.log
      step.status = 'success'
      step.finishedAt = nowIso()
      if (result.handoff) handoff = result.handoff
      steps.push(step)
    } catch (e) {
      step.status = 'failed'
      step.error = e instanceof Error ? e.message : String(e)
      step.finishedAt = nowIso()
      steps.push(step)
      return { ...baseRun, status: 'failed', finishedAt: nowIso(), steps, error: step.error }
    }
  }

  return { ...baseRun, status: 'success', finishedAt: nowIso(), steps, handoff }
}
