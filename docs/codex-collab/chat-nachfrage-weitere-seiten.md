# Petrol-Chat: „Schau auf weiteren Seiten“ als Nachfrage verstehen

## Aufgabe

Anlass, ein GUI-Test vom 26.10.2026 mit OpenRouter `openai/gpt-6-luna`:

1. Die erste Frage lautete „Schaue nach welche Parfüms Alesandro Gultieri von2023 bis 2026 veröffentlicht hat“. Die Antwort benennt ehrlich eine Lücke: In den abgerufenen Seiten (eaueau.co, fumerie.com) stehen keine Erscheinungsjahre.
2. Die zweite Frage lautete „Schaue bitte auf weiteren Seiten“ (schnelle Suche).
   - Der Satz ging **wörtlich** an Tavily.
   - Zurück kamen plex.tv, tagesschau.de und amazon.de. Übersprungen wurden linguee und translate.google.
   - Die Antwort lautete „Hier liegt mir nur eine abgerufene Seite vor; weitere Seiten kann ich nicht abrufen.“ Das klingt nach einer Fähigkeitsgrenze, war aber eine Suche ohne Thema.
   - Es erschien keine Warnung.

Die Nutzerfreigabe vom 26.10.2026 umfasst zwei Schritte:

**Schritt 1, Warnung bei „Schau…“-Sätzen.**
- `looksConversational` erfasst zusätzlich „schau(e|t) bitte / nach / mal / auf“, „guck(e) mal / nach“ und „recherchier(e)“.
- Die Regel bleibt eng: Nur ein Satzanfang mit Partikel zählt. Eine Suche wie „Schauinsland Wetter“ darf nicht warnen.
- Es bleibt bei einer Warnung, gesendet wird trotzdem.

**Schritt 2, gründliche Suche bei Nachfragen.**
- Bittet der Nutzer um weitere Seiten zum vorigen Thema („weitere Seiten“, „andere Quellen“, „mehr Quellen“, „schau woanders“), bekommt die **Planung** die vorige Webfrage als Thema mit.
- Schon gelesene Seiten der vorigen Antwort werden nicht erneut abgerufen.
- Die schnelle Suche bleibt wörtlich. Sie bekommt nur ein deutlicheres Angebot „vorige Suche übernehmen“ direkt bei der Warnung. Die frühere Messung (`chat-suchqualitaet*.md`) trug für „schnell“ keinen Wechsel.

**Schritt 3, Prüfung der gelesenen Seiten gegen die Frage. Freigegeben als Entwurf; gebaut wird nur mit Messung vorher und nachher.**
- **Anlass:** Der Nutzer hat den Eindruck, dass andere Chatbots mehr Seiten lesen und unpassende verwerfen. Beim Petrol-Chat gibt es nach dem Abruf nur den Wörterabgleich. Seiten wie plex.tv (oben) oder english.stackexchange.com (Probe vom 26.10.2026, Politikfrage) kommen ungeprüft ans Modell oder führen zu „nichts Lesbares“.
- **Idee:**
  - Mehr Seiten abrufen, als ins Fenster passen (etwa 8–10), zunächst nur bei „gründlich“.
  - Jeden Auszug lokal mit dem Einbettungsmodell (bge-m3, wie im Vault-Index: `main/rag/embed.ts`, `resolveLocalModel`) gegen die Frage bewerten.
  - Nur die besten 3–4 Auszüge über einer Schwelle einfrieren.
  - Verworfene Seiten bleiben sichtbar: „abgerufen, passte nicht zur Frage“ mit Wert. Nichts verschwindet still.
  - Liegt keine Seite über der Schwelle, sagt die App ehrlich „keine passende Seite gefunden“ und ruft kein Modell auf, so wie der Vault-Chat unter seiner Untergrenze 0,50.
- **Kosten:** Netzzeit und lokale Einbettung. Kein größeres Kontextfenster nötig, die Satzprüfung bleibt auf den eingefrorenen Auszügen.
- **Fragen an den Prüfer:**
  - Welche Schwelle, und kalibriert woran? Die 0,50 aus dem Vault ist an Notizen gemessen, nicht an Webseiten.
  - Was gilt ohne lokales Einbettungsmodell (Cloud-Nutzer, schwache Hardware)? Die Funktion entfällt dann sichtbar, kein Ersatz durch die Cloud.
  - Wie verhält sich das zu Abrufbudget (`DEEP_LIMITS.fetches`), Frist (`deadlineLocalMs`) und Seitenwahl des Modells?
  - Wird Text aus Webseiten zum Einbetten an Ollama geschickt? Lokal ja, er ist untrusted, aber nur ein Vektor.
- **Messung:** gleiche Fragen wie in `chat-gruendliche-suche-messung.md` plus die Fälle Plex/Stackexchange. Erwartung laut letzter Messung: Totalausfälle sinken, schwere Fehler bei Geld und Recht vermutlich nicht, denn sie entstehen beim Modell. Ein Sieger nur nach der Speicherregel: mehr Treffer oder etwa 20 % schneller, und in keiner Risikoklasse mehr schwere Fehler.

**Grenzen (Nutzerregeln):**
- Nur Hinweise, nie still umschreiben.
- Gesendet wird, was der Nutzer sieht. Geht die vorige Frage in die Planung, muss das sichtbar sein, so wie bei `webTopics`.
- Die vorige Antwort und ihre Auszüge gehen nie mit. Nur die eigene Frage und die URLs der gelesenen Seiten dürfen mit, und auch die nur zum Ausschließen.
- Code entsteht erst nach der Codex-Prüfung und der Freigabe der Befunde durch den Nutzer (Tor 1).

**Offene Entwurfsfragen für den Prüfer:**
- **Woher kommt die vorige Frage?** Der Renderer schickt sie (wie `webTopics`, gerahmt, `sanitizeWebTopics`), oder der Main kennt sie aus dem Snapshot. Der Snapshot hält nur Auszüge.
- **Woher kommen die auszuschließenden URLs?** Aus `snapshotId` (Main-seitig, vertrauenswürdig) oder aus der Renderer-Liste. Der Renderer darf keine beliebigen URLs einbringen. Das Ausschließen darf nur verengen, nie neue Ziele öffnen.
- **Wann gilt eine Nachricht als Nachfrage?** Erkannt wird sie nur als Anlass für einen Hinweis mit Klick („vorige Frage als Thema mitnehmen“), nicht automatisch. Oder automatisch mit Anzeige in der Spur? Die Nutzerregel spricht für einen Klick.
- **Was gilt, wenn alle Kandidaten schon gelesen sind?** Ehrlich melden („keine neuen Seiten gefunden“) statt dieselben Seiten zu wiederholen.

### Runde 2 (26.10.2026): Schritt 2b + Lückensuche — Entwurf, noch kein Code

**Anlass (Nutzervergleich 26.10.2026, gleiche Frage nach Gualtieris Parfüms 2023–2026):**
- **Petrol (gründlich oder schnell):** Die Antwort sagt ehrlich: „Eine verlässliche Liste … lässt sich aus den abgerufenen Seiten nicht erstellen: Die Produktübersicht nennt keine Erscheinungsdaten …“. Belegt sind nur Duftnamen ohne Jahr (eaueau.co, fumerie.com, kafkaesqueblog.com).
- **Claude (Webrecherche in Schleifen, etwa 1 Minute):** Es suchte so lange weiter, bis jedes Jahr gefunden war: Fantomas 2020, Sadonaso März 2023, Risvelium 2025 und Micodelirio Mai 2026. Laut Nutzer stimmt das.
- **Unterschied:** Petrol sucht nur nach, wenn **Wörter der Frage** in den Auszügen fehlen (`checkQuestionTerms`). Hier standen alle Fragewörter auf den Seiten, also gab es keine Nachsuche. Die Lücke liegt in der **Antwort**: Duftnamen sind da, Jahre fehlen. Diese Erkenntnis des Modells geht heute nirgends hin. Claude nutzt dagegen die Namen aus Runde 1 für gezielte Suchen je Duft in Runde 2.

**2b (F03–F05), Grundlage der Lückensuche:**
- Der Main hält je fertiger Webantwort einen Datensatz mit der Nutzerfrage, den gelesenen Seiten (**angefragte und endgültige URL**, F04) und den eingefrorenen Auszügen. Er ist an Absender und Bereich gebunden und hat eine Ablaufzeit, so wie `WebSnapshotStore`. Der Renderer kennt nur die Kennung (F03).
- Legt der Main den Datensatz auch für Antworten **ohne Zitat** an, oder bleibt es bei „nur mit Zitat“? Gerade „nichts gefunden“-Antworten brauchen den Ausschluss.
- Eine neue Suche mit Kennung schließt diese Seiten aus. Geprüft wird vor jedem Abruf und nach Weiterleitungen erneut (F04). Ausschließen darf nur verengen, es öffnet nie neue Ziele.
- Eigener Endzustand „keine neuen Seiten unter den Treffern“, bis in Anzeige und Export (F05).
- Ab 2b stimmt der Satz im Hinweis `petrolChat.webMorePagesHint` nicht mehr („schon gelesene Seiten können wieder auftauchen“), sobald die Kennung mitgeht.

**Lückensuche:**
- **Auslöser:** Die Antwort benennt eine Lücke. **Wichtiger Fund beim Entwurf:** `isGapStatement` wird heute nur für Sätze **ohne** Quellennummer ausgewertet (`sentenceExtras`, `webChat.ts:987`). Der Lückensatz im Parfüm-Fall trug `[1][2][3]` und wurde deshalb nicht als Lücke erkannt, sondern als „geringe Wortübereinstimmung · Verneinung“ markiert. Der Auslöser braucht also eine eigene Erkennung. Alternativ fragt ein kleiner Modellaufruf: „Welche Angaben fehlen noch, um die Frage zu beantworten?“ Die Antwort kommt als JSON und hat eine begrenzte Länge.
- **Angebot:** Ein Knopf „Lücke gezielt nachsuchen“ unter der Antwort. Gesendet wird erst nach dem Klick (Nutzerregel: nichts still). Offen ist, ob die Lückensuche in „gründlich“ später automatisch laufen darf, sichtbar in der Suchspur. Erst nach Messung.
- **Was in die Planung darf:**
  - die Nutzerfrage;
  - der benannte Lückensatz bzw. die Fehlliste;
  - **Namen/Begriffe aus den eingefrorenen Auszügen**, etwa die Duftnamen. Sie stammen aus fremden Seiten, sind also untrusted: gerahmt, längenbegrenzt und nur als Suchbegriffe, nie als Anweisung.
  - **Nicht** die alte Antwort als Behauptung. Offen: Ist der Lückensatz selbst Modelltext, und reicht die Rahmung?
- **Sichtbarkeit (Regel „gesendet wird, was der Nutzer sieht“):** Vor dem Senden zeigt die App die geplanten Suchanfragen oder mindestens die übernommenen Begriffe an. Bei Cloud-Modellen nennt die Datenwegzeile, dass Auszugsbegriffe an das Modell gehen.
- **Budget:** eine eigene Runde mit eigener Frist, zum Beispiel 2 Suchen, 4 Abrufe und 45/60 s. Gelesene Seiten fallen per 2b weg. Die Antwort entsteht neu aus **alten plus neuen** Auszügen, mit neuer Nummerierung, in den Grenzen von `freezeWebSourcesToFit`. Oder nur aus den neuen? Für die Frage braucht es beide: Namen aus den alten Seiten, Jahre aus den neuen.
- **Grenzen:**
  - Die Antwort entsteht nur aus Seiten, die die App abgerufen hat.
  - Die Satzprüfung bleibt unverändert.
  - Höchstens **eine** Lückenrunde je Klick, keine Endlosschleife.
  - Schließt die Runde die Lücke nicht, sagt die Antwort das wieder ehrlich.
- **Messung vor einem Standardwechsel:**
  - Fragen der Art „Liste mit Jahren/Daten/Preisen“ wie der Parfüm-Fall, dazu die Fragen aus `chat-gruendliche-suche-messung.md`;
  - Zielgrößen: Lücke geschlossen ja/nein, schwere Fehler je Risikoklasse, Dauer;
  - Sieger nur nach der Regel aus F11: mehr belegte richtige Antworten und keine Zunahme schwerer Fehler, nicht allein Tempo.

**Fragen an den Prüfer (Runde 2):**
1. Ist ein Datensatz für 2b und die Lückensuche richtig, oder gehören sie getrennt?
2. Wie sieht ein Auslöser für Lücken aus, der auch zitierte Lückensätze erkennt, ohne bei echten Verneinungen („Das Gesetz gilt nicht für …“ [1]) Fehlalarm zu geben? Regel oder Modellaufruf?
3. Ist es sicher, Begriffe aus fremden Auszügen in die Suchplanung zu geben (Prompt-Injection über Suchanfragen, Datenabfluss über die Suchanfrage an den Suchdienst)?
4. Wie viel Budget und Frist sind nötig, wenn lokal heute schon 60–130 s anfallen?
5. Antwort aus alten plus neuen Auszügen: Wie bleiben Nummerierung, Snapshot, „Hiermit weiterfragen“ und Export konsistent?
6. Welche Messfälle braucht es mindestens, damit der Parfüm-Fall nicht der einzige Beleg ist?

### Runde 3 (26.10.2026): Entwurf nach F14–F20 überarbeitet — noch kein Code

Der Entwurf aus Runde 2 gilt nur noch als Vorgeschichte. Es gilt dieser Stand. Der Nutzer hat freigegeben: F12/F13 jetzt beheben, den Entwurf nach F14–F20 umbauen und erneut prüfen lassen.

**A. 2b: zwei getrennte Datensätze im Main (F03–F05, F17)**
- **Recherche-Datensatz** (neu): Nutzerfrage, alle **begonnenen** Abrufe mit angefragter und endgültiger URL (normalisiert), Absender, Bereich, Ablaufzeit wie `WebSnapshotStore`.
  - Angelegt wird er für **jeden** Weblauf, der mindestens einen Abruf begonnen hat: Antwort mit oder ohne Zitat, `nothing-readable`, gestoppt mit Teilabrufen.
  - Der Renderer kennt nur eine opake `researchId` und schickt nie eine URL-Liste.
- **Antwort-Snapshot** (wie bisher): exakt die eingefrorenen Auszüge, nur bei zitierter Antwort, einziger Weg für „Hiermit weiterfragen“. Eine Antwort kann beide Kennungen tragen.
- **Ausschluss:** Eine neue Suche mit `researchId` prüft jeden Kandidaten **vor** dem Abruf gegen beide URL-Mengen. Nach einer Weiterleitung prüft sie das Ziel erneut. Ein Treffer gilt dann als „schon gelesen“, zählt nicht als neue Seite und kommt in die Spur. Ausschließen darf nur verengen.
- **Endzustand `no-new-pages`:** Alle Kandidaten waren schon gelesen. Er reicht bis in Anzeige und Export. Gibt es keine neue lesbare Seite, wird kein Modell aufgerufen.
- Der Hinweis `webMorePagesHint` („schon gelesene Seiten können wieder auftauchen“) entfällt, sobald die `researchId` mitgeht.

**B. Lückensuche: zweistufig, Gesendetes vorher sichtbar (F14–F16)**
1. **Auslöser = Nutzerentscheidung, keine Erkennung als Wahrheit (F14).**
   - Unter jeder Webantwort mit Recherche-Datensatz steht ein leiser Knopf „Gezielt nachsuchen …“.
   - Eine eng gefasste Regel markiert den Knopf nur deutlicher, sie startet nie etwas. Die Regel erkennt Wendungen wie „aus den abgerufenen Seiten nicht/keine …“, „nennt keine …“, „lässt sich … nicht …“, auch in zitierten Sätzen.
   - Ein Fehlalarm kostet also nur eine Hervorhebung.
2. **Klick 1 öffnet eine Vorschau. Noch geht nichts ins Netz und nichts an ein Modell.**
   - **„Was fehlt?“:** ein Textfeld, vorbelegt mit den Fragewörtern zu Art und Einschränkung (Jahr, Datum, Preis, Ort aus `questionTerms`), nicht mit Modelltext. Der Nutzer kann es ändern.
   - **„Begriffe aus den Seiten“:** Chips, die der Main **deterministisch** zieht (F15).
     - Nur Wörter und Wortgruppen, die wörtlich in den eingefrorenen Auszügen **und** in der Antwort stehen, die nicht in der Frage stehen und keine Füllwörter sind.
     - Verworfen werden URLs, Domains, E-Mail-Adressen, Ziffernfolgen über 4 Stellen, Kennungen mit Sonderzeichen sowie Wörter aus Sätzen mit Imperativ oder Anredeformen.
     - Höchstens 8 Chips, je höchstens 40 Zeichen. Alle sind abwählbar.
   - **„Suchanfragen“:** fertig gebaut, deterministisch je gewähltem Begriff: `Begriff + Kernwörter der Frage + Was fehlt`. Höchstens 4 Anfragen, jede im Feld bearbeitbar.
   - **Datenwege:** welcher Suchdienst und welche Hosts abgerufen werden. Ein Modell erscheint dort nur, wenn es für die Antwort gebraucht wird.
3. **Klick 2 „Suchen“:** Gesendet wird genau, was in den Feldern steht.
   - Der Main prüft vor dem Netzaufruf jede Anfrage gegen die erlaubte Wortmenge: Wörter der Frage, freigegebene Chips, das „Was fehlt“-Feld und vom Nutzer **im Feld getippte** Wörter.
   - Bei Abweichung sendet er nicht.
   - Hat der Nutzer selbst getippt, stammt das aus seinem Feld. Die Prüfung schützt vor Manipulation des Renderer-Zustands, nicht vor dem Nutzer.
   - **Kein Planungsmodell** in diesem Weg.
   - Offen für den Prüfer: Ist eine optionale Modellplanung („Anfragen vorschlagen lassen“) mit derselben Prüfung den Aufwand wert?

