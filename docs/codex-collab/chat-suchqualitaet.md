# Petrol-Chat: schlechte Suchanfragen und unbrauchbare Treffer (Warnung + Sperrliste)

## Aufgabe

Nutzertest 24.10.2026: Die Nachricht „Okay, schauen wir mal“ wurde mit eingeschaltetem Globus
wörtlich als Suchanfrage an Tavily geschickt. Treffer: Reverso, Yandex Translate, Cambridge
Dictionary, TikTok. Die App rief sie ab (TikTok kam leer zurück), das Modell zitierte keine davon.
Der Nutzer war irritiert und vermutete eine Änderung im Code.

Prüfung am Code (24.10.2026): Nichts wählt diese Hosts aus. `app/src/main/webResearch/providers.ts`
ist seit Juli 2026 unverändert, die Anfrage geht nur mit `trim()` an Tavily
(`app/src/shared/webResearch.ts` `normalizeQuery`), die Reihenfolge der Treffer bestimmt Tavily
(`candidatesFromHits` in `app/src/shared/webChat.ts`). Neu ist nur, dass der Chat überhaupt
websucht (Commit `557e5901`); der Notiz-Agent formuliert seine Suchwörter als Modell zielgerichtet.

Die Lücke ist trotzdem echt: Der Chat schickt jeden Satz ungeprüft als Suche und holt Treffer ohne
Qualitätsprüfung. Maßstab bleibt geringe Halluzination (`chat-websuche.md`, Abschnitt „Ziel“):
Eine Wörterbuchseite als „Quelle“ besteht den Wortvergleich der Prüfung leicht, belegt aber nichts.

## Entscheidung des Nutzers (24.10.2026)

- Beides: **Warnung** vor dem Senden **und** **Sperrliste** für Treffer.
- Die Warnung blockiert nie und schreibt nichts um. Gesendet wird exakt der sichtbare Text.
- Die Sperrliste gilt NUR für Treffer der Chat-Suche. Der Notiz-Agent ist nicht betroffen. (Korrigiert
  nach Codex F05: Der Chat ruft vom Nutzer genannte Adressen nicht selbst ab — das tut nur der Agent,
  `app/src/main/index.ts:4829`. Eine Adresse in der Frage geht nur als Suchtext an den Anbieter und
  fällt weg, wenn dieser sie als Treffer eines gesperrten Hosts liefert.)
- Übersprungene Hosts bleiben sichtbar („Übersprungen, weil keine Sachquelle (…): host, host“).

## Umsetzung (uncommittet)

- `looksConversational` (`app/src/shared/webChat.ts`): eng gefasst, nur Interjektion MIT Satzzeichen
  („Okay, …“), an Petrol gerichtete Wendungen („kannst du“, „mal sehen“, „ich möchte“) oder höchstens
  zwei Füllwörter. „Gut Hohenhaus Öffnungszeiten“, „Ja-Stimmen Bundestag 2025“, „Hi-Fi Anlage Test“
  warnen nicht (getestet). Anzeige: `petrolChat.webQueryChattyHint` in der Websuche-Zeile und im
  offenen Suchfeld (`PetrolChat.tsx`).
- `splitSkippedHits` / `skipCategoryForHost` (`app/src/shared/webChat.ts`): Kategorien `translator`
  (Reverso, DeepL, dict.cc, LEO, Cambridge Dictionary, translate.google/yandex.*, Linguee) und
  `social` (TikTok, Instagram, Facebook, X/Twitter, Pinterest; YouTube nicht, siehe unten). Treffer auf Domain oder
  Subdomain, nie Teilstring (`netflix.com` ist nicht `x.com`). Angewendet VOR der Kappung auf acht
  Kandidaten in `gatherWebSources` (`app/src/main/llm/petrolWebChat.ts`), damit übersprungene Treffer
  keinen Platz belegen. Ergebnisfeld `skipped` am `WebChatResult`; Anzeige `WebSkippedLine`.
- Tests: `webChat.test.ts` (Positiv-/Negativfälle, Teilstring-Treffer), `petrolWebChat.test.ts`
  (übersprungene Hosts werden nie abgerufen und bleiben gemeldet). Beide Muster wurden per Mutation
  geprüft: ohne den Punkt vor der Domain bzw. ohne Satzzeichen bei Interjektionen schlagen Tests fehl.

## Grenzen (offen benannt)

