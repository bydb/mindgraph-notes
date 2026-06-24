// SchedulerService — zeitgesteuerte Ausführung von Read-Only-Aktionen.
//
// Design-Prinzip: der Agent *beobachtet und informiert*, der Mensch
// *entscheidet und handelt*. Keine Schreib-Aktionen, keine autonomen
// Tools — nur Lesefunktionen, die Ergebnisse an Telegram senden.
//
// Der Scheduler läuft im Main Process, solange die App offen ist.
// Er ist kein Daemon — wenn die App geschlossen wird, stoppt er.

import { promises as fs } from 'fs'
import path from 'path'

export type ScheduleAction = 'briefing' | 'overdue-check'

export interface ScheduleRule {
  id: string
  enabled: boolean
  action: ScheduleAction
  hour: number       // 0-23
  minute: number     // 0-59
  weekdays: number[] // 0 (So) - 6 (Sa), leer = jeden Tag
  label?: string      // optionale Bezeichnung
}

export interface ScheduleConfig {
  // Master-Schalter: persistierte Nutzer-Absicht „Planung aktiv". Wird beim
  // Bot-Start wieder angewandt (Resume nach App-Neustart) und gated, ob ein
  // bloßes Speichern Timer scharf schaltet.
  enabled: boolean
  rules: ScheduleRule[]
}

export interface SchedulerDeps {
  getVaultPath: () => string | null
  getExcludedFolders: () => string[]
  getOllamaModel: () => string
  getBriefingIncludeEmails: () => boolean
  getBriefingIncludeOverdue: () => boolean
  getBrainFolderPath: () => string
  /** Sendet eine Nachricht an alle erlaubten Telegram-Chats. */
  sendTelegramMessage: (text: string) => Promise<void>
  /** Generiert das Morning-Briefing (aus briefing.ts). */
  generateBriefing: (ctx: {
    vaultPath: string
    excludedFolders?: string[]
    ollamaModel?: string
    brainFolderPath?: string
    includeEmails?: boolean
    includeOverdue?: boolean
  }) => Promise<string>
  /** Lädt überfällige Tasks (aus vaultQueries). */
  loadOverdueTasks: (opts: { vaultPath: string; excludedFolders?: string[] }) => Promise<Array<{ task: { text: string }; noteTitle: string }>>
}

const DEFAULT_CONFIG: ScheduleConfig = { enabled: false, rules: [] }

function getConfigPath(userDataPath: string): string {
  return path.join(userDataPath, 'scheduler-config.json')
}

export async function loadScheduleConfig(userDataPath: string): Promise<ScheduleConfig> {
  try {
    const raw = await fs.readFile(getConfigPath(userDataPath), 'utf-8')
    const parsed = JSON.parse(raw) as Partial<ScheduleConfig>
    if (Array.isArray(parsed.rules)) {
      return { enabled: parsed.enabled === true, rules: parsed.rules.filter(isValidRule) }
    }
  } catch {
    // Datei existiert noch nicht
  }
  return { ...DEFAULT_CONFIG }
}

export async function saveScheduleConfig(userDataPath: string, config: ScheduleConfig): Promise<void> {
  await fs.writeFile(getConfigPath(userDataPath), JSON.stringify(config, null, 2), 'utf-8')
}

function isValidRule(r: unknown): r is ScheduleRule {
  if (!r || typeof r !== 'object') return false
  const obj = r as Record<string, unknown>
  return typeof obj.id === 'string' &&
    typeof obj.enabled === 'boolean' &&
    (obj.action === 'briefing' || obj.action === 'overdue-check') &&
    typeof obj.hour === 'number' &&
    typeof obj.minute === 'number' &&
    Array.isArray(obj.weekdays)
}

let idCounter = 0
export function generateRuleId(): string {
  idCounter += 1
  return `sched_${Date.now().toString(36)}_${idCounter}`
}

/**
 * Berechnet die Millisekunden bis zur nächsten Ausführung einer Regel.
 * Gibt null zurück, wenn die Regel deaktiviert ist oder nie feuern würde.
 */
export function msUntilNextRun(rule: ScheduleRule, now: Date = new Date()): number | null {
  if (!rule.enabled) return null

  const target = new Date(now)
  target.setHours(rule.hour, rule.minute, 0, 0)

  // Wenn die Zeit heute schon vorbei ist, auf morgen setzen
  if (target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 1)
  }

  // Wenn weekdays gesetzt ist, den nächsten passenden Tag suchen
  if (rule.weekdays.length > 0) {
    let attempts = 0
    while (!rule.weekdays.includes(target.getDay()) && attempts < 8) {
      target.setDate(target.getDate() + 1)
      attempts += 1
    }
    if (attempts >= 8) return null // kein passender Tag in einer Woche
  }

  return target.getTime() - now.getTime()
}

export class SchedulerService {
  private timers = new Map<string, NodeJS.Timeout>()
  private config: ScheduleConfig = { enabled: false, rules: [] }
  private deps: SchedulerDeps
  private userDataPath: string
  private running = false

  constructor(deps: SchedulerDeps, userDataPath: string) {
    this.deps = deps
    this.userDataPath = userDataPath
  }

  isRunning(): boolean {
    return this.running
  }

