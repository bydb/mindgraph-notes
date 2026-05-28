---
id: office-use-cases
keywords: [büro, mittelstand, office, unternehmen, geschäftsführer, meeting, projekt, kunde, kanzlei, agentur, outlook, exchange]
suggestsModules: [email, notes-chat]
suggestsWidgets: [focus, tasks, emails, calendar, activity, radar]
suggestsProfile: office
---

# Office- und Mittelstands-Use-Cases

Diese Notiz beschreibt, was Office-/Mittelstands-User mit MindGraph konkret tun. Verwende sie als Kontext, wenn der Nutzer aus dem Word/Excel/Outlook-Umfeld kommt.

## Typische Sprache

User kommen aus Microsoft-365-Umgebungen: "Posteingang", "Meeting", "Projekt", "Kunde", "Vorgang", "Aktennotiz". Vermeide Vokabular wie "Wissensgraph", "Knowledge Base", "Vault" oder "Markdown" in der ersten Erklärung — übersetze:
- Vault → "dein Notiz-Ordner"
- Wikilink → "Verweis auf eine andere Notiz"
- Wissensgraph → "Übersicht über deine verbundenen Notizen"
- Brain → "Tageszusammenfassung"

## Use-Case 1 — Posteingang konsolidieren

Der Office-User verbindet sein IMAP-Postfach (Gmail, Outlook/M365, web.de, GMX, Strato). MindGraph holt neue Mails, bewertet jede mit einem Relevanz-Score und extrahiert offene Aufgaben (`- [ ]`). Wichtige Mails landen als Notiz im Vault und tauchen im Dashboard-Widget „E-Mails" auf.

## Use-Case 2 — Meeting-Protokoll mit Aufgaben

Ein leeres Meeting-Protokoll als Notiz starten (Vorlage liegt im Office-Starter-Vault). Während des Meetings Stichpunkte tippen und Aufgaben als `- [ ] Frau Müller bis @[[2026-06-10]]: Angebot prüfen` notieren. Die Aufgabe taucht im Dashboard-Widget „Aufgaben" auf, am Stichtag erscheint die Erinnerung.

## Use-Case 3 — Projektakte mit Status

Eine Notiz pro Projekt (Vorlage `Projektakte.md` im Starter-Vault). Frontmatter `category: 🔴` markiert das Projekt als offene Sache; Wikilinks verweisen auf Mails, Meeting-Protokolle und Kundenmappen. Sobald das Projekt erledigt ist, Kategorie auf 🟢 ändern.

## Use-Case 4 — Kundenmappe

Eine Notiz pro Kunde oder Ansprechpartner. Alle Mails, Meetings, Telefonnotizen, die diesen Kunden erwähnen, verlinken auf diese Notiz via `[[Kunde XY]]`. Im Wissensgraph siehst du sofort, wieviel mit diesem Kunden los ist.

## Use-Case 5 — Schnelle Telefonnotiz

Schnellerfassung (Tray-Icon oder ⌘⇧N) öffnet ein Mini-Fenster. Stichpunkte oder Diktat (⌘D, Whisper-STT) — landet in einer Eingangs-Notiz, die später sortiert werden kann.

## Empfohlene Module für Office-User

- **E-Mail** (zentral) — IMAP/SMTP + lokale KI-Analyse.
- **Notes-Chat** (optional) — Fragen an die eigene Notizsammlung stellen.
- **Sprache** (optional) — Diktat und Vorlesen.
- **Smart Connections** (für später) — wenn der Vault auf 200+ Notizen wächst.

## Empfohlene Widgets

`focus`, `tasks`, `emails`, `calendar`, `activity`, `radar` — Tasks und Mails ganz oben.
