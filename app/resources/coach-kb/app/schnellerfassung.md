---
id: app-schnellerfassung
keywords: [schnellerfassung, schnell, schnell-erfassung, quick, quickcapture, quick-capture, transport, tray, tray-icon, titelleiste, shortcut, kurzbefehl, hotkey, globaler-shortcut, inbox, diktat, dictate, capture, notiz-schnell, idee-erfassen, scratchpad]
---

# Schnellerfassung (Quick Capture)

Die Schnellerfassung ist ein **kleines, immer erreichbares Fenster**, in
das du Notizen, Ideen oder Diktate werfen kannst — ohne den Editor im
Hauptfenster zu unterbrechen oder die App wechseln zu müssen.

## Wie öffnest du sie?

Drei Wege — alle führen ins gleiche Fenster:

1. **Globaler Shortcut** (Default: ⌘⇧N / Ctrl⇧N). Funktioniert überall im
   System, auch wenn MindGraph im Hintergrund ist.
2. **Tray-Icon** im System-Tray (macOS Menüleiste / Windows-Tray /
   Linux-Tray, sofern unterstützt).
3. **Button in der Titelleiste** der Haupt-App (optional aktivierbar).

## Was kannst du erfassen?

- **Freier Text** — Markdown wird unterstützt.
- **Diktat** über den ⌘D-Button im Fenster: ruft das eingebaute
  Whisper-STT auf, transkribiert ins Notiz-Feld. Läuft komplett offline
  in der App (kein Cloud-API).
- **Tags** aus einer vordefinierten Liste anklicken.
- **Zielordner** wählen — die Notiz landet als neue Markdown-Datei in
  diesem Ordner (z.B. `00 - Inbox`).

Der Capture-Prozess ist ein **eigener Renderer** mit eigenem RAM-Cache.
Das heißt: das Whisper-Modell wird hier separat geladen, das „Modell
vorbereiten" im Hauptfenster wirkt für die Schnellerfassung nicht.

## Wo stellst du das ein?

**Einstellungen → Schnellerfassung** (eigener Tab in den Settings).
Dort:

- **Master-Schalter** „Schnellerfassung aktiviert".
- **Tastenkürzel** ändern (Klick auf den Recorder, neue Kombi drücken,
  Speichern erfolgt sofort).
- **Button in der Titelleiste** an/aus.
- **Zielordner** (eine Liste — pro Eintrag ein Label und ein
  Vault-relativer Pfad). Einer davon ist der Standard-Zielordner.
- **Vordefinierte Tags** verwalten — die erscheinen dann in der
  Schnellerfassung als anklickbare Chips.

## Typischer Workflow

Idee fällt dir ein → ⌘⇧N → drei Wörter tippen oder ⌘D drücken und
diktieren → Enter → die Notiz liegt im Inbox-Ordner und wartet auf
spätere Verarbeitung. Der Fokus im Hauptfenster bleibt erhalten.

## Plattform-Hinweis

Unter **Linux Cinnamon** erscheint das Tray-Icon teils nicht — in dem
Fall musst du den Shortcut oder den Titelleisten-Button nutzen.