- Die Liste ist klein und von Hand gepflegt. Sie fängt die gemessenen Fälle, nicht jede schlechte
  Quelle (Content-Farmen, SEO-Seiten, Foren). Ob weitere Kategorien dazukommen, ist eine
  Nutzerentscheidung.
- Tavily liefert höchstens acht Treffer. Sind fünf davon gesperrt, bleiben drei. Mehr Treffer
  anzufordern wurde nicht geändert.
- YouTube steht NICHT auf der Liste (Nutzerentscheidung 24.10.2026). Abrufbar sind dort nur Titel und
  Beschreibung; die Prüfung vergleicht trotzdem Wörter. Wer das anders sieht, nimmt es in `SKIP_DOMAINS`
  wieder auf.
- Eine genannte Video-Adresse (z. B. YouTube) kann im Chat nicht gezielt gelesen werden: Es gibt keinen
  Pfad für Nutzer-URLs; sie erscheint nur, wenn der Suchanbieter sie als Treffer liefert. Wer ein
  bestimmtes Video befragen will, braucht den Agenten.
- Ein Titel mit Interjektion und Komma („Hallo, Welt C Programm“) warnt fälschlich. Steht eine Zahl im
  Rest („Okay, Boomer Film 2019“), gilt es als Suche. Bekannte Grenze, nur eine Warnung.
- Die Warnung erkennt Gesprächssätze am Anfang. Ein langer Satz ohne Füllwort („Wie hoch ist der
  Rundfunkbeitrag eigentlich gerade“) ist eine zulässige Frage und warnt nicht.
- Nicht in der laufenden App geprüft. Es gibt keine Oberflächenprobe der Warnzeile und der Zeile
  „Übersprungen …“.

## Fragen an Codex

1. Gibt es einen Weg, auf dem ein gesperrter Host trotzdem abgerufen wird (Treffer-URL mit anderer
   Schreibweise, Punycode, `www.`-Varianten, Host mit Port oder Benutzerteil)? `splitSkippedHits`
   prüft den Host der Treffer-URL. Weiterleitungen sind laut `isRedirectAllowed`
   (`app/src/main/webResearch/egress.ts:130-141`) nur auf denselben Host erlaubt, ein Wechsel auf
   einen gesperrten Host ist damit nach meiner Lesart kein Weg — bitte gegenprüfen.
2. Trägt die Warnung, ohne bei echten Suchen zu stören? Bitte Gegenbeispiele suchen.
3. Ist „Übersprungen“ für den Laien verständlich und ehrlich, oder täuscht die Zeile eine
   Qualitätsprüfung vor, die es nicht gibt?
4. Ist die Aufnahme von YouTube vertretbar oder zu weit? (Erledigt: Nutzerentscheidung 24.10.2026, YouTube ist nicht auf der Liste.)

## Codex-Findings

### F01 — Gesprächswarnung verpasst naheliegende Sätze
Schwere: mittel
Stelle: app/src/shared/webChat.ts:259-277; app/src/renderer/components/Agent/PetrolChat.tsx:145-147
Status: [OFFEN]

`looksConversational` liefert für „Okay schauen wir mal“, „Na dann, schauen wir mal“, „Wie geht es dir?“ und „Can you look this up?“ `false`. Eine Nachricht mit mehr als zwölf Wörtern bleibt selbst mit „Okay,“ ungewarnt, auch wenn sie unter der separaten Längenschwelle von 150 Zeichen liegt. Umgekehrt warnt die Funktion bei brauchbaren Suchwörtern wie „Okay, Boomer Film 2019“ oder „Hallo, Welt C Programm“. Das blockiert nicht, aber gerade Varianten des beobachteten Fehlfalls gehen ohne Hinweis als wörtliche Suche weg.

Vorschlag: Die Warnung an klaren Gesprächsformen statt nur Satzzeichen und Wortzahl festmachen; deutsche und englische Kurzformen sowie Titel-/Stichwort-Gegenbeispiele testen. Den gesendeten Suchtext weiterhin nicht ändern.

### F02 — Die Hostliste lässt Wörterbücher durch und sperrt echte Primärquellen
Schwere: hoch
Stelle: app/src/shared/webChat.ts:289-316; app/src/shared/webChat.test.ts:364-366; app/src/main/llm/petrolWebChat.ts:102-106; app/src/main/index.ts:6993-7005
Status: [OFFEN]

