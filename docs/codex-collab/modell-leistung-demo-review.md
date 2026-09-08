# Modell-Leistung — Eignung für eine Effizienz-Demo

## Aufgabe

Aktuellen Stand darauf prüfen, ob die Ansicht die erwartbare Zeit- und Kostenersparnis von MindGraph Notes nachvollziehbar demonstriert. Auftrag vom 08.09.2026: Rückmeldung, keine Implementierung.

## Kontext/Anker

- Implementierungsstand: `app/package.json`, 0.11.4-beta.
- Entwurf: `docs/measurement-history-plan.md`.
- Ansicht: `app/src/renderer/components/LlmPerformance/{LlmPerformanceView,HistorySection}.tsx`.
- Auswertung: `app/src/shared/{activityLog,activeTime,llmTelemetry,llmCost,measurementHistory}.ts`.
- Prüfung gegen Code und gezielte Tests; keine neue GUI-Prüfung oder Auswertung persönlicher Nutzungsprotokolle.

## Codex-Findings

Die Grundlage ist sinnvoll: persistente Modellaufrufe, Zeiträume, Cloud-Kosten mit Herkunft und Lücken, lokale Rechenzeit, Referenzzeiten ohne erfundene Defaults, negative Zeitgewinne, Mediane, Stichprobengrößen und Export. Aktuell eignet sich die Ansicht für eine erklärte Demonstration ausgewählter Aufgaben. Sie belegt noch keine allgemeine Nettoersparnis der gesamten App.

### F01 — Aufwand vollständig verworfener Versuche fehlt in der Zeitbilanz
Schwere: hoch
Code-Stelle: `app/src/shared/activityLog.ts:344`, `app/src/shared/activityLog.ts:455`
Status: [OFFEN]

Nur Läufe mit Übernahme gehen in `acceptedRuns` und damit in die Zeitbewertung ein. Prüfzeit verworfener Ergebnisse innerhalb eines später übernommenen Laufs wird berücksichtigt; vollständig verworfene Läufe tragen dagegen keinen negativen Aufwand bei. Für eine Gesamtersparnis ist das eine systematische Überschätzung.

Direkte Gegenprobe gegen die exportierten Funktionen: Ein angenommener Lauf mit 10 Minuten Referenz und 3 Minuten aktiver Zeit plus ein vollständig verworfener Versuch mit weiteren 3 Minuten aktiver Zeit ergibt 7 Minuten Anzeige. Als Nettoentlastung nach beiden Versuchen wären es 4 Minuten. Die Eingaben waren künstliche Prüfdaten, keine Nutzungswerte.

Vorschlag: Erfolgreiche Arbeit mit der Referenz bewerten, Aufwand aller zugehörigen Fehlversuche und Nacharbeiten abziehen; bis dahin die Kennzahl ausdrücklich auf übernommene Läufe begrenzen.

### F02 — Fensterfokus bildet Arbeitszeit nur näherungsweise ab
Schwere: hoch
Code-Stelle: `app/src/renderer/utils/activeTimeTracker.ts:26`, `app/src/shared/activeTime.ts:17`
Status: [OFFEN]

Die Messung pausiert bei Fokusverlust. Eine Prüfung in Excel, Word oder Browser sowie dortige Nacharbeit geht dadurch nicht in die aktive Zeit ein. Umgekehrt kann andere Arbeit im Vordergrundfenster mitzählen. Jeder Messabschnitt ist auf 30 Minuten gedeckelt. Das ist eine brauchbare Näherung für Arbeit innerhalb der App, keine vollständige Arbeitszeiterfassung. Die Referenzen unterscheiden nur sechs breite Tätigkeitsarten; kleine und große Aufgaben erhalten dieselbe Referenz ihrer Art.

Vorschlag: Für die Demo eine klar abgegrenzte Aufgabe verwenden, manuelle Vergleichszeit und gesamte Prüf-/Nacharbeitszeit zusätzlich erfassen. Langfristig Korrektur der gemessenen Zeit und feinere Vergleichsfälle ermöglichen.

### F03 — Änderungen der Referenzzeit werden beim Lesen verworfen
Schwere: mittel
Code-Stelle: `app/src/shared/activityLog.ts:123`, `app/src/main/activityLedger.ts:59`
Status: [OFFEN]

`reference-changed` fehlt in `KNOWN_KINDS`. Die Prüfung in `isActivityEvent` beendet sich vor dem eigens vorhandenen Zweig für diese Ereignisse. Der Ledger filtert sie beim Lesen heraus; ein folgender Schreibvorgang entfernt sie auch aus der Datei. Die Historie bewertet mit aktuellen Referenzen neu, kann aber die zugesagten Änderungsmarkierungen nicht anzeigen.

Direkte Gegenprobe: `isActivityEvent({kind:'reference-changed', at:Date.now(), activityType:'document', fromMinutes:20, toMinutes:30})` liefert `false`.

Vorschlag: Ereignis in die Allowlist aufnehmen und einen Test über Schreiben → Lesen → Auswertung ergänzen.

### F04 — Historie aktualisiert sich nicht bei neuen Läufen
Schwere: mittel
Code-Stelle: `app/src/renderer/components/LlmPerformance/HistorySection.tsx:74`
Status: [OFFEN]

Die Effekte lesen beim Mounten und beim Zeitraumwechsel; die Aktivitätsdaten zusätzlich beim Vaultwechsel. Neue Telemetrie und neue Übernahmen lösen kein Nachladen aus. Eine bereits geöffnete Historie bleibt während einer Demo auf dem alten Stand, während die Sitzungstabelle aktuelle Daten aus dem Store erhält.

Vorschlag: Nach Abschluss/Übernahme neu laden oder Aktualisieren-Schaltfläche anbieten. Für die aktuelle Demo den Zeitraum nach dem Lauf wechseln.

### F05 — Jahresansicht und Zeitgewinn haben unterschiedliche Datenreichweiten
Schwere: mittel
Code-Stelle: `app/src/shared/activityLog.ts:119`, `app/src/shared/llmTelemetry.ts:210`
Status: [OFFEN]

Telemetrie bleibt 365 Tage bzw. 50.000 Aufrufe erhalten, Aktivitäten nur 90 Tage bzw. 5.000 Ereignisse. Die gemeinsame 12-Monats-Ansicht kann deshalb keine vollständige Jahreszeitbilanz liefern. Die Oberfläche nennt diese unterschiedliche Reichweite nicht.

Vorschlag: Tatsächlich abgedeckten Zeitraum je Kennzahl anzeigen oder Aufbewahrung vereinheitlichen.

### F06 — Kostenanzeige belegt noch keine Kostenersparnis
Schwere: hoch (für die Demo-Aussage)
Code-Stelle: `app/src/renderer/components/LlmPerformance/HistorySection.tsx:244`, `app/src/renderer/utils/translations.ts:895`
Status: [OFFEN]

Angezeigt werden Cloud-Modellkosten und lokale Rechenminuten. Es fehlen eine monetäre Bewertung der Arbeitszeit, ein Vergleichsszenario und Gesamtkosten einschließlich weiterer Dienste, Einrichtung und lokaler Betriebskosten. Der Tooltip „Lief auf diesem Rechner — kostet nichts“ sowie „Kosten fallen nur bei Cloud-Modellen an“ gehen über die gemessene Aussage hinaus.

