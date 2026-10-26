# Messung „schnell“ gegen „gründlich“ (R7/S6)

Zugehörig: `chat-gruendliche-suche.md` (R7 Fragensammlung, S6 Messregeln, F21 Gegenprüfung).
Auftrag des Nutzers 25.10.2026: „ja, miss lokal mit qwen3.8“.

## Aufbau

- Modell `qwen3.8:27b-mlx` lokal (Ollama), Suchdienst Tavily, Dev-App über CDP
  (`window.electronAPI.petrolChatWeb`), Gesprächsbereich `messung`, kein Verlauf.
- „schnell“ = die getippte Frage wörtlich als Suche (so sendet die App ohne Eingriff des Nutzers).
  „gründlich“ = `deep: true`.
- 15 Fragen aus R7, je 3 Wiederholungen, gepaart direkt nacheinander, Reihenfolge wechselt je Frage
  und Wiederholung. Gesichert je Lauf: Zeit, Suchanfragen und Spur (`deep`), eingefrorene Auszüge,
  Antwort, Satzprüfung, Provenienz.
- Zusatz (nicht gewertet, keine festen Sollwerte): zwei echte Nutzerfragen vom 25.10.2026 —
  „Erstelle mir eine Zusammenfassung der politischen Ereignisse von heute“, „Was war in
  Deutschladn besonderes los“.

## Bewertungsraster je Antwort

- **K** Kernangabe richtig (mindestens die erste Kernangabe unten, sinngemäß)
- **F** schwerer Fehler (siehe je Frage) — falsche Zahl/Regel oder fehlende wesentliche Einschränkung
- **L** Lücke ehrlich benannt (statt Kernangabe, ohne Falschaussage)
- **Q** Quelle trägt die Kernangabe (steht im eingefrorenen Auszug)
- Zeit, Suchen

Entscheidung (Regel aus R7/S6, Memory „Sieger nur bei mehr Treffern“): „gründlich“ wird Standard für
Fragesätze nur bei **mehr K ohne mehr F** in irgendeiner Risikoklasse. Grenzfälle und alle F prüft
eine zweite Instanz (Codex) an den gesicherten Artefakten nach (F21).

## Sollwerte (festgelegt 25.10.2026 vor Sichtung der Läufe)

Quellen: eigene Websuche 25.10.2026. Wo nur Sekundärquellen erreichbar waren, steht es dabei.

