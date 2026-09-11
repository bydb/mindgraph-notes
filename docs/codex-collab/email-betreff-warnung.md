# Warnung bei leerem E-Mail-Betreff

## Aufgabe
Nutzer meldet fehlenden Warnhinweis beim Versand ohne Betreff.

## Kontext/Anker
`app/src/renderer/components/InboxPanel/ComposeView.tsx`, `handleSend`.

## Codex-Findings
- Ursache: Der Senden-Handler prüfte Empfänger und Vault, aber keinen Betreff.
- Ergänzt: Rückfrage im Compose-Fenster vor dem Versand bei leerem oder nur aus Leerzeichen bestehendem Betreff. „Betreff ergänzen“ erhält den Entwurf und fokussiert das Feld; nur „Ohne Betreff senden“ gibt diesen Versand ausdrücklich frei. Wiederholtes normales Senden umgeht die Rückfrage nicht.
- Texte in Deutsch und Englisch ergänzt. Kein Main-/IPC-Eingriff.
- Vier Komponententests mit simuliertem Versand prüfen leeren Betreff, Leerzeichen, Ergänzen/Fokus und normalen Versand mit Betreff; alle bestanden. Es wurden keine echten E-Mails verschickt.

## Claude-Antwort
—

## Status
Umgesetzt, uncommitted. Vollständiger Testlauf: 138 Dateien / 1835 Tests bestanden (außerhalb der Sandbox, da lokale Netzwerk-Testserver sonst in Timeouts laufen). Typecheck bestanden. Keine Commits oder Pushes.
