// Testbestand für das Mess-Harness contextEval.live.test.ts.
//
// 14 erfundene Rückmeldungen von Schulen, je rund 7 000 Zeichen. Zusammen passen sie NICHT in
// ein 32k-Fenster — genau der Fall, an dem der Agent am 11.11.2026 nach sieben Notizen aufhörte.
// Jede Notiz trägt drei abfragbare Werte an wechselnden Stellen im Text. Die Werte stehen nur
// in den Notizen, nie im Auftrag: Wer sie im Ergebnis nennt, hat sie gelesen und behalten.
// Zwei Schulen melden bewusst KEIN defektes Gerät — dort zählt eine erfundene Nummer als Fehler.
//
// Keine Personen: nur Funktionen. Alles ist deterministisch erzeugt (kein Zufall zur Laufzeit).

export interface SchoolFacts {
  nr: number
  /** Inventarnummer des defekten Geräts oder null (kein Gerät gemeldet). */
  inventory: string | null
  room: string
  hours: number
}

export const SCHOOL_COUNT = 14

/** Kleiner deterministischer Generator (LCG) — gleiche Fixtures in jedem Lauf. */
function lcg(seed: number): () => number {
  let s = seed >>> 0
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 0x100000000 }
}

export function schoolFacts(count = SCHOOL_COUNT): SchoolFacts[] {
  const rnd = lcg(20261111)
  const out: SchoolFacts[] = []
  const usedInv = new Set<number>()
  const usedRoom = new Set<number>()
  for (let nr = 1; nr <= count; nr++) {
    let inv = 0
    do { inv = 1000 + Math.floor(rnd() * 9000) } while (usedInv.has(inv))
    usedInv.add(inv)
    let room = 0
    do { room = 100 + Math.floor(rnd() * 900) } while (usedRoom.has(room))
    usedRoom.add(room)
    out.push({
      nr,
      inventory: nr % 14 === 5 || nr % 14 === 11 ? null : `INV-${inv}`,
      room: `R-${room}`,
      // 11 bis 59, keine runden Zehner — damit die Zahl nicht zufällig woanders im Text steht.
      hours: 11 + Math.floor(rnd() * 49)
    })
  }
  return out
}

const FILLER = [
  'Das Kollegium hat im vergangenen Halbjahr mehrere Unterrichtsreihen mit digitalen Werkzeugen erprobt. Die Fachgruppen berichten übereinstimmend, dass die Vorbereitung anfangs deutlich mehr Zeit kostet, sich der Aufwand aber nach der zweiten Durchführung spürbar verringert. Besonders in den Jahrgängen der Mittelstufe wurde die Arbeit in festen Lerngruppen als hilfreich beschrieben.',
  'Die Medienbeauftragten weisen darauf hin, dass die Ausleihe der Geräte über das Sekretariat läuft und die Rückgabe am selben Tag erfolgen soll. In den Pausen bleiben die Wagen abgeschlossen. Für die Pflege der Software ist weiterhin der Schulträger zuständig; Meldungen laufen über das bekannte Formular.',
  'In den Fachkonferenzen wurde besprochen, wie Ergebnisse aus dem Unterricht gesichert werden. Einige Lehrkräfte arbeiten mit gemeinsamen Ordnern, andere mit Lerntagebüchern auf Papier. Eine einheitliche Regelung wird nicht angestrebt, wohl aber eine gemeinsame Empfehlung für die Erprobungsstufe.',
  'Die Elternvertretung hat nach den Regeln für die Nutzung privater Geräte gefragt. Die Schulleitung verweist auf die Hausordnung und auf den Beschluss der Schulkonferenz. Eine Überarbeitung ist für das kommende Schuljahr vorgesehen, sobald die Rückmeldungen aller Gremien vorliegen.',
  'Für die Projektwoche sind mehrere Angebote geplant, die Technik und Gestaltung verbinden. Die Anmeldung erfolgt klassenweise. Die Fachschaft Kunst hat angeboten, die Ergebnisse im Foyer auszustellen. Offen ist noch, wie die Betreuung in den Randstunden geregelt wird.',
  'Die Netzabdeckung im Altbau ist nach dem Umbau besser geworden, im Erdgeschoss des Nebengebäudes gibt es aber weiterhin Stellen ohne stabile Verbindung. Der Schulträger hat eine Nachmessung zugesagt. Bis dahin weichen die betroffenen Kurse nach Absprache in andere Räume aus.',
  'Die Schülervertretung wünscht sich mehr Mitsprache bei der Auswahl von Lernprogrammen. Ein erster Austausch mit der Steuergruppe hat stattgefunden. Vereinbart wurde, dass zwei Vertreterinnen und Vertreter der Oberstufe an der nächsten Sitzung teilnehmen und ihre Erfahrungen aus dem Unterricht schildern.',
  'Bei der Bestandsaufnahme der Lehrmittel fiel auf, dass mehrere Sammlungen doppelt geführt werden. Die Verwaltung bittet darum, Neuanschaffungen künftig vorab abzustimmen. Eine gemeinsame Liste liegt im Lehrerzimmer aus und wird zum Halbjahr aktualisiert.',
  'Die Zusammenarbeit mit dem Medienzentrum wurde als verlässlich beschrieben. Besonders die kurzfristige Bereitstellung von Leihgeräten für Prüfungen hat geholfen. Für das nächste Halbjahr wird um frühere Terminabsprachen gebeten, damit die Fahrten gebündelt werden können.',
  'Im Ganztag werden die Lernzeiten inzwischen von zwei Lehrkräften gemeinsam betreut. Die Rückmeldungen der Lernenden sind überwiegend positiv, bemängelt wird die Lautstärke im großen Arbeitsraum. Die Steuergruppe prüft, ob eine Teilung der Gruppe möglich ist.'
]