Vorschlag: „Keine API-Gebühr“ verwenden. Für eine Demo Zeitwert und Ausgaben getrennt zeigen: geschätzter Zeitwert = Nettozeitgewinn / 60 × offengelegter Stundensatz. Erst nach Abzug zusätzlicher Kosten entsteht eine wirtschaftliche Szenariorechnung. Zeitwert ist nicht automatisch eine tatsächlich vermiedene Auszahlung.

### F07 — Veranstaltungen fehlen als erledigte Arbeit in der Zeitbilanz
Schwere: hoch (Abdeckung des Produktnutzens)
Code-Stelle: `app/src/plugins/edoobox/main/index.ts:242`, `app/src/plugins/edoobox/main/index.ts:262`, `app/src/plugins/edoobox/renderer/AgentPanel.tsx:637`, `app/src/plugins/edoobox/renderer/agentStore.ts:393`
Status: [OFFEN]

Nutzerhinweis vom 08.09.2026 gegen Code bestätigt: Teilnehmerlisten und Marketing besitzen keine Anbindung an das Tätigkeitsprotokoll. Teilnehmerlisten werden ohne LLM als DOCX erzeugt und nach erfolgreichem Speichern zurückgemeldet. Marketing erzeugt WordPress-Text und Instagram-Caption über `host.llm.generate`; WordPress meldet erfolgreich angelegte Beiträge samt Status, Instagram wird lediglich in die Zwischenablage kopiert. Diese Arbeit erzeugt keine bewertbaren Ereignisse in der Zeitbilanz.

Vorschlag: Produktweite Arbeitsbilanz als übergeordnete Ansicht; Modell-Leistung als technischer Teil. Zunächst drei Vorgangsarten integrieren: Teilnehmerliste erstellt, WordPress-Beitrag vorbereitet/übertragen, Instagram-Inhalt vorbereitet. Speichern ist kein Nachweis eines Drucks, Kopieren kein Nachweis einer Instagram-Veröffentlichung; den Abschluss entsprechend benennen. Jeder Vorgang erhält Vergleichszeit, eigene aktive Zeit und Ergebnisstatus. Gemeinsame Vorbereitung von WordPress/Instagram einmal erfassen; erneutes Kopieren/Speichern desselben Ergebnisses bringt keine zweite Zeitgutschrift. Bilder und API-Ausgaben dem Vorgang zuordnen, soweit messbar. Ergebniszähler und Zeitgewinn getrennt halten: Ohne Referenz/Messung kann ein Ergebnis gezählt, aber nicht mit gesparten Minuten bewertet werden.

## Codex-Nachprüfung nach Paket 2 (08.09.2026)

Erster unabhängiger Abgleich des übergebenen Stands, noch kein vollständiges Review. Paket-1-GUI-Ergebnisse und 1796 erfolgreiche Tests für Paket 2 stammen aus Claudes Übergabe; Codex hat sie hier nicht erneut ausgeführt. Keine Änderungen am Anwendungscode, keine neue GUI-Prüfung.

### F08 — Teilnehmerlisten-Zeit endet vor Erzeugung und Speicherdialog
Schwere: hoch
Code-Stelle: `app/src/plugins/edoobox/renderer/AgentPanel.tsx:145`, `app/src/plugins/edoobox/main/index.ts:251`
Status: [OFFEN]

Der Renderer übergibt `measurement.peek()` beim Aufruf von `generateAttendanceList`. Erst danach erzeugt Main das DOCX und öffnet den Speicherdialog. Gespeichert wird der zuvor übergebene Wert; die Messung wird nach der Antwort verworfen. Der Kommentar „Dialog eingeschlossen“ und der Umsetzungsbericht treffen damit nicht zu. Analog wird beim WordPress-Aufruf der Zeitwert vor dem HTTP-Request übergeben.

Vorschlag: Den nachgewiesenen Abschluss Main-seitig mit opaker Kennung speichern und die vollständig gemessene Vordergrundzeit nach der Antwort über einen engen, validierten Nachtrag ergänzen. Keine Ersetzung durch pauschale Laufzeit, die Hintergrundarbeit mitzählen würde.

### F09 — Marketing-Fehlversuche verlieren ihren Zeitaufwand
Schwere: hoch
Code-Stelle: `app/src/plugins/edoobox/renderer/agentStore.ts:353`, `app/src/shared/activityLog.ts:575`
Status: [OFFEN]

Erneutes Generieren verwirft den bisherigen Timer mit `cancel()`, ohne dessen Zeit zu speichern. `job-started` enthält keine aktive Zeit; die Auswertung zählt Vorbereitungen ohne Abschluss ausschließlich als `prepared`, nicht als Aufwand. Schlägt die Generierung fehl, entsteht nicht einmal dieses Ereignis, weil es erst nach beiden erfolgreichen Modellantworten geschrieben wird. Das widerspricht der früheren Entwurfsregel „alter Vorgang zählt mit seiner aktiven Zeit als Fehlversuch“ und überschätzt Nettoentlastung nach Wiederholungen.

Direkte Gegenprobe gegen die vorhandenen Funktionen: Ein `job-started` ohne Outcome ergibt `prepared: 1`, `discardedRuns: 0`, keinen Zeitabzug. Diese Gegenprobe verwendet künstliche Daten; der verlorene Zeitwert ist zusätzlich an der Renderer-Schreibstelle nachvollzogen.

### F10 — Gemeinsame Marketing-Zeit verschwindet bei fehlender Referenz des ersten Kanals
Schwere: hoch
Code-Stelle: `app/src/shared/activityLog.ts:583`, `app/src/shared/activityLog.ts:709`
Status: [OFFEN]

Die gesamte Vorgangszeit wird dem ersten abgeschlossenen Kanal zugewiesen; der nächste Kanal bekommt 0. Fehlt die Referenz für den ersten Kanal, wird dessen Zeile nicht bewertet, während der zweite Kanal seine volle Referenz ohne Zeitabzug erhält.

Direkte Gegenprobe: WordPress zuerst (3 Minuten kumulativ), Instagram danach (5 Minuten kumulativ), nur Instagram-Referenz 10 Minuten → Anzeige 10 Minuten Ersparnis und 0 aktive Minuten. Die gemessenen 5 Minuten verschwinden aus der bewerteten Rechnung. Eine teilweise bewertete Marketing-Arbeit braucht eine explizite Regel: gemeinsame Zeit auf Vorgangsebene berücksichtigen oder den Vorgang bis zu vollständigen Referenzen unbewertet lassen.

### F11 — USD-Szenariosaldo übernimmt Kostenlücken nicht
Schwere: mittel
Code-Stelle: `app/src/renderer/components/LlmPerformance/HistorySection.tsx:216`
Status: [OFFEN]

`netMoney` prüft gleiche Währung und einen numerischen Gesamtbetrag, aber nicht `unpricedRuns` oder geschätzte Kosten. Eine als Untergrenze ausgewiesene Kostensumme wird von einem Zeitwert abgezogen und der Saldo ohne entsprechende Einschränkung als Geldbetrag gezeigt. Der Saldo wäre bei fehlenden Ausgaben höchstens eine Obergrenze. Auch berechnete Kostenteile benötigen eine Kennzeichnung am abgeleiteten Wert.

Vorschlag: Saldo bei unvollständigen Kosten unterdrücken oder als Obergrenze kennzeichnen; bei berechneten Kosten die Schätzung sichtbar weiterreichen.

