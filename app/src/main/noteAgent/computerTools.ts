// Werkzeuge der Rechner-Steuerung. Jedes Werkzeug ist EIN benannter Vorgang mit festen
// Parametern — es gibt bewusst kein Werkzeug „führe dieses Skript aus". Die Prüfung von
// Freigabe, Budget und Zielen steckt in computerControl.ts, hier steht nur die Beschreibung
// für das Modell und die Rückmeldung ins Laufprotokoll.
import type { AppTool } from '../llm/toolRegistry'
import type { NoteAgentContext } from './skills'
import { createMailDraft, openWithApp, printFile, revealInFinder } from './computerControl'

// Die Zielangabe ist überall dieselbe: entweder der Dateiname eines Ergebnisses, das der
// Agent in diesem Lauf erzeugt hat (den Namen hat er beim Schreiben zurückbekommen), oder
// ein Pfad relativ zum Vault. Ein absoluter Pfad ist nie gültig.
const FILE_PARAM = {
  type: 'string',
  description: 'Dateiname eines Ergebnisses aus diesem Lauf (genau so, wie ihn das Schreib-Werkzeug gemeldet hat) oder ein Pfad relativ zum Vault. Keine absoluten Pfade.'
} as const

export const computerOpenTool: AppTool<NoteAgentContext> = {
  name: 'computer_open',
  description: 'Öffnet eine Datei auf dem Rechner des Nutzers — im Standardprogramm des Dateityps oder in einem ausdrücklich freigegebenen Programm. Nutze das, wenn der Nutzer das Ergebnis gleich ANSEHEN soll. Ein Ergebnis dieses Laufs wird dabei als Kopie geöffnet: Änderungen darin landen NICHT in der Datei, die der Nutzer später übernimmt. Eine Datei aus dem Vault wird im Original geöffnet.',
  parameters: {
    type: 'object',
    properties: {
      file: FILE_PARAM,
      app: { type: 'string', description: 'Optionaler Programmname. Nur freigegebene Programme sind möglich; ohne Angabe entscheidet das System.' }
    },
    required: ['file']
  },
  isWrite: true,
  run: async (args, ctx) => {
    const summary = await openWithApp(ctx.run, args.file, args.app)
    ctx.onStep?.('computer_open', `erledigt · ${summary}`)
    return { ok: true, content: summary }
  }
}

export const computerRevealTool: AppTool<NoteAgentContext> = {
  name: 'computer_reveal',
  description: 'Zeigt eine Datei im Finder (Ordner geht auf, Datei ist ausgewählt), ohne sie zu öffnen.',
  parameters: { type: 'object', properties: { file: FILE_PARAM }, required: ['file'] },
  isWrite: true,
  run: async (args, ctx) => {
    const summary = await revealInFinder(ctx.run, args.file)
    ctx.onStep?.('computer_reveal', `erledigt · ${summary}`)
    return { ok: true, content: summary }
  }
}

export const computerPrintTool: AppTool<NoteAgentContext> = {
  name: 'computer_print',
  description: 'Schickt eine Datei an den Standarddrucker. Möglich sind PDF, Text, Markdown und Bilder — andere Formate vorher nach PDF wandeln. Nur einsetzen, wenn der Auftrag ausdrücklich Drucken verlangt: das verbraucht Papier und lässt sich nicht zurücknehmen.',
  parameters: { type: 'object', properties: { file: FILE_PARAM }, required: ['file'] },
  isWrite: true,
  run: async (args, ctx) => {
    const summary = await printFile(ctx.run, args.file)
    ctx.onStep?.('computer_print', `erledigt · ${summary}`)
    return { ok: true, content: summary }
  }
}

export const computerMailDraftTool: AppTool<NoteAgentContext> = {
  name: 'computer_mail_draft',
  description: 'Öffnet in Apple Mail einen fertig ausgefüllten Entwurf — mit Empfängern, Betreff, Text und optional Dateien als Anhang. Der Entwurf wird NICHT gesendet; der Nutzer liest ihn und sendet selbst. Adressen nur verwenden, wenn sie im Auftrag, in einem Anhang oder in einer Notiz stehen — niemals erfinden.',
  parameters: {
    type: 'object',
    properties: {
      to: { type: 'array', items: { type: 'string' }, description: 'Empfängeradressen, jede einzeln als eigener Eintrag (nicht durch Komma getrennt in einem Feld).' },
      subject: { type: 'string', description: 'Betreffzeile.' },
      body: { type: 'string', description: 'Text der Mail als Klartext.' },
      attach: { type: 'array', items: { type: 'string' }, description: 'Anzuhängende Dateien, je Eintrag wie bei file: Ergebnisname aus diesem Lauf oder vaultrelativer Pfad. Höchstens fünf.' }
    },
    required: ['subject']
  },
  isWrite: true,
  run: async (args, ctx) => {
    const summary = await createMailDraft(ctx.run, { to: args.to, subject: args.subject, body: args.body, attach: args.attach })
    ctx.onStep?.('computer_mail_draft', `erledigt · ${summary}`)
    return { ok: true, content: summary }
  }
}


