---
title: "MindGraph Notes - Wenn Notizen auf KI-Terminal treffen"
subtitle: "Warum ich meine eigene Notiz-App entwickelt habe"
author: Jochen Leeder
date: 2026-01-24
created: 2026-01-24 14:30:00
modified: 2026-01-24 14:30:00
tags:
  - mindgraph
  - notizen
  - ki
  - terminal
  - obsidian
  - markdown
  - wissensgraph
  - open-source
  - produktivitaet
  - blog
status: publish
type: post
summary: MindGraph Notes verbindet klassisches Notizschreiben mit einem integrierten Terminal für KI-Tools. Eine persönliche Reflexion über die Entwicklung und warum das Terminal der entscheidende Unterschied ist.
categories:
  - Technologie
  - Produktivität
---

> [!abstract] Zusammenfassung
> Nach Jahren der Nutzung verschiedener Notiz-Apps fehlte mir immer eines: die nahtlose Integration von KI-Werkzeugen direkt neben meinen Gedanken. MindGraph Notes ist meine Antwort darauf – eine Notiz-App mit integriertem Terminal, das OpenCode, Ollama und andere CLI-Tools direkt zugänglich macht.

## Die Suche nach dem perfekten Workflow

Ich nutze seit Jahren Notiz-Apps. Obsidian, Notion, Bear – sie alle haben ihre Stärken. Aber je mehr ich mit lokalen KI-Modellen wie Ollama arbeitete und Werkzeuge wie OpenCode in meinen Alltag integrierte, desto mehr störte mich etwas Grundlegendes: **Der ständige Kontextwechsel.**

Ich schreibe eine Notiz. Ich wechsle zum Terminal. Ich führe einen KI-Befehl aus. Ich kopiere das Ergebnis. Ich wechsle zurück zur Notiz. Ich füge ein. Wieder und wieder.

Das mag nach einem kleinen Ärgernis klingen, aber wer täglich mit Wissen arbeitet, weiß: Diese kleinen Unterbrechungen summieren sich. Sie reißen uns aus dem Flow. Sie kosten nicht nur Zeit, sondern auch mentale Energie.


## Die Idee: Ein Terminal direkt in der Notiz-App

> [!tip] Der Kerngedanke
> Was wäre, wenn ich OpenCode, Ollama oder jedes andere CLI-Tool direkt neben meinen Notizen starten könnte – ohne die App zu verlassen?

Diese Frage ließ mich nicht mehr los. Also begann ich zu entwickeln. Das Ergebnis ist **MindGraph Notes** – eine moderne Notiz-App mit Wissensgraph und einem Feature, das sie von allen anderen unterscheidet: einem vollwertigen, integrierten Terminal.

### Was das Terminal ermöglicht

Stell dir vor, du sitzt an deinen Meeting-Notizen der letzten Wochen. Du möchtest eine Zusammenfassung. Statt in ein anderes Programm zu wechseln, öffnest du das Terminal in MindGraph Notes und tippst:

```
opencode "Erstelle eine Zusammenfassung aller Meeting-Notizen"
```

Die KI hat direkten Zugriff auf deine Markdown-Dateien. Sekunden später liegt die Zusammenfassung als neue Notiz in deinem Vault. Verlinkt. Durchsuchbar. Teil deines Wissensnetzwerks.

Oder du lernst gerade etwas Neues und möchtest, dass ein lokales LLM dir ein Konzept erklärt:

```
ollama run llama3 "Erkläre [[Quantenmechanik]] einfach"
```

Das Terminal ist keine Spielerei. Es ist der **Hebel**, der Notizen und KI-Werkzeuge verbindet.

## Mehr als nur ein Terminal

Natürlich ist MindGraph Notes nicht nur ein Terminal mit Notiz-Funktion. Die App bietet alles, was man von einer modernen Notiz-App erwartet – und einiges mehr:

### Der Wissensgraph

Jede Notiz ist ein Knoten. Jeder Wikilink eine Verbindung. Der interaktive Graph visualisiert, wie deine Gedanken zusammenhängen. Ich nutze ihn regelmäßig, um versteckte Verbindungen zu entdecken – Zusammenhänge, die mir beim linearen Lesen nie aufgefallen wären.

