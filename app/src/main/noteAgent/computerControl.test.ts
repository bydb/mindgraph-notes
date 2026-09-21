import { beforeEach, afterEach, describe, it, expect } from 'vitest'
import { promises as fs } from 'fs'
import * as path from 'path'
import { tmpdir } from 'os'
import {
  authorizeComputer, buildMailDraftArgs, computerControlAvailability, createMailDraft,
  openWithApp, prepareMailText, printFile, requireComputer, resolveComputerTarget,
  revealInFinder, setComputerProcessStarterForTests, usableComputerVerbs
} from './computerControl'
import { startRun, finishRun, registerResult, type AgentRun } from './runRegistry'
import { normalizeComputerControl, type ComputerControlSettings } from '../../shared/computerControl'

let root: string
let run: AgentRun
let senderId = 900_000

const ALL: ComputerControlSettings = normalizeComputerControl({
  verbs: { open: true, reveal: true, mail_draft: true, print: true },
  apps: [{ id: 'com.microsoft.Word', label: 'Microsoft Word', path: '/Applications/Microsoft Word.app' }],
})

beforeEach(async () => {
  root = await fs.realpath(await fs.mkdtemp(path.join(tmpdir(), 'mindgraph-computer-test-')))
  run = startRun({ senderId: senderId++, noteId: 'test', vaultPath: root, targetFolderRel: '.', targetFolderAbs: root, attachmentIds: [], instruction: 'Test', model: 'test' })!
})
afterEach(async () => {
  run.abort.abort()
  finishRun(run, 'cancelled')
  await fs.rm(root, { recursive: true, force: true })
})

async function allow(settings: ComputerControlSettings = ALL): Promise<void> {
  await authorizeComputer(run, async () => true, settings)
}

// Ein Ergebnis wie es die Schreib-Werkzeuge erzeugen: Datei im Staging + Karte im Lauf.
async function stageResult(name: string, content = 'inhalt'): Promise<void> {
  const dir = path.join(root, '.mindgraph', 'agent-staging', run.runId)
  await fs.mkdir(dir, { recursive: true })
  const stagingPath = path.join(dir, `raw-${name}`)
  await fs.writeFile(stagingPath, content)
  registerResult(run, { stagingPath, suggestedName: name, kind: 'md', summary: 'Test', sources: [] })
}

const onMac = process.platform === 'darwin'

describe('Freigabe', () => {
  it('ist standardmäßig aus — jedes Werkzeug lehnt ohne Freigabe ab', async () => {
    expect(run.computer).toBeUndefined()
    await expect(revealInFinder(run, 'egal.md')).rejects.toThrow(/nicht freigegeben/)
    await expect(createMailDraft(run, { subject: 'Hallo' })).rejects.toThrow(/nicht freigegeben/)
    expect(() => requireComputer(run)).toThrow(/nicht freigegeben/)
  })

  it('entsteht nicht, wenn der Nutzer den Dialog abbricht', async () => {
    if (!onMac) return
    await expect(authorizeComputer(run, async () => false, ALL)).rejects.toThrow(/nicht erlaubt/)
    expect(run.computer).toBeUndefined()
  })

  it('entsteht nicht, wenn kein einziger Vorgang freigegeben ist', async () => {
    const none = normalizeComputerControl({ verbs: { open: false, reveal: false, mail_draft: false, print: false } })
    await expect(authorizeComputer(run, async () => true, none)).rejects.toThrow(/kein Vorgang/)
    expect(run.computer).toBeUndefined()
  })


  it('bleibt aus, wenn der Lauf ein Webrecherche-Lauf ist', async () => {
    run.web = {} as AgentRun['web']
    await expect(authorizeComputer(run, async () => true, ALL)).rejects.toThrow(/getrennte Laufarten/)
  })

  it('startet auf Nicht-macOS gar nicht, statt ungeschützt weiterzumachen', async () => {
    if (onMac) {
      expect(computerControlAvailability().ok).toBe(true)
      return
    }
    expect(computerControlAvailability().ok).toBe(false)
    await expect(authorizeComputer(run, async () => true, ALL)).rejects.toThrow(/macOS/)
  })
})