**C. Ablauf und Budget (F18)**
- **Frist:** eine eigene, durchgehende Recherchefrist ab Klick 2 für Suchen und Abrufe. Die Antwortphase hängt wie bisher nur am Stopp. Alle Such- und Abrufaufrufe hängen am selben Abbruchsignal.
- **Vorläufige Grenzen:** höchstens 4 Suchen und 6 begonnene Abrufe, höchstens 3 neue Seiten. Die endgültigen Zahlen kommen erst nach einer Messung von P50/P95 je Phase. Für die eine gezielte letzte Suche bleibt eine Reserve.
- **Fristende:** Gibt es neue lesbare Seiten, antwortet das Modell mit sichtbarem Vermerk „Frist erreicht“. Ohne neue lesbare Seite gibt es keine Antwort und die Meldung „Nachsuche fand keine neuen lesbaren Seiten“.

**D. Quellen der neuen Antwort (F19)**
- **Eigene, unveränderliche Quellenliste** mit dichter Nummerierung [1]…[K].
- **Alte Auszüge aus dem Snapshot unverändert, nie neu gekürzt:** Es kommen nur die übernommenen, die in der alten Antwort zitiert waren. Danach folgen die neuen Auszüge, eingefroren mit dem Restbudget.
- **Wenig Platz:**
  - Vorab gilt eine Mindestregel: mindestens 1 alter und mindestens 1 neuer Auszug, sonst bricht die App mit Erklärung ab.
  - Fehlen alte Auszüge, sagt die Anzeige „N ältere Seiten nicht übernommen (Platz)“.
- **Ein neuer Antwort-Snapshot** hält genau diese Liste. Prüfbericht, Fußnoten, Export und „Hiermit weiterfragen“ rechnen nur damit. Der alte Snapshot bleibt unberührt.
- Die Satzprüfung bleibt unverändert. Ein Klick löst genau eine Runde aus, es gibt keine Schleife.

**E. Messung (F20), vor dem Bau festgelegt**
- **Gelabelte, gepaarte Fälle mit Vorher und Nachher:**
  - zitierte echte Lücke (Parfüm-Fall und 4–6 ähnliche „Liste mit Jahr/Datum/Preis“-Fragen);
  - echte Verneinung („gilt nicht für Vereine [1]“), bei der die Hervorhebung nicht kommen darf;
  - vollständige Antwort;
  - widersprüchliche Seiten;
  - präparierter Auszug mit Anweisung, URL und E-Mail in Namensnähe;
  - erschöpftes Budget;
  - keine neuen Seiten.
- **Blind bewertet:**
  - richtige **belegte** Ergänzungen je Teilfrage;
  - falsche Hervorhebungen;
  - F/Q je Risikoklasse;
  - tatsächlich gesendete Begriffe;
  - Abbrüche;
  - Zeiten P50/P95.
- **Bauentscheidung:** Ein Default (automatisch in „gründlich“) wäre erst danach zu entscheiden. Der Klickweg selbst ist kein Defaultwechsel und braucht für den Bau nur die Sicherheitsfälle grün.

**Fragen an den Prüfer (Runde 3):**
1. Trägt die Herkunftsregel „Antwort ∩ Auszug“ für Chips gegen Injection, oder hilft sie nicht? Die Antwort ist selbst schon von den Auszügen beeinflusst.
2. Ist die Wortmengen-Prüfung in B3 dicht? Zu bedenken sind Zerlegung, Groß- und Kleinschreibung, Umlaute und Bindestriche, und ob der Renderer „getippte“ Wörter vortäuschen kann. Ist die Prüfung so überhaupt sinnvoll, wenn der Renderer der Ort der Eingabe ist?
3. Reicht die Vorbelegung „Was fehlt“ aus `questionTerms`, oder ist sie im Parfüm-Fall leer bzw. falsch? Die Frage enthielt „von 2023 bis 2026 veröffentlicht“.
4. Datensatz bei gestopptem Lauf: Welche Abrufe zählen als „gelesen“?
5. Mindestregel in D: Ist „≥1 alt + ≥1 neu“ richtig, oder sollten alte Auszüge ganz entfallen, wenn neue da sind?

### Runde 4 (26.10.2026): Richtung B — Lückenrunde selbsttätig in „gründlich“, noch kein Code

**Nutzerentscheidung 26.10.2026:** Richtung B statt des Klickwegs aus Runde 3. Der Klickweg wurde mit jeder Prüfrunde umständlicher: Vorschau, Chips und Freigabe. Maßstab des Petrol-Chats ist aber, schnell eine gute Antwort zu geben (Vergleich: Claude suchte eine Minute selbst weiter). Für die zweite Suchrunde gilt dieselbe Zusage wie für die erste in „gründlich“: Das Modell erstellt die Suchanfragen, und der Nutzer sieht sie danach in der Suchspur. Die Abschnitte B–D aus Runde 3 entfallen. A (2b) bleibt, korrigiert nach F24.

**A′. 2b, Datensatz (F03–F05, F17, F24)**
- Der Recherche-Datensatz im Main hält je Abruf einen Status: `versucht` (nur angefragte URL), `gelesen` (angefragte und endgültige URL, Text lesbar), `eingefroren` (Teil der Quellenliste) und `abgebrochen`.
- Als „schon gelesen“ werden nur `gelesen` und `eingefroren` ausgeschlossen. `versucht` und `abgebrochen` erscheinen höchstens als Hinweis.
- `no-new-pages` gilt nur, wenn ausgeschlossene **gelesene** Treffer der Grund sind.
- Der Renderer kennt nur die `researchId`. Der Antwort-Snapshot für „Hiermit weiterfragen“ bleibt getrennt und unverändert.
- Gebraucht wird das für die **Nachfrage in einem neuen Lauf** („Schaue auf weiteren Seiten“, Thema per sichtbarem Klick wie in Runde 1). Die Lückenrunde B′ läuft im selben Lauf und braucht es nicht, `seenFinal`/`triedUrls` reichen dort.

**B′. Lückenrunde im Lauf (`runDeepResearch`)**
1. **Ablauf:** Runde 1 wie heute: planen, suchen, wählen, lesen. Danach friert die App probehalber ein, mit derselben Funktion wie am Ende (`deps.excerpts`/`freezeBest`).
2. **Lückenprüfung, ein Modellaufruf.** Der Aufruf bekommt die Frage und die probehalber eingefrorenen Auszüge, gerahmt als UNTRUSTED. Er antwortet nur mit JSON `{"complete": bool, "missing": [≤3 kurze Angaben], "queries": [≤3 Suchanfragen]}`.
   - Der Prompt verlangt: Prüfe, ob jede Teilfrage mit den Auszügen beantwortbar ist. Für die Lücke formulierst du Suchanfragen, die Namen und Begriffe aus den Auszügen benutzen dürfen, zum Beispiel einen Produktnamen und „Erscheinungsjahr“.
   - Diese Prüfung **ersetzt** die heutige Nachsuche nach fehlenden Fragewörtern (`checkQuestionTerms` → Retry-Plan) und schließt sie ein: Fehlende Fragewörter gehen als Hinweis in den Prompt, nie in die Antwortphase (bestehende Regel aus der Messung). Die Schutzsuche für Zahlen der Frage (`guard`, F24/F32 alt) bleibt deterministisch.
   - Kaputtes JSON oder `complete: true` → keine Lückenrunde, Vermerk in der Spur.
3. **Prüfung der Anfragen im Main (deterministisch, vor jedem Netzaufruf).**
   - Bestehende Regeln: `parsePlanReply` (Länge, Dubletten, `stripUnaskedDates`).
   - Neu verworfen werden Anfragen mit URL, Domain, E-Mail-Adresse, `@`, einer Ziffernfolge über 4 Stellen ohne Herkunft oder Steuerzeichen.
   - **Herkunft je Wort:** Jedes Wort der Anfrage muss in der Frage, in den eingefrorenen Auszügen oder in einer kleinen festen Liste von Aspektwörtern stehen, zum Beispiel Erscheinungsjahr, Erscheinungsdatum, veröffentlicht, Preis, Kosten, Datum, release, date, price, year. Verglichen wird kleingeschrieben, Umlaute bleiben, Bindestrich-Teile werden einzeln geprüft.
   - Verworfene Anfragen erscheinen mit Grund in der Spur.
   - So kann eine Suchanfrage nur Wörter enthalten, die schon öffentlich auf den Seiten standen oder vom Nutzer stammen. Kein Weg für Daten aus Verlauf, Vault oder System. Das Restrisiko „präparierte Seite lenkt die Suche“ bleibt und ist so benannt.
4. **Runde 2:**
   - Suche mit den geprüften Anfragen.
   - Kandidaten ohne `triedUrls`/`seenFinal` (vorhanden).
   - Wahl per Nummer wie heute (`buildPickMessages`). Neue lesbare Seiten verdrängen am Ende die schwächsten der ersten Runde, wie heute `retryFrom`/`ordered()`.
   - **Höchstens eine Lückenrunde** je Lauf. Eine zweite erst nach Messung.
5. **Ergebnis:**
   - Am Ende friert die App alles **einmal** ein (`freezeBest`). So gibt es eine Quellenliste, dichte Nummern, einen Snapshot und einen Export wie heute. F19/F29 entfallen in dieser Form, weil kein alter Snapshot beteiligt ist.
   - Bringt Runde 2 keine neue lesbare Seite, antwortet das Modell aus Runde 1 wie heute, mit Vermerk „Lückenrunde: keine neuen Seiten“.
6. **Sichtbarkeit:**
   - Die Spur (`WebDeepInfo`) zeigt das Ergebnis der Lückenprüfung (`missing`), die Anfragen mit Herkunft `gap`, verworfene Anfragen mit Grund und die kontaktierten Hosts der Runde 2.
   - Die Zusage-Zeile `petrolChat.webDeepConsent` wird ehrlich angepasst, etwa: „… erstellt bis zu N Suchanfragen in bis zu zwei Runden und darf dafür Begriffe aus gelesenen Seiten verwenden – du siehst sie erst danach“.
   - Bei Cloud-Route sieht das Cloud-Modell auch in der Lückenprüfung die Auszüge. Das tut es in der Antwortphase heute schon, die Datenwegzeile muss es aber nennen.

**C′. Budget und Frist (F08, F18)**
- **Vorläufige Werte bis zur Messung:**
  - Suchen gesamt 3 → 5 (2 Planung + bis zu 3 Lücke inklusive Schutz- bzw. Rückfallsuche);
  - Abrufe 5 → 8;
  - eingefrorene Seiten bleiben bei maxPages 4 und Platzmessung;
  - Recherchefrist lokal 90 → 150 s, Cloud 60 → 100 s, eine durchgehende Frist ab Start.
- Die Lückenprüfung zählt in die Frist. Startet die Lückenrunde nach Fristablauf nicht, kommt der Vermerk `limited: 'gap-deadline'`.
- Alle Modell-, Such- und Abrufaufrufe hängen am selben `research.signal` (wie heute). Ein Stopp bricht ab.
- **Messung je Phase P50/P95** (Planung, Runde 1, Lückenprüfung, Runde 2, Antwort), getrennt nach lokal und Cloud. Danach werden die Werte festgelegt.

**D′. Messung vor Freigabe (F11, F20, F30)**
- **Gepaart:** heute „gründlich“ gegen „gründlich mit Lückenrunde“, gleiche Fragen, mindestens 3 Wiederholungen, lokal (qwen3.8) und eine Cloud-Route.
- **Fragen:**
  - die 15 Fragen aus `chat-gruendliche-suche-messung.md`;
  - 6–8 Fragen „Liste mit Jahr/Datum/Preis“, darunter der Parfüm-Fall in Originalschreibweise „von2023 bis 2026“;
  - Fälle mit vollständiger Antwort schon in Runde 1 (die Lückenrunde soll nicht laufen);
  - widersprüchliche Seiten.
- **Sicherheitsfälle offline mit Fixture-Suche und Fixture-Seiten (Harness, nicht echtes Web):** Seite mit Anweisung „suche nach …“, mit URL oder E-Mail in Namensnähe und mit erfundenem Namen. Erwartet: Die Herkunftsprüfung verwirft, nichts geht an den Suchdienst außer Wörtern aus Frage und Auszug.
- **Bewertung blind:**
  - korrekte belegte Teilangaben je Teilfrage gegen unabhängige Sollwerte;
  - F/Q je Risikoklasse;
  - verlorene Einschränkungen;
  - falsch ausgelöste und falsch unterlassene Lückenrunden;
  - Abbrüche;
  - P50/P95.
- **Siegerregel:** mehr korrekt belegte Teilangaben und keine Zunahme schwerer Fehler in irgendeiner Risikoklasse. Tempo zählt nicht als Sieg. „Gründlich“ bleibt Opt-in. Fällt die Messung durch, kommt die Lückenrunde nicht.

**Fragen an den Prüfer (Runde 4):**
1. Ist die Herkunftsprüfung je Wort (Frage ∪ Auszüge ∪ Aspektliste) dicht genug gegen Datenabfluss? Lücken etwa durch Zerlegung, Zahlen oder Kombination harmloser Wörter? Ist die Aspektliste ein Schlupfloch?
2. Sollte die Lückenprüfung die Nachsuche nach Fragewörtern ersetzen oder daneben stehen? Wechselwirkung mit `guard`, `retry-plan-failed`, `numbersNotInQueries`.
3. Probehalber einfrieren vor der Lückenprüfung: Die Seiten der Runde 2 verdrängen danach Seiten der Runde 1. Kann die Endliste die Belege verlieren, auf die sich die Lückenprüfung stützte, etwa die Duftnamen?
4. Reichen die vorläufigen Budgets, und wie verhindert man, dass die Lückenrunde bei einfachen Fragen unnötig Zeit kostet (`complete: true` zu selten)?
5. Was muss an Spur, Export und Zusage-Zeile geändert werden, damit „du siehst sie erst danach“ wahr bleibt?
6. Ist der Fixture-Harness für die Sicherheitsfälle realistisch, und was fehlt am Messdesign?

### Runde 5 (26.10.2026): verbindliche Bauregeln für B′ nach F32–F41

Nutzerfreigabe: Die Lückenrunde wird hinter einem Schalter gebaut, standardmäßig aus, nur für die Messung. Freigegeben wird sie erst nach D′. Codex prüft danach den Code, keine weitere Papierrunde. Es gelten B′/C′/D′ aus Runde 4 mit diesen Änderungen:

1. **Anlass statt Pflicht (F39):** Die Lückenprüfung startet nur bei einem deterministischen Anlass.
   - Die Frage fragt nach einer Liste oder Mehrzahl („welche“, „alle“, „Liste“, Plural mit Zeitraum) oder hat mehrere Teilfragen.
   - Oder eine Zahl bzw. ein Jahr der Frage fehlt in den Auszügen (`checkQuestionTerms`).
   - Oder es gibt null lesbare Seiten (dann nur Regel 2).
   - Sonst wird nicht geprüft. Die Spur sagt dann „keine Lückenprüfung (kein Anlass)“, und verpasste Lücken werden in D′ gezählt.
2. **Feste Reihenfolge der Suchplätze (F35/F36):**
   1. Null lesbare Seiten: der heutige Weg unverändert, also Retry-Plan bzw. deterministischer Stichwort-Rückfall. **Keine** Lückenprüfung ohne Auszüge.
   2. Zahlenschutz (`guard`): Er greift wie heute, sobald eine Zahl der Frage in Anfragen **und** Auszügen fehlt, und belegt einen Platz vor den Lückenanfragen.
   3. Die geprüften Lückenanfragen bekommen den Rest der Suchplätze (höchstens 3, insgesamt 5).
   - `complete: true` bei null Auszügen wird verworfen. Endgründe stehen getrennt in der Spur: `gap-invalid`, `gap-complete`, `gap-deadline`, `gap-budget`, `gap-no-new`.
   - Die heutige Nachsuche nach fehlenden **Wörtern** bleibt erhalten, solange der Schalter aus ist. Mit Schalter ersetzt die Lückenprüfung sie nur in den Fällen, in denen Regel 1 greift. Ob sie sie ganz ersetzt, entscheidet D′.
3. **Herkunftsprüfung ehrlich benannt (F34):** Die Prüfung je Wort ist eine **Obergrenze gegen Datenabfluss**, kein Schutz gegen Injection. Eine präparierte Seite kann die Suche lenken. Das bleibt so dokumentiert und in D′ als Qualitätsfall gezählt.
   - Die Spur zeigt je Lückenanfrage, aus welchem Auszug (Quellennummer und Host) die fremden Wörter stammen.
   - Die Zusage-Zeile nennt vorab: „darf dafür Wörter aus gelesenen Seiten an {provider} schicken“.
4. **Planungsquellen bleiben in der Endliste (F37):** Die Seiten, aus deren Auszug Wörter einer **gesendeten** Lückenanfrage stammen, sind beim Einfrieren reserviert.
   - Die neuen Seiten der Runde 2 verdrängen nur die übrigen Seiten der Runde 1.
   - Passen reservierte und mindestens eine neue Seite nicht zusammen, kommt die Teilantwort aus Runde 1 mit Vermerk `gap-no-room`. Es wird nicht still gekürzt.
5. **Eigenes Abrufbudget für die Lückenrunde (F38):** Runde 1 darf höchstens 5 Abrufe beginnen, die Lückenrunde hat eigene 4. `pagesWanted` der Lückenrunde ist min(Lückenanfragen + 1, 3), unabhängig vom freien Platz der Runde 1. Erst `freezeBest` reduziert am Ende auf maxPages.
6. **Sprache in der Anzeige (F40):**
   - Die Spur schreibt „Modell vermutet: es fehlt …“ bzw. „Modell hält die Auszüge für ausreichend“. „Geprüft“ steht dort nicht.
   - Die neuen Felder in `WebDeepInfo` (Herkunft `gap`, Gründe, `missing`, Herkunft der Wörter) stehen in allen Endzuständen, auch bei Stopp und Fehler.
   - Kopie und Notiz bekommen eine Begrenzungszeile, sobald eine Lückenrunde geplant, verworfen oder durch Frist bzw. Budget beendet wurde.