| # | Frage | Kernangabe(n) | zulässige Lücke | schwerer Fehler | Klasse |
|---|---|---|---|---|---|
| 1 | Balkonkraftwerk 8 Module, was kosten die Module? | Preis je Modul bzw. Set mit Zahl aus Quelle; **Einschränkung:** als Steckersolargerät erlaubt sind bis 2000 Wp Modulleistung und 800 VA Wechselrichter (EEG/Solarpaket I seit 16.05.2024) — 8 übliche Module (je 400–500 Wp) liegen darüber | Einzelpreis je Modul nicht genannt | 8 Module als normales Balkonkraftwerk ohne Hinweis auf die 2000-Wp-Grenze; erfundener Preis | Geld/Recht |
| 2 | Elterngeld bei 3000 € brutto | Elterngeld richtet sich nach dem **Netto** vor der Geburt, 65–67 % (bis 100 % bei niedrigem Einkommen), 300–1800 € monatlich; für 3000 brutto grob ~1.300–1.450 € (Netto ~2.000–2.200 €, Steuerklasse abhängig) | genaue Summe nicht berechenbar (Steuerklasse) | 65 % vom Brutto gerechnet; Betrag über 1800 € | Geld |
| 3 | Wärmepumpe Haus 1975 | lohnt oft, hängt v. a. an Vorlauftemperatur (≤ 55 °C)/Heizkörpern/Dämmung; Förderung KfW-Programm 458 mit Grundförderung 30 % + Boni, Obergrenze 70 % (seit 21.07.2026 laut Sekundärquellen: Geschwindigkeitsbonus 16 %, förderfähig 28.000 €, bis 80 % bei niedrigem Einkommen) | konkrete Wirtschaftlichkeit nicht beurteilbar | „lohnt sich nicht im Altbau“ pauschal; Förderung über 70 % ohne Einkommensbezug | Geld |
| 4 | Kroatien Vignette oder Maut | **keine Vignette**, Streckenmaut auf Autobahnen (Mautstellen; Umstellung auf Free-Flow ab Herbst 2026/März 2027, Quellen uneinheitlich) | Tarife nicht genannt | „Vignette nötig“ | Alltag |
| 5 | Stromspeicher mit/ohne Montage | rund 300–800 € je kWh inkl. Installation (10 kWh ≈ 3.000–7.000 €), Installation selbst ~500–1.500 € (Sekundärquellen, Anbieter) | Trennung mit/ohne Montage nicht belegt | Zahlen ohne jede Quelle | Geld |
| 6 | Medikamente mit Alkohol | u. a. Schlaf-/Beruhigungsmittel (Benzodiazepine), Opioide, Paracetamol (Leber), Metronidazol, Antidepressiva, Antihistaminika, blutzuckersenkende Mittel; Hinweis Packungsbeilage/Apotheke | — | ein gefährliches Mittel ausdrücklich als „unbedenklich“; Dosisempfehlungen | Gesundheit |
| 7 | Rundfunkbeitrag 2027 | derzeit 18,36 €; KEF empfiehlt **18,64 € ab 1.1.2027** (Feb. 2026); **Länderbeschluss/Staatsvertrag bis 25.10.2026 nicht gefunden** | „noch nicht beschlossen“ | 18,64 € als beschlossen; 18,94 € als gültig | Geld |
| 8 | Mieterhöhung nach Modernisierung | ja: jährlich **8 %** der Modernisierungskosten (§ 559 BGB), Kappung **3 €/m²** in 6 Jahren (2 €/m² bei Miete unter 7 €/m²), Erhaltungskosten nicht umlagefähig, Härteeinwand | — | 11 %; keine Kappung | Recht |
| 9 | Zimmerpflanzen giftig für Katzen | u. a. **Lilien (sehr gefährlich, Nierenversagen)**, Dieffenbachie, Efeutute, Monstera, Philodendron, Weihnachtsstern, Aloe, Einblatt | — | Lilie als ungiftig | Gesundheit (Tier) |
| 10 | Grundsteuer neu, Mieter | gilt seit **1.1.2025**; bleibt über Betriebskosten umlegbar (§ 2 Nr. 1 BetrKV, wenn im Mietvertrag vereinbart); Höhe kann steigen oder sinken, Hebesätze der Gemeinde | — | „Mieter zahlen keine Grundsteuer mehr“; Start 2026 | Recht/Geld |
| 11 | ETF vs. Fonds Kosten | ETF laufende Kosten (TER) meist ~0,1–0,5 % p. a., aktive Fonds ~1–2 % p. a. plus oft **Ausgabeaufschlag** bis ~5 % | — | aktive Fonds billiger dargestellt | Geld |
| 12 | Brief Deutsche Post Laufzeit | Postgesetz seit 2025: **95 % am dritten Werktag, 99 % am vierten** (Jahresdurchschnitt), kein Anspruch für den einzelnen Brief | — | „am nächsten Tag (E+1)“ als heutige Vorgabe | Alltag |
| 13 | Führerschein B, Anhänger 1000 kg | Klasse B: Anhänger bis 750 kg zGM, schwerer nur wenn Zug zusammen höchstens 3.500 kg; darüber B96 (bis 4.250 kg) oder BE | konkrete Fahrzeugdaten fehlen | pauschal „ja“ ohne 3.500-kg-Bedingung | Recht |
| 14 | BahnCard 50 Studenten | **keine eigene Studentenermäßigung**; unter 27: My BahnCard 50 (regulär 79,90 €, Aktion 64,99 €); ab 27 regulär 244 € (2. Kl.) | Aktionszeitraum unklar | erfundener „Studentenpreis“ ab 27 | Geld |
| 15 | Lastenrad-Förderung Hessen | Landesprogramm (HMUKLV) mit bis zu 1.000 € E-Lastenrad / 500 € ohne Motor bestand; **ob 2026 eine Runde läuft, nicht bestätigt**; kommunale Programme (z. B. Marburg, Gießen) | „aktueller Stand unklar“ | laufendes Programm 2026 als sicher behauptet | Geld |

## Ergebnisse

Läufe 25.10.2026 20:52–00:28, 102 von 102 mit Antwort (kein Abbruch, kein Fehler).
Bewertet wurden die 90 Läufe zu den Fragen 1–15. Die Bewertung war **verblindet**: die Antworten wurden je Frage gemischt
und mit Kennungen 1a–15f versehen, der Modus erst nach der letzten Zeile aufgedeckt.
Artefakte (außerhalb des Repos): `/private/tmp/claude-502/-Users-jochenleeder-dev-mindgraph-notes/4988f011-66d4-41d2-88e9-0a398486841b/scratchpad/mess/laeufe.jsonl` (alle Läufe inkl. Auszüge),
`blind.txt` (verblindete Antworten), `blind-key.json` (Schlüssel), `bewertung.txt` (Bewertung vor dem Aufdecken).

### Summen (45 Antworten je Modus)

| | K | F | L | Zeit Mittel | Suchen je Lauf |
|---|---|---|---|---|---|
| schnell | 36 | 5 | 9 | 82 s | 1 |
| gründlich | 39 | 3 | 6 | 102 s | 2,0 |

Je Frage (K schnell/gründlich · F schnell/gründlich): 1: 1/2 · 2/1 — 2: 0/0 · 0/0 — 3: 3/3 · 0/1 — 4: 2/3 — 5: 1/3 —
6, 7, 9, 12–15: gleich (3/3, kein F) — 8: 3/3 · 3/1 — 10: 2/3 — 11: 3/1.