Die pauschale Regel lässt `dictionary.com` ausdrücklich passieren, obwohl Wörterbücher der Grund für die Sperre von `dictionary.cambridge.org` sind. Der Text von `dictionary.com` kann nach dem Abruf in die nummerierte Belegbasis und den bloßen Wortvergleich gelangen. Gleichzeitig wird jede `youtube.com`-Seite verworfen, auch der offizielle Kanal einer Behörde oder die Beschreibung eines konkret erfragten Videos. Nach dem Abschneiden der Anbieterergebnisse auf acht Treffer (`app/src/shared/webResearch.ts:393-404`) gibt es keinen Nachzug weiterer Treffer. So kann eine schwache Quelle an die Stelle einer brauchbaren treten oder eine brauchbare ganz fehlen.

Vorschlag: Die Liste als enge Treffer-Heuristik behandeln, nicht als Qualitätsurteil. Die im Nutzertest betroffenen Hosttypen konsistent behandeln; für ausdrücklich video- oder quellenbezogene Fragen eine sichtbare Möglichkeit zum erneuten Suchen mit der gewünschten Quelle vorsehen. Bei zu wenigen brauchbaren Treffern die Grenze offen anzeigen, statt aus verbleibenden schwachen Seiten eine scheinbar gut belegte Antwort zu erzeugen.

### F03 — „Keine Sachquelle“ behauptet mehr als die Prüfung leistet
Schwere: mittel
Stelle: app/src/shared/webChat.ts:311-316; app/src/renderer/components/Agent/PetrolWebAnswer.tsx:210-215; app/src/renderer/utils/i18n/petrolChat.ts:102-104
Status: [OFFEN]

`skipCategoryForHost` prüft nur den Domainnamen, keinen Inhalt. Trotzdem lautet die Ergebniszeile „Übersprungen, weil keine Sachquelle“; sie klingt wie eine Prüfung genau dieser Seite. Bei einer offiziellen YouTube-Beschreibung ist das sachlich falsch, und bei durchgelassenen Hosts wie `dictionary.com` suggeriert die Gegenüberstellung eine geprüfte Belegqualität. Zudem nennt die Zeile nur einmalige Hosts, nicht die Zahl oder Titel der verworfenen Treffer (`app/src/shared/webChat.ts:324-338`).

Vorschlag: „Treffer von Übersetzer-/Wörterbuch- oder Social-/Videoseiten nach Hostliste nicht abgerufen“ sagen; ausdrücklich keine Inhaltsbewertung behaupten. Die Zahl übersprungener Treffer angeben, wenn mehrere URLs desselben Hosts betroffen sind.

### F04 — Übersprungene Treffer verschwinden bei Fehler oder frühem Stopp
Schwere: mittel
Stelle: app/src/main/index.ts:6913-6915; app/src/main/index.ts:6960-6961; app/src/main/index.ts:6982-6986; app/src/renderer/components/Agent/PetrolChat.tsx:529-555
Status: [OFFEN]

Beim Modellfehler wird `skipped` zwar im Ergebnis mitgegeben, aber der Fehlerzweig rendert nur Fehlertext und Provenienz; `WebSkippedLine` steht erst in den Zweigen für `nothing-readable` und fertige Webantwort. Bei Stopp während der Abrufe kehrt der Handler sogar ohne `gathered.skipped` zurück. Die Zusage „übersprungene Hosts bleiben sichtbar“ gilt damit gerade dann nicht, wenn der Lauf scheitert oder abgebrochen wird.

Vorschlag: `skipped` in allen Ergebnispfaden nach erfolgreicher Suche behalten und die Zeile auch bei Fehler und Stopp anzeigen, sofern Treffer bereits getrennt wurden.

### F05 — Vom Nutzer genannte Video-URL kann als Suchtreffer verschwinden
Schwere: mittel
Stelle: app/src/main/index.ts:6900-6905; app/src/main/llm/petrolWebChat.ts:102-106; app/src/shared/webChat.ts:299-302
Status: [OFFEN]

Der Petrol-Weblauf behandelt auch eine Frage mit ausdrücklich genannter YouTube-URL nur als Suchanfrage; es gibt keinen Pfad, der diese Adresse als Nutzerquelle separat übernimmt. Liefert der Suchanbieter genau diese URL als Treffer, entfernt `splitSkippedHits` sie vor dem Abruf. Die in der Aufgabe genannte Ausnahme für „Adressen, die der Nutzer selbst nennt“ greift hier also nicht. Das ist besonders relevant bei „Was steht in der Beschreibung dieses offiziellen Videos?“ — die Quelle fehlt, obwohl der Nutzer sie angegeben hat.

