/**
 * Deterministische Vereinigung zweier Stände der Mailliste.
 *
 * Hintergrund: `.mindgraph/emails.json` ist EINE Datei, die auf mehreren Geräten
 * am selben Sync-Vault liegt. Wer sie komplett zurückschreibt, löscht die Mails
 * des anderen Geräts (Befund in `docs/email-store-multi-device-plan.md`, Vorschlag A).
 * Diese Datei ist die Regel, nach der zwei Stände stattdessen zusammengeführt
 * werden — pur, ohne Dateizugriff, damit sie prüfbar bleibt.
 *
 * Die fünf Regeln, in dieser Reihenfolge:
 *
 *  1. **Vereinigung über die Mail-ID.** Was nur eine Seite kennt, wird übernommen.
 *     Das allein behebt den gemeldeten Fall.
 *  2. **Server-Daten folgen dem jüngeren Abruf.** Betreff, Text, Flags, Ordner,
 *     Anhänge kommen vom IMAP-Server; der zuletzt geholte Stand ist der
 *     aktuellere. Ausschlaggebend ist `fetchedAt`.
 *  3. **Vom Menschen gesetzte Marken gehen nie verloren.** `noteCreated`,
 *     `replyHandled`, `workflowRuns`, `sent` sind einbahnig: einmal gesetzt,
 *     bleibt gesetzt. Sie werden ODER-verknüpft, unabhängig davon, welcher
 *     Datensatz sonst gewinnt.
 *  4. **Analysen: vorhanden schlägt nicht vorhanden, sonst gewinnt die jüngere**
 *     (`analyzedAt`). Die Marken aus Regel 3 werden anschließend über BEIDE
 *     Analysen gezogen — sonst verliert man ein „erledigt", nur weil die andere
 *     Seite später neu analysiert hat.
 *  5. **Löschen braucht eine eigene Spur.** Ohne Grabstein kehrt eine gelöschte
 *     Mail beim nächsten Abgleich vom anderen Gerät zurück. Ein Grabstein hält
 *     die ID samt Zeitpunkt fest; ein danach frisch geholter Datensatz sticht ihn
 *     (die Mail kam echt vom Server zurück).
 *
 * Bewusst NICHT gelöst: `userProject` lässt sich bei echtem Widerspruch nicht
 * auflösen, weil das Feld keinen eigenen Zeitstempel hat. Siehe dort.
 */

/** Lockere Sicht auf einen Mail-Datensatz. Absichtlich kein `EmailMessage`:
 *  Die Vereinigung muss auch mit Datensätzen einer anderen App-Version umgehen
 *  und darf nichts wegwerfen, was sie nicht kennt. */
export interface MergeableEmail {
  id: string
  fetchedAt?: string
  date?: string
  noteCreated?: boolean
  notePath?: string
  sent?: boolean
  userProject?: string | null
  /** Wann `userProject` ZULETZT GEÄNDERT wurde — auch beim Zurücksetzen auf
   *  automatische Zuordnung. Fehlt das Feld selbst, ist der Zeitstempel aber
   *  gesetzt, heißt das ausdrücklich „zurück auf automatisch": `undefined`
   *  übersteht keine JSON-Runde, die Absicht trägt deshalb der Zeitstempel. */
  userProjectChangedAt?: string
  analysis?: MergeableAnalysis
  [key: string]: unknown
}

export interface MergeableAnalysis {
  analyzedAt?: string
  replyHandled?: boolean
  replyHandledAt?: string
  /** Wann `replyHandled` ZULETZT GEÄNDERT wurde — auch beim Zurücknehmen.
   *  Ohne diesen Zeitstempel wäre „doch noch nicht beantwortet" nicht
   *  übertragbar: Zwei Stände ließen sich nur noch ODER-verknüpfen, und ein
   *  Zurücknehmen ginge bei jedem gleichzeitigen Fremdstand verloren. */
  replyHandledChangedAt?: string
  workflowRuns?: Record<string, string>
  [key: string]: unknown
}

/** ID → Zeitpunkt der Löschung (ISO). */
export type EmailTombstones = Record<string, string>

export interface MergeOptions {
  /** Grabsteine beider Seiten, bereits vereinigt (siehe `mergeTombstones`). */
  tombstones?: EmailTombstones
}

function isoMax(a: string | undefined, b: string | undefined): string | undefined {
  if (!a) return b
  if (!b) return a
  return a >= b ? a : b
}

