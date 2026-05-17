---
id: app-wikilinks-tags
keywords: [wikilink, verlinken, link, tag, backlink, querverweis, klammer, hashtag, alias]
---

# Wikilinks, Backlinks und Tags

## Wikilinks

Verlinkst eine andere Notiz mit `[[Notiz-Titel]]`. Beim Tippen schlägt
MindGraph passende Notizen vor. Varianten:

- `[[Notiz-Titel]]` — Link mit dem Titel als Anzeige-Text
- `[[Notiz-Titel|Anderer Text]]` — Link mit Alias-Text
- `[[Notiz-Titel#Überschrift]]` — Sprung zu einer Überschrift
- `[[Notiz-Titel#^block-id]]` — Sprung zu einem Block-Anker

## Backlinks

Zu jeder Notiz siehst du im Backlink-Panel (rechte Sidebar oder
Notiz-Footer) alle anderen Notizen, die per Wikilink auf sie verweisen.
Praktisch zum Erkunden des Wissensnetzes.

## Tags

Tags schreibst du als `#thema` direkt im Body oder im Frontmatter:

```yaml
---
tags: [projekt-x, lernen, offene-frage]
---
```

Tags ohne `#` im Frontmatter, mit `#` im Body — beide werden indexiert.

## Suche & Filter

- **⌘ + P**: Schnellsuche, springt zu Notiz / Heading / Tag
- Sidebar-Filter: nach Tag, Ordner, Notiz-Kategorie (🔴🟢🔵)
- Graph-Canvas: Tags und Wikilinks bilden die Kanten

## Auto-Heal für kaputte Wikilinks

Wenn beim Speichern oder Editieren ein Wikilink durch Escapes
(`\[\[Notiz\]\]`) beschädigt ist, repariert MindGraph ihn beim nächsten
Schreibvorgang automatisch. Du musst nichts tun.
