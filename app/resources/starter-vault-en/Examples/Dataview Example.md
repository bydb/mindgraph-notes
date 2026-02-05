---
tags: [example, dataview]
status: active
priority: high
---

# Dataview Example

**Dataview** lets you query notes by metadata and display them as lists or tables.

## Simple List

```dataview
LIST
FROM #example
```

## Table with Fields

```dataview
TABLE tags, status
FROM #example
SORT file.name ASC
```

## How It Works

1. Write a query in a `dataview` code block
2. Switch to **Live Preview** mode
3. Results are displayed automatically

## Syntax

- `LIST` - Simple list
- `TABLE field1, field2` - Table with columns
- `FROM #tag` or `FROM "Folder"` - Filter source
- `WHERE condition` - Filter results
- `SORT field ASC/DESC` - Sorting