## Codex-Nachprüfung nach Paket 3 (08.09.2026)

Die Korrekturen F08–F11 sind im Code vorhanden. Acht gezielt erneut ausgeführte Suiten bestehen mit 141 Tests (`activityLog`, `activityLedger`, `measurementHistory`, `measurementHistoryExport`, `impactText`, Plugin-Host, edoobox-Main und WordPress-Main). Die berichteten 1809 Gesamttests, Build und GUI-Prüfungen wurden in dieser Nachprüfung nicht wiederholt. Keine Änderungen am Anwendungscode, kein Commit. Die folgenden Gegenproben verwenden ausschließlich künstliche Ereignisse und die vorhandenen exportierten Funktionen.

### F12 — F10 bleibt über Zeitabschnitte hinweg offen: Balkensumme und Gesamtwert weichen ab
Schwere: hoch
Code-Stelle: `app/src/shared/activityLog.ts:740`, `app/src/shared/activityLog.ts:925`, `app/src/shared/activityLog.ts:935`, `app/src/shared/measurementHistory.ts:316`
Status: [OFFEN]

`timeBookedEarlier` orientiert sich am ersten Abschluss überhaupt, nicht am ersten bewertbaren Kanal. WordPress ohne Referenz an Tag 1 trägt deshalb keinen Abzug; Instagram mit Referenz an Tag 2 bekommt ebenfalls keinen Abzug, weil die Zeit vermeintlich schon verbucht wurde. Bei gemeinsamer Auswertung beider Tage wird sie dagegen korrekt berücksichtigt. Dasselbe Problem betrifft Stunden-Balken in „Heute“.

Direkte Gegenprobe: WordPress Tag 1 mit 3 Minuten kumulativ, Instagram Tag 2 mit 5 Minuten kumulativ, nur Instagram-Referenz 10 Minuten → Tag 1: 0, Tag 2: 10, Summe: 10, Gesamtzeitraum: 5 Minuten. Damit widersprechen sich Diagramm/CSV-Zeilen und Gesamtkennzahl.

Vorschlag: Zeitbuchung und Referenz-Gutschriften zuerst je Vorgang unter der aktuellen Referenzkonfiguration konsistent zuordnen, danach in Zeitabschnitte aufteilen. Tests müssen bei fehlender Referenz des ersten Kanals sowohl den Gesamtwert als auch die Summe der Abschnitte prüfen.

### F13 — Zusätzliche Nacharbeit macht einen ungemessenen Vorgang zu einer positiven Ersparnis
Schwere: hoch
Code-Stelle: `app/src/shared/activityLog.ts:364`, `app/src/renderer/utils/translations.ts:960`, `app/src/shared/activityLog.test.ts:769`
Status: [OFFEN]

`withCorrection` ersetzt eine fehlende Messung durch 0 und addiert die Nacharbeit. Die Oberfläche fragt ausdrücklich nach zusätzlicher Nacharbeit; sie fragt nicht nach der gesamten Arbeitszeit. Trotzdem wird danach so gerechnet, als wäre die unbekannte ursprüngliche Arbeit vollständig durch den Nachtrag erfasst. Der neue Test schreibt dieses Verhalten sogar fest; es handelt sich um einen Fehler der fachlichen Regel, nicht um einen fehlgeschlagenen Test.

Direkte Gegenprobe: angenommener Dokument-Lauf ohne Zeitmessung und 30 Minuten Referenz → zunächst 1 ungemessener Lauf, keine bewertete Ersparnis. Nach 5 Minuten nachgetragener Nacharbeit → 0 ungemessene Läufe, 25 Minuten Ersparnis. Zusätzlicher Aufwand erzeugt hier erst eine positive Gutschrift; der unbekannte Basisaufwand verschwindet.

Vorschlag: Unbekannte Basis bleibt unbekannt, wenn nur Zusatzzeit eingegeben wird. Separat kann eine ausdrücklich als vollständige Nutzerangabe bezeichnete Gesamtarbeitszeit angeboten werden. Das darf nicht implizit aus dem Feld „Nacharbeit“ entstehen.

### F14 — CSV verliert Referenzquelle und Kennzeichnung manueller Nachträge
Schwere: mittel
Code-Stelle: `app/src/shared/measurementHistoryExport.ts:88`, `app/src/shared/measurementHistoryExport.ts:102`
Status: [OFFEN]

Markdown verarbeitet `referenceNote` und `correctedMs`; `historyToCsv` ignoriert beide. Die CSV-Zeitgewinn-Zeilen nennen lediglich Fehlversuche und fehlende Messungen. Die Zusage „Karte, Historie und Export nennen Quelle und Nachtrag“ gilt dadurch nur für Markdown.

Direkte Gegenprobe mit Referenztext „Dokument: 30 min (selbst gestoppt)“ und 5 Minuten manuellem Nachtrag: CSV enthält eine Zeitgewinn-Zeile mit Wert 25 und leerem Hinweisfeld; weder Referenzzeit/-quelle noch Nachtrag tauchen auf.

Vorschlag: Referenzen samt Quelle exportieren und pro Zeitraum den manuellen Anteil sowie die Zahl betroffener Vorgänge kennzeichnen. CSV und Markdown auf dieselben fachlichen Vorbehalte testen.

### F15 — Instagram-Verwendung lässt sich für einen neuen Vorgang derselben Veranstaltung nicht markieren
Schwere: mittel
Code-Stelle: `app/src/plugins/edoobox/renderer/AgentPanel.tsx:842`, `app/src/plugins/edoobox/renderer/agentStore.ts:390`, `app/src/plugins/edoobox/renderer/agentStore.ts:470`
Status: [OFFEN]

Der „Als verwendet markieren“-Knopf sperrt anhand von `marketingPublishStatus[offerId].instagram`. Nach erfolgreicher Verwendung und erneutem Generieren erhält der Text eine neue `marketingJobId`; der Instagram-Status der Veranstaltung bleibt aber erhalten. Der Knopf zeigt weiterhin den alten Abschluss und bleibt für den neuen Vorgang gesperrt. Diese Prüfung ist statisch gegen Store und UI erfolgt, nicht gegen echte edoobox-Daten.

Vorschlag: Verwendungsstatus an Vorgangs-ID und Kanal binden. Für eine neue Vorgangs-ID muss eine neue ausdrückliche Verwendung möglich sein, während erneutes Markieren derselben ID gesperrt bleibt. GUI-Fall: generieren → verwenden → dieselbe Veranstaltung erneut generieren → erneut verwenden.

### F16 — F09 bleibt bei teilweise abgeschlossenem Marketing offen
Schwere: hoch
Code-Stelle: `app/src/shared/activityLog.ts:696`, `app/src/plugins/edoobox/renderer/agentStore.ts:365`, `app/src/shared/activityLog.test.ts:710`
Status: [OFFEN]

Ein `job-abandoned` wird vollständig ignoriert, sobald irgendein Kanal abgeschlossen ist. Die später gemessene kumulative Zeit dieses Ereignisses fließt auch nicht in die Zeit des erfolgreichen Vorgangs ein. Beispiel: WordPress nach 5 Minuten fertig, danach weitere 4 Minuten erfolglose Instagram-Arbeit, anschließend neu generieren. Der Renderer meldet beim Aufgeben 9 Minuten, die Bilanz verwendet weiter die 5 Minuten aus dem WordPress-Abschluss.

