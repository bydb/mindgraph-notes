---
title: "Slash Commands in MindGraph Notes -- Wie Notion, nur lokal"
subtitle: "28 Befehle, die deinen Markdown-Workflow beschleunigen"
author: Jochen Leeder
date: 2026-03-04
created: 2026-03-04 10:00:00
modified: 2026-03-04 10:00:00
tags:
  - mindgraph
  - slash-commands
  - markdown
  - editor
  - produktivitaet
  - notion
  - obsidian
  - blog
status: publish
type: post
summary: "MindGraph Notes v0.2.25 bringt Slash Commands: Tippe / im Editor und waehle aus 28 Befehlen -- Datum-Wikilinks, Formatierung, Callouts und Templates. Wie Notion, aber 100% lokal."
categories:
  - Features
  - Produktivitaet
---

> [!abstract] Zusammenfassung
> Seit v0.2.25 unterstuetzt MindGraph Notes Slash Commands im Editor. Ein `/` am Zeilenanfang oeffnet ein filterbares Dropdown-Menue mit 28 Befehlen -- von Datum-Wikilinks ueber Formatierung bis zu Callout-Typen. Wer Notion kennt, fuehlt sich sofort zuhause. Der Unterschied: Alles laeuft lokal.

## Das Problem

Markdown ist maechtig, aber die Syntax muss man kennen. Wie war nochmal die Callout-Syntax? Was ist der Shortcut fuer eine Tabelle? Und wie fuege ich schnell das heutige Datum als Wikilink ein?

Notion hat dieses Problem elegant geloest: Tippe `/` und ein Menue erscheint. Jetzt kann MindGraph Notes das auch -- ohne Cloud, ohne Account, ohne Telemetrie.

## So funktioniert es

Tippe `/` am Zeilenanfang oder nach einem Leerzeichen. Ein filterbares Dropdown erscheint mit 28 Befehlen:

### Datum & Zeit
- `/today` -- Fuegt `[[2026-03-04]]` als Wikilink ein
- `/tomorrow` -- Wikilink zum morgigen Datum
- `/yesterday` -- Wikilink zum gestrigen Datum
- `/date` -- Aktuelles Datum (konfigurierbares Format)
- `/time` -- Aktuelle Uhrzeit
- `/datetime` -- Datum und Uhrzeit kombiniert

### Formatierung
- `/h1` bis `/h4` -- Ueberschriften
- `/task` -- Checkbox (`- [ ]`)
- `/bullet` -- Aufzaehlung
- `/numbered` -- Nummerierte Liste
- `/code` -- Code-Block mit Sprach-Picker
- `/table` -- Markdown-Tabelle
- `/quote` -- Zitat-Block
- `/divider` -- Horizontale Trennlinie

### 10 Callout-Typen
- `/info`, `/tip`, `/warning`, `/danger`, `/note`
- `/summary`, `/example`, `/question`, `/success`, `/bug`

### Templates
- `/template` -- Oeffnet den Template-Picker

## Konfigurierbare Formate

In den Editor-Einstellungen lassen sich Datums- und Zeitformat anpassen:

- **Datumsformat**: `DD.MM.YYYY`, `YYYY-MM-DD`, `MM/DD/YYYY` und mehr
- **Zeitformat**: `HH:mm`, `hh:mm A`, `HH:mm:ss`
- **Live-Vorschau**: Die Einstellungen zeigen sofort, wie das Ergebnis aussieht

## Warum nicht einfach Shortcuts?

Shortcuts sind schneller -- wenn man sie kennt. Slash Commands sind *entdeckbar*. Man tippt `/` und sieht alle Optionen. Das senkt die Einstiegshuerde fuer neue Nutzer und macht Features sichtbar, die man sonst uebersehen wuerde.

Ausserdem: Datum-Wikilinks (`/today`, `/tomorrow`) sind per Shortcut umstaendlich. Als Slash Command sind sie ein Tastendruck entfernt.

## Fazit

Slash Commands machen MindGraph Notes zugaenglicher, ohne Komplexitaet hinzuzufuegen. Power-User nutzen weiter ihre Shortcuts. Neue Nutzer entdecken Features ueber das `/`-Menue. Und alles bleibt lokal.

**Update auf v0.2.25**: [Download](https://mindgraph-notes.de/#download)
