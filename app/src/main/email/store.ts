/**
 * Persistenz-Seam für `.mindgraph/emails.json`.
 *
 * Warum dieses Modul existiert: Die Mailliste ist EINE Datei, die bisher von
 * jedem Schreibpfad (Renderer-Store, IMAP-Abruf, Analyse-Batch) komplett neu
 * geschrieben wurde — ohne vorher zu lesen. Auf zwei Geräten am selben Sync-Vault
 * gewinnt damit, wer zuletzt speichert; alles, was das andere Gerät zwischen-
 * zeitlich geholt hat, fällt still aus der Liste. Belegt in
 * `docs/email-store-multi-device-plan.md` (Konflikt-Kopie 198 Mails → 186).
 *
 * Dieses Modul kapselt beides:
 *
 *   Sicherheitsgurt: Jeder Schreibvorgang nennt die Revision, auf der er
 *   aufbaut. Passt sie nicht mehr, wird der fremde Stand NICHT überschrieben.
 *
 *   Reparatur: Statt in diesem Fall abzulehnen, wird der frisch gelesene Stand
 *   nach den Regeln aus `shared/emailMerge.ts` mit dem eigenen VEREINIGT und
 *   das Ergebnis geschrieben. Abgelehnt wird nur noch, was sich nicht
 *   vereinigen lässt — eine beschädigte Datei.
 *
 * Konfliktlogik, Dateizugriff und Serialisierung liegen dadurch an einer Stelle;
 * die Aufrufer (IPC-Handler) kennen keine davon.
 *
 * Drei Garantien, die dieses Modul gibt:
 *  1. **Revision**: Jeder Lesevorgang liefert einen Inhalts-Hash. Jeder Schreib-
 *     vorgang nennt die Revision, auf der er aufbaut. Passt sie nicht mehr zum
 *     Stand auf der Platte, wird NICHT geschrieben.
 *  2. **Serialisierung**: Innerhalb dieses Prozesses läuft pro Vault immer nur
 *     eine Lese-/Schreib-Operation. Ohne das könnten sich Abruf und Analyse
 *     gegenseitig überholen — beide laufen minutenlang.
 *  3. **Atomarität**: Geschrieben wird in eine Temporärdatei daneben, danach
 *     `rename`. Ein Absturz mitten im Schreiben hinterlässt keine halbe Datei.
 *     (Der Temporärname beginnt mit `.` und endet auf `.tmp` — beides schließt
 *     `sync/fileTracker.ts` vom Sync aus.)
 */

import { createHash } from 'crypto'
import { promises as fs } from 'fs'
import path from 'path'
import {
  mergeEmailLists,
  mergeTombstones,
  mergeDeviceCursors,
  flattenDeviceCursors,
  writeDeviceCursor,
  type MergeableEmail,
  type EmailTombstones,
  type DeviceCursors
} from '../../shared/emailMerge'

/** Ab Fassung 2 liegt die Mailliste in einer EIGENEN Datei.
 *
 *  Grund: Eine ältere App-Version am selben Sync-Vault schreibt `emails.json`
 *  blind komplett neu. Sie kennt weder die Grabsteine noch die Merker je Gerät
 *  und wirft beides weg — mitsamt allen Mails, die nur das neue Gerät hatte.
 *  Gegen einen fremden Schreiber hilft keine Vorsicht im eigenen Code; der
 *  einzige verlässliche Schutz ist eine Datei, die der alte Schreiber nicht
 *  kennt und deshalb nicht anfasst. */
export const EMAIL_STORE_FILE = 'email-store.json'
export const EMAIL_STORE_REL_PATH = `.mindgraph/${EMAIL_STORE_FILE}`

/** Die alte Datei. Wird EINMAL je Gerät eingelesen und danach in Ruhe gelassen —
 *  nie überschrieben, nie gelöscht: Solange ein Gerät noch die alte Fassung
 *  fährt, ist sie dessen Arbeitsdatei. */
export const LEGACY_EMAIL_STORE_FILE = 'emails.json'

/** Formatfassung, die in der Datei steht. */
export const EMAIL_STORE_VERSION = 2

/** Rohform der Datei. Unbekannte Felder werden bewusst durchgereicht, damit ein
 *  älteres/neueres Gerät nichts verliert, was diese Version nicht kennt. */