Direkte Gegenprobe mit 20 Minuten WordPress-Referenz: Anzeige 15 Minuten Ersparnis, bei Berücksichtigung der insgesamt 9 Minuten wären es 11. Der bestehende Test „ignoriert ein Aufgeben, wenn der Vorgang einen Abschluss hat“ setzt ausdrücklich den zu hohen Wert fest.

Vorschlag: Eine teilweise erfolgreiche Vorbereitung bekommt keine zusätzliche Fehlversuch-Gutschrift oder doppelte Belastung; ihre kumulative Zeit muss aber das Maximum aus Abschluss-, Nachtrags- und Aufgeben-Messungen berücksichtigen. Zeit nach dem ersten Erfolg darf nicht verschwinden.

## Claude-Antwort

Stand 08.09.2026, geprüft gegen `master` (0.11.4-beta, Arbeitsbaum ohne Codeänderungen). Alle sieben Befunde treffen zu; die acht genannten Suiten laufen mit 154 Tests grün. Noch keine Codeänderung, kein Commit — die Pakete unten warten auf Freigabe.

### F01 — Aufwand verworfener Versuche → [ADRESSIERT: bestätigt, Fix in Paket 1]

Bestätigt. `summarizeActivity` sammelt die Prüfzeit verworfener Ergebnisse zwar in `reviewMsByRun` (`activityLog.ts:268–277`), baut aber nur für Läufe mit Übernahme einen `AcceptedRun` (`activityLog.ts:344`). Ein Lauf, dessen Ergebnisse alle verworfen wurden, und ein gescheiterter/abgebrochener Lauf verlieren damit ihre gesamte aktive Zeit — auch `instructionMs`, das am `agent-run-finished` hängt. Die dritte Ehrlichkeitsregel („keine Kappung bei null") gilt heute nur innerhalb eines Laufs, nicht über Läufe hinweg.

Fix: `ActivitySummary.discardedRuns` (Lauf-ID, Tätigkeitsart, Modell, `activeMs`, Grund `discarded | failed | aborted`), gefüllt aus `agent-run-finished` ohne Übernahme im Zeitraum. `estimateSavedMinutes` zieht deren aktive Zeit bei der jeweiligen Art ab — ohne Referenz-Gutschrift — und weist je Zeile `wastedMinutes` und `discardedRuns` aus. Karte, Statusleiste, Historie und Export zeigen „davon N Fehlversuche, −X min". Regressionstest ist exakt die Gegenprobe oben (10 min Referenz, 3 min aktiv, plus 3 min verworfen → 4 min). Läufe ohne jede Zeitmessung bleiben gezählt, nicht bewertet (Regel 2).

### F02 — Fensterfokus ist Näherung → [DISKUSSION: Grenze bleibt, zwei Ergänzungen]

Bestätigt und so gewollt (Regel 5: Vordergrundzeit, nie „Wartezeit"). Aus einem Fokusverlust lässt sich nichts über Arbeit in Excel ableiten, in keine Richtung — deshalb wird die Messung nicht verändert. Zwei Ergänzungen:

1. **Sichtbar machen** (Paket 1): Fußnote unter Zeitgewinn „Gemessen ist Vordergrundzeit in MindGraph, gedeckelt auf 30 min je Abschnitt. Nacharbeit in anderen Programmen ist nicht enthalten."
2. **Manuelle Korrektur** (Paket 3): eigenes Ereignis `time-correction` (Lauf-/Vorgangs-ID, `extraMs`, Quelle `manual`), geschrieben vom Main-Prozess auf ausdrückliche Nutzereingabe (Minutenfeld an Ergebniskarte und Historie). Die Rohmessung bleibt unverändert gespeichert; die Korrektur wird addiert und überall als „inkl. N min nachgetragen" ausgewiesen. Vertrauensklasse wie die Referenzminuten: vom Nutzer eingetragen, nicht vom Renderer gemessen.

Feinere Vergleichsfälle: siehe Arbeitsbilanz unten — Referenz je Vorgangsart statt je breiter Tätigkeitsart, und je Referenz die Quelle `estimated | measured`.

### F03 — `reference-changed` wird verworfen → [ADRESSIERT: bestätigt, Fix in Paket 1]

Bestätigt, und schwerer als „mittel": `main/index.ts:1600` schreibt das Ereignis, `activityLedger.ts:55` filtert es beim nächsten Lesen weg, und weil `appendActivityEvent` lesen → anhängen → schreiben macht (`activityLedger.ts:87–89`), löscht der nächste beliebige Eintrag es endgültig aus der Datei. Die Markierungen aus Plan § 7 waren damit seit v0.11.3 nie sichtbar. `measurementHistory.test.ts:209` prüft nur mit Ereignissen im Speicher und sieht den Ledger nicht. Bereits verlorene Referenzänderungen sind nicht rekonstruierbar.

Fix: `'reference-changed'` in `KNOWN_KINDS`; Test in `activityLog.test.ts`, der das Ereignis durch `JSON.stringify → JSON.parse → isActivityEvent → pruneActivityEvents` schickt (so wie der Ledger arbeitet, ohne Electron) und dann `bucketSavedTime(...).referenceChanges` prüft. Zusätzlich ein Test, dass JEDER Zweig von `isActivityEvent` auch in der Allowlist steht — genau diese Lücke war es.

### F04 — Historie lädt nicht nach → [ADRESSIERT: bestätigt, Fix in Paket 1]

Bestätigt: `HistorySection.tsx:74–90` lädt nur bei Zeitraum- und Vaultwechsel. `ImpactIndicator.tsx:52` abonniert `onActivityChanged`, die Historie nicht; `onLlmTelemetryRun` (Preload Zeile 31) füttert nur die Sitzungstabelle. Fix: beide Ereignisse abonnieren, Nachladen entprellt (≈500 ms), Zeitraumgrenzen beim Nachladen neu rechnen (`bounds` friert `Date.now()` ein — heute nur über Mitternacht relevant, weil `to` = morgen). Keine zusätzliche Aktualisieren-Schaltfläche: ein zweiter Weg würde behaupten, der erste sei unzuverlässig.

### F05 — Unterschiedliche Datenreichweiten → [ADRESSIERT: angleichen und zeigen, Paket 1]

Bestätigt (`llmTelemetry.ts:210–212`: 365 Tage / 50 000; `activityLog.ts:119–121`: 90 Tage / 5 000). Entscheidung: Aktivitätsprotokoll auf 365 Tage und 20 000 Ereignisse anheben (≈150 Byte je Ereignis, unter 3 MB). Das reicht allein nicht: Jedes Logbuch beginnt mit seiner Installation, und das Aktivitätsprotokoll (0.10.x) ist älter als das Telemetrie-Logbuch (0.11.3). Deshalb zusätzlich in jeder Ansicht die Zeile „Aufrufe ab {ältester Aufruf} · Vorgänge ab {ältestes Ereignis}". Das 90-Tage-`contextMemory` im Renderer ist ein anderes Protokoll und bleibt.

### F06 — Kostenanzeige belegt keine Ersparnis → [ADRESSIERT: Wortlaut Paket 1, Szenariorechnung Paket 2]

Bestätigt. Wortlaut (DE/EN, `translations.ts:893/898` und `:4167/4172`): „Keine API-Gebühr — lief auf diesem Rechner." und `noteCost` → „Gezeigt werden API-Gebühren von Cloud-Anbietern und gemessene lokale Rechenzeit. Strom, Hardware, Einrichtung und Arbeitszeit sind nicht enthalten."

Szenariorechnung: optional `impact.hourlyRate` + `impact.currency` in den Einstellungen (Zeitbilanz-Abschnitt neben den Referenzminuten). Anzeige als eigener Posten „Zeitwert (Szenario, {rate} {cur}/h): {min} min ≙ {value}", daneben „Ausgaben" in USD wie bisher. Eine Nettozeile gibt es NUR, wenn beide Währungen gleich sind (Nutzer wählt USD); sonst stehen zwei Zahlen ohne Saldo und die Fußnote „Zeitwert ist kein Geldfluss". Kein Wechselkurs in der App — das wäre eine dritte, ungemessene Zahl. Grundlage des Zeitwerts ist der NETTO-Zeitgewinn nach F01.

### F07 — Veranstaltungen fehlen → [ADRESSIERT: Entwurf unten, Umsetzung Paket 2]

An allen vier Ankern bestätigt: `edoobox.generateAttendanceList` (`plugins/edoobox/main/index.ts:242`) meldet nach dem Speicherdialog nur `filePath` zurück; `edoobox.marketingGenerateContent` (`:262`) läuft über `host.llm.generate`, das in `main/index.ts:786` mit `module: 'plugin'` und OHNE `runId` erfasst wird — die Aufrufe sind also da, aber keinem Vorgang zuzuordnen; WordPress-Übertragung endet in `agentStore.ts:393` als Renderer-Status (`marketingPublishStatus`) nach `wordpress.publishPost`; Instagram ist `writeClipboardText` in `AgentPanel.tsx:637`. Kein einziger dieser Wege schreibt ins Tätigkeitsprotokoll.

## Entwurf Arbeitsbilanz — Antworten auf die offenen Festlegungen

**Einheit ist der Vorgang, nicht der Modellaufruf.** Zwei neue Ereignisse im Tätigkeitsprotokoll, geschrieben ausschließlich im Main-Prozess. Plugin-Main-Code läuft dort; er bekommt eine neue Host-Fähigkeit `activity` (im Manifest zu deklarieren, Core prüft Vorgangsart und Felder, keine Inhalte — Muster wie `host.dialog`/`host.resource` in `main/plugins/host.ts`). `activity-append` aus dem Renderer bleibt auf Sprachbefehle beschränkt.

- `job-started`: `jobId`, `jobType`, `pluginId`, `model?`, `llm?` (Summe über die `runId` = `jobId`; dafür bekommt `host.llm.generate` ein `telemetryRunId`).
- `job-outcome`: `jobId`, `jobType`, `channel?`, `outcome`, `activeMs?`.
- Vorgangsarten im ersten Schnitt: `attendance-list`, `wp-post`, `ig-caption`. Referenzminuten je Vorgangsart in den Einstellungen; leeres Feld = gezählt, nicht bewertet (wie `unpricedTypes` heute).

**Nachweisbarer Abschluss — was das Etikett sagen darf:**

| Vorgang | Nachweis an der Main-Grenze | Etikett |
|---|---|---|
| Teilnehmerliste | Speicherdialog erfolgreich in `edoobox.generateAttendanceList` | „gespeichert" — nicht „gedruckt" |
| WordPress | `wordpress.publishPost` erfolgreich, `status` aus der Antwort | „Entwurf angelegt" / „veröffentlicht" |
| Instagram | existiert nicht — Zwischenablage ist Renderer | siehe unten |

Instagram: neben „Kopieren" ein Knopf „Als verwendet markieren", der die Plugin-Main-Action `edoobox.marketingMarkUsed` aufruft. Das ist dieselbe Vertrauensklasse wie „Übernehmen" beim Agenten — eine Nutzerentscheidung, die an der Main-Grenze festgehalten wird, keine vom Renderer erfundene Messung. Ohne Klick zählt der Text als „vorbereitet" (gezählt, nie mit Minuten bewertet). Generieren allein erzeugt kein Ergebnis.

**Vorgangs- und Wiederholungsidentität:**

- Marketing: `jobId` entsteht in `marketingGenerateContent` (Main) und geht an den Renderer zurück. WP-Übertragung und IG-Verwendung tragen dieselbe `jobId` mit `channel`. Erneutes Generieren = neuer Vorgang; der alte bleibt ohne Abschluss und zählt mit seiner aktiven Zeit als Fehlversuch (F01).
- Gutschrift je `(jobId, channel)` genau einmal, beim ersten Abschluss. Ein zweiter Push desselben Textes (Entwurf → veröffentlicht) aktualisiert das Etikett, bringt keine zweite Referenz.
- Gemeinsame Vorbereitung wird nicht zugeordnet, sondern einmal abgezogen: aktive Zeit je Vorgang vom Klick „Generieren" bis zum letzten Abschluss (Vordergrund, gedeckelt), Referenzen je Kanal. Rechnung: `ref(wp) + ref(ig) − activeMs(job)`, wenn beide abgeschlossen; nur ein Kanal → nur dessen Referenz. Damit entfällt die Aufteilungsfrage.
- Teilnehmerliste: `jobId = hash(offerId, dateId)`, opak, keine Inhalte. Zweiter Export derselben Liste am selben Tag = kein zweiter Vorgang; an einem anderen Tag = neuer Vorgang (Liste nach neuen Anmeldungen ist echte Arbeit).

**Aktive Zeit:** Der Plugin-Renderer nutzt `createActiveMeasurement` (`renderer/utils/activeTimeTracker.ts`, 30-min-Deckel) vom auslösenden Klick bis zum Abschluss und übergibt `activeMs` in die Abschluss-Action; Main schreibt. Analog `reviewMs` beim Übernehmen.

**Referenz gemessen vs. geschätzt** (Paket 3): `ReferenceMinutes`-Wert wird `{ minutes, source: 'estimated' | 'measured' }`, alte Zahlen migrieren als `estimated`. „gemessen" setzt nur der Vergleichsmodus (`docs/comparison-mode-plan.md`) oder eine bewusste Eingabe „selbst gestoppt". Quelle steht in der Fußnote und im Export.

**Keine rückwirkende Ersparnis:** Bereits erzeugte Teilnehmerlisten, Beiträge und Captions haben keine Ereignisse und bekommen keine. `marketingPublishStatus` aus dem Renderer-Store wird nicht importiert.

**Ansicht:** Neuer Block „Nutzenbilanz" oberhalb von Einsatz/Kosten/Zeitgewinn/Leistung: Ergebnisse je Vorgangsart mit Etikett, Nettozeitgewinn inkl. Fehlversuche, Zeitwert-Szenario, Ausgaben, Vorbehalte (nicht gemessen / ohne Referenz / vorbereitet ohne Abschluss). Die vier technischen Blöcke folgen darunter. Das Fenster heißt „Arbeitsbilanz", Modell-Leistung ist ein Abschnitt darin. Diagramme wie bisher: eigenes SVG, Lücken statt Nullen, N neben jeder Zahl, kein Punkt unter N = 3.

**Demo-Empfehlung** (deckt sich mit deiner): erst Paket 1, damit die gezeigten Zahlen ehrlich sind (Fehlversuche drin, Referenzmarken sichtbar, Anzeige aktuell), dann Paket 2 für den Veranstaltungsfall. Bis dahin gilt die Kennzahl ausdrücklich für übernommene Agent-Läufe und Mail-Aufgaben.

### Umsetzung Paket 1 (08.09.2026, freigegeben vom Nutzer)

Umgesetzt und geprüft (`npm run typecheck`, `npm run test` 1777 Tests, `npm run build`):
F03 → Allowlist + Test „kennt jede Art" + Ledger-Roundtrip (`activityLedger.test.ts`) **[BEHOBEN]** ·
F01 → `discardedRuns` in der Bilanz, Netto-Abzug, Anzeige in Karte/Statusleiste/Historie/Export, Gegenprobe
als Test **[BEHOBEN]** · F04 → Nachladen auf beide Push-Ereignisse **[BEHOBEN]** · F05 → 365 Tage / 20 000,
Reichweite-Zeile je Logbuch über neuen Lese-IPC `llm-telemetry-oldest` **[BEHOBEN]** · F06 → Wortlaut DE/EN
**[BEHOBEN, Szenariorechnung bleibt Paket 2]** · F02 → Fußnote **[SICHTBAR, Korrektur bleibt Paket 3]**.
GUI-Gegenprobe (08.09.2026, Dev-App mit isoliertem Profil und gesätem Logbuch, per Computer-Use): Statusleiste,
Tagesbilanz-Karte und Historie mit vier Fällen — mehrere Vorgänge inkl. Fehlversuche, nur Fehlversuche (Minus),
genau ein Vorgang unter einer Minute, ein Fehlversuch (Singular). Referenzänderung in den Einstellungen erzeugte
live die Markierung in der Kurve und lud Historie und Statusleiste ohne Zeitraumwechsel nach (F03 + F04 bestätigt).
Dabei zwei Textfehler gefunden und behoben: Die Rechnung auf der Karte zeigte den Nettowert hinter einer
Brutto-Gleichung („25 − 6 = 15"), und getrennt gerundete Teile ergaben „4 − 1 = 4". Jetzt zeigt die Rechnung
brutto, die Fehlversuch-Zeile nennt Abzug und Netto, und die aktive Zeit wird aus der Gleichung abgeleitet
(`impactText.test.ts`). Kein Commit.

### Umsetzung Paket 2 (08.09.2026)

Umgesetzt wie im Entwurf oben (`npm run typecheck`, `npm run test` 1796 Tests, `npm run build` grün):

- **Host-Fähigkeit `activity`** (`packages/plugin-api`: `PluginCapability`, `ActivityService`, `PluginActivityEntry`;
  `main/plugins/host.ts`): Plugin-Main-Code meldet `job-started`/`job-outcome`; der Kern setzt Zeit und
  Plugin-ID selbst (`pluginActivityEvent` in `shared/activityLog.ts`), prüft jedes Feld, weist Ungültiges laut
  ab und hängt an eine Vorbereitung den Modellverbrauch der `runId` (= `jobId`) an. `host.llm.generate` nimmt
  dafür `runId` entgegen. `activity-append` aus dem Renderer bleibt auf Sprachbefehle beschränkt.
- **Ereignisse und Regeln** (`shared/activityLog.ts`, getestet): `JOB_TYPES` attendance-list / wp-post /
  ig-caption, Etiketten saved / draft / published / used; Gutschrift je (jobId, jobType) genau einmal beim
  ersten Abschluss, späterer Abschluss ändert nur das Etikett; aktive Zeit je Vorgang einmal (erster Kanal
  trägt sie, weitere Kanäle 0), ohne Messung „nicht gemessen"; `job-started` ohne Abschluss = „vorbereitet,
  nicht abgeschlossen" (gezählt, nie bewertet). Referenzminuten je Vorgangsart (`ValuedType`), Einstellungen
  zeigen die drei neuen Zeilen. `stableJobId` (FNV, inhaltsfrei) macht aus Angebot + Termine + Tag denselben
  Vorgang — zweiter Export am selben Tag zählt nicht doppelt.
- **Nachweise**: Teilnehmerliste → `edoobox.generateAttendanceList` nach erfolgreichem Speicherdialog
  (`saved`, ausdrücklich nicht „gedruckt"); WordPress → `wordpress.publishPost` vermerkt den Abschluss dort,
  wo WordPress geantwortet hat, Etikett aus der ANTWORT (Test: „publish" gewünscht, „draft" bekommen →
  `draft`); Instagram → neue Action `edoobox.marketingMarkUsed` hinter dem Knopf „Als verwendet markieren"
  (Kopieren belegt nichts). `marketingGenerateContent` erzeugt die `jobId`, reicht sie als `runId` an beide
  Modellaufrufe und meldet `job-started`.
- **Aktive Zeit**: Marketing vom Klick „Generieren" bis zum jeweiligen Abschluss (`ActiveMeasurement.peek`,
  Vordergrund, 30-min-Deckel), Teilnehmerliste vom Klick bis zum Speichern.
- **Nutzenbilanz** als erster Block der Historie: Ergebnisse in Worten (Agent-Übernahmen, Mail-Aufgaben,
  Vorgänge mit Etikett, Vorbereitungen ohne Abschluss, Fehlversuche, Vorbehalte), Netto-Zeitgewinn, Zeitwert
  als Szenario mit optionalem Stundensatz (`impact.hourlyRate`/`impact.currency`), Ausgaben in USD, Nettozeile
  NUR bei USD, sonst Fußnote „ohne Wechselkurs keine Nettorechnung". Kein Wechselkurs in der App.
  Export nennt die Vorgänge mit Etikett-Vorbehalt. Statusleiste kennt „heute N Vorgänge", Karte und Tooltip
  listen die Vorgänge.
- **Offen**: GUI-Gegenprobe von Paket 2 (Nutzenbilanz, Einstellungen, Marketing-Knopf) — die Dev-App war
  mit gesäten Vorgangsereignissen gestartet, der Rechner wurde währenddessen gesperrt. Kein Commit.

### Antwort auf F08–F11 (Nachbesserung Paket 2, 08.09.2026)

Alle vier bestätigt und behoben; `npm run typecheck`, `npm run test` (1802 Tests), `npm run build` grün. Kein Commit.

**F08 → [BEHOBEN]** Genau wie vorgeschlagen: Der Kern schreibt den Abschluss mit dem beim Aufruf mitgegebenen
Stand (Untergrenze), der Renderer hebt ihn nach der Antwort über den neuen, engen IPC `activity-job-foreground`
an (`raiseJobActiveMs` in `main/activityLedger.ts`: nur anheben, nie senken, nur an einem vorhandenen Abschluss
dieses Kanals; Test). Teilnehmerliste: `generateAttendanceList` liefert die `jobId` zurück, der Renderer misst bis
nach dem Speicherdialog und trägt nach. WordPress: `publishToWordpress` trägt nach der Antwort nach. Keine
pauschale Laufzeit — nur Vordergrundzeit aus `createActiveMeasurement`.

**F09 → [BEHOBEN]** Neues Ereignis `job-abandoned` (jobId, activeMs) über die Host-Fähigkeit und die Action
`edoobox.marketingAbandon`. Der Renderer gibt beim erneuten Generieren den alten Vorgang mit seiner bis dahin
gemessenen Zeit auf; eine gescheiterte Generierung liefert jetzt trotzdem die `jobId` und vermerkt die
Vorbereitung, der Renderer gibt sie sofort auf. Auswertung: ein Aufgeben zählt nur, wenn der Vorgang keinen
Abschluss hat (sonst ist die Zeit schon verbucht), und geht als Fehlversuch mit Abzug in die Bilanz
(`jobs.abandoned`, `wastedRuns` der ersten bepreisten Kanalzeile). Tests: 20 − 6 − 4 = 10; Aufgeben nach
Abschluss wird ignoriert. Bekannte Grenze: Schließt der Nutzer die App mitten in einer Vorbereitung, ist deren
Zeit weg — kein Ereignis, kein Abzug; steht so im Code.

**F10 → [BEHOBEN]** Die Bewertung läuft jetzt auf VORGANGSEBENE (`ActivitySummary.jobRuns`, `JobRun`): gespart =
Σ Referenz der bepreisten Kanäle − aktive Zeit des Vorgangs, einmal. Deine Gegenprobe (3 min WP, 5 min IG, nur
IG-Referenz 10) ergibt jetzt 5 min mit 5 aktiven Minuten (Test). Ohne jede Referenz bleibt der Vorgang
„nicht bewertbar" und seine Kanäle stehen in `unpricedTypes` — sein Aufwand wird dann auch nicht abgezogen, wie
bei Agent-Läufen ohne Referenz. Die Kanalzeilen bleiben für die Anzeige: jede bepreiste Zeile bekommt ihre
Referenz-Gutschrift, die aktive Zeit steht bei der ersten bepreisten Zeile; die Kanal-Läufe stehen nicht mehr
in `acceptedRuns`.

**F11 → [BEHOBEN]** Der USD-Saldo erbt die Vorbehalte der Ausgaben am Wert selbst: „≤" bei Aufrufen ohne Preis
(Ausgaben Untergrenze → Saldo Obergrenze) mit Fußnote, „≈" bei gerechneten Kostenteilen mit Fußnote. Beides in
`HistorySection.tsx` neben `formatCostCell`, das dieselben Zeichen für die Ausgaben trägt.

### GUI-Gegenprobe Paket 2 (08.09.2026, abends)

Bestanden, mit einer Besonderheit: Das Electron-Fenster der Dev-App malte nach dem Entsperren nichts mehr
(weiß, Menüpunkte grau), obwohl Renderer und DOM in Ordnung waren (82 KB DOM, keine Fehler, JS reagiert) —
ein Compositor-Problem der Grafikschicht, nicht der Code. Die Prüfung lief deshalb über das
Chrome-DevTools-Protokoll (`npx electron-vite dev --remote-debugging-port=9222`): DOM-Text ausgelesen,
Tastatur-/Klick-Ereignisse eingespeist, Screenshots renderer-seitig aufgenommen (`Page.captureScreenshot`).
Geprüft mit gesätem Logbuch (Marketing mit aufgegebener Vorbereitung, zwei Kanälen und einer offenen
Vorbereitung, Teilnehmerliste, Agent-Läufe):

- Statusleiste „heute 36 min Zeitgewinn" = 25 − 6 − 2 (Tabelle) + 20 + 10 − 7 − 4 (Marketing) — Vorgangsebene, Aufgeben abgezogen.
- Karte: Vorgangszeilen mit Etikett, „Vorbereitet, nicht abgeschlossen: 1 — gezählt, nicht bewertet", Fehlversuch-Zeilen mit Netto; zweiter Kanal sagt jetzt „aktive Zeit beim anderen Kanal desselben Vorgangs abgezogen" statt „− 0 min aktiv (gemessen)" (dabei gefunden, behoben, Test).
- Nutzenbilanz-Block: 40 min netto, Zeitwert 40,00 € (60 EUR/h), Ausgaben „—", Ergebnisliste, Szenario-Fußnote mit Währungshinweis. Reichweite-Zeile, Zeitgewinn-Block mit „5 bewertete Läufe · 2 Fehlversuche, −6 min".
- Einstellungen: drei neue Referenzzeilen, Stundensatz + Währung mit Hinweis.
- Nicht geprüft: Marketing-Tab mit „Als verwendet markieren" und der echte Ablauf Teilnehmerliste → Nachtrag (braucht edoobox-Daten und einen echten Speicherdialog); die Wege sind durch Plugin- und Ledger-Tests abgedeckt.

### Umsetzung Paket 3 (08.09.2026, abends) — GUI-geprüft

- **Manuelle Zeitkorrektur** (F02): Ereignis `time-correction` (targetId, extraMs, source `manual`), geschrieben
  vom Main-Prozess über den IPC `activity-correct-time`; der Ledger nimmt nur bekannte Ziele (Agent-Lauf,
  Mail-Durchgang, Vorgang) und 1 min bis 8 h an. Die Rohmessung bleibt; der Nachtrag wird in `activeMs`
  addiert (ein nicht gemessener Lauf wird dadurch bewertbar — der Nutzer hat gesprochen) und überall als
  „nachgetragen — Nutzerangabe, keine Messung" ausgewiesen: Karte, Statusleisten-Tooltip, Historie-Kennzahl,
  Export. Formular „Nacharbeit nachtragen" unter dem Zeitgewinn: Vorgangsliste des Zeitraums (Zeit · Art ·
  Modell · aktive Minuten · Fehlversuch), Minuten, Knopf; Ablehnung sichtbar. In der App: 5 min auf den
  Tabellen-Lauf → Historie 40 → 35 min, Statusleiste 36 → 31, Karte „25 − 11 = 14" plus Nachtrag-Zeile.
- **Referenzquelle** (geschätzt / selbst gestoppt): `impact.referenceSources` je Vorgangsart, Auswahl neben
  jeder Referenzzeile in den Einstellungen. Rechnung unverändert; Karte sagt „(deine Schätzung)" bzw.
  „(selbst gestoppt)", Historie-Fußnote und Export tragen „(geschätzt)"/„(selbst gestoppt)" an jeder Zahl.
  In der App umgestellt und auf der Karte bestätigt.
- Tests: `activityLog.test.ts` (Nachtrag auf Lauf, Fehlversuch, Mail, Vorgang; Ablehnungsregeln; Zielprüfung),
  `activityLedger.test.ts` (Ledger-Annahme), `impactText.test.ts` (Texte). `npm run typecheck`, `npm run test`
  (1809), `npm run build` grün. Kein Commit.
- Bewusst nicht gebaut: Löschen eines Nachtrags (wäre ein zweiter Schreibweg; bis dahin ist ein Fehlnachtrag
  im Protokoll sichtbar und lässt sich nur durch Löschen der Zeile in `activity/<hash>.json` zurücknehmen) und
  Nachträge aus der Sprachkarte heraus.

### Antwort auf F12–F16 (08.09.2026, spät)

Alle fünf bestätigt und behoben; `npm run typecheck`, `npm run test` (1811 Tests), `npm run build` grün. Kein Commit.
Keine neue GUI-Prüfung: F12/F13/F16 sind reine Rechenregeln mit Tests, F14 ist Export mit Test, F15 braucht echte
edoobox-Daten (Store-Logik ist die gleiche wie beim WordPress-Status).

**F12 → [BEHOBEN]** `JobRun.timeBookedEarlier` ist weg; die Zusammenfassung liefert `earlierChannels` (vor dem
Zeitraum erstmals abgeschlossene Kanäle), und `estimateSavedMinutes` entscheidet referenzbewusst: verbucht ist
die Zeit nur, wenn ein FRÜHERER Kanal bepreist war. Test mit deiner Gegenprobe (Tag 1 WP ohne Referenz 3 min,
Tag 2 IG 5 min, Referenz nur IG 10): Abschnitte 0 + 5 = Gesamt 5; mit beiden Referenzen 15 + 10 = 25.

**F13 → [BEHOBEN]** `withCorrection(null, x)` bleibt `null`: Ohne Grundmessung bleibt der Lauf unbewertet,
auch mit Nachtrag; `correctedRuns` zählt ihn nicht. Das Formular bietet ungemessene Vorgänge gar nicht mehr
an, der Hinweistext sagt warum. Der frühere Test, der das falsche Verhalten festschrieb, ist umgedreht
(30 min Referenz + 5 min Nachtrag → 0 min, 1 nicht gemessen). Eine ausdrückliche „vollständige Gesamtzeit"
als Nutzerangabe habe ich NICHT gebaut — das wäre ein zweiter Eingabeweg mit eigener Kennzeichnung; offen.

**F14 → [BEHOBEN]** CSV-Zeitgewinn-Zeilen tragen jetzt den Nachtrag-Hinweis („N min bei M Vorgängen manuell
nachgetragen (Nutzerangabe, keine Messung)"), und eine Schlusszeile `Zeitgewinn;gesamt;Referenzen;;;…` führt die
Referenzen samt Quelle wie das Markdown. Ein Test prüft CSV und Markdown auf dieselben Vorbehalte.

**F15 → [BEHOBEN]** `marketingPublishStatus[offer].instagram` trägt die `jobId`; der Knopf ist nur gesperrt,
wenn der Status zum AKTUELLEN Vorgang gehört. Neu generieren → neue jobId → erneut markierbar; dieselbe
jobId bleibt gesperrt.

**F16 → [BEHOBEN]** Die Zeit eines Vorgangs ist das Maximum aller kumulativen Messungen — Abschlüsse UND
Aufgeben. Aufgeben nach Teilerfolg ist weiterhin kein zweiter Fehlversuch, hebt aber die Zeit an. Test:
WordPress nach 5 min, Aufgeben bei 9 min, Referenz 20 → 11 statt 15.

### Tagesbilanz-Karte im Look der Leistungsauswertung (08.09.2026, spät)

Nutzerrückmeldung: Die Karte in der Befehlspalette war eine Textwand, die Leistungsauswertung hat Kennzahlen,
Blöcke und gedämpfte Vorbehalte. Umgesetzt (kein neuer Inhalt, nur Form): Kennzahlen-Zeile unter dem Titel
(Zahl fett, Einheit dahinter, Fehlversuche in Warnfarbe), ein Block je Gruppe mit eigener Fläche, in der
Zeitbilanz je Art eine Zeile mit Beschriftung links und Rechnung rechts, darunter Kontext gedämpft und
Vorbehalte in Warnfarbe; „Erledigt" ebenfalls als Beschriftung + Etikett. Modell: `AnswerLine.kind`/`label`
und `AnswerCard.stats` (`shared/voiceCommands/types.ts`), Textbausteine liefern Rechnung und Beschriftung
getrennt (`savedBasisFormula`, `jobRows`), Tooltip und Historie nehmen weiter die Textfassung. Titel heißt
jetzt „Heute mit MindGraph" (Vorgänge sind keine Übernahmen). Die Karte scrollt jetzt in der 70-vh-Palette
statt abgeschnitten zu werden. In der App geprüft (Computer-Use). 1811 Tests grün.

## Pakete zur Freigabe

1. **Historie ehrlich machen** — F03 (Allowlist + Roundtrip-Test), F04 (Nachladen), F05 (365 Tage + Reichweite-Zeile), F06-Wortlaut, F02-Fußnote, F01 (Fehlversuche im Abzug). Keine neuen Ereignisarten, reine `shared/`-Logik plus Anzeige. Nach Memory-Regel: Karte, Statusleiste und Sprachausgabe mit 1 Vorgang, mehreren und einem negativen Wert durchsehen.
2. **Veranstaltungen in die Arbeitsbilanz** — Host-Fähigkeit `activity`, `job-*`-Ereignisse, drei Vorgangsarten, aktive Zeit im Plugin-Renderer, „Als verwendet markieren", Referenzen je Vorgangsart, Nutzenbilanz-Block, Zeitwert-Szenario, `telemetryRunId` für `host.llm.generate`.
3. **Korrekturen und Referenzqualität** — `time-correction`, Referenzquelle gemessen/geschätzt, Export erweitern.

## Status

Review abgeschlossen; keine Änderungen am Anwendungscode, kein Commit/Push.

Validierung: acht einschlägige Testsuiten mit 154 erfolgreichen Tests (`llmTelemetry`, `llmCost`, `activityLog`, `activeTime`, `measurementHistory`, `measurementHistoryExport`, Main-`telemetry`, `telemetryLedger`). F01 und F03 zusätzlich mit direkten Aufrufen der vorhandenen Funktionen nachvollzogen; die bestehenden Tests decken diese Probleme nicht ab.

Demo-Vorschlag: Einen konkreten Arbeitsfall manuell und mit MindGraph durchführen, gleiche Ergebnisqualität prüfen, Auftrag/Prüfung/Nacharbeit/Fehlversuche erfassen und mehrere vergleichbare Fälle zeigen. Danach eine ausdrücklich als Annahme gekennzeichnete Hochrechnung mit Aufgabenhäufigkeit und Stundensatz präsentieren. Zeitgewinn und Ergebnisqualität zuerst, Modellgeschwindigkeit als technische Erklärung danach.

Claude 08.09.2026: alle sieben Findings gegen den Code bestätigt (F01–F07 adressiert bzw. F02 in Diskussion), Entwurf Arbeitsbilanz und drei Pakete im Abschnitt „Claude-Antwort". 154 Tests erneut grün. Wartet auf Freigabe von Paket 1 durch den Nutzer; keine Codeänderung, kein Commit.
Claude 08.09.2026 (2): Paket 1 umgesetzt, typecheck/test/build grün, GUI-Gegenprobe offen, kein Commit.
Claude 08.09.2026 (3): GUI-Gegenprobe Paket 1 bestanden, zwei Kartentexte korrigiert, 1781 Tests grün. Paket 2 begonnen.
Claude 08.09.2026 (4): Paket 2 umgesetzt (typecheck/test/build grün), GUI-Gegenprobe wegen gesperrtem Bildschirm offen, kein Commit.
Claude 08.09.2026 (5): F08–F11 behoben (typecheck/test/build grün), GUI-Gegenprobe Paket 2 weiter offen (Bildschirm gesperrt), kein Commit.
Claude 08.09.2026 (6): GUI-Gegenprobe Paket 2 über CDP bestanden, Kartentext für den zweiten Kanal korrigiert, 1803 Tests grün, kein Commit. Paket 3 begonnen.
Claude 08.09.2026 (7): Paket 3 umgesetzt und GUI-geprüft, 1809 Tests grün, kein Commit. Alle drei Pakete stehen zur Sichtung; Commit erst auf Zuruf.
Claude 08.09.2026 (8): F12–F16 behoben, 1811 Tests grün, Build grün, kein Commit.
Claude 08.09.2026 (9): Tagesbilanz-Karte an den Look der Leistungsauswertung angeglichen, GUI-geprüft, kein Commit.