Je Risikoklasse F (schnell/gründlich): Geld (1, 2, 3, 5, 7, 11, 14, 15) 2/2 · Recht (8, 13) 3/1 · Gesundheit 0/0 · Alltag 0/0.

### Was die Zahlen tragen und was nicht

- Nach der vorab festgelegten Regel (mehr K, in keiner Klasse mehr F) **besteht „gründlich“ knapp**: +3 K, −2 F,
  Geld gleich. Der Abstand ist klein (3 von 45) und hängt an Grenzfällen: Nimmt man 1c/3c/11c/11e anders, kippt er.
- Der K-Gewinn kommt fast ganz aus **Fehlgriffen der schnellen Suche**: 2e (Arbeitslosengeld-Seite), 4c (Microsoft-Support),
  10f (Börsenwert AllianceBernstein), 5d/5f (nur PV-Komplettpreise) — alle schnell, alle ehrlich als Lücke benannt.
  Gründlich hatte bei den 15 Fragen keinen solchen Totalausfall.
- Gründlich verliert bei Frage 11 (ETF/Fonds): zweimal nur qualitativ, ohne Zahlen und ohne Ausgabeaufschlag.
- Mietrecht (8): die drei schnellen Antworten nennen die 3-€/m²-Kappung nicht, die gründlichen zweimal; 8c (gründlich)
  behauptet sogar, die Modernisierungserhöhung werde „von der Kappungsgrenze nicht erfasst“.
- Elterngeld (2): in **keinem** Lauf eine Größenordnung für 3000 € brutto, alle sechs nur ehrliche Lücke.
- „gründlich“ ist im Mittel **20 s (≈ 25 %) langsamer**.

### Nebenbefunde (nicht gewertet, aber zu beheben)

1. **Wortlücken-Hinweis leckt in die Antwort (nur gründlich, 8 von 45):** Antworten beginnen mit „Das Wort ‚nehmen‘/‚hoch‘
   kommt in den Auszügen nicht vor“. Herkunft: `deep.terms.missing` landet im Prompt. Liest sich wie ein Fehler.
2. **Antwort doppelt (6 von 102, beide Modi):** das Modell schreibt ein `</think>` mitten in die Antwort und danach den Text
   ein zweites Mal (6e, 7c, 8b, 8f, 10b, 10c). Trotz `think: false`.
3. **Zusatzfrage „politische Ereignisse von heute“:** schnell 3 × brauchbar (zdfheute, tagesspiegel, faz — diesmal anders als
   beim Nutzer am Nachmittag), gründlich nur 1 × von 3. Gründlich plant Suchen mit Datum („25.10.2026“, „2026-10-26“) und
   bekommt Namensseiten/Lernportale; in rep1 wurde **theporndude.com** abgerufen — die Sperrliste kennt keine
   Erwachsenenseiten.
4. **Zusatzfrage „Was war in Deutschladn besonderes los“:** schnell 3 × Erster Weltkrieg; gründlich 1 × aktuelle Meldungen,
   1 × wörtlicher Satz als Suche (Planung fiel aus → Erster Weltkrieg), 1 × allgemeine Geschichte.

### Bewertung je Antwort (vor dem Aufdecken festgelegt; Modus erst danach ergänzt)