### Obsidian-Kompatibilität

Deine Notizen sind Markdown-Dateien. Keine proprietären Formate. Die Syntax ist Obsidian-kompatibel: Wikilinks, Embeds, Callouts, Tags. Du kannst jederzeit wechseln oder beide Apps parallel nutzen.

### Lokale KI-Integration

Über das Terminal hinaus bietet MindGraph Notes auch eine integrierte KI-Funktion für Textbearbeitung. Alt+Rechtsklick auf markierten Text öffnet ein Menü: Zusammenfassen, Erklären, Übersetzen, Verbessern. Alles lokal via Ollama – deine Daten verlassen nie deinen Rechner.

> [!warning] Transparenz bei KI-Nutzung
> Jede KI-Interaktion wird automatisch als Fußnote dokumentiert. Du siehst immer, welches Modell verwendet wurde und welche Aktion durchgeführt wurde. Keine versteckte KI.

### PDF-Integration

PDFs können direkt in der App angezeigt werden. Noch wichtiger: Für jedes PDF wird automatisch eine Companion-Notiz erstellt. So kannst du PDFs taggen, verlinken und in deinen Wissensgraph einbinden.

### Zotero-Anbindung

Für akademisches Arbeiten unverzichtbar: Die Zotero-Integration ermöglicht das Einfügen von Literaturverweisen direkt aus deiner Bibliothek.

## 100% Lokal, 100% Open Source

> [!note] Deine Daten gehören dir
> Keine Cloud. Kein Account. Keine Telemetrie. Alle Notizen sind lokale Markdown-Dateien. Der Quellcode ist auf GitHub verfügbar.

In einer Zeit, in der immer mehr Apps unsere Daten in die Cloud schieben, ist mir eines wichtig: **Kontrolle**. MindGraph Notes speichert alles lokal. Du entscheidest, wo deine Gedanken liegen – auf deiner Festplatte, in deinem Backup-System, unter deiner Kontrolle.

Die App ist Open Source. Du kannst den Code lesen, anpassen, verbessern. Das ist für mich nicht nur eine technische Entscheidung, sondern eine ethische.

## Für wen ist MindGraph Notes?

Diese App ist nicht für jeden. Sie ist für Menschen, die:

- Mit lokalen KI-Modellen arbeiten und diese nahtlos in ihren Workflow integrieren wollen
- CLI-Tools lieben und die Kommandozeile nicht fürchten
- Ihre Daten lokal behalten möchten
- Einen Wissensgraphen schätzen, der Zusammenhänge visualisiert
- Markdown bereits nutzen oder nutzen wollen

Wenn du bisher Obsidian nutzt und dir gewünscht hast, OpenCode oder Ollama direkt daneben laufen zu lassen – MindGraph Notes ist für dich.

## Die Zukunft des Denkens

Ich glaube, dass die Art, wie wir mit Wissen arbeiten, sich fundamental verändert. KI wird nicht verschwinden – sie wird besser, zugänglicher, allgegenwärtiger. Die Frage ist nicht, ob wir sie nutzen, sondern wie.

MindGraph Notes ist mein Versuch, diese Frage zu beantworten: KI als Werkzeug, das unser Denken erweitert, nicht ersetzt. Ein Terminal direkt neben unseren Gedanken. Lokale Verarbeitung, die unsere Privatsphäre respektiert. Transparenz darüber, wann KI im Spiel ist.

> [!quote] Die beste Technologie ist die, die verschwindet
> Das Terminal ist da, wenn du es brauchst. Es versteckt sich, wenn du dich auf deine Gedanken konzentrieren willst. Die KI unterstützt, dominiert aber nicht.

## Probier es aus

MindGraph Notes ist kostenlos und Open Source. Du findest die App auf [mindgraph-notes.de](https://mindgraph-notes.de) – verfügbar für macOS (Apple Silicon und Intel). Windows und Linux folgen.

Der Quellcode liegt auf [GitHub](https://github.com/bydb/mindgraph-notes). Feedback, Issues und Pull Requests sind willkommen.

Vielleicht ist es genau das Werkzeug, das dir gefehlt hat. Vielleicht nicht. Aber wenn du wie ich glaubst, dass Notizen und KI-Tools zusammengehören – dann probier es aus.