export interface EmailStoreData {
  emails: Array<Record<string, unknown>>
  /** Alter, geräteübergreifender Abruf-Merker. Bleibt gefüllt, damit eine
   *  ältere App-Version, die dieselbe Datei liest, sich weiter wie bisher
   *  verhält. Massgeblich ist `lastFetchedAtByDevice`. */
  lastFetchedAt: Record<string, string>
  /** Abruf-Merker je Gerät. Siehe `shared/emailMerge.ts`. */
  lastFetchedAtByDevice?: DeviceCursors
  /** Grabsteine gelöschter Mails (ID → Zeitpunkt). Ohne sie kehrt eine
   *  gelöschte Mail beim nächsten Abgleich vom anderen Gerät zurück. */
  deleted?: EmailTombstones
  /** Formatfassung. */
  storeVersion?: number
  /** Welches Gerät seine alte `emails.json` schon eingebracht hat (Kennung →
   *  Zeitpunkt). Steht im GETEILTEN Stand, nicht lokal: Ein Gerät, das erst
   *  Wochen später aktualisiert, muss seinen Altbestand noch einbringen
   *  können — und danach kein zweites Mal. */
  legacyImported?: Record<string, string>
  [key: string]: unknown
}

export interface EmailStoreSnapshot {
  data: EmailStoreData
  /** Inhalts-Hash der gelesenen Datei; `NO_REVISION`, wenn es sie nicht gibt. */
  revision: string
  exists: boolean
  /** `false`, wenn die Datei da ist, aber kein gültiges JSON enthält. Dann darf
   *  NICHTS auf ihr aufbauen: Der Aufrufer bekommt keine Basis und jeder
   *  Schreibversuch wird abgelehnt — sonst überschriebe eine leere Liste eine
   *  vielleicht noch reparierbare Datei. */
  readable: boolean
  /** Menschenlesbarer Grund, wenn `readable` false ist. Geht bis in die
   *  Oberfläche — eine beschädigte Mailliste darf nicht still bleiben. */
  reason?: string
}

export type EmailStoreWriteResult =
  /** `merged: true` heißt: Es lag ein fremder Stand vor, er wurde eingearbeitet
   *  statt überschrieben. Der Aufrufer sollte danach neu laden, damit die
   *  Anzeige die eingearbeiteten Mails auch zeigt. */
  | { ok: true; revision: string; merged: boolean }
  | { ok: false; conflict: true; currentRevision: string; reason: string }

/** Revision einer Datei, die es (noch) nicht gibt. */
export const NO_REVISION = ''

export function emailStorePath(vaultPath: string): string {
  return path.join(vaultPath, '.mindgraph', EMAIL_STORE_FILE)
}

export function legacyEmailStorePath(vaultPath: string): string {
  return path.join(vaultPath, '.mindgraph', LEGACY_EMAIL_STORE_FILE)
}

/** Inhalts-Hash über die exakten Dateibytes. Bewusst nicht über das geparste
 *  Objekt: Wir wollen jede fremde Änderung sehen, auch eine, die dieselben
 *  Daten anders formatiert — Zweifel gehen zugunsten „Konflikt" aus. */
export function computeRevision(raw: string): string {
  return createHash('sha256').update(raw, 'utf-8').digest('hex').slice(0, 32)
}

export function serializeEmailStore(data: EmailStoreData): string {
  return JSON.stringify(data, null, 2)
}

