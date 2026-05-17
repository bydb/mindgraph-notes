---
id: app-graph-canvas
keywords: [graph, canvas, knoten, kante, kanten, wissensgraph, visualisierung, übersicht, layout, hierarchisch, raster, verbindung, verbindungen, netzwerk, mindmap, focus, fokus]
---

# Der Graph (Canvas) — visueller Wissensgraph

Der Graph ist eine **Ansicht auf alle Notizen als visuelle Karte**. Jeder
Knoten ist eine Notiz, die Linien dazwischen sind ihre Wikilinks
(`[[…]]`), Tag-Beziehungen und Ordner-Nähen. Du siehst auf einen Blick,
was womit verbunden ist — und welche Notizen Inseln sind.

## Öffnen

- **⌘ + 3** im Hauptfenster, oder
- View-Switcher oben rechts → **Canvas**, oder
- Eine neue Tab-Ansicht mit Typ „Canvas" über die Tab-Leiste

## Was du siehst

- **Knoten** = Notizen. Farbe = Notiz-Kategorie (🔴 Problem / 🟢 Lösung /
  🔵 Info). Mit konfigurierbarem Inhalt: Tags, Wikilink-Vorschau,
  eingebettete Bilder, kurze Callout-Zusammenfassung (max 100 Wörter).
- **Kanten** = Wikilinks zwischen Notizen. Bei Bedarf zusätzlich Tags
  und Ordner-Nähen.
- **Filter**: „Alle Notizen" oder „Nur Hauptebene" (= Root-Ordner) oder
  spezifischer Ordner via Sidebar.

## Layouts

Drei automatische Layouts (Auswahl oben in der Toolbar):

- **Hierarchisch** — Knoten in Layern nach Wikilink-Richtung. Median-
  basierte Y-Koordinaten, virtuelle Dummy-Nodes für Long-Edges,
  reduziert Kantenkreuzungen sichtbar. Gut für Wissensbäume.
- **Raster** — gleichmäßiges Grid. Praktisch für Übersichten ohne
  Hierarchie.
- **Smart-Raster** — Cluster-basiertes Raster, gruppiert thematisch
  Nahes.

Manuell platzierte Knoten merkt sich MindGraph pro Vault — Layout-Wechsel
überschreibt nichts ungefragt.

## Anzeige-Toggles (Settings → Allgemein → Canvas)

- **Kanten zeigen** — Wikilink-Linien an/aus
- **Tags zeigen** — Tag-Chips auf Karten
- **Wikilinks zeigen** — kleine Link-Vorschau pro Karte
- **Bilder zeigen** — eingebettete Bilder auf der Karte
- **Callout-Zusammenfassungen** — Kurz-Excerpts auf der Karte
- **Compact-Modus** — kleinere Karten, mehr passen ins Bild
- **Read-Modus** — Karten wie kleine Lesemini-Notizen formatiert
- **Default-Kartenbreite** — Pixel-Slider

## Praktische Verwendungen

- **Wissens-Lücken finden**: Notizen ohne eingehende Wikilinks
  („Insel-Knoten") sind oft Kandidaten zum Verlinken oder Archivieren.
- **Cluster erkennen**: dichte Knoten-Gruppen zeigen Themenfelder.
- **Status-Übersicht**: Farbverteilung (🔴/🟢/🔵) je Cluster zeigt
  Aktion (rot) vs. fertiges Wissen (grün).
- **Ausrichten & Verteilen**: Mehrere Knoten markieren → Toolbar
  „Ausrichten" (links/zentrieren/rechts/oben/mitte/unten) und
  „Verteilen" (horizontal/vertikal) für saubere Layouts.
- **Fokus**: Doppelklick auf einen Knoten zoomt zentriert hinein.
- **Export**: Canvas als **SVG** exportieren (Toolbar → Export → SVG)
  für Präsentationen oder Doku.

## Performance-Hinweis

Bei sehr großen Vaults (mehrere tausend Notizen) lädt der Canvas Inhalte
aus dem Cache und kann Bodies bei Bedarf nachladen — Callout-
Zusammenfassungen erscheinen also nicht alle sofort, sondern beim
Heranzoomen / Aktivieren.