7. **Tests und Messung (F41):**
   - Die Unit-Tests prüfen, was der Code garantiert: keine URL, E-Mail oder Kennung, keine Wörter außerhalb von Frage, Auszügen und Aspektliste, keine Suche nach Stopp oder Frist, Abrufziele nur aus Suchtreffern, Reihenfolge der Suchplätze, Reservierung der Planungsquellen.
   - Eine „präparierte Seite lenkt die Suche“ ist ein **negativer Qualitätsfall** in D′, kein Sicherheitstest.
   - In D′ starten die gepaarten Läufe von eingefrorenen Runde-1-Treffern und -Seiten (Aufzeichnung), damit Vorher und Nachher dasselbe sehen. Es gibt genug Wiederholungen für P95, getrennt nach lokal und Cloud.
8. **Schalter:** ein `uiSettings`-Schlüssel (Main liest `ui-settings.json`), standardmäßig aus, sichtbar nur in den Einstellungen unter „Experimentell“. Ohne Schalter ändert sich am heutigen „gründlich“ nichts. Das ist der Vergleichsarm für D′.

### Runde 6 (26.10.2026): Code-Prüfung — Recherche-Schleife statt Lückenrunde

**Kurswechsel (Nutzerentscheidung 26.10.2026):**
- Der Nutzer verglich Chat und Notiz-Agent. Der Agent löste die Parfüm-Frage mit seiner Werkzeugschleife (web_search/web_fetch). Der Chat mit fester Rohrleitung, Hinweisen und Lückenrunde nicht.
- Gebaut ist jetzt eine **modellgeführte Recherche-Schleife** für den Chat. Nach GUI-Tests (Marin-Mountainbikes, Marin-E-Bikes) schrieb der Nutzer: „genau so wie sie sein soll“, und machte sie zum **Standard**.
- **Die Lückenrunde (Runde 4/5) ist wieder ausgebaut**: `petrolDeepSearch.ts` steht auf dem Stand von HEAD, nur zwei Begrenzungsgründe kamen dazu. Die Hinweise aus Runde 1–3 bleiben für Modelle ohne Werkzeuge und für ausgeschaltete Schleife.

**Zu prüfender Code (uncommittet):**
- `app/src/main/llm/petrolWebLoop.ts` (neu), Tests in `petrolWebLoop.test.ts`:
  - Werkzeuge `web_search` (Treffer nummeriert) und `web_fetch` (nur per Nummer, nie per URL);
  - Grenzen im Main: 5 Suchen, 8 Abrufe, 12 Runden, Frist 120/180 s;
  - Rahmung als UNTRUSTED;
  - Ende mit `{"use": [...]}` → Reihenfolge fürs Einfrieren;
  - Rückfall `no-tools`, wenn der erste Aufruf scheitert oder kein Werkzeug aufgerufen wird.
- `app/src/main/index.ts`, `petrol-chat-web`:
  - `loopOn` (`ui.petrolWebLoop !== false`) läuft über den Zweig `deep`;
  - `loopChat` mit `chatWithTools` über denselben Modellweg (Cloud über `resolveCloudChatOptions`, LM Studio, Ollama mit `numCtx`/`ollamaThink: false`, `withOllamaActivity`);
  - Rückfall auf `runDeepResearch` mit `loop-fallback`;
  - `numbersOnly` für den Wörterabgleich in der Schleife.
- `app/src/shared/webChat.ts`:
  - `canonNumber` und `withoutZeroFraction`: Preis-Fehlalarm „$5,199“ gegen „$5,199.00“ bzw. „5199 USD“. Tests „Beträge in verschiedenen Schreibweisen“;
  - `WebDeepInfo.loop` und die neuen `limited`-Gründe.
- Renderer:
  - `PetrolChat.tsx`: `webLoopOn` → kein Schalter schnell/gründlich, keine Satz- bzw. Themenhinweise, Zusage-Zeile `webLoopConsent`;
  - Einstellungen: Schalter in der Webrecherche-Karte;
  - `uiStore.petrolWebLoop` mit Standard `true`.

**Fragen an den Prüfer:**
1. **Sicherheit der Schleife:**
   - Kann das Modell eine URL einschleusen, die der Suchdienst nicht geliefert hat?
   - Sind die Grenzen dicht, auch bei mehreren Werkzeugaufrufen in einem Zug und bei Stopp mitten im Zug?
   - Gelangt Seitentext ungerahmt in den Verlauf?
   - Was geht in einer Cloud-Route an den Anbieter, und stimmt die Zusage-Zeile damit überein?
2. **Rückfall:** Ist der Rückfall `no-tools` korrekt, wenn das Modell im ersten Zug antwortet, aber Werkzeuge könnte? Wird die Frist für die Schleife und danach für `deepRun` doppelt verbraucht?
3. **`canonNumber`:** Liefert die Regel „eine Dreiergruppe nach Komma = Tausender“ falsche Entwarnungen, also eine erfundene Zahl, die durchkommt? Schadet sie anderswo, etwa bei Uhrzeiten, Versionen oder deutschen Dezimalzahlen?
4. **Standard an:**
   - Fehlt der Schlüssel in alten Profilen, gilt an. Ist das in Main und Renderer konsistent?
   - Ändert sich damit etwas für Nutzer lokaler Modelle ohne Werkzeuge (Zeit, Fehlermeldungen)?
5. **Ergebnisform:** Spur, Anzeige, Export, „Hiermit weiterfragen“ und Snapshot mit Schleifenergebnis: Passt `entries`/`index`/`hits` zu dem, was `freezeBest` und die Anzeige erwarten?

## Kontext/Anker

- Warnung: `app/src/shared/webChat.ts:334` (`CHATTY_REQUEST`), `looksConversational` direkt darunter. Tests stehen in `app/src/shared/webChat.test.ts`.
- Hinweis für die gründliche Suche bei kurzen Nachfragen gibt es schon:
  - `app/src/shared/webChatDeep.ts` (`looksLikeBareFollowUp` ca. Z. 308, `previousWebQuestion`, `withPreviousQuestion` ca. Z. 332);
  - UI in `app/src/renderer/components/Agent/PetrolChat.tsx:123` und `:725`.
  - `withPreviousQuestion` schreibt die vorige Frage sichtbar in den Entwurf. Erweitern oder ersetzen?
- Planung: `app/src/main/llm/petrolDeepSearch.ts:82` (`buildPlanMessages`), Aufruf `:278`, Nachsuche `:334`. `triedUrls` steht in `:149`, `:246`, `:355` (heute nur innerhalb eines Laufs).
- Angebot für die schnelle Suche: `PetrolChat.tsx:134` (`lastSentWebQuery`), `:143` (`takePreviousQuery`), Schaltflächen bei `:741` und `:770`. Die Warnzeile steht bei `:157` (`webQueryChatty`).
- IPC `petrol-chat-web` in `app/src/main/index.ts` (Zweig `deep`, `runDeepResearch`-Aufruf), Snapshots in `main/llm/petrolWebSnapshots.ts`, Thema früherer Fragen über `petrolChatPrompt.ts` (`webTopicsBlock`) und `sanitizeWebTopics`.
- Vorgeschichte: `chat-gruendliche-suche.md` (Entwurf, F01–F44), `chat-gruendliche-suche-messung.md` (Messung, F45–F50, Probe), `chat-suchwoerter-vorschlag.md` (F07 vorige Suchwörter, F08 gesendet wird, was im Feld steht), `chat-webthema-im-verlauf.md`.

- Runde 2 (2b + Lückensuche):
  - Lückensatz-Erkennung: `app/src/shared/webChat.ts:863` (`isGapStatement`), wirkt nur bei `refs.length === 0` in `sentenceExtras` `:982`/`:987`.
  - Snapshot nur bei zitierter Antwort: `app/src/main/index.ts:7140`. Endgültige URL in den Quellen: `app/src/shared/webChat.ts:785`. Ausschluss nur exakt: `app/src/shared/webChatDeep.ts:150`.
  - Nachsuche nach fehlenden Fragewörtern: `app/src/main/llm/petrolDeepSearch.ts:319` und `checkQuestionTerms`. Budget: `app/src/shared/webChatDeep.ts:14` (`DEEP_LIMITS`).
  - Einfrieren/Platz: `freezeBest` in `app/src/main/index.ts:6957`, `freezeWebSourcesToFit`. Nachfrage-Auszüge: `app/src/main/llm/petrolWebFollowUp.ts`.
  - Runde-1-Umsetzung (uncommittet): `offerPreviousTopic`/`asksForMorePages` in `app/src/shared/webChatDeep.ts`, `CHATTY_LOOK` in `app/src/shared/webChat.ts`, Anzeige `topicHint` in `app/src/renderer/components/Agent/PetrolChat.tsx`.

## Codex-Findings

### F01 — Die Satzwarnung erfasst die Beispiele nicht zuverlässig
Schwere: mittel  
Stelle: app/src/shared/webChat.ts:334, app/src/shared/webChat.ts:350, app/src/renderer/components/Agent/PetrolChat.tsx:157  
Status: [OFFEN]  
`looksConversational` erkennt derzeit weder „Schaue bitte auf weiteren Seiten“ noch „look at more pages“. Eine Ergänzung mit `\b` nach „mal“ würde „Guck mal-Reihe“ fälschlich treffen (Bindestrich ist eine Wortgrenze); ohne Wortgrenze träfe „Schauinsland“. Zudem wird `webQueryChatty` nur bei der schnellen Suche angezeigt: dieselbe Eingabe in „gründlich“ erhielte keinen Warnhinweis. Die Warnung darf als Suchqualitätshinweis nicht suggerieren, das Thema sei damit ergänzt.  
Vorschlag: Wort-/Partikelgrenzen einschließlich Bindestrich und englischer Formulierungen an positiven und negativen Beispielen testen; „Schauinsland Wetter“, „Guck mal-Reihe“, eigenständige Titel und lange Sätze ausdrücklich prüfen. Warntext auf die wörtliche Schnellsuche begrenzen; bei „gründlich“ den gesonderten Themenhinweis anbieten.

### F02 — Die bestehende Nachfragehilfe übersieht gerade diesen Fall
Schwere: hoch  
Stelle: app/src/shared/webChatDeep.ts:301, app/src/shared/webChatDeep.ts:308, app/src/renderer/components/Agent/PetrolChat.tsx:123, app/src/renderer/components/Agent/PetrolChat.tsx:725  
Status: [OFFEN]  
„Schaue bitte auf weiteren Seiten“ hat keinen der `BARE_START`-/`BARE_REF`-Marker. Auch „andere Quellen bitte“ und „look for more sources“ fallen durch. Der vorhandene Klick zum sichtbaren Ergänzen der Vorfrage erscheint daher nicht, obwohl genau dieser Weg das Thema heute in die Planung bringen könnte. Eine bloße Erweiterung der Suchwortwarnung löst das nicht.  
Vorschlag: Eigene, nur hinweisende Erkennung für die Bitte um weitere Seiten in Deutsch und Englisch; Klick zeigt die konkrete vorige Frage und fügt sie sichtbar hinzu oder aktiviert eine ebenso sichtbare, ausdrücklich gebundene Themenübergabe. Eigenständige Fragen mit „weitere Seiten“ dürfen weiter ohne Klick gesendet werden.

### F03 — Vorfrage und Ausschlussliste haben derzeit keinen gemeinsamen Main-Anker
Schwere: hoch  
Stelle: app/src/main/llm/petrolWebSnapshots.ts:12, app/src/main/llm/petrolWebSnapshots.ts:31, app/src/main/index.ts:7137, app/src/shared/webChatDeep.ts:319  
Status: [OFFEN]  
Der Snapshot enthält nur Auszüge, keine Nutzerfrage; er wird nur bei mindestens einer zitierten Quelle angelegt. `previousWebQuestion` sucht dagegen die letzte passende Frage im Renderer-Verlauf und verlangt lediglich einen nicht gestoppten, nicht fehlerhaften Antwortwechsel. Dadurch kann die gewählte Frage zu einem anderen Weblauf gehören als die auszuschließenden Snapshot-URLs; bei einer fertigen Antwort ohne Zitat gibt es gar keine Snapshot-Kennung. Renderer-Text mit `sanitizeWebTopics` zu rahmen würde seine Herkunft nicht beweisen.  
Vorschlag: Für neue Suchen im Main einen Gesprächsdatensatz mit ursprünglicher Nutzerfrage, gelesenem URL-Satz, Sender- und Scope-Bindung halten; der Renderer sendet nur eine opake Kennung. Den Fall ohne nutzbaren Datensatz als nicht verfügbare Themenübernahme anzeigen, statt still irgendeine ältere Frage zu nehmen.

### F04 — Exakte URL-Gleichheit verhindert erneutes Lesen nicht
Schwere: hoch  
Stelle: app/src/shared/webChatDeep.ts:150, app/src/shared/webChatDeep.ts:158, app/src/main/llm/petrolDeepSearch.ts:307, app/src/main/llm/petrolDeepSearch.ts:355, app/src/shared/webChat.ts:780  
Status: [OFFEN]  
`mergeCandidatesRoundRobin` schließt nur exakte normalisierte Treffer-URLs aus; gespeicherte Quellen tragen dagegen die **Zieladresse nach Weiterleitung**. Ein Treffer mit alter Weiterleitungsadresse, Trackingparametern oder alternativer Pfadschreibweise wird erneut abgerufen. Beim zweiten Suchlauf ist zudem nur `triedUrls` dieses Laufs im Filter. Eine Renderer-Liste als Ausschluss darf niemals direkt als Abrufziel oder ungeprüfte Ergänzung der Trefferliste dienen.  
Vorschlag: Main-eigene Kennung zu beiden Adressen (angefragte und endgültige URL) des Vorlaufs speichern; vor jedem Abruf gegen diese Menge prüfen, Weiterleitungen nach Abruf erneut als Duplikat markieren. Renderer-Daten nur als Auswahl einer Main-seitig gebundenen Menge akzeptieren; Ausschluss stets als Schnitt/Abzug von Suchanbieter-Treffern, nie als neue URL-Quelle.

### F05 — „Keine neuen Seiten“ ist noch kein eigener Endzustand
Schwere: mittel  
Stelle: app/src/main/llm/petrolDeepSearch.ts:225, app/src/main/llm/petrolDeepSearch.ts:307, app/src/main/llm/petrolDeepSearch.ts:319, app/src/main/index.ts:7034  
Status: [OFFEN]  
Wenn ein künftiger Ausschluss alle Kandidaten entfernt, liefert `pickAndFetch` null; die Nachsuche kann erneut planen, und am Ende wird `nothing-readable` ausgegeben. Dieser Zustand unterscheidet nicht „alle Treffer schon gelesen“ von Suchausfall, Abruffehlern und wirklich unlesbaren neuen Seiten. Die beabsichtigte ehrliche Meldung kann aus dem bestehenden Ergebnis nicht abgeleitet werden.  
Vorschlag: Anzahl und Grund der ausgeschlossenen Treffer je Runde erfassen, Nachsuche nur bei verbleibendem Budget zulassen und einen eigenen Endgrund „keine neuen Seiten unter den Treffern“ bis Anzeige und Export tragen.

### F06 — Unsichtbarer Planungskontext widerspräche der Sende-Regel
Schwere: hoch  
Stelle: app/src/main/llm/petrolDeepSearch.ts:82, app/src/main/llm/petrolDeepSearch.ts:98, app/src/main/index.ts:6936, app/src/renderer/components/Agent/PetrolChat.tsx:721  
Status: [OFFEN]  
Der Planungsaufruf erhält derzeit nur Frage und Datum; bei Cloud-Modellen läuft auch er über den gewählten Modellweg. Eine neue, nur intern angehängte Vorfrage ginge somit an die Cloud, ohne im Eingabefeld oder in der Datenwegzeile sichtbar zu sein. Die bisherige `withPreviousQuestion`-Aktion schreibt sie dagegen ausdrücklich in den Entwurf. Eine nachträgliche Spur allein genügt für die Regel „gesendet wird, was der Nutzer sieht“ vor dem Senden nicht.  
Vorschlag: Themenübernahme nur per Klick auf eine Anzeige mit ausgeschriebener Vorfrage; den tatsächlich an die Planung gegebenen Text vor Sendung sichtbar und bearbeitbar halten oder die unveränderte Frage sichtbar im Entwurf ergänzen. Cloud-Hinweis muss auch die Planungsphase umfassen.

### F07 — Nur die Planung mit der Vorfrage zu füttern verliert das Thema vor der Antwort
Schwere: hoch  
Stelle: app/src/main/llm/petrolDeepSearch.ts:278, app/src/renderer/utils/chatHistory.ts:19, app/src/main/index.ts:7103  
Status: [OFFEN]  
Webfrage und Webantwort werden aus dem Modellverlauf entfernt. Nach der Planung baut der Main den Antwortprompt erneut aus `question` und den frisch eingefrorenen Auszügen. Bleibt `question` „Schaue bitte auf weiteren Seiten“, fehlt dem Antwortmodell die ursprüngliche Sachfrage; aus zufällig passenden Seiten kann es eine plausible, aber andere Antwort erfinden. `webTopics` ist nur ein Themenvermerk und keine eindeutige Bindung an den gewählten Vorlauf.  
Vorschlag: Die sichtbare kombinierte Nutzerfrage auch für Seitenauswahl, Nachsuche, Budget, Antwortprompt und Quellenprüfung verwenden; alternativ dieselbe gebundene Vorfrage als klar bezeichnetes Thema in **beiden** Modellphasen führen, ohne alte Antwort oder Auszüge mitzuschicken.

