---
paths:
  - "app/src/shared/displayHealth*"
  - "app/src/main/displayDiagnostics*"
  - "app/src/renderer/components/Shared/PresentationMode*"
  - "app/src/renderer/components/Settings/PresentationSection*"
  - "app/src/main/transport/**"
  - "app/src/shared/zettel*"
  - "app/src/renderer/utils/voice/**"
  - "app/src/main/voice/**"
  - "app/src/renderer/components/Voice/**"
  - "app/src/renderer/stores/voiceStore*"
  - "app/src/shared/speakableText*"
  - "app/src/shared/ttsLimits*"
  - "app/src/renderer/utils/voice/**"
  - "app/src/renderer/styles/index.css"
---

# Präsentationsmodus, Schnellerfassung, Whisper STT, Sprachausgabe

> Ausgelagert aus CLAUDE.md am 09.11.2026. Wird nur geladen, wenn Dateien aus den obigen Pfaden gelesen werden.

## Präsentationsmodus + Display-/GPU-Diagnose
- Anlass (29.07.2026, real): Präsentation über Apple TV am Beamer — Oberfläche wurde stark verzögert, dann praktisch unbedienbar.
- **Bewertung pur + getestet** in `shared/displayHealth.ts` (`analyzeDisplayHealth`, 17 Unit-Tests). Electron-Anbindung in `main/displayDiagnostics.ts`, IPC `get-display-health` + Push-Event `display-health-changed`.
- 4 Risiko-Gründe: `software-rendering`, `low-refresh-rate` (< 50 Hz), `mixed-scale-factors`, `likely-mirroring`. Die letzten beiden sind auf „zweiter Schirm vorhanden" gegated.
- **GPU-Warmup ist Pflicht** (`GPU_WARMUP_SETTLE_MS`): `app.getGPUFeatureStatus().gpu_compositing` meldet direkt nach `createWindow()` noch `disabled_software` und erst ~1 s nach `did-finish-load` den echten Wert. Ohne das Warmup warnt die App bei JEDEM normalen Start vor einem GPU-Ausfall. `readGpuCompositing()` liefert vor dem Warmup bewusst `undefined` (= unbekannt), damit auch ein früher IPC-Aufruf aus dem Renderer den Fehlalarm nicht einfängt.
- **Fail-open bei unbekanntem GPU-Status**: `isHardwareAccelerated()` gibt `null` (unbekannt) statt `false` zurück. Ein Fehlalarm „Grafik kaputt" wäre schlimmer als ein verpasster Hinweis.
- `refreshHz: 0` heißt „vom OS nicht gemeldet", NICHT 0 Hz — sonst meldet `Math.min` dauerhaft „unter 50 Hz" (Regressionstest vorhanden).
- **Präsentationsmodus** (uiStore `presentationMode`, persistiert): `body.presentation-mode` in `styles/index.css` schaltet `backdrop-filter` (15 ganzflächige Overlay-Weichzeichner, der teuerste Effekt der App) und alle `transition`-Dauern ab. **Dauer 0s, nie „fast null“ (0.01ms)**: ohne eigene `transition-property` gilt `all`, eine Dauer > 0 macht dann jede Eigenschaftsänderung jedes Elements zum Übergang — Mermaid las beim Messen Startwerte, jedes Diagramm wurde ~2000 px breit mit winzigen Kästchen (real, 19.10.2026). **`animation` bleibt bewusst an** — ein eingefrorener Spinner sieht aus wie eine hängende App.
- `presentationMode` wird persistiert (App-Neustart ist der Sofort-Fix bei GPU-Aussetzern, danach muss der Modus noch an sein), `presentationHintDismissed` bewusst NICHT (sonst warnt die App beim nächsten Beamer-Termin nie wieder).
- Kein Automatismus: Der Modus wird nur angeboten (`Shared/PresentationMode.tsx`), nie selbsttätig aktiviert. Manueller Schalter + Diagnose-Anzeige in Einstellungen → Allgemein (`Settings/PresentationSection.tsx`).
- **`getDisplayHealth()` rechnet bei jedem IPC-Aufruf frisch, nie aus dem Cache** — der Renderer fragt genau dann, wenn die App gerade zickt; ein Stand vom Programmstart wäre dort die falsche Antwort. `currentHealth` bleibt dabei unberührt, sonst verschluckt `publish()` den nächsten echten Wechsel im Log.
- **Nicht nur ein Bühnen-Problem** (03.08.2026, Apple Cinema Display): dasselbe Muster im Alltagsbetrieb — App zäh bei großem Fenster, flüssig bei kleinem, ganze UI-Flächen wurden beim Mausbewegen geleert statt neu gezeichnet. **App-Neustart heilte es vollständig.** Merkregel für die Ursachensuche: „nur bei großem Fenster zäh" + „Flächen verschwinden" = Grafikschicht, nicht Layout (ein Layout-Fehler verschiebt Dinge, er löscht sie nicht) — und ein Code-Fehler überlebt einen Neustart. Erst danach im Git-Log suchen. Gegenprobe ohne Grafikkarte: `open -a "MindGraph Notes" --args --disable-gpu`.

