---
id: app-daily-note
keywords: [daily, note, tagesnotiz, tägliche, tageseintrag, journal, tagebuch, heute, button, sidebar, template, datum, datumsformat]
---

# Tägliche Notiz (Daily Note)

Die Daily-Note-Funktion legt mit einem Klick eine neue Notiz für den
heutigen Tag an — in einem von dir festgelegten Ordner und basierend auf
einem Template deiner Wahl. Praktisch fürs Journal, Tagebuch, Tages-Log
oder kurze Reflektionen.

## Aktivieren

Settings → "Tägliche Notiz" (eigener Tab) → **Tägliche Notiz aktivieren**.
Sobald aktiv, erscheint in der Sidebar **neben der Suche** ein Button mit
Kalender-Icon. Klick legt eine Notiz für heute an (oder springt zu ihr,
falls sie schon existiert).

## Konfiguration

- **Speicherort**: relativer Pfad im Vault, z.B. `Journal` oder
  `200 - Bereich/210 - Privat/211 - Journal`.
- **Template**: eines deiner Templates aus den Template-Einstellungen
  (Standard: das eingebaute `dailyNote`-Template; eigene Templates lassen
  sich dort anlegen).
- **Datumsformat**: bestimmt den Dateinamen — z.B. `DD.MM.YY` →
  `12.05.26.md`, oder `YYYY-MM-DD` → `2026-05-12.md`.
- **Dateiname-Suffix** (optional): z.B. ` - Journal` hängt sich an den
  Datumsnamen an.

## Template-Variablen

Im Template kannst du Platzhalter wie `{{date}}`, `{{title}}` etc.
nutzen (siehe Template-Einstellungen). Beim Anlegen werden sie ersetzt.

## Zusammenspiel mit Brain

Wenn das **Brain** (lokales Tagesgedächtnis) aktiv ist, liest es bis zu
2000 Zeichen aus deiner heutigen Daily-Note und lässt sie in die
Tageskonsolidierung einfließen — dein Journal-Text wird also zur Quelle
für die KI-Tageszusammenfassung.

## Gut zu wissen

- Pro Tag exakt **eine** Daily-Note. Erneuter Klick öffnet die bestehende.
- Daily Notes sind **keine eigene Notiz-Kategorie** — sie können wie jede
  andere Notiz mit 🔴🟢🔵 markiert werden, wenn sinnvoll.
- Funktion ist **pro Vault** aktivierbar (Per-Vault-Toggle in
  `vault-settings.json`). Im neuen Vault musst du sie einmal einschalten.
