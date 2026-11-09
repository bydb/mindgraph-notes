---
paths:
  - "app/src/renderer/components/Canvas/**"
  - "app/src/renderer/utils/layout*"
  - "app/src/renderer/stores/graphStore*"
---

# Graph-Canvas (React Flow)

> Ausgelagert aus CLAUDE.md am 09.11.2026. Wird nur geladen, wenn Dateien aus den obigen Pfaden gelesen werden.

## Canvas (React Flow)
- `GraphCanvas.tsx` rendert Node-Daten aus `useNotesStore().notes`.
- **Wichtig**: Notizen kommen beim Initial-Load oft aus dem Cache mit `content: ''` (siehe `Sidebar.tsx`, Performance-Optimierung).
- Für Features, die echten Markdown-Inhalt brauchen (Callouts, Tasks, externe Links), muss Content bei Bedarf nachgeladen werden (`readFilesBatch` + `updateNote`).
- Anzeige-Toggles in `uiStore`: `canvasShowTags`, `canvasShowLinks`, `canvasShowImages`, `canvasShowSummaries`, `canvasCompactMode`.
- Callout-Zusammenfassungen auf Karten werden auf maximal 100 Wörter begrenzt und die Kartenhöhe dynamisch berechnet.
- **Hierarchisches Layout** in `utils/layoutAlgorithms.ts` (Algorithmus `hierarchical`): virtuelle Dummy-Nodes für Long-Edges (Layer X → Layer X+n), Median-basierte Y-Koordinaten mit Min-Distance, Layer-Width = Median mit 480-px-Cap, horizontaler Gap 60 px. Diagnose-Logs `[Layout] Hierarchical: N dummies inserted, crossings X → Y`.
