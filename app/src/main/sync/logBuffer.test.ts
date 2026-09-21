import { describe, it, expect } from 'vitest'
import { SyncLogBuffer } from './logBuffer'

const weit = { maxLines: 100, maxLineChars: 1000, maxBytes: 100_000 }

describe('SyncLogBuffer', () => {
  it('nimmt Zeilen an, bis der Zeilendeckel erreicht ist', () => {
    const puffer = new SyncLogBuffer({ ...weit, maxLines: 3 })
    puffer.push('a')
    puffer.push('b')
    puffer.push('c')
    expect(puffer.size).toBe(3)
    expect(puffer.missing).toBe(0)
  })

  it('verwirft NEUE Zeilen und behält die alten', () => {
    // Kommt das Schreiben nicht nach, erklären die ersten Zeilen den Anfang der Störung.
    const puffer = new SyncLogBuffer({ ...weit, maxLines: 2 })
    puffer.push('erste')
    puffer.push('zweite')
    puffer.push('dritte')
    puffer.push('vierte')

    const { lines, missing } = puffer.take()
    expect(lines).toEqual(['erste', 'zweite'])
    expect(missing).toBe(2)
  })

  it('meldet eine Fehlzahl genau einmal', () => {
    const puffer = new SyncLogBuffer({ ...weit, maxLines: 1 })
    puffer.push('a')
    puffer.push('weg')
    expect(puffer.take().missing).toBe(1)
    expect(puffer.take().missing).toBe(0)
  })

  it('hat Arbeit, solange Fehlendes ungemeldet ist — auch ohne Zeilen', () => {
    // Sonst bliebe „N Zeilen fehlen" liegen, wenn danach nichts mehr passiert.
    const puffer = new SyncLogBuffer({ ...weit, maxLines: 0 })
    puffer.push('weg')
    expect(puffer.size).toBe(0)
    expect(puffer.hasWork).toBe(true)
  })

  it('ist nach take() wieder leer', () => {
    const puffer = new SyncLogBuffer(weit)
    puffer.push('a')
    puffer.take()
    expect(puffer.hasWork).toBe(false)
    expect(puffer.size).toBe(0)
  })

  it('kürzt überlange Zeilen und sagt, um wie viel', () => {
    // Eine Server-Fehlermeldung landet unverändert im Protokoll; ohne Deckel je Zeile
    // begrenzt die Zeilenzahl den Speicher nicht.
    const puffer = new SyncLogBuffer({ ...weit, maxLineChars: 10 })
    puffer.push('x'.repeat(25))
    const [zeile] = puffer.take().lines
    expect(zeile.startsWith('x'.repeat(10))).toBe(true)
    expect(zeile).toContain('gekürzt um 15 Zeichen')
  })

  it('begrenzt die Bytes insgesamt, nicht nur die Zeilenzahl', () => {
    // Ein Schreibblock darf nie größer werden als die Rotationsgrenze der Datei.
    const puffer = new SyncLogBuffer({ ...weit, maxBytes: 25 })
    puffer.push('0123456789') // 11 Bytes mit Zeilenende
    puffer.push('0123456789') // 22
    puffer.push('0123456789') // wäre 33 → fehlt
    const { lines, missing } = puffer.take()
    expect(lines).toHaveLength(2)
    expect(missing).toBe(1)
  })

  it('rechnet Mehrbyte-Zeichen als Bytes, nicht als Zeichen', () => {
    const puffer = new SyncLogBuffer({ ...weit, maxBytes: 10 })
    puffer.push('ääää') // 8 Bytes + Zeilenende = 9
    puffer.push('ä')    // 3 weitere → über 10
    expect(puffer.take().missing).toBe(1)
  })

  it('setzt das Bytebudget mit take() zurück', () => {
    const puffer = new SyncLogBuffer({ ...weit, maxBytes: 12 })
    puffer.push('0123456789')
    puffer.take()
    puffer.push('0123456789')
    expect(puffer.size).toBe(1)
  })

  it('hält einen Eintrag auf einer Zeile', () => {
    const puffer = new SyncLogBuffer(weit)
    puffer.push('Fehler:\n  Stapelzeile 1\n  Stapelzeile 2')
    const [zeile] = puffer.take().lines
    expect(zeile).not.toContain('\n')
    expect(zeile).toContain('Stapelzeile 2')
  })

  it('zählt nie geschriebene Zeilen zu den fehlenden', () => {
    // Scheitert das Schreiben eines Blocks, sind dessen Zeilen weg — das muss beim
    // nächsten erfolgreichen Schreiben im Protokoll stehen.
    const puffer = new SyncLogBuffer(weit)
    puffer.push('a')
    const block = puffer.take()
    puffer.noteLost(block.lines.length + block.missing)
    expect(puffer.hasWork).toBe(true)
    expect(puffer.take().missing).toBe(1)
  })
})
