// Server-Einträge für externe Werkzeuge (MCP) — NUR im Main, unter userData, nicht im Vault und
// nicht im Sync (E4). Geheime Kopfzeilen verschlüsselt je Server. Freigaben gelten nur zusammen
// mit der Bindung (E16′) und den Prüfsummen der ausgeführten Dateien (E22).
//
// Der Renderer darf Einträge VORSCHLAGEN; gespeichert wird erst nach einem nativen Dialog im
// Main, der Programm und Argumente bzw. Adresse im Wortlaut zeigt (siehe ipc.ts). Diese Datei
// prüft nur und speichert — sie fragt nicht.
import { promises as fs, constants as fsConstants } from 'fs'
import * as path from 'path'
import { createHash, randomBytes } from 'crypto'
import { homedir } from 'os'
import { resolveLoginConfig } from './microsoftLogin'
import { assertOAuthSpec, type McpOAuthSpec } from '../../shared/mcpOAuth'
import {
  type McpServerConfig, type McpStdioSpec, type McpHttpSpec, bindingMaterial, isValidServerId,
  serverIdFromLabel, missingBusinessCentralHeaders, toolDefinitionMaterial
} from '../../shared/mcp'

export interface SecretBox {
  available(): boolean
  encrypt(plain: string): Buffer
  decrypt(data: Buffer): string
}

const SERVERS_FILE = 'mcp-servers.json'

/** Programme, die zur Laufzeit etwas nachladen oder beliebige Befehle ausführen (E22). */
const FORBIDDEN_COMMANDS = new Set([
  'npx', 'npm', 'pnpm', 'pnpx', 'yarn', 'bunx', 'uvx', 'uv', 'pipx', 'pip', 'pip3', 'corepack',
  'sh', 'bash', 'zsh', 'fish', 'dash', 'ksh', 'csh', 'tcsh', 'env', 'sudo', 'doas', 'su',
  'open', 'osascript', 'xargs', 'nohup', 'exec', 'sandbox-exec', 'docker', 'podman'
])
/** Sperrdateien, deren Prüfsumme Änderungen an Abhängigkeiten sichtbar macht (E22). */
const LOCK_FILES = ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lockb', 'uv.lock', 'poetry.lock', 'Pipfile.lock', 'requirements.txt']

export function sha256(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex')
}

export function toolDefinitionHash(tool: { name: string; description?: string; inputSchema?: unknown }): string {
  return sha256(toolDefinitionMaterial(tool))
}

async function fileSha256(p: string): Promise<string> {
  return sha256(await fs.readFile(p))
}

/** Absoluter, existierender, realer Pfad — sonst Fehler mit Klartext. */
async function realExisting(p: string, what: string, kind: 'file' | 'dir' | 'any' = 'any'): Promise<string> {
  if (!p || !path.isAbsolute(p)) throw new Error(`${what}: bitte einen vollständigen Pfad angeben (beginnt mit /).`)
  if (/[\n\r\0]/.test(p)) throw new Error(`${what}: unzulässige Zeichen im Pfad.`)
  let real: string
  try { real = await fs.realpath(p) } catch { throw new Error(`${what}: ${p} gibt es nicht.`) }
  const st = await fs.stat(real)
  if (kind === 'file' && !st.isFile()) throw new Error(`${what}: ${p} ist keine Datei.`)
  if (kind === 'dir' && !st.isDirectory()) throw new Error(`${what}: ${p} ist kein Ordner.`)
  return real
}

function assertNotTooBroad(dir: string, what: string): void {
  const home = homedir()
  if (dir === '/' || dir === home || dir === path.dirname(home) || dir === '/Users' || dir === '/Volumes') {
    throw new Error(`${what}: ${dir} ist zu weit gefasst — wählen Sie einen eigenen Ordner.`)
  }
}

export interface StdioInput {
  label: string
  command: string
  script?: string
  args?: string[]
  extraReadPaths?: string[]
  vaultRead?: boolean
  network?: boolean
  fullAccess?: boolean
}