### F08 — Acht bis zehn Abrufe passen nicht in den jetzigen Laufvertrag
Schwere: hoch  
Stelle: app/src/shared/webChatDeep.ts:14, app/src/shared/webChatDeep.ts:20, app/src/shared/webChatDeep.ts:31, app/src/main/llm/petrolDeepSearch.ts:232, app/src/main/llm/petrolDeepSearch.ts:319, app/src/main/index.ts:6929  
Status: [OFFEN]  
Der Lauf erlaubt insgesamt fünf begonnene Abrufe und fünf gewählte Treffer; die Nachsuche verbraucht Rest davon. Die 60-/90-Sekunden-Frist umfasst bisher Planung bis Abruf, und `maxPagesForPlace` begrenzt nur das **Einfrieren** auf den Platz des Antwortmodells. Für 8–10 Abrufe plus lokale Einbettung fehlen getrennte Grenzen für Auswahl, Abrufe, Embedding-Aufrufe und Restzeit. Einfach `fetches` hochzusetzen kann die Nachsuche verdrängen oder nach Frist/Stopp noch ein Embedding abwarten.  
Vorschlag: Feste Gesamt- und Phasenbudgets samt Restreserve für die Nachsuche definieren; Einbettung an dasselbe Recherche-Abbruchsignal binden, vor jedem Start Frist/Restbudget prüfen und nach Frist keine neuen Quellen ergänzen. Nur die 3–4 ausgewählten Auszüge in `freezeBest` und die echte Platzmessung geben.

### F09 — Ein Ähnlichkeitswert ist kein Beleg für richtige Fakten
Schwere: hoch  
Stelle: app/src/shared/rag/similarity.ts:16, app/src/main/index.ts:7026, app/src/main/index.ts:7134  
Status: [OFFEN]  
Kosinus-Ähnlichkeit misst thematische Nähe, nicht ob eine Seite das richtige Jahr, die gefragte Person oder eine wesentliche Einschränkung trägt. Ein thematisch passender, aber falscher Auszug kann hoch rangieren; eine Primärquelle mit kurzer Antwort kann unter eine Schwelle fallen. Der bisherige Wörterabgleich ist nur Anzeige/Nachsuche, die Satzprüfung erst nach der Modellantwort. Die Formulierung „passte nicht zur Frage“ und ein nackter Score würden eine Faktenprüfung vortäuschen. Die Vault-Untergrenze 0,50 ist auf diese Webauszüge nicht übertragbar.  
Vorschlag: Schwelle an gelabelten Webauszügen pro Fragetyp und Modellversion kalibrieren, mit Gegenbeispielen für Zahlen, Jahre, Negationen und kurze Primärquellen. Anzeige als „semantisch weniger ähnlich“ statt „unpassend“; Modellzitate und bestehende Satzprüfung bleiben nötig.

### F10 — Einbettung kann einen anderen Text beurteilen als das Antwortmodell
Schwere: mittel  
Stelle: app/src/shared/rag/similarity.ts:14, app/src/shared/rag/similarity.ts:56, app/src/main/index.ts:6942, app/src/main/index.ts:6966, app/src/main/rag/embed.ts:72  
Status: [OFFEN]  
Der bestehende RAG-Helfer `prepareTextForEmbedding` schneidet nach 4000 Zeichen ab, während `freezeBest` Seiten erst mit eigenem Budget in Auszüge verwandelt. Bei langen Seiten kann die relevante Passage im Modell-Auszug, aber nicht im bewerteten Text liegen oder umgekehrt. `embedText` sendet den Klartext als `prompt` an **lokales** Ollama und erhält erst danach den Vektor; „nur ein Vektor“ beschreibt den Datenweg unzutreffend.  
Vorschlag: Exakt den für die Antwort vorgesehenen, vorbereiteten Auszug oder gleich geschnittene Teilstücke bewerten und die Textgrenze dokumentieren; UI/Doku klar sagen, dass Seitentext lokal an Ollama geht. Ohne nachweislich lokales installiertes Einbettungsmodell den Filter sichtbar auslassen oder die Stufe gezielt sperren, nie still auf Cloud-Embedding umstellen.

### F11 — Die vorgeschlagene Messung kann einen schädlichen Filter zum Sieger machen
Schwere: mittel  
Stelle: docs/codex-collab/chat-gruendliche-suche-messung.md:21, docs/codex-collab/chat-gruendliche-suche-messung.md:27, docs/codex-collab/chat-gruendliche-suche-messung.md:251  
Status: [OFFEN]  
Die frühere Auswertung hatte strittige K-/F-Werte; nach einheitlicher strenger Wertung verfehlte „gründlich“ die eigene Siegerregel, weshalb kein Standardwechsel folgte. „Mehr Treffer **oder** etwa 20 % schneller“ erlaubt nun einen Sieg allein über Tempo, obwohl Schritt 3 Fehlverwerfungen und schwere Fehler erhöhen könnte. Dieselben 15 Fragen plus zwei Fehlseiten prüfen weder eine Ähnlichkeitsschwelle noch Ausfälle ohne lokales Modell ausreichend.  
Vorschlag: Vorher eine gelabelte Kalibriermenge und getrennte Blind-Testmenge mit relevanten/irrelevanten, kurzen und widersprüchlichen Quellen anlegen; gepaarte Vorher/Nachher-Läufe nach K, F, Q, Totalausfall, falschem Ausschluss und Zeit auswerten. Erfolg nur bei mehr belegten richtigen Antworten ohne Zunahme schwerer Fehler je Risikoklasse, nicht allein wegen Tempo.

### F12 — Themenklick ändert eine bereits gesetzte Schnellsuche nicht
Schwere: hoch  
Stelle: app/src/renderer/components/Agent/PetrolChat.tsx:127, app/src/renderer/components/Agent/PetrolChat.tsx:129, app/src/renderer/components/Agent/PetrolChat.tsx:162, app/src/renderer/components/Agent/PetrolChat.tsx:285  
Status: [OFFEN]  
F06/F07 tragen für „gründlich“ und für eine schnelle Suche ohne eigenes Suchfeld: `withPreviousQuestion` macht die Vorfrage im Entwurf sichtbar. Sobald `scope.webQuery` durch „Suchwörter ändern“, „Stichwörter verwenden“ oder „vorige Suche übernehmen“ gesetzt ist, ändert `addPreviousTopic` aber nur `draft`; die schnelle Suche sendet weiterhin `webQueryNorm` aus dem unveränderten Suchfeld. Der Themenhinweis verschwindet, weil der Entwurf mit der Vorfrage beginnt; die wörtliche Warnung kann damit ebenfalls unterdrückt sein, obwohl dem Suchanbieter das Thema weiterhin fehlt.  
Vorschlag: Beim Klick in der schnellen Suche den tatsächlich gesendeten Suchfeldtext sichtbar mit der Vorfrage aktualisieren oder den Themenklick erst nach Rücksetzen/Bestätigen des Suchfelds zulassen. Test mit geöffnetem Suchfeld und abweichendem `webQuery` bis zum IPC-Argument.

### F13 — Die neue Hinweisregel bindet eigenständige Fragen an das falsche Thema
Schwere: mittel  
Stelle: app/src/shared/webChatDeep.ts:315, app/src/shared/webChatDeep.ts:323, app/src/shared/webChatDeep.ts:332, app/src/shared/webChatDeep.ts:346  
Status: [OFFEN]  
F01/F02 sind für die dokumentierten Beispiele umgesetzt; `CHATTY_LOOK` trennt „Schauinsland“ und „Guck mal-Reihe“. `asksForMorePages` prüft aber nur höchstens zehn Wörter plus „weitere/andere Seiten/Quellen“ irgendwo im Satz. „Welche anderen Quellen erklären die Anmeldung in Marburg?“ ist eine selbständige Frage und erhält trotzdem das Angebot, die möglicherweise völlig andere vorige Webfrage vorzusetzen. Umgekehrt fällt „Kannst du bitte noch auf anderen aktuellen amtlichen Seiten dazu nachsehen?“ wegen elf Wörtern aus beiden neuen Hilfen. `previousWebQuestion` nimmt zudem die letzte beantwortete Webfrage, nicht zwingend die letzte sichtbare Antwort.  
Vorschlag: Nur bei erkennbar rückbezüglicher Bitte den Themenhinweis anbieten; eigenständige Subjekt-/Objektfragen und längere Paraphrasen als Gegenbeispiele testen. Die konkret einzufügende Vorfrage im Hinweis selbst sichtbar machen, nicht nur im `title` des Knopfs.

### F14 — Zitierte Verneinung ist kein belastbarer Lückenauslöser
Schwere: hoch  
Stelle: app/src/shared/webChat.ts:855, app/src/shared/webChat.ts:863, app/src/shared/webChat.ts:982, app/src/shared/webChat.ts:986  
Status: [OFFEN]  
Die heutige Lückenmarke gilt absichtlich nur für unzitierte Sätze. `isGapStatement` prüft Oberflächenwörter wie „Quelle“ und „nicht“, nicht die Bedeutung. Auf zitierte Sätze ausgedehnt würde etwa „Die Quelle bestätigt, dass die Regel für Vereine nicht gilt [1]“ oder „Die Seite nennt keine Pflicht für Vereine [1]“ als fehlende Recherche missverstanden; umgekehrt kann die echte Lücke „Eine verlässliche Liste ist aus [1][2] nicht möglich“ ohne das Wort „Quelle/Seite“ durchfallen. Ein kleiner Modellaufruf, der allein die vorige Antwort als Wahrheit übernimmt, würde deren Halluzinationen zum Suchauftrag erheben.  
Vorschlag: Zunächst nur einen **optionalen** Lückenknopf bei eng erkannten Formulierungen anbieten; vor dem Senden Nutzerfrage und eingefrorene Auszüge heranziehen, den konkreten fehlenden **Frageaspekt** sichtbar zeigen. Modell-JSON höchstens als Vorschlag, mit festem Schema und Validierung gegen Frage/Auszüge; keine automatische Nachsuche aus einem Verneinungswort oder der eigenen Antwort.

### F15 — Auszugsbegriffe werden beim Suchen zu einem neuen Abflusskanal
Schwere: hoch  
Stelle: app/src/main/llm/petrolDeepSearch.ts:82, app/src/main/llm/petrolDeepSearch.ts:98, app/src/main/llm/petrolDeepSearch.ts:191, app/src/main/llm/petrolDeepSearch.ts:205, app/src/main/index.ts:4275  
Status: [OFFEN]  
In der bisherigen Planung stehen nur Nutzerfrage und Datum. Gibt 2b fremde Auszugswörter hinzu, kann eine präparierte Seite den Planer trotz Rahmung zu einer Anfrage mit fremden URLs, eindeutigen Kennungen oder aus Frage/Verlauf übernommenen privaten Wörtern bewegen. `sanitizeUntrustedText` entfernt einige Muster, aber keine semantischen Anweisungen; `parsePlanReply` begrenzt Länge/Duplikate, nicht Herkunft der Wörter. `runSearches` schickt die Modellanfrage unmittelbar an den Suchdienst. Sichtbarkeit **nach** dem Senden verhindert diesen Datenabfluss nicht.  
Vorschlag: Begriffe im Main deterministisch nur aus den tatsächlich eingefrorenen Auszügen extrahieren, eng auf Namen/Sachwörter deckeln und URLs, Domains, E-Mail-Adressen, Kennungen sowie Befehlssätze verwerfen. Suchanfragen vor dem Netzaufruf gegen eine erlaubte Menge aus Nutzerfrage und freigegebenen Begriffen prüfen; bei Abweichung nicht senden. Untrusted-Block im Prompt bleibt zusätzlich, ist keine alleinige Schranke.

### F16 — Vorab-Sichtbarkeit braucht eine echte Sendeschranke
Schwere: hoch  
Stelle: app/src/renderer/components/Agent/PetrolChat.tsx:273, app/src/renderer/components/Agent/PetrolChat.tsx:285, app/src/renderer/utils/i18n/petrolChat.ts:121, app/src/main/llm/petrolDeepSearch.ts:200  
Status: [OFFEN]  
Der bestehende Gründlich-Hinweis sagt ausdrücklich, dass der Nutzer Modell-Suchanfragen erst **danach** sieht. Ein neuer Knopf „Lücke gezielt nachsuchen“ wäre daher keine Zustimmung zu unbekannten, aus fremdem Text abgeleiteten Wörtern beim Suchanbieter oder — bei Cloud-Route — im Planungsmodell. „Mindestens die übernommenen Begriffe“ reicht nur, wenn die tatsächliche Anfrage anschließend auf diese Begriffe begrenzt ist; sonst bleibt die Nutzerregel „gesendet wird, was der Nutzer sieht“ unerfüllt.  
Vorschlag: Vor dem Netzaufruf Frage, konkrete Lücke, ausgewählte Auszugsbegriffe und Datenwege als editierbare Vorschau zeigen; bei freier Modellplanung zusätzlich die fertigen Suchanfragen zur Freigabe anhalten. Ohne zweiten Klick nur streng validierte Anfragen aus den bereits sichtbaren Wörtern senden. Die Suchspur bleibt Beleg des tatsächlich Gesendeten, nicht Ersatz für die Vorab-Anzeige.

### F17 — Recherche-Datensatz und Antwort-Snapshot brauchen verschiedene Voraussetzungen
Schwere: hoch  
Stelle: app/src/main/llm/petrolWebSnapshots.ts:12, app/src/main/llm/petrolWebSnapshots.ts:31, app/src/main/index.ts:7034, app/src/main/index.ts:7137, app/src/main/llm/petrolWebFollowUp.ts:91  
Status: [OFFEN]  
Für 2b müssen angefragte und endgültige URLs auch dann erhalten bleiben, wenn die Antwort **keine** Nummer zitiert; sonst werden dieselben Seiten bei der Lückensuche erneut gelesen. Ein `nothing-readable`-Lauf erreicht die heutige `put`-Stelle überhaupt nicht. „Hiermit weiterfragen“ darf dagegen nur auf tatsächlich eingefrorenen Auszügen beruhen und lehnt einen leeren Snapshot ab. Beides unbesehen in dieselbe Kennung zu legen würde für eine Antwort ohne Zitatanbindung einen scheinbar belegten Nachfrageweg eröffnen oder einen Lauf ohne Auszüge als Snapshot ausgeben.  
Vorschlag: Ein Main-seitiger, an Sender/Scope gebundener Recherche-Datensatz mit Frage und allen **gelesenen** URLs; getrennt davon ein Antwort-Snapshot mit exakt den für diese Antwort eingefrorenen Auszügen und eigener Nutzbarkeit für „Hiermit weiterfragen“. Dieselbe sichtbare Antwort darf beide opaken Kennungen haben. TTL, Tab-Schließen, Stopp und laufende `put`-Races für beide gemeinsam prüfen; der Renderer liefert keine URL-Liste.

### F18 — Vier Abrufe und 45/60 Sekunden decken die Lückenrunde lokal nicht verlässlich
Schwere: hoch  
Stelle: app/src/shared/webChatDeep.ts:14, app/src/shared/webChatDeep.ts:20, app/src/shared/webChatDeep.ts:31, app/src/main/llm/petrolDeepSearch.ts:139, app/src/main/llm/petrolDeepSearch.ts:191, app/src/main/llm/petrolDeepSearch.ts:247  
Status: [OFFEN]  
Der aktuelle Lauf verbraucht mit Planung, bis zu zwei Suchen, Seitenwahl und fünf Abrufen bereits 60/90 Sekunden Recherchefrist. Eine Lückenrunde mit zusätzlicher JSON-Erkennung, Begriffsprüfung, zwei Suchen, vier Abrufen und anschließend neuer Antwort kann bei lokal gemessenen 60–130 Sekunden nicht zuverlässig in 45/60 Sekunden **insgesamt** fertig werden. Eine einfach neu gestartete Frist je Teilschritt würde dagegen das versprochene End-to-End-Limit aufheben; ungebundene Modell-/Netzaufrufe können nach Nutzer-Stopp weiterlaufen.  
Vorschlag: Eine eigene, monotone Recherchefrist ab Klick plus getrennte Antwortphase festlegen, alle Modell-, Such- und Abrufaufrufe an dasselbe Stoppsignal und die verbleibende Frist binden, Starts zählen und Reserve für die gezielte letzte Suche lassen. Bei Fristende mit vorhandenen Seiten nur nach klarer Anzeige fortfahren; ohne neue brauchbare Seite kein Modell mit bloßen alten Auszügen als „Lückensuche“ aufrufen. P50/P95 je Phase vor Wahl der Zahlen messen.

### F19 — Alte und neue Auszüge dürfen nicht still neu gekürzt werden
Schwere: hoch  
Stelle: app/src/shared/webChat.ts:746, app/src/shared/webChat.ts:776, app/src/main/index.ts:6943, app/src/main/index.ts:7134, app/src/main/llm/petrolWebFollowUp.ts:94, app/src/shared/webChat.ts:1027  
Status: [OFFEN]  
`freezeWebSourcesToFit` nummeriert und verteilt das Budget über seine Eingabeliste neu; `Hiermit weiterfragen` verlangt dagegen den **exakt** eingefrorenen alten Auszug. Kombiniert man alte und neue Seiten durch erneutes Einfrieren, können alte Belegstellen verschwinden, obwohl die Anzeige „alte Seite“ suggeriert; behält man alte Nummern und hängt neue an, passt die dichte `[1]…[K]`-Zuordnung für `analyzeCitations` und `withWebFootnotes` nicht mehr automatisch. Bei kleinem Fenster können alte 3–4 Seiten den gesamten Platz belegen und neue Jahresangaben verdrängen.  
Vorschlag: Für jede neue Antwort eine eigene, unveränderliche Quellenliste mit dichter Nummerierung und exakt dem **dieser** Antwort gezeigten Text erzeugen; alte Original-Snapshots unangetastet lassen. Vorab Budget für eine Mindestzahl alter und neuer Auszüge prüfen, Auswahl/Trunkierung je Seite in Anzeige und Export kenntlich machen. Neuer Antwort-Snapshot enthält nur die neue Liste; „Hiermit weiterfragen“ liest genau diese, und Prüfbericht/Fußnoten werden ausschließlich daraus berechnet.

