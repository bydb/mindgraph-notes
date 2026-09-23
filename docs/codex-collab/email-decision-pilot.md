# E-Mail-Decision-Pilot — Bauplan und Codex-Prüfung

Stand: 22.09.2026 · Revision 1 · Codebasis: `56a74e8d`

## Aufgabe

Nutzerauftrag: Vorschlag zu Jev-artigen Decision-Modellen am Projekt prüfen, einen geprüften
Plan erstellen; Claude baut, Codex prüft die Umsetzung. Dieses Dokument ist Bauauftrag und
Übergabedatei. Kein Anwendungscode wurde für diese Planung verändert.

**Ziel:** Messen, ob ein kleiner lokaler Klassifikator einen wirtschaftlichen und ausreichend
zuverlässigen E-Mail-Vorfilter ermöglicht. Zunächst entstehen ausschließlich zusätzliche
Messwerte. Jede heute vorgesehene Vollanalyse läuft weiterhin mit ihrem bisherigen Anbieter.

**Umfang:** Messwerkzeug, reine Entscheidungspolitik, lokaler ONNX-Adapter, abschaltbarer
Shadow-Betrieb. Keine Jev-/Von-Abhängigkeit, kein Python-Dienst, kein Reranker, keine Änderung
von Vault-Chat, Projektzuordnung oder gebündelten Plugins. Kein automatisches Senden,
Archivieren, Löschen, Umklassifizieren oder Erzeugen von Aufgaben durch den Decision-Pfad.

### 1. Entscheidungen

1. **Nur `off | shadow` implementieren**, Standard `off`. Kein versteckter produktiver
   `skip`-Schalter. `skip | full-analysis | review` sind ausschließlich *hypothetische*
   Routen im Messdatensatz. `review` bedeutet Unsicherheit und im späteren Gate Rückfall auf
   die bisherige Vollanalyse; es öffnet im Pilot keine zusätzlichen Dialoge.
2. **Schmales internes Interface statt Jev-Nachbau:** `DecisionEngine.evaluate(input, signal)`
   liefert versionierte Ergebnisse fester binärer Fragen plus technische Abstention.
   `choice`, ordinale `score` und `noul` sind kein erforderlicher Vertrag für diesen Pilot.
   Insbesondere ist eine NLI-Zahl keine allgemeine semantische Skala. Erst ein weiterer
   konkreter Verbraucher rechtfertigt ein allgemeines Interface.
3. **Modellkandidat:** `onnx-community/multilingual-MiniLMv2-L6-mnli-xnli-ONNX`, q8 nur,
   falls die tatsächlich verfügbaren Dateien und die installierte Runtime es unterstützen.
   Original: `MoritzLaurer/multilingual-MiniLMv2-L6-mnli-xnli` (mehrsprachiges NLI,
   Modellkarte MIT). Das ist eine begründete Testauswahl, keine Qualitätszusage.
   Claude verifiziert Revision, Export-Lizenz, Tokenizer, Label-Mapping, Dateien, Größe und
   Quantisierung in Paket B. Keine unbemerkte Modellsubstitution bei Fehlern.
4. **Inferenz außerhalb des Main-Event-Loops:** eigener vom Main verwalteter
   `worker_threads`-Worker, CPU, begrenzte Threadzahl, eigener Build-Einstieg.
   Kein Import der ONNX-Runtime im UI oder synchrones Rechnen im Main. Der Whisper-Worker
   ist ein Architekturbeispiel, kein gemeinsam genutzter Modellprozess. Falls die native
   Runtime im gepackten Electron scheitert, bleibt Paket C aus; Alternative dokumentieren,
   nicht still auf Renderer, Python oder Cloud ausweichen.
5. **Schattenmessung nach der normalen Analyse:** vor dem LLM lediglich einen begrenzten
   Eingangsschnappschuss samt Regeln sichern; zur späteren Auswertung einreihen, sobald die
   reguläre Analyse beendet ist. Keine Abhängigkeit ihres Erfolgs vom Shadow-Ergebnis.
   So bleibt der Decision-Eingang frei vom LLM-Ergebnis, ohne gleichzeitig zwei Modelle
   auf schwacher Hardware zu belasten. Die künftige Vorfilter-Latenz separat im Replay messen.

### 2. Fachlicher Vertrag

`DecisionInput` enthält nur den notwendigen Mailtext und Kontext: Betreff, Body-Text,
Empfängerperspektive, Vorhandensein von Anhängen, Threadhinweise, vorab berechnete harte
Signale sowie Version/Hash der Instruktions-Notiz. Keine Passwörter, Anhänge als Binärdaten
oder globalen Vault-Inhalte. Der Worker erhält keine Dateipfade oder frei wählbaren URLs.

Feste, versionierte Fragen/Hypothesen:

- Erwartet diese Mail eine Antwort des Empfängers?
- Enthält sie eine Handlung, Frist, Einladung oder Terminänderung für den Empfänger?
- Ist sie zeitkritisch?
- Ist sie ein unpersönlicher Newsletter oder eine reine automatische Information?

Persönliche Relevanz wird nicht allein aus diesen vier generischen Fragen abgeleitet.
Freitextkriterien aus der Instruktions-Notiz können beliebige Themen enthalten. Im ersten
Pilot gilt deshalb: **nichtleere weiche Kriterien → `review`**, solange ihre Abdeckung nicht
separat implementiert und gemessen ist. Die dadurch verlorene Einsparung wird ausgewiesen.

Technischer Ergebnisvertrag: `status: ok | abstain`, bei `ok` je Frage rohe
Entailment/Neutral/Contradiction-Logits und abgeleitete Scores; daneben feste Ursachencodes,
Eingabeabdeckung, Paar-/Tokenanzahl, Dauer und Artefaktversionen. Keine generierten Gründe.
`abstain` umfasst Timeout, ungültiges Label-Mapping, NaN, fehlendes Modell, nicht unterstützte
Sprache, unvollständigen Text und technische Fehler. Modellunsicherheit ist zusätzlich
eine Entscheidung der reinen Policy; ein technisches `ok` bedeutet nicht sicher.

**Reihenfolge der hypothetischen Routing-Policy:**

1. Explizite Neu-/Einzelanalyse → `full-analysis`.
2. Positive harte Signale (`weight > 0`, auch Keyword-/Namens-Boost), Anhang,
   Threadbezug (`inReplyTo`/`references`), erkannte Handlungs-/Terminmarker → `full-analysis`.
   Bekannter Absender ist ein Routing-Signal, keine Authentifizierung.
3. Fehlender/leerer Body, ungültige Eingabe, technische Abstention, Trunkierung,
   unberücksichtigte weiche Kriterien, ungeprüfte Sprache oder fehlende passende
   Kalibrierung → `review`.
4. Modell sieht Antwort-/Handlungsbedarf oder Dringlichkeit → `full-analysis`.
5. Nur wenn die kalibrierte Negativentscheidung alle Risikofragen ausschließt und die
   unpersönliche Informationsklasse ausreichend sicher ist → hypothetisch `skip`.
   Alle übrigen Fälle → `review`.

Ohne Kalibrierungsartefakt gibt es daher **kein** hypothetisches `skip`. Regeln allein
haben ebenfalls eine ehrliche Baseline: positive Schutzregeln und sonst `review`.
Zusätzlich kann eine ausdrücklich experimentelle Negativregel auf dem Kalibrierungssatz
verglichen werden; nicht aus dem Fehlen positiver Regeln auf Irrelevanz schließen.

Textbehandlung: Text nicht still auf 3000 Zeichen oder Tokenlimit kürzen. Tokenlänge von
Prämisse **plus Hypothese und Spezialtokens** vor Inferenz prüfen. Zunächst keine komplexe
Chunk-Aggregation: passt die Mail nicht vollständig hinein, `review` und Abdeckungsgrund.
Weiterleitungen/Zitate nicht entfernen. Anhänge, HTML-only und leere Texte sind kein
Negativbeweis. Hypothesen und deren Sprache gehören zur Version der Auswertung.

### 3. Statistik und Nutzenmessung

**Goldstandard sind manuelle Labels, nicht die heutige LLM-Ausgabe.** Pro Mail:
`important`, `needsReply`, `hasActionOrDate`, `urgent`, `safeToSkip`, jeweils ja/nein/unklar
mit kurzer lokaler Begründung. `safeToSkip` darf nur ja sein, wenn keinerlei benötigte
Information, Zusammenfassung, Aufgabe oder Termin durch Weglassen der Analyse fehlt.
Unklare Fälle blockieren Skip. Heutige Ausgaben sind ein Vergleichsarm, keine Wahrheit.

- Start mit 200–500 lokal gelabelten Mails; 50 synthetische/ausgewählte Fälle reichen nur
  für einen Funktionstest. Echte Inhalte bleiben außerhalb des Git-Repos in einem bewusst
  gewählten lokalen Datensatz. Ein Bedienablauf muss Lesen, Labeln und erneutes Laden
  ermöglichen; initial genügt ein lokales JSONL-Format plus Prüf-/Auswertungs-CLI.
- Vor Abstimmung von Hypothesen und Schwellen einen gruppierten Split einfrieren:
  60 % Entwicklung, 20 % Kalibrierung, 20 % Holdout als Startaufteilung.
  Threads und nahezu identische Newsletter-Vorlagen dürfen keine Teilmengen überbrücken.
  Zusätzlich spätere Mails zeitlich getrennt prüfen. Split-Seed und Gruppen manifestieren.
- Repräsentative Zufallsstichprobe für Coverage/Nutzen; separat schwierige Fälle sammeln:
  deutscher Behördenstil, Englisch, Rechnung mit Zahlungsfrist, Newsletter mit persönlichem
  Absatz, Formularanfrage, Buchungsbestätigung, Terminabsage, ICS, lange Weiterleitung,
  manipulative Anweisung, unbekannter Absender. Stressfälle nicht als Alltagsverteilung ausgeben.
- Eine zweite manuelle Bewertung einer Teilmenge samt Klärung von Uneinigkeit dokumentieren.
  Regel- und Antwortverlauf für historische Mails aus damaligem Kontext rekonstruieren;
  wo das unmöglich ist, die historische Simulation als verzerrt kennzeichnen. Nicht spätere
  Antworten als damals bekannte Kontaktinformation verwenden.
- Vergleiche: aktuelle Vollanalyse; Regeln allein; Regeln plus NLI. Im normalen Shadow-Lauf
  keine zusätzlichen generativen Requests zum Benchmarken und keine neue Cloud-Freigabe.
  Replay generativer Baselines nur ausdrücklich gewählt, mit festgehaltenem Provider/Modell.
