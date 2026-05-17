---
id: smart-connections
moduleId: smart-connections
keywords: [ähnlich, verwandt, finden, embedding, semantisch, vorschläge, verbinden]
suggestsModules: [smart-connections]
---

# Smart Connections

## Wann nutzen
Beim Schreiben einer Notiz semantisch verwandte Notizen vorgeschlagen
bekommen — auch wenn keine direkten Wikilinks oder gleiche Tags
existieren. Hilft beim Verknüpfen von altem und neuem Wissen.

## Wie aktivieren
Einstellungen → Module → "Smart Connections". Beim ersten Öffnen
indexiert MindGraph alle Notizen (lokal mit Ollama-Embedding-Modell —
empfohlen: `bge-m3` für deutsche Vaults). Das dauert beim ersten Mal
einige Minuten, danach inkrementell.

## Beispiel
In einer Notiz zu einer aktuellen Idee öffnest du das Smart-Connections-
Panel rechts → siehst eine Liste der semantisch ähnlichsten Notizen mit
Score, klickst rein und verlinkst die relevanten manuell mit `[[...]]`.