| id | Modus | Wdh. | K | F | L | Grenzfall | Notiz |
|---|---|---|---|---|---|---|---|
| 1a | schnell | 1 | 0 | 1 | 1 |  | Setpreis, kein Grenzhinweis |
| 1b | schnell | 2 | 0 | 1 | 1 |  | Setpreis, kein Grenzhinweis |
| 1c | gruendlich | 1 | 0 | 1 | 1 |  | Setpreise, kein Grenzhinweis |
| 1d | schnell | 3 | 1 | 0 | 0 |  | Setpreis + 800W/3,6kWp Hinweis |
| 1e | gruendlich | 3 | 1 | 0 | 0 |  | Setpreise + ueber 800W Anmeldung |
| 1f | gruendlich | 2 | 1 | 0 | 0 |  | Modulpreis + Grenzhinweis |
| 2a | schnell | 1 | 0 | 0 | 1 |  | Netto-Basis, Beispiel 2000->1300 |
| 2b | gruendlich | 3 | 0 | 0 | 1 | ja | legt nahe 1800 moeglich (Netto>=2770 offen) |
| 2c | gruendlich | 2 | 0 | 0 | 1 |  |  |
| 2d | schnell | 3 | 0 | 0 | 1 |  |  |
| 2e | schnell | 2 | 0 | 0 | 1 |  | Quelle ALG I, ehrliche Luecke |
| 2f | gruendlich | 1 | 0 | 0 | 1 |  |  |
| 3a | schnell | 1 | 1 | 0 | 0 |  |  |
| 3b | gruendlich | 3 | 1 | 0 | 0 |  |  |
| 3c | gruendlich | 2 | 1 | 1 | 0 | ja | bis 80% ohne Einkommensbezug |
| 3d | schnell | 2 | 1 | 0 | 0 |  |  |
| 3e | schnell | 3 | 1 | 0 | 0 |  |  |
| 3f | gruendlich | 1 | 1 | 0 | 0 |  |  |
| 4a | gruendlich | 2 | 1 | 0 | 0 |  |  |
| 4b | gruendlich | 3 | 1 | 0 | 0 |  |  |
| 4c | schnell | 2 | 0 | 0 | 1 |  | Microsoft-Seiten, ehrliche Luecke |
| 4d | schnell | 3 | 1 | 0 | 0 | ja | zitiert 'ab Ende 2024 E-Vignette' als Quellenwiderspruch |
| 4e | gruendlich | 1 | 1 | 0 | 0 |  |  |
| 4f | schnell | 1 | 1 | 0 | 0 | ja | dito, aber klar aktuell keine Vignette |
| 5a | gruendlich | 1 | 1 | 0 | 0 |  |  |
| 5b | schnell | 1 | 1 | 0 | 0 |  |  |
| 5c | gruendlich | 3 | 1 | 0 | 0 |  |  |
| 5d | schnell | 3 | 0 | 0 | 1 |  | nur PV-Komplettpreise |
| 5e | gruendlich | 2 | 1 | 0 | 0 |  |  |
| 5f | schnell | 2 | 0 | 0 | 1 |  | nur PV-Komplettpreise |
| 6a | gruendlich | 2 | 1 | 0 | 0 |  |  |
| 6b | gruendlich | 1 | 1 | 0 | 0 |  |  |
| 6c | schnell | 2 | 1 | 0 | 0 |  | schmal, aber Benzos/Antidepressiva |
| 6d | schnell | 3 | 1 | 0 | 0 |  |  |
| 6e | gruendlich | 3 | 1 | 0 | 0 |  | Antwort doppelt (</think>) |
| 6f | schnell | 1 | 1 | 0 | 0 |  |  |
| 7a | gruendlich | 2 | 1 | 0 | 0 |  |  |
| 7b | gruendlich | 3 | 1 | 0 | 0 |  |  |
| 7c | schnell | 1 | 1 | 0 | 0 |  | doppelt |
| 7d | schnell | 2 | 1 | 0 | 0 |  |  |
| 7e | schnell | 3 | 1 | 0 | 0 |  |  |
| 7f | gruendlich | 1 | 1 | 0 | 0 |  |  |
| 8a | gruendlich | 3 | 1 | 0 | 0 |  | 8% + 3/2 EUR Kappung |
| 8b | gruendlich | 1 | 1 | 0 | 0 | ja | Kappung ohne Zahl, 556c falscher Paragraph; doppelt |
| 8c | gruendlich | 2 | 1 | 1 | 0 | ja | 'von der Kappungsgrenze nicht erfasst' falsch |
| 8d | schnell | 3 | 1 | 1 | 0 |  | keine 3-EUR-Kappung |
| 8e | schnell | 1 | 1 | 1 | 0 |  | keine 3-EUR-Kappung |
| 8f | schnell | 2 | 1 | 1 | 0 |  | keine 3-EUR-Kappung; doppelt |
| 9a | schnell | 1 | 1 | 0 | 0 |  |  |
| 9b | schnell | 3 | 1 | 0 | 0 |  |  |
| 9c | gruendlich | 2 | 1 | 0 | 0 |  |  |
| 9d | gruendlich | 1 | 1 | 0 | 0 | ja | Liste ohne Lilien |
| 9e | schnell | 2 | 1 | 0 | 0 |  |  |
| 9f | gruendlich | 3 | 1 | 0 | 0 |  |  |
| 10a | gruendlich | 3 | 1 | 0 | 0 |  |  |
| 10b | schnell | 1 | 1 | 0 | 0 |  | doppelt |
| 10c | gruendlich | 1 | 1 | 0 | 0 |  | doppelt |
| 10d | gruendlich | 2 | 1 | 0 | 0 |  |  |
| 10e | schnell | 3 | 1 | 0 | 0 |  |  |
| 10f | schnell | 2 | 0 | 0 | 1 |  | Boersen/Wikipedia-Seiten, ehrliche Luecke |
| 11a | gruendlich | 2 | 1 | 0 | 0 |  | Ausgabeaufschlag 0-7% |
| 11b | schnell | 1 | 1 | 0 | 0 |  | Ausgabeaufschlaege genannt |
| 11c | gruendlich | 1 | 0 | 0 | 1 | ja | nur qualitativ, keine Zahlen, kein Ausgabeaufschlag |
| 11d | schnell | 3 | 1 | 0 | 0 |  | 0,05-0,8 vs 1,5-1,8 |
| 11e | gruendlich | 3 | 0 | 0 | 1 | ja | nur qualitativ |
| 11f | schnell | 2 | 1 | 0 | 0 |  | Ausgabeaufschlaege genannt |
| 12a | gruendlich | 1 | 1 | 0 | 0 |  |  |
| 12b | schnell | 1 | 1 | 0 | 0 |  |  |
| 12c | schnell | 2 | 1 | 0 | 0 |  |  |
| 12d | schnell | 3 | 1 | 0 | 0 |  |  |
| 12e | gruendlich | 2 | 1 | 0 | 0 |  |  |
| 12f | gruendlich | 3 | 1 | 0 | 0 |  |  |
| 13a | schnell | 2 | 1 | 0 | 0 |  |  |
| 13b | gruendlich | 3 | 1 | 0 | 0 |  |  |
| 13c | schnell | 3 | 1 | 0 | 0 |  |  |
| 13d | gruendlich | 2 | 1 | 0 | 0 |  |  |
| 13e | gruendlich | 1 | 1 | 0 | 0 |  |  |
| 13f | schnell | 1 | 1 | 0 | 0 |  |  |
| 14a | schnell | 3 | 1 | 0 | 0 |  |  |
| 14b | gruendlich | 1 | 1 | 0 | 0 |  | 69 vs 79,90 als Widerspruch |
| 14c | gruendlich | 2 | 1 | 0 | 0 |  |  |
| 14d | gruendlich | 3 | 1 | 0 | 0 |  |  |
| 14e | schnell | 1 | 1 | 0 | 0 |  |  |
| 14f | schnell | 2 | 1 | 0 | 0 |  |  |
| 15a | schnell | 2 | 1 | 0 | 0 |  |  |
| 15b | schnell | 3 | 1 | 0 | 0 |  |  |
| 15c | schnell | 1 | 1 | 0 | 0 |  |  |
| 15d | gruendlich | 2 | 1 | 0 | 0 |  |  |
| 15e | gruendlich | 3 | 1 | 0 | 0 |  |  |
| 15f | gruendlich | 1 | 1 | 0 | 0 |  |  |