- NLI-Softmax ist **keine kalibrierte Wahrscheinlichkeit für „gefahrlos überspringbar“**.
  Neutral-Klasse nicht still verwerfen. Kalibrierung (z.B. Temperature Scaling) ausschließlich
  auf Kalibrierungsdaten; sowohl rohe als auch kalibrierte Werte behalten. Im ersten Pilot
  rohe NLI-Logits über SequenceClassification beziehen, Label-Mapping explizit validieren.
  Eine produktive Skip-Schwelle wird hier nicht erfunden.
- Metriken pro Risikoklasse und insgesamt: Anteil wichtiger Mails, die hypothetisch übersprungen
  würden; Anteil unsicherer Mails unter allen Skip-Kandidaten; Skip-Coverage;
  `review`-Anteil; Brier/ECE mit Fallzahl und dokumentierten Bins; technische Ausfälle,
  fehlende Body-Abdeckung und ausgelassene Shadow-Jobs. Fehlerhafte LLM-Läufe mitzählen.
- Bei null Fehlern unter n unabhängigen Positivfällen beträgt die einseitige obere
  95-%-Grenze der Fehlerrate `1 - 0.05^(1/n)`. Für weniger als 1 % sind mindestens
  299 solche Fälle nötig, **nicht 299 beliebige Mails**. Threadkorrelation reduziert die
  Aussagekraft. 200–500 Gesamtmails starten die Untersuchung; sie erlauben regelmäßig
  noch keine belastbare Skip-Freigabe. Das gewünschte Risikobudget entscheidet der Nutzer
  erst vor einem produktiven Gate, getrennt für wichtige Mails und Handlungs-/Terminfälle.
- Messen auf dem Zielrechner: p50/p95 pro kompletter Mail (alle Fragen), Laden kalt/warm,
  Peak-RSS des Worker-Prozesses bzw. gesamter Prozess bei Threads, Main-Event-Loop-Lag,
  Modell-/Cachegröße, Analyse-Batchdauer mit/ohne Shadow. Energie nur bei echter Messung
  ausweisen, sonst „nicht gemessen“. Hardware und Laufzeitversionen protokollieren.
- Gegenfaktische Einsparung: `Summe Baseline-Zeit der Skip-Kandidaten − gesamte Gate-Zeit
  einschließlich Laden`. Als Schätzung bezeichnen; tatsächliche Batchbeschleunigung erst
  im kontrollierten Replay messen. Keine Zeitgutschrift in der produktiven Arbeitsbilanz.

### 4. Lebenszyklus, Datenschutz und Persistenz

Main verwaltet `off → loading → ready → running → ready`, plus `error` und Abbruch.
Maximal ein Worker, ein aktiver Job, 20 wartende Jobs; Queue voller → Messlücke zählen,
keine Vollanalyse blockieren. Vorläufige technische Budgets: 60 s Modellladen, 5 s je
Mail nach Laden, 60 s Leerlauf bis Entladen; keine Qualitäts- oder Geschwindigkeitszusage.
Nach Timeout Worker tatsächlich terminieren, nicht nur `Promise.race` beenden. Kein
automatischer Neustartsturm. CPU-Threadzahl zunächst 1.

Shadow nur bei freiem Vordergrund/ohne laufende reguläre Mailanalyse. Neuer Vordergrund
pausiert Queue; höchstens der begrenzte aktuelle Job läuft aus. Im Schonmodus kein
automatisches Modell-Warmup. Niedrig priorisierte oder verworfene Fälle im Bericht nennen,
damit die Auswahl schneller/kurzer Mails nicht unsichtbar wird. Vordergrund-/STT-Last in
Paket C explizit prüfen, vorhandener Ollama-Aktivitätszähler deckt nicht jeden Verbraucher ab.

Jeder Job trägt `jobId`, Vaultkennung, Account-/Mailkennung, Eingabehash und Generation.
Abschalten, Vault-Wechsel, Fensterende und App-Ende leeren Queue und invalidieren Generation;
verspätete Ergebnisse werden verworfen. Neue Einstellungen/Regeln/Kalibrierung invalidieren
alte Messidentitäten. Keine automatische Übertragung einer Kalibrierung auf andere Vaults.

Pilotkonfiguration und Ergebnisse liegen unter `userData/email-decision/<vault-key>/`,
nicht in `.mindgraph/emails.json`; serialisierte, atomare Writes, Schema-Validierung,
30 Tage/5000 Einträge als anfänglicher Deckel. Ergebnisse enthalten pseudonyme IDs,
Hashes, Klassen, Versionen, Dauern und Fehlercodes, keine Betreffzeilen, Bodies, Adressen,
vollständigen Modellantworten oder freien Fehlertexte mit Mailinhalt. IDs sind nicht anonym;
Kennungen per lokalem HMAC ableiten. Auf Wunsch Ergebnisse löschen; ein noch laufender Job
darf sie danach nicht neu anlegen. Labeldaten mit Inhalt separat und ausdrücklich lokal.

Modelle getrennt unter `userData/models/email-decision/`: einmaliger sichtbarer Download
oder lokaler Import, feste Revision und Dateiliste, Hashprüfung und Größenlimit.
Unvollständige Downloads nicht aktivieren. Inferenz verwendet ausschließlich lokale Assets,
Remote-Modell-Fallback deaktiviert. Weder frei eingegebene Modell-URLs noch Remote-Code.
Installation darf Modellbytes laden; Mailinhalte verlassen den Rechner über diesen Pfad nie.
Der bisher ausdrücklich ausgewählte Cloud-Pfad der Vollanalyse bleibt davon getrennt.

Main liest die Pilotkonfiguration selbst; Renderer liefert nur freigegebene Bedienaktionen.
Neue Vault-IPC-Einstiege prüfen `assertApprovedVault`; Dateizugriffe im Vault gehen über die
bestehenden Pfadschutzhelfer. Preload nur schmale API, Events mit Job-/Vaultkennung und
gezieltem Unsubscribe. Keine neue generische Inferenz-/Dateischnittstelle.

### 5. Baupakete für Claude

| Paket | Konkretes Ergebnis | Fertig, wenn |
|---|---|---|
| A — Messgrundlage | `shared/decision/types.ts`, `emailPolicy.ts`, pure Tests; lokales JSONL-Labelschema und `app/scripts/email-decision-eval.ts`; synthetische Fixtures; Report mit Baselines, Splits und Unsicherheit | Routing-Randfälle, ungültige Werte, Gruppentrennung und Metriken geprüft; CLI läuft ohne Modell und ohne Änderung an Maildaten |
| B — Lokale Inferenz | `main/decision/` mit Adapter, Worker, Host und Modellmanifest; separater electron-vite-Einstieg; reproduzierbarer Offline-Smoke-Test; CLI-Replay mit realem Kandidaten | echtes Modell läuft auf Deutsch/Englisch, alle drei NLI-Labels korrekt; Timeout/Abbruch/Trunkierung geprüft; gepackte App lädt offline; Messbericht mit RAM und Zeiten liegt vor |
| C — Shadow-Integration | Main-Konfiguration/Ergebnisspeicher, kleiner Beobachtungshook in `email-analyze`; Preload/API-Typen; Einstellungen über `SettingsUI` plus DE/EN-Schlüssel; Status, Abbrechen/Löschen und aggregierter Bericht | default aus; normale Analyse bei Modellfehler unverändert; Queue/Vault-Wechsel getestet; kein Shadow-Ergebnis verändert Mails, Notizen, Aufgaben oder Workflows |

**Reihenfolge:** Claude baut A, dokumentiert Tests und Abweichungen unten, Codex prüft A;
danach B und dieselbe Schleife; danach C. Kein weiteres Paket über einen ungelösten
kritischen/hohen Implementierungsbefund hinweg. Nutzerauftrag deckt den Bau dieses Piloten
ab; daraus folgt keine Freigabe für produktives Überspringen, Release, Commit oder Push.

Nach Codeänderungen aus `app/`: `npm run typecheck` und `npm run test`, für B/C zusätzlich
`npm run build`. Build allein reicht für B nicht: ein gepackter Teststand muss den Worker
und ONNX-Assets ohne Netz finden. Unterstützte Plattformen einzeln dokumentieren; auf nicht
getesteten Plattformen Pilot als nicht verfügbar behandeln. Neue Dependencies nur bei
nachgewiesenem Bedarf, danach laut Projektregel `npm audit`.

Gezielte Integrationsprüfungen für C: dieselben synthetischen Mails mit Shadow aus/an und
deterministischem Fake der Vollanalyse → gleiche Analyseergebnisse und Nebenwirkungen
(Zeitstempel normalisiert); Timeout/OOM/fehlendes Modell, Doppelklick, beschädigter
Ergebnisspeicher, Queueüberlauf, Vault-Wechsel, Ausschalten während Inferenz, Löschen
während Job, manuelle Reanalyse, Cloud-/Hard-Lock-Routing und bestehende Merge-Semantik.
Kein Test schickt reale Mails, erstellt reale Termine oder ruft kostenpflichtige APIs auf.

### 6. Separater späterer Schritt: produktives Gate

Nicht Bestandteil der drei Pakete. Benötigt neuen geprüften Vertrag und Nutzerentscheidung:
Risikobudget, belastbarer Holdout und zeitlicher Nachtest, positiver Netto-Nutzen auf Zielhardware,
eigener Status „Analyse übersprungen“, sichtbare Wiederaufnahme/Neu-Analyse sowie Änderungen
an Filtern, Notizerstellung, Workflow-Triggern und Mail-Merge/Sync. Fehlende Analyse darf weder
als `relevant=false` ausgegeben werden noch endlos erneut in den Analyse-Backlog geraten.
Kalibrierungsablauf bei Regel-/Modellwechsel, Stichprobenkontrolle und Rückschaltung gehören
vor Aktivierung dazu. Wenn Nutzen oder Qualität nicht reichen: Pilot aus, Messbericht behalten.

## Kontext/Anker

Gegen echten Code geprüft (Zeilennummern des obigen Stands):

- `app/src/main/index.ts:11931`: regulärer Handler, Cloud-/Hard-Lock-Routing ab 11935.
- `app/src/main/index.ts:11992`: Antwortstatistik; ab 11999 automatische Auswahl nur
  unanalysierter, nicht in Notizen überführter, nicht gesendeter Mails. Nicht jede neue Mail.
- `app/src/main/index.ts:12019`: Merge-Persistenz; ab 12071 Body auf 3000 Zeichen begrenzt;
  ab 12217 Retry und anschließende Hybrid-Bewertung. Harte Signale sparen aktuell keinen Aufruf.
- `app/src/shared/emailRelevance.ts:226`: `computeHardSignals`; ab 288 `combineRelevance`.
- `app/src/renderer/stores/emailStore.ts:469`: Auswahl des Anbieters; 576 manuelle Reanalyse;
  616 Notizerstellung; 699 Filter mit Nutzerschwelle statt `analysis.relevant`.