### F20 — Die Messung braucht Fälle, in denen Nachsuchen schadet
Schwere: mittel  
Stelle: docs/codex-collab/chat-nachfrage-weitere-seiten.md:56, docs/codex-collab/chat-nachfrage-weitere-seiten.md:83, docs/codex-collab/chat-gruendliche-suche-messung.md:251  
Status: [OFFEN]  
Der Parfümfall hat eine benannte Lücke und bekannte Zielnamen. Er misst weder falsche Lückenauslöser noch Seiten, die per Prompt-Injection falsche Suchwörter liefern, noch die Gefahr, dass neu gefundene, aber widersprüchliche Datumsangaben eine zuvor ehrliche Lücke in eine falsche Gewissheit verwandeln. Die frühere Messung hatte bereits je nach einheitlicher K-/F-Auslegung verschiedene Siegerurteile. „Lücke geschlossen ja/nein“ allein kann durch eine erfundene vollständige Liste erfüllt aussehen.  
Vorschlag: Vorab gelabelte gepaarte Fälle mit zitierter echter Lücke, echter Negativbehauptung, vollständiger Antwort, fehlendem Namen/Jahr/Preis, widersprüchlichen Seiten, bösartigem Auszug, ausgeschöpftem Budget und Null-Neu-Seiten. Blind bewerten: korrekte **belegte** Ergänzungen pro Teilfrage, falsche Lückenauslöser, F/Q je Risikoklasse, tatsächlich gesendete Begriffe, Abbrüche und P50/P95-Zeit. Standardwechsel nur nach der streng einheitlichen Siegerregel.

### F21 — Nachprüfung F14–F20
Schwere: mittel  
Stelle: docs/codex-collab/chat-nachfrage-weitere-seiten.md:109, docs/codex-collab/chat-nachfrage-weitere-seiten.md:129, docs/codex-collab/chat-nachfrage-weitere-seiten.md:134, app/src/shared/webChat.ts:982  
Status: [OFFEN]  
Die Runde-3-Fassung ist ein Entwurf; der heutige Code bietet keinen der neuen Wege an. Nachprüfung der früheren Befunde am Entwurf:  
- **F14 teilweise:** B1 macht den Lückenauslöser zur bloßen Hervorhebung statt zu einer Suchentscheidung; die angekündigte Regel für zitierte Sätze und ihre Fehlalarme sind offen (`webChat.ts:986`).  
- **F15 teilweise:** B2/B3 entfernen das Planungsmodell, aber „Antwort ∩ Auszug“ ist keine vertrauenswürdige Herkunftsprüfung (`main/index.ts:7134`; F25).  
- **F16 teilweise:** Zwei Klicks erlauben Vorab-Sichtbarkeit; die behauptete Wortherkunft im Main und die Hostanzeige vor der Suche bleiben offen (`petrolDeepSearch.ts:191`; F27/F31).  
- **F17 teilweise:** A trennt Recherche-Datensatz und Antwort-Snapshot richtig, setzt aber begonnene mit gelesenen Abrufen gleich (`webChat.ts:622`; F24).  
- **F18 teilweise:** C benennt eine durchgehende Frist, doch die Zahlen sind ausdrücklich ungemessen und müssen zum bestehenden Abbruchpfad passen (`petrolDeepSearch.ts:139`).  
- **F19 teilweise:** D erhält alte Auszüge unverändert, garantiert mit „eine alte + eine neue“ aber keine ausreichende Sachbasis (`petrolWebFollowUp.ts:94`; F29).  
- **F20 teilweise:** E ergänzt Negativfälle, verlangt für den Klickweg aber nur grüne Sicherheitsfälle, obwohl dieser bereits neue Sachantworten erzeugt (`main/index.ts:7134`; F30).  
Vorschlag: Diese Punkte erst nach einem Codepfad und gezielten End-to-End-Fällen als erledigt markieren.

### F22 — F12-Fix kann das Thema im Suchfeld verdoppeln
Schwere: mittel  
Stelle: app/src/renderer/components/Agent/PetrolChat.tsx:129, app/src/renderer/components/Agent/PetrolChat.tsx:135, app/src/renderer/components/Agent/PetrolChat.tsx:153, app/src/renderer/components/Agent/PetrolChat.tsx:296  
Status: [OFFEN]  
Der eigentliche F12-Fall ist behoben: bei gesetztem `webQuery` ergänzt der Klick nun Entwurf **und** Suchfeld; der IPC erhält `webQueryNorm`. Der Hinweis prüft aber nur den Entwurf. Enthält das Suchfeld die Vorfrage bereits, etwa nach „vorige Suche übernehmen“ oder manueller Eingabe, und der Entwurf lautet noch „Schaue auf weiteren Seiten“, bleibt der Themenknopf sichtbar und stellt die Vorfrage im Suchfeld ein zweites Mal voran. Das kann die 400-Zeichen-Grenze auslösen oder die Schnellsuche verschlechtern. Die neuen Tests prüfen nur die reine Erkennung, nicht diesen UI→IPC-Fall (`webChatDeep.test.ts:107`).  
Vorschlag: Vor dem Voranstellen Entwurf und tatsächlich gesendetes Suchfeld getrennt auf die Vorfrage prüfen; einen Komponententest mit abweichendem, bereits thematischem Suchfeld bis zum IPC-Argument ergänzen.

### F23 — F13-Heuristik verwechselt „bitte“ und „auch“ mit Rückbezug
Schwere: mittel  
Stelle: app/src/shared/webChatDeep.ts:316, app/src/shared/webChatDeep.ts:319, app/src/shared/webChatDeep.ts:328, app/src/shared/webChatDeep.ts:351  
Status: [OFFEN]  
Der Fix nimmt die beiden getesteten Gegenbeispiele richtig. `MORE_PAGES_BACKREF` lässt aber allgemeine Höflichkeits- und Zusatzwörter genügen: „Welche anderen Quellen erklären **auch** die Anmeldung in Marburg?“ oder „Bitte suche andere Quellen zur Anmeldung in Marburg“ ist eigenständig und erhält dennoch das vorige, womöglich sachfremde Thema. Bis vier Wörter gilt sogar ohne Rückbezug „Andere Quellen zur Anmeldung“. Der Hinweis ist nur optional, kann aber einen Laien zu einer schlechteren Suche verleiten; `previousWebQuestion` nimmt weiter die letzte *beantwortete* Webfrage, auch wenn danach eine andere Antwort sichtbar war.  
Vorschlag: Rückbezug enger an „dazu/davon/noch einmal/woanders“ oder einen expliziten Verweis binden, bloße Höflichkeit nicht als Bezug werten; die letzte sichtbare Antwort als Auswahlgrenze prüfen. Tests mit selbständigen Fragen, `bitte` und `auch` ergänzen.

### F24 — Begonnene Abrufe sind weder gelesen noch zuverlässig mit Ziel-URL bekannt
Schwere: hoch  
Stelle: app/src/shared/webChat.ts:622, app/src/shared/webChat.ts:638, app/src/shared/webChat.ts:642, app/src/main/llm/petrolWebChat.ts:141, app/src/main/llm/petrolWebChat.ts:156  
Status: [OFFEN]  
A will **alle begonnenen** Abrufe als „schon gelesen“ ausschließen, auch bei Stopp. `runFetchQueue` zählt den Start vor `fetchOne`; scheitert der Abruf oder greift Stopp/Frist, bleibt nur `{ok:false, reason}`. Dann existiert weder lesbarer Text noch eine endgültige URL. Ein späterer Treffer derselben Seite würde als „schon gelesen“ verschwinden, obwohl die App sie nie auswerten konnte. Umgekehrt kann eine bereits gestartete Weiterleitung nach Stopp keine verlässliche Ziel-URL mehr liefern.  
Vorschlag: Im Recherche-Datensatz `versucht`, `erfolgreich gelesen`, `eingefroren` und `abgebrochen` getrennt halten. Für „schon gelesen“ nur erfolgreich lesbare Ziele ausschließen; bei fehlgeschlagenen/gestoppten Abrufen höchstens angefragte URL als optionalen „bereits versucht“-Hinweis führen. `no-new-pages` nur aus tatsächlich ausgeschlossenen **gelesenen** Treffern ableiten.

### F25 — „Antwort ∩ Auszug“ ist keine Injection-Schranke
Schwere: hoch  
Stelle: app/src/main/index.ts:7132, app/src/main/index.ts:7134, app/src/main/llm/petrolWebPrompt.ts:56, app/src/main/index.ts:4275  
Status: [OFFEN]  
Die Antwort ist Modelltext **aus genau diesen Auszügen**. Eine präparierte Seite kann einen scheinbaren Produktnamen oder einen Suchauftrag als Sachinformation platzieren; wiederholt das Modell ihn, besteht er die Schnittmenge. Der vorhandene Sanitizer entfernt nur bestimmte Syntax und bekannte Befehlsmuster. Die Vorschau und zwei Klicks begrenzen den Datenweg, beweisen aber weder, dass ein Chip ein relevanter Name ist, noch dass er nicht aus einer Injection stammt. „Wörter aus Sätzen mit Imperativ/Anrede“ kann echte Namen aus Beschreibungen ausschließen und indirekte Anweisungen durchlassen.  
Vorschlag: Die Schnittmenge nur als Priorisierung behandeln. Chips als unbestätigte Wörter aus fremden Seiten kennzeichnen, ihren **exakten Auszugskontext** vor dem Klick zeigen und keine vorgewählten Chips ungeprüft senden. Sicherheitsprüfung auf URL/E-Mail/Kennung auf den ursprünglichen Spans vor Tokenzerlegung ausführen; gezielte Tests für indirekte Anweisungen und falsche Entitätsnamen.

### F26 — `questionTerms` liefert im Anlassfall keine verlässliche Fehlangabe
Schwere: hoch  
Stelle: app/src/shared/webChatDeep.ts:210, app/src/shared/webChatDeep.ts:222, app/src/shared/webChatDeep.ts:229, docs/codex-collab/chat-nachfrage-weitere-seiten.md:56  
Status: [OFFEN]  
B2 will „Was fehlt?“ mit Art und Einschränkung aus `questionTerms` vorbelegen. Diese Funktion liefert nur Tokens, keine Rolle oder fehlende Angabe. In der tatsächlichen Frage `von2023 bis 2026` wird `von2023` als alphanumerisches **Wort** statt als Jahr erkannt; auch bei korrekten Leerzeichen lässt sich aus den Tokens nicht ableiten, dass **Erscheinungsdaten je Duft** fehlen und nicht etwa Duftnamen. Damit würde gerade der motivierende Fall eine irreführende Lückenvorlage erhalten.  
Vorschlag: „Was fehlt?“ zunächst leer mit einem verständlichen Beispiel belassen oder nur explizite, syntaktisch sichere Bereiche aus der Frage übernehmen. Den Nutzer die konkrete fehlende Angabe formulieren lassen; die gespeicherte Nutzerfrage bleibt sichtbar daneben. Test mit der Originalschreibweise `von2023 bis 2026` und mit mehreren Teilfragen.

### F27 — Wortmengenprüfung beweist weder Nutzerherkunft noch Suchtreue
Schwere: hoch  
Stelle: app/src/shared/webChat.ts:264, app/src/main/index.ts:6838, app/src/main/index.ts:6853, app/src/shared/webChatDeep.ts:94  
Status: [OFFEN]  
B3 erlaubt zusätzlich „vom Nutzer im Feld getippte Wörter“. Der Main erhält heute nur IPC-Strings; ob ein Wort tatsächlich getippt oder vom Renderer/Seitentext eingesetzt wurde, kann er daraus nicht feststellen. Wird die behauptete Tippmenge ebenfalls vom Renderer geliefert, ist die Prüfung tautologisch. Selbst eine korrekte Mengenprüfung erlaubt, Zahlen, Verneinungen und Zuordnungen **wegzulassen oder umzudrehen**: Aus erlaubten Wörtern „mit oder ohne Speicher 2026“ lässt sich eine Anfrage ohne „ohne“ bauen. Eine optionale Modellplanung würde diesen Prüfaufwand wieder erhöhen, ohne das Kernproblem zu lösen.  
Vorschlag: Den Main nur gegen Main-seitig gespeicherte Chip-Spans und eine explizit freigegebene **vollständige Anfrage** prüfen lassen; editierte Anfrage als neue Nutzerentscheidung behandeln, nicht als technisch bewiesene Wortherkunft. Unverzichtbare Einschränkungen der Frage separat verlangen oder vor Klick 2 sichtbar auf fehlende Zahl/Negation hinweisen. Vorerst kein optionales Planungsmodell.

### F28 — Acht auswählbare Chips passen nicht zu vier Anfragen je Begriff
Schwere: mittel  
Stelle: docs/codex-collab/chat-nachfrage-weitere-seiten.md:116, docs/codex-collab/chat-nachfrage-weitere-seiten.md:120, app/src/shared/webChatDeep.ts:14, app/src/shared/webChatDeep.ts:94  
Status: [OFFEN]  
B2 erlaubt acht abwählbare Chips, baut aber je gewähltem Begriff eine Anfrage und deckelt bei vier. Bei fünf bis acht ausgewählten Namen muss der Entwurf still Namen weglassen, Anfragen zusammenlegen oder das Limit überschreiten. Im Parfümfall entscheidet genau diese Auswahl, ob ein Jahr gefunden wird. Eine nachträgliche Begrenzung beim Senden wäre zusätzlich ein Bruch von „gesendet wird, was der Nutzer sieht“.  
Vorschlag: Höchstens vier Chips zugleich auswählbar machen oder dem Nutzer vor Klick 2 die vier konkret gebauten Anfragen samt sichtbarer Meldung über ausgelassene Chips zeigen; lange Anfragen nicht still auf 120/400 Zeichen kürzen. Auswahlregel und Reihenfolge im Messfall mit mehr als vier Entitäten prüfen.

### F29 — Eine alte und eine neue Seite garantieren keine tragfähige gemeinsame Antwort
Schwere: hoch  
Stelle: app/src/main/llm/petrolWebFollowUp.ts:50, app/src/main/llm/petrolWebFollowUp.ts:94, app/src/shared/webChat.ts:702, app/src/main/index.ts:7134  
Status: [OFFEN]  
D schützt alte Bytes und dichte Nummern, löst aber die Sachabdeckung nicht: Bei vier Düften kann eine alte Seite nur zwei Namen und eine neue nur ein Erscheinungsjahr enthalten. Die Mindestregel „≥1 alt + ≥1 neu“ lässt trotzdem eine scheinbar vervollständigte Antwort zu. Alte vollständige Auszüge können außerdem so viel Kontext belegen, dass für neue nur ein kurzer Ausschnitt bleibt; `applyWebChatBudget` würde alte Seiten normalerweise kürzen, `resolveFollowUp` verbietet das ausdrücklich. Die neue Antwort braucht eine **eigene** Budgetentscheidung, bevor die Quellenliste feststeht.  
Vorschlag: Alte Quellen nach benötigten Entitäten/Teilfragen auswählen, für neue Auszüge vorab einen echten Mindestplatz reservieren und den fertigen Prompt mit `measureWithFollowUpRoom` messen. Wenn die Liste nicht passt, erklären statt alte Auszüge heimlich zu kürzen. Unbelegte Zuordnungen (Name ↔ Jahr) in Antwort, Prüfbericht und Export als Lücke behandeln; der neue Snapshot enthält nur die tatsächlich verwendete, neu nummerierte Liste.

### F30 — Der Klickweg braucht selbst eine Qualitäts-Abnahme
Schwere: mittel  
Stelle: docs/codex-collab/chat-nachfrage-weitere-seiten.md:143, docs/codex-collab/chat-nachfrage-weitere-seiten.md:159, docs/codex-collab/chat-gruendliche-suche-messung.md:251, app/src/main/index.ts:7134  
Status: [OFFEN]  
E verlangt vor dem Bau nur grüne **Sicherheitsfälle** für den Klickweg; die Qualität soll erst für einen automatischen Default entscheiden. Der Klickweg erzeugt aber schon jetzt eine neue Sachantwort mit möglichen falschen Namen/Jahren. Vier bis sechs ähnliche Listenfragen plus Einzelbeispiele reichen zudem nicht für eine belastbare P95-Frist oder für seltene schwere Fehler. „Belegt“ muss gegen die eingefrorenen **alten und neuen** Auszüge sowie unabhängige Sollwerte geprüft werden; der vorhandene `analyzeCitations`-Bericht allein entscheidet das nicht.  
Vorschlag: Auch den Klickweg erst nach gepaarter Qualitätsmessung freigeben: mehrere Wiederholungen je Frage/Route, unabhängige Sollwerte, blind bewertete Teilangaben und F/Q, verlorene Einschränkungen, falsch verworfene URLs sowie Abbruchfälle. P95 aus genügend Läufen getrennt nach lokal/Cloud und Suchanbieter schätzen; Defaultentscheidung bleibt eine zweite Hürde.

### F31 — Neue Hosts lassen sich vor der Suche nicht anzeigen
Schwere: mittel  
Stelle: docs/codex-collab/chat-nachfrage-weitere-seiten.md:121, app/src/main/llm/petrolWebChat.ts:79, app/src/main/llm/petrolWebChat.ts:103, app/src/main/llm/petrolDeepSearch.ts:205  
Status: [OFFEN]  
B2 verspricht vor Klick 2 eine Datenwegzeile mit den Hosts, **die abgerufen werden**. Diese Hosts kennt die App erst nach der Anbietersuche und der Trefferwahl. Eine vorab gezeigte Liste könnte daher nur alte ausgeschlossene Hosts meinen oder eine unzutreffende Zusage sein. Auch das Antwortmodell wird im Klickweg benötigt, sobald neue lesbare Seiten vorliegen; sein konkreter lokaler/Cloud-Weg muss vor dem Netz-Klick erkennbar sein.  
Vorschlag: Vor Klick 2 Suchanbieter, Modellroute und alte ausgeschlossene Seiten/Hosts anzeigen; neue Abrufhosts erst während des Laufs und danach als tatsächlich kontaktiert ausweisen. Den Text „Hosts, die abgerufen werden“ vermeiden.