const REASONS = [
  'der laufenden Sanierung', 'eines Wasserschadens an der Decke', 'festgestellter Brandschutzmängel', 'eines Schimmelbefunds an der Außenwand',
  'der defekten Heizung', 'des Umbaus der Elektrik', 'der Erneuerung des Bodenbelags', 'eines undichten Fensters',
  'der Asbestprüfung im Nebenraum', 'des Einbaus der Lüftungsanlage', 'eines Rohrbruchs im Flur', 'der Arbeiten am Dach',
  'der neuen Akustikdecke', 'des Austauschs der Tafelanlage'
]
const UNTIL = ['bis zu den Osterferien', 'bis zum Ende des Halbjahres', 'voraussichtlich bis Mitte März', 'für mindestens sechs Wochen', 'bis zur Abnahme durch den Schulträger']

/** Der Satz zur Raumsituation im Szenario „Zitat“ — je Schule ein anderer Grund und Zeitraum. */
export function roomSentence(f: SchoolFacts): string {
  return `Der Raum ${f.room} ist wegen ${REASONS[(f.nr - 1) % REASONS.length]} ${UNTIL[(f.nr * 3) % UNTIL.length]} gesperrt.`
}

/** Text einer Rückmeldung. Die drei Werte stehen je nach Schule vorn, in der Mitte oder hinten. */
export function schoolNote(f: SchoolFacts, variedRoomSentence = false): string {
  const rnd = lcg(7000 + f.nr * 31)
  const paragraphs: string[] = []
  for (let i = 0; i < 21; i++) paragraphs.push(FILLER[Math.floor(rnd() * FILLER.length)])
  const device = f.inventory
    ? `Zur Ausstattung: Die Dokumentenkamera mit der Inventarnummer ${f.inventory} ist seit den Ferien defekt und wurde dem Schulträger gemeldet.`
    : 'Zur Ausstattung: Derzeit ist kein Gerät defekt gemeldet; alle Leihgeräte sind einsatzbereit.'
  const room = variedRoomSentence
    ? `Zur Raumsituation: ${roomSentence(f)}`
    : `Zur Raumsituation: Der Raum ${f.room} ist wegen der Sanierung bis auf Weiteres gesperrt und steht für den Unterricht nicht zur Verfügung.`
  const hours = `Zum Fortbildungsbedarf: Das Kollegium wünscht sich im kommenden Halbjahr insgesamt ${f.hours} Fortbildungsstunden zu digitalen Werkzeugen.`
  // Positionen rotieren, damit kein Wert immer am Anfang oder Ende steht.
  const slots = [[1, 10, 18], [16, 3, 11], [8, 19, 5]][f.nr % 3]
  paragraphs.splice(slots[0], 0, device)
  paragraphs.splice(slots[1], 0, room)
  paragraphs.splice(slots[2], 0, hours)
  const nn = String(f.nr).padStart(2, '0')
  return `# Rückmeldung Schule ${nn}\n\nRückmeldung der Schule ${nn} zum Halbjahresgespräch.\n\n${paragraphs.join('\n\n')}\n`
}

export const EVAL_FOLDER = 'Rueckmeldungen'
export const noteFileName = (nr: number): string => `Rückmeldung Schule ${String(nr).padStart(2, '0')}.md`