/** Ist `a` juenger als `b`? Fehlender Zeitstempel gilt als aelter. */
function newer(a: string | undefined, b: string | undefined): boolean {
  if (!a) return false
  if (!b) return true
  return a > b
}

// ── Regel 3: einbahnige Marken ──────────────────────────────────────────────

/** Vereinigt die Workflow-Marker (exactly-once je Workflow). Bei gleichem
 *  Workflow auf beiden Seiten gewinnt der Eintrag von `mine` — welcher Lauf
 *  zuerst war, ist nicht rekonstruierbar, und beide bedeuten dasselbe:
 *  „für diese Mail schon gelaufen". */
export function mergeWorkflowRuns(
  mine: Record<string, string> | undefined,
  theirs: Record<string, string> | undefined
): Record<string, string> | undefined {
  if (!mine && !theirs) return undefined
  return { ...(theirs || {}), ...(mine || {}) }
}

/**
 * Entscheidet über `replyHandled` und zieht die Workflow-Marker zusammen.
 *
 * `replyHandled` ist eine Aussage des Nutzers und darf nie von einer jüngeren
 * Analyse überschrieben werden. Es ist aber auch KEINE Einbahnstraße: Die
 * Oberfläche schaltet die Marke um, „doch noch nicht beantwortet" ist also ein
 * ausdrücklicher Wunsch. Deshalb entscheidet der Zeitstempel der letzten
 * Änderung — beim Setzen wie beim Zurücknehmen.
 *
 * Datensätze aus der Zeit vor diesem Zeitstempel kennen ihn nicht. Für die gilt
 * weiterhin ODER: Damals wurde ein Zurücknehmen nirgends festgehalten, und ein
 * vergessenes „erledigt" wäre der schlechtere Fehler.
 *
 * Bei gleichem Zeitstempel gewinnt `true`. Das ist willkürlich, aber auf beiden
 * Geräten gleich — und darauf kommt es an, sonst pendelt der Wert.
 */
function applyUserMarks(
  target: MergeableAnalysis,
  a: MergeableAnalysis | undefined,
  b: MergeableAnalysis | undefined
): MergeableAnalysis {
  const merged: MergeableAnalysis = { ...target }

  const aAt = a?.replyHandledChangedAt
  const bAt = b?.replyHandledChangedAt
  let handled: boolean
  let changedAt: string | undefined
  let handledAt: string | undefined

  if (aAt || bAt) {
    let winner: MergeableAnalysis | undefined
    if (aAt && bAt && aAt === bAt) winner = a?.replyHandled ? a : b?.replyHandled ? b : a
    else if (newer(aAt, bAt)) winner = a
    else winner = b
    handled = !!winner?.replyHandled
    changedAt = isoMax(aAt, bAt)
    handledAt = winner?.replyHandledAt
  } else {
    handled = !!(a?.replyHandled || b?.replyHandled)
    const stamps = [a?.replyHandled ? a.replyHandledAt : undefined, b?.replyHandled ? b.replyHandledAt : undefined].filter(Boolean) as string[]
    handledAt = stamps.length > 0 ? stamps.sort()[0] : undefined
  }

  if (handled) {
    merged.replyHandled = true
    if (handledAt) merged.replyHandledAt = handledAt
    else delete merged.replyHandledAt
  } else if (changedAt) {
    // Ausdrücklich zurückgenommen: `false` bleibt stehen, statt das Feld zu
    // entfernen. Sonst wäre die Entscheidung im Ergebnis nicht mehr von „nie
    // etwas gesetzt" zu unterscheiden — und das Zusammenführen desselben Stands
    // ein zweites Mal ergäbe etwas anderes als beim ersten Mal.
    merged.replyHandled = false
    delete merged.replyHandledAt
  } else {
    delete merged.replyHandled
    delete merged.replyHandledAt
  }
  if (changedAt) merged.replyHandledChangedAt = changedAt
  else delete merged.replyHandledChangedAt

  const runs = mergeWorkflowRuns(a?.workflowRuns, b?.workflowRuns)
  if (runs && Object.keys(runs).length > 0) merged.workflowRuns = runs
  else delete merged.workflowRuns

  return merged
}

// ── Regel 4: Analysen ───────────────────────────────────────────────────────