  // Master-Schalter AN: persistierte Absicht (enabled) anwenden. Wird beim
  // Bot-Start aufgerufen → Resume nach App-Neustart. Idempotent.
  async start(): Promise<void> {
    this.config = await loadScheduleConfig(this.userDataPath)
    if (!this.config.enabled) {
      this.config.enabled = true
      await saveScheduleConfig(this.userDataPath, this.config)
    }
    this.applyRuntime()
    console.log(`[Scheduler] started with ${this.config.rules.length} rule(s)`)
  }

  // Nutzer schaltet aus: enabled=false persistieren + Timer abbauen.
  async disable(): Promise<void> {
    if (this.config.enabled) {
      this.config.enabled = false
      await saveScheduleConfig(this.userDataPath, this.config)
    }
    this.applyRuntime()
    console.log('[Scheduler] disabled')
  }

  // Reiner Laufzeit-Stopp (App-Shutdown / Bot-Stopp): Timer abbauen, KEINE
  // Persistenz. enabled bleibt unangetastet, damit der nächste Bot-Start
  // wieder aufsetzt.
  stop(): void {
    this.running = false
    for (const [, timer] of this.timers) {
      clearTimeout(timer)
    }
    this.timers.clear()
    console.log('[Scheduler] stopped (runtime)')
  }

  getConfig(): ScheduleConfig {
    return this.config
  }

  // Config speichern und Laufzeit an den Master-Schalter angleichen. Armiert
  // NUR, wenn enabled — ein bloßes Speichern von Regeln legt sonst Timer an,
  // obwohl der Schalter aus ist (sichtbar im UI als „aus").
  async setConfig(config: ScheduleConfig): Promise<void> {
    this.config = config
    await saveScheduleConfig(this.userDataPath, config)
    this.applyRuntime()
  }

  // Einzige Reconcile-Stelle: Timer-Zustand an this.config.enabled angleichen.
  private applyRuntime(): void {
    for (const [, timer] of this.timers) {
      clearTimeout(timer)
    }
    this.timers.clear()
    this.running = this.config.enabled
    if (!this.config.enabled) return
    for (const rule of this.config.rules) {
      this.scheduleRule(rule)
    }
  }

  private scheduleRule(rule: ScheduleRule): void {
    const ms = msUntilNextRun(rule)
    if (ms === null) {
      console.log(`[Scheduler] rule ${rule.id} (${rule.action}) skipped — disabled or no valid day`)
      return
    }

    console.log(`[Scheduler] rule ${rule.id} (${rule.action}) scheduled in ${Math.round(ms / 1000 / 60)} min`)

    const timer = setTimeout(async () => {
      if (!this.running) return
      await this.executeRule(rule)
      // Nach Ausführung: nächste Ausführung planen (wiederkehrend) — aber nur,
      // solange der Scheduler läuft (sonst armiert ein in-flight Timer nach
      // stop()/disable() wieder neu).
      if (this.running) this.scheduleRule(rule)
    }, ms)

    this.timers.set(rule.id, timer)
  }

  private async executeRule(rule: ScheduleRule): Promise<void> {
    console.log(`[Scheduler] executing rule ${rule.id} (${rule.action}) at ${new Date().toISOString()}`)

    const vaultPath = this.deps.getVaultPath()
    if (!vaultPath) {
      console.warn(`[Scheduler] rule ${rule.id} skipped — no vault`)
      return
    }

    try {
      switch (rule.action) {
        case 'briefing':
          await this.executeBriefing(vaultPath)
          break
        case 'overdue-check':
          await this.executeOverdueCheck(vaultPath)
          break
      }
    } catch (err) {
      console.error(`[Scheduler] rule ${rule.id} failed:`, err)
      try {
        await this.deps.sendTelegramMessage(`❌ Geplanter Task „${rule.label || rule.action}" fehlgeschlagen: ${err instanceof Error ? err.message : 'unbekannt'}`)
      } catch {
        // Wenn selbst die Fehlermeldung nicht geht — still schweigen
      }
    }
  }

  private async executeBriefing(vaultPath: string): Promise<void> {
    const briefing = await this.deps.generateBriefing({
      vaultPath,
      excludedFolders: this.deps.getExcludedFolders(),
      ollamaModel: this.deps.getOllamaModel(),
      brainFolderPath: this.deps.getBrainFolderPath(),
      includeEmails: this.deps.getBriefingIncludeEmails(),
      includeOverdue: this.deps.getBriefingIncludeOverdue()
    })
    await this.deps.sendTelegramMessage(briefing || '_Leeres Briefing._')
  }

  private async executeOverdueCheck(vaultPath: string): Promise<void> {
    const overdue = await this.deps.loadOverdueTasks({
      vaultPath,
      excludedFolders: this.deps.getExcludedFolders()
    })
    if (overdue.length === 0) return // keine Nachricht bei nichts Überfälligem

    const lines = overdue.slice(0, 10).map(h => `- ${h.task.text} (in „${h.noteTitle}")`)
    const more = overdue.length > 10 ? `\n\n_… und ${overdue.length - 10} weitere._` : ''
    const text = `⚠️ *Überfällige Tasks* (${overdue.length}):\n\n${lines.join('\n')}${more}`
    await this.deps.sendTelegramMessage(text)
  }
}