### F32 — F22 bleibt bei manuell ergänztem Entwurf offen
Schwere: hoch  
Stelle: app/src/renderer/components/Agent/PetrolChat.tsx:125, app/src/renderer/components/Agent/PetrolChat.tsx:129, app/src/renderer/components/Agent/PetrolChat.tsx:135, app/src/renderer/components/Agent/PetrolChat.tsx:296  
Status: [OFFEN]  
`applyPreviousTopic` beseitigt die Verdopplung **beim Klick**: Entwurf und eigenes Suchfeld werden je für sich geprüft (`app/src/shared/webChatDeep.ts:361`; Test `app/src/shared/webChatDeep.test.ts:137`). Der Themenhinweis hängt aber weiterhin allein am Entwurf. Schreibt der Nutzer die vorige Frage selbst sichtbar vor „Schaue auf weiteren Seiten“, während im Schnellsuchfeld noch „weitere Seiten“ steht, verschwindet der Klick. Gesendet werden dann die thematische Frage an das Antwortmodell, aber die alten, themenlosen Suchwörter an den Anbieter. Der pure Helfertest erreicht diesen UI→IPC-Pfad nicht.  
Vorschlag: In der schnellen Suche den Hinweis auch vom **tatsächlich gesendeten** `webQuery` abhängig machen oder bei manueller Entwurfsänderung das separate Suchfeld sichtbar als abweichend markieren. Einen Test mit kombiniertem Entwurf und altem Suchfeld bis zum IPC-Argument ergänzen.

### F33 — F23 hat weiterhin einen Fehlalarm bei ausdrücklich anderem Thema
Schwere: mittel  
Stelle: app/src/shared/webChatDeep.ts:316, app/src/shared/webChatDeep.ts:318, app/src/shared/webChatDeep.ts:332, app/src/shared/webChatDeep.ts:380  
Status: [OFFEN]  
Die neuen Tests belegen, dass „bitte“/„auch“ allein nicht mehr als Rückbezug gelten (`webChatDeep.test.ts:119`). `MORE_PAGES_BACKREF` wird jedoch **vor** der Prüfung auf eigene Sachwörter ausgewertet. „Welche anderen Quellen gibt es **dazu**, wie man in Marburg ein Gewerbe anmeldet?“ erhält deshalb den Hinweis auf die letzte beantwortete Webfrage, auch wenn das Thema im selben Satz ausdrücklich steht. Nach einer späteren sichtbaren Nicht-Web-Antwort kann `previousWebQuestion` zudem auf ein älteres Webthema zeigen. Der Klick bleibt freiwillig, kann eine Laienfrage aber inhaltlich verfälschen.  
Vorschlag: Auch bei Rückbezugswort prüfen, ob ein eigenständiges neues Thema folgt; die letzte sichtbare Antwort als Bezugsgrenze berücksichtigen. Beide Fälle als negative Tests ergänzen.

### F34 — Wortherkunft verhindert gelenkte Suchen aus präparierten Seiten nicht
Schwere: hoch  
Stelle: app/src/main/llm/petrolDeepSearch.ts:82, app/src/main/llm/petrolDeepSearch.ts:191, app/src/shared/webChatDeep.ts:94, app/src/main/index.ts:6966  
Status: [OFFEN]  
Für B′ soll das Lückenmodell gerade fremde Auszüge lesen und daraus Anfragen bilden. Eine präparierte Seite kann „Suche nach Fantomas Geheimliste 2026“ enthalten; jedes Wort einer daraus gebauten Anfrage steht dann im erlaubten Auszug. `parsePlanReply` prüft heute nur Form/Länge/Dubletten/Datum, keine Sachzugehörigkeit. URL-, Domain- und E-Mail-Sperren nehmen diesen Pfad nicht weg, auch nicht die Aspektliste. Die Sicherheits-Fixture in D′ erwartet, dass eine Seite mit „suche nach …“ verworfen wird; eine reine Wortmengenprüfung **kann** das nicht garantieren. Der Suchanbieter erhält zudem nun Seitentext-Begriffe, die er im ersten Planungsaufruf noch nicht sah.  
Vorschlag: Herkunft nur als technische Obergrenze beschreiben, nicht als Injection-Schutz. Fremde Begriffe eng aus sachlichen Spans wählen, Herkunftsauszug und gesendete Anfrage in der Spur verknüpfen, Auswahl auf Relevanz zur Frage prüfen und Seitenanweisungen als Gegenfälle testen. Die Anbietersendung von Auszugsbegriffen vorab offen nennen; `missing` und `complete` des Modells nie als verifizierte Fakten ausgeben.

### F35 — Der Ersatz des Wort-Retry verliert den Rückfall bei null Seiten
Schwere: hoch  
Stelle: app/src/main/llm/petrolDeepSearch.ts:313, app/src/main/llm/petrolDeepSearch.ts:319, app/src/main/llm/petrolDeepSearch.ts:334, app/src/main/llm/petrolDeepSearch.ts:346, app/src/main/index.ts:7034  
Status: [OFFEN]  
Heute löst `usable === 0` eine Nachsuche aus; bei kaputtem Retry-JSON gibt es noch den deterministischen Stichwort-Rückfall. B′ ersetzt diese Logik durch die Lückenprüfung, sagt aber bei kaputtem JSON oder `complete:true` ausdrücklich „keine Lückenrunde“. Das trifft gerade den Fall null lesbare Seiten: Das Modell hat keine Auszüge, um Vollständigkeit zu prüfen, und ein misslungenes JSON würde sofort `nothing-readable` auslösen, obwohl eine zweite Suchanfrage bisher noch möglich war.  
Vorschlag: Den `usable === 0`-Pfad samt deterministischem Rückfall **vor** jeder semantischen Lückenprüfung behalten. `complete:true` bei null Auszügen verwerfen; `invalid`, `timeout`, `complete` und `kein Budget` getrennt in der Spur ausweisen. Das Wort-Retry bei fehlenden Fragebegriffen nur ersetzen, wenn die Messung mindestens dieselbe Treffer- und Fehlerrate zeigt.

### F36 — Die Zahlenschutzsuche hat im Entwurf keine eindeutige Priorität
Schwere: hoch  
Stelle: app/src/shared/webChatDeep.ts:289, app/src/main/llm/petrolDeepSearch.ts:289, app/src/main/llm/petrolDeepSearch.ts:318, app/src/main/llm/petrolDeepSearch.ts:326, app/src/main/llm/petrolDeepSearch.ts:328  
Status: [OFFEN]  
Der heutige `guard` sucht nur, wenn eine Zahl der Frage sowohl in **allen ersten** Modellanfragen als auch in den probeweise eingefrorenen Auszügen fehlt. Steht „2026“ irgendwo auf einer Duftseite, aber kein Erscheinungsjahr je Duft, greift er nicht. B′ erlaubt bis zu drei Gap-Anfragen, ohne zu sagen, ob eine deterministische Schutzsuche vorher einen der drei Plätze reserviert oder nachher noch möglich ist; `numbersNotInQueries` bezieht sich nur auf die erste Planung. Ein unvollständiger Gap-Plan kann somit alle Plätze mit Anfragen ohne gefragtes Jahr verbrauchen.  
Vorschlag: Suchplätze und Reihenfolge fest definieren: null-Seiten-Rückfall, gegebenenfalls Zahlenschutz, dann geprüfte Gap-Anfragen mit dem Rest. Jede Runde gegen die ursprünglichen Zahlen/Zeiträume prüfen; ausgelassene Einschränkungen sichtbar melden und keine Anfrage still durch eine andere ersetzen.

### F37 — Runde 2 kann die Belege ihrer eigenen Suchplanung verdrängen
Schwere: hoch  
Stelle: app/src/main/llm/petrolDeepSearch.ts:158, app/src/main/llm/petrolDeepSearch.ts:162, app/src/main/llm/petrolDeepSearch.ts:166, app/src/main/index.ts:6957, app/src/main/index.ts:7010  
Status: [OFFEN]  
Das Lückenmodell soll Namen aus den probeweise eingefrorenen Seiten verwenden. Nach der Nachsuche sortiert `ordered()` neue lesbare Seiten **vor** den letzten alten; `freezeBest` friert aus dieser neuen Reihenfolge erneut ein. Bei `maxPages` 1 oder 2 kann die alte Seite mit den Duftnamen ganz verschwinden, obwohl ihre Namen die Suchanfragen bestimmt haben. Die Antwort sähe dann nur neue Jahres-Seiten und könnte Namen/Jahre falsch zuordnen; ein einzelner Snapshot und dichte Nummern beheben den Verlust der Sachbasis nicht.  
Vorschlag: Die konkreten alten Quellen, aus deren Auszug Gap-Begriffe übernommen wurden, für die Endauswahl reservieren und den **fertigen** Prompt erneut messen. Passt die nötige alte und neue Basis nicht gemeinsam, nur eine begrenzte Teilantwort oder einen klaren Platz-Abbruch liefern. Prüfbericht, Anzeige und Export müssen ausschließlich die endgültige Liste referenzieren; die Spur nennt verworfene Planungsquellen ausdrücklich.

### F38 — Acht Abrufe ergeben mit der jetzigen Warteschlange höchstens eine neue Gap-Seite
Schwere: hoch  
Stelle: app/src/shared/webChatDeep.ts:14, app/src/main/llm/petrolDeepSearch.ts:225, app/src/main/llm/petrolDeepSearch.ts:247, app/src/main/llm/petrolDeepSearch.ts:310, app/src/main/llm/petrolDeepSearch.ts:355, app/src/main/llm/petrolDeepSearch.ts:356  
Status: [OFFEN]  
Wenn Runde 1 ihre vier nutzbaren Seiten erreicht, setzt die heutige Retry-Logik `slots = max(1, maxPages - usable)` auf **eins**. `runFetchQueue` startet dann höchstens einen neuen brauchbaren Abruf gleichzeitig und beendet die Runde nach einer neuen Seite. Mehr Suchanfragen und ein Abrufdeckel von acht allein ermöglichen also keine gezielte Suche nach mehreren Düften/Jahren. Bei Fehlschlägen kann Runde 1 außerdem alle acht Abrufstarts verbrauchen, weil `pickAndFetch` nur das **Gesamt**budget prüft; eine Reserve für die Lückenrunde ist nicht festgelegt.  
Vorschlag: Getrennte Startbudgets für Runde 1 und Gap-Runde plus Mindestreserve festlegen; `pagesWanted` der Gap-Runde unabhängig vom freien Platz der ersten Runde bestimmen und erst danach endgültig auf `maxPages` reduzieren. Die Zahl neuer nutzbarer Seiten und Verdrängungen in der Spur zeigen; mit vier gefüllten alten Seiten und mehreren Gap-Treffern testen.

### F39 — Jede einfache Frage bezahlt einen zusätzlichen Modellaufruf
Schwere: mittel  
Stelle: app/src/main/llm/petrolDeepSearch.ts:182, app/src/main/llm/petrolDeepSearch.ts:313, app/src/main/index.ts:6935, docs/codex-collab/chat-nachfrage-weitere-seiten.md:179  
Status: [OFFEN]  
B′ prüft nach Runde 1 **immer** per Modell, auch wenn die erste Seite eine einfache Frage klar beantwortet. Lokal kostet schon die Planung und Wahl Modellzeit; die neue Prüfung zählt in die 150-Sekunden-Frist. `complete:true` erspart nur Runde 2, nicht diesen zusätzlichen Aufruf. Ein aggressiver Vorfilter könnte echte Lücken übersehen; der Entwurf nennt dafür noch keine Fehlerrate oder Latenzgrenze.  
Vorschlag: Vorab für vollständige Einzelfragen und mehrteilige Lückenfälle getrennt die Zusatzlatenz und Fehlentscheidungen messen. Entweder die Modellprüfung nur bei klaren Anlässen starten (mehrere Teilfragen, fehlende Pflichtbegriffe/Zahlen, null Seiten) und die verpassten Lücken offen messen, oder den stets anfallenden Aufruf als bewusste Kostenregel akzeptieren; keine ungemessene „schnellere gute Antwort“ versprechen.

### F40 — Neue Spurfelder brauchen dieselbe Wahrheit in Stopp und Export
Schwere: mittel  
Stelle: app/src/shared/webChat.ts:220, app/src/shared/webChat.ts:228, app/src/shared/webChat.ts:235, app/src/renderer/components/Agent/PetrolWebAnswer.tsx:225, app/src/renderer/components/Agent/PetrolWebAnswer.tsx:249, app/src/renderer/components/Agent/PetrolChat.tsx:322  
Status: [OFFEN]  
`WebDeepInfo` kennt weder Herkunft `gap` noch Gründe wie „gap-deadline“, „Prüfung vollständig/ungültig“ und „keine neue Seite“; `WebDeepLine` bildet Herkunft und Begrenzungen über feste Übersetzungs-Maps ab. B′ erwähnt eine neue Spur, aber keine durchgängige Semantik für **geprüft, verworfen, gesendet, abgebrochen**. Der heutige Fußnotenexport übernimmt Antwort, Quellen und Satzwarnungen, jedoch keine Suchspur. Dadurch könnte eine kopierte Gap-Antwort ohne Hinweis auf misslungene oder abgelaufene Gap-Suche vollständiger wirken als im Chat.  
Vorschlag: Typen, Renderer, Übersetzungen und Stop-/Fehler-Endzustände gemeinsam erweitern. In der Anzeige „Modell vermutet Lücke/Vollständigkeit“ statt einer bestätigten Prüfung schreiben; tatsächlich gesendete Anfragen und Fehlgründe auch nach Stopp erhalten. Für Export/Notiz eine knappe Begrenzungszeile mitnehmen, wenn die Gap-Runde geplant, verworfen oder durch Frist/Budget beendet wurde.

### F41 — Die Sicherheits-Fixture verspricht mehr, als der Validator prüfen kann
Schwere: mittel  
Stelle: docs/codex-collab/chat-nachfrage-weitere-seiten.md:214, docs/codex-collab/chat-nachfrage-weitere-seiten.md:221, app/src/shared/webChatDeep.ts:94, app/src/main/llm/petrolDeepSearch.ts:205  
Status: [OFFEN]  
Die Fixture „Seite mit Anweisung `suche nach …` → Herkunftsprüfung verwirft“ wäre bei einer Anfrage aus exakt diesen Seitenwörtern ein **falscher** Test-Orakelwert (F34). Offline-Fixtures können Tokenizer, Stop/Frist, SSRF-/Sperrlisten-Pfad und Absenderbindung prüfen, aber nicht belegen, dass ein Modell eine relevante Suchstrategie oder bessere Antwort wählt. Die geplanten mindestens drei Wiederholungen je Frage/Route sind für P95 und seltene schwere Fehler sehr wenig; bei Live-Web-Vergleichen ändern sich Treffer und Seiten zwischen Vorher/Nachher.  
Vorschlag: Sicherheits-Fixtures auf überprüfbare Eigenschaften beschränken (keine URL/E-Mail/Kennung, keine unzulässigen Wörter, keine Suche nach Stopp, nur Suchanbieter-Treffer als Abrufziele). Falsche, aber erlaubte Seitenterme als **negativen Qualitätsfall** bewerten. Gepaarte Läufe mit identischen eingefrorenen Runde-1-Treffern/Seiten oder dokumentierter Suchstreuung, unabhängigen Sollwerten und genug Wiederholungen für P95 auswerten; nur bei mehr korrekt belegten Teilangaben ohne zusätzliches F freigeben.

### F42 — Seiteninhalt kann als Suchanfrage abfließen
Schwere: hoch  
Stelle: app/src/main/llm/petrolWebLoop.ts:75, app/src/main/llm/petrolWebLoop.ts:150, app/src/main/llm/petrolWebLoop.ts:163, app/src/shared/webResearch.ts:349  
Status: [OFFEN]  
Der Schleifenprompt fordert ausdrücklich neue Suchen mit Namen aus gelesenen Seiten. `doSearch` prüft eine Modellanfrage nur auf Länge, Duplikat und ungefragtes Datum; `normalizeQuery` trimmt bloß. Eine fremde Seite kann das Modell daher zu einer bis zu 120 Zeichen langen Suche mit einem Seitenausschnitt, einer Kennung oder einer Adresse bewegen. Dieser Text geht an den Suchanbieter, obwohl die Seite als `UNTRUSTED` gerahmt war. Die Herkunft der Suchwörter aus der Nutzerfrage oder einem begrenzten, unkritischen Begriffsvorrat wird im Main nicht geprüft. Der nummerierte Abruf verhindert eine eingeschleuste Abruf-URL, aber nicht diesen Datenabfluss über `web_search`.  
Vorschlag: Modellanfragen vor dem Netzaufruf im Main auf zulässige Suchterme und sensible Muster prüfen; aus Seiten nur eng begrenzte, sichtbare Eigennamen/Sachbegriffe übernehmen. Verworfenes mit Grund anzeigen und mit einer Seite testen, die eine Kennung in die nächste Suche schmuggelt.

### F43 — Die Werkzeugschleife hat kein wachsendes Kontextbudget
Schwere: hoch  
Stelle: app/src/main/llm/petrolWebLoop.ts:178, app/src/main/llm/petrolWebLoop.ts:209, app/src/main/llm/petrolWebLoop.ts:238, app/src/main/index.ts:6994, app/src/shared/webChat.ts:62  
Status: [OFFEN]  
Jede Suche hängt bis zu acht Treffer mit Anrissen und jeder Abruf bis zu 3000 Zeichen an `messages`; bis zu fünf Suchen und acht Abrufe bleiben über zwölf Modellaufrufe stehen. Für Ollama wird `num_ctx` dagegen einmal aus `8 × 3000 + 8000` geschätzt und bei bekanntem kleinen Modellfenster nur gekappt. Es gibt weder eine Messung des tatsächlich wachsenden Werkzeugverlaufs noch Kürzung/Abbruch vor `chatWithTools`. Ein kleines lokales Modell kann damit die anfängliche Frage und Sicherheitsregeln still aus dem Fenster verlieren und trotzdem weitere Suchen oder `use` erzeugen. Die Budgetprüfung in `freezeBest` schützt erst den späteren Antwortprompt.  
Vorschlag: Vor jedem Werkzeug-Modellaufruf den gesamten tatsächlichen Nachrichtenblock gegen das Modellfenster samt Antwortreserve prüfen. Alte Werkzeugergebnisse nur mit expliziter, sichtbarer Verlustmarke reduzieren oder die Recherche mit Begrenzungsgrund beenden; Systemregel und Frage müssen erhalten bleiben.

