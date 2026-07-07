---
tags: [projekt, uebersicht]
---

# Projekte im Überblick

Diese Tabelle entsteht live aus den Frontmatter-Feldern der Projektnotizen (Dataview):

```dataview
TABLE status, priority FROM #projekt SORT file.name ASC
```

Alle Wissensnotizen als Liste:

```dataview
LIST FROM #wissen SORT file.name ASC
```
