---
id: app-dataview
keywords: [dataview, query, abfrage, liste, tabelle, list, table, from, where, sort, limit, frontmatter, dql, kurs, tutorial, lernen]
---

# Dataview — Notizen abfragen wie eine Datenbank

Dataview macht aus deinem Vault eine kleine Datenbank: du formulierst eine
Query, MindGraph durchsucht alle Notizen nach Frontmatter-Feldern, Tags
oder Ordnern und zeigt das Ergebnis als Liste oder Tabelle — live im
Editor.

## Wie eine Dataview-Query aussieht

Schreibe einen Code-Block mit der Sprache `dataview`:

````markdown
```dataview
LIST
FROM #projekt
WHERE status = "aktiv"
```
````

Im **Schreiben-Modus** (live-preview) und **Lesen-Modus** (preview) siehst
du das Ergebnis gerendert. Im **Markdown-Modus** (edit) siehst du die
Query — praktisch zum Bearbeiten. Slash-Command `/dataview` fügt einen
leeren Query-Block an der Cursor-Position ein.

## Lektion 1 — Die einfachste Query

```dataview
LIST
```

Listet **alle** Notizen im Vault. Nicht besonders nützlich, aber der
Einstieg.

## Lektion 2 — FROM filtert die Quelle

```dataview
LIST
FROM #projekt
```

Nur Notizen mit dem Tag `#projekt`. FROM-Varianten:

- `FROM #tag` — Tag-Filter
- `FROM "Ordner"` — Notizen aus einem Ordner (rekursiv)
- `FROM #projekt AND "300 - Schule"` — kombinieren mit AND/OR
- `FROM #projekt AND -#archiv` — Tag ausschließen mit Minus

## Lektion 3 — WHERE filtert nach Frontmatter-Feldern

Wenn deine Notizen Frontmatter haben:

```yaml
---
status: aktiv
prio: 3
fällig: 2026-05-20
---
```

Kannst du danach filtern:

```dataview
LIST
FROM #projekt
WHERE status = "aktiv" AND prio >= 2
```

Operatoren: `=`, `!=`, `>`, `<`, `>=`, `<=`, `contains(array, "wert")`.

## Lektion 4 — TABLE mit Spalten

`LIST` zeigt nur Notiz-Titel. `TABLE` zeigt zusätzliche Spalten:

```dataview
TABLE status, prio, fällig
FROM #projekt
WHERE status = "aktiv"
SORT fällig ASC
```

`SORT feld ASC|DESC` sortiert, `LIMIT 10` begrenzt.

## Lektion 5 — Eingebaute Datei-Felder

Du musst nicht alles im Frontmatter haben — Dataview kennt diese
automatischen Felder:

- `file.name` — Dateiname ohne `.md`
- `file.path` — Pfad im Vault
- `file.folder` — übergeordneter Ordner
- `file.ctime` — Erstelldatum
- `file.mtime` — Änderungsdatum
- `file.tags` — alle Tags der Notiz

Beispiel: zuletzt geänderte Notizen aus einem Ordner:

```dataview
TABLE file.mtime AS "Geändert"
FROM "300 - Schule"
SORT file.mtime DESC
LIMIT 10
```

## Lektion 6 — Vollständiges Praxis-Beispiel

Alle aktiven Projekte aus dem Ordner `400 - Projekte`, sortiert nach
Fälligkeit, max 20:

```dataview
TABLE status, prio AS "P", fällig AS "Deadline"
FROM "400 - Projekte"
WHERE status = "aktiv"
SORT fällig ASC
LIMIT 20
```

## Häufige Probleme

- **Query rendert nicht** → wechsle in den Schreiben- oder Lesen-Modus.
  Im Markdown-Modus siehst du immer den Quelltext.
- **Leere Tabelle** → check, ob Frontmatter-Feldnamen exakt
  übereinstimmen (case-sensitive: `status` ≠ `Status`).
- **Datum vergleichen** → ISO-Format `YYYY-MM-DD` ist am robustesten.

## Wo gibt es mehr Beispiele?

Settings → Editor → "Dataview Queries" hat eine kompakte Syntax-Referenz
mit weiteren Beispielen direkt in der App.