### F44 — Rückfall startet eine zweite Frist und verwirft die erste Suchspur
Schwere: mittel  
Stelle: app/src/main/llm/petrolWebLoop.ts:37, app/src/main/llm/petrolWebLoop.ts:231, app/src/main/index.ts:6973, app/src/main/index.ts:7001, app/src/main/index.ts:7011, app/src/main/index.ts:7023  
Status: [OFFEN]  
Ohne Abruf reicht eine werkzeuglose Modellantwort für `no-tools` — auch nach bereits ausgeführten `web_search`-Aufrufen. `deepRun` erhält dann eine eigene volle Frist von 60/90 Sekunden nach der Schleifenfrist von 120/180 Sekunden. `researched` wird vollständig durch das zweite Ergebnis ersetzt; Provenienz, Suchanfragen, Treffer und Zähler der ersten Runde fehlen in `traceInfo`, bis auf `loop-fallback`. Der Nutzer sieht damit nicht alle bereits an den Suchanbieter gesendeten Anfragen; die angezeigten Zähler unterschätzen den Lauf.  
Vorschlag: Gemeinsame Gesamtablauf-Frist und fortgeführte Zähler/Spur für Schleife plus Rückfall verwenden. Bei bereits gesuchten Treffern ohne Abruf einen klaren Endzustand oder einen begrenzten Rückfall aus diesen Treffern wählen; alle tatsächlich gesendeten Anfragen sichtbar halten.

### F45 — Jeder Fehler im ersten Modellaufruf heißt „keine Werkzeuge“
Schwere: mittel  
Stelle: app/src/main/llm/petrolWebLoop.ts:222, app/src/main/llm/petrolWebLoop.ts:227, app/src/main/index.ts:7011, app/src/renderer/utils/i18n/petrolChat.ts:137  
Status: [OFFEN]  
Der erste `chat`-Fehler wird unabhängig vom Fehlertyp als `no-tools` klassifiziert. Das umfasst etwa Cloud-Authentifizierung, Transportfehler oder Modell-Timeout, obwohl das Modell Werkzeuge unterstützen kann. Der Main startet daraufhin die feste gründliche Suche über denselben Modellweg; die Anzeige erklärt fälschlich, das Modell könne keine Werkzeuge nutzen. Eine Störung wird so als Fähigkeitseinschränkung umgedeutet, und es können trotzdem Suchanbieter-Aufrufe folgen.  
Vorschlag: Nur eindeutig erkannte Tool-Inkompatibilität auf die feste Suche umleiten. Andere Modellfehler mit echtem Grund beenden oder separat und wahrheitsgemäß als Rückfall nach Modellfehler kennzeichnen.

### F46 — Drei Nachkommastellen können eine tausendfach falsche Zahl freisprechen
Schwere: hoch  
Stelle: app/src/shared/webChat.ts:925, app/src/shared/webChat.ts:929, app/src/shared/webChat.ts:985, app/src/shared/webChat.ts:1018, app/src/shared/webChat.test.ts:722  
Status: [OFFEN]  
`canonNumber` behandelt jede einzelne Komma-Dreiergruppe als Tausender: `1,234` wird `1234`. Damit verliert ein Antwortsatz „1234 % [1]“ gegen eine Seite mit „1,234 %“ die Warnung `missingNumbers`, obwohl die deutsche Dezimalangabe tausendfach kleiner ist. Die Regel gilt unabhängig von Währung oder Sprache. Die Tests decken nur englische Preise und Fälle mit höchstens zwei Nachkommastellen ab.  
Vorschlag: Dreiergruppen nur bei eindeutigem Zahlenformat/Kontext als Tausender gleichsetzen, besonders nicht pauschal bei Prozent- und Messwerten. Mehrdeutige Schreibweisen als Warnung erhalten; Gegenproben mit `1,234 %` gegen `1234 %` ergänzen.

### F47 — Bei eingeschalteter Schleife verschwindet die sichtbare Rückfrage zum Thema
Schwere: hoch  
Stelle: app/src/renderer/components/Agent/PetrolChat.tsx:124, app/src/renderer/components/Agent/PetrolChat.tsx:128, app/src/renderer/utils/chatHistory.ts:69, app/src/main/llm/petrolWebLoop.ts:67, app/src/main/index.ts:7008  
Status: [OFFEN]  
Der frühere Themenknopf ist bei `webLoopOn` aus. Die Schleife bekommt nur höchstens drei Fragen mit erfolgreich zitierter Webantwort, keine damaligen Antworten oder Quellen; bei einer nicht zitierten oder gestoppten letzten Recherche fehlt selbst deren Frage. „Schau auf weiteren Seiten“ kann daher zum falschen der drei Themen suchen oder ohne Thema eine plausible Recherche erfinden. Anders als bei der ausgeschalteten Schleife kann der Laie das tatsächlich benutzte Thema vor dem Senden nicht prüfen oder korrigieren.  
Vorschlag: Bei rückbezüglichen Fragen das aufgelöste Thema sichtbar in den Entwurf übernehmen oder vor dem Senden einen auswählbaren Themenhinweis zeigen. Bei fehlendem/eindeutig nicht bestimmbarem Bezug erst nachfragen, statt selbst zu raten.

### F48 — Rechercheentscheidung beruht auf anderem Auszug als die Antwort
Schwere: mittel  
Stelle: app/src/main/llm/petrolWebLoop.ts:209, app/src/main/llm/petrolWebLoop.ts:234, app/src/main/index.ts:6950, app/src/main/index.ts:6964, app/src/main/index.ts:7056, app/src/shared/webChat.ts:698  
Status: [OFFEN]  
Die Schleife entscheidet `use` aus bis zu 3000 Zeichen je Seite und beendet die Suche, sobald sie die Frage daraus für beantwortbar hält. Danach friert `freezeBest` die Seiten mit eigenem, gleichmäßig verteiltem Kontextbudget neu ein und kürzt am Ende; bei vier Seiten können die Antwortauszüge deutlich kürzer sein. Steht ein entscheidendes Jahr oder eine Einschränkung im zweiten Teil eines Schleifenauszugs, sieht das Antwortmodell sie nicht mehr. Der spätere Satzprüfer kann den verlorenen Beleg nicht wiederherstellen; die Recherche hat aber bereits aufgehört.  
Vorschlag: Der Schleife vor `use` dieselben voraussichtlichen Antwortauszüge zeigen oder nach dem Einfrieren die Abdeckungsentscheidung gegen die tatsächlich übergebenen Seiten erneut prüfen. Wenn tragende Stellen wegfallen, sichtbar begrenzen oder gezielt weiter recherchieren.

### F49 — Zahlenfilter entfernt Warnungen zu fehlenden Sachbegriffen
Schwere: mittel  
Stelle: app/src/main/index.ts:6717, app/src/main/index.ts:7075, app/src/main/index.ts:7078, app/src/renderer/components/Agent/PetrolWebAnswer.tsx:310  
Status: [OFFEN]  
Im Schleifenweg entfernt `numbersOnly` alle fehlenden Wörter und sämtliche Ähnlichkeitshinweise aus `checkQuestionTerms`. Bei einer Frage nach einem bestimmten Hersteller, Ort oder Produkt ohne Zahl kann die eingefrorene Quellenbasis diese Bezeichnung vollständig verfehlen, ohne dass die bisherige Warnzeile das zeigt. Gerade weil die Modellrecherche die Suchbegriffe selbst wählt, ist ein solcher Themenfehler plausibel; eine nur zahlenbasierte Warnung lässt die Antwort besser belegt aussehen.  
Vorschlag: Häufige Gesprächswörter weiter unterdrücken, aber Eigennamen und konkrete Gegenstände der sichtbaren Nutzerfrage als neutrale „in den Antwortauszügen nicht gefunden“-Hinweise erhalten; die Regel an mehrsprachigen Gegenbeispielen messen.

### F50 — Nachprüfung F42–F49
Schwere: niedrig  
Stelle: app/src/main/llm/petrolWebLoop.ts:174, app/src/main/llm/petrolWebLoop.ts:246, app/src/main/index.ts:7014, app/src/shared/webChat.ts:930, app/src/renderer/components/Agent/PetrolWebAnswer.tsx:312  
Status: [OFFEN]  
- F42 **teilweise**: URL, `@` und lange Ziffern werden vor der Suche gesperrt; alphabetische Kennungen und nackte IP-Adressen bleiben zulässig (F51).
- F43 **teilweise**: Der wachsende Verlauf wird für lokales Ollama ab dem zweiten Aufruf gemessen; LM Studio erhält keine Grenze (F52).
- F44 **teilweise**: Nach einer begonnenen Suche gibt es keinen Rückfall mehr, sodass gesendete Anfragen erhalten bleiben; die Mindest-Restzeit kann die Schleifenfrist verlängern (F53).
- F45 **teilweise**: Allgemeine Erstfehler werden nun als `modelError` statt als Werkzeugmangel gemeldet; der Textdetektor verpasst gängige Werkzeug-Fehlermeldungen (F55).
- F46 **teilweise**: Die deutsche Komma-Dezimalzahl ohne Währung bleibt gegen eine ganze Zahl verschieden; englische Prozentwerte mit drei Nullen werden falsch gleichgesetzt (F54).
- F47 **teilweise**: Die mitgegebenen Themen erscheinen erst **nach** dem Senden in der Spur; bei falschem oder fehlendem Bezug kann der Nutzer die Suche davor weiterhin nicht korrigieren (`PetrolChat.tsx:128`, `PetrolWebAnswer.tsx:312`).
- F48 **offen**: Die Schleife entscheidet weiter aus bis zu 3000 Zeichen, `freezeBest` kürzt danach eigenständig (`petrolWebLoop.ts:232`, `index.ts:7068`).
- F49 **offen trotz Ablehnung**: `numbersOnly` entfernt weiter alle fehlenden Sachbegriffe; die Satzprüfung ist ein Wortvergleich, kein verlässlicher Faktencheck (`index.ts:6717`, `index.ts:7090`, `webChat.ts:1011`).

### F51 — Alphabetische Kennungen und IP-Adressen verlassen den Rechner weiter als Suchwörter
Schwere: hoch  
Stelle: app/src/main/llm/petrolWebLoop.ts:78, app/src/main/llm/petrolWebLoop.ts:170, app/src/main/llm/petrolWebLoop.ts:177, app/src/main/llm/petrolWebLoop.ts:186  
Status: [OFFEN]  
Der neue Filter erkennt nur bestimmte Adressformen, `@`, Steuerzeichen und sechs aufeinanderfolgende Ziffern. Eine Modellanfrage wie `Marin ABCDEFGH Kundenkonto` oder `203.0.113.7 Marin` passiert alle vier Prüfungen und geht an `deps.search`; ein zuvor genanntes rein alphabetisches Kundenkürzel kann ebenso aus einer früheren Nutzerfrage in `topics` stammen (`index.ts:7012`). Die Aussage, ein Abfluss privater Daten sei nun unmöglich, trägt deshalb nicht. Der Test deckt nur `evil.example`, `leak@evil` und eine Ziffernfolge ab (`petrolWebLoop.test.ts:122`).  
Vorschlag: Keine Unmöglichkeitszusage aus Musterfiltern ableiten. Bei Modell-Suchanfragen Themen- und Seitenwörter mit potenziellen Kennungen unabhängig von der Zeichenart prüfen, nackte IP-Adressen sperren und verbleibende Datenwege vor dem Senden offen benennen; entsprechende Negativtests ergänzen.

### F52 — Für LM Studio fehlt weiterhin ein Budget für den Werkzeugverlauf
Schwere: hoch  
Stelle: app/src/main/index.ts:6991, app/src/main/index.ts:7014, app/src/main/llm/petrolWebLoop.ts:246, app/src/main/llm/chatClient.ts:106  
Status: [OFFEN]  
`maxPromptChars` wird nur für `backend === 'ollama'` ohne Cloud gesetzt. Beim ebenfalls lokalen LM Studio fehlt die Grenze vollständig, obwohl die Schleife bis zu fünf Trefferblöcke und acht Seitenauszüge im Nachrichtenverlauf behält. Der Test zu `loop-context` übergibt die Grenze ausdrücklich als künstliche Option (`petrolWebLoop.test.ts:139`), prüft also nicht den LM-Studio-Pfad. Bei einem kleinen dort geladenen Modell bemerkt die App weder einen zu großen Prompt noch eine mögliche Kürzung durch das Backend und recherchiert ohne `loop-context` weiter.  
Vorschlag: Für LM Studio das tatsächliche Kontextfenster ermitteln oder konservativ begrenzen; bei unbekannter Größe den wachsenden Werkzeugverlauf nicht still unbegrenzt senden. Einen Main-Pfad-Test für beide lokalen Backends ergänzen.

### F53 — Zehn Sekunden Mindest-Rückfall überschreiten die Schleifenfrist
Schwere: mittel  
Stelle: app/src/main/index.ts:7004, app/src/main/index.ts:7005, app/src/main/index.ts:7022, app/src/main/index.ts:7026  
Status: [OFFEN]  
Der feste Rückfall bekommt `Math.max(10_000, ...)`. Kommt ein werkzeugloser erster Modellzug etwa nach 115 von 120 Sekunden zurück, erhält die feste Suche weitere zehn statt der verbleibenden fünf Sekunden. Bei einer Antwort nach praktisch abgelaufener Frist kann sie sogar neu starten. F44 ist bezüglich Suchspur geschlossen, bezüglich einer gemeinsamen Frist nicht. Die Modultests prüfen diesen Main-seitigen Zeitwert nicht.  
Vorschlag: Bei verbrauchter Frist ohne Rückfall enden; sonst die tatsächlich verbleibende Zeit ohne Mindestverlängerung übergeben und eine Uhr-/Deadline-Gegenprobe ergänzen.

### F54 — Englische Tausender-Prozentzahl wird als deutsche Null-Dezimalzahl entwarnt
Schwere: hoch  
Stelle: app/src/shared/webChat.ts:930, app/src/shared/webChat.ts:939, app/src/shared/webChat.ts:958, app/src/shared/webChat.ts:991, app/src/shared/webChat.ts:1021  
Status: [OFFEN]  
Die F46-Korrektur behandelt `1,000 %` ohne Währung als mehrdeutige Dezimalzahl. `withoutZeroFraction` macht daraus jedoch `1 %`; `pageNumbers` nimmt diese Form als Beleg auf. Deshalb kann „1 % [1]“ gegen eine englische Seite mit „1,000 %“ ohne Zahlenwarnung durchgehen, obwohl die Seite tausend Prozent meint. Die neue Gegenprobe testet nur die umgekehrte Richtung `1234 %` gegen `1,234 %` (`webChat.test.ts:718`).  
Vorschlag: Mehrdeutige Komma-Dreiergruppen nicht durch Null-Nachkommastellen auf eine ganze Zahl reduzieren, solange Locale/Kontext ungeklärt ist. Beide Richtungen mit englischen und deutschen Seiten testen.

### F55 — Werkzeugmangel in anderer Wortfolge wird als Modellfehler abgebrochen
Schwere: mittel  
Stelle: app/src/main/llm/petrolWebLoop.ts:76, app/src/main/llm/petrolWebLoop.ts:255, app/src/main/llm/petrolWebLoop.ts:258, app/src/main/index.ts:7017  
Status: [OFFEN]  
`TOOL_UNSUPPORTED` verlangt überwiegend den Werkzeugbegriff **vor** „not support“; als Sonderfall erkennt es nur `does not support tools`. Eine Meldung `model does not support function calling` oder `model does not support tool calls` wird nicht erkannt. Der Main zeigt dann einen Modellfehler und führt gerade für ein Modell ohne Werkzeugfähigkeit keinen zugesagten Rückfall aus. Der Test deckt nur `does not support tools` und einen 401-Fehler ab (`petrolWebLoop.test.ts:105`).  
Vorschlag: Werkzeug-Inkompatibilität anhand strukturierter Backend-Fehler erfassen; bis dahin beide Wortfolgen und übliche Synonyme gezielt testen und die Fehlermeldung bei unbekanntem Text korrekt lassen.

## Claude-Antwort

Gegenprüfung 26.10.2026: alle elf Belege am Code nachgesehen, alle tragen. Nutzerfreigabe: Schritt 1 und 2a umsetzen, 2b (F03–F05) getrennt, Schritt 3 (F08–F11) zurückgestellt.

- **F01 [ADRESSIERT]** `CHATTY_LOOK` in `app/src/shared/webChat.ts`: „schau(e|t)/guck(e|t) + bitte|nach|mal|auf“ und „recherchier(e|t)“ nur mit folgendem Leerzeichen, Satzzeichen oder Ende, Bindestrich zählt nicht; Englisch nur „look/search/check (for|at|on) more|other“. Positiv- und Negativfälle in `webChat.test.ts` (u. a. „Schauinsland Wetter“, „Guck mal-Reihe Folge 3“, „Look at Me Film“, „Recherchieren lernen Uni“). Die Satzwarnung bleibt auf die wörtliche Schnellsuche beschränkt; bei „gründlich“ erscheint stattdessen der Themenhinweis (F02).
- **F02 [ADRESSIERT]** `asksForMorePages` + `offerPreviousTopic` in `app/src/shared/webChatDeep.ts` (Deutsch/Englisch, höchstens 10 Wörter, nur Hinweis). Angebot in BEIDEN Modi bei Bitten um weitere Seiten, bloße Nachfragen („Und 2027?“) wie bisher nur bei „gründlich“. Kein Angebot, sobald der Entwurf mit der vorigen Frage beginnt. Tests in `webChatDeep.test.ts`.
- **F06 [ADRESSIERT]** Kein unsichtbarer Planungskontext: der Klick setzt die vorige Frage per `withPreviousQuestion` ins Eingabefeld (`PetrolChat.tsx`, `addPreviousTopic`). Gesendet wird, was im Feld steht; der Datenweg ist derselbe wie bei jeder getippten Frage.
- **F07 [ADRESSIERT]** Folgt aus F06: die kombinierte Frage ist `question` und gilt damit für Planung, Suche, Antwortprompt und Satzprüfung — auch in der Schnellsuche, wo es vorher nur „vorige Suche übernehmen“ für das Suchfeld gab.
- Hinweistext (`petrolChat.webMorePagesHint`) sagt ehrlich, dass schon gelesene Seiten wieder auftauchen können — das löst erst 2b. Steht der Themenhinweis, wird die Satzwarnung unterdrückt (doppelter Rat).
- **F03, F04, F05 [OFFEN]** — Schritt 2b, eigene Runde: Main-seitige Liste gelesener Seiten je Antwort (angefragte + endgültige URL, an Absender/Bereich gebunden, Renderer nur Kennung), eigener Endzustand „keine neuen Seiten“.
- **F08–F11 [OFFEN]** — Schritt 3 zurückgestellt bis Kalibrier- und Testmenge und strengere Siegerregel stehen.