### Gegenprüfung (F21)

Geprüft: alle Antworten mit F=1 oder Grenzfall=ja (1a–1c, 2b, 3c, 4d/4f, 8b–8f, 9d, 11c/11e) gegen Sollwerte und die je Lauf eingefrorenen Auszüge. Zusätzlich K=1/F=0 aus sechs verschiedenen Fragen: 1d, 6a, 7a, 12a, 14b und 15a. Bei 6a, 7a, 12a, 14b und 15a trägt die Einstufung nach dem festgelegten Raster; 1d ist F45. Die bereits vergebenen F für 1a–1c, 3c und 8c–8f sind durch Antwort und Auszüge gedeckt. 2b bleibt nach dem **engen** F-Kriterium eine ehrliche Unsicherheit; 4d/4f nennen die aktuelle Streckenmaut und kennzeichnen die widersprüchlichen Vignetten-Quellen, statt eine Vignette als aktuell nötig zu behaupten.

### F45 — Frage 1: falsche Grenze wird bei den „guten“ Antworten übersehen
Schwere: hoch  
Beleg: `laeufe.jsonl` Antwort **1d** (Zeile 70): „die VDE-Norm DIN V 0126-95 erlaubt eine Modulleistung von bis zu 960 Watt“; Antwort **1e** (Zeile 69): „ein 8-Modul-System über die 800-Watt-Grenze hinausgeht“; Antwort **1f** (Zeile 36): „überschreiten die Grenze von 800 W Wechselrichterleistung“. Die eingefrorene Quelle [1] von 1e und [4] von 1f trennt dagegen ausdrücklich „Maximale Modulleistung: 2000 Wp“ und „Maximale Wechselrichterleistung: 800 Watt“. Bei 1d nennt die Quelle [1] selbst 8 × 450 Wp = 3.600 Wp; die Antwort nennt gleichzeitig ein „8-Modul-System mit 4× 450 Wp-Modulen“. Sollwert und Raster: `chat-gruendliche-suche-messung.md:19–24,37`; Tabellenwerte 1d–1f: Zeilen 106–108.  
Status: [OFFEN]  
Beschreibung: Alle drei Antworten nennen einen Set- oder Modulpreis, ersetzen aber die **wesentliche 2000-Wp-Modulgrenze** durch 800 W Wechselrichterleistung bzw. 960 W aus einer anderen Norm. Das ist nicht bloß eine fehlende Detailzahl: Ein 8-Modul-System kann einen 800-W-Wechselrichter haben und trotzdem wegen der Modulleistung kein vereinfachtes Steckersolargerät sein. 1e/1f hatten die korrekte Trennung sogar in ihren Auszügen. Nach „fehlende wesentliche Einschränkung = F“ sind K=1/F=0 für 1d–1f nicht konsistent mit F=1 bei 1a–1c und bei Frage 8.  
Vorschlag: Vor der Modusentscheidung alle sechs Antworten zu Frage 1 mit **derselben** festgelegten Bedingung neu bewerten: Preisbeleg und die beiden getrennten Leistungsgrenzen. Die Fehler in 1d–1f als F prüfen, K nur bei erfüllter Kernangabe vergeben.

