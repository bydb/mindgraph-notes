---
tags: [schnellstart, email]
category: 🔵
---

# E-Mails als Notizen

MindGraph kann dein Postfach abrufen, jede Mail mit lokaler KI bewerten und wichtige Nachrichten als Notizen ablegen.

## Wie es funktioniert

1. **IMAP-Konto verbunden** (im Onboarding oder unter Einstellungen → E-Mail).
2. **Abruf** — MindGraph holt neue Mails alle paar Minuten.
3. **Analyse** — pro Mail wird eingestuft:
   - **Relevanz 0–100** auf Basis der „Email-Instruktionen.md" in deinem Vault.
   - **Sentiment** (neutral, freundlich, kritisch).
   - **Aufgaben** — wenn die Mail eine konkrete Bitte enthält, wird sie als `- [ ]` extrahiert.
4. **Wichtige Mails** landen automatisch als Notiz im Ordner `‼️📧 - emails/`.
5. **Antworten** schreibst du in MindGraph und schickst sie per SMTP raus.

## Was MindGraph **nicht** tut

- **Keine Mail wird ohne deine Bestätigung gesendet.** Du siehst jeden Entwurf und drückst „Senden" selbst.
- **Keine Mail wird gelöscht.** Original bleibt im Server-Postfach.
- **Keine Cloud nötig.** Die Analyse läuft lokal mit Ollama auf deinem Rechner.

## Wo finde ich das alles?

- **Inbox-Panel** (Seitenleiste, Briefumschlag-Symbol): Liste, Filter, Detail-Ansicht.
- **Dashboard-Widget „E-Mails"**: zeigt die relevanten unbeantworteten Mails.

---

Weiter mit [[Aufgaben und Erinnerungen]] →
