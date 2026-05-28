---
id: capabilities-truth
keywords: [was kann, wozu, capabilities, features, fähigkeiten, was ist, übersicht, mindgraph, app, was macht, what is, what can, capabilities, overview]
---

# Was MindGraph Notes konkret kann

Diese Notiz beschreibt die echten Fähigkeiten der App in ehrlicher Sprache — bitte nicht ausschmücken.

## Kern (immer verfügbar)

- **Markdown-Notizen** in einem lokalen Vault-Ordner. Jede Notiz ist eine `.md`-Datei, die du auch ohne MindGraph öffnen kannst.
- **Drei Editor-Modi**:
  - **Markdown** — siehst den rohen `**fetten**`-Code.
  - **Schreiben** (Live-Preview) — die Formatierung wird beim Tippen direkt umgesetzt.
  - **Lesen** (WYSIWYG-Preview) — wie ein gerendertes Dokument; Änderungen werden in Markdown zurückgeschrieben.
- **Wikilinks** mit `[[Notiztitel]]` verbinden Notizen — daraus baut die App den Wissensgraph.
- **Aufgaben** werden aus `- [ ] Aufgabentext` automatisch erkannt; `@[[2026-06-01]]` setzt eine Erinnerung auf das Datum.
- **Notiz-Kategorien**: 🔴 Problem (offen, zu erledigen) / 🟢 Lösung (Wissen festhalten) / 🔵 Info (zum Nachschlagen). Wird über Frontmatter `category:` oder Titel-Emoji gesetzt.
- **Backups** vor jedem Schreibzugriff in `.mindgraph/backups/JJJJ-MM-TT/`.

## Optionale Module (in Einstellungen → Module aktivierbar)

- **E-Mail-Client**: holt Mails per IMAP, analysiert sie mit lokaler KI (Ollama) auf Relevanz/Sentiment/Aufgaben, legt sie als Notizen ab, sendet Antworten via SMTP. Funktioniert mit IMAP/SMTP-Servern (Gmail, Outlook/Microsoft 365, web.de, GMX, Strato u.a.).
- **Notes-Chat**: Chat mit deinen Notizen als Kontext (Ollama oder Anthropic).
- **Smart Connections**: semantische Ähnlichkeitssuche zwischen Notizen (Embeddings, opt. LLM-Reranker).
- **Karteikarten + Spaced Repetition**: eigene Karten oder Anki-Import.
- **Brain — Tages-Konsolidierung**: lokale Tageszusammenfassung über Ollama (Notizen, Aufgaben, Mails des Tages).
- **Sprache**: Whisper-STT (Diktat, offline) + TTS (Vorlesen).
- **Telegram-Bot**: kurzer Zugriff aufs Vault unterwegs (eigener Bot-Token).
- **reMarkable**: Dokumente vom reMarkable-Tablet importieren/exportieren (USB).
- **Forschung**: Zotero-Zitate, Semantic Scholar, OpenAlex.
- **Branche-Module**: edoobox (Veranstaltungsverwaltung), Antares (Medienzentren-Verleih), Marketing (WordPress).

## Sync (optional, kostenpflichtig)

E2E-verschlüsselter Sync über einen Relay-Server. Aktivierungscode nötig. **Standard ist lokal** — die App funktioniert komplett ohne Cloud, und Brain/E-Mail-Analyse laufen lokal über Ollama.

## Was MindGraph bewusst NICHT ist

- **Kein autonomes Mail-Plan-Tool.** Mails werden importiert und analysiert; KI-Entwürfe musst du immer selbst freigeben.
- **Kein Split-View-Editor.** Die drei Modi sind nacheinander, nicht nebeneinander.
- **Keine Pflicht-Cloud.** Wenn du den Sync nicht buchst, läuft alles offline.
- **Kein Diagramm-Editor.** Der Wissensgraph zeigt vorhandene Verbindungen, du erstellst sie aber im Text per Wikilink.
- **Kein Obsidian-Plugin und kein Notion-Klon.** Eigene App mit eigenem Vault-Format (das jeder Markdown-Editor versteht).
- **Kein Outlook-Ersatz für alle Funktionen.** Konzentriert auf Posteingang + Analyse + Antwortentwürfe; kein Adressbuch, kein Aufgabenmanager wie Microsoft To-Do.