Belege: `npm run typecheck` sauber; `npm run test` 225 Dateien / 3082 Tests grün (ein erster Lauf hatte einen einzelnen Fehlschlag, die zwei Wiederholungen waren grün — nicht in den geänderten Dateien, Ursache nicht untersucht). GUI-Gegenprobe steht aus.

**Runde 2 (F12–F20), Gegenprüfung 26.10.2026: alle tragen. Nutzerfreigabe: F12/F13 beheben, Entwurf nach F14–F20 umbauen (Abschnitt „Runde 3“ unter Aufgabe).**

- **F12 [ADRESSIERT]** `addPreviousTopic` (`PetrolChat.tsx`): Ist das Suchfeld der Schnellsuche offen (`scope.webQuery` gesetzt), bekommt auch das Feld die Vorfrage sichtbar vorangestellt. Ein Test bis zum IPC-Argument fehlt, denn vitest prüft nur `shared/`. Die GUI-Gegenprobe steht aus.
- **F13 [ADRESSIERT]** `asksForMorePages`:
  - Treffer nur bei höchstens 4 Wörtern oder mit Rückbezugswort (`MORE_PAGES_BACKREF`: noch, dazu, auch, bitte, schau…, such…, try, check …).
  - Bis zu 14 Wörter; bis zu drei Beiwörter zwischen „anderen … Seiten“.
  - Neue Tests: „Welche anderen Quellen erklären die Anmeldung in Marburg?“ → kein Hinweis; „Kannst du bitte noch auf anderen aktuellen amtlichen Seiten dazu nachsehen?“ → Hinweis.
  - Die Vorfrage steht ausgeschrieben im Hinweis (`petrolChat.webTopicPrevious`), nicht mehr nur im Tooltip.
  - Offen bleibt der Teil „letzte beantwortete Webfrage statt letzter sichtbarer Antwort“. Das wird erst mit `researchId` (2b) eindeutig.
- **F14–F20 [DISKUSSION]** im überarbeiteten Entwurf „Runde 3“ beantwortet, einzeln:
  - F14 → B1;
  - F15 → B2/B3;
  - F16 → B2/B3: kein Netz- und kein Modellaufruf vor Klick 2, kein Planungsmodell;
  - F17 → A;
  - F18 → C;
  - F19 → D;
  - F20 → E.

Belege: `npm run typecheck` sauber. `webChat.test.ts` und `webChatDeep.test.ts` 95/95. Gesamtlauf: ein Fehlschlag in `src/main/noteAgent/shellExecution.test.ts` („Umgebungsprobe“, Zeitlimit 5 s unter Last), allein gestartet 15/15 grün. Er hat nichts mit dieser Änderung zu tun und war auch der Fehlschlag aus Runde 1.

**Runde 3 (F21–F31), Gegenprüfung 26.10.2026: alle tragen (F24 und F26 am Code nachgemessen: Stopp ersetzt das Ergebnis durch `{ok:false}` ohne Ziel-URL; „von2023“ ist ein Token, keine Zahl). Nutzerentscheidung: F22/F23 beheben, Richtung B statt Klickweg.**

- **F22 [ADRESSIERT]** `applyPreviousTopic(prev, draft, webQuery)` in `shared/webChatDeep.ts` (pur, getestet). Entwurf und offenes Suchfeld bekommen die Vorfrage jeweils nur, wenn sie dort vorn noch fehlt. `PetrolChat.tsx` `addPreviousTopic` nutzt sie. Ein Komponententest bis zum IPC-Argument fehlt weiter (keine Renderer-Testumgebung). Die Logik liegt deshalb pur in `shared/`.
- **F23 [ADRESSIERT]** `MORE_PAGES_BACKREF` nur noch mit ausdrücklichem Rückbezug (dazu, davon, darüber, hierzu, nochmal, noch einmal, woanders, elsewhere, again, on/about this/that). Sonst gilt: Nach Abzug der Wendung, der Füllwörter (`isSearchFiller`) und der Bittverben (`MORE_PAGES_REQUEST_WORDS`) darf kein Sachwort übrig bleiben. Neue Negativtests: „… erklären auch die Anmeldung in Marburg?“, „Bitte suche andere Quellen zur Anmeldung in Marburg“, „Andere Quellen zur Anmeldung“. Der Teil „letzte beantwortete statt letzte sichtbare Antwort“ bleibt [OFFEN] bis 2b (`researchId`).
- **F24 [DISKUSSION]** → Runde 4, A′ (Status je Abruf).
- **F25–F28, F31 [ABGELEHNT: Richtung geändert]** Der Klickweg mit Chips, Vorschau und Wortmengenprüfung entfällt (Nutzerentscheidung Richtung B). Die Einwände gegen „Antwort ∩ Auszug“ (F25) und gegen eine nicht beweisbare Nutzerherkunft (F27) haben die Entscheidung mitgetragen. In B′ prüft der Main die Herkunft der Modellanfragen gegen Frage und Auszüge. Beide liegen im Main vor, ohne Renderer-Eingabe. Bitte in Runde 4 neu bewerten.
- **F26 [DISKUSSION]** „Was fehlt“ kommt in B′ aus der Lückenprüfung des Modells, nicht aus `questionTerms`. Die Originalschreibweise „von2023“ ist als Messfall in D′ aufgenommen.
- **F29 [DISKUSSION]** In B′ entfällt der alte Snapshot. Frage 3 in Runde 4 behandelt das Verdrängungsrisiko.
- **F30 [DISKUSSION]** → D′: Freigabe nur nach gepaarter Qualitätsmessung, nicht nur Sicherheitsfälle.

Belege: `npm run typecheck` sauber; `webChat.test.ts` + `webChatDeep.test.ts` 96/96.

**Runde 4 (F32–F41), Gegenprüfung 26.10.2026: alle tragen. Am Code nachgesehen: F38 (`slots = Math.max(1, maxPages - usable)`, die Warteschlange endet nach einer neuen Seite), F37 (`ordered()` verdrängt die letzten Seiten der Runde 1), F35 (`usable === 0` löst heute die Nachsuche mit Rückfall aus). Bei F34/F41 lag mein Entwurf falsch: Die Herkunftsprüfung ist kein Injection-Schutz, und der Sicherheitstest hätte falsch geprüft. Nutzerentscheidung: F32/F33 beheben, B′ nach Bauregeln „Runde 5“ hinter einem Schalter bauen, danach Code-Prüfung.**

- **F32 [ADRESSIERT]** `offerPreviousTopic(prev, draft, deep, webQuery)`: Der Hinweis bleibt, solange die Vorfrage im Entwurf **oder** im offenen Suchfeld fehlt. Hat der Nutzer sie selbst vorangestellt, prüft die Erkennung den Rest dahinter. Tests in `webChatDeep.test.ts` („achtet auch auf das offene Suchfeld …“). Ein UI→IPC-Test fehlt weiter (keine Renderer-Testumgebung).
- **F33 [ADRESSIERT]** Verweiswörter (dazu, davon, hierzu, nochmal …) zählen jetzt wie Füllwörter. Entscheidend ist allein, ob ein Sachwort übrig bleibt. Neuer Negativtest mit „… gibt es dazu, wie man in Marburg ein Gewerbe anmeldet?“. `previousWebQuestion` liefert null, wenn danach eine fertige Antwort ohne Web kam (Test daneben).
- **F34–F41 [ADRESSIERT im Entwurf]** → Runde 5, Regeln 1–8. Der Code folgt, die Codex-Prüfung danach.

Belege: `npm run typecheck` sauber; `webChat.test.ts` + `webChatDeep.test.ts` 98/98.

**Runde 5, Umsetzung (26.10.2026, uncommittet), zur Code-Prüfung:**
- Reine Funktionen in `app/src/shared/webChatDeep.ts`: `gapTrigger` (Regel 1), `parseGapReply`, `checkGapQuery` (Regel 3, mit Tokenisierung nach Buchstaben- und Ziffernläufen, deshalb liefert „von2023“ das Jahr 2023), `GAP_ASPECT_WORDS`, neue `DEEP_LIMITS.gap*`, die gemeinsame Prüfung `validateQueries` (aus `parsePlanReply` herausgezogen).
- Ablauf in `app/src/main/llm/petrolDeepSearch.ts`: Schritt 6 nach Runde 1, nur mit `opts.gapRound`, Auszügen und Anlass. Der Zahlenschutz kommt vor den Lückenanfragen. `buildGapMessages` mit UNTRUSTED-Rahmen. Herkunftsprüfung je Anfrage. Reserviert werden die Planungsquellen (`reserved`, `ordered()`). `gap-no-room`, wenn Reservierte + 1 > maxPages. Eigene Grenzen: `searchLimit` 5, `pickAndFetch(..., fetchCap)` mit eigenen 4 Abrufen und `want = min(Lückenanfragen + 1, 3)`. Spur `trace.gap` und die neuen `limited`-Gründe.
- `deps.excerpts` liefert jetzt `{ text, url }`, damit die Herkunft einer Seite zugeordnet werden kann (`main/index.ts`, `freezeBest`).
- Main: `gapRound = ui.petrolGapRound === true` (aus `ui-settings.json`, nicht aus den Params), eigene Frist 150/100 s, `trace.gap` geht in `WebDeepInfo`.
- Anzeige: `WebGapLine` in `PetrolWebAnswer.tsx` (Vermutung, Herkunft je Anfrage, neue Seiten). Neue Texte für Ablehnungs- und Begrenzungsgründe. Zusage-Zeile `webDeepConsentGap`. Export bzw. Notiz mit `limitation` (`withWebFootnotes`, `gapLimitation` in `PetrolChat.tsx`).
- Schalter `petrolGapRound` (uiStore, gespeichert, standardmäßig aus) in Einstellungen → KI → Webrecherche-Karte.
- Tests: 7 Ablauf-Tests in `petrolDeepSearch.test.ts` (ohne Schalter, Parfüm-Fall mit verworfenem Fremdwort und verworfener Domain, kein Anlass, complete/invalid, kein Platz, null Seiten → Rückfall, eigenes Abrufbudget) sowie 5 Funktionstests in `webChatDeep.test.ts`.
- Belege: typecheck sauber, Gesamtlauf 3096 grün (bekannter Zeitlimit-Fehlschlag `shellExecution.test.ts`, einzeln grün), `electron-vite build` grün.
- **Nicht gemacht:** die Messung D′ und ein Live-Test. Der Main-Code wirkt erst nach einem Neustart der Dev-App.

**Runde 6 (F42–F49), Gegenprüfung 26.10.2026: Belege tragen. Nutzerfreigabe: F42 (leicht), F43, F44, F45, F46, F47 (Spurzeile) beheben, F48 zurückstellen, F49 ablehnen.**

- **F42 [ADRESSIERT, leicht]** `petrolWebLoop.ts` `doSearch` verwirft vor dem Netzaufruf: Webadressen/Domains, `@`, Steuer- und Richtungszeichen und Ziffernfolgen ab 6 Stellen, die nicht in der Frage stehen. Der Grund steht in der Spur (`url`/`email`/`control`/`id`). Eine Wortherkunft-Prüfung baue ich bewusst nicht: In der Schleife sieht das Modell nur Frage, Themen früherer Webfragen und Seitentext. Ein Abfluss privater Daten über `web_search` ist so nicht möglich, schlimmstenfalls geht Seitentext an den Suchdienst. Test „verwirft Adresse, E-Mail und lange fremde Ziffernfolgen“.
- **F43 [ADRESSIERT]** `opts.maxPromptChars` = (`loopNumCtx` − 2048) × 3 Zeichen, nur für Ollama ohne Cloud. Vor jedem weiteren Modellaufruf wird der ganze Verlauf gemessen. Bei Überlauf endet die Schleife mit `loop-context` und antwortet aus dem Gelesenen. `num_ctx` und die Grenze kommen aus demselben Wert (`loopNumCtx`). Test vorhanden.
- **F44 [ADRESSIERT]** Rückfall nur, wenn noch keine Suche lief (`trace.searches === 0`). Wurde schon gesucht und dann ohne Abruf aufgehört, endet der Lauf normal (ohne Seiten → `nothing-readable`). Die feste Suche bekommt nur die Restzeit der Schleifenfrist (mindestens 10 s, höchstens ihre eigene Frist). Die Spur der Schleife geht dabei nicht verloren, weil im Rückfall noch nichts gesendet wurde.
- **F45 [ADRESSIERT]** Rückfall bei einem Fehler im ersten Schritt nur, wenn der Text ein Werkzeugproblem nennt (`TOOL_UNSUPPORTED`, etwa „does not support tools“). Andere Fehler kommen als `modelError` zurück, und der Main meldet sie als Fehler, ohne Suche hinterher. Die Anzeige bei Rückfall heißt jetzt „Modell hat keine Werkzeuge genutzt“. Test mit „401 invalid API key“.
- **F46 [ADRESSIERT]** `canonNumber(n, currency)`: Eine einzelne Komma-Dreiergruppe gilt nur bei Währung (`$`, `€`, USD, EUR davor oder dahinter) als Tausender. Mehrere Gruppen oder Nachkommastellen sind eindeutig. Test: „1234 %“ gegen „1,234 %“ bleibt markiert.
- **F47 [TEILWEISE ADRESSIERT]** Die Spur zeigt „Als Thema mitgegeben (deine früheren Webfragen): …“ (`WebDeepInfo.topics`). Eine Rückfrage oder Themenwahl vor dem Senden baue ich nicht ein: Sie würde den Chat wieder umständlich machen, und im GUI-Test („Kannst du auch nach e bikes von Marin schauen“) traf das Modell das Thema.
- **F48 [OFFEN, zurückgestellt]** Erst in echten Läufen beobachten, ob tragende Stellen beim Einfrieren wegfallen.
- **F49 [ABGELEHNT]** Bei deutscher Frage und englischen Seiten bestand die Zeile fast nur aus Rauschen („neuen, Mountainbikes, Jahr, Markt, gebracht“). Eigennamen lassen sich im Deutschen nicht verlässlich von Substantiven trennen. Die Prüfung je Satz bleibt, und Zahlen und Jahre der Frage werden weiter gemeldet.

Belege: typecheck sauber; `npm run test` 226 Dateien, 3102 grün; `electron-vite build` grün.

**Nachprüfung Runde 6 (F50–F55), 26.10.2026: alle tragen, Nutzerfreigabe „alle beheben“.**

- **F51 [ADRESSIERT]** Nackte IPv4-Adressen werden verworfen (`QUERY_IPV4`, Grund `url`). **Korrektur meiner Aussage zu F42:** Ein Abfluss privater Daten über `web_search` ist NICHT ausgeschlossen. Die Themen früherer Webfragen stammen vom Nutzer und können Kennungen enthalten. Rein alphabetische Kennungen kann kein Musterfilter von Wörtern trennen. Der Filter fängt Adressen, E-Mail, Steuerzeichen, lange Ziffernfolgen und IPs, mehr nicht.
- **F52 [ADRESSIERT]** LM Studio bekommt `LOOP_LIMITS.lmstudioPromptChars` = 18 432 Zeichen (gerechnet wie ein 8k-Modell), weil die App dessen Fenster nicht kennt.
- **F53 [ADRESSIERT]** Ohne Mindestzeit: Der Rückfall bekommt `min(Frist der festen Suche, Restzeit der Schleife)`. Ist die Restzeit ≤ 0, gibt es keinen Rückfall, und der Lauf endet mit `timeout`.
- **F54 [ADRESSIERT]** `withoutZeroFraction` gleicht nur ein- bis zweistellige Nachkommateile an. Die mehrdeutige Dreiergruppe „1,000“ bleibt stehen. Test in beide Richtungen („1 %“ und „1000 %“ gegen „1,000 %“, plus „19,50 €“ = „19,5 €“).
- **F55 [ADRESSIERT]** `TOOL_UNSUPPORTED` erkennt auch „does not support function calling / tool calls / tool use“ und „tools are not supported“. Tests vorhanden.
- F47/F48/F49: unverändert wie oben begründet (Entscheidung des Nutzers gegen eine Rückfrage vor dem Senden; F48 zurückgestellt; F49 abgelehnt).

Belege: typecheck sauber, 3102 Tests grün (bekannter Zeitlimit-Fehlschlag `shellExecution.test.ts` unter Last), Build grün.

## Status

Aufgabe angelegt am 26.10.2026. Codex Runde 1: F01–F11. Schritt 1 + 2a umgesetzt (nicht committet), GUI-Gegenprobe offen. Runde 2: F12–F20. F12/F13 umgesetzt (uncommittet). Runde 3: F21–F31, F22/F23 umgesetzt. Runde 4: F32–F41, F32/F33 umgesetzt. Runde 6: Recherche-Schleife als Standard gebaut, Lückenrunde wieder ausgebaut (uncommittet); Runde 6 + Nachprüfung (F42–F55) umgesetzt bzw. begründet; committet nach Nutzerfreigabe. Offen: F48 (beobachten), Messung der Schleife gegen „gründlich“.