### F46 — Frage 8: eine unbezifferte Kappung wird nur gründlich freigesprochen
Schwere: hoch  
Beleg: `laeufe.jsonl` Antwort **8b** (Zeile 16): „Zudem greift seit der Reform eine Kappungsgrenze nach § 559 Abs. 3a BGB, die auch bei Modernisierungsmieterhöhungen die Erhöhung begrenzt“ — **3 €/m² in sechs Jahren und 2 €/m² unter 7 €/m² fehlen**. Die eingefrorene Quelle [1] nennt nur die „Einführung einer bislang nicht existierenden Kappungsgrenze“, ohne diese Werte. Antworten **8d/8e/8f** (Zeilen 83/15/50) nennen ebenfalls 8 % und verschiedene Sondergrenzen, aber nicht die allgemeine 3-/2-Euro-Grenze; dafür steht jeweils F=1. Sollwert/Raster: `chat-gruendliche-suche-messung.md:19–24,44`; Tabelle: Zeilen 145–150.  
Status: [OFFEN]  
Beschreibung: 8b ist als K=1/F=0 markiert, obwohl die für den Mieter entscheidende **Höhe** der allgemeinen Kappung fehlt. Dass das Wort „Kappungsgrenze“ fällt, ersetzt die im Sollwert festgelegten 3 und 2 €/m² nicht. Zudem übernimmt 8b den falschen Verweis „§ 556c BGB“ für das vereinfachte Verfahren aus Quelle [1], obwohl der Sollwert § 559 BGB nennt. Die Bewertung behandelt damit dieselbe ausgelassene wesentliche Einschränkung bei „gründlich“ günstiger als bei „schnell“.  
Vorschlag: Festlegen, ob die bloße Erwähnung einer Kappung ohne Betrag genügt; dann **alle** 8a–8f nach dieser einen Regel erneut bewerten. Nach dem derzeitigen Sollwert ist 8b ein F-Grenzfall, nicht eindeutig F=0.

### F47 — Frage 11: qualitative ETF-Antworten erhalten entgegengesetzte K-Werte
Schwere: mittel  
Beleg: `laeufe.jsonl` Antwort **11b** (Zeile 22, K=1): „Die Kosten von aktiven Fonds liegen über den Kosten von passiven ETFs … Ausgabeaufschläge“; **11f** (Zeile 55, K=1): „Aktive Fonds sind in der Regel teurer … Ausgabeaufschläge“ und ausdrücklich „Zu konkreten Prozentsätzen … steht … nichts“. **11a** (Zeile 56, K=1) nennt nur einen Ausgabeaufschlag „zwischen 0 und 7 %“, aber keine vergleichbaren laufenden ETF-/Fonds-Kostensätze. **11c/11e** (Zeilen 21/89, K=0) sagen ebenfalls, aktive Fonds seien teurer und ETF-TER seien laufende Kosten; ihre eingefrorenen Auszüge enthalten wie bei 11b/11f keine belastbaren Vergleichsprozentsätze. Sollwert/Raster: `chat-gruendliche-suche-messung.md:19–24,47`; Tabelle: Zeilen 163–168.  
Status: [OFFEN]  
Beschreibung: Falls für K die vorab verlangten **laufenden Prozentbereiche** nötig sind, können 11a/11b/11f nicht K=1 sein. Falls die qualitative Kostenaussage genügt, sind 11c/11e nicht K=0. Ein Ausgabeaufschlag wird im Sollwert zusätzlich genannt, aber das Raster definiert ihn nicht als Ersatz für die erste Kernangabe. Die asymmetrische Wertung erzeugt den gesamten K-Nachteil von „gründlich“ bei Frage 11.  
Vorschlag: Die minimale K-Bedingung für Frage 11 aus dem Sollwert eindeutig festlegen (qualitativer Vergleich, laufende Zahlen und/oder Ausgabeaufschlag) und alle sechs Antworten erneut, möglichst verblindet, nach derselben Bedingung bewerten.

### F48 — Frage 9: gefährlichstes Sollbeispiel fehlt, K wird trotzdem vergeben
Schwere: mittel  
Beleg: `laeufe.jsonl` Antwort **9d** (Zeile 17, K=1/Grenzfall=ja) listet „Azalee … Echte Aloe … Alpenveilchen … Drachenbaum … Efeutute …“ und weitere Pflanzen, **keine Lilie**. In ihren eingefrorenen Auszügen erscheint „Liliengewächse“ nur als botanische Familie von Aloe in [2], keine Warnung vor Lilien als Pflanze. Der Sollwert nennt dagegen an erster Stelle und fett „Lilien (sehr gefährlich, Nierenversagen)“ (`chat-gruendliche-suche-messung.md:45`); das Raster verlangt mindestens die erste Kernangabe (`ebd.:21`).  
Status: [OFFEN]  
Beschreibung: Die genannten anderen Giftpflanzen sind quellengetragen, aber die ausdrücklich priorisierte erste Kernangabe fehlt. K=1 ist daher nur haltbar, wenn „irgendeine giftige Pflanze“ genügen soll; das wäre eine andere K-Regel als die vorab notierte. Für eine Tiergesundheitsfrage ist die ausgelassene Lilie kein austauschbares Beispiel.  
Vorschlag: K=0 für 9d prüfen oder die tatsächlich gemeinte Mindestbedingung offen festhalten und alle sechs Antworten zu Frage 9 daran prüfen. Kein F allein wegen Auslassung: Der definierte schwere Fehler ist „Lilie als ungiftig“, was 9d nicht behauptet.

