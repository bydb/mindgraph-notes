---
id: app-notiz-kategorien
keywords: [punkt, punkte, dot, rot, grün, blau, kategorie, kategorien, status, farbe, farben, problem, lösung, info, kind, frontmatter, emoji]
---

# Notiz-Kategorien (🔴 🟢 🔵)

MindGraph kennt drei farbige Notiz-Kategorien, die überall in der App als
kleiner 10-Pixel-Status-Punkt erscheinen — in der Sidebar, in Tabs, im
Editor-Header, im Graph und auf Karten.

## Die drei Kategorien

- **🔴 Rot — Problem**
  Eine Notiz, die noch eine Aktion oder Klärung braucht. Diese Notizen
  landen im **Relevanz-Radar** (Dashboard-Widget): MindGraph schätzt
  täglich neu ein, wie dringend sie sind, und sortiert sie nach oben.

- **🟢 Grün — Lösung / Wissen / Guide**
  Eine Notiz mit fertigem Wissen — Anleitungen, Howtos, gelöste Probleme,
  Konzept-Erklärungen. Wird meist verlinkt, nicht mehr aktiv bearbeitet.

- **🔵 Blau — Info**
  Eine Notiz zum Lesen, ohne Handlungsbedarf — Reader-Material,
  Hintergrund-Lektüre, archivierte Infos.

## Wie wird die Farbe gesetzt?

Erkennung in dieser Reihenfolge (zentral in `utils/noteKind.ts`):

1. **Frontmatter** am Datei-Anfang:
   ```yaml
   ---
   category: red    # oder green | blue
   ---
   ```
   Aliasse: `noteKind: problem`, `kind: solution`, `category: info` …

2. **Titel-Emoji** am Anfang oder direkt nach ` - `:
   - `🔴 Mein Problem.md`
   - `20260512 - 🟢 Anleitung zum Backup.md`

**Pfad-Fallback und Inline-Emoji im Text werden bewusst nicht ausgewertet** —
sonst würden Notizen mit zufälligen Emojis im Body fälschlich kategorisiert.

## Was die Kategorie bewirkt

- Sidebar-Farbfilter (Knöpfe oben in der Sidebar) blenden Kategorien aus.
- Nur 🔴-Notizen kommen ins **Relevanz-Radar** auf dem Dashboard.
- Im Graph-Canvas erkennst du Kategorien an der Knoten-Farbe.
- Beim Verlinken auf eine 🔴-Notiz aus einer 🟢-Notiz wird (optional) ein
  "Solved for"-Backlink ergänzt.