describe('Freigegebene Vorgänge begrenzen die Werkzeuge', () => {
  it('lehnt einen ausgeschalteten Vorgang ab, auch wenn das Werkzeug aufgerufen wird', async () => {
    if (!onMac) return
    await allow(normalizeComputerControl({ verbs: { open: true, reveal: false, mail_draft: false, print: false } }))
    await stageResult('Liste.md')
    await expect(revealInFinder(run, 'Liste.md')).rejects.toThrow(/nicht freigegeben/)
    await expect(printFile(run, 'Liste.md')).rejects.toThrow(/nicht freigegeben/)
    await expect(createMailDraft(run, { subject: 'Hallo' })).rejects.toThrow(/nicht freigegeben/)
  })

  it('lässt nur freigegebene Programme zu', async () => {
    if (!onMac) return
    await allow()
    await stageResult('Liste.md')
    await expect(openWithApp(run, 'Liste.md', 'Terminal')).rejects.toThrow(/nicht freigegeben/)
  })


  it('deckelt die Zahl der Vorgänge pro Lauf', async () => {
    if (!onMac) return
    await allow()
    await stageResult('Liste.md')
    // Abgelehnte Aufrufe zählen mit: ein Modell soll sich nicht durch Fehlversuche
    // an der Grenze vorbeiprobieren können.
    for (let i = 0; i < 10; i++) {
      await expect(openWithApp(run, 'Liste.md', 'Nicht freigegeben')).rejects.toThrow(/nicht freigegeben/)
    }
    await expect(revealInFinder(run, 'Liste.md')).rejects.toThrow(/Budget erreicht/)
  })
})

describe('Was an ein Programm übergeben werden darf', () => {
  it('findet ein Ergebnis dieses Laufs über seinen Dateinamen und kopiert es', async () => {
    if (!onMac) return
    await allow()
    await stageResult('Teilnehmerliste.md', 'Zeile')
    const target = await resolveComputerTarget(run, 'teilnehmerliste.md')
    expect(target.path).toContain(`${path.sep}outbox${path.sep}`)
    expect(await fs.readFile(target.path, 'utf8')).toBe('Zeile')
    // Die Ergebniskarte bleibt unangetastet — ein Anhang ersetzt die Übernahme nicht.
    expect([...run.results.values()][0].consumed).toBe(false)
  })

  it('nimmt Dateien aus dem Vault über einen relativen Pfad', async () => {
    if (!onMac) return
    await allow()
    await fs.mkdir(path.join(root, 'Projekte'), { recursive: true })
    await fs.writeFile(path.join(root, 'Projekte', 'notiz.md'), 'x')
    // 'direct' (Öffnen, Finder): die echte Datei, damit der Nutzer sie bearbeiten kann.
    const direct = await resolveComputerTarget(run, path.join('Projekte', 'notiz.md'), 'direct')
    expect(direct.path).toBe(path.join(root, 'Projekte', 'notiz.md'))
  })

  it('übergibt beim Drucken und Anhängen eine Kopie, nicht den Vault-Pfad (F02)', async () => {
    if (!onMac) return
    await allow()
    await fs.writeFile(path.join(root, 'bericht.pdf'), 'x')
    const snapshot = await resolveComputerTarget(run, 'bericht.pdf', 'snapshot')
    expect(snapshot.path).toContain(`${path.sep}outbox${path.sep}`)
    expect(snapshot.path).not.toBe(path.join(root, 'bericht.pdf'))
    // Spätere Änderung am Original ändert den übergebenen Stand nicht mehr.
    await fs.writeFile(path.join(root, 'bericht.pdf'), 'ausgetauscht')
    expect(await fs.readFile(snapshot.path, 'utf8')).toBe('x')
  })

  it('lehnt absolute Pfade ab', async () => {
    if (!onMac) return
    await allow()
    await expect(resolveComputerTarget(run, '/etc/hosts')).rejects.toThrow(/keine absoluten Pfade/)
  })

  it('lehnt Pfade außerhalb des Vaults ab, auch über ..', async () => {
    if (!onMac) return
    await allow()
    await expect(resolveComputerTarget(run, '../../etc/hosts')).rejects.toThrow()
  })

  it('gibt die internen .mindgraph-Daten nie heraus', async () => {
    if (!onMac) return
    await allow()
    await fs.mkdir(path.join(root, '.mindgraph'), { recursive: true })
    await fs.writeFile(path.join(root, '.mindgraph', 'emails.json'), '[]')
    await expect(resolveComputerTarget(run, path.join('.mindgraph', 'emails.json'))).rejects.toThrow(/Nicht verwendbar/)
  })

  it('lehnt Ordner und Unbekanntes mit einer brauchbaren Meldung ab', async () => {
    if (!onMac) return
    await allow()
    await fs.mkdir(path.join(root, 'Ordner'), { recursive: true })
    // Einheitliche Meldung mit Absicht (F05): sonst wird der Fehlertext zum Tastwerkzeug,
    // mit dem das Modell unterscheiden kann, ob etwas existiert, ein Ordner oder gesperrt ist.
    await expect(resolveComputerTarget(run, 'Ordner')).rejects.toThrow(/Nicht verwendbar/)
    await expect(resolveComputerTarget(run, 'gibtsnicht.md')).rejects.toThrow(/Nicht verwendbar/)
  })

  it('druckt nur Formate, die wirklich herauskommen', async () => {
    if (!onMac) return
    await allow()
    await stageResult('Liste.md')
    await fs.writeFile(path.join(root, 'Liste.docx'), 'x')
    await expect(printFile(run, 'Liste.docx')).rejects.toThrow(/PDF/)
  })
})

