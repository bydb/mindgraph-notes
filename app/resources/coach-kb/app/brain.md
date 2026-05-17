---
id: app-brain
keywords: [brain, tagesgedächtnis, gedächtnis, konsolidierung, tageszusammenfassung, daily, ki, lokal, ollama]
---

# Brain — lokales Tagesgedächtnis

Das Brain ist MindGraphs lokales KI-Gedächtnis, das einmal pro Tag aus
deiner Aktivität eine **Tageszusammenfassung** in vier Sektionen baut:

- **Heute im Fokus** — was klar im Vordergrund stand
- **Was ich gemacht habe** — erledigte Aufgaben, beantwortete Mails,
  geschriebene Notizen
- **Offene Fäden** — was noch wartet
- **Beobachtung** — eine Mini-Reflexion vom Modell

## Datenschutz first

Brain läuft **ausschließlich** über Ollama auf `localhost:11434` —
hardcoded, kein Cloud-Fallback, keine Telemetrie. Wenn Ollama nicht
läuft, läuft Brain nicht.

## Was Brain als Sensor nutzt

- berührte Notizen (aus dem Aktivitäts-Log und Datei-mtime)
- erledigte Tasks
- empfangene und beantwortete Mails (wenn Email-Modul aktiv)
- optional den Body deiner Daily-Note (max 2000 Zeichen)

## Wo landen die Tageszusammenfassungen?

Default: `800 - 🧠 brain/JJJJ/MM/TT.md` (konfigurierbar in Settings).
Wiederholte Konsolidierungen am selben Tag **überschreiben nichts** —
neue Versionen heißen `TT (2).md`, `TT (3).md`. Human-in-the-Loop ist
hier Architektur, kein Bug.
