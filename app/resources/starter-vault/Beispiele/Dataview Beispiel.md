---
tags: [beispiel, dataview]
status: aktiv
priority: hoch
---

# Dataview Beispiel

**Dataview** erlaubt es dir, Notizen nach Metadaten abzufragen und als Listen oder Tabellen darzustellen.

## Einfache Liste

```dataview
LIST
FROM #beispiel
```

## Tabelle mit Feldern

```dataview
TABLE tags, status
FROM #beispiel
SORT file.name ASC
```

## So funktioniert es

1. Schreibe eine Query in einen `dataview` Code-Block
2. Wechsle in die **Live-Preview** Ansicht
3. Die Ergebnisse werden automatisch angezeigt

## Syntax

- `LIST` - Einfache Liste
- `TABLE feld1, feld2` - Tabelle mit Spalten
- `FROM #tag` oder `FROM "Ordner"` - Quelle filtern
- `WHERE bedingung` - Ergebnisse filtern
- `SORT feld ASC/DESC` - Sortierung