export const EVAL_INSTRUCTION =
  `Im Ordner „${EVAL_FOLDER}“ liegen ${SCHOOL_COUNT} Rückmeldungen von Schulen. Die Dateien heißen „Rückmeldung Schule 01.md“ bis „Rückmeldung Schule ${SCHOOL_COUNT}.md“. ` +
  `Lies alle ${SCHOOL_COUNT} Notizen und schreibe eine Notiz mit einer Tabelle, eine Zeile je Schule, mit den Spalten: Schule, Inventarnummer des defekten Geräts, gesperrter Raum, gewünschte Fortbildungsstunden. ` +
  'Übernimm die Werte exakt aus den Notizen. Hat eine Schule kein defektes Gerät gemeldet, schreibe „keins“. Konntest du eine Notiz nicht lesen, schreibe in ihre Zeile „nicht gelesen“.'

export interface EvalScore {
  /** Schulen mit eigener Tabellenzeile. */
  rows: number
  /** Richtige Werte (höchstens 3 je Schule, also 42). */
  correct: number
  /** Werte, die in der Zeile fehlen oder als „nicht gelesen“ markiert sind. */
  missing: number
  /** Falsche Werte: eine Nummer, ein Raum oder eine Stundenzahl, die nicht zur Schule gehört. */
  wrong: number
  perSchool: Array<{ nr: number; inventory: 'ok' | 'missing' | 'wrong'; room: 'ok' | 'missing' | 'wrong'; hours: 'ok' | 'missing' | 'wrong' }>
}

/** Ergebnisnotiz gegen die bekannten Werte prüfen. Gewertet wird je Tabellenzeile der Schule. */
export function scoreResult(markdown: string, facts: SchoolFacts[] = schoolFacts()): EvalScore {
  const lines = markdown.split('\n').filter(l => l.includes('|'))
  const score: EvalScore = { rows: 0, correct: 0, missing: 0, wrong: 0, perSchool: [] }
  const tally = (v: 'ok' | 'missing' | 'wrong'): void => { if (v === 'ok') score.correct++; else if (v === 'missing') score.missing++; else score.wrong++ }
  for (const f of facts) {
    const row = rowOf(lines, f.nr)
    if (!row) {
      score.missing += 3
      score.perSchool.push({ nr: f.nr, inventory: 'missing', room: 'missing', hours: 'missing' })
      continue
    }
    score.rows++
    // Zellen, die nur die Schule benennen („07“, „Schule 07“, „Rückmeldung Schule 07.md“), zählen
    // nicht als Werte — sonst wird die Schulnummer bei einer zusätzlichen Spalte „Nr.“ als zweite
    // Stundenzahl gelesen (so geschehen: ein Lauf mit 84 richtigen Werten galt als 28-mal falsch).
    // Die erste Zelle benennt die Schule; eine zweite tut es nur, wenn sie das Wort „Schule“ trägt
    // („| 07 | Schule 07 | …“). Eine nackte Zahl weiter hinten ist ein Wert (die Stundenzahl).
    const filled = row.split('|').map(c => c.trim()).filter(c => c.length > 0)
    const namesSchool = (c: string): boolean => /^\**\s*(?:Rückmeldung\s+)?Schule\s*0?\d{1,2}(?:\.md)?\s*\**$/i.test(c)
    const cells = filled.slice(filled.length > 1 && namesSchool(filled[1]) ? 2 : 1)
    const rest = cells.join(' | ')
    const invTokens: string[] = rest.match(/INV-\d+/g) ?? []
    const inventory: 'ok' | 'missing' | 'wrong' = f.inventory
      // „keins“ bei einer Schule MIT defektem Gerät ist eine falsche Aussage, kein fehlender Wert.
      ? (invTokens.includes(f.inventory) && invTokens.length === 1 ? 'ok' : invTokens.length === 0 ? (cells.some(c => /^[„"“]?keins?[“"”]?$/i.test(c)) ? 'wrong' : 'missing') : 'wrong')
      : (invTokens.length === 0 && /kein/i.test(rest) ? 'ok' : invTokens.length > 0 ? 'wrong' : 'missing')
    const roomTokens: string[] = rest.match(/R-\d+/g) ?? []
    const room: 'ok' | 'missing' | 'wrong' = roomTokens.includes(f.room) && roomTokens.length === 1 ? 'ok' : roomTokens.length === 0 ? 'missing' : 'wrong'
    // Stundenzahl: letzte Zelle mit einer reinen Zahl (Raum und Inventarnummer tragen ein Präfix).
    const numbers = (rest.replace(/INV-\d+|R-\d+/g, '').match(/\b\d{1,3}\b/g) ?? []).map(Number)
    const hours: 'ok' | 'missing' | 'wrong' = numbers.includes(f.hours) && numbers.length === 1 ? 'ok' : numbers.length === 0 ? 'missing' : 'wrong'
    tally(inventory); tally(room); tally(hours)
    score.perSchool.push({ nr: f.nr, inventory, room, hours })
  }
  return score
}