## Schnellerfassung: Zettel-Modus
- Umschalter Notiz/Zettel im Transport-Fenster. Zettel-Konvention (gelebt, NICHT das alte Templater-Template): Dateiname `<Emoji-Cluster> - <Titel>.md` (Umlaute bleiben), Frontmatter `id` (JJJJMMTTHHmm)/`created`/`tags` als Inline-Array, Body `**Zitat:**`/`**Mein Gedanke:**`/`**Quelle**`. Pure Bausteine + Frontmatter-Tag-Parser in `shared/zettel.ts` (getestet).
- IPC: `transport-zettel-context` (optionaler `preferredFolder`-Param — konfigurierter Ordner hat Vorrang, sonst ersten Ordner mit „zettelkasten" im Namen finden, BFS max. Tiefe 4; erntet Top-60-Frontmatter-Tags aus dem aufgelösten Ordner), `zettel-suggest-meta` (lokales Ollama schlägt Tags + Emoji-Cluster vor; gleiche Härtung wie `tasks-suggest-tags`: `isHardLocked('task-extraction')`, UNTRUSTED-Marker, JSON-Fallback-Parser), `transport-save-zettel`.
- **Zettel-Zielordner konfigurierbar**: `transport.zettelDestinationFolder` (uiStore, Settings → Schnellerfassung) — leer = Auto-Erkennung. Wird wie das Notiz-Standard-Ziel bei jedem Fenster-Show neu angewandt; Dropdown-Änderungen im Transport-Fenster gelten pro Erfassung.
- Modell-Präzedenz wie Aufgaben-Tagger: `ollama.moduleModelOverrides['task-extraction']` → `selectedModel`. ⌘D-Diktat und ⌘T-Task sind bewusst Notiz-Modus-only (Einfügeziel ist der Notiz-Editor).

## Eingebautes Whisper STT
- `utils/voice/transformersStt.ts` läuft im Renderer via `@huggingface/transformers` v4 + ONNX Runtime.
- **Modell-Konfiguration**: Encoder `q8` (~25 MB), Decoder `fp32` (~150 MB). Wichtig: quantisierter Decoder bricht ONNX-Runtime mit „MatMulNBits-Scales fehlen". Nicht ändern ohne Test.
- **`device: 'wasm'` + `numThreads: 1`** — Electron-Renderer hat ohne COOP/COEP keinen SharedArrayBuffer für Multi-Thread-WASM. WebGPU-Init terminiert nicht zuverlässig.
- **CSP**: `connect-src` für `huggingface.co`, `cas-bridge.xethub.hf.co`, `cdn.jsdelivr.net`; `script-src` mit `wasm-unsafe-eval` + `blob:`; `worker-src 'self' blob:`.
- macOS: Entitlement `com.apple.security.device.audio-input` in `entitlements.mac.plist` **muss** gesetzt sein — ohne blockiert Hardened Runtime stumm.
- Transport-Capture (Schnellerfassung ⌘D) ist ein **eigener Renderer-Prozess** mit eigenem RAM-Cache. „Modell vorbereiten" im Hauptfenster wirkt dort nicht.
- STT-Audio-Datei wird **immer** gelöscht (auch bei Fehler/leerem Transkript). Debug-Erhalt nur via `MINDGRAPH_KEEP_STT_AUDIO=1`.

## Sprachausgabe: Textaufbereitung und MP3-Export
- **`shared/speakableText.ts` ist Single-Source** für alles, was gesprochen wird — Vorlesen (`renderer/utils/voice/tts.ts`) und MP3-Export nutzen dieselbe Funktion, damit Ton und Datei nicht auseinanderlaufen.
- **Zeilenorientiert, nicht als Regex-Kette.** Erst ein Blockdurchlauf über die Zeilen (ganze Zeilen werden verworfen), dann Inline-Bereinigung, die immer nur EINE Zeile sieht. Grund: Die alte Kette nutzte Muster wie `/\[\[([^\]]+)\]\]/g` — `[^\]]` schließt `\n` ein, ein einzelnes `[[` fraß deshalb alles bis zum nächsten `]]`. In `starter-vault-demo/Demo-Tour.md` verschwanden real ein Satz und eine Überschrift aus dem gesprochenen Text. **Keine neuen Regexe einführen, die Zeilengrenzen überschreiten dürfen.**
- Verworfen werden: Frontmatter (via `stripFrontmatter` aus `shared/rag/chunking.ts`), Tabellen, Aufgabenzeilen samt eingerückter Fortsetzungen, Code-/Mermaid-/Dataview-Blöcke (auch nicht geschlossene), E-Mail-Kopfblock, Workflow-Herkunftsbanner, Bildunterschriften, HTML-Kommentare. Der `## Quellen`/`## Sources`-Fußblock wird **nur** abgeschnitten, wenn danach ausschließlich Listenpunkte folgen — sonst verlöre eine Literaturnotiz ihren Inhalt.
- **Emojis bleiben** (Nutzerentscheidung, Schalter `dropEmojis`). **Zwei Profile**: `SPEAKABLE_NOTE` (Default) und `SPEAKABLE_SNIPPET` für Karteikarten und Sprachbefehl-Antworten — dort darf keine Zeile verworfen werden, eine Karteikarte kann aus genau einer Tabelle bestehen.
- **Nie leer zurückgeben**, solange die Eingabe Text enthielt (Fallback auf Minimalbereinigung). Ein stummer Vorlese-Knopf sieht aus wie ein kaputter Knopf.
- **Die drei Markdown-Entstauber bleiben getrennt**: `speakableText.ts` (Sprache), `prepareTextForEmbedding` (`shared/rag/similarity.ts`, bestimmt den Embedding-Cache) und `stripFrontmatter`. Zusammenlegen invalidiert die Smart-Connections-Embeddings.
- **MP3-Export** (`elevenlabs-export-mp3` in `main/index.ts`): Speicherdialog **vor** dem Netzwerkaufruf — ElevenLabs rechnet nach Zeichen ab, ein Abbruch soll nichts kosten. Kein `assertSafePath` auf den Zielpfad (kommt aus dem OS-Dialog, darf außerhalb des Vaults liegen). Menüeintrag nur bei `ttsEngine === 'elevenlabs'` plus gewählter Stimme — aus einem Export-Menü darf kein Cloud-Aufruf entstehen, wenn der Nutzer bewusst die Systemstimme gewählt hat. Zeichenlimits in `shared/ttsLimits.ts` (multilingual_v2 10.000, flash_v2_5 40.000, unbekannt konservativ 10.000).
- **Bekannte Eigenart von ElevenLabs**: Über eine lange Vertonung fällt der Pegel stark ab (real gemessen: Minute 1 bei -33,9 LUFS, Minute 10 bei -46,2). Die App normalisiert nicht — wer die Datei veröffentlicht, muss sie vorher angleichen.