/** Vereinigt zwei Analysen. `mine` gewinnt bei exakt gleichem `analyzedAt` —
 *  irgendeine Seite muss gewinnen, und die eigene ist die, die der Nutzer
 *  gerade vor sich hat. */
export function mergeAnalysis(
  mine: MergeableAnalysis | undefined,
  theirs: MergeableAnalysis | undefined
): MergeableAnalysis | undefined {
  if (!mine && !theirs) return undefined
  if (!mine) return applyUserMarks(theirs as MergeableAnalysis, mine, theirs)
  if (!theirs) return applyUserMarks(mine, mine, theirs)
  const winner = newer(theirs.analyzedAt, mine.analyzedAt) ? theirs : mine
  return applyUserMarks(winner, mine, theirs)
}

// ── Regel 2 + 3: ein Datensatz ──────────────────────────────────────────────

/** Vereinigt zwei Datensätze derselben Mail. */
export function mergeEmailRecord(mine: MergeableEmail, theirs: MergeableEmail): MergeableEmail {
  // Regel 2: Die Server-Daten des jüngeren Abrufs sind die Grundlage. Der
  // andere Datensatz wird darunter gelegt, damit Felder, die dem jüngeren
  // Abruf fehlen (ältere App-Version, gekappte Anhangsliste), erhalten bleiben.
  const mineIsNewer = !newer(theirs.fetchedAt, mine.fetchedAt)
  const base = mineIsNewer ? mine : theirs
  const under = mineIsNewer ? theirs : mine

  const merged: MergeableEmail = { ...under, ...base }

  // Regel 3: einbahnige Marken.
  const noteCreated = !!(mine.noteCreated || theirs.noteCreated)
  if (noteCreated) {
    merged.noteCreated = true
    // Der Pfad gehört zu der Seite, die die Notiz angelegt hat.
    merged.notePath = (mine.noteCreated ? mine.notePath : undefined) || (theirs.noteCreated ? theirs.notePath : undefined) || merged.notePath
  } else {
    delete merged.noteCreated
  }
  if (mine.sent || theirs.sent) merged.sent = true

  applyUserProject(merged, mine, theirs)

  const analysis = mergeAnalysis(mine.analysis, theirs.analysis)
  if (analysis) merged.analysis = analysis
  else delete merged.analysis

  return merged
}


/**
 * Entscheidet über die Projektzuordnung.
 *
 * Die Zuordnung kennt drei Zustände: ein Ordner, ausdrücklich „kein Projekt"
 * (`null`) und „automatisch zuordnen" (Feld fehlt). Weil `undefined` keine
 * JSON-Runde übersteht, trägt der Zeitstempel die Absicht: Ist er gesetzt und
 * das Feld fehlt, heißt das ausdrücklich „zurück auf automatisch".
 *
 * Wer zuletzt entschieden hat, gewinnt. Ohne den Zeitstempel — Datensätze von
 * vor dieser Änderung — gilt weiter: gesetzt schlägt ungesetzt, und bei
 * Widerspruch entscheidet der lexikografisch größere Wert. Das ist willkürlich,
 * aber auf beiden Geräten gleich; „das rechnende Gerät gewinnt" wäre es nicht
 * und ließe den Wert zwischen den Geräten pendeln.
 */
function applyUserProject(merged: MergeableEmail, mine: MergeableEmail, theirs: MergeableEmail): void {
  const has = (e: MergeableEmail): boolean =>
    Object.prototype.hasOwnProperty.call(e, 'userProject') && e.userProject !== undefined
  const key = (e: MergeableEmail): string => (has(e) ? JSON.stringify(e.userProject) : '\u0000auto')

  const mineAt = mine.userProjectChangedAt
  const theirsAt = theirs.userProjectChangedAt

  let winner: MergeableEmail
  if (mineAt || theirsAt) {
    if (mineAt && theirsAt && mineAt === theirsAt) winner = key(mine) >= key(theirs) ? mine : theirs
    else winner = newer(mineAt, theirsAt) ? mine : theirs
  } else if (has(mine) && has(theirs)) {
    winner = key(mine) >= key(theirs) ? mine : theirs
  } else if (has(mine)) {
    winner = mine
  } else if (has(theirs)) {
    winner = theirs
  } else {
    delete merged.userProject
    return
  }

  if (has(winner)) merged.userProject = winner.userProject
  else delete merged.userProject

  const changedAt = isoMax(mineAt, theirsAt)
  if (changedAt) merged.userProjectChangedAt = changedAt
  else delete merged.userProjectChangedAt
}