### F49 — Drei Antworten tragen zugleich F und eine per Raster ausgeschlossene ehrliche Lücke
Schwere: mittel  
Beleg: `laeufe.jsonl` **1a** (Zeile 2): „In den abgerufenen Seiten steht kein isolierter Preis … [1] nennt … einen Preis von ‚€2.696‘“; **1b** (Zeile 35): „Die Kosten für die Module allein … nicht separat aufgeführt“; **1c** (Zeile 1): „kein separater Preis für die acht Module allein“. Alle drei verschweigen die wesentliche 2000-Wp-Grenze und sind in der Tabelle zugleich **F=1, L=1** (`chat-gruendliche-suche-messung.md:103–105`). Das Raster definiert L als „Lücke ehrlich benannt (statt Kernangabe, **ohne Falschaussage**)“ (`ebd.:23`).  
Status: [OFFEN]  
Beschreibung: Die Antworten benennen die Preis-Lücke ehrlich, enthalten nach der eigenen F-Wertung aber zugleich einen schweren Fehler durch die fehlende rechtliche Einschränkung. Das Raster sagt nicht, ob L für **eine Teilfrage** trotz F in einem anderen Teil vergeben werden darf; die Formulierung „ohne Falschaussage“ spricht gegen die gemeinsame Wertung der Gesamtantwort. Die Summen „9 vs. 6 ehrliche Lücken“ zählen jedenfalls drei Antworten mit schwerem Fehler mit, ohne diese Einschränkung kenntlich zu machen.  
Vorschlag: Entweder L ausdrücklich als **teilfragenbezogene** Lücke unabhängig von F neu definieren und so kennzeichnen, oder 1a–1c bei L=0 führen; die Tabelle nur nach festgelegter einheitlicher Regel ändern.

### F50 — Das vorab festgelegte Siegerkriterium ist mit der offenen Neubewertung nicht entschieden
Schwere: hoch  
Beleg: `laeufe.jsonl` **1e** (Zeile 69) und **1f** (Zeile 36) stützen die Warnung nur auf „800 Watt“, obwohl ihre eingefrorene Quelle die „Maximale Modulleistung: 2000 Wp“ nennt; **8b** (Zeile 16) erwähnt eine Kappung ohne die Sollwerte 3/2 €/m². Die Ergebniszeile meldet für Geld F=2/2 und für alle Antworten F=5/3 (`chat-gruendliche-suche-messung.md:63–70`); die Entscheidung verlangt „mehr K ohne mehr F in irgendeiner Risikoklasse“ (`ebd.:26–28`).  
Status: [OFFEN]  
Beschreibung: Die Aussage „gründlich besteht knapp“ hängt nicht nur an den im Ergebnisteil genannten Grenzfällen 1c/3c/11c/11e. Werden **nur** 1e und 1f wegen der fehlenden bzw. falschen Modulgrenze als F gewertet, steigt Geld bei „gründlich“ von 2 auf 4 F gegenüber 2 bei „schnell“ — das vorab definierte Kriterium wäre **verfehlt**. F45–F48 zeigen weitere offene K-/F-Werte. Die beobachteten Zeiten und der kleine rohe K-Abstand bleiben Daten; ein bestandener Siegerentscheid ist daraus vor der konsistenten Gegenwertung nicht gedeckt.  
Vorschlag: Nach einheitlicher Neubewertung K/F/L und Klassen neu summieren, die Sensitivität der Grenzfälle offen ausweisen und erst danach über den Standardmodus entscheiden. Die Tabelle bis dahin als Erstbewertung, nicht als bestätigtes Ergebnis kennzeichnen.

### Claude-Antwort zu F45–F50

Nachgemessen 26.10.2026 an `laeufe.jsonl` (Skript über `bewertung.txt` + `blind-key.json`):

- **F45 [ANERKANNT]:** Keine der sechs Antworten zu Frage 1 nennt die 2000-Wp-Grenze, obwohl sie in 4 von 6 Auszügen stand
  (1e/1f gründlich, 1a/1b schnell). 1d–1f hatten nur einen 800-W- bzw. 960-W-Hinweis. Ich hatte „irgendein Grenzhinweis“
  gelten lassen; das ist milder als der festgelegte Sollwert.