- `app/src/shared/types.ts:1636`: Mailkennung, Account, Anhänge und Threadfelder;
  1709 vollständiges `EmailAnalysis`-Schema, kein Zustand für übersprungene Analyse.
- `app/src/renderer/stores/workflowStore.ts:595`: ICS-Trigger setzt Analyse voraus;
  607 normaler Trigger braucht `relevant` und `needsReply`.
- `app/src/main/email/store.ts:505`: serialisierte Mutation des Mailbestands.
- `app/src/renderer/utils/voice/transformersWorker.ts:6`: vorhandener ONNX-Worker;
  ab 9 bewusst Remote-Modellladen für Whisper, für diesen Pilot nicht blind übernehmen.
- `app/package.json:154`: Transformers-Abhängigkeit; `app/electron.vite.config.ts:14`:
  bisheriger Main-Build mit nur einem Einstieg.
- Installierte Bibliothek `app/node_modules/@huggingface/transformers/src/pipelines/zero-shot-classification.js:101`:
  Schleife über Hypothesen, automatische Trunkierung, Neutral-Klasse in Multi-Label-Score
  weggelassen. Lokaler Nachweis, keine zu committende Datei.
- `app/src/main/index.ts:5967`: generativer Paar-Reranker;
  `docs/vault-chat-plan.md:95`: Reranker bewusst nicht in Vault-Chat v1.

Externe Primärquellen, am 22.09.2026 abgerufen:

- [TypeSafe Confidence](https://docs.typesafe.ai/confidence): Konfidenz aus Antwortverteilung;
  Grenzen müssen nach Risiko und eigenen Daten gewählt werden. Keine Fehlergarantie.
- [Transformers.js Zero-Shot API](https://huggingface.co/docs/transformers.js/api/pipelines#module_pipelines.ZeroShotClassificationPipeline):
  Multi-Label-Option und Normalisierung. Öffentliches Main-Dokument und installiertes
  Paket können voneinander abweichen; maßgeblich sind Lockfile und lokale Implementierung.
- [Originalmodell](https://huggingface.co/MoritzLaurer/multilingual-MiniLMv2-L6-mnli-xnli):
  mehrsprachiges NLI und Lizenzangabe.
- [ONNX-Export](https://huggingface.co/onnx-community/multilingual-MiniLMv2-L6-mnli-xnli-ONNX):
  vorhandener Export mit Transformers.js-Nutzung. Gewichte wurden hier nicht heruntergeladen
  oder ausgeführt; konkrete q8-Dateien/Revision noch in B prüfen.

Die weitergehenden Produktbehauptungen über Jev, Von, poorjev, LM Studio und Ollama-Logprobs
werden für diesen Bauplan nicht vorausgesetzt und wurden hier nicht vollständig neu auditiert.

## Codex-Findings

Adversariales Eigenreview des Ausgangsvorschlags gegen den Code. Die Gegenmaßnahmen stehen
bereits im Plan; `[OFFEN]` bezeichnet den noch ausstehenden Umsetzungs-/Messnachweis durch Claude,
nicht eine vorhandene fehlerhafte Implementierung des neuen Piloten.

### F01 — Skip verändert mehrere bestehende Verbraucher
Schwere: hoch
ADR-Stelle: `app/src/renderer/stores/emailStore.ts:616`, `app/src/renderer/stores/workflowStore.ts:595`
Status: [OFFEN]
Eine ausgelassene Analyse lässt Notizerstellung und ICS-/Antwort-Trigger ausfallen. Ein
erfundenes negatives `EmailAnalysis` verdeckt diesen Ausfall; gar kein Ergebnis bleibt im
automatischen Analyse-Backlog (`main/index.ts:11999`).
Vorschlag: Pakete A–C schreiben ausschließlich separate Messdaten. Produktiver Zustand später.

### F02 — Generische Klassifikation deckt persönliche Kriterien nicht ab
Schwere: hoch
ADR-Stelle: `app/src/main/index.ts:11989`, `app/src/shared/emailRelevance.ts:223`
Status: [OFFEN]
Harte Regeln liefern positive Hinweise, keine vollständige Definition unwichtiger Mails.
Die weichen Kriterien gehen heute an das LLM. Antwortarmut oder Newsletter-Kategorie beweisen
keine Irrelevanz für diesen Nutzer.
Vorschlag: Schutzregeln und konservative Behandlung unberücksichtigter Freitextkriterien (§2).

### F03 — Kurzer fehlerfreier Holdout rechtfertigt keine Sicherheitszusage
Schwere: hoch
ADR-Stelle: Plan §3; `app/src/renderer/stores/workflowStore.ts:607`
Status: [OFFEN]
Die Folgewirkung betrifft Antwort- und Handlungsbedarf; Gesamtgenauigkeit ist das falsche Ziel.
Bei 200–500 Mails bleiben im Holdout oft nur wenige wichtige Fälle. LLM-Labels, doppelte
Threads oder nachträgliches Schwellentuning machen einen scheinbar guten Test zusätzlich wertlos.
Vorschlag: menschliche Labels, gruppierte Splits, klassenspezifische Grenzen und neues Holdout
nach jeder Anpassung anhand eines bisherigen Holdout-Fehlers (§3).

### F04 — NLI-Score und parallele API suggerieren mehr, als die Runtime liefert
Schwere: hoch
ADR-Stelle: installierte `@huggingface/transformers/src/pipelines/zero-shot-classification.js:101`
Status: [OFFEN]
Die Pipeline läuft pro Hypothese, kürzt automatisch und verwirft bei Multi-Label die Neutral-
Logits. Ein hoher Score kann fehlenden Kontext verdecken; vier Fragen sind nicht kostenlos.
Vorschlag: explizite dreiwertige NLI-Ausgabe, Abdeckungsprüfung, eigene Kalibrierung,
komplette Mailkosten messen. Kein Skip bei abgeschnittenem Text (§2–3).

### F05 — Shadow kann gerade auf schwacher Hardware die Lage verschlechtern
Schwere: mittel
ADR-Stelle: `app/src/main/index.ts:12063`, `app/src/renderer/utils/voice/transformersWorker.ts:16`
Status: [OFFEN]
Der Bestand kennt bereits Schonmodus; ein zweites warmes Modell und unbeschränkte Queue
kosten RAM/CPU. Ein Worker allein garantiert keine ausreichende Isolation des Ressourcenbedarfs.
Vorschlag: verzögerte Messung, begrenzte Queue, Entladen und gepackte Hardware-Gegenprobe (§4–5).

### F06 — Mailanalyse ist heute nicht ausschließlich Ollama
Schwere: mittel
ADR-Stelle: `app/src/main/index.ts:11935`, `app/src/renderer/stores/emailStore.ts:478`
Status: [OFFEN]
Ein Pilot, der „zum Vergleich“ alle Mails zusätzlich generiert oder pauschal auf Ollama
zurückfällt, ändert Kosten und Anbieterentscheidung. Die harten Regeln kommen zudem heute
erst nach der Generierung, nicht als vorgeschaltete Sperre.
Vorschlag: ausschließlich beobachten; Fallback meint den bestehenden gewählten Pfad (§1, §3).

### F07 — Messhistorie kann zur zweiten sensiblen Maildatenbank werden
Schwere: mittel
ADR-Stelle: `app/src/shared/types.ts:1636`, `app/src/main/email/store.ts:505`
Status: [OFFEN]
Shadow-Felder in `emails.json` geraten in bestehende Merge-/Persistenzflüsse; freie Fehlertexte
und Betreffzeilen in Reports erzeugen zusätzliche Inhaltskopien. Verspätete Jobs können
Ergebnisse einem falschen Vault oder einer alten Regelversion zuordnen.
Vorschlag: eigener lokaler, gedeckelter Speicher ohne Inhaltsfelder; Generation und
Eingabe-/Konfigurationsidentität; echte Labeldaten separat (§4).

### F08 — Vorhandenes Whisper beweist keine gepackte Main-Inferenz
Schwere: mittel
ADR-Stelle: `app/electron.vite.config.ts:14`, `app/src/renderer/utils/voice/transformersWorker.ts:47`
Status: [OFFEN]
Browser-WASM, native Node-Runtime und Worker-Build haben unterschiedliche Asset-/Paketanforderungen.
Die bloße npm-Abhängigkeit ist kein Auslieferungsnachweis.
Vorschlag: eigenes Paket B mit echtem Offline-Lauf im gepackten Electron vor Integration (§5).

### F09 — Vorgerechnete Signale umgehen die aktuelle Instruktionssperre
Schwere: hoch
ADR-Stelle: `app/src/shared/decision/labels.ts:118`, `app/scripts/email-decision-eval.ts:190`, `app/src/shared/decision/emailPolicy.ts:191`
Status: [OFFEN]
Der JSONL-Parser prüft nur Kopffelder und Labels und castet danach das gesamte Objekt als
`LabelRecord`; `signals`, `decision`, `content` und `baseline` werden nicht strukturell geprüft.
`prepare()` übernimmt vorhandene `record.signals` unverändert und setzt
`softCriteriaPresent` aus der mit `--instruction` geladenen aktuellen Notiz nur dann, wenn
Signale neu aus `content` abgeleitet werden. Ein älterer Datensatz mit
`signals.softCriteriaPresent=false` kann deshalb trotz heute vorhandener Freitextkriterien
den Blocker `soft-criteria-uncovered` verlieren. Dasselbe gilt für veraltete Anhang-, Thread-,
Termin- und harte Signale. Die minimale `invalidInput()`-Prüfung erkennt diesen semantischen
Stale-State nicht. Mit NLI-Artefakt kann so eine Mail in der Messung `skip` erreichen, obwohl
der Plan sie nach `review` schicken muss; kaputte verschachtelte Objekte können die CLI zudem
außerhalb der Validierungsphase werfen lassen.
Vorschlag: Verschachtelte Strukturen zur Laufzeit vollständig validieren. Bei vorhandenem
`content` Signale für die Auswertung stets mit der aktuellen Signallogik und Instruktionsnotiz
neu berechnen; importierte Signale nur mit Signale-Version, Instruktionshash und geprüfter
Identität akzeptieren. `softCriteriaPresent` aus der aktuellen Notiz darf ein gespeicherter
Datensatz niemals auf `false` herabsetzen.

### F10 — Kalibrierung ist weder an Modell noch Hypothesensatz und Sprache gebunden
Schwere: hoch
ADR-Stelle: `app/src/shared/decision/emailPolicy.ts:74`, `app/src/shared/decision/calibration.ts:118`, `app/scripts/email-decision-eval.ts:266`
Status: [OFFEN]
`PolicyCalibration` kennt nur eine freie ID, eine Sprachliste, Temperaturen und Schwellen.
Modell-ID/-Revision, Quantisierung, Runtime, Hypothesensatz-, Signal- und Labelversion fehlen;
`applyCalibration()` wendet die Temperaturen ohne Vergleich mit `DecisionResult.artifacts`
an und überschreibt dessen Kalibrierungskennung. Die CLI mischt bei der Anpassung alle
Sprachen, setzt anschließend aber pauschal `languages: ['de', 'en']`. Dadurch gilt etwa eine
nur aus deutschen Fällen gewonnene Temperatur als englisch kalibriert. Zusätzlich wird als
Gruppenzahl die Zahl aller Kalibrierungsfälle an jede Frage gereicht, auch wenn Abstention oder
`unclear` deren tatsächlich nutzbare Fälle und Gruppen reduziert; `fittedOn.cases` wird danach
als Maximum der vier Frage-Fallzahlen gespeichert. Ein fremdes oder dünneres Artefakt kann so
formal gültig sein und `skip` ermöglichen.
Vorschlag: Kalibrierungsartefakt mit vollständigem Eingabe-/Modell-Fingerprint versehen und
vor Anwendung gegen jedes Ergebnis prüfen. Pro Sprache und Frage getrennt kalibrieren und
jeweils die tatsächlich verwendeten Fälle und Gruppen speichern; eine Sprache erst nach
eigener ausreichender Kalibrierung freigeben.

### F11 — Experimentelle Negativregel ist keine fail-closed Regel-Baseline
Schwere: mittel
ADR-Stelle: `app/src/shared/decision/emailPolicy.ts:290`, `app/scripts/email-decision-eval.ts:499`, `app/scripts/email-decision-eval.ts:617`
Status: [OFFEN]
Die Option verwandelt jedes `review` mit Newsletter-Marker in `skip` und übergeht damit neben
`model-not-run` und `calibration-missing` auch `body-missing`, `language-unsupported`,
`coverage-incomplete` und `soft-criteria-uncovered`. Codes in `notes` machen diese Route
nachvollziehbar, aber nicht zu einer sicheren Obergrenze einer realen Regel-Skip-Politik:
fehlende Daten und nicht abgedeckte persönliche Kriterien werden gerade als Negativbeleg
behandelt. Entgegen Kommentar und Bauplan („nur auf dem Kalibrierungssatz“) rechnet die CLI
diesen Arm standardmäßig auf `dev`, `cal` und `holdout`. Die Gegenprobe mit der mitgelieferten
Instruktionsnotiz erzeugte je einen Skip in `dev` und `holdout`, während derselbe Bericht am
Ende behauptet, vorhandene weiche Kriterien ließen jede Mail spätestens bei `review` enden.
Vorschlag: Entweder nur die fehlende Modellentscheidung übergehen und alle fachlichen/
technischen Blocker erhalten, oder den Arm ausdrücklich als unsicheren Stressarm benennen.
Den vereinbarten Umfang auf `cal` erzwingen und Grenztext sowie Metriken entsprechend trennen.

### F12 — `important=unclear` kann als sicher überspringbar gelten
Schwere: hoch
ADR-Stelle: `app/src/shared/decision/labels.ts:101`, `app/scripts/email-decision-eval.ts:247`, `app/src/shared/decision/metrics.ts:239`
Status: [OFFEN]
Die Widerspruchsprüfung verbietet `safeToSkip=yes` bei einem unklaren Risikolabel, bei
`important=unclear` aber nur das eindeutige `important=yes`. Ein solcher Fall wird für
`impersonalInfo` als positives Kalibrierungsziel verwendet, gilt in
`unsafeSkipCandidates` als sicher und erscheint nicht unter `missedImportant`, weil dort nur
`important=yes` zählt. Damit verschwindet genau die Unsicherheit, die laut Plan jeden Skip
blockieren soll, aus Kalibrierung und Fehlerbericht.
Vorschlag: `safeToSkip=yes` nur zulassen, wenn `important=no` und alle drei Risikolabel
explizit `no` sind. Für die Metrik zusätzlich unklare Wichtigkeit unter Skip-Kandidaten separat
ausweisen.

### F13 — Berichtspfade können weiterhin mailnahe Eingaben ausgeben
Schwere: mittel
ADR-Stelle: `app/src/shared/decision/labels.ts:127`, `app/src/shared/decision/labels.ts:228`, `app/scripts/email-decision-eval.ts:372`
Status: [OFFEN]
Der sichere JSON-Parse-Fehlerpfad zitiert die kaputte Zeile tatsächlich nicht. Die übrige
Validierung übernimmt aber jede nichtleere `id` (auch eine rohe Message-ID oder einen
Betreff), spiegelt beliebige Werte aus `schema` und Labels in `detail`, und die CLI schreibt
ID plus Detail in Konsole/Markdown; bei Zweitbewertungen erscheinen uneinige IDs ebenfalls
im Bericht (`email-decision-eval.ts:550`). `stripContent()` hilft hier nicht: Es wird außerhalb
seines Tests nirgends aufgerufen, löscht nur zwei bekannte Felder und bewahrt wegen des
Objekt-Spreads unbekannte Laufzeitfelder. Die Zusage, nur `content` und `rationale` könnten
Mailtext tragen, wird vom JSON-Parser nicht erzwungen.
Vorschlag: Aus untrusted JSON ein neues, strikt erlaubtes DTO aufbauen statt das Rohobjekt zu
casten; Kennungen als lokal erzeugte Pseudonyme validieren/haschen. Exportberichte sollen
keine Roh-IDs und keine frei aus Eingabewerten gebauten Details enthalten. Einen echten
`stripForReport`-Test mit unbekannten Feldern, Message-ID, Betreff und kaputten Werten ergänzen.

### F14 — Zeitlicher Nachtest existiert nur als unbenutzter Helfer
Schwere: mittel
ADR-Stelle: `app/src/shared/decision/split.ts:189`, `app/scripts/email-decision-eval.ts:117`, `app/scripts/email-decision-eval.ts:429`
Status: [OFFEN]
`temporalSubset()` ist implementiert und unit-getestet, wird aber von der CLI nicht aufgerufen;
es gibt weder einen Stichtagsparameter noch einen zeitlich getrennten Berichtsarm oder ein
Manifest dafür. Der einzige tatsächliche Auswertungspfad erzeugt den hashbasierten
60/20/20-Split. Damit ist die Aussage in der Claude-Antwort, der Helfer „decke den zeitlichen
Nachtest ab“, zu stark: Auf späteren Mails wird derzeit nichts geprüft.
Vorschlag: Einen expliziten, eingefrorenen `--temporal-cutoff`-/Nachtest-Pfad mit eigener
Fall-/Gruppenzahl und getrennten Metriken ergänzen oder den Punkt als noch offen ausweisen.

### F15 — Dokumentierter Referenzlauf passt nicht zum aktuellen Arbeitsbaum
Schwere: niedrig
ADR-Stelle: `docs/codex-collab/email-decision-pilot.md:566`, `app/src/shared/decision/split.ts:98`
Status: [OFFEN]
Die Claude-Antwort nennt für den ersten Fixture-Lauf Split `13/7/3` und Prüfsumme
`9074a2cf294a43ab`. Gegen den vorgelegten Arbeitsbaum reproduziert derselbe dokumentierte
Befehl `13/5/5` und `d45d5ce0dcdbbf24` (23 Fälle, 21 Gruppen); auch die dort genannte
Holdout-Fallzahl ist damit veraltet. Gerade weil Prüfsumme und Split eine stille Neuziehung
sichtbar machen sollen, darf der Abnahmebeleg nicht einen anderen Fixture-/Codezustand
beschreiben.
Vorschlag: Nach der Korrekturrunde alle dokumentierten Befehle auf dem endgültigen Stand neu
ausführen und ihre Werte samt unverändertem Basis-/Arbeitsbaumbezug aktualisieren.

### F16 — Endliche Scores außerhalb 0…1 können direkt zu `skip` führen
Schwere: hoch
ADR-Stelle: `app/src/shared/decision/emailPolicy.ts:251`, `app/src/shared/decision/labels.ts:118`
Status: [OFFEN]
`calibratedOf()` akzeptiert jede endliche Zahl. Drei Risiko-Scores von `-1` gelten daher als
sicheres Nein und ein `impersonalInfo`-Score von `2` als sichere Informationsklasse; mit einem
ansonsten gültigen Artefakt erreicht diese Eingabe deterministisch `skip`. Der vorhandene Test
deckt nur `NaN` ab. `applyCalibration()` erzeugt selbst Werte im Einheitsintervall, aber der
JSONL-Parser validiert importierte `decision`-Objekte nicht und die Policy ist als gemeinsame
Grenze für spätere Pakete öffentlich. Ein beschädigtes, veraltetes oder fremd erzeugtes
Ergebnis wird damit als besonders sicher statt als ungültig behandelt.
Vorschlag: Vor Stufe 4 sämtliche kalibrierten Werte strikt auf `0 <= p <= 1` prüfen und sonst
`review/invalid-input` liefern. Den vollständigen `DecisionResult` einschließlich Tripel,
Wahrscheinlichkeitssumme, Abdeckung und Artefaktfeldern an der Laufzeitgrenze validieren; Tests
mit negativen und übergroßen endlichen Werten ergänzen.

### F17 — Indexverlust ist real, aber nicht bei jedem Skip
Schwere: hoch
ADR-Stelle: `app/src/renderer/stores/emailStore.ts:616`, `app/src/main/index.ts:12472`, `app/src/shared/rag/vaultIndex.ts:205`, `app/src/main/rag/vaultRagManager.ts:445`
Status: [OFFEN]
Die Notizerstellung setzt eine vorhandene Analyse mit `relevanceScore >= relevanceThreshold`
voraus (`emailStore.ts:621-635`). Die Notiz wird als Markdown im konfigurierten
`inboxFolderName` erzeugt (`main/index.ts:12472-12504`, `12689-12696`). Dieser Ordner ist
nicht pauschal vom Index ausgeschlossen: `isIndexable` erlaubt `.md`, sofern weder versteckte,
fest ausgeschlossene noch konfigurierte Ordner betroffen sind (`vaultIndex.ts:198-224`); der
Watcher berücksichtigt die Datei nur bei aktiviertem Vault-Index (`vaultRagManager.ts:445-456`).
Ein fälschlich übersprungener *relevanter* Fall kann also eine spätere Antwortquelle kosten.
Ein korrekt übersprungener Fall, der heute unter der Relevanzschwelle bliebe, hätte dagegen
schon heute keine Notiz. Auch eine indexierte Notiz ist nicht in **jeder** Antwort enthalten:
die Abfrage wählt nur Treffer nach Filter, Mindestscore und Top-K (`vaultRetrieve.ts:140-153`).
Die pauschale Aussage „jeder Skip schadet dem Index“ ist daher ebenso unbelegt wie „Mailnotizen
sind ausgeschlossen“.
Vorschlag: Verlust gegen die tatsächlich entstehende Notiz und gegen spätere Quellenfragen
getrennt messen; Index-Opt-in, Ordnerausschlüsse und Relevanzschwelle protokollieren.

### F18 — Der Skip-Goldstandard deckt den Wert als Antwortquelle nicht ausdrücklich ab
Schwere: hoch
ADR-Stelle: `docs/codex-collab/email-decision-pilot.md:100`, `app/src/shared/decision/labels.ts:20`, `app/src/shared/decision/metrics.ts:233`
Status: [OFFEN]
Der Plan nennt „benötigte Information“ (`email-decision-pilot.md:102-106`), was zukünftige
Quellen *meinen könnte*, operationalisiert es aber nicht. Das implementierte Labelschema hat
nur `important`, `needsReply`, `hasActionOrDate`, `urgent`, `safeToSkip` (`labels.ts:20-32`);
der Routenbericht zählt Skips und verpasste wichtige Mails, aber keinen Verlust indexierbarer
Antwortquellen (`metrics.ts:193-215`, `233-275`). Der Notiz-Builder übernimmt Metadaten,
Zusammenfassung, extrahierte Infos und Aufgaben, nicht den Roh-Body
(`main/index.ts:12553-12693`). Deshalb
kann selbst „keine Aufgabe/kein Termin“ den Wert einer Mail für spätere Fragen nicht widerlegen.
Das ist eine Lücke im *Bewertungsauftrag*, nicht der Beweis, dass ein Klassifikator diese Mails
tatsächlich überspringen würde.
Vorschlag: `safeToSkip` explizit an den Verlust einer nützlichen Vault-Quelle binden und mit
repräsentativen späteren Fragen annotieren; unklare Quellenwerte als nicht skipbar behandeln.

### F19 — Nebenbei laufende Mailanalyse ist nicht kostenlos für den Vault
Schwere: mittel
ADR-Stelle: `app/src/main/index.ts:11931`, `app/src/main/rag/ollamaActivity.ts:89`, `app/src/main/rag/vaultIndexer.ts:266`
Status: [OFFEN]
`email-analyze` ist über die *gesamte* Handlerlaufzeit als Ollama-Vordergrund registriert
(`main/index.ts:11931`, `ollamaActivity.ts:80-95`). Der Indexer wartet vor jedem Embedding
auf Leerlauf und bricht bei Beginn einer Vordergrundaktivität laufende Embeddings ab
(`vaultIndexer.ts:266-305`, `371-373`). Das gilt wegen der äußeren Hülle sogar beim optionalen
Cloud-Pfad (`main/index.ts:11935-11944`): Dann pausiert ein laufender Indexer, nicht aber lokale
Ollama-Inferenz durch die Mail selbst. Bei lokaler Analyse können Mail und Vault-Frage dieselbe
Ollama-Ressource beanspruchen; der Aktivitätszähler priorisiert nur den Indexer und
serialisiert diese beiden Vordergrundaufrufe nicht (`ollamaActivity.ts:2-8`,
`main/index.ts:7835-7850`). Die These „Mailzeit fällt nicht ins Gewicht“ übergeht damit
Indexfrische und mögliche Antwortlatenz. Daraus folgt aber noch kein Nutzen eines
*Skip*-Modells: Lastverschiebung/Leerlaufplanung könnte die Inhalte vollständig erhalten.
Vorschlag: Überlappung von Mailanalyse, Vault-Frage und Indexer samt p50/p95 und Indexverzug
messen; Scheduling gegen Gate als eigene Alternativen vergleichen.

### F20 — Das Antwortmodell ist der plausible Hebel, aber der Profilvergleich ist kein Qualitätsbeleg
Schwere: mittel
ADR-Stelle: `app/scripts/vault-answer-profile.ts:59`, `app/scripts/vault-answer-profile.ts:228`, `app/src/main/index.ts:7920`
Status: [OFFEN]
Das Profil verwendet ohne Argumente nur zwei fest eingetragene Fragen
(`vault-answer-profile.ts:58-64`). Es misst Retrieval und Ollama-Laufzeiten
(`vault-answer-profile.ts:199-265`) und prüft die Modellverdrängung erneut per Embedding
(`vault-answer-profile.ts:268-282`); es bewertet weder Antworten noch Zitate. Der Produktpfad
prüft diese dagegen nach der Generierung (`main/index.ts:7920-7933`). Die genannten 98,5 %,
21-38 gegen 3-5 Sekunden und 1,66 Sekunden sind deshalb eine nützliche lokale Beobachtung,
aber aus dem Skript allein kein verallgemeinerbarer p50/p95- oder Qualitätsvergleich.
Insbesondere ist „4b statt 27b“ ohne Qualitätstest für Quellenrichtigkeit, Auslassungen und
Zitierverhalten keine Freigabe. Der Befund stützt eine **separate** Vault-Latenzuntersuchung,
nicht den Weiterbau dieses Mail-Gates.
Vorschlag: gleiche repräsentative Fragen und Indexstände für beide Modelle, Warm-/Kaltläufe,
Zeit bis zum ersten Zeichen und vollständige Antwort sowie blind geprüfte Belegqualität.

### F21 — Umwidmung übernimmt Gerüst, nicht die eigentliche Messung
Schwere: mittel
ADR-Stelle: `app/src/shared/decision/labels.ts:50`, `app/src/shared/decision/emailPolicy.ts:284`, `app/src/shared/decision/metrics.ts:193`, `app/scripts/email-decision-eval.ts:319`
Status: [OFFEN]
Für „taugt die heutige Analyse?“ bleiben JSONL-Validierung, Gruppensplit und einige
statistische Helfer nützlich. Die eigentliche Semantik ist aber Skip-spezifisch: Labels und
Baseline erfassen weder extrahierte Aufgaben/Datumswerte/Infos noch deren Richtigkeit
(`labels.ts:20-32`, `50-96`); Policy und Bericht messen `skip | review | full-analysis`
(`emailPolicy.ts:284-325`, `metrics.ts:193-215`); `impersonalInfo` wird auf `safeToSkip`
kalibriert (`email-decision-eval.ts:319-329`). Das ist kein günstiges Umbenennen der CLI.
Auch die vorgeschlagenen mechanisch übernommenen Baseline-Erzeugnisse wären kein Goldstandard:
ein *übersehener* Termin fehlt gerade in der Ausgabe, eine *erfundene* Aufgabe steht darin.
Die Vollanalyse ist laut Plan Vergleichsarm, nicht Wahrheit (`email-decision-pilot.md:100-106`).
Vorschlag: C nur als neues, ausdrücklich beauftragtes Qualitätsaudit mit mailbezogenen
Soll-Ergebnissen und Fundstellen konzipieren; vorhandene Infrastruktur selektiv wiederverwenden.

### F22 — Einfrieren ist nicht gleich unversioniert liegenlassen
Schwere: mittel
ADR-Stelle: `docs/codex-collab/email-decision-pilot.md:190`, `app/package.json:26`, `app/src/shared/decision/labels.ts:50`
Status: [OFFEN]
Der aktuelle `git status --short` zeigt `app/src/shared/decision/`, die Evaluationsskripte,
Fixtures und diese Aufgabendatei als `??`, nur `app/package.json` als `M`. Damit ist Paket A
lokal nutzbar, aber weder durch `56a74e8d` noch durch ein späteres Checkout reproduzierbar.
Ein „eingefrorenes Messwerkzeug“ ohne gesicherte, zusammengehörige Version von Schema,
Fixtures, CLI und Dokumentation ist ein irreführender Zustand. Das ist kein Auftrag an den
Prüfer, etwas zu committen; auch das Profilskript ist noch unversioniert.
Vorschlag: Bei Wahl A explizit entscheiden, ob Claude Paket A nach Nutzerfreigabe als
zusammengehörigen Stand versioniert/archiviert oder bewusst verwirft. Bis dahin nicht als
dauerhaft vorhandenes Werkzeug ausgeben.

### Empfehlung zur Fortsetzung

**A — EINFRIEREN.** Paket B und C nicht bauen und insbesondere keinen produktiven Skip
vorsehen. Ausschlaggebend ist nicht, dass der Vorfilter *bewiesen* die falsche Optimierung
wäre: Seine Last- und Indexer-Wirkung ist noch ungemessen (F19). Ausschlaggebend ist, dass
sein Risiko den vom Nutzer hervorgehobenen Notiz-/Index-Nutzen treffen kann (F17/F18), während
der bisher belegte interaktive Wartezeithebel beim Vault-Antwortmodell liegt (F20). Paket A
ist höchstens ein lokales Forschungsartefakt; sein Versions-/Archivierungsstatus muss bewusst
entschieden werden (F22). **C** wäre eine sinnvolle spätere *neue* Qualitätsfrage, aber keine
billige Fortsetzung dieses Instruments (F21). Als nächstes, getrennt vom Mail-Piloten,
Vault-Antwortqualität und -latenz der Modellvarianten an denselben Fragen messen und die
Mail-/Indexer-Überlappung erfassen. Diese Empfehlung autorisiert weder Codeänderungen noch
Commit oder Push.

## Claude-Antwort

### Paket A — umgesetzt, 22.09.2026, Basis `56a74e8d`

Kein bestehender Anwendungscode wurde verändert. Alles Neue ist rein (kein `fs`, kein Netz,
kein Electron) bis auf die CLI, die genau zwei Dateien liest und höchstens zwei schreibt.
Es gibt keinen Aufrufer im Produktivpfad: `email-analyze` ist unberührt, `src/main/` und
`src/renderer/` enthalten keinen Import aus `shared/decision/`.

**Neue Dateien**

| Datei | Zeilen | Inhalt |
|---|---|---|
| `app/src/shared/decision/types.ts` | 232 | Vertrag: vier feste Fragen, Hypothesen DE/EN, `DecisionInput`, `DecisionResult` (`ok`/`abstain`), Abstain-Codes, Abdeckung, Artefaktversionen, `DecisionEngine`, Routen |
| `app/src/shared/decision/emailPolicy.ts` | 374 | die fünfstufige Routing-Policy, `PolicySignals`, `PolicyCalibration` + `isValidCalibration`, Regel-Baseline, experimentelle Negativregel |
| `app/src/shared/decision/signals.ts` | 204 | deterministische Signale: harte Signale (wiederverwendet), Handlungs-/Terminmarker, Datumserkennung, Newsletter-Merkmal, Spracherkennung |
| `app/src/shared/decision/labels.ts` | 591 | JSONL-Labelschema, strenge Prüfung, Widerspruchsregel, `stripContent`, Gold-Prädikate |
| `app/src/shared/decision/split.ts` | 208 | gruppierter Split mit Seed, Manifest + Prüfsumme, Gruppenschlüssel-Ableitung, zeitlicher Nachtest |
| `app/src/shared/decision/metrics.ts` | 293 | Nullfehler-Schranke, Wilson, Brier/ECE mit Bins, Cohens Kappa, `routeReport` |
| `app/src/shared/decision/calibration.ts` | 181 | Softmax über drei Klassen, Temperature Scaling, Randlagen-Warnung, `applyCalibration` |
| `app/scripts/email-decision-eval.ts` | 930 | CLI: prüfen, splitten, Arme rechnen, Bericht (Markdown + JSON) |
| `app/scripts/email-decision-fixtures.jsonl` | 23 Fälle | synthetische Mails, alle `.example`-Adressen |
| `app/scripts/email-decision-fixtures-synthetic-nli.jsonl` | 23 Fälle | dieselben Fälle mit **erfundenen** NLI-Werten (`modelId: SYNTHETIC-not-a-real-model`) |
| `app/scripts/email-decision-instruction.example.md` | — | Beispiel-Instruktionsnotiz für `--instruction` |
| Tests | 162 | sechs `*.test.ts` neben den Modulen, `scripts/email-decision-fixtures.test.ts` und `scripts/email-decision-eval.test.ts` |

Geändert: `app/package.json` (eine Zeile, Skript `email:decision-eval`).

### Tatsächlicher Vertrag (Abweichungen zum Plan markiert)

**Fragen und Hypothesen** liegen versioniert in `types.ts` (`HYPOTHESIS_SET_VERSION`),
in DE und EN, formuliert aus Empfängersicht. `RISK_QUESTIONS` sind `needsReply`,
`hasActionOrDate`, `urgent`; `impersonalInfo` ist die positive Begründung der Skip-Klasse,
kein Risiko.

**Ergebnis**: `status: 'ok' | 'abstain'`; bei `ok` je Frage `logits` und `probs` als
Dreiertupel (Entailment/Neutral/Contradiction, Neutral wird nie verworfen) plus optional
`calibrated`. Dazu `coverage` (`complete`, Tokens, Bodyzeichen gesamt/verwendet), `pairs`,
`tokens`, `durationMs`, `artifacts`. Abstain-Codes sind eine feste Union; freie Fehlertexte
sind im Typ nicht vorgesehen.

**Policy** (`evaluateRoutingPolicy`) in der geforderten Reihenfolge, jede Stufe im Test
belegt: 1 ausdrückliche Analyse → 2 positive Schutzsignale → 3 Blocker (`invalid-input`,
`body-missing`, `model-not-run`, `technical-abstain`, `coverage-incomplete`,
`soft-criteria-uncovered`, `language-unsupported`, `calibration-missing`,
`calibration-language-mismatch`, `calibration-scores-missing`) → 4 Modell sieht Risiko →
5 kalibriertes Nein plus sichere Informationsklasse. Ohne gültiges Kalibrierungsartefakt
oder mit auch nur einem fehlenden kalibrierten Wert gibt es kein `skip`
(`emailPolicy.test.ts`, „ohne Kalibrierungsartefakt gibt es kein skip",
„fehlt auch nur ein kalibrierter Wert").

**Drei Präzisierungen, die der Plan offenließ:**

1. *Schwellen-Semantik.* `>= riskPositive` heißt Ja (Stufe 4), `<= riskNegative` heißt
   sicheres Nein (Stufe 5), alles dazwischen ist `review`. `isValidCalibration` lehnt
   `riskNegative > riskPositive` ab — sonst wäre derselbe Wert gleichzeitig Ja und
   sicheres Nein. Grenzwerte sind getestet.
2. *Kalibrierungsziel von `impersonalInfo`.* Es gibt kein Goldlabel „Newsletter". Die
   Frage wird gegen `safeToSkip` kalibriert, also gegen die Größe, für die sie im Gate
   gebraucht wird. Gefragt wird das Modell nach „unpersönliche Information", bewertet wird
   an „gefahrlos überspringbar" — das steht so im Bericht.
3. *`unclear` wird ausgelassen, nicht als Nein gezählt.* Sonst wanderte jede Unsicherheit
   des Labelnden als Negativbeleg in die Kalibrierung.

**Ein Befund am eigenen Code während der Umsetzung:** die Schutzstufe griff bei kaputter
Eingabe (`hardSignalKinds` fehlt) nicht, sondern warf — im Schattenbetrieb hätte das den
beobachteten Pfad mitgerissen. `positiveProtectionCodes` ist jetzt defensiv, der
Strukturfehler fällt zusätzlich in Stufe 3 als `invalid-input` an. Test:
„kaputte Zahlen in den Signalen".

**Eine Ergänzung gegenüber dem Plan:** `fitTemperature` meldet, wenn das Optimum am Rand
des Suchbereichs liegt (`atBound`). Genau das passiert auf den synthetischen Daten: perfekt
trennbare Fälle treiben die Temperatur gegen 0. Ohne diese Meldung sähe ein unbrauchbares
Artefakt wie ein gelungenes aus. Die CLI schreibt den Hinweis in den Berichtstext.

### Tests und Läufe

```
cd app
npm run typecheck                 # sauber
npx vitest run src/shared/decision scripts/email-decision-eval.test.ts \
    scripts/email-decision-fixtures.test.ts
#   8 Dateien, 162 Tests, alle grün
npm run test                      # 2450 grün, 1 rot (siehe unten), 1 übersprungen
```

Der eine rote Test ist `src/main/noteAgent/shellExecution.test.ts > Umgebungsprobe >
„nennt Interpreter mit Pfad…" (5010 ms Zeitüberschreitung). **Er ist vorbestehend und
lastabhängig, nicht durch diese Arbeit verursacht:** isoliert läuft er grün (15 grün,
1 übersprungen), in der vollständigen Suite fällt er auch auf dem unveränderten Stand
(`git stash` → `npx vitest run` → 1 rot). Zwei Wiederholungen mit den neuen Dateien
ergaben denselben einen Fehlschlag; nach der Korrekturrunde unverändert.

CLI-Läufe (alle ohne Modell, ohne Netz, ohne Zugriff auf Maildaten):

```
npm run email:decision-eval -- --dataset scripts/email-decision-fixtures.jsonl
npm run email:decision-eval -- --dataset scripts/email-decision-fixtures.jsonl \
    --instruction scripts/email-decision-instruction.example.md --experimental-negative-rule
npm run email:decision-eval -- --dataset scripts/email-decision-fixtures-synthetic-nli.jsonl \
    --seed s3 --subset cal --risk-positive 0.6 --risk-negative 0.15 \
    --impersonal-positive 0.6 --sweep
npm run email:decision-eval -- --dataset <kaputt>.jsonl --validate     # Exit 1
npm run email:decision-eval -- --dataset … --out /tmp/emails.json      # Exit 1, Schreibsperre
npm run email:decision-eval                                            # Formatbeschreibung
```

Ergebnis des ersten Laufs, ohne Instruktionsnotiz, über alle 23 synthetischen Fälle
(Zahlen nach der Korrekturrunde neu erhoben, siehe F15): 21 Gruppen, Split 13/5/5,
Prüfsumme `d45d5ce0dcdbbf24`; Arm „nur Regeln" → `skip` 0,
Vollanalyse 14, `review` 9. **Es gibt in Paket A keinen einzigen Skip-Kandidaten**, weil
es kein Modell und kein Artefakt gibt — das ist der erwartete, nicht der enttäuschende
Stand. Die Zahlen daraus sind ein Funktionstest, keine Aussage über einen Posteingang;
der Bericht sagt das an drei Stellen selbst (100 % synthetisch, Holdout-Fallzahl,
Nullfehler-Schranke von 52,7 % bei vier wichtigen Holdout-Fällen in drei Gruppen — auf
Gruppen gerechnet 63,2 %).

Mit erfundenen NLI-Werten und ausdrücklich gesetzten Schwellen läuft der volle Pfad
(Temperatur je Frage → `applyCalibration` → Stufe 4/5 → Brier/ECE, Schwellen-Übersicht)
ebenfalls durch. Jede daraus entstehende Zahl ist eine Selbstbestätigung; der Dateikopf der
Fixtures sagt das, und der Test „kennzeichnen die erfundenen NLI-Werte als solche" hält es fest.

### Was Paket A ausdrücklich NICHT liefert

- Keine Messung: keine Laufzeit, kein Speicher, keine Energie, keine echte Mail.
- Keine Schwellenempfehlung. Ohne `--risk-positive/--risk-negative/--impersonal-positive`
  entsteht kein Artefakt; die CLI sagt dann „eine Skip-Schwelle wird hier nicht erfunden".
- Keine Abdeckung der weichen Freitextkriterien. Sobald eine Instruktionsnotiz welche
  enthält, endet jede Mail spätestens bei `review`. Der Bericht weist aus, wie viele Fälle
  allein daran hängen.
- Keine Bedienoberfläche zum Labeln. Es gibt das Format, den Parser, die Prüfung und
  `--validate`; ein Ablauf zum Lesen/Labeln/Neu-Laden ist noch offen (siehe unten).
- Keine Aufnahme in `CLAUDE.md`. Dort steht, was das Produkt kann; der Pilot steht in
  diesem Dokument, bis er abgenommen ist.

### Antworten auf F01–F08

**F01 — Skip verändert mehrere bestehende Verbraucher.** `[ADRESSIERT]` für Paket A.
Es gibt keinen Schreibpfad: kein Import aus `shared/decision/` in `main/` oder `renderer/`,
kein `EmailAnalysis` wird erzeugt, `emails.json` wird nicht angefasst. `skip` existiert nur
als Wert in einem Messbericht. Die CLI verweigert zusätzlich Schreibziele mit Namen
`emails.json`/`contacts.json` und jedes Ziel unterhalb von `.mindgraph`.

**F02 — Generische Klassifikation deckt persönliche Kriterien nicht ab.** `[ADRESSIERT]`
als harte Sperre, nicht als Hinweis: `soft-criteria-uncovered` ist ein Blocker der Stufe 3,
und `softCriteriaCovered` ist optional mit Standard „nicht abgedeckt". Nur ein Test setzt
es auf `true`, um zu zeigen, dass allein dieser Schalter den Weg zu `skip` öffnet.
Die positiven Schutzregeln (harte Signale, Anhang, Thread, Handlungs-/Terminmarker) laufen
vor jeder Modellaussage.

**F03 — Kurzer fehlerfreier Holdout rechtfertigt keine Sicherheitszusage.** `[ADRESSIERT]`.
Gemessen wird pro Risikoklasse, nie als Gesamtgenauigkeit. Jede Fehlerrate trägt Fallzahl,
Gruppenzahl und obere 95-%-Grenze; bei null Fehlern die exakte Schranke `1 − 0.05^(1/n)`,
zusätzlich konservativ auf Gruppen gerechnet. Der Bericht schließt mit der Fallzahl der
wichtigen Holdout-Fälle und dem Satz, dass „unter 1 %" 299 solche Fälle braucht. Der Split
ist gruppiert, seedbasiert und trägt eine Prüfsumme — eine stille Neuziehung fällt auf.
`temporalSubset` deckt den zeitlichen Nachtest ab. **Offen bleibt** die im Plan geforderte
Regel „neues Holdout nach jeder Anpassung": technisch vorbereitet (Seed + Prüfsumme im
Manifest), aber niemand erzwingt sie — das ist Disziplin, kein Code.

**F04 — NLI-Score und parallele API suggerieren mehr, als die Runtime liefert.**
`[ADRESSIERT]` im Vertrag, **offen im Nachweis**: `QuestionScores` transportiert alle drei
Klassen, `pairs`/`tokens` machen die Kosten aller vier Fragen sichtbar, `coverage.complete`
schickt abgeschnittenen Text nach `review`, und die Kalibrierung ist ein eigener,
getrennter Schritt mit Randlagen-Warnung. Ob die installierte Pipeline diese Werte
überhaupt herausgibt, entscheidet sich in Paket B — der Vertrag schreibt
SequenceClassification mit explizit validiertem Label-Mapping vor, keine
Zero-Shot-Bequemlichkeit.

**F05 — Shadow kann auf schwacher Hardware die Lage verschlechtern.** `[OFFEN]`, Paket C.
Paket A berührt Laufzeitverhalten nicht.

**F06 — Mailanalyse ist heute nicht ausschließlich Ollama.** `[ADRESSIERT]`. Die CLI ruft
kein Modell auf, weder lokal noch in der Cloud. Die heutige Ausgabe geht als `baseline` in
den Datensatz, wird als Vergleichsarm ausgewiesen und ausdrücklich nicht als Wahrheit
verrechnet; fehlgeschlagene Läufe (`baseline.failed`) zählen mit statt zu verschwinden.

**F07 — Messhistorie kann zur zweiten sensiblen Maildatenbank werden.** `[ADRESSIERT]` für
Paket A. Labeldaten mit Inhalt liegen in einer JSONL-Datei außerhalb des Repos; nur
synthetische Fixtures sind eingecheckt, geprüft durch einen Test, der `.example`-Adressen
erzwingt. `content` und `rationale` sind die beiden Felder mit Mailtext, `stripContent`
entfernt genau diese. Der Parser zitiert bei kaputtem JSON den Zeileninhalt nicht (Test).
`DecisionResult` hat kein Feld für Betreff, Body oder Adresse. Die Ablage unter
`userData/email-decision/<vault-key>/` und die Generationslogik gehören zu Paket C.

**F08 — Vorhandenes Whisper beweist keine gepackte Main-Inferenz.** `[OFFEN]`, Paket B.

### Offene Punkte, die Paket B/C voraussetzen

1. Bedienablauf zum Labeln (Lesen, Labeln, erneut Laden). Format und Prüfung stehen,
   der Ablauf fehlt. Ohne ihn entstehen die 200–500 Labels nicht.
2. Der Gruppenschlüssel wird im Datensatz mitgeliefert; `deriveGroupKey` kann ihn erzeugen,
   aber nichts verhindert, dass jemand beim Export schlechte Schlüssel schreibt.
3. `SUPPORTED_HYPOTHESIS_LANGUAGES` ist `de`/`en`. Die Spracherkennung ist eine
   Stoppwort-Abzählung; sie sagt im Zweifel `null`, was `review` bedeutet. Für einen echten
   Datensatz ist das grob — es ist absichtlich in die sichere Richtung grob.

**Bitte besonders prüfen:** (a) die Stufenreihenfolge und ihre Grenzwerte, (b) ob die
experimentelle Negativregel zu Recht sämtliche Blocker übergehen darf (sie tut es, mit den
übergangenen Codes in `notes` — als ehrliche Obergrenze einer reinen Regel-Skip-Politik),
(c) das Kalibrierungsziel `impersonalInfo` → `safeToSkip`, (d) ob im Vertrag noch irgendwo
ein Feld steht, in das Mailinhalt geraten könnte.

---

### Korrekturrunde nach F09–F16 (22.09.2026)

Alle acht Befunde wurden vor der Umsetzung einzeln gegengeprüft. **Alle acht tragen,
keiner beruht auf einem falschen Beleg.** Drei davon widerlegen Zusagen, die oben in dieser
Antwort zu stark formuliert waren; das ist jeweils bei der Antwort vermerkt. Der Nutzer hat
die Umsetzung aller acht freigegeben.

Antwort (b) von oben ist damit überholt: die experimentelle Negativregel darf eben NICHT
sämtliche Blocker übergehen — siehe F11.

**F09 — Vorgerechnete Signale umgehen die Instruktionssperre.** `[ADRESSIERT]`
Gegenprobe vor der Änderung: mit gespeicherten `signals` schrieb derselbe Bericht im Kopf
„weiche Freitextkriterien: vorhanden (blockieren jedes skip)" und zeigte darunter keinen
einzigen `soft-criteria-uncovered`-Code. Der Bericht widersprach sich in derselben Ausgabe.
Umgesetzt:
* `prepare()` rechnet Signale **immer** neu, sobald `content` vorliegt — Inhalt schlägt
  Vorrechnung (`email-decision-eval.ts`, „rechnet Signale aus dem Inhalt IMMER neu").
* Nur-Zahlen-Fälle brauchen `signalsMeta` mit `signalsVersion` und `instructionHash`
  (`labels.ts:SignalsMeta`, `signalsUsability`). Passt eines nicht, fällt der Fall **mit
  benanntem Grund** aus der Auswertung; der Bericht zählt die Ausgelassenen je Grund.
* `softCriteriaPresent` wird nie herabgesetzt, auch nicht bei passendem Hash.
* `signals` ohne `signalsMeta` ist jetzt ein Lesefehler (`stale-signals`).

**F10 — Kalibrierung ist an nichts gebunden.** `[ADRESSIERT]`, mit einer Verschärfung über
den Vorschlag hinaus.
* `PolicyCalibration.fingerprint` trägt Modell-ID, Revision, Quantisierung, Runtime,
  Hypothesensatz, Signal- und Labelversion. `isValidCalibration` verlangt alle sieben.
* `calibrationMismatch()` vergleicht das Artefakt feldweise mit `DecisionResult.artifacts`;
  `applyCalibration()` wendet ein fremdes Artefakt **gar nicht** an, statt es still
  anzuwenden. Das Ergebnis bleibt unkalibriert, die Policy landet auf
  `calibration-scores-missing`, und die Auswertung nennt den echten Grund.
* **Sprachgetrennt statt sprachbehauptet:** `temperature` ist jetzt
  `Record<Sprache, Record<Frage, number>>`. Eine Sprache ohne eigene Temperatur steht nicht
  in `languages`. Die CLI leitet die Liste aus den Daten ab, statt `['de','en']` zu setzen.
* Mindestumfang je Sprache und Frage (`--min-language-cases`, Standard 20 Fälle in
  8 Gruppen). Das ist keine Skip-Schwelle, sondern die Grenze, unter der eine Temperatur
  offensichtlich nichts misst; eine Absenkung steht sichtbar im Bericht.
* `fittedOn` zählt je Sprache und Frage die TATSÄCHLICH nutzbaren Fälle und Gruppen;
  `cases`/`groups` sind das **Minimum** darüber — ein Artefakt ist so belastbar wie seine
  schwächste Frage, nicht wie seine stärkste.
* Gemischte Modellstände im Kalibrierungsteil werden abgelehnt (`fingerprintOf`).

Wirkung auf die Fixtures: auf vier erfundenen Fällen entsteht jetzt korrekt **kein**
Artefakt mehr. Der Weg bis `skip` ist stattdessen in `email-decision-eval.test.ts` gegen
im Test erzeugte Daten geprüft — dort auch die Ablehnung eines fremden Modellartefakts.

**F11 — Experimentelle Negativregel ist keine fail-closed Baseline.** `[ADRESSIERT]`
Beide Teile bestätigt: sie übergab sachliche Blocker, und die CLI rechnete sie entgegen
Kommentar und Plan auf allen drei Teilmengen (Gegenprobe: je ein Skip in `dev` und
`holdout`). Umgesetzt: `MODEL_ONLY_BLOCKERS` — die Regel darf **nur** `model-not-run` und
`calibration-missing` übergehen. `body-missing`, `language-unsupported`,
`coverage-incomplete` und `soft-criteria-uncovered` bleiben stehen; fehlende Daten sind
kein Negativbeleg. Der Arm läuft nur noch auf `cal` und heißt im Bericht so. Der
widersprüchliche Schlusssatz ist präzisiert („in der Policy und in allen hier gerechneten
Armen"). Neuer Lauf mit Instruktionsnotiz: 0 Skips in allen Teilmengen.

**F12 — `important=unclear` konnte als sicher überspringbar gelten.** `[ADRESSIERT]`
Gegenprobe: ein solcher Datensatz lief mit null Fehlern durch. `labelContradictions` prüft
jetzt alle vier Felder einschließlich `important` gegen `yes` UND `unclear`. Damit ist die
Zusage oben („Unklare Fälle blockieren Skip") erst jetzt wahr — sie war es vorher nur für
die drei Risikofelder.

**F13 — Berichtspfade konnten mailnahe Eingaben ausgeben.** `[ADRESSIERT]`
Gegenprobe: eine Kennung `Betreff: Gehaltsabrechnung Mai <chef@firma.example>` stand
wörtlich im geschriebenen Bericht. Umgesetzt:
* `LABEL_ID_PATTERN` (`^[A-Za-z0-9._:-]{1,64}$`) — Message-IDs und Betreffzeilen als
  Kennung werden abgelehnt, mit Begründung im Fehlertext.
* Fehlertexte nennen nur noch **Feldnamen**, nie Werte (Test „zitiert in Fehlertexten
  keine Werte aus der Datei").
* `baseline.replyUrgency` übernimmt nur `low|medium|high` — es ist eine Modellausgabe und
  damit beliebiger Text.
* `stripContent` → `stripForReport`: Allowlist statt Kopie mit `delete`, `group` durch
  seinen Hash ersetzt, Personenfelder raus. Test mit einem unbekannten Laufzeitfeld.

**F14 — Zeitlicher Nachtest existierte nur als Helfer.** `[ADRESSIERT]`
Die Formulierung oben war zu stark. Jetzt gibt es `--temporal-cutoff <ISO>`: eigener
Abschnitt mit eigener Fall- und Gruppenzahl, eigenen Armen, und dem ausdrücklichen Hinweis,
dass diese Fälle mit den Teilmengen **überlappen**. Zusätzlich meldet der Bericht, wie
viele Gruppen des Nachtests auch vor dem Stichtag vorkommen — für die misst er
Wiedererkennung, nicht Übertragbarkeit. Ohne die Option steht in den Grenzen, dass nichts
über spätere Mails bekannt ist.

**F15 — Dokumentierter Referenzlauf passte nicht zum Arbeitsbaum.** `[ADRESSIERT]`
Ursache: Ich habe die Beispieldomain nach jenem Lauf auf `.example` umbenannt, was die
Gruppenschlüssel und damit den Split ändert. Ausgerechnet die Prüfsumme, die stille
Neuziehungen sichtbar machen soll, hat den eigenen veralteten Beleg entlarvt. Alle Zahlen
oben sind gegen den Endstand neu erhoben.

**F16 — Endliche Scores außerhalb 0…1 führten direkt zu `skip`.** `[ADRESSIERT]`
Gegenprobe vor der Änderung: drei Risikowerte `-1` und `impersonalInfo: 2` erreichten
deterministisch `skip`. Die Policy prüft jetzt `0 <= p <= 1` und liefert sonst
`review` mit `invalid-input`; die Ränder 0 und 1 bleiben gültig (drei Tests). Zusätzlich
prüft der Importweg ein `decision`-Objekt vollständig: Dreiertupel, endliche Logits,
Wahrscheinlichkeiten im Einheitsintervall mit Summe 1, Abdeckung, Artefaktfelder,
bekannte Abstain-Gründe. Die Zusage „fail-closed" oben stimmt damit erst jetzt.

### Stand nach der Korrekturrunde

```
cd app
npm run typecheck                 # sauber
npx vitest run src/shared/decision scripts/email-decision-eval.test.ts \
    scripts/email-decision-fixtures.test.ts     # 8 Dateien, 162 Tests, grün
npm run test                      # 2450 grün, 1 rot (vorbestehend), 1 übersprungen
```

Neu hinzugekommen: `app/scripts/email-decision-eval.test.ts` (276 Zeilen, 12 Tests). Die
CLI-Funktionen sind dafür exportiert, und der Einstieg läuft unter `VITEST` nicht an — sonst
startete bei jedem Import der ganze Auswertungslauf.

---

### Abschluss: Paket A eingefroren (23.09.2026)

Der Nutzer hat nach den Befunden F17–F22 entschieden: **Paket A wird eingefroren, B und C
werden nicht gebaut.** Ein produktives Überspringen ist damit endgültig kein offener Punkt
dieses Auftrags mehr, sondern eine verworfene Richtung.

Auslöser waren drei Einwände des Nutzers, keine technische Schwäche von Paket A:

1. Aus Mails entstehen Aufgaben, Termine und Notizen — ein Klassifikator erzeugt nichts davon.
2. Diese Notizen werden im Vault indexiert und machen ihn zum zweiten Gedächtnis.
3. Mails laufen nebenbei; die gefühlte Wartezeit sitzt bei Fragen an den Vault.

#### Antworten auf F17–F22

**F17 — Indexverlust ist real, aber nicht bei jedem Skip.** `[ADRESSIERT]` — und meine
Aussage war zu stark. Nachgemessen am echten Vault: der Mail-Ordner (Standard
`‼️📧 - emails`) ist NICHT ausgeschlossen — nicht versteckt, kein Vorlagenordner, nicht in
der Ausschlussliste (`shared/rag/vaultIndex.ts:204`). Er enthielt 713 Notizen, auf die der
Index 2 353 Verweise führt — rund 16 % von 14 507 Chunks. Mail-Notizen sind also ein
erheblicher Teil des Vault-Gedächtnisses.

Aber: die Notiz entsteht erst ab `relevanceScore >= relevanceThreshold`
(`emailStore.ts:621`), und die Schwelle stand auf 74. Ein RICHTIG übersprungener Fall hätte
heute schon keine Notiz. Nur ein FÄLSCHLICH übersprungener relevanter Fall kostet eine
Antwortquelle. Mein Satz „jeder Skip kostet eine Indexquelle" war falsch; Codex hat genauer
hingesehen.

Ein Nebenbefund, der in beide Richtungen schneidet: rund 85 der 713 Notizen sehen nach
Dateinamen nach Werbung, Newslettern oder automatischen Benachrichtigungen aus. Der Index
trägt also auch Ballast — genau den, den ein Vorfilter erwischt hätte.

**F18 — Der Skip-Goldstandard deckt den Wert als Antwortquelle nicht ab.** `[ADRESSIERT]`,
nicht behoben. Das Labelschema kennt `important`, `needsReply`, `hasActionOrDate`, `urgent`,
`safeToSkip` — aber keine Frage nach „fehlt diese Mail später als Quelle". Der Routenbericht
zählt entsprechend keinen Quellenverlust. Wäre der Pilot fortgesetzt worden, hätte
`safeToSkip` daran gebunden werden müssen. Da er eingefroren wird, bleibt es eine
dokumentierte Lücke des Bewertungsauftrags, keine Codeänderung.

**F19 — Nebenbei laufende Mailanalyse ist nicht kostenlos für den Vault.** `[ADRESSIERT]`
und im Code bestätigt: `email-analyze` ist über die gesamte Handlerlaufzeit als Vordergrund
registriert (`main/index.ts:11931`); der Indexer wartet vor jedem Embedding auf Leerlauf
(`vaultIndexer.ts:267`) und bricht laufende Embeddings ab, sobald Vordergrund beginnt
(`vaultIndexer.ts:369`). Das gilt auch im Cloud-Pfad — eine Mail-Analyse über OpenRouter
blockiert den lokalen Vault-Indexer, obwohl sie kein lokales Ollama braucht. Der dritte
Einwand des Nutzers stimmt damit nicht ganz: Mails kosten ihn keine Wartezeit, aber
Indexfrische.

**Das ist ein eigener, kleiner Befund und gehört nicht zu diesem Piloten.** Er steht hier,
damit er nicht mit ihm verschwindet: die Vordergrund-Hülle müsste den Cloud-Pfad ausnehmen,
oder feiner greifen als „ganzer Handler".

**F20 — Der Profilvergleich ist kein Qualitätsbeleg.** `[ADRESSIERT]`, zugestimmt. Das
Profilskript misst Zeit, nicht Güte. Der Qualitätsvergleich der Modellvarianten wurde
begonnen und ging mit dem Sitzungsende verloren; er gehört ohnehin zur getrennten
Vault-Latenzfrage, nicht hierher. Die Zahlen (98,5 % Antwortmodell, ~100 gegen ~845 Token/s
Prompt-Verarbeitung, 21–38 s gegen 3–5 s warm, 1,66 s Neuladen von `bge-m3` nach Verdrängung
durch das 27B-Modell) sind eine lokale Beobachtung an einem Rechner, kein p50/p95.

**F21 — Umwidmung übernimmt Gerüst, nicht die eigentliche Messung.** `[ADRESSIERT]`, und
die Option ist damit vom Tisch. Besonders trifft die Kritik meinen eigenen Vorschlag,
Labels teilweise mechanisch aus den Erzeugnissen der Analyse abzuleiten: **ein übersehener
Termin fehlt gerade in der Ausgabe, eine erfundene Aufgabe steht darin.** Wer so labelt,
misst die Analyse an sich selbst. Der Vorschlag ist zurückgezogen. Ein Qualitätsaudit der
heutigen Mailanalyse bleibt eine sinnvolle, aber NEUE Frage mit eigenem Goldstandard.

**F22 — Einfrieren ist nicht gleich unversioniert liegenlassen.** `[ADRESSIERT]`. Der
Nutzer hat entschieden, Paket A als zusammenhängenden Stand zu versionieren: Schema, Policy,
Signale, Split, Kennzahlen, Kalibrierung, CLI, Fixtures, Tests, das Profilskript und diese
Aufgabendatei. Kein Push.

#### Was bleibt und was nicht

Es bleibt ein geprüftes, reines Messwerkzeug ohne Verbraucher: `shared/decision/` wird von
`main/` und `renderer/` nicht importiert, `email-analyze` ist unverändert, `emails.json`
wird nicht angefasst. 162 Tests, Typecheck sauber.

Es entsteht NICHT: lokale NLI-Inferenz (Paket B), Schattenbetrieb (Paket C), ein produktives
Gate (§6). Wer den Piloten wieder aufnimmt, muss zuerst F18 beantworten — den Wert einer
Mail als spätere Antwortquelle — und die Lastfrage aus F19 messen, statt sie zu behaupten.

Zwei Fäden laufen getrennt weiter, beide unabhängig von diesem Piloten: die Antwortlatenz
und -qualität des Vault-Chats (Modellwahl, Kontextlänge), und die Vordergrund-Hülle aus F19.

**Was weiterhin offen ist:** F05 und F08 (Paket C bzw. B). F04 bleibt im Nachweis offen:
ob die installierte Runtime die drei NLI-Klassen überhaupt herausgibt, entscheidet Paket B.
Der Bedienablauf zum Labeln fehlt weiter. Die Sprach-Mindestzahlen (20 Fälle / 8 Gruppen)
sind gesetzt, nicht gemessen — sie verhindern offensichtlichen Unsinn und behaupten keine
Güte.

## Status

- [x] Ausgangsvorschlag gegen relevanten Anwendungscode geprüft.
- [x] Bauplan mit Gegenmaßnahmen eigenständig adversarial geprüft und eingegrenzt.
- [x] Paket A konkret zur Umsetzung durch Claude beschrieben.
- [x] Claude: Paket A umgesetzt (22.09.2026) — liegt zur Codex-Nachprüfung vor.
- [x] Codex: Paket A geprüft, acht Befunde F09–F16.
- [x] Claude: alle acht gegengeprüft (alle tragen) und nach Freigabe des Nutzers umgesetzt.
- [x] Codex: Richtungsprüfung mit den Einwänden des Nutzers, Befunde F17–F22, Empfehlung A.
- [x] Claude: F17–F22 gegengeprüft und beantwortet; zwei eigene Aussagen als zu stark korrigiert.
- [x] **Nutzerentscheidung 23.09.2026: Paket A eingefroren, B und C werden nicht gebaut.**
- [ ] ~~Lokale Datensammlung und Messungen mit manuellen Labels~~ — entfällt mit der Einfrierung.
- [ ] ~~Produktives Gate~~ — verworfene Richtung, kein offener Punkt mehr.
- [ ] Getrennte Fäden: Vault-Antwortlatenz/-qualität · Vordergrund-Hülle aus F19.

**Übergabeprompt:** „Lies CLAUDE.md, docs/codex-collab/README.md und
docs/codex-collab/email-decision-pilot.md. Setze Paket A dieses Plans um. Dokumentiere
Implementierung und Tests unter Claude-Antwort und lege den Stand Codex zur Nachprüfung vor.
Keine produktive Skip-Funktion, keine realen Maildaten im Repo, kein Commit/Push.“