/** Leerer Ausgangsstand. */
export function emptyEmailStore(): EmailStoreData {
  return { storeVersion: EMAIL_STORE_VERSION, emails: [], lastFetchedAt: {} }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function isStringMap(value: unknown): boolean {
  return isPlainObject(value) && Object.values(value).every(v => typeof v === 'string')
}

export type EmailStoreValidation =
  | { ok: true; data: EmailStoreData }
  | { ok: false; reason: string }

/**
 * Prüft, ob die gelesene Datei wirklich unversehrt ist.
 *
 * Streng mit Absicht. Dass `JSON.parse` durchläuft, sagt nur, dass die Klammern
 * stimmen — `[]`, `null` oder `{"emails": "kaputt"}` sind gültiges JSON und
 * wären als „leerer Bestand" durchgegangen. Der nächste Speichervorgang hätte
 * diesen leeren Stand dann für bare Münze genommen und die Datei überschrieben.
 * Was hier nicht sauber ist, gilt deshalb als unlesbar: Die Datei bleibt liegen,
 * es wird nicht darauf geschrieben, und der Nutzer bekommt es zu sehen.
 */
export interface ValidateEmailStoreOptions {
  /** `true` für `email-store.json`: `emails` und `lastFetchedAt` MÜSSEN da sein.
   *  Ein Objekt, dem sie fehlen, ist kein leerer Bestand, sondern ein Rest —
   *  und würde beim nächsten Speichern als „da war nichts" durchgehen. Diese
   *  Datei schreibt nur diese App, und sie schreibt beide Felder immer.
   *
   *  `false` für die alte `emails.json`: Sie stammt aus fremder Hand und darf
   *  auch dann noch eingelesen werden, wenn ein Feld fehlt. Falsch eingelesen
   *  wird dort nichts — sie wird nur gelesen, nie geschrieben. */
  requireFields?: boolean
}

export function validateEmailStore(parsed: unknown, options: ValidateEmailStoreOptions = {}): EmailStoreValidation {
  if (!isPlainObject(parsed)) {
    return { ok: false, reason: 'Die Datei enthält kein Objekt.' }
  }
  const base = { ...parsed }

  if (options.requireFields) {
    if (base.emails === undefined) return { ok: false, reason: 'Der Datei fehlt die Mailliste.' }
    if (base.lastFetchedAt === undefined) return { ok: false, reason: 'Der Datei fehlt der Abruf-Merker.' }
  }

  if (base.emails !== undefined) {
    if (!Array.isArray(base.emails)) return { ok: false, reason: 'Das Feld „emails" ist keine Liste.' }
    for (const entry of base.emails) {
      if (!isPlainObject(entry)) return { ok: false, reason: 'Die Liste enthält einen Eintrag, der keine Mail ist.' }
      if (typeof entry.id !== 'string' || entry.id === '') return { ok: false, reason: 'Eine Mail in der Liste hat keine Kennung.' }
    }
  }
  if (base.lastFetchedAt !== undefined && !isStringMap(base.lastFetchedAt)) {
    return { ok: false, reason: 'Der Abruf-Merker ist beschädigt.' }
  }
  if (base.deleted !== undefined && !isStringMap(base.deleted)) {
    return { ok: false, reason: 'Die Liste gelöschter Mails ist beschädigt.' }
  }
  if (base.lastFetchedAtByDevice !== undefined) {
    if (!isPlainObject(base.lastFetchedAtByDevice)) return { ok: false, reason: 'Die Abruf-Merker der Geräte sind beschädigt.' }
    for (const cursor of Object.values(base.lastFetchedAtByDevice)) {
      if (!isStringMap(cursor)) return { ok: false, reason: 'Der Abruf-Merker eines Geräts ist beschädigt.' }
    }
  }

  return {
    ok: true,
    data: {
      ...base,
      emails: (base.emails as Array<Record<string, unknown>>) || [],
      lastFetchedAt: (base.lastFetchedAt as Record<string, string>) || {}
    }
  }
}

// ── Serialisierung pro Vault ────────────────────────────────────────────────
// Eine Promise-Kette je Vault. Jede Operation hängt sich hinten an, unabhängig
// davon, ob die vorige erfolgreich war — ein Fehler darf die Kette nicht
// abreißen lassen, sonst hängt der Mail-Tab bis zum Neustart.
const chains = new Map<string, Promise<unknown>>()

function withVaultLock<T>(vaultPath: string, fn: () => Promise<T>): Promise<T> {
  const key = path.resolve(vaultPath)
  const previous = chains.get(key) ?? Promise.resolve()
  const run = previous.then(fn, fn)
  const settled = run.then(() => undefined, () => undefined)
  chains.set(key, settled)
  // Kette wieder freigeben, sobald nichts mehr ansteht (verhindert unbegrenztes
  // Wachstum der Map über die Laufzeit).
  void settled.then(() => {
    if (chains.get(key) === settled) chains.delete(key)
  })
  return run
}

/** Liest eine Datei dieses Formats. Nur `ENOENT` heißt „gibt es nicht" — jeder
 *  andere Lesefehler (Rechte, Ein-/Ausgabefehler, halb übertragen) ist eben KEIN
 *  Beleg dafür, dass da nichts ist, und darf nicht in einen Schreibvorgang auf
 *  eine womöglich volle Datei münden. */
async function readFileSnapshot(file: string, label: string, requireFields: boolean): Promise<EmailStoreSnapshot> {
  let raw: string
  try {
    raw = await fs.readFile(file, 'utf-8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
      return { data: emptyEmailStore(), revision: NO_REVISION, exists: false, readable: true, reason: undefined }
    }
    console.error(`[EmailStore] ${label} ist nicht lesbar:`, error)
    return {
      data: emptyEmailStore(),
      revision: NO_REVISION,
      exists: true,
      readable: false,
      reason: 'Die Datei konnte nicht gelesen werden.'
    }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    console.error(`[EmailStore] ${label} enthält kein gültiges JSON — die Datei bleibt unangetastet.`)
    return { data: emptyEmailStore(), revision: computeRevision(raw), exists: true, readable: false, reason: 'Die Datei enthält kein gültiges JSON.' }
  }

  const checked = validateEmailStore(parsed, { requireFields })
  if (!checked.ok) {
    console.error(`[EmailStore] ${label} ist strukturell beschädigt (${checked.reason}) — die Datei bleibt unangetastet.`)
    return { data: emptyEmailStore(), revision: computeRevision(raw), exists: true, readable: false, reason: checked.reason }
  }

  return { data: checked.data, revision: computeRevision(raw), exists: true, readable: true, reason: undefined }
}

function readSnapshotUnlocked(vaultPath: string): Promise<EmailStoreSnapshot> {
  return readFileSnapshot(emailStorePath(vaultPath), EMAIL_STORE_FILE, true)
}

async function writeAtomic(file: string, raw: string): Promise<void> {
  const dir = path.dirname(file)
  await fs.mkdir(dir, { recursive: true })
  const tmp = path.join(dir, `.${path.basename(file)}.${process.pid}.${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}.tmp`)
  try {
    await fs.writeFile(tmp, raw, 'utf-8')
    await fs.rename(tmp, file)
  } catch (error) {
    await fs.rm(tmp, { force: true }).catch(() => { /* Aufräumen darf den echten Fehler nicht verdecken */ })
    throw error
  }
}

/**
 * Vereinigt zwei Stände der GANZEN Datei — Mails, Grabsteine und Geräte-Merker.
 *
 * `mine` ist der Stand des Aufrufers, `theirs` der frisch von der Platte
 * gelesene. Die eigentlichen Regeln stehen pur und getestet in
 * `shared/emailMerge.ts`; hier wird nur zusammengesteckt.
 */
export function mergeStoreData(mine: EmailStoreData, theirs: EmailStoreData): EmailStoreData {
  const tombstones = mergeTombstones(mine.deleted, theirs.deleted)
  const byDevice = mergeDeviceCursors(mine.lastFetchedAtByDevice, theirs.lastFetchedAtByDevice)

  // Alter gemeinsamer Merker: je Schlüssel der späteste Wert aus beiden Seiten
  // UND aus allen Geräte-Merkern. Er ist nur noch Rückfallebene für ältere
  // App-Versionen, die `lastFetchedAtByDevice` nicht kennen — die würden ohne
  // ihn das ganze Postfach neu ziehen. Rückwärts laufen darf er nie.
  const legacy: Record<string, string> = {}
  for (const source of [theirs.lastFetchedAt || {}, mine.lastFetchedAt || {}, flattenDeviceCursors(byDevice)]) {
    for (const [key, value] of Object.entries(source)) {
      if (!legacy[key] || value > legacy[key]) legacy[key] = value
    }
  }

  const emails = mergeEmailLists(
    mine.emails as unknown as MergeableEmail[],
    theirs.emails as unknown as MergeableEmail[],
    { tombstones }
  ) as unknown as Array<Record<string, unknown>>

  const out: EmailStoreData = { ...theirs, ...mine, emails, lastFetchedAt: legacy }
  if (Object.keys(tombstones).length > 0) out.deleted = tombstones
  if (Object.keys(byDevice).length > 0) out.lastFetchedAtByDevice = byDevice

  // Welche Geräte ihren Altbestand schon eingebracht haben, ist die Vereinigung
  // beider Seiten — sonst holt ein Gerät seinen Altbestand ein zweites Mal.
  const imported = { ...(theirs.legacyImported || {}), ...(mine.legacyImported || {}) }
  if (Object.keys(imported).length > 0) out.legacyImported = imported

  out.storeVersion = EMAIL_STORE_VERSION
  return out
}

export interface LoadEmailStoreOptions {
  /** Ist die Kennung gesetzt, bringt dieses Gerät beim ersten Mal seinen
   *  Altbestand aus `emails.json` ein. Ohne Kennung wird nur gelesen. */
  deviceId?: string
}

/**
 * Liest den Bestand samt Revision.
 *
 * Schreibt nur in EINEM Fall: wenn dieses Gerät seinen Altbestand aus
 * `emails.json` noch nicht eingebracht hat. Nicht aber wegen `retainDays` —
 * eine Anzeigeeinstellung darf keine Daten löschen.
 */
export function loadEmailStore(vaultPath: string, options: LoadEmailStoreOptions = {}): Promise<EmailStoreSnapshot> {
  return withVaultLock(vaultPath, async () => {
    const current = await readSnapshotUnlocked(vaultPath)
    if (!options.deviceId || (current.exists && !current.readable)) return current
    return importLegacyOnce(vaultPath, current, options.deviceId)
  })
}

/**
 * Bringt die alte `emails.json` dieses Geräts EINMAL in den neuen Stand ein.
 *
 * Warum je Gerät und nicht einmal pro Vault: Aktualisiert ein zweites Gerät erst
 * Wochen später, hat dessen alte Datei einen eigenen Bestand — Mails, Analysen,
 * Erledigt-Marken. Ohne diesen Schritt wäre der beim Wechsel verloren. Die
 * Vereinigungsregeln erledigen das Zusammenlegen; Grabsteine sorgen dafür, dass
 * bereits gelöschte Mails dabei nicht wieder auferstehen.
 *
 * Die alte Datei wird gelesen und danach in Ruhe gelassen — nicht überschrieben
 * und nicht gelöscht. Solange irgendwo noch eine ältere App-Fassung läuft, ist
 * sie deren Arbeitsdatei.
 */
async function importLegacyOnce(
  vaultPath: string,
  current: EmailStoreSnapshot,
  deviceId: string
): Promise<EmailStoreSnapshot> {
  if (current.data.legacyImported?.[deviceId]) return current

  const legacy = await readFileSnapshot(legacyEmailStorePath(vaultPath), LEGACY_EMAIL_STORE_FILE, false)
  if (!legacy.exists || !legacy.readable) {
    // Nichts einzubringen (oder nicht lesbar). Trotzdem vermerken, dass dieses
    // Gerät durch ist — sonst wird bei jedem Start erneut nachgesehen.
    if (!legacy.exists) {
      return writeMigrationMark(vaultPath, current, deviceId, current.data)
    }
    console.warn('[EmailStore] Alte emails.json ist beschädigt — sie wird nicht übernommen und bleibt liegen.')
    return current
  }

  const merged = mergeStoreData(current.data, legacy.data)
  console.log(`[EmailStore] Altbestand übernommen: ${legacy.data.emails.length} Mails aus ${LEGACY_EMAIL_STORE_FILE} → ${merged.emails.length} gesamt.`)
  return writeMigrationMark(vaultPath, current, deviceId, merged)
}

async function writeMigrationMark(
  vaultPath: string,
  current: EmailStoreSnapshot,
  deviceId: string,
  data: EmailStoreData
): Promise<EmailStoreSnapshot> {
  const next: EmailStoreData = {
    ...data,
    storeVersion: EMAIL_STORE_VERSION,
    legacyImported: { ...(data.legacyImported || {}), [deviceId]: new Date().toISOString() }
  }
  const raw = serializeEmailStore(next)
  try {
    await writeAtomic(emailStorePath(vaultPath), raw)
  } catch (error) {
    // Fehlschlag darf den Mail-Tab nicht blockieren; beim nächsten Start wird
    // es erneut versucht.
    console.error('[EmailStore] Übernahme des Altbestands konnte nicht gespeichert werden:', error)
    return current
  }
  return { data: next, revision: computeRevision(raw), exists: true, readable: true }
}

/**
 * Schreibt den übergebenen Stand — aber nur, wenn die Datei noch auf der
 * Revision steht, auf der der Aufrufer aufgebaut hat.
 *
 * Bei Abweichung wird abgelehnt statt überschrieben. Der Aufrufer behält seinen
 * Stand im Speicher; er darf ihn NICHT still verwerfen, sondern muss den
 * Konflikt sichtbar machen.
 *
 * Hier wächst später Vorschlag A: statt abzulehnen wird der frisch gelesene
 * Stand deterministisch mit `next` vereinigt und das Ergebnis geschrieben.
 */
export interface SaveEmailStoreOptions {
  /** Kennung des schreibenden Geräts. Ist sie gesetzt, wird `next.lastFetchedAt`
   *  als Merker DIESES Geräts verbucht statt als gemeinsamer — der Renderer
   *  bekommt beim Laden den geräteeigenen Merker und darf mit ihm nicht den
   *  gemeinsamen Stand aller Geräte überschreiben. */
  deviceId?: string
}

export function saveEmailStore(
  vaultPath: string,
  next: EmailStoreData,
  baseRevision: string | null,
  options: SaveEmailStoreOptions = {}
): Promise<EmailStoreWriteResult> {
  return withVaultLock(vaultPath, async () => {
    const current = await readSnapshotUnlocked(vaultPath)

    // Unlesbare Datei: nicht anfassen. Ein JSON-Fehler kann von einem halb
    // übertragenen Sync stammen; die Datei ist dann evtl. noch zu retten, eine
    // drübergeschriebene leere Liste nicht.
    if (current.exists && !current.readable) {
      return {
        ok: false as const,
        conflict: true as const,
        currentRevision: current.revision,
        reason: 'Die gespeicherte Mailliste ist beschädigt und wird nicht überschrieben.'
      }
    }

    // Hat sich die Datei seit dem Laden geändert, wird der fremde Stand NICHT
    // verworfen, sondern nach den Regeln aus `shared/emailMerge.ts` mit dem
    // eigenen vereinigt. Steht sie noch auf der Basisrevision, ist die
    // Vereinigung ein Nulldurchgang — der Weg ist derselbe, damit es keinen
    // zweiten, seltener gelaufenen Codepfad gibt.
    const base = baseRevision ?? NO_REVISION
    const merged: EmailStoreData = base === current.revision
      ? { ...next }
      : mergeStoreData(next, current.data)

    // Abruf-Merker eines benannten Geräts einsortieren. Nur vorwärts, und nur
    // im eigenen Fach; das gemeinsame Feld wird daraus abgeleitet und bleibt
    // damit die Obergrenze über alle Geräte.
    if (options.deviceId) {
      const byDevice = writeDeviceCursor(
        merged.lastFetchedAtByDevice ?? current.data.lastFetchedAtByDevice,
        options.deviceId,
        merged.lastFetchedAt || {}
      )
      const legacy: Record<string, string> = { ...(current.data.lastFetchedAt || {}) }
      for (const [key, value] of Object.entries(flattenDeviceCursors(byDevice))) {
        if (!legacy[key] || value > legacy[key]) legacy[key] = value
      }
      merged.lastFetchedAtByDevice = byDevice
      merged.lastFetchedAt = legacy
    }

    // Felder, die dieser Aufrufer gar nicht kennt, bleiben erhalten. Wer ein
    // Feld nicht kennt, kann auch nicht gemeint haben, es zu löschen.
    const preserved: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(current.data)) {
      if (!(key in merged)) preserved[key] = value
    }

    const raw = serializeEmailStore({ ...preserved, ...merged, storeVersion: EMAIL_STORE_VERSION } as EmailStoreData)
    await writeAtomic(emailStorePath(vaultPath), raw)
    return { ok: true as const, revision: computeRevision(raw), merged: base !== current.revision }
  })
}