describe('Nachbesserungen aus dem Codex-Review', () => {
  it('F01: öffnet keine HTML-Seite, auch wenn der Agent sie selbst geschrieben hat', async () => {
    if (!onMac) return
    await allow()
    // write_html darf Modell-Markup ungeprüft in die Datei schreiben. Über den Systembrowser
    // geöffnet wäre das ein Ausführungs- und Netzkanal — deshalb Allowlist statt Sperrliste.
    await stageResult('seite.html', '<script>fetch("https://example.invalid")</script>')
    await expect(openWithApp(run, 'seite.html', undefined)).rejects.toThrow(/Dateiformat wird nicht geöffnet/)
  })

  it('F01: öffnet keine ausführbaren Dateien aus dem Vault', async () => {
    if (!onMac) return
    await allow()
    for (const name of ['start.command', 'skript.scpt', 'ablauf.workflow', 'ziel.webloc', 'programm.app']) {
      await fs.writeFile(path.join(root, name), 'x')
      await expect(openWithApp(run, name, undefined), name).rejects.toThrow(/Dateiformat wird nicht geöffnet/)
    }
  })

  it('F01: öffnet weiterhin, was nur angezeigt wird', async () => {
    if (!onMac) return
    await allow()
    await stageResult('Liste.md')
    // Kein echter Aufruf — der Formatfilter sitzt vor dem Systemaufruf; hier zählt nur,
    // dass er NICHT greift. Der Lauf wird vorher abgebrochen, damit `open` nicht startet.
    run.abort.abort()
    await expect(openWithApp(run, 'Liste.md', undefined)).rejects.toThrow(/Abgebrochen/)
  })

  it('F03: wiederholt denselben Vorgang nicht, auch nicht nach unklarem Ausgang', async () => {
    if (!onMac) return
    await allow()
    // Ohne gesetzten Fake startet kein echter Prozess — der erste Versuch scheitert an der
    // Testsperre. Genau darum geht es: auch ein GESCHEITERTER Versuch ist gestartet worden.
    // NIEMALS über printFile — ein früherer Entwurf dieses Tests hat real drei Druckaufträge
    // abgeschickt (20.09.2026).
    await stageResult('Bericht.md')
    await expect(revealInFinder(run, 'Bericht.md')).rejects.toThrow()
    await expect(revealInFinder(run, 'Bericht.md')).rejects.toThrow(/bereits gestartet/)
  })

  it('F07: lehnt einen Namen ab, den es als Ergebnis UND im Vault gibt', async () => {
    if (!onMac) return
    await allow()
    await stageResult('Bericht.pdf', 'aus dem Lauf')
    await fs.writeFile(path.join(root, 'Bericht.pdf'), 'aus dem Vault')
    await expect(resolveComputerTarget(run, 'Bericht.pdf')).rejects.toThrow(/mehrdeutig/)
  })

  it('F05: verrät die Freigabelisten nicht über Fehlermeldungen', async () => {
    if (!onMac) return
    await allow()
    await stageResult('Liste.md')
    const appError = await openWithApp(run, 'Liste.md', 'Terminal').catch(e => String(e.message))
    expect(appError).not.toContain('Microsoft Word')
    expect(appError).not.toContain('com.microsoft.Word')

  })

  it('F06: lässt Vorgänge weg, deren Systemwerkzeug fehlt — und meldet sie', async () => {
    if (!onMac) return
    const result = await authorizeComputer(run, async () => true, ALL)
    // Auf macOS sind alle vier Werkzeuge vorhanden; entscheidend ist, dass die Freigabe
    // überhaupt zwischen „gewünscht" und „ausführbar" unterscheidet und das zurückgibt.
    expect(result.verbs.length + result.missing.length).toBe(4)
    expect(run.computer!.verbs).toEqual(result.verbs)
  })
})