// ── Regel 5: Grabsteine ─────────────────────────────────────────────────────

/** Vereinigt zwei Grabstein-Listen; je ID gilt der spätere Zeitpunkt. */
export function mergeTombstones(mine: EmailTombstones | undefined, theirs: EmailTombstones | undefined): EmailTombstones {
  const out: EmailTombstones = { ...(mine || {}) }
  for (const [id, when] of Object.entries(theirs || {})) {
    out[id] = isoMax(out[id], when) as string
  }
  return out
}

/**
 * Entfernt Grabsteine, deren Aufbewahrung abgelaufen ist.
 *
 * Die Aufbewahrung muss länger sein als die realistische Pause zwischen zwei
 * Geräten. Verschwindet ein Grabstein zu früh, kehrt die gelöschte Mail vom
 * Gerät zurück, das seither nicht synchronisiert hat — stiller Verlust wäre
 * gegen stille Wiederkehr getauscht.
 */
export const MIN_TOMBSTONE_RETENTION_DAYS = 30

export function pruneTombstones(tombstones: EmailTombstones, retentionDays: number, now: number = Date.now()): EmailTombstones {
  const days = Math.max(retentionDays, MIN_TOMBSTONE_RETENTION_DAYS)
  const cutoff = new Date(now - days * 24 * 60 * 60 * 1000).toISOString()
  const out: EmailTombstones = {}
  for (const [id, when] of Object.entries(tombstones)) {
    if (when >= cutoff) out[id] = when
  }
  return out
}

// ── Vereinigung ganzer Listen ───────────────────────────────────────────────

/**
 * Vereinigt zwei Mail-Listen.
 *
 * Reihenfolge des Ergebnisses: erst die Datensätze aus `mine` in ihrer
 * Reihenfolge, dann die, die nur `theirs` kennt. Damit springt die Liste beim
 * Zusammenführen nicht um.
 */
export function mergeEmailLists(
  mine: MergeableEmail[],
  theirs: MergeableEmail[],
  options: MergeOptions = {}
): MergeableEmail[] {
  const tombstones = options.tombstones || {}
  const theirsById = new Map<string, MergeableEmail>()
  for (const e of theirs) {
    if (e && typeof e.id === 'string') theirsById.set(e.id, e)
  }

  const out: MergeableEmail[] = []
  const used = new Set<string>()

  const keep = (record: MergeableEmail): void => {
    const deletedAt = tombstones[record.id]
    // Ein Grabstein streicht die Mail — es sei denn, sie wurde NACH der Löschung
    // erneut vom Server geholt. Dann ist sie echt wieder da und nicht die
    // Rückkehr eines alten Stands.
    if (deletedAt && !newer(record.fetchedAt, deletedAt)) return
    out.push(record)
  }

  for (const m of mine) {
    if (!m || typeof m.id !== 'string') continue
    used.add(m.id)
    const t = theirsById.get(m.id)
    keep(t ? mergeEmailRecord(m, t) : m)
  }
  for (const t of theirs) {
    if (!t || typeof t.id !== 'string' || used.has(t.id)) continue
    used.add(t.id)
    keep(t)
  }

  return out
}

/**
 * Setzt Grabsteine für Mails, die das Aufbewahrungsfenster verlassen, und gibt
 * die verbleibende Liste zurück.
 *
 * Das ist der einzige Weg, auf dem Mails wieder aus der Datei verschwinden
 * dürfen. Ohne Grabstein würde die Liste beim nächsten Abgleich mit einem Gerät,
 * das noch die alten Mails hat, wieder anwachsen — der Nutzer sähe eine
 * Aufräumaktion, die nie greift.
 */