/**
 * Lesen–Ändern–Schreiben in einem Zug, unter derselben Sperre.
 *
 * Für Schreibpfade INNERHALB des Main-Prozesses (IMAP-Abruf, Analyse-Batch).
 * Beide laufen minuten- bis stundenlang; ihren Startstand am Ende komplett
 * zurückzuschreiben würde alles verlieren, was inzwischen dazukam. Sie ändern
 * deshalb gezielt Felder auf dem FRISCH gelesenen Bestand.
 *
 * Der Mutator bekommt eine bereits normalisierte Kopie und gibt den zu
 * schreibenden Stand zurück (oder `null`, wenn nichts zu tun ist).
 */
export async function mutateEmailStore<T>(
  vaultPath: string,
  mutator: (data: EmailStoreData) => { data: EmailStoreData; result: T } | null | Promise<{ data: EmailStoreData; result: T } | null>
): Promise<{ written: boolean; revision: string; result: T | null; damaged?: string }> {
  return withVaultLock(vaultPath, async () => {
    const current = await readSnapshotUnlocked(vaultPath)
    if (current.exists && !current.readable) {
      // Nicht schreiben — und den Grund nach oben durchreichen. Ein Abruf, der
      // seine Ergebnisse nicht ablegen konnte, darf sich nicht als gelungen
      // melden; genau so bleibt eine beschädigte Datei sonst unbemerkt.
      console.warn('[EmailStore] Änderung übersprungen: Die gespeicherte Mailliste ist beschädigt.')
      return { written: false, revision: current.revision, result: null, damaged: current.reason || 'Die gespeicherte Mailliste ist beschädigt.' }
    }
    const outcome = await mutator(current.data)
    if (!outcome) return { written: false, revision: current.revision, result: null }
    const raw = serializeEmailStore({ ...outcome.data, storeVersion: EMAIL_STORE_VERSION })
    await writeAtomic(emailStorePath(vaultPath), raw)
    return { written: true, revision: computeRevision(raw), result: outcome.result }
  })
}

