// Eingefrorene Seitenauszüge fertiger Webantworten im Petrol-Chat (Stufe 2, Schritt B,
// docs/codex-collab/chat-recherche-zum-agenten.md F02–F05).
//
// Eine Nachfrage „Hiermit weiterfragen“ darf sich nur auf Auszüge stützen, die die App SELBST
// abgerufen hat — nie auf Quellen, die der Renderer mitschickt (F02). Deshalb hält der Main die
// Auszüge unter einer opaken Kennung, gebunden an Absender (WebContents) und Gesprächsbereich,
// mit Ablaufzeit und Obergrenze. Der Renderer kennt nur die Kennung.

import { randomBytes } from 'crypto'
import type { WebFetchFailure, WebSource } from '../../shared/webChat'

export interface WebSnapshot {
  id: string
  senderId: number
  scopeId: string
  /** Exakt die Auszüge, die das Modell beim Weblauf sah (F19) — nie neu gekürzt. */
  sources: WebSource[]
  /**
   * Nur im Browser lesbare Seiten derselben Suche (Codex F19): reisen mit, damit eine Nachfrage
   * nicht „gibt es nicht“ antwortet und der Öffnen-Knopf bleibt. Nie zitierfähige Quelle.
   */
  browserOnly: WebFetchFailure[]
  createdAt: number
}

/** Höchstens so viele nicht lesbare Seiten je Snapshot — wie im Hinweisblock des Systemtexts. */
export const WEB_SNAPSHOT_BROWSER_ONLY_MAX = 3

export const WEB_SNAPSHOT_TTL_MS = 3 * 60 * 60 * 1000
export const WEB_SNAPSHOT_MAX_PER_SENDER = 30
export const WEB_SNAPSHOT_SCOPE_MAX = 200

export class WebSnapshotStore {
  private readonly items = new Map<string, WebSnapshot>()

  constructor(private readonly now: () => number = Date.now, private readonly newId: () => string = () => randomBytes(16).toString('hex')) {}

  /** Legt einen Snapshot an; die ältesten desselben Absenders fallen über der Obergrenze raus. */
  put(senderId: number, scopeId: string, sources: readonly WebSource[], failures: readonly WebFetchFailure[] = []): string {
    this.prune()
    const id = this.newId()
    const browserOnly = failures
      .filter(f => f.reason === 'browser-only' && !!f.url && /^https?:\/\//i.test(f.url))
      .slice(0, WEB_SNAPSHOT_BROWSER_ONLY_MAX)
      .map(f => ({ host: f.host, reason: f.reason, url: f.url }))
    this.items.set(id, { id, senderId, scopeId, sources: sources.map(s => ({ ...s })), browserOnly, createdAt: this.now() })
    const own = [...this.items.values()].filter(s => s.senderId === senderId).sort((a, b) => a.createdAt - b.createdAt)
    for (const old of own.slice(0, Math.max(0, own.length - WEB_SNAPSHOT_MAX_PER_SENDER))) this.items.delete(old.id)
    return id
  }

  /** Nur für denselben Absender UND denselben Gesprächsbereich, nur solange nicht abgelaufen. */
  get(senderId: number, scopeId: string, id: string): WebSnapshot | null {
    this.prune()
    const s = this.items.get(id)
    if (!s || s.senderId !== senderId || s.scopeId !== scopeId) return null
    return { ...s, sources: s.sources.map(x => ({ ...x })), browserOnly: s.browserOnly.map(x => ({ ...x })) }
  }

  /**
   * Welche dieser Kennungen sind für Absender und Bereich noch abrufbar? Snapshots verfallen nach
   * drei Stunden oder fallen über der Obergrenze heraus — der Renderer sieht das nicht von selbst
   * und bot „Hiermit weiterfragen“ weiter an (Codex F02, chat-verlauf-notizen-bilder.md).
   */
  alive(senderId: number, scopeId: string, ids: readonly string[]): string[] {
    this.prune()
    return ids.filter(id => {
      const s = this.items.get(id)
      return !!s && s.senderId === senderId && s.scopeId === scopeId
    })
  }

  /** „Neues Gespräch“ / Tab schließen: alle Snapshots dieses Bereichs weg. */
  dropScope(senderId: number, scopeId: string): void {
    for (const s of [...this.items.values()]) if (s.senderId === senderId && s.scopeId === scopeId) this.items.delete(s.id)
  }

  /** Fenster zerstört: alles dieses Absenders weg. */
  dropSender(senderId: number): void {
    for (const s of [...this.items.values()]) if (s.senderId === senderId) this.items.delete(s.id)
  }

  get size(): number {
    return this.items.size
  }

  private prune(): void {
    const limit = this.now() - WEB_SNAPSHOT_TTL_MS
    for (const s of [...this.items.values()]) if (s.createdAt < limit) this.items.delete(s.id)
  }
}

/** Gesprächsbereich aus dem Renderer: kurze, druckbare Kennung, sonst ungültig. */
export function sanitizeScopeId(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  if (!t || t.length > WEB_SNAPSHOT_SCOPE_MAX || !/^[\w.:-]+$/.test(t)) return null
  return t
}

/** Snapshot-Kennung aus dem Renderer: genau 32 Hexzeichen. */
export function sanitizeSnapshotId(v: unknown): string | null {
  return typeof v === 'string' && /^[0-9a-f]{32}$/.test(v) ? v : null
}