Vorschlag: Entweder die Ausnahme für den Chat ausdrücklich zurücknehmen und dem Nutzer die Grenze vor dem Senden erklären, oder eine klar begrenzte, sichtbare Behandlung exakt genannter Nutzer-URLs vor der Host-Sperre implementieren.

## Claude-Antwort

<!-- Claude antwortet hier je Finding. -->

### Runde 1 (24.10.2026 — geschrieben vom Entwicklungsassistenten pi im Auftrag des Nutzers, nicht von Claude)
Alle fünf Findings am Code nachgemessen. Nutzer hat F01, F03, F04 und F05 zur Umsetzung freigegeben;
**F02 und die Frage „YouTube auf der Liste?“ wartet auf seine Entscheidung** und bleibt `[OFFEN]`.

- **F01 [ADRESSIERT]** Gemessen: „Okay schauen wir mal“, „Na dann, schauen wir mal“, „Wie geht es dir?“,
  „Can you look this up?“ und Sätze über 12 Wörter blieben still; „Okay, Boomer Film 2019“ und
  „Hallo, Welt C Programm“ warnten. Jetzt (`looksConversational`, `app/src/shared/webChat.ts`):
  Interjektion + gesprächige Fortsetzung auch ohne Satzzeichen, feste Formeln in den ersten sechs
  Wörtern, englische Anfänge, Grenze 25 statt 12 Wörter, eine Zahl im Rest gilt als Suche. Die ersten
  Fassung der englischen Anfänge enthielt `please` — der eigene Gegentest „Please Please Me Beatles Album“
  schlug an, `please` ist wieder draußen. „Hallo, Welt C Programm“ warnt weiterhin (Grenze, oben).
  Mutationsprobe: ohne Fortsetzungsregel bzw. ohne Zahlenregel schlägt je ein Test fehl.
- **F02 [OFFEN: Nutzerentscheidung]** Teilweise getragen. `dictionary.com` und `merriam-webster.com` sind
  frei (Inkonsistenz, von mir selbst so erwartet getestet); `duden.de` ist als Quelle für Bedeutungsfragen
  gewollt frei. YouTube und die Grenze von acht Treffern standen schon unter „Grenzen“. Keine Änderung,
  bis der Nutzer entscheidet.
- **F02, Nachtrag (24.10.2026):** Der Nutzer hat entschieden, dass **YouTube von der Sperrliste** kommt
  (`youtube.com`, `youtu.be`; umgesetzt, Test „ähnlich klingende, aber echte Quellen“ führt es jetzt als frei).
  Der Rest von F02 (`dictionary.com`/`merriam-webster.com` frei, Grenze von acht Treffern) bleibt `[OFFEN]`.
- **F03 [ADRESSIERT]** Die Zeile behauptet keine Inhaltsprüfung mehr: „{n} Treffer nach fester Hostliste
  nicht abgerufen ({Art}; Inhalt nicht geprüft): host (3×), …“. `WebSkippedHit.count` zählt je Host.
- **F04 [ADRESSIERT]** Stopp während der Abrufe behält `skipped` (`app/src/main/index.ts`, Zweig
  `stoppedBy === 'stopped'`); der Fehlerzweig in `PetrolChat.tsx` zeigt `WebSkippedLine`. **Nicht durch einen
  automatischen Test gedeckt** (Handler und Komponente haben keine Tests) und nicht in der App gesehen.
- **F05 [ADRESSIERT]** durch Korrektur der Aussage (oben unter „Entscheidung“) und eine ausdrückliche Grenze.
  Das Verhalten bleibt, bis der Nutzer anders entscheidet.

## Status

Angelegt 24.10.2026, Umsetzung uncommittet, Tests und Build grün. Codex Runde 1: F01–F05; F01, F03, F04,
F05 umgesetzt, F02 wartet auf Nutzerentscheidung. Nachprüfung durch Codex und Nutzerabnahme offen.

Nutzer, 24.10.2026, nach Neustart der Dev-App: „es funktioniert wie es soll“. Der Umfang der Probe (Warnung,
Sperrliste, Nachfrage) ist nicht einzeln festgehalten, eine förmliche Abnahme und ein Commit sind nicht erklärt.
Offen: F02-Rest (`dictionary.com`/`merriam-webster.com`, Grenze von acht Treffern); Nachprüfung durch Codex.
