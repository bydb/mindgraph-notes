# Seiten fertig laden lassen (Stufe A) — Plan zur Prüfung

## Aufgabe

Adversariale Prüfung des Plans unten (Abschnitt „Plan“), bevor Code entsteht. Schwerpunkt: Hält der Sicherheitsvertrag S1–S8 die heutige Zusage der Webrecherche („nur global routbare Ziele, gepinnte Auflösung, Größen-/Zeitgrenzen“, `docs/web-research-plan.md`), wenn eine fremde Seite ihre eigenen Skripte in einem Electron-Fenster ausführt? Dazu die offenen Fragen O1–O5, der Auslöser `needsRender`, und ob die Einbindung in Chat und Agent wirklich an je einer Stelle reicht.

## Kontext/Anker

- Chat-Abruf (eine Stelle für schnell, gründlich, Schleife): `app/src/main/llm/petrolWebChat.ts:149` (`defaultWebGatherDeps`), Aufruf `:155`; Verbraucher `app/src/main/llm/petrolWebLoop.ts:300`, `app/src/main/llm/petrolDeepSearch.ts:249`
- Agent-Abruf: `app/src/main/noteAgent/skills.ts:1758` (`web_fetch`), Aufruf `:1780`
- Aufbereitung: `app/src/main/webResearch/fetchExtract.ts:92` (`fetchAndExtract`, defuddle-Core + turndown)
- Netzweg: `app/src/main/webResearch/egress.ts:80` (`createValidatingLookup`), `:128` (`isRedirectAllowed`), `:145` (`requestOnce`), `:254` (`safeFetch`)
- Vorbild verstecktes Fenster: `app/src/main/ocr/pdfRaster.ts:50` (`openWindow`), `:62–63`; `app/src/main/windowSecurity.ts:12` (`SECURE_WEB_PREFERENCES`)
- Electron-Version: `app/package.json` `^42.11.18`

# Plan

Stand: 06.11.2026, Entwurf Rev. 1. Prüfer: Codex. Umgesetzt wird erst nach Prüfung und Freigabe durch den Nutzer.

## Anlass

Frage im Petrol-Chat: „Wo kann ich in Hessen BDK Parfums und Marc-Antoine Barrois testen?“ Petrol antwortete, es habe keine Verkaufsstellen gefunden. Claude fand dieselbe Antwort (eine Parfümerie in Frankfurt führt beide Marken, BDK hat zehn weitere Geschäfte in Hessen), aber nur, indem es einen echten Browser steuerte.

Ursache: Die Händlerseiten (`bdkparfums.com/en/pages/stores`, `marcantoinebarrois.com/en/pages/store-locator`) laden ihre Liste erst per Skript nach. `fetchAndExtract` holt das HTML so, wie der Server es ausliefert, und führt kein Skript aus. Beim Modell kam nur die leere Hülle an. Mit besserer Suche oder besserem Modell ist das nicht zu lösen.

## Ziel

Eine Seite, deren Inhalt erst per Skript entsteht, wird in einem unsichtbaren, abgeschotteten Fenster fertig geladen. Danach läuft ihr Text durch dieselbe Aufbereitung wie heute (defuddle, turndown, Kürzung, UNTRUSTED-Rahmen).

**Nicht Ziel (das ist Stufe B):** klicken, tippen, Karten bedienen, Formulare abschicken. Barrois bleibt damit ungelöst, weil man dort erst einen Ort suchen muss. BDK dürfte gelöst sein, wenn die Liste ohne Eingabe auf der Seite steht. Das prüft Schritt 0.

## Für wen: Chat und Agent

Beide, über EINE Funktion im Main:

| Weg | Heutige Abrufstelle | Änderung |
|---|---|---|
| Petrol-Chat (schnell, gründlich, Recherche-Schleife) | `defaultWebGatherDeps().fetchPage` in `main/llm/petrolWebChat.ts` | ruft `fetchPageSmart` statt `fetchAndExtract` |
| Notiz-Agent mit Webrecherche | `web_fetch` in `main/noteAgent/skills.ts` | dito |

Das Modell sieht kein neues Werkzeug und entscheidet nichts. Begründung: Die feste Suche (schnell/gründlich) hat keine Werkzeugwahl, und schwache lokale Modelle sollen nicht entscheiden müssen, ob eine Seite „Skripte braucht“. Die Spur, die Quellenliste und der Quellenblock zeigen, dass eine Seite „im Browser geladen“ wurde.

Die Webrecherche bleibt zweistufig freigegeben wie heute (Modul `web-research` + Globus). Zusätzlich ein eigener Schalter „Seiten mit Skripten laden“ (Einstellungen → KI → Webrecherche). Standard: siehe offene Entscheidung E1.

## Ablauf

```
fetchPageSmart(url)
  1. fetchAndExtract(url)                         wie heute
  2. needsRender(html, extrahierter Text)?        reine Funktion, shared/, getestet
       nein → Ergebnis von 1
       ja   → renderAndExtract(url)               neues Fenster, Budget s. u.
                Erfolg und mehr Text als 1 → nehmen, record.rendered = true
                sonst → Ergebnis von 1 (mit Vermerk „Nachladen ohne Ergebnis“)
```

**`needsRender` (Auslöser).** Nur mit Messung festlegen (Schritt 0). Kandidaten:
- extrahierter Text unter ca. 600 Zeichen, aber HTML über 30 KB;
- typische App-Hüllen: leeres `<div id="root|app|__next">`, `<noscript>` mit „JavaScript aktivieren“;
- Signalwörter in Titel oder URL (`store-locator`, `stores`, `haendler`, `filialen`, `points-of-sale`) bei wenig Text.

Ein Auslöser zu viel kostet nur Zeit, ein fehlender lässt alles beim Alten. Deshalb lieber großzügig, aber gedeckelt (höchstens 2 gerenderte Seiten je Frage oder Agent-Lauf, Budget B).

**Kein zweiter Abruf ohne Not:** HTTP-Fehler (401/403/429/451) aus Schritt 1 lösen kein Rendern aus. Die Sperrregel der Schleife (`siteKey`) gilt weiter.

## Sicherheitsvertrag (Kern des Plans, bitte hier am genauesten prüfen)

Leitsatz: **Das Fenster öffnet selbst keine einzige Netzverbindung.** Jede Anfrage der Seite läuft durch denselben `safeFetch` wie heute (gepinnte DNS-Auflösung, nur global routbare Ziele, Größen- und Zeitgrenzen). Sonst könnte eine präparierte Seite per Skript zum Beispiel `http://192.168.1.1/` oder `http://localhost:11434/` ansprechen. Heute ist das ausgeschlossen, mit einem normalen Browserfenster wäre es offen.

**S1 Eigene Sitzung je Abruf.** `session.fromPartition('mg-webrender-<zufall>')` ohne `persist:`. Damit gibt es keine Cookies, keinen Cache und keinen Speicher über den Abruf hinaus. Nach dem Abruf wird das Fenster zerstört und die Sitzung geleert (`clearStorageData`, `clearCache`).

**S2 Alle http/https-Anfragen über `safeFetch`.** `ses.protocol.handle('https'|'http', req => …)` beantwortet jede Anfrage selbst über `safeFetch`. Erlaubte Methoden: GET, HEAD, POST (Seiten-APIs wie Händlersuchen nutzen POST). Request-Kopfzeilen nur aus einer Allowlist (`Accept`, `Content-Type`, `Accept-Language`). Keine Cookies hinaus, keine `Authorization`.
- Weiterleitungen: Für das Hauptdokument gilt die heutige Regel (gleiche Domain, kein Downgrade). Für Unterressourcen gilt dieselbe Regel je Anfrage. Fremde Hosts sind für Unterressourcen als EIGENE Anfrage erlaubt (CDN, API), aber nur öffentlich routbar.
- Was `protocol.handle` nicht abdeckt, wird hart gesperrt: `ws:`/`wss:` per `webRequest.onBeforeRequest` → cancel. Alle anderen Schemata (file, data für Dokumente, eigene Schemata wie `mindgraph-preview:`) → cancel.