export interface HttpInput {
  label: string
  url: string
  headers?: Record<string, string>
  /** Werte geheimer Kopfzeilen; Schlüssel = Kopfzeilenname. Leere Werte = nicht ändern. */
  secretHeaders?: Record<string, string>
  profile?: 'business-central'
  approvedPrivateOrigin?: string
  /** Anmeldung über Microsoft statt geheimer Kopfzeile (Abschnitt 5). */
  microsoft?: { clientId?: string; tenant?: string }
  /** OAuth-Anmeldung (Abschnitt 6). NUR vom Main gesetzt (Katalog oder geprüfte Erkennung), nie vom Renderer. */
  oauth?: McpOAuthSpec
}

const HEADER_NAME = /^[A-Za-z0-9-]{1,64}$/
const RESERVED_HEADERS = new Set(['host', 'content-length', 'content-type', 'accept', 'connection', 'mcp-session-id', 'mcp-protocol-version', 'transfer-encoding', 'user-agent', 'accept-encoding'])

/** Prüft und normalisiert einen stdio-Vorschlag. Liefert Spec + Prüfsummen. */
export async function normalizeStdioInput(input: StdioInput): Promise<{ spec: McpStdioSpec; fileHashes: Record<string, string> }> {
  const command = await realExisting(input.command, 'Programm', 'file')
  const base = path.basename(command).toLowerCase()
  if (FORBIDDEN_COMMANDS.has(base) || FORBIDDEN_COMMANDS.has(path.basename(input.command).toLowerCase())) {
    throw new Error(`${path.basename(input.command)} lädt zur Laufzeit Code nach oder führt beliebige Befehle aus und ist deshalb nicht erlaubt. Tragen Sie das Programm selbst ein (z.B. den Pfad zu node und zum Skript).`)
  }
  try { await fs.access(command, fsConstants.X_OK) } catch { throw new Error(`Programm: ${command} ist nicht ausführbar.`) }
  const script = input.script ? await realExisting(input.script, 'Skript', 'file') : undefined
  const programDir = path.dirname(script ?? command)
  assertNotTooBroad(programDir, 'Programmordner')
  const args = (input.args ?? []).map(a => String(a))
  if (args.some(a => /[\0\n\r]/.test(a)) || args.length > 32) throw new Error('Argumente: höchstens 32, ohne Zeilenumbrüche.')
  const extraReadPaths: string[] = []
  for (const p of input.extraReadPaths ?? []) {
    const real = await realExisting(p, 'Zusätzlicher Lesepfad')
    assertNotTooBroad(real, 'Zusätzlicher Lesepfad')
    extraReadPaths.push(real)
  }
  const spec: McpStdioSpec = {
    command, ...(script ? { script } : {}), args, programDir, extraReadPaths,
    vaultRead: input.vaultRead === true, network: input.network === true, fullAccess: input.fullAccess === true
  }
  return { spec, fileHashes: await computeFileHashes(spec) }
}

/** Prüfsummen von Programm, Skript und Sperrdatei (E22). */
export async function computeFileHashes(spec: McpStdioSpec): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  out[spec.command] = await fileSha256(spec.command)
  if (spec.script) out[spec.script] = await fileSha256(spec.script)
  for (const name of LOCK_FILES) {
    const p = path.join(spec.programDir, name)
    try { out[p] = await fileSha256(p); break } catch { /* nächste */ }
  }
  return out
}

/** Dateien, deren Prüfsumme nicht mehr stimmt (E22). Leere Liste = alles wie freigegeben. */
export async function changedFiles(cfg: McpServerConfig): Promise<string[]> {
  if (cfg.transport !== 'stdio' || !cfg.stdio) return []
  const now = await computeFileHashes(cfg.stdio).catch(() => ({} as Record<string, string>))
  const stored = cfg.fileHashes ?? {}
  const keys = new Set([...Object.keys(stored), ...Object.keys(now)])
  return [...keys].filter(k => stored[k] !== now[k])
}

