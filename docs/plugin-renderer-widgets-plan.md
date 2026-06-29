# ADR — Plugin Renderer-Widgets (A1, Renderer-Spike)

> Status: **Beschlossen / freigabefähig** (Review-Runde 2 amendiert). **Kein Code.**
> Branch `feat/plugin-renderer-widgets`. Folgt auf **A1 Main-only** (Runtime-Loader, gemergt in #28).
> Anker: **ein Sidebar-/Dashboard-Widget**. Gegründet auf Codebase-Research + adversariale Prüfung
> (6 Angriffsflächen). **Spike 1 = ausschließlich Tier 1 (deklarativ).** Tier 2 ist ein gated Folge-Increment.

## 1. Ziel & Anker

Externe (disk-installierte, signaturgeprüfte) Plugins sollen ein **Widget** in Dashboard/Sidebar
beitragen. Das Widget ist klein, sichtbar und zwingt die neue Vertrauensgrenze:
**Renderer-Code eines externen Plugins ist UNTRUSTED** — deutlich schärfer als Main-only (dort genügten
Signatur + Autorvertrauen). Settings sind über `settingsSchema` bereits weitgehend deklarativ lösbar
(testen die Grenze kaum); ein eigener Tab wäre für den ersten Spike zu groß.

## 2. Bindende Leitplanken (User — NICHT verhandelbar)

1. **Einfache Widgets deklarativ** (Host rendert native React aus Daten/Schema; **kein Plugin-JS im Host**).
2. **Individuelle Widgets in einer Sandbox** — umgesetzt als **session-partitionierter `WebContentsView`**
   (§5, Beschluss Option B), NICHT als shared-session `<iframe>`.
3. **Kein Zugriff** auf `electronAPI`, Host-DOM oder Host-CSS.
4. **Kommunikation ausschließlich über schema-validiertes Message-Passing.**
5. **Host kontrolliert** Größe, CSP, erlaubte Aktionen und Unload.
6. **`plugin:invoke` ist NICHT die Widget-Allowlist:** der Host fixiert die `pluginId` SELBST und erlaubt
   pro Widget ausschließlich die im Manifest deklarierten Action-IDs. Weder Plugin-ID noch Zielaktion
   dürfen frei aus der Nachricht stammen — gilt für **beide** Tiers (§4, §5.4).
7. **Identität nicht über `event.origin`** (s. §5.4 — WebContentsView-Semantik: `webContents.id` + Nonce
   + `MessagePortMain`, nicht `event.source`/Origin).
8. **Sandbox minimal** — Prozess-Sandbox + explizit gepinnte `webPreferences`, Permission-Deny, eigene
   flüchtige Session (§5.2). Keine Popups/Navigation/Downloads/Forms/Storage.
9. **Der bestehende React-Slot-Pfad bleibt `bundled-only`** und wird NICHT angefasst.

## 3. Ausgangsbefund (Codebase-Research, belegt)

- **Bestehender Renderer-Slot-Pfad = `bundled-only`, Volltrauen:** `RendererPluginRegistry` +
  `discoverRendererPlugins()` (`renderer/plugins/registry.ts:50`) nutzt `import.meta.glob(...,{eager:true})`
  (**Build-Zeit**, nur In-Repo-Quelle); `PluginSlot` (`slots.tsx`) mountet via `React.lazy` **direkt in den
  Host-React-Baum** (gleiches DOM/CSS/`electronAPI`). Externe Plugins hierüber = sofortiger Vollausbruch.
- **Manifest-Fläche existiert, ungenutzt:** `ui.{dashboardWidget,sidebarPanel}: SlotDecl{slot,fromAction?}`,
  `entrypoints.renderer`, `settingsSchema` (`packages/plugin-api/src/manifest.ts`) — ajv-validiert, **null
  Renderer-Konsumenten**.
- **A1 lehnt Renderer-only ab** (`discover.ts:68`/`install.ts:88`). **Für Tier 1 irrelevant** (ein
  deklaratives Widget-Plugin hat sowieso eine `main`-Action als `fromAction`, ist also nicht renderer-only);
  erst Tier 2 braucht eine Renderer-Artefakt-Naht.
- **Host-Isolation heute korrekt, teils per Default:** `contextIsolation:true`, `nodeIntegration:false`,
  `webSecurity` nicht überschrieben, preload→`electronAPI` nur Top-Frame; `isTrustedSender`
  (`transport.ts:18-28`) lehnt Subframes ab.
- **`registry.invoke` gated per-Action/Manifest, NICHT per-aufrufendem-Widget** — das per-Widget-Scoping ist
  die neue Trust-Engstelle (§4/§5.4).
- **Zu bannende Fallen:** `setWindowOpenHandler` (`index.ts:830`) **fail-open**; `sanitizeHtml`
  (`utils/sanitize.ts`) **permissiv** (erlaubt `style`/`class`/`id`/`iframe`/`img`/`svg`/`input`);
  un-sandboxed PDF-blob-iframe (`MarkdownEditor.tsx:3764`); **kein** `webRequest`-Egress-Filter; **kein**
  state-change-Push (nur `plugin:list`-Pull); **statische** Slot-Registry (kein remove/clear).

## 4. Tier 1 — DEKLARATIV (Spike 1, ship-first, **null Script-Surface**)

Der Anker-Fall. Kein WebContents, **kein `renderer.js`**, kein Plugin-JS im Renderer. **Tier 1 liest
ausschließlich das signierte Manifest und ruft eine Main-Action auf; externe Renderer-Artefakte bleiben
bis Tier 2 vollständig ungenutzt.**

- **Manifest (Review-Runde 3, KEIN `view`-Template):** `ui.dashboardWidget = { slot, fromAction }` — `slot`
  ist strikt `'dashboard.widget' | 'sidebar.panel'` (`WidgetSlot`, ajv-`enum`, `additionalProperties:false`).
  **Die `fromAction` liefert zur Laufzeit DIREKT die vollständige `WidgetView`**, die der Host gegen
  `WIDGET_VIEW_SCHEMA` validiert — KEIN zweites `view`-Schema/Template im Manifest (einfacher, ein
  Validierungssystem statt zwei).
- **Eigene Registry:** externe deklarative Widgets bekommen eine **neue, getrennte `ExternalWidgetRegistry`**
  (renderer), die die `ui.*`-Deklarationen aus dem (signierten) Main-Plugin-State liest. **NICHT** die
  bestehende Vollvertrauens-`RendererPluginRegistry`/`PluginSlot` (`bundled-only`, unverändert). `slot` ist
  `WidgetSlot`-typisiert; unbekannte Slots werden zur Laufzeit verworfen; `getBySlot()` liefert eine Kopie
  (interner Zustand gekapselt).
- **Datenfluss über scoped Main-IPC:** der Host mountet eine Widget-Instanz mit einer **Main-seitig erzeugten
  `instanceId`, die Plugin + Action + Slot UNVERÄNDERLICH bindet** (bei Disable/Uninstall gelöscht); der
  Renderer ruft **`plugin:widgetData(instanceId)`** — **Main** löst `instanceId → (pluginId, fromAction)`
  aus seinem EIGENEN State auf und ruft die Action. Der Renderer benennt **nie** Plugin, Action oder Slot;
  **kein** frei parametrisiertes `pluginInvoke` im Tier-1-Pfad.
- **`fromAction` = Widget-Provider, BEIDE Marker Pflicht:** der Host akzeptiert eine `fromAction` NUR, wenn
  die referenzierte Action **`widgetProvider: true` UND `isWrite: false`** trägt (nebenwirkungsfrei). Beide
  Marker sind im Manifest erforderlich (`ActionDef.widgetProvider`). **Feste Host-Limits, erzwungen in Main:**
  max. Textlänge je Feld, max. Zeilen/Items, max. Payload-Bytes, min. Refresh-Intervall, max. parallele
  Requests je Instanz. Überschreitung → abgeschnitten/abgelehnt.
- **Rendering:** festes, host-eigenes, allowlisted Vokabular nativer React-Primitive für v1:
  **`stats | list | keyValue | progress | badge`** (inkl. 🔴🟢🔵-Status-Dot über `utils/noteKind.ts`).
  **Plugin-Strings ausschließlich als React-TEXT-Nodes (auto-escaped).**
- **Host-Demarkation verpflichtend (Amendment, auch Tier 1):** jede Widget-Fläche trägt einen vom Host
  gezeichneten, nicht vom Plugin beeinflussbaren Rahmen/Badge **„Externes Plugin · <id>"**. Kein
  host-privilegierter Prompt (Passphrase, Senden-Bestätigung, Credential-Eingabe) je in/neben einer
  Plugin-Region.
- **Mount:** an den bestehenden hardcodeten Slot-IDs (`dashboard.widget.<id>`/`sidebar.panel.<id>`),
  host-gerendert, **nie** `React.lazy(fremder Code)`; Container `contain: layout paint style` +
  `overflow:hidden` + `SlotErrorBoundary`.

> **Sicherheits-Korrektur (Attack HIGH, DOM/CSS-Overlay-Phishing):** **Invariante I-D1:** Tier 1 = **NULL
> Roh-HTML**, **kein `dangerouslySetInnerHTML`**, kein `sanitizeHtml`/`sanitizeEmailHtml` (erlauben `style`
> → Full-Viewport-Phishing-Overlay). **I-D2:** `view`/Output-Schemas `additionalProperties:false`; **keine**
> Felder `style`/`className`/`id`/`html`/`url`/`href`/`src`. Host besitzt 100 % des Stylings. **I-D3:**
> `contain`-Wrapper fängt jeden residualen positionierten Ausbruch. (Falls Rich-Text je nötig: NEUER
> `sanitizePluginWidgetHtml`, niemals die Vault-Sanitizer.)

Tier 1 deckt ~90 % der Widgets, ist deletion-test-konform und hat **keine** WebContents-/Script-Angriffsfläche.

## 5. Tier 2 — SANDBOXED CUSTOM-WIDGET (gated, **zweiter** Increment) — Beschluss: **WebContentsView**

Beschlossen: **Option B — session-partitionierter `WebContentsView`** (eigener Renderer-Prozess + eigene
Session) statt shared-session `<iframe>`. Grund: ein iframe erbt die Host-Session + den Host-Thread →
Navigations-Exfil (`location.href='https://…'`, von CSP nicht abdeckbar) und CPU-DoS sind **strukturell**
nicht schließbar. Ein eigener WebContents gibt die einzige saubere, CSP-unabhängige Egress- und
Prozess-Grenze. (Detail der Durchsetzung, nicht der Sicherheitsrichtung.)

### 5.1 Laden — privilegiertes `mgxplugin://`, **pro Session** registriert
`protocol.registerSchemesAsPrivileged([{scheme:'mgxplugin', privileges:{standard:true, secure:true,
supportFetchAPI:true, corsEnabled:false}}])` VOR `app.whenReady()`. Der **Handler wird auf der flüchtigen
Widget-Session** registriert (`view.webContents.session.protocol.handle`), nicht global → das Protokoll ist
nur in der jeweiligen Widget-Session erreichbar und auf deren Plugin-`<id>` scopebar. Pro Request:
`assertSafeStoreVersionDir` (Symlink/Traversal/Containment) → Datei in `integrity.json` gelistet → Antwort
mit striktem CSP-Header.

> **Invarianten (Attack MEDIUM, „nicht-verifizierte Bytes"):** **I-L1** erwarteter Hash AUSSCHLIESSLICH aus
> einer **In-Memory-Map** (von `verifyInstalledDir` inkl. Ed25519 bei Aktivierung befüllt), NIE aus frischem
> On-Disk-Read der `integrity.json`. **I-L2** Serve gated auf den **In-Memory-Registry-Laufzeitzustand**
> (blockedIds + Re-Verify + Aktivierung angewandt), NICHT auf frisches `active.json`. **I-L3** jede `200`
> trägt den CSP-Header aus EINEM Chokepoint; jeder Edge → `403/404` ohne Body. **I-L4** `script-src`
> host-scoped `mgxplugin://<id>` (nicht schemaweit). **I-L5 (Read-once, Amendment):** Datei **einmal** lesen,
> gegen den verifizierten In-Memory-Hash prüfen und **exakt denselben Buffer** ausliefern (kein zweites
> Read zwischen Prüfung und Serve → kein TOCTOU).

### 5.2 Prozess-/Session-Isolation (WebContentsView-Semantik)
- **Pro Widget eine flüchtige Session** (`session.fromPartition(<einmalige id>, {cache:false})` bzw.
  In-Memory-Session) — kein geteilter Storage/Cache mit Host oder anderen Plugins.
- **Explizit gepinnte `webPreferences`** auf dem WebContentsView: `sandbox:true` (Prozess-Sandbox),
  `contextIsolation:true`, `nodeIntegration:false`, `nodeIntegrationInSubFrames:false`, `webviewTag:false`,
  `webSecurity:true`, **kein** Host-`preload` (oder ein minimaler, electronAPI-freier) → **kein
  `electronAPI`**, kein Node.
- **Permission-Deny** auf der Session: `setPermissionRequestHandler(()=>cb(false))` +
  `setPermissionCheckHandler(()=>false)` (Kamera/Mikro/Geolocation/Notifications/Clipboard … alles verweigert).
- **Egress-Filter** auf der Session: `webRequest.onBeforeRequest` → `cancel:true` für **jeden** Request, dessen
  Scheme ≠ `mgxplugin:` (fängt Navigation, Subresource, Beacon, Prefetch, WebRTC unter allen CSP-Lücken) +
  `will-navigate`/`will-frame-navigate` → `preventDefault()` für jedes Ziel ≠ `mgxplugin://`. `setWindowOpenHandler`
  → `deny`.
- **Frame-CSP** (Response-Header, host-gesetzt, nicht abschwächbar): `default-src 'none'; script-src
  mgxplugin://<id>; style-src mgxplugin://<id> 'unsafe-inline'; img-src mgxplugin://<id> data:; font-src
  mgxplugin://<id>; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none';
  frame-ancestors 'none'`.
- **Pflicht-Test:** Host-`webContents` und Widget-`webContents` laufen nachweislich in **unterschiedlichen
  Renderer-Prozessen** (`getOSProcessId()` verschieden) — sonst friert ein `for(;;){}` den Host (CPU-DoS).
  Hang/Crash-Detection aus dem **Main** (`render-process-gone`), nicht aus dem Renderer.
- **I-A3 (hierher verschoben):** der WebContentsView wird an EINEM gehärteten Ort konstruiert; die
  `webPreferences` + Session-Policy sind nicht-überschreibbare Konstanten (+ Test).

### 5.3 Broker — vollständig im **Main-Prozess** über `MessagePortMain`
Kein `iframe.contentWindow`, kein `event.source`, kein renderer-seitiger Broker (der wäre durch Top-Frame-XSS
+ generisches `pluginInvoke` umgehbar). Stattdessen:
- Main erzeugt `MessageChannelMain`, behält `port1`, sendet `port2` an die Widget-`webContents` via
  `webContents.postMessage('mgx:init', { nonce }, [port2])`. **Identität** = die feste `webContents.id` des
  Widget-Views + der **Nonce** (instanzgebunden, Einmal-Init; zweites Init ablehnen).
- **Envelope (ajv, `additionalProperties:false`):** inbound `{type:'invoke', requestId, actionId, payload}`
  (+ `resize`/`ready`/`log`); outbound `{type:'result', requestId, ok, data?|error?}`. **Kein** `pluginId`/
  `method`/`capability`-Feld im Envelope.

> **Invarianten (Attack HIGH, „Broker zu nicht-deklarierter Action"):** **I-B1** `pluginId` ist beim Mount an
> den WebContentsView gebunden (`webContents.id → pluginId`-Map, main-seitig), NIE aus einer Nachricht.
> **I-B2** `actionId` nur aus der signierten `ui.*.fromAction` (+ optionale explizite Manifest-Allowlist),
> exakt case-sensitiv. **I-B3** Rate-/In-Flight-/Payload-Limit + Frequenz-Cap auf ALLE Message-Typen VOR
> Deserialisierung/ajv; Frame-Kill bei Überschreitung (`registry.invoke` hat keinen Throttle). **I-B4**
> `fromAction`-In/Output braucht restriktive Schemas OHNE Secret/PII-Felder; Broker spiegelt nur `{ok,error}`,
> nie rohe Exceptions. **I-B5** Lifecycle-IPC (`plugin:install/uninstall/setEnabled`) wird NIE gebrückt.

### 5.4 Anti-Clickjacking
Wie Tier 1: vom Host gezeichnete Demarkation „Externes Plugin · <id>"; kein host-privilegierter Prompt in/neben
der Widget-Region; `themeTokens` an das Widget nur, wenn die Demarkation perfektes Chrome-Spoofing unmöglich macht.

## 6. Host-Härtungen — aufgeteilt (Amendment)

- **Spike-1, eigener vorbereitender Security-Commit** (auch ohne Widget-Bau sinnvoll, schließen latente Löcher):
  **I-A1** `setWindowOpenHandler` fail-closed (non-http(s) → `deny`); **I-A2** `nodeIntegrationInSubFrames:false`
  + `webviewTag:false` explizit pinnen (+ Test); **I-A4** `isTrustedSender` fail-closed (`event.senderFrame ===
  wc.mainFrame`, NULL ablehnen); **I-A5** `webSecurity:true` als dokumentierte Invariante (+ Guard).
- **Tier 2:** **I-A3** WebContentsView-Konstruktion + Session-Policy als nicht-überschreibbare Konstanten (+ Test).
- **Separat (eigener Test, NICHT Teil des Widget-Spikes):** **I-A6** PDF-Härtung (`MarkdownEditor.tsx:3764`
  un-sandboxed/blob:) — separat behandeln, damit der Widget-Spike das PDF-Rendering nicht nebenbei verändert.

Broker-Invarianten: **I-B1…I-B5** (§5.3). Deklarativ: **I-D1…I-D3** (§4). Loader: **I-L1…I-L5** (§5.1).

## 7. Lifecycle / Unload

- **Spike 1 (für Tier 1 nötig):** **N2** state-change-Push Main→Renderer (`webContents.send`) statt nur Pull;
  **N3** dynamische `ExternalWidgetRegistry` mit `remove`/`clear`; **N6** Deletion-Test deckt **Runtime**-
  Disable/Uninstall ab (nicht nur Build-Abwesenheit); **N5** sicherstellen, dass externe Installs invokable
  sind (`isPluginInvokable`/Installation-State), OHNE das Gate zur Backdoor zu weiten. Teardown: Slot-Beitrag
  entfernen → leerer Slot; `plugin:widgetData` für eine inaktive Instanz → `{ok:false}`.
- **Tier 2:** **N1** Renderer-Entrypoint-Discovery+Verify-Naht (`entrypoints.renderer`/`styles` von
  `verifyInstalledDir` re-hashed), PARALLEL zum Main-Loader, NIE via `import.meta.glob`. Teardown:
  `port1.close()` VOR `view`-Destroy; pending Invokes `widget-unloaded` rejecten; `webContents.id→pluginId`-Map
  + Session zerstören; **Main-getriebener Force-Kill** (View destroy / Prozess-Kill) als Fallback bei
  Renderer-Freeze.

> **N1 ist NICHT in Spike 1** (Amendment): Tier 1 braucht keinen `renderer.js`-Entrypoint — es liest nur das
> Manifest und ruft eine Main-Action. Externe Renderer-Artefakte bleiben bis Tier 2 ungenutzt.

## 8. Scope / Staging

- **Spike 1 (dieser Strang) = AUSSCHLIESSLICH Tier 1:** vorbereitender Security-Commit (I-A1/A2/A4/A5) →
  `ExternalWidgetRegistry` + Vokabular (stats/list/keyValue/progress/badge) + Host-Demarkation + scoped
  `plugin:widgetData(instanceId)` (Main löst Plugin+`fromAction` auf, Limits, `widgetProvider`-Pflicht) +
  state-change-Push + dynamische Slots + Runtime-Deletion-Test. **KEIN WebContents, kein Protokoll, kein
  `renderer.js`.**
- **Spike 2 (gated, separater Increment + eigene Review):** Tier 2 WebContentsView (§5), nach Umsetzung von
  I-A3/I-B*/I-L* + Renderer-Entrypoint-Naht (N1).
- **Separat:** I-A6 PDF-Härtung (eigener Test).
- **Außerhalb:** eigene Tabs/Custom-Views/Navigation, Marktplatz, Multi-Widget-Layout.

## 9. Akzeptanzkriterien (Spike 1)

- Ein externes Plugin mit `ui.dashboardWidget={slot,fromAction}` (slot strikt; `fromAction` referenziert eine
  Action mit `widgetProvider:true` UND `isWrite:false`) rendert ein Widget aus dem v1-Vokabular; die
  `fromAction` liefert direkt eine gegen `WIDGET_VIEW_SCHEMA` validierte `WidgetView`; Strings als Text-Nodes;
  **kein** `dangerouslySetInnerHTML` im Pfad (Test/Lint-Guard); `WIDGET_VIEW_SCHEMA` `additionalProperties:false`
  ohne Präsentationsfelder.
- Daten ausschließlich über `plugin:widgetData(instanceId)`; der Renderer benennt nie Plugin/Action; Host-Limits
  (Textlänge/Zeilen/Payload/Refresh/Parallelität) erzwungen.
- Host-Demarkation „Externes Plugin · <id>" sichtbar; kein host-privilegierter Prompt in der Region.
- Externe Widgets nutzen die **neue** `ExternalWidgetRegistry`, nie die bundled `RendererPluginRegistry`.
- Runtime-Disable/Uninstall → Slot leer, kein Zombie (Deletion-Test, N6).
- Vorbereitender Security-Commit: I-A1/A2/A4/A5 als Code-Guards + Tests.
- `npm run typecheck` + `npm run test` + `npm run build` grün; gebündelte Renderer-Plugins + PDF-Rendering
  unverändert.

## 10. Beschlossene Entscheidungen (Review-Runde 2/3)

1. **Tier 2 = Option B**, session-partitionierter `WebContentsView` (nicht shared-session iframe).
2. **Spike 1 = ausschließlich Tier 1.**
3. **v1-Vokabular** = `stats/list/keyValue/progress/badge`.
4. **Host-Demarkation „Externes Plugin · <id>" auch in Tier 1 verpflichtend.**
6. **(Runde 3, Vertrags-Lock vor Increment 2):** KEIN `view`-Template — `fromAction` liefert direkt die zur
   Laufzeit gegen `WIDGET_VIEW_SCHEMA` validierte `WidgetView`. `SlotDecl.slot` strikt `WidgetSlot`
   (`dashboard.widget|sidebar.panel`); `ExternalWidgetEntry.slot` typisiert, unbekannte Slots zur Laufzeit
   verworfen; `getBySlot()` liefert eine Kopie. Provider erfordert BEIDE Marker (`widgetProvider:true` +
   `isWrite:false`). Main-seitige `instanceId` bindet Plugin+Action+Slot unveränderlich, bei Disable/Uninstall gelöscht.
5. Amendments: N1 raus aus Spike 1; eigene `ExternalWidgetRegistry`; Tier-1-Daten über scoped
   `plugin:widgetData(instanceId)` (kein freies `pluginInvoke`); `fromAction` = markierter seiteneffektfreier
   Provider + feste Limits; Tier 2 auf WebContentsView/`MessagePortMain`/`webContents.id`+Nonce umgeschrieben
   (kein `iframe.contentWindow`/`event.source`); flüchtige Session + gepinnte `webPreferences` + Permission-Deny
   + Protokoll-Handler pro Session + Prozess-Trennungs-Test; Read-once-Serve (I-L5). Host-Härtungen aufgeteilt:
   I-A1/A2/A4/A5 (Spike-1-Prep), I-A3 (Tier 2), I-A6 (separat).

## 11. Follow-ups (nicht in diesem Spike)

- F-R1 `sanitizePluginWidgetHtml` (falls Rich-Text je nötig). F-R2 Multi-Widget-Layout/Resize-Policy.
- F-R3 Tier-2-Prozess-Modell-Details (WebContentsView-Lifecycle, OOPIF-Verhalten, Offscreen).
- F-R4 generalisierte Egress-/Permission-Policy für künftige Renderer-Tiers (Tabs/Custom-Views).

> Aus dem Pre-Commit-Review des Increment-2 (Renderer-Widgets-Runtime). Beide bewusst NICHT in Increment 2 —
> die Akzeptanzkriterien §9 („Parallelität erzwungen") sind durch die Deckelung erfüllt; hier nur die Grenzen,
> falls Provider teurer/dynamischer werden.

- **F-R5 — Globales In-Flight-Limit für Provider-Läufe (Increment 2 hat nur Count-Cap + Per-Instanz-Dedup).**
  Aktuell: `entry.pending` dedupliziert parallele Aufrufe *derselben* Instanz (`main/plugins/widgets.ts`), und
  `WIDGET_RUNTIME_LIMITS.maxInstances=32` deckelt die Instanzzahl. Der Renderer mountet aber alle
  `WidgetInstance` eines Slots gleichzeitig (`ExternalWidgetSlot.tsx`) → bis zu 32 *verschiedene*
  `registry.invoke` laufen echt parallel; jeder führt den Plugin-Executor aus (potenziell LLM/Netz/fs innerhalb
  der gewährten Capabilities). Es gibt KEIN globales In-Flight-Semaphore. Bei billigen Providern unkritisch.
  Follow-up, falls Provider teuer werden: kleines globales Concurrency-Semaphore (z.B. ≤4 gleichzeitig) in der
  Runtime, Rest FIFO. (Tier 2 fordert ohnehin I-B3-Rate-/In-Flight-Limits — dort konsolidieren.)

- **F-R6 — Renderer holt Widget-Daten genau einmal je `instanceId`; kein Auto-Refresh/Retry.**
  `WidgetInstance`-`useEffect` hängt an `descriptor.instanceId` (`ExternalWidgetSlot.tsx`), d.h. die
  Main-seitige `minRefreshMs`/`cached`-Logik (`widgets.ts`) wird derzeit NUR bei Remount (instanceId-Wechsel via
  Upgrade/Disable→Enable) ausgeübt. Konsequenz: ein transienter Provider-Fehler bleibt sichtbar, bis sich die
  instanceId ändert — kein „Erneut laden"-Knopf, kein Polling. Bewusste Increment-2-Scope-Entscheidung
  (Daten sind statisch je Instanz-Lebensdauer). Follow-up: renderer-seitiges Poll/Retry (manueller Reload +
  optionales Intervall); ab dann wird der Main-Refresh-Throttle (`minRefreshMs`, Late-Result-Schutz)
  tatsächlich tragend statt nur defensiv.