/**
 * Nimmt einen Mail-Stand von außen (Sync) entgegen und vereinigt ihn mit dem
 * lokalen.
 *
 * Warum das hier liegen muss und nicht im Sync: Der Sync schrieb `emails.json`
 * bisher direkt — außerhalb der Sperre dieses Moduls, nicht atomar, und im
 * Konfliktfall mit „lokale Fassung als Konfliktkopie wegsichern, dann die
 * jüngere übernehmen". Die Konfliktkopie ist vom Sync ausgeschlossen und wird
 * von niemandem mehr gelesen; ohne einen anschließenden Schreibvorgang der App
 * war der weggesicherte Stand endgültig weg. Genau so entsteht 198 → 186 erneut.
 *
 * Deshalb: Eingehende Stände laufen durch dieselbe Tür wie alles andere.
 *
 * Gibt den geschriebenen Inhalt zurück, damit der Aufrufer ihn hochladen und
 * seinen tatsächlichen Hash ins Manifest schreiben kann — nicht den des
 * Server-Stands, der ja gerade NICHT auf der Platte liegt.
 */
export async function mergeIncomingEmailStore(
  vaultPath: string,
  incomingRaw: string,
  hooks: { beforeWrite?: (nextContent: Buffer) => Promise<void> } = {}
): Promise<
  | { ok: true; raw: string; revision: string; localCount: number; incomingCount: number; mergedCount: number }
  | { ok: false; reason: string }