/** Prüft und normalisiert einen HTTP-Vorschlag (ohne Netz). */
export function normalizeHttpInput(input: HttpInput): McpHttpSpec {
  let url: URL
  try { url = new URL(input.url.trim()) } catch { throw new Error('Adresse: keine gültige URL.') }
  if (url.username || url.password) throw new Error('Adresse: Zugangsdaten gehören in geheime Kopfzeilen, nicht in die URL.')
  const approved = input.approvedPrivateOrigin && input.approvedPrivateOrigin === url.origin ? input.approvedPrivateOrigin : undefined
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && approved)) throw new Error('Adresse: nur https (http nur für eine freigegebene Adresse im eigenen Netz).')
  url.hash = ''
  const headers: Record<string, string> = {}
  for (const [k, v] of Object.entries(input.headers ?? {})) {
    const name = k.trim()
    if (!name) continue
    if (!HEADER_NAME.test(name) || RESERVED_HEADERS.has(name.toLowerCase())) throw new Error(`Kopfzeile „${name}“ ist nicht erlaubt.`)
    const value = String(v).trim()
    if (/[\r\n\0]/.test(value)) throw new Error(`Kopfzeile „${name}“: unzulässige Zeichen.`)
    headers[name] = value
  }
  const secretHeaderNames = Object.keys(input.secretHeaders ?? {}).map(s => s.trim()).filter(Boolean)
  for (const name of secretHeaderNames) {
    if (!HEADER_NAME.test(name) || RESERVED_HEADERS.has(name.toLowerCase())) throw new Error(`Kopfzeile „${name}“ ist nicht erlaubt.`)
    if (name in headers) throw new Error(`Kopfzeile „${name}“ ist doppelt eingetragen.`)
  }
  let microsoft: McpHttpSpec['microsoft']
  if (input.microsoft) {
    const resolved = resolveLoginConfig(input.microsoft)
    if (secretHeaderNames.some(n => n.toLowerCase() === 'authorization')) throw new Error('Mit Microsoft-Anmeldung gibt es keine eigene Authorization-Kopfzeile — die Marke setzt MindGraph.')
    microsoft = { clientId: resolved.clientId, tenant: resolved.tenant }
  }
  let oauth: McpOAuthSpec | undefined
  if (input.oauth) {
    if (microsoft) throw new Error('Ein Server meldet sich entweder über Microsoft oder über OAuth an, nicht beides.')
    if (secretHeaderNames.some(n => n.toLowerCase() === 'authorization')) throw new Error('Mit OAuth-Anmeldung gibt es keine eigene Authorization-Kopfzeile — die Marke setzt MindGraph.')
    if (approved) throw new Error('OAuth-Anmeldung gibt es nur für https-Adressen im Internet.')
    const spec: McpOAuthSpec = { endpoints: { ...input.oauth.endpoints }, resource: url.toString(), scopes: [...input.oauth.scopes], ...(input.oauth.loginId ? { loginId: input.oauth.loginId } : {}) }
    assertOAuthSpec(url.toString(), spec)
    oauth = spec
  }
  if (input.profile === 'business-central') {
    const missing = missingBusinessCentralHeaders(headers)
    if (missing.length) throw new Error(`Business Central braucht feste Angaben für: ${missing.join(', ')} (Firma und Konfiguration dürfen nicht vom Modell gewählt werden).`)
  }
  return { url: url.toString(), headers, secretHeaderNames, ...(approved ? { approvedPrivateOrigin: approved } : {}), ...(microsoft ? { microsoft } : {}), ...(oauth ? { oauth } : {}) }
}

export function computeBindingHash(cfg: Pick<McpServerConfig, 'transport' | 'stdio' | 'http' | 'profile' | 'catalogId'>, fileHashes?: Record<string, string>): string {
  return sha256(bindingMaterial(cfg, fileHashes))
}