export function pruneWithTombstones(
  emails: MergeableEmail[],
  tombstones: EmailTombstones,
  retainDays: number,
  now: number = Date.now()
): { emails: MergeableEmail[]; tombstones: EmailTombstones } {
  if (!Number.isFinite(retainDays) || retainDays <= 0) {
    return { emails, tombstones }
  }
  const cutoff = new Date(now - retainDays * 24 * 60 * 60 * 1000).toISOString()
  const nowIso = new Date(now).toISOString()
  const kept: MergeableEmail[] = []
  const nextTombstones: EmailTombstones = { ...tombstones }

  for (const e of emails) {
    // Ohne Datum wird nicht gelöscht — lieber eine Mail zu viel behalten als
    // eine wegen eines fehlenden Feldes zu verlieren.
    if (!e.date || e.date >= cutoff) {
      kept.push(e)
      continue
    }
    nextTombstones[e.id] = isoMax(nextTombstones[e.id], nowIso) as string
  }

  return { emails: kept, tombstones: pruneTombstones(nextTombstones, retainDays, now) }
}

// ── Abruf-Merker pro Gerät ──────────────────────────────────────────────────
//
// Warum überhaupt pro Gerät: Der Merker lag bisher EINMAL in der gemeinsamen
// Datei. Holte Gerät A eine Mail und rückte ihn vor, holte Gerät B sie nie
// selbst — B verließ sich darauf, sie über die synchronisierte Liste zu
// bekommen. Genau diese Kopplung machte den Verlust total: Ging die Liste
// verloren, war die Mail für BEIDE Geräte unerreichbar, obwohl sie auf dem
// Server lag. Mit einem eigenen Merker je Gerät holt jedes selbst. Der Preis
// sind doppelte Abrufe; dafür hängt keine Mail mehr an einem einzelnen Gerät.

/** Geräte-Kennung → (Konto/Ordner-Schlüssel → ISO-Zeitpunkt). */
export type DeviceCursors = Record<string, Record<string, string>>

export const DEVICE_CURSOR_FIELD = 'lastFetchedAtByDevice'
export const LEGACY_CURSOR_FIELD = 'lastFetchedAt'

/**
 * Liest den Merker dieses Geräts.
 *
 * Migration: Hat das Gerät noch keinen eigenen Merker, erbt es einmalig den
 * alten gemeinsamen. Bewusst NICHT bei null anfangen — sonst zöge das erste
 * Update jedes Geräts das volle Abruffenster erneut über IMAP. Die Lücke, um
 * die es beim gemeldeten Fehler ging, schließt ohnehin die Vereinigung: Was
 * ein Gerät holt, steht ab jetzt in der Datei und erreicht das andere darüber.
 */
export function readDeviceCursor(
  byDevice: DeviceCursors | undefined,
  legacy: Record<string, string> | undefined,
  deviceId: string
): Record<string, string> {
  const own = byDevice?.[deviceId]
  if (own) return { ...own }
  return { ...(legacy || {}) }
}

/** Bildet aus allen Geräte-Merkern den größten Wert je Schlüssel. Der wandert
 *  in das alte Feld, damit eine ältere App-Version, die dieselbe Datei liest,
 *  sich weiter so verhält wie bisher und nicht das ganze Postfach neu zieht. */
export function flattenDeviceCursors(byDevice: DeviceCursors): Record<string, string> {
  const out: Record<string, string> = {}
  for (const cursor of Object.values(byDevice)) {
    for (const [key, value] of Object.entries(cursor || {})) {
      if (!out[key] || value > out[key]) out[key] = value
    }
  }
  return out
}

/** Schreibt den Merker dieses Geräts zurück; fremde Geräte bleiben unberührt.
 *  Werte laufen nur vorwärts — ein zurückgesetzter Merker würde Mails erneut
 *  ziehen, die längst da sind. */
export function writeDeviceCursor(
  byDevice: DeviceCursors | undefined,
  deviceId: string,
  cursor: Record<string, string>
): DeviceCursors {
  const own = { ...(byDevice?.[deviceId] || {}) }
  for (const [key, value] of Object.entries(cursor)) {
    if (!own[key] || value > own[key]) own[key] = value
  }
  return { ...(byDevice || {}), [deviceId]: own }
}

/** Vereinigt zwei Geräte-Merker-Karten; je Gerät und Schlüssel der spätere Wert. */
export function mergeDeviceCursors(mine: DeviceCursors | undefined, theirs: DeviceCursors | undefined): DeviceCursors {
  const out: DeviceCursors = {}
  for (const source of [theirs || {}, mine || {}]) {
    for (const [deviceId, cursor] of Object.entries(source)) {
      const target = out[deviceId] || (out[deviceId] = {})
      for (const [key, value] of Object.entries(cursor || {})) {
        if (!target[key] || value > target[key]) target[key] = value
      }
    }
  }
  return out
}