**S3 Fallnetz für alles, was am Handler vorbeigeht.** `ses.setProxy({ proxyRules: '<tote Adresse>' })`, damit eine Verbindung, die Chromium doch selbst aufbaut (Preconnect, DNS-Prefetch, unbekannte Wege), ins Leere läuft statt ins Netz. WebRTC: `webContents.setWebRTCIPHandlingPolicy('disable_non_proxied_udp')` und zusätzlich `RTCPeerConnection` per Berechtigung sperren. **Offene Frage an Codex (O1):** Reicht das, oder gibt es Wege (DNS-Auflösung durch den Network Service, QUIC, Service Worker), die weder Handler noch Proxy sehen?

**S4 Fenster wie beim PDF-Rastern.** `show: false`, `SECURE_WEB_PREFERENCES`, `sandbox: true`, kein Preload, kein Node. Neue Fenster: `deny`. Navigation des Hauptrahmens weg vom Start-Host: verhindern. Downloads: `will-download` → cancel. Alle Berechtigungen (Kamera, Mikrofon, Standort, Benachrichtigungen, Zwischenablage, MIDI, USB, HID, Serial, Bluetooth) per `setPermissionRequestHandler` und `setPermissionCheckHandler` ablehnen. Service Worker: über `ses.serviceWorkers` sofort abmelden bzw. die Registrierung per Handler ablehnen (O2). Audio stumm (`setAudioMuted(true)`). Kein `webviewTag`, keine Plugins.

**S5 Budget je Abruf (hart, im Main).**
- Gesamtzeit 20 s, danach wird abgebrochen und genommen, was steht.
- Höchstens 120 Unterressourcen-Anfragen, höchstens 12 MB entpackt in Summe, je Antwort die heutige Grenze `WEB_FETCH_MAX_BYTES`.
- Bilder, Medien, Schriften werden nicht geladen (leere Antwort mit passendem Typ). Das spart Zeit und Daten. Stylesheets laufen mit, weil manche Seiten Inhalte per CSS ein- und ausblenden und `innerText` davon abhängt.
- Höchstens EIN gerendertes Fenster zugleich (Warteschlange wie in `pdfRaster.ts`).
- Abbruchsignal des Laufs bzw. der Chatfrage beendet das Fenster sofort.

**S6 Auslesen.** Wann „fertig“? Nach `did-finish-load`: warten, bis 1,5 s lang keine Anfrage mehr offen war (Netz ruhig), höchstens bis zum Zeitbudget. Dann `executeJavaScriptInIsolatedWorld` liest `document.documentElement.outerHTML` (gedeckelt auf 2 MB). Das Ergebnis ist Seiteninhalt, also untrusted wie heute; die Seite kann ihn beliebig gestalten, aber nichts anderes erreichen. Aufbereitung danach im Main mit dem bestehenden Weg (`parseHTML` → defuddle → turndown → Kürzung).

**S7 Kein Modelleinfluss.** Das Modell bestimmt weder ob gerendert wird noch wie. URL nur wie heute (Chat: Treffernummer; Agent: Allowlist `web.allowedUrls`). Kein Text vom Nutzer oder Modell gelangt in die Seite.

**S8 Nicht mit Shell oder Rechner-Steuerung im selben Lauf.** Gilt schon heute für die Webrecherche und bleibt so.

## Herkunft und Anzeige

- `WebFetchRecord.rendered?: true` (shared/webResearch.ts), dazu im Chat `WebFetchOutcome.rendered`.
- Spur und Quellenliste: „im Browser geladen“. Quellenblock im Agenten und im Chat-Export: derselbe Vermerk hinter der Quelle.
- Kein Rendern möglich (Schalter aus, Budget aufgebraucht, Fehler): Vermerk „Seite lädt ihren Inhalt erst im Browser, hier nicht gelesen“. Das Modell erfährt das als festen App-Text, damit es nicht „gibt es nicht“ schreibt, sondern „Liste nicht lesbar, selbst öffnen“. Das ist zugleich die kleine Verbesserung „ehrlich sagen“ aus dem Gespräch und lohnt sich auch ohne Schritt 2.

## Schritte

0. **Machbarkeit messen, vor jedem Umbau.** Kleines Skript mit Dev-App + CDP: 10–15 Seiten, die heute leer bleiben, im versteckten Fenster laden (noch ohne Handler) und `innerText` speichern. Testfälle: die beiden Händlerseiten, Öffnungszeiten-Seiten, Shop-Preise, Veranstaltungskalender, eine Seite mit „JavaScript aktivieren“. Ergebnis: Bei wie vielen steht die gesuchte Angabe danach im Text? Dauer je Seite? Daraus Schwellen für `needsRender`. **Abbruchkriterium:** Hilft es bei weniger als einem Drittel, wird nur der Vermerk gebaut, nicht das Rendern.
1. **Vermerk „lädt erst im Browser“** (`needsRender` + fester App-Text), ohne Rendern. Klein, sofort nützlich, testbar.
2. **`renderAndExtract`** mit dem Sicherheitsvertrag S1–S7, Schalter, Herkunft, Anzeige.
3. **Messung am echten Chat**: dieselben Fragen mit Schalter an/aus, gepaart, je 3 Läufe (Regel „kontrolliertes A/B“). Erst danach über den Standard (E1) entscheiden.

## Tests

- **Rein in `shared/`:** `needsRender` (Fixtures aus Schritt 0), Anfrage-Regel (Methode, Kopfzeilen-Allowlist, Ressourcentyp → laden/leer), Budgetzähler.
- **Sicherheit, echtes Electron (wie `shellSandbox.test.ts`, nur wo lauffähig):** lokaler Testserver mit Seite, die per `fetch`, `<img>`, `XMLHttpRequest`, `WebSocket`, `RTCPeerConnection`, `navigator.sendBeacon`, `<link rel=preconnect>`, Service Worker und `window.open` auf 127.0.0.1, 192.168.x und einen zweiten lokalen Port zielt. Erwartung: Keine einzige Anfrage kommt am Zielport an. Der Testserver zählt mit. Dazu ein Kanarien-Test, dass eine erlaubte öffentliche Anfrage über den Handler läuft (Fake-`safeFetch`).
- **Bestehende Tests** `security.test.ts`, `webFetchRecord.test.ts`, `loopWeb.test.ts` müssen unverändert grün bleiben.

## Offene Entscheidungen (Nutzer)

- **E1 Standard des Schalters.** Vorschlag: aus bis zur Messung in Schritt 3, danach entscheiden. Alternative: an, weil die Webrecherche ohnehin schon zweistufig freigegeben ist.
- **E2 Lokale Modelle.** Rendern kostet keine Modellzeit, nur ca. 2–20 s je Seite. Vorschlag: für alle Wege gleich.

## Offene Fragen an Codex

- **O1** Gibt es in Electron 42 (`app/package.json`: `^42.11.18`) Netzwege eines Fensters, die weder `protocol.handle` für http/https noch der tote Proxy noch die WebRTC-Regel erfassen (DNS-Prefetch, QUIC, Network Service, Speculation Rules, Prerender)? Wie testet man das am sichersten?
- **O2** Service Worker in einer nicht persistenten Partition: Wie sperrt man sie zuverlässig? Reicht das Abmelden im `registration-completed`-Ereignis?
- **O3** Ist POST für Unterressourcen vertretbar? Gefahr: Eine Seite schickt Daten an Dritte. Diese Daten stammen aber nur von der Seite selbst, weil S7 nichts vom Nutzer hineinlässt. Alternative: nur GET; dann fallen manche Händlersuchen weg.
- **O4** Läuft defuddle auf dem gerenderten HTML anders als auf Server-HTML (z. B. Inhalte, die nur per CSS sichtbar sind)? Soll stattdessen `innerText` als Rückfall dienen, wenn defuddle wenig liefert?
- **O5** Speicher und CPU: Ein Chromium-Renderer je Abruf kostet ca. 100–200 MB. Auf 8-GB-Rechnern mit lokalem Modell knapp. Sollte `assessLocalRunRisk` das Rendern drosseln?

## Codex-Findings