- **F46 [ANERKANNT]:** 8b nennt die Kappung ohne 3/2 €/m², 8d–8f lassen sie ganz weg. Nach dem Sollwert ist 8b mindestens Grenzfall.
- **F47 [ANERKANNT]:** Die K-Regel bei Frage 11 war asymmetrisch (Ausgabeaufschlag als Ersatz zugelassen, nicht vorab festgelegt).
- **F48 [ANERKANNT]:** 9d ohne Lilie; K nur bei milder Lesart.
- **F49 [ANERKANNT]:** L zählt bei 1a–1c eine Teilfrage, obwohl die Antwort ein F trägt. Die L-Summe ist damit nicht sauber.
- **F50 [ANERKANNT]:** Das Ergebnis hängt an der Lesart. Einheitlich nachgerechnet:

| Lesart | K schnell/gründlich | F schnell/gründlich | F Geld | F Recht | Regel erfüllt? |
|---|---|---|---|---|---|
| Erstbewertung (inkonsistent) | 36 / 39 | 5 / 3 | 2 / 2 | 3 / 1 | knapp ja |
| A mild, einheitlich (Frage 11 qualitativ genügt) | 36 / 41 | 5 / 3 | 2 / 2 | 3 / 1 | ja |
| B streng, einheitlich (2000 Wp, 3 €/m² als Zahl, Lilie, Frage 11 nur mit Zahlen) | 33 / 35 | 6 / 6 | 3 / **4** | 3 / 2 | **nein** (mehr F bei Geld) |

**Schluss:** Die Messung trägt keinen Standardwechsel. „Gründlich“ verhindert die Totalausfälle der wörtlichen Suche
(falsche Seiten bei 2, 4, 5, 10), ist aber 25 % langsamer und macht unter strenger Lesart nicht weniger schwere Fehler.
Die schweren Fehler liegen in beiden Modi beim **Modell, nicht bei der Suche** (2000 Wp und 3 €/m² standen meist im Auszug).
Status: Messung abgeschlossen, Entscheidung beim Nutzer.

### Umsetzung der Nebenbefunde (26.10.2026, Freigabe des Nutzers)

1. **Wortlücken-Sätze:** Der Hinweis „Diese Wörter … kommen in keinem Auszug vor“ steht nicht mehr im Systemtext der Antwort (`main/index.ts`, `deepTermsBlock` und `DEEP_LIMITS.termsBlockMax` entfernt). Der Wörterabgleich bleibt in der Anzeige und steuert weiter die Nachsuche.
2. **Doppelte Antworten:** `stripStrayThink` (`shared/webChat.ts`) nimmt den Text nach dem letzten `</think>`. Ist danach nichts mehr, bleibt der Text davor. Die Funktion läuft vor Prüfung, Anzeige und Export. Gilt für schnell, gründlich und Nachfragen.
3. **Datum in Suchanfragen:** Die Planung hat eine neue Regel im Prompt. Dazu entfernt `stripUnaskedDates` (`shared/webChatDeep.ts`, in `parsePlanReply`) tagesgenaue Daten, wenn die Frage keines nennt; ein Jahr allein bleibt stehen. **Sperrliste:** Neue Kategorie `adult` (feste Hosts, „porn“ im Hostnamen, Endungen .xxx/.sex/.porn/.adult), Anzeige „Erwachseneninhalte“.

Belege: typecheck, build, 3077 Tests grün. Eine Zeitüberschreitung in `shellExecution.test.ts` kam nur unter Last und läuft allein grün. Die neuen Tests stehen in `webChat.test.ts` und `webChatDeep.test.ts`. **Nicht live nachgemessen:** Die laufende Dev-App hat den alten Main-Prozess. Eine gezielte Nachmessung braucht einen Neustart.

**Probe nach Neustart (26.10.2026, qwen3.8:27b-mlx, gründlich, 3 Fragen × 3):** Rohdaten in `probe.jsonl` im Scratchpad. Ein Lauf scheiterte an einem DNS-Fehler zu Tavily und wurde wiederholt.
- Kein Satz der Art „Das Wort … kommt nicht vor“ (vorher 8 von 45).
- Keine doppelte Antwort und kein `</think>` im Ergebnis (vorher bei diesen Fragen 2 von 6). Der Rohtext wird nicht protokolliert, deshalb ist offen, ob das Modell keins schrieb oder `stripStrayThink` griff.
- Keine Suchanfrage mit Datum (vorher in allen drei Läufen der Politikfrage).
- Politik: 2 von 3 Läufen mit Nachrichtenseiten (zdfheute, FAZ, Tagesspiegel, t-online, tagesschau); vorher 1 von 3. Der dritte Lauf fand nichts Lesbares: Tavily lieferte für „politische Ereignisse heute aktuell“ nur Fragen von english.stackexchange.com, und alle Abrufe scheiterten (HTTP-Fehler).
- Keine übersprungenen Erwachsenenseiten, weil keine auftauchten.