export function createMcpStore(dir: string, box: SecretBox) {
  const file = path.join(dir, SERVERS_FILE)
  const secretFile = (id: string) => path.join(dir, 'mcp-secrets', `${id}.enc`)
  let queue: Promise<unknown> = Promise.resolve()
  const serialized = <T>(fn: () => Promise<T>): Promise<T> => {
    const next = queue.then(fn, fn)
    queue = next.catch(() => undefined)
    return next
  }

  async function readAll(): Promise<McpServerConfig[]> {
    try {
      const raw = JSON.parse(await fs.readFile(file, 'utf8'))
      const list = Array.isArray(raw?.servers) ? raw.servers : []
      return list.filter((s: McpServerConfig) => s && isValidServerId(s.id) && (s.transport === 'stdio' ? !!s.stdio : !!s.http))
    } catch {
      return []
    }
  }
  async function writeAll(servers: McpServerConfig[]): Promise<void> {
    await fs.mkdir(dir, { recursive: true })
    const tmp = `${file}.${randomBytes(4).toString('hex')}.tmp`
    await fs.writeFile(tmp, JSON.stringify({ version: 1, servers }, null, 2), { mode: 0o600 })
    await fs.rename(tmp, file)
  }

  function uniqueId(label: string, taken: Set<string>): string {
    const base = serverIdFromLabel(label)
    if (!taken.has(base)) return base
    for (let i = 2; i < 100; i++) {
      const id = `${base.slice(0, 20)}-${i}`
      if (!taken.has(id)) return id
    }
    throw new Error('Zu viele Server mit ähnlichem Namen.')
  }

  async function readSecrets(id: string): Promise<Record<string, string>> {
    if (!isValidServerId(id)) return {}
    try {
      if (!box.available()) return {}
      const parsed = JSON.parse(box.decrypt(await fs.readFile(secretFile(id))))
      return parsed && typeof parsed === 'object' ? parsed as Record<string, string> : {}
    } catch {
      return {}
    }
  }
  /** Nur innerhalb von `serialized` aufrufen. */
  async function writeSecrets(id: string, values: Record<string, string>): Promise<void> {
    const filtered = Object.fromEntries(Object.entries(values).filter(([, v]) => v.trim()))
    if (Object.keys(filtered).length === 0) return
    if (!box.available()) throw new Error('Verschlüsselter Speicher ist nicht verfügbar — geheime Kopfzeilen können nicht abgelegt werden.')
    const prev = await readSecrets(id)
    await fs.mkdir(path.dirname(secretFile(id)), { recursive: true, mode: 0o700 })
    const tmp = `${secretFile(id)}.${randomBytes(4).toString('hex')}.tmp`
    await fs.writeFile(tmp, box.encrypt(JSON.stringify({ ...prev, ...filtered })), { mode: 0o600 })
    await fs.rename(tmp, secretFile(id))
  }

  return {
    list: () => readAll(),
    async get(id: string): Promise<McpServerConfig | undefined> {
      return (await readAll()).find(s => s.id === id)
    },
    /**
     * Neuer Eintrag oder Ersatz eines bestehenden (gleiche id). Freigaben bleiben nur bei gleicher
     * Bindung. `secrets`: Werte geheimer Kopfzeilen (leere Werte = nicht ändern).
     *
     * Eine Transaktion in der Warteschlange (Codex F18/F21/F22):
     * - `expectedBindingHash` (null = Eintrag darf noch nicht existieren) wird HIER gegen den
     *   aktuellen Stand geprüft — zwei bestätigte Änderungen überschreiben sich nicht still.
     * - Die neuen Geheimnisse werden zuerst verschlüsselt in eine temporäre Datei geschrieben; erst
     *   danach wird die Konfiguration umgeschaltet und die Geheimnisdatei ersetzt bzw. gelöscht.
     *   Scheitert ein Schritt vor dem Umschalten, bleibt alles wie vorher.
     */
    put(
      entry: Omit<McpServerConfig, 'id' | 'createdAt' | 'approvedTools' | 'bindingHash'> & { id?: string },
      fileHashes?: Record<string, string>,
      secrets?: Record<string, string>,
      expectedBindingHash?: string | null
    ): Promise<McpServerConfig> {
      return serialized(async () => {
        const all = await readAll()
        const existing = entry.id ? all.find(s => s.id === entry.id) : undefined
        if (expectedBindingHash !== undefined && (existing?.bindingHash ?? null) !== expectedBindingHash) {
          throw new Error('Der Eintrag wurde inzwischen geändert — bitte erneut versuchen.')
        }
        const label = entry.label.trim().slice(0, 80) || 'Externer Server'
        const id = existing?.id ?? uniqueId(label, new Set(all.map(s => s.id)))
        const bindingHash = computeBindingHash(entry, fileHashes)
        const keep = existing && existing.bindingHash === bindingHash
        // Geheimnisse gehören zu genau EINER Zieladresse. Wechselt der Transport oder das Origin,
        // werden sie verworfen — sonst gingen sie später an ein anderes Ziel (Codex F04/F11).
        const originOf = (c?: { transport: string; http?: { url: string } }) => {
          if (!c || c.transport !== 'http' || !c.http) return null
          try { return new URL(c.http.url).origin } catch { return null }
        }
        const dropOld = !!existing && (originOf(existing) === null || originOf(existing) !== originOf(entry))
        // 1. Neue Geheimnisse vorbereiten (ohne die alten anzufassen).
        const filtered = Object.fromEntries(Object.entries(secrets ?? {}).filter(([, v]) => v.trim()))
        let pendingSecret: string | null = null
        if (Object.keys(filtered).length > 0) {
          if (!box.available()) throw new Error('Verschlüsselter Speicher ist nicht verfügbar — geheime Kopfzeilen können nicht abgelegt werden.')
          const base = dropOld ? {} : await readSecrets(id)
          await fs.mkdir(path.dirname(secretFile(id)), { recursive: true, mode: 0o700 })
          pendingSecret = `${secretFile(id)}.${randomBytes(4).toString('hex')}.tmp`
          await fs.writeFile(pendingSecret, box.encrypt(JSON.stringify({ ...base, ...filtered })), { mode: 0o600 })
        }
        const next: McpServerConfig = {
          id, label, transport: entry.transport,
          ...(entry.stdio ? { stdio: entry.stdio } : {}),
          ...(entry.http ? { http: entry.http } : {}),
          ...(entry.profile ? { profile: entry.profile } : {}),
          ...(entry.catalogId ? { catalogId: entry.catalogId } : {}),
          ...(entry.personalData ? { personalData: true } : {}),
          ...(fileHashes ? { fileHashes } : {}),
          approvedTools: keep ? existing!.approvedTools : {},
          readOnlyConfirmed: keep ? existing!.readOnlyConfirmed : false,
          // „Nicht mehr fragen“ bei Personendaten hängt an der Bindung (E31′).
          ...(keep && existing!.personalDataCloudAck?.length ? { personalDataCloudAck: existing!.personalDataCloudAck } : {}),
          bindingHash,
          createdAt: existing?.createdAt ?? Date.now()
        }
        // 2. Konfiguration umschalten. Scheitert das, ist noch nichts verändert.
        try {
          await writeAll([...all.filter(s => s.id !== id), next])
        } catch (e) {
          if (pendingSecret) await fs.rm(pendingSecret, { force: true }).catch(() => undefined)
          throw e
        }
        // 3. Geheimnisse passend zur neuen Konfiguration einsetzen bzw. verwerfen.
        if (pendingSecret) await fs.rename(pendingSecret, secretFile(id))
        else if (dropOld) await fs.rm(secretFile(id), { force: true })
        return next
      })
    },
    remove(id: string): Promise<void> {
      return serialized(async () => {
        await writeAll((await readAll()).filter(s => s.id !== id))
        await fs.rm(secretFile(id), { force: true })
      })
    },
    /** Werkzeug freigeben/zurückziehen — nur mit Prüfsumme aus einer Main-seitigen Abfrage. */
    setToolApproval(id: string, bindingHash: string, toolName: string, definitionHash: string | null, tokens?: number): Promise<McpServerConfig> {
      return serialized(async () => {
        const all = await readAll()
        const cfg = all.find(s => s.id === id)
        if (!cfg) throw new Error('Unbekannter Server.')
        if (cfg.bindingHash !== bindingHash) throw new Error('Die Einstellungen des Servers haben sich geändert — bitte neu verbinden.')
        const approvedTools = { ...cfg.approvedTools }
        if (definitionHash) approvedTools[toolName] = { definitionHash, ...(typeof tokens === 'number' && Number.isFinite(tokens) ? { tokens: Math.max(0, Math.round(tokens)) } : {}) }
        else delete approvedTools[toolName]
        const next = { ...cfg, approvedTools }
        await writeAll(all.map(s => (s.id === id ? next : s)))
        return next
      })
    },
    setReadOnlyConfirmed(id: string, confirmed: boolean): Promise<McpServerConfig> {
      return serialized(async () => {
        const all = await readAll()
        const cfg = all.find(s => s.id === id)
        if (!cfg) throw new Error('Unbekannter Server.')
        // Ohne Bestätigung keine Freigaben bei Business Central (E6″).
        const next = { ...cfg, readOnlyConfirmed: confirmed, ...(confirmed || cfg.profile !== 'business-central' ? {} : { approvedTools: {} }) }
        await writeAll(all.map(s => (s.id === id ? next : s)))
        return next
      })
    },
    /**
     * Einen früheren Eintrag unverändert zurückschreiben — nur, wenn der aktuelle Stand noch genau
     * der ist, den der Aufrufer gerade selbst geschrieben hat (Rücknahme nach Codex F41).
     */
    restore(previous: McpServerConfig, expectedCurrentBinding: string): Promise<void> {
      return serialized(async () => {
        const all = await readAll()
        const cur = all.find(s => s.id === previous.id)
        if (!cur || cur.bindingHash !== expectedCurrentBinding) throw new Error('Der Eintrag wurde inzwischen geändert.')
        await writeAll(all.map(s => (s.id === previous.id ? previous : s)))
      })
    },
    /** „Bei diesem Anbieter nicht mehr fragen“ (E31′) — nur gültig für die aktuelle Bindung. */
    addPersonalDataCloudAck(id: string, bindingHash: string, provider: string): Promise<void> {
      return serialized(async () => {
        const all = await readAll()
        const cfg = all.find(s => s.id === id)
        if (!cfg || cfg.bindingHash !== bindingHash) return
        const set = new Set([...(cfg.personalDataCloudAck ?? []), provider])
        await writeAll(all.map(s => (s.id === id ? { ...cfg, personalDataCloudAck: [...set].sort() } : s)))
      })
    },
    /** Alle Geheimnisse eines Servers verwerfen (z.B. bei neuer Adresse, Codex F04). */
    clearSecrets(id: string): Promise<void> {
      return serialized(async () => {
        if (!isValidServerId(id)) return
        await fs.rm(secretFile(id), { force: true })
      })
    },
    saveSecrets(id: string, values: Record<string, string>): Promise<void> {
      return serialized(() => writeSecrets(id, values))
    },
    /** Nur für Code im Main — nie an den Renderer. */
    loadSecrets(id: string): Promise<Record<string, string>> {
      return readSecrets(id)
    },
    workDirFor(id: string): string {
      if (!isValidServerId(id)) throw new Error('Unzulässige Server-Kennung.')
      return path.join(dir, 'mcp-work', id)
    },
    profilePathFor(id: string): string {
      if (!isValidServerId(id)) throw new Error('Unzulässige Server-Kennung.')
      return path.join(dir, 'mcp-work', `${id}.sb`)
    }
  }
}

export type McpStore = ReturnType<typeof createMcpStore>