### F01 — Toter Proxy sperrt Loopback nicht
Schwere: kritisch
Stelle: docs/codex-collab/web-render-stufe-a.md:76
Status: [OFFEN]
S3 ist als Fallnetz falsch: Chromium umgeht einen festen Proxy für `localhost`, `127.0.0.0/8`, `::1` und Link-Local standardmäßig und verbindet direkt ([Chromium-Proxy-Dokumentation](https://chromium.googlesource.com/chromium/src/+/HEAD/net/docs/proxy.md#implicit-bypass-rules)). Wenn ein Weg den Handler umgeht, kann genau das Beispiel `localhost:11434` erreichbar sein. `disable_non_proxied_udp` betrifft WebRTC-UDP, nicht allgemeine TCP/HTTP-Verbindungen; eine Berechtigungsablehnung ist keine generelle Netzsperre. O1: Für diese Ziele lautet die Antwort also **nein**. Der vorhandene `safeFetch` sperrt sie nur auf seinem eigenen Weg (`app/src/main/webResearch/egress.ts:153–179`).
Vorschlag: Den Proxy nur als zusätzliche Schicht behandeln; bei festem Proxy ausdrücklich `proxyBypassRules: '<-loopback>'` setzen und in Electron 42 nachweisen, dass auch Loopback darüber scheitert. Für die zugesagte Invariante eine unabhängige Egress-Sperre oder belastbare Messung sämtlicher Netzwege verlangen.

### F02 — `protocol.handle` belegt keine vollständige Netzmediation
Schwere: hoch
Stelle: docs/codex-collab/web-render-stufe-a.md:68
Status: [OFFEN]
Electron dokumentiert für `protocol.handle('https'|'http')`, dass Anfragen **an URLs dieses Schemas** an den Handler delegiert werden ([Electron Protocol](https://www.electronjs.org/docs/latest/api/protocol#protocolhandlescheme-handler)); daraus folgt kein Beleg, dass DNS-Prefetch, Preconnect, QUIC, WebTransport, WebRTC oder Speculation Rules/Prerender als URL-Anfragen dort auftauchen. Der Plan macht daraus trotzdem „jede Anfrage“ und „keine einzige Netzverbindung“. Die genannte Dokumentation ist zudem `latest`, während `app/package-lock.json:5969–5971` Electron 42.11.18 pinnt. Ein lokaler HTTP-Zielserver aus dem Testplan (`docs/codex-collab/web-render-stufe-a.md:109`) beobachtet weder reine DNS-Abfragen noch Verbindungen zu externen Zielen. O1 bleibt für diese Pfade offen; ein bestandener Kanarientest würde die Invariante nicht beweisen.
Vorschlag: Vor Stufe 2 mit **genau Electron 42.11.18** jeden Browserpfad einzeln prüfen, samt NetLog/CDP-Netzspur, kontrolliertem DNS-Resolver und ausgehendem Socket-/Firewall-Mitschnitt für lokale und öffentliche Kanarien. Prüfen, ob Handler, Proxy oder keiner greift; unbekannte Wege als Freigabesperre behandeln. Der Test muss auch `EventSource`, `sendBeacon`, WebTransport, Fetch mit `credentials`, Service Worker, Speculation Rules und Prerender umfassen.

### F03 — Machbarkeitstest startet ungeschützte Fremdskripte
Schwere: kritisch
Stelle: docs/codex-collab/web-render-stufe-a.md:101
Status: [OFFEN]
Schritt 0 lädt 10–15 reale Seiten ausdrücklich „noch ohne Handler“ in einem Electron-Fenster. Die Fensterhärtung des PDF-Rasterers (`app/src/main/ocr/pdfRaster.ts:50–72`, `app/src/main/windowSecurity.ts:12–24`) sperrt weder `fetch` noch DNS/Preconnect noch Zugriffe auf private Ziele. Bereits die Messung kann damit den Schutz der heutigen Webrecherche (`app/src/main/webResearch/egress.ts:153–179`) umgehen; ein verstecktes Fenster ist keine Netzisolation.
Vorschlag: Schritt 0 nur mit vollständig wirksamer Egress-Grenze oder in einer OS-isolierten Testumgebung ohne Zugriff auf Vault, LAN und lokale Dienste durchführen. Keine echten Drittseiten mit direktem Electron-Netz laden.

### F04 — Service Worker lassen sich nach der Registrierung nicht rechtzeitig sperren
Schwere: hoch
Stelle: docs/codex-collab/web-render-stufe-a.md:78
Status: [OFFEN]
O2: `ses.serviceWorkers` bietet in Electron 42 laut `app/node_modules/electron/electron.d.ts:12284–12360` ein Ereignis **nach** erfolgreicher Registrierung und Abfragen laufender Worker, aber keinen präventiven Registrierungshandler und keine `unregister`-Methode. Die [Electron-API](https://www.electronjs.org/docs/latest/api/service-workers#event-registration-completed) bestätigt den Zeitpunkt. Ein Worker kann schon aktiv sein bzw. nach Zerstörung des Fensters weiterlaufen; die nicht persistente Partition beendet nicht automatisch alle Prozesse beim Fensterschluss. `clearStorageData` ist Aufräumen, keine Verhinderung.
Vorschlag: Registrierung vorab auf Dokumentebene verhindern (z. B. erzwungene CSP `worker-src 'none'` für jede Dokumentantwort) und mit echter Electron-Probe nachweisen, dass weder `navigator.serviceWorker.register` noch Worker-Fetch/Background-Arbeit laufen. Bei fehlendem Nachweis Rendern abbrechen.

### F05 — Navigations- und Schemagrenze ist unvollständig
Schwere: hoch
Stelle: docs/codex-collab/web-render-stufe-a.md:73
Status: [OFFEN]
S4 nennt nur Navigation des Hauptrahmens „weg vom Start-Host“. Das PDF-Vorbild sperrt zwar `will-navigate` (`app/src/main/ocr/pdfRaster.ts:62–63`), aber im Renderfenster können HTTP-Redirects, `_self`-Navigation, Subframes und `about:blank`-/`blob:`-/`data:`-Dokumente andere Ereignisse bzw. keinen HTTP-Handler auslösen. `webRequest.onBeforeRequest` dokumentiert Ressourcentypen `mainFrame`/`subFrame`, ist aber keine vollständige Schemapolitik für interne Dokumente ([Electron WebRequest](https://www.electronjs.org/docs/latest/api/web-request#webrequestonbeforerequestfilter-listener)). `safeFetch` erlaubt überdies Same-Hostname-Redirects auf **andere Ports** (`app/src/main/webResearch/egress.ts:128–139`); ein Browser-Navigationscheck darf die finale URL nicht still auf den Start-Host reduzieren. Was der Plan bei einer Abweichung mit `record.finalUrl` macht, bleibt offen.
Vorschlag: Für Haupt- und Unterrahmen `will-frame-navigate`, `will-redirect` und finale URL samt Port/Scheme prüfen; für `about:`, `blob:`, `data:`, `file:` und App-Schemata eine explizite, getestete Frame-Policy festlegen. Bei einem nicht autorisierten Hauptrahmenwechsel auslesen abbrechen statt dessen DOM als Startquelle auszugeben.

### F06 — Der bestehende `safeFetch` ist kein Browser-HTTP-Adapter
Schwere: hoch
Stelle: docs/codex-collab/web-render-stufe-a.md:72
Status: [OFFEN]
`SafeFetchOptions.method` kann nur GET/POST und `bodyText` nur Text senden (`app/src/main/webResearch/egress.ts:37–49`, `:245`); HEAD, FormData, binäre Bodies und Request-Streams fehlen. Das Ergebnis liefert Status, Content-Type und Body, aber keine Antwortheader (`:28–35`, `:287–294`). Ohne `Access-Control-Allow-Origin`, CSP, Cache-/Location-/Content-Disposition- und ggf. Encoding-Header verhalten sich Skripte und Browser anders als auf der echten Seite; ein pauschales CORS-`*` würde umgekehrt fremde Antworten für Seitenskripte lesbar machen. Automatische Unterressourcen-Weiterleitungen über `safeFetch` prüfen zwar jeden Hop (`:263–280`), verbergen aber die Kette vor Chromium und können die Origin-/CORS-Semantik ändern. Das ist eine Funktionalitäts- und Sicherheitsgrenze, kein bloßer Aufrufwechsel.
Vorschlag: Einen eigenen, begrenzten Browser-Adapter mit genau definierter Methode, Body-, Header-, Redirect- und Response-Semantik planen; für jede weitergeleitete Antwort die Origin-Regeln in Electron 42 testen. HEAD und nicht unterstützte Bodies explizit ablehnen, falls sie nicht implementiert werden.

### F07 — POST und GET erlauben Datenabfluss an beliebige öffentliche Hosts
Schwere: hoch
Stelle: docs/codex-collab/web-render-stufe-a.md:121
Status: [OFFEN]
O3: „Daten stammen nur von der Seite“ stimmt nicht. Agent-URLs aus dem Auftrag werden ausdrücklich in `allowedUrls` übernommen (`app/src/main/index.ts:4851–4855`); der Chat-Suchtreffer kann ebenfalls nutzerbezogene Query-Parameter tragen. Die Seite kennt `location.href`, ihren DOM-Inhalt und von freigegebenen öffentlichen Unterressourcen erhaltene Daten. Sie kann diese per POST, Beacon, EventSource-URL oder GET-Query an beliebige öffentliche Dritte schicken; S2 erlaubt fremde Unterressourcen-Hosts (`docs/codex-collab/web-render-stufe-a.md:73`), und `safeFetch` begrenzt nur **Antwortbytes**, nicht Upload-Größe (`app/src/main/webResearch/egress.ts:197–218`, `:245`). Auch nur GET verhindert URL-basierten Abfluss nicht. S7 behauptet damit zu viel; das Modell kann über Suchtreffer/Agent-Auftrag indirekt die Start-URL beeinflussen.
Vorschlag: Datenabfluss als eigene, offengelegte Eigenschaft des Renderns behandeln. Request-URL und Body je Anfrage und insgesamt begrenzen; POST nur für klar benötigte API-Aufrufe, mit getesteter Ziel-Policy. Die Aussage „kein Nutzertext gelangt in die Seite“ streichen. Eine Host-Allowlist oder explizite Freigabe für Drittziele erwägen, wenn private Such-/Auftragsinhalte geschützt bleiben sollen.

### F08 — Antwort- und Abbruchbudgets decken Arbeit nicht hart ab
Schwere: hoch
Stelle: docs/codex-collab/web-render-stufe-a.md:80
Status: [OFFEN]
Die 20 Sekunden gelten laut S5 „je Abruf“, während der schnelle Chat für Suche **und alle Abrufe** 25 Sekunden hat (`app/src/shared/webChat.ts:27–31`, `app/src/main/llm/petrolWebChat.ts:61–68`). `runFetchQueue` startet bis zu drei Seiten parallel (`app/src/shared/webChat.ts:689–710`); ein einziges Renderfenster erzeugt Wartezeit hinter dem aktiven Fenster. Der Plan sagt weder, ob diese Wartezeit zur Frist zählt, noch wie die globale Zwei-Seiten-Grenze über parallele Chat-Abrufe und Agent-Werkzeugaufrufe atomar geteilt wird. Wird nach 20 Sekunden „genommen, was steht“, kann ein halbfertiger DOM als vollständige Quelle erscheinen; der bestehende Chat verwirft verspätete Ergebnisse (`app/src/shared/webChat.ts:677–682`).
Vorschlag: Ein run-gebundenes Budgetobjekt und eine abbrechbare FIFO-Warteschlange vorsehen; Wartezeit, erster Fetch, Rendern, Extraktion und Cleanup gegen die frühere Gesamtfrist rechnen. Timeout-Ergebnisse nur mit sichtbarem Teilstatus übernehmen, nie still als vollständige Quelle.

### F09 — `needsRender` hat die benötigten Rohdaten nicht und übersieht lange Hüllen
Schwere: mittel
Stelle: docs/codex-collab/web-render-stufe-a.md:57
Status: [OFFEN]
`fetchAndExtract` gibt nur Record, Markdown und Kürzungsdaten zurück (`app/src/main/webResearch/fetchExtract.ts:19–26`, `:128–137`), nicht das HTML oder dessen Länge; `needsRender(html, text)` ist an der geplanten Einbindungsstelle nicht aufrufbar, ohne die Funktion oder ihren Rückgabetyp zu ändern. Die 600-Zeichen-Regel übergeht clientseitig geladene Listen, wenn Cookie-Banner, Navigation oder SEO-Text schon länger sind. Das „leere Root“ kann nach Server-Side-Rendering ebenfalls kein Signal sein; 30 KB schließt kleine App-Hüllen aus. Der globale Deckel von zwei verschärft falsche Positive, statt sie nur Zeit kosten zu lassen.
Vorschlag: Roh-HTML-Metadaten beim ersten `safeFetch` erheben und als begrenztes Signal zurückgeben, ohne zweiten Abruf. Schwellen an gezielten Positiv-/Negativ-Fixtures und am gesuchten **Inhalt**, nicht bloß Textlänge, messen; Budget-Erschöpfung im Ergebnis sichtbar halten.

### F10 — Defuddle und `innerText` liefern unterschiedliche Belegtexte
Schwere: mittel
Stelle: docs/codex-collab/web-render-stufe-a.md:87
Status: [OFFEN]
O4: Der bestehende Weg parst HTML erneut mit `linkedom` und Defuddle-Core (`app/src/main/webResearch/fetchExtract.ts:119–125`). Damit gehen der Browser-CSS-Zustand, Shadow-DOM und über Canvas/ARIA erzeugter Text verloren; ein bloßes `outerHTML` von `documentElement` enthält nicht zwingend die sichtbare Händlerliste. Umgekehrt kann Defuddle auf hydratisiertem DOM Navigation/Banner statt Hauptinhalt wählen. `innerText` kann als Rückfall helfen, ist aber ohne DOM-Kontext und sichtbare Quelle kein gleichwertiger Artikeltext. Die Regel „mehr Text als 1“ (`docs/codex-collab/web-render-stufe-a.md:53`) bevorzugt auch irrelevante Mehrmenge.
Vorschlag: Nach Rendern sowohl extrahiertes Markdown als auch begrenztes sichtbares `innerText` messen und anhand konkreter Inhalts-Fälle vergleichen; `innerText` nur als ausdrücklich gekennzeichneten Rückfall mit eigener Kürzung und identischer eingefrorener Zitiergrundlage nutzen.

### F11 — Herkunftskennzeichen geht in Chat, Export und Agent-Artefakten verloren
Schwere: mittel
Stelle: docs/codex-collab/web-render-stufe-a.md:95
Status: [OFFEN]
Zwei Fetch-Aufrufstellen reichen für die **Beschaffung**, nicht für den versprochenen Vermerk. `defaultWebGatherDeps` bildet den Record auf `WebFetchOutcome` ab (`app/src/main/llm/petrolWebChat.ts:155–166`); `freezeWebSources` erzeugt daraus `WebSource` ohne Renderfeld (`app/src/shared/webChat.ts:860–874`). Promptkopf (`app/src/main/llm/petrolWebPrompt.ts:17–20`), Quellenliste (`app/src/renderer/components/Agent/PetrolWebAnswer.tsx:207–218`), Fußnotenexport (`app/src/shared/webChat.ts:1257–1278`) und gespeicherte Chatdaten (`app/src/shared/petrolChatStored.ts:161–162`) verwenden eigene Verträge. Beim Agenten gibt es zusätzlich Markdown-/HTML-Quellenblöcke, XLSX-Quellenblatt und PPTX-Quellen (`app/src/shared/webResearch.ts:445–466`, `:551–567`; `app/src/main/noteAgent/skills.ts:1571–1575`). Ein Feld nur in `WebFetchRecord`/`WebFetchOutcome` erscheint in keinem dieser Ausgänge.
Vorschlag: `rendered` und den Teil-/Fehlerstatus bis `WebSource`, Snapshot, Speicherformat und allen Quellen-Renderern führen; Tests für Chat-Anzeige, Kopie/Speichern, Agent-Notiz/HTML/XLSX/PPTX und alte gespeicherte Gespräche ergänzen.

### F12 — Der feste Hinweis für „nicht lesbar“ hat keinen konsistenten Transport
Schwere: mittel
Stelle: docs/codex-collab/web-render-stufe-a.md:97
Status: [OFFEN]
Im Chat kennt `WebFetchOutcome` nur Erfolg oder einen begrenzten Fehlergrund (`app/src/shared/webChat.ts:232–248`); `freezeWebSources` macht daraus nur Host und Grund (`:839–852`). Der `nothing-readable`-Pfad ruft kein Modell auf (`app/src/main/index.ts:7296–7305`), während die Recherche-Schleife bei leerem oder fehlgeschlagenem Abruf ihre eigenen knappen Werkzeugtexte verwendet (`app/src/main/llm/petrolWebLoop.ts:100–111`, `:304–323`). Im Agenten führt ein erfolgreicher statischer Hüllentext sogar zu `status: ok`, `phase = fetch` und einer Quelle (`app/src/main/noteAgent/skills.ts:1780–1787`); der feste Hinweis an das Modell existiert dort nicht. „Nachladen ohne Ergebnis“ wäre ohne Typisierung leicht ein scheinbar erfolgreicher Beleg.
Vorschlag: Einen strukturierten Lesbarkeitsstatus mit Grund und Render-Versuch in beide Wege einführen. Bei K=0 dem Nutzer deterministisch die Einschränkung anzeigen; bei K>0 App-Hinweis außerhalb des untrusted Texts in Prompt und Schleifen-Werkzeugausgabe setzen. Agent-Quellen nur für tatsächlich lesbaren Inhalt als `ok` zählen.

### F13 — Main-Thread- und RAM-Risiko ist nicht durch einen Fensterdeckel gelöst
Schwere: hoch
Stelle: docs/codex-collab/web-render-stufe-a.md:123
Status: [OFFEN]
O5: `assessLocalRunRisk` berücksichtigt nur Modellgröße plus pauschal 4 GB und ist laut Kommentar eine **Warnung**, keine Sperre (`app/src/shared/localRunRisk.ts:1–29`). Der Browserpfad hält gleichzeitig Erstabruf, bis zu 12 MB Unterressourcen, 2 MB DOM, Kopien in `Response`/`executeJavaScript`/`parseHTML` und einen Chromium-Prozess. Die Defuddle-/Turndown-Aufbereitung läuft synchron im Main (`app/src/main/llm/petrolWebChat.ts:155–157`); `protocol.handle` schickt zudem jede Ressourcenanfrage durch den Main ([Electron Protocol](https://www.electronjs.org/docs/latest/api/protocol#protocolhandlescheme-handler)). Ein Größenlimit für Netzwerkbytes begrenzt weder JS-/DOM-Heap noch CPU-Loop einer Seite. Ein Seiten-Skript kann den Renderer bis zum 20-s-Abbruch auslasten; Main-Parsing kann die Frist selbst verzögern.
Vorschlag: Auf 8-GB-Geräten bei `tight` Rendern zunächst aussetzen oder vor dem Start ausdrücklich drosseln; Peak-RSS, Renderer-CPU und Event-Loop-Lag unter lokalem Modell messen. Main-Aufbereitung und Handlerlast zeitlich/ressourcenmäßig isolieren und die 20-s-Frist auch bei blockiertem Main nachweisbar durchsetzen.

### F14 — Die Sicherheitsprobe deckt die kritischen Umgehungen nicht ab
Schwere: hoch
Stelle: docs/codex-collab/web-render-stufe-a.md:109
Status: [OFFEN]
Ein Zielport-Zähler beweist nur, dass **dieser** HTTP-Server nichts empfing. Er sieht keine DNS-Prefetch-Anfrage, keinen UDP-/QUIC-Versuch, keine WebTransport-Verbindung, keine öffentlichen Beacon-/Fetch-Ziele und keine Navigation zu `about:`, `blob:` oder `data:`. Ein Fake-`safeFetch` als Positivtest beweist auch nicht, dass **alle** realen Anfragen über ihn laufen. `webRequest` bietet Ressourcentypen für HTTP-Anfragen, aber nicht dieselbe Aussage für Browser-Netzaktivität außerhalb des URL-Loaders ([Electron WebRequest](https://www.electronjs.org/docs/latest/api/web-request#webrequestonbeforerequestfilter-listener)).
Vorschlag: Testmatrix um DNS-/Socket-Beobachtung auf OS-Ebene, IPv4/IPv6, Loopback/Link-Local/LAN, öffentliche Kanarien, Subframe-/Hauptrahmen-Redirects, Speculation Rules/Prerender, SW und Browser-APIs ergänzen. Den Test mit echter Netzantwort des Adapters und dem konkreten Electron-Binary aus `app/package-lock.json:5969–5971` ausführen; bei nicht beobachtbaren Pfaden den Sicherheitsvertrag nicht behaupten.

### F15 — Lesbare Filialseiten werden als Browser-only verworfen
Schwere: hoch
Stelle: app/src/shared/browserOnlyPage.ts:63
Status: [OFFEN]
Die `locator`-Regel verlangt bei einem Pfadsegment wie `store`, `stores` oder `retail` nur ein `<script>`, weniger als zwei erkannte Adressmuster und höchstens 5 000 Zeichen extrahierten Text (`app/src/shared/browserOnlyPage.ts:23–35`, `:65–73`). Sie prüft nicht, ob der Text tatsächlich eine Liste oder die gesuchte Angabe enthält. Reproduzierbares Gegenbeispiel: `/stores` mit „Berlin: Alexanderplatz, täglich 10–20 Uhr. Hamburg: Jungfernstieg, täglich 10–20 Uhr.“ und einem Analyseskript ergibt `locator`, obwohl beide Einträge lesbar sind. Ein einzelner Laden mit **einer** klassischen Postleitzahl bleibt ebenfalls unter `hints < 2`. `fetchAndExtract` wirft dann vor dem `status: ok`-Record (`app/src/main/webResearch/fetchExtract.ts:149–160`); Chat, Satzprüfung und Agent verlieren eine echte Quelle. Die Tests decken nur zwei erkannte Adressen und künstlich lange Gegenbeispiele ab (`app/src/shared/browserOnlyPage.test.ts:25–32`, `:49–59`). Das kann die neue Alltagszählung zugunsten „Browser nötig“ verfälschen.
Vorschlag: Eine vorhandene nicht leere Inhaltsliste oder konkrete Öffnungszeiten/Orte nicht aufgrund des URL-Pfads allein verwerfen; mindestens die Mehrdeutigkeit als Warnung **neben** dem lesbaren Auszug ausgeben. Gegenbeispiele mit einer Adresse, Ortsnamen ohne Straßenmuster und verschiedenen Ländern testen.

### F16 — Kurze echte Seiten werden pauschal zu Skript-Hüllen
Schwere: hoch
Stelle: app/src/shared/browserOnlyPage.ts:73
Status: [OFFEN]
Die zweite Regel kennt keinen Inhalts- oder DOM-Test: Jedes HTML mit irgendeinem `<script>`, weniger als zwei Adresshinweisen und unter 300 Zeichen `visibleText` **und** Markdown wird zu `shell` (`app/src/shared/browserOnlyPage.ts:65–74`). Eine vollständige kurze Nachricht wie „Entscheidung: Der Termin ist am 12. November.“ mit gewöhnlichem Analyseskript ergibt reproduzierbar `shell`, auch unter `/news`. Ebenso können kurze Fakten, Preisangaben oder Öffnungszeiten wegfallen. Wegen `throw new BrowserOnlyPageError` (`app/src/main/webResearch/fetchExtract.ts:149–150`) verschwindet der Beleg ganz; der Text „lädt erst im Browser“ ist dann objektiv falsch. Der Test für kurze Seiten enthält ausdrücklich **kein** Skript (`app/src/shared/browserOnlyPage.test.ts:40–42`).
Vorschlag: `shell` nur bei nachweisbarer App-Hülle ohne sachlichen Text melden (leerer Root, Loading-/JS-Hinweis o. Ä.); kurze lesbare Artikel und Fakten mit Skript als Negativtests aufnehmen. Im Zweifelsfall den Auszug behalten und die Unsicherheit separat anzeigen.

### F17 — Gekappte Agent-Seiten gelten weiter als erfolgreiche Quellen
Schwere: hoch
Stelle: app/src/main/noteAgent/skills.ts:1782
Status: [OFFEN]
Der IKEA-Nachtrag erklärt, dass die gesuchte Information jenseits der 1,5-MB-Grenze liegt. Für den Chat wird ein gekappter Body abgelehnt (`app/src/main/llm/petrolWebChat.ts:159`; `app/src/main/webResearch/fetchExtract.ts:127–129`). Der Agent ruft `fetchAndExtract` ohne `rejectTruncatedBody` auf (`app/src/main/noteAgent/skills.ts:1782`), während die neue Erkennung bei `res.truncated` bewusst aussetzt (`app/src/main/webResearch/fetchExtract.ts:147–150`). Folglich schreibt der Agent `status: ok`, ergänzt `ctx.run.sources` und gibt ein unvollständiges HTML als WEBSEITE aus (`app/src/main/noteAgent/skills.ts:1783–1789`), ohne `bodyTruncated` zu beachten. Der Quellenblock nennt diese Seite später als erfolgreich gelesen (`app/src/shared/webResearch.ts:445–454`). Der dokumentierte IKEA-Fall bleibt damit im Agenten eine stille Beleglücke.
Vorschlag: Für den Agenten dieselbe Body-Kappungsregel wie im Chat anwenden oder einen Teilstatus bis Werkzeugausgabe, Record und Quellenblock tragen. `IKEA` als Regressionstest für beide Wege aufnehmen.

### F18 — Browser-only ist im Agent-Record nicht erkennbar
Schwere: mittel
Stelle: app/src/main/noteAgent/skills.ts:1796
Status: [OFFEN]
Der Fehlerzweig übernimmt finale URL und Redirect-Kette korrekt, speichert aber nur `status: 'failed'` ohne Grund oder `BrowserOnlyKind` (`app/src/main/noteAgent/skills.ts:1796–1807`; `app/src/shared/webResearch.ts:102–109`). Die Agentenkarte zeigt deshalb nur „fehlgeschlagen“ (`app/src/renderer/components/Agent/AgentRunPanel.tsx:263–266`); der Hinweis steckt ausschließlich im flüchtigen Werkzeugtext an das Modell. Dieser fordert sogar, die URL im Ergebnis zu nennen (`app/src/main/noteAgent/skills.ts:1806–1807`), während `unfetchedUrlsInCells` sie bei XLSX als nicht gelesene Seite ablehnt (`app/src/shared/webResearch.ts:474–489`; `app/src/main/noteAgent/skills.ts:915–924`). In Markdown-/HTML-/XLSX-/PPTX-Quellen erscheint sie ebenfalls nicht, weil nur `status: ok` eingeht. F12 ist damit für den Agenten nicht vollständig adressiert.
Vorschlag: Fehlergrund und Lesbarkeitsstatus im Record führen, auf der Ergebniskarte anzeigen und für alle Agent-Artefakte einen deterministischen Abschnitt „nicht lesbar, selbst öffnen“ getrennt von belegenden Quellen festlegen. Den XLSX-Linkvertrag darauf abstimmen.

### F19 — Erfolgreiche Nachfrage vergisst die nicht lesbare Website
Schwere: mittel
Stelle: app/src/main/index.ts:7320
Status: [OFFEN]
Bei einer Antwort mit anderen zitierten Quellen wird der Snapshot angelegt, enthält aber ausschließlich `WebSource[]` (`app/src/main/index.ts:7358–7365`; `app/src/main/llm/petrolWebSnapshots.ts:12–18`, `:30–35`). Browser-only-Fehlversuche bleiben nur in der ursprünglichen Antwort. Die Nachfrage setzt `failures = []` (`app/src/main/index.ts:7052–7055`) und `browserOnlyHosts = []` ausdrücklich (`:7319–7321`); `resolveFollowUp` liefert nur eingefrorene Quellen zurück (`app/src/main/llm/petrolWebFollowUp.ts:90–115`). Fragt der Nutzer dann gerade nach der zuvor nicht lesbaren Händlerseite, fehlt dem Modell der App-Hinweis, und die neue Antwort zeigt keinen Öffnen-Knopf. Das widerspricht dem Zweck „nicht ‚gibt es nicht‘ schreiben“ über Folgefragen hinweg.
Vorschlag: Einen begrenzten, nicht belegenden Browser-only-Status im Snapshot mitführen und bei Nachfragen wieder als App-Hinweis und Link anbieten; er darf nie als zitierfähige Quelle gelten.

### F20 — Zusätzlicher Systemtext ist nicht im Quellenbudget enthalten
Schwere: mittel
Stelle: app/src/main/llm/petrolWebPrompt.ts:42
Status: [OFFEN]
`browserOnlyBlock` hängt bis zu drei Hostnamen **nach** dem untrusted Block an (`app/src/main/llm/petrolWebPrompt.ts:42–45`, `:81–83`). `freezeWebSourcesToFit` misst den Systemtext vorher ohne diese Hosts (`app/src/main/index.ts:7088–7100`, `:7281–7291`; `app/src/main/llm/petrolWebFollowUp.ts:50–62`). Ein zulässiger DNS-Name kann bis 253 Zeichen haben; drei Namen plus der feste Absatz können einen knapp passenden Prompt um weit über die 200-Zeichen-Kopfzeilenreserve vergrößern. `webChatNumCtx` kappt sich anschließend an der Modellgrenze (`app/src/shared/webChat.ts:133–136`), sodass wieder vorne Regeln oder Quellen still wegfallen können. Die Hostnamen werden zwar auf Buchstaben, Ziffern, Unterstrich, Punkt und Bindestrich reduziert (`app/src/main/llm/petrolWebPrompt.ts:43`) und sind damit nicht direkt als Rollenbefehle injizierbar; diese Prüfung ersetzt aber keine korrekte Budgetierung. Die jetzigen Tests prüfen nur Position und Sonderzeichen (`app/src/main/llm/petrolWebPrompt.test.ts:85–104`).
Vorschlag: Den **fertigen** Prompt einschließlich Browser-only-Block in `measureWithFollowUpRoom`/`freezeWebSourcesToFit` einrechnen und bei Überlauf sichtbar begrenzen. Hostnamen erst nach URL-Parsing aus normalisierten Kandidaten ableiten; die bereinigte Darstellung weiter getrennt vom fremden Seitentext halten.

### F21 — Statistik-IPC umgeht die Absenderprüfung
Schwere: hoch
Stelle: app/src/main/index.ts:6905
Status: [OFFEN]
`web-fetch-stats-get` liefert Website-Hosts und Häufigkeiten, `web-fetch-stats-clear` löscht sie, beide ohne `isTrustedSender(event)` (`app/src/main/index.ts:6904–6906`). Unmittelbar folgende Snapshot-Handler und andere Webrecherche-Handler prüfen den Sender (`:6908–6921`, `:12054–12059`). Die neuen Preload-Methoden (`app/src/main/preload.ts:395–396`) ersetzen keine Main-seitige Prüfung: Jeder WebContents, der einen IPC-Kanal ansprechen kann, erreicht diese Handler unabhängig vom aufrufenden Top-Frame. Das ist für die lesende wie für die löschende Fläche ein neues Abweichen vom Projektvertrag.
Vorschlag: In beiden Handlern `isTrustedSender` prüfen und ein fail-closed-Ergebnis zurückgeben; Tests mit fremdem Frame/Sender für Lesen und Löschen. Der bestehende `open-external`-Handler (`app/src/main/index.ts:10778–10785`), über den auch der neue Knopf geht, hat dieselbe Absenderlücke und sollte dabei mit geprüft werden.

### F22 — Die Zählung meldet nicht dauerhaft gespeicherte Daten als vorhanden
Schwere: mittel
Stelle: app/src/main/webResearch/fetchStats.ts:45
Status: [OFFEN]
Die Promise-Warteschlange serialisiert Änderungen innerhalb dieses Main-Prozesses und `tmp` plus Rename schützt vor halber Zieldatei (`app/src/main/webResearch/fetchStats.ts:18–24`, `:37–43`). Aber `noteFetchOutcome` setzt `cache = next` **vor** dem Speichern (`:47–52`). Schlägt `writeFile` oder `rename` fehl, liefert `getFetchStatsSummary` die neue Zahl aus dem Cache, die auf der Platte fehlt und beim nächsten Start verschwindet. `clearFetchStats` setzt den Cache ebenfalls vor `fs.rm` leer (`:59–63`); die Einstellungsseite verschluckt den Löschfehler und lädt danach den leeren Cache (`app/src/renderer/components/Settings/WebFetchStatsSection.tsx:43–47`). Der Nutzer kann damit „gelöscht“ sehen, obwohl die Hostdatei weiter existiert.
Vorschlag: Erst nach erfolgreichem Write/Rename bzw. `rm` den Cache umstellen; bei Löschfehler den Fehler in der UI anzeigen. Fehlerfall und Neustart als Integrationstest abdecken.

### F23 — „30 Tage“ und „häufigste Websites“ gelten nur eingeschränkt
Schwere: mittel
Stelle: app/src/shared/webFetchStats.ts:90
Status: [OFFEN]
Die Anzeige summiert nur die letzten 30 Tage (`app/src/shared/webFetchStats.ts:121–142`), aber physisch werden alte Tage nur beim **nächsten Abruf** aus `web-fetch-stats.json` entfernt (`app/src/main/webResearch/fetchStats.ts:47–51`); nach dem letzten Abruf können Website-Hosts unbegrenzt auf dem Rechner bleiben. Die Datenschutzaussage „30 Tage“ in der Claude-Antwort gilt damit nicht für die Datei. Zudem werden pro Grund und Tag die **ersten** 50 verschiedenen Hosts behalten (`app/src/shared/webFetchStats.ts:113–116`); ein später 100-mal fehlgeschlagener 51. Host fehlt vollständig in `topHosts`, obwohl die UI „Häufigste Websites je Grund“ verspricht (`app/src/renderer/components/Settings/WebFetchStatsSection.tsx:71–77`). Subdomains bleiben gespeichert (`app/src/shared/webFetchStats.ts:48–52`) und können Mandanten- oder Projektnamen enthalten; „nur Host“ ist damit keine Anonymisierung. `localDay()` wird erst in der Warteschlange ermittelt (`app/src/main/webResearch/fetchStats.ts:47–49`), weshalb ein vor Mitternacht beendeter Abruf bei verzögerter Verarbeitung dem Folgetag zugerechnet wird.
Vorschlag: Aufbewahrungsdauer beim Laden/Lesen auch auf der Platte durchsetzen, oder ausdrücklich nur ein 30-Tage-Anzeigefenster zusagen. Für `topHosts` echte häufigste Hosts zählen oder „erste 50“ kennzeichnen; Zweck und Sensibilität von Subdomains in der UI benennen. Den Ereignistag beim Abrufabschluss vor dem Enqueue festhalten.

### F24 — Öffnen-Knopf fehlt bei Modellfehler trotz Browser-only-Befund
Schwere: niedrig
Stelle: app/src/renderer/components/Agent/PetrolChat.tsx:742
Status: [OFFEN]
Der Knopf erscheint bei `nothing-readable` und fertigen Webantworten (`app/src/renderer/components/Agent/PetrolChat.tsx:766–781`), aber nicht im vorrangigen `turn.answer.error`-Zweig (`:742–765`). Scheitert nach einer gemischten Recherche das Modell, enthält `runPetrolWeb` die `failures` weiterhin im Fehlerergebnis (`app/src/main/index.ts:7338–7342`), die sichtbare Antwort bietet aber die bereits ermittelte Browser-only-Adresse nicht an. Bei schneller Suche und K=0 werden außerdem alle Kandidaten als „nicht abgerufen“ ausgegeben, auch tatsächlich geholte Browser-only-Seiten (`app/src/main/index.ts:7301–7309`; `app/src/renderer/components/Agent/PetrolWebAnswer.tsx:290–300`). Der Schematest für den Knopf ist zweistufig vorhanden (`app/src/renderer/components/Agent/PetrolWebAnswer.tsx:63–65`, `:269–283`; `app/src/main/index.ts:10778–10785`); `url?: string` in `app/src/shared/petrolChatStored.ts:162` lässt alte gespeicherte Gespräche weiterhin laden, zeigt dort erwartbar keinen neuen Knopf.
Vorschlag: Den Link auch bei Web-Modellfehlern aus vorhandenen `failures` anbieten und im K=0-Fall versuchte, nicht lesbare Treffer von wirklich ungeöffneten Treffern trennen. Die Main-seitige URL-/Absenderprüfung aus F21 vor dem Öffnen vervollständigen.

### F25 — Statistik-Warteschlange gilt nur innerhalb einer App-Instanz
Schwere: mittel
Stelle: app/src/main/webResearch/fetchStats.ts:18
Status: [OFFEN]
`queue` und `cache` sind pro Main-Prozess lokal (`app/src/main/webResearch/fetchStats.ts:18–34`), während alle Instanzen desselben Profils `userData/web-fetch-stats.json` und denselben festen `.tmp`-Namen verwenden (`:16`, `:37–43`). Ein `requestSingleInstanceLock` ist im Main nicht eingerichtet (`app/src/main/index.ts`; Suche nach `requestSingleInstanceLock` in `app/src/main/` ohne Treffer). Zwei gestartete Instanzen können beide alte Zähler laden, gleichzeitig dieselbe temporäre Datei schreiben, dann einen Rename-Fehler erhalten oder den Stand der anderen Instanz überschreiben. Das Promise-Queue/`rename`-Paar ist daher nur einzelprozess-atomar und verliert unter Nebenläufigkeit Zählungen.
Vorschlag: Entweder genau eine App-Instanz pro `userData` durchsetzen oder für die Statistik eine prozessübergreifende Sperre bzw. getrennte Logdateien mit Merge verwenden. Einen Zwei-Prozess-Test mit gleichzeitigem Abruf und Reset ausführen.

## Claude-Antwort

### Messung Schritt 0 (06.11.2026)

Auf Codex F03 hin nicht in Electron, sondern im normalen Chrome gemessen (gleiches Risiko wie ein Seitenbesuch). Ohne Browser: der heutige `fetchAndExtract`. Im Browser: `document.body.innerText` nach dem Laden, ohne Klick und ohne Eingabe.

| Seite | ohne Browser | im Browser | Befund |
|---|---|---|---|
| bdkparfums.com/en/pages/stores | 98 Zeichen („Loading Stockist…“) | leer, Karte lädt Händler erst nach Ortssuche | braucht Bedienung (Stufe B) |
| marcantoinebarrois.com/…/store-locator | 1 304 (Warenkorb-Text) | 1 305, Karte im iframe | braucht Bedienung |
| dm.de/store | 0 | 1 818 (nur Navigation) | braucht Bedienung |
| apple.com/de/retail | 2 295 (Navigation) | 3 938, „Stores in der Nähe von Frankfurt“ | **Rendern hilft** (Ort aus der IP) |
| ikea.com/de/de/stores/frankfurt | 132 | 11 893 mit Öffnungszeiten | **steht schon im Roh-HTML**: defuddle verwirft es, `main`/`body` ergibt 15 348 Zeichen, JSON-LD hat `OpeningHoursSpecification` |
| web.telegram.org | 0 | App mit Anmeldung | nichts zu holen |
| alteoper.de, staatstheater-darmstadt.de, wikipedia, tagesschau | voll lesbar | — | kein Problem |
| douglas.de, essenza-nobile.de (403), galaxus.de (Zeitlimit) | gesperrt | — | Rendern hilft nicht, gleicher Netzweg |

Von sechs Problemseiten hilft fertiges Laden bei EINER (Apple). Drei brauchen Bedienung, eine scheitert an unserer Aufbereitung, nicht am fehlenden Browser. Das liegt unter dem Abbruchkriterium (ein Drittel). **Empfehlung: Schritt 2 (Rendern) nicht bauen.** Auch der Ausgangsfall BDK wäre damit nicht gelöst worden — die Annahme im Plan („BDK dürfte gelöst sein“) war falsch. Stichprobe klein, Seiten von Hand gewählt.

Neuer Befund, nicht im Plan: Bei IKEA verliert defuddle Inhalt, der im HTML steht. Ein Rückfall auf `main`/`body` bzw. JSON-LD, wenn defuddle fast nichts liefert, wäre billig und ohne Sicherheitsfrage. Nicht gebaut, Nutzerentscheidung offen.

### Schritt 1 umgesetzt (ohne Rendern)

- `app/src/shared/browserOnlyPage.ts` (`detectBrowserOnlyPage`, Tests daneben): `locator` = Händler-Widget im HTML (Stockist, Progus u. a.) oder Händlerpfad (`stores`, `filialen`, `retail` …, nur ganze Pfadteile), dabei weniger als zwei Adressangaben im Text UND im Roh-HTML, Text ≤ 5 000 Zeichen; `shell` = sichtbarer Text ohne Skripte < 300 Zeichen, ohne Adressen. Adressen im Roh-HTML zählen mit, sonst würde IKEA fälschlich gemeldet. Gegen alle Messseiten geprüft: meldet bdk, barrois, dm, apple (locator), telegram (shell); IKEA, Theater, Wikipedia, Tagesschau bleiben. Das ist die Stichprobe, aus der die Regeln stammen — kein unabhängiger Beleg.
- `fetchAndExtract` wirft `BrowserOnlyPageError` (F09: Roh-HTML liegt dort vor, kein zweiter Abruf). Neuer Grund `browser-only` in `WebFetchFailReason`, im Speicherformat, in der Anzeige („lädt erst im Browser, selbst öffnen“) und im Werkzeugtext der Schleife (F12).
- Antwortmodell (schnell/gründlich/Schleife): `browserOnlyBlock` hängt hinter den fremden Block einen App-Hinweis mit den Hosts: Liste nicht lesbar, Website nennen, nicht „gibt es nicht“ behaupten. Nicht im Budget geschätzt, deshalb auf drei Hosts gedeckelt.
- Agent `web_fetch`: Fehlversuch-Record mit finaler URL, Rückmeldung „Liste steht dort, hier nicht lesbar, Adresse nennen, nichts erfinden, andere Treffer probieren“. Die Seite zählt nicht mehr als Quelle (F12).
- typecheck, build grün; Tests 3439 grün, 2 Zeitüberschreitungen in `shellExecution.test.ts` nur im Gesamtlauf, einzeln grün (unberührte Datei).

### Nachtrag 06.11.2026: Zählung, Knopf, IKEA

- **IKEA ist kein Aufbereitungsfehler, sondern die Bytegrenze.** Die Seite hat 1,9 MB HTML, `WEB_FETCH_MAX_BYTES` kappt bei 1,5 MB, die Öffnungszeiten stehen ab Byte 1,69 Mio. Die vorher vermutete Ursache (defuddle verwirft Text) war falsch: ungekappt liefert defuddle 7 068 Zeichen mit allen Zeiten. Ein Rückfall auf `main`/`body` wurde gebaut, zeigte auf keiner Messseite Nutzen und ist wieder entfernt. Offen (Nutzerentscheidung): Grenze anheben. Kosten gemessen: Aufbereitung im Main 0,26 s (IKEA 1,9 MB) bis 1,3 s (Staatstheater 2,0 MB, Wikipedia 1,6 MB) je Seite, synchron.
- Gekappte Seiten werden nie als „lädt erst im Browser“ gemeldet (`fetchExtract.ts`, `res.truncated`).
- **Knopf** `WebBrowserOnlyLinks` (`PetrolWebAnswer.tsx`): sichtbar unter der Antwort und im Fall „nichts lesbar“, außerhalb des eingeklappten Quellenblocks, höchstens drei Websites, öffnet per `openExternal`. `WebFetchFailure.url` nur bei `browser-only` (Suchtreffer-Adresse), im Speicherformat optional.
- **Zählung** `shared/webFetchStats.ts` (Tests) + `main/webResearch/fetchStats.ts`: `userData/web-fetch-stats.json`, je Tag und Kanal (Chat/Agent) Erfolg und Fehlgrund, bei Fehlschlägen die Website; 30 Tage, 50 Websites je Grund und Tag. Vom Nutzer gestoppte Abrufe zählen nicht. Anzeige und Zurücksetzen: Einstellungen → KI → Webrecherche. IPC nur lesen/löschen.
- Nicht in der laufenden App geprüft (Knopf, Einstellungszeile).

### Runde 2 (F15–F25), umgesetzt nach Freigabe 06.11.2026

- F15: [ADRESSIERT] — `locator` nur noch mit Händler-Widget im HTML (Text ≤ 2 000 Zeichen) oder mit Händlerpfad UND praktisch leerer Seite (< 20 Zeichen Text und sichtbar). Gegenbeispiele (Filialliste ohne PLZ unter `/stores`, ein Laden mit einer Adresse, Widget mit langer Liste) als Tests. Folge an den Messseiten: Apple wird nicht mehr gemeldet, BDK, Barrois, dm weiter.
- F16: [ADRESSIERT] — `shell` nur bei praktisch leerer Seite (< 20 Zeichen). Kurze Meldung und Preisangabe mit Analyseskript als Negativtests.
- F17: [OFFEN, eigene Aufgabe] — gekappte Seiten im Agenten als vollständige Quelle; bestand schon vor dieser Änderung.
- F18: [OFFEN, eigene Aufgabe] — Grund im Agent-Record, Ergebniskarte, Artefakt-Abschnitt „nicht lesbar“, XLSX-Linkvertrag.
- F19: [OFFEN, eigene Aufgabe] — Browser-only-Status im Snapshot für Nachfragen.
- F20: [ADRESSIERT] — Hosts auf 63 Zeichen gekürzt, `BROWSER_ONLY_BLOCK_MAX_CHARS` wird in beiden Einfrier-Wegen (`index.ts`, schnell und gründlich/Schleife) vom Gesamtbudget abgezogen.
- F21: [ADRESSIERT] — `isTrustedSender` in `web-fetch-stats-get`/`-clear`, fail-closed (null/false). `open-external` ohne Absenderprüfung bestand schon vorher: [OFFEN, eigene Aufgabe].
- F22: [ADRESSIERT] — Cache erst nach geglücktem Schreiben bzw. Löschen; Löschfehler kommt als `false` an und wird in den Einstellungen als Warnung gezeigt.
- F23: [ADRESSIERT] — alte Tage werden beim Laden verworfen und beim Anzeigen auf die Platte geschrieben; Tag beim Abruf festgehalten; Liste heißt „Websites je Grund, häufigste zuerst“ mit Hinweis „höchstens die ersten 50 je Tag und Grund“; Datenschutztext nennt Unteradressen. Bleibt: Ohne Anzeige und ohne neuen Abruf liegen alte Tage weiter auf der Platte.
- F24: [ADRESSIERT] — Öffnen-Knopf auch im Fehlerzweig. Nicht adressiert: im Fall K = 0 stehen versuchte, nicht lesbare Treffer weiterhin auch unter „nicht abgerufen“.
- F25: [OFFEN, eigene Aufgabe] — keine Sperre gegen eine zweite Instanz mit demselben Profil; im Alltag selten (Dev und installierte App haben getrennte Profile).
- Geprüft: typecheck, build grün; Tests grün bis auf die bekannten zwei Zeitüberschreitungen in `shellExecution.test.ts` im Gesamtlauf. Nicht in der laufenden App geprüft.

### Zu den Findings

F01–F08, F10, F13, F14: [DISKUSSION] — betreffen das Rendern, das nach der Messung nicht gebaut werden soll. Bleiben gültig, falls es später doch kommt.
F03: [ADRESSIERT] — Messung im normalen Chrome statt in Electron.
F09: [ADRESSIERT] für Schritt 1 — Erkennung am Roh-HTML im ersten Abruf.
F11: [DISKUSSION] — ohne Rendern gibt es keinen Vermerk „im Browser geladen“; der Grund `browser-only` reist über `WebFetchFailure` bis Anzeige und Speicher.
F12: [ADRESSIERT] — strukturierter Grund statt dünner Erfolgsseite, in Chat, Schleife und Agent.

## Status

Plan Rev. 1, Prüfrunde 1 erledigt (14 Findings). Messung Schritt 0 und Umsetzung Schritt 1 am 06.11.2026, nicht committet. Rendern (Schritt 2) nach Messung nicht empfohlen; Nutzerentscheidung offen. Runde 2 (F15–F25) geprüft, freigegebene Punkte umgesetzt; F17, F18, F19, F25 und open-external-Absender als eigene Aufgaben offen.
