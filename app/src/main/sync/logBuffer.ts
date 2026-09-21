/**
 * Gedeckelter Zeilenpuffer des Sync-Protokolls — reine Logik, ohne Dateisystem und Uhr.
 *
 * Er sitzt zwischen `sendLog` und dem Schreiben in Blöcken. Die Deckel sind der Grund,
 * warum ein hängendes Dateisystem keinen unbegrenzten Rückstau erzeugen kann: Läuft der
 * Puffer voll, werden NEUE Zeilen verworfen und gezählt, statt Speicher zu fressen.
 *
 * Drei Deckel, nicht einer. Der erste Entwurf begrenzte nur die ANZAHL der Zeilen — eine
 * Handvoll überlanger Meldungen (eine Server-Fehlermeldung landet unverändert hier) hätte
 * trotzdem beliebig viel Speicher belegt und einen Schreibblock erzeugt, der größer ist als
 * die Rotationsgrenze der Datei. Deshalb zusätzlich: Länge je Zeile und Bytes insgesamt.
 *
 * Verworfen wird neu, nicht alt. Wenn das Schreiben nicht nachkommt, erklären die ersten
 * Zeilen den Anfang der Störung — das ist beim Nachlesen der wertvolle Teil. Wie viele
 * fehlen, muss der Aufrufer ins Protokoll schreiben; stillschweigend verschwinden darf
 * nichts.
 */
export interface SyncLogBufferLimits {
  maxLines: number
  /** Längere Zeilen werden gekürzt und als gekürzt gekennzeichnet. */
  maxLineChars: number
  /** Obergrenze für alles Gepufferte zusammen — und damit für einen Schreibblock. */
  maxBytes: number
}

export class SyncLogBuffer {
  private lines: string[] = []
  private bytes: number = 0
  private missingLines: number = 0

  constructor(private readonly limits: SyncLogBufferLimits) {}

  /**
   * Nimmt eine Zeile an (ohne Zeilenende) — oder zählt sie als fehlend, wenn ein Deckel
   * erreicht ist. Zeilenumbrüche in der Meldung werden ersetzt: ein Eintrag bleibt eine Zeile.
   */
  push(line: string): void {
    let text = line.replace(/\s*\r?\n\s*/g, ' ⏎ ')
    if (text.length > this.limits.maxLineChars) {
      const zuviel = text.length - this.limits.maxLineChars
      text = `${text.slice(0, this.limits.maxLineChars)} …[gekürzt um ${zuviel} Zeichen]`
    }
    const groesse = Buffer.byteLength(text, 'utf-8') + 1
    if (this.lines.length >= this.limits.maxLines || this.bytes + groesse > this.limits.maxBytes) {
      this.missingLines++
      return
    }
    this.lines.push(text)
    this.bytes += groesse
  }

  /**
   * Vermerkt Zeilen, die zwar angenommen, aber nie geschrieben wurden (Schreibfehler).
   * Sie wandern in dieselbe Zahl wie die verworfenen: Für den Leser des Protokolls ist
   * beides dasselbe — hier fehlt etwas —, und es darf nicht ungemeldet bleiben.
   */
  noteLost(count: number): void {
    if (count > 0) this.missingLines += count
  }

  /** Gibt es etwas zu schreiben (Zeilen oder eine noch nicht gemeldete Fehlzahl)? */
  get hasWork(): boolean {
    return this.lines.length > 0 || this.missingLines > 0
  }

  get size(): number {
    return this.lines.length
  }

  get missing(): number {
    return this.missingLines
  }

  /**
   * Nimmt alles heraus und setzt den Puffer zurück.
   *
   * Die Fehlzahl wird MIT herausgegeben und dabei genullt: Sie gehört in denselben Block
   * wie die Zeilen, zu denen sie gehört. Scheitert das Schreiben dieses Blocks, muss der
   * Aufrufer sie über `noteLost` zurückmelden — sonst wäre sie selbst verloren.
   */
  take(): { lines: string[]; missing: number } {
    const lines = this.lines
    const missing = this.missingLines
    this.lines = []
    this.bytes = 0
    this.missingLines = 0
    return { lines, missing }
  }
}