> {
  return withVaultLock(vaultPath, async () => {
    let parsed: unknown
    try {
      parsed = JSON.parse(incomingRaw)
    } catch {
      return { ok: false as const, reason: 'Der eingehende Stand enthält kein gültiges JSON.' }
    }
    const incoming = validateEmailStore(parsed, { requireFields: true })
    if (!incoming.ok) {
      return { ok: false as const, reason: `Der eingehende Stand ist beschädigt: ${incoming.reason}` }
    }

    const local = await readSnapshotUnlocked(vaultPath)
    if (local.exists && !local.readable) {
      // Nicht überschreiben. Eine beschädigte lokale Datei ist womöglich noch zu
      // retten, und die App zeigt dazu bereits einen Hinweis.
      return { ok: false as const, reason: local.reason || 'Die lokale Mailliste ist beschädigt.' }
    }

    const merged = mergeStoreData(local.data, incoming.data)
    const raw = serializeEmailStore({ ...merged, storeVersion: EMAIL_STORE_VERSION })
    const buffer = Buffer.from(raw, 'utf-8')

    if (hooks.beforeWrite) {
      try {
        await hooks.beforeWrite(buffer)
      } catch (error) {
        console.warn('[EmailStore] Sicherung vor dem Sync-Schreibvorgang fehlgeschlagen:', error)
      }
    }

    await writeAtomic(emailStorePath(vaultPath), raw)
    return {
      ok: true as const,
      raw,
      revision: computeRevision(raw),
      localCount: local.data.emails.length,
      incomingCount: incoming.data.emails.length,
      mergedCount: merged.emails.length
    }
  })
}