describe('Nachbesserungen aus dem Verständlichkeits-Review', () => {
  it('F04: sagt, ob eine Kopie oder das Original übergeben wird', async () => {
    if (!onMac) return
    await allow()
    await stageResult('Bericht.md', 'x')
    await fs.writeFile(path.join(root, 'vault-datei.md'), 'y')
    // Ein Ergebnis liegt im Staging und wird erst beim Übernehmen geschrieben — was der
    // Agent öffnet, ist immer eine Kopie. Das muss unterscheidbar sein, sonst bearbeitet
    // der Nutzer die Kopie und verliert die Änderungen.
    expect((await resolveComputerTarget(run, 'Bericht.md')).isCopy).toBe(true)
    expect((await resolveComputerTarget(run, 'vault-datei.md', 'direct')).isCopy).toBe(false)
    expect((await resolveComputerTarget(run, 'vault-datei.md', 'snapshot')).isCopy).toBe(true)
  })

  it('F09: trennt gewünschte von wirklich ausführbaren Vorgängen', async () => {
    if (!onMac) return
    const probe = await usableComputerVerbs(ALL)
    expect(probe.usable.length + probe.missing.length).toBe(4)
    // Ein ausgeschalteter Vorgang ist gar nicht erst gewünscht — er darf weder als nutzbar
    // noch als fehlend auftauchen.
    const nurOeffnen = normalizeComputerControl({ verbs: { open: true, reveal: false, mail_draft: false, print: false } })
    const p2 = await usableComputerVerbs(nurOeffnen)
    expect([...p2.usable, ...p2.missing]).toEqual(['open'])
  })
})

describe('F10: Mail-Kürzung wird gemeldet, nicht verschwiegen', () => {
  it('lässt normale Texte unangetastet und meldet nichts', () => {
    const r = prepareMailText('Kurzer Betreff', 'Kurzer Text')
    expect(r.subject).toBe('Kurzer Betreff')
    expect(r.body).toBe('Kurzer Text')
    expect(r.trimmed).toEqual([])
  })

  it('kürzt zu lange Eingaben UND nennt beides', () => {
    const r = prepareMailText('B'.repeat(400), 'T'.repeat(25_000))
    expect(r.subject).toHaveLength(300)
    expect(r.body).toHaveLength(20_000)
    expect(r.trimmed).toHaveLength(2)
    expect(r.trimmed.join(' ')).toMatch(/Betreff/)
    expect(r.trimmed.join(' ')).toMatch(/Text/)
  })

  it('zieht Zeilenumbrüche aus dem Betreff, ohne das als Kürzung zu melden', () => {
    const r = prepareMailText('Zeile eins\nZeile zwei', 'Text')
    expect(r.subject).toBe('Zeile eins Zeile zwei')
    expect(r.trimmed).toEqual([])
  })
})