// --- Weitere Szenarien ------------------------------------------------------------------
//
// „zitat“: Verdichten könnte den Wortlaut verlieren — hier wird je Schule der vollständige Satz
// zur Raumsituation verlangt, Zeichen für Zeichen. „gross“: doppelte Menge (28 Notizen).
// „nachfrage“: Der erste Auftrag verlangt NUR die Räume; danach fragt ein Folgeauftrag
// („Antworten und weitermachen“) nach Inventarnummer und Stunden. Was beim Verdichten als
// unwichtig wegfiel, muss der Agent neu lesen — oder er erfindet es. Gewertet wird die
// Tabelle des Folgelaufs; „falsch“ ist hier die entscheidende Spalte.

export type EvalScenario = 'fakten' | 'zitat' | 'gross' | 'nachfrage'

export function scenarioCount(scenario: EvalScenario): number {
  return scenario === 'gross' ? SCHOOL_COUNT * 2 : SCHOOL_COUNT
}

export function scenarioNote(scenario: EvalScenario, f: SchoolFacts): string {
  return schoolNote(f, scenario === 'zitat')
}

export function scenarioInstruction(scenario: EvalScenario): string {
  if (scenario === 'fakten') return EVAL_INSTRUCTION
  const n = scenarioCount(scenario)
  const head = `Im Ordner „${EVAL_FOLDER}“ liegen ${n} Rückmeldungen von Schulen. Die Dateien heißen „Rückmeldung Schule 01.md“ bis „Rückmeldung Schule ${n}.md“. Lies alle ${n} Notizen und schreibe eine Notiz mit einer Tabelle, eine Zeile je Schule, `
  if (scenario === 'nachfrage') {
    return head + 'mit den Spalten: Schule, gesperrter Raum. Übernimm die Werte exakt aus den Notizen. Konntest du eine Notiz nicht lesen, schreibe in ihre Zeile „nicht gelesen“.'
  }
  if (scenario === 'zitat') {
    return head + 'mit den Spalten: Schule, Zitat. In die Spalte Zitat gehört der vollständige Satz, der sagt, welcher Raum gesperrt ist — wörtlich, Zeichen für Zeichen, in Anführungszeichen. Konntest du eine Notiz nicht lesen, schreibe in ihre Zeile „nicht gelesen“.'
  }
  return head + 'mit den Spalten: Schule, Inventarnummer des defekten Geräts, gesperrter Raum, gewünschte Fortbildungsstunden. Übernimm die Werte exakt aus den Notizen. Hat eine Schule kein defektes Gerät gemeldet, schreibe „keins“. Konntest du eine Notiz nicht lesen, schreibe in ihre Zeile „nicht gelesen“.'
}

function rowOf(lines: string[], nr: number): string | undefined {
  return lines.find(l => {
    const first = l.split('|').map(c => c.trim()).find(c => c.length > 0) ?? ''
    const m = /(?:^|\D)0?(\d{1,2})\s*\**$/.exec(first.replace(/\.md\b/i, ''))
    return !!m && Number(m[1]) === nr && !/^[-: ]+$/.test(first)
  })
}

export interface QuoteScore {
  rows: number
  /** Satz Zeichen für Zeichen richtig (Leerraum und Art der Anführungszeichen egal). */
  exact: number
  /** Richtiger Raum, aber der Satz ist verändert oder gekürzt. */
  altered: number
  missing: number
  /** Ein Raum, der nicht zu dieser Schule gehört. */
  wrong: number
}

export function scoreQuotes(markdown: string, facts: SchoolFacts[] = schoolFacts()): QuoteScore {
  const lines = markdown.split('\n').filter(l => l.includes('|'))
  const norm = (t: string): string => t.replace(/\s+/g, ' ').trim()
  const score: QuoteScore = { rows: 0, exact: 0, altered: 0, missing: 0, wrong: 0 }
  for (const f of facts) {
    const row = rowOf(lines, f.nr)
    if (!row) { score.missing++; continue }
    score.rows++
    const text = norm(row)
    const rooms: string[] = text.match(/R-\d+/g) ?? []
    if (text.includes(norm(roomSentence(f)))) score.exact++
    else if (rooms.length === 0) score.missing++
    else if (rooms.every(r => r === f.room)) score.altered++
    else score.wrong++
  }
  return score
}

/** Folgeauftrag im Szenario „nachfrage“. */
export const FOLLOW_UP_ANSWER =
  'Ergänze die Tabelle um zwei Spalten: Inventarnummer des defekten Geräts und gewünschte Fortbildungsstunden. Schreibe die ganze Tabelle neu als Notiz. ' +
  'Übernimm die Werte exakt aus den Notizen. Hat eine Schule kein defektes Gerät gemeldet, schreibe „keins“. Kennst du einen Wert nicht sicher aus der Notiz, lies die Notiz erneut oder schreibe „nicht gelesen“ — rate nie.'
