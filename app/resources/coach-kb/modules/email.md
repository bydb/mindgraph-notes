---
id: email
moduleId: email
keywords: [email, mail, post, imap, smtp, posteingang, antworten, briefkasten]
suggestsModules: [email]
suggestsWidgets: [emails]
---

# Email-Client

## Wann nutzen
Wenn du täglich viele E-Mails bearbeitest und einen Überblick brauchst,
welche dringend sind, welche eine Antwort erwarten und welche nur zur
Info dienen. KI-Analyse markiert Relevanz, extrahiert Aufgaben,
schlägt Entwürfe vor.

## Wie aktivieren
Einstellungen → Module → "Email-Client", dann Einstellungen → Email:
IMAP-Server (Empfang) und SMTP-Server (Versand) konfigurieren,
Account-Passwort wird über safeStorage verschlüsselt gespeichert.

## Beispiel
Beim ersten Sync wird die Inbox geladen, jede Mail bekommt eine
KI-Relevanz (0–100) und einen "Antwort nötig"-Badge. Im Detail-View
"KI"-Knopf öffnet einen Chat, der mit Mail-Kontext + Vault-Kontext
einen Antwortentwurf liefert.