describe('Aufrufe am System — mit aufgezeichnetem Prozessstarter', () => {
  // Erst der injizierbare Starter macht diese Grenze prüfbar (Codex Runde 2, F14): Vorher
  // lehnte die Testsperre pauschal ab, und ein falscher Binärpfad oder eine vertauschte
  // Argumentreihenfolge wäre grün geblieben. Es startet weiterhin kein echter Prozess.
  let calls: Array<{ file: string; args: string[] }>

  beforeEach(() => {
    calls = []
    setComputerProcessStarterForTests(((file: string, args: string[], _opts: unknown, cb: (e: Error | null, out: string, err: string) => void) => {
      calls.push({ file, args })
      setTimeout(() => cb(null, '', ''), 0)
      return { kill: () => undefined } as never
    }) as never)
  })
  afterEach(() => { setComputerProcessStarterForTests(null) })

  it('öffnet über den bestätigten Programmpfad, nicht über die Bundle-Kennung', async () => {
    if (!onMac) return
    await allow()
    await stageResult('Bericht.pdf')
    await openWithApp(run, 'Bericht.pdf', 'Microsoft Word')
    expect(calls).toHaveLength(1)
    expect(calls[0].file).toBe('/usr/bin/open')
    expect(calls[0].args[0]).toBe('-a')
    expect(calls[0].args[1]).toBe('/Applications/Microsoft Word.app')
    expect(calls[0].args[2]).toContain('outbox')
  })

  it('zeigt im Finder mit -R und druckt über lp', async () => {
    if (!onMac) return
    await allow()
    await stageResult('Bericht.pdf')
    await revealInFinder(run, 'Bericht.pdf')
    await printFile(run, 'Bericht.pdf')
    expect(calls[0]).toMatchObject({ file: '/usr/bin/open' })
    expect(calls[0].args[0]).toBe('-R')
    expect(calls[1].file).toBe('/usr/bin/lp')
    expect(calls[1].args).toHaveLength(1)
  })


  it('übergibt dem Mail-Skript Betreff, Text, Empfänger und Anhänge als getrennte Argumente', async () => {
    if (!onMac) return
    await allow()
    await stageResult('Anlage.pdf')
    await createMailDraft(run, { to: ['a@b.de'], subject: 'Betreff "mit" & -a', body: 'Zeile', attach: ['Anlage.pdf'] })
    expect(calls[0].file).toBe('/usr/bin/osascript')
    expect(calls[0].args[0]).toMatch(/mail-draft\.applescript$/)
    expect(calls[0].args[1]).toBe('Betreff "mit" & -a')
    expect(calls[0].args[2]).toBe('Zeile')
    expect(calls[0].args[3]).toBe('a@b.de')
    expect(calls[0].args[4]).toContain('outbox')
  })


  it('F11: derselbe Mail-Entwurf mit vertauschten Empfängern ist derselbe Vorgang', async () => {
    if (!onMac) return
    await allow()
    await createMailDraft(run, { to: ['a@b.de', 'c@d.de'], subject: 'Test', body: 'x' })
    await expect(createMailDraft(run, { to: ['c@d.de', 'A@B.de'], subject: 'Test', body: 'x' }))
      .rejects.toThrow(/bereits gestartet/)
  })

  it('F13: zwei gleichnamige Vault-Dateien überschreiben sich nicht', async () => {
    if (!onMac) return
    await allow()
    for (const ordner of ['Kunde-A', 'Kunde-B']) {
      await fs.mkdir(path.join(root, ordner), { recursive: true })
      await fs.writeFile(path.join(root, ordner, 'Bericht.pdf'), ordner)
    }
    const a = await resolveComputerTarget(run, path.join('Kunde-A', 'Bericht.pdf'), 'snapshot')
    const b = await resolveComputerTarget(run, path.join('Kunde-B', 'Bericht.pdf'), 'snapshot')
    expect(a.path).not.toBe(b.path)
    expect(await fs.readFile(a.path, 'utf8')).toBe('Kunde-A')
    expect(await fs.readFile(b.path, 'utf8')).toBe('Kunde-B')
  })
})

describe('Testsperre ohne Fake', () => {
  it('startet keinen echten Prozess', async () => {
    if (!onMac) return
    await allow()
    await stageResult('Bericht.pdf')
    await expect(revealInFinder(run, 'Bericht.pdf')).rejects.toThrow(/Testlauf/)
  })
})

describe('Mail-Entwurf', () => {
  it('lehnt Sammel-Empfängerfelder ab, statt sie aufzuspalten', async () => {
    if (!onMac) return
    await allow()
    await expect(createMailDraft(run, { to: ['a@b.de, c@d.de'], subject: 'Test' })).rejects.toThrow(/gültige E-Mail-Adresse/)
  })

  it('braucht mindestens Betreff oder Text', async () => {
    if (!onMac) return
    await allow()
    await expect(createMailDraft(run, { subject: '   ' })).rejects.toThrow(/Betreff oder einen Text/)
  })

  it('legt die Werte als getrennte Argumente ab — nichts wird in das Skript eingesetzt', () => {
    const args = buildMailDraftArgs({
      to: ['a@b.de', 'c@d.de'],
      subject: 'Anmeldung "Kurs" & mehr',
      body: 'Zeile 1\nZeile 2',
      attachments: ['/pfad/Liste.pdf']
    })
    expect(args).toEqual(['Anmeldung "Kurs" & mehr', 'Zeile 1\nZeile 2', 'a@b.de\nc@d.de', '/pfad/Liste.pdf'])
    // Der Betreff steht in genau EINEM Argument, egal welche Zeichen er enthält.
    expect(args[0]).toContain('"')
    expect(args).toHaveLength(4)
  })

  it('lässt den Empfängerteil leer, wenn keine Adresse bekannt ist', () => {
    expect(buildMailDraftArgs({ to: [], subject: 'S', body: '', attachments: [] })[2]).toBe('')
  })
})

