# Strategische Einordnung von MindGraph Notes — Dialog Nutzer ↔ Codex (20.09.2026)

> Übergabe aus einem Dialog zwischen dem Nutzer und Codex, hier unverändert festgehalten; Claudes Einordnung steht am Ende. Kein Implementierungsauftrag.

## Gemeinsamer Kern

Die Stärke liegt nicht in „noch einem Chat mit Dokumenten“, sondern in der Verbindung von lokalem Wissen, konkreten Arbeitsergebnissen, kontrollierten Aktionen und nachvollziehbarer Verarbeitung.

KI soll deterministische Verfahren nicht verdrängen:
- Das Modell versteht Aufträge und unstrukturierte Inhalte.
- Programmcode übernimmt Berechnung, Filterung, Validierung und Speicherung.
- Der Nutzer entscheidet bei Unklarheiten und übernimmt Ergebnisse.

Erfolg bedeutet weniger menschliche Arbeitszeit **einschließlich Prüfung und Korrektur**, bei mindestens gleicher Ergebnisqualität.

„Eine Art internes Palantir“ beschreibt die Richtung, nicht den erreichten Funktionsumfang. Als stärkstes praktisches Werkzeug hat Codex den Notiz-Agenten mit Ordnerauswertung und deterministischer Tabellenzusammenführung eingeordnet. Der Vault-Chat ist besonders wichtig für Vertrauen und Quellenkontrolle.

## Zusätzlicher Slogan

Vom Nutzer ausdrücklich positiv aufgenommen, als Ergänzung, nicht als Ersatz des bisherigen:

**„Ein lokaler Wissens- und Arbeitsraum, in dem KI-Arbeit nachvollziehbar bleibt.“**

## Marktvergleich

- NotebookLM: quellenbezogene Recherche und Zitate.
- Claude/Cowork: mehrstufige Arbeit und fertige Dokumente.
- Microsoft 365 Copilot: Analyse im bestehenden Unternehmenskontext.
- AnythingLLM: lokale Dokumenten-KI und Agenten.
- Palantir AIP/Foundry: Daten, operative Aktionen und Auditierung.

Fazit: Weder Quellenangaben noch lokale Modelle sind allein einzigartig. Eine mögliche Differenzierung ist der **vollständige, einfach prüfbare Arbeitsablauf**. Eine Überlegenheit gegenüber Wettbewerbern ist bisher nicht durch Vergleichstests belegt.

## Codeprüfung durch Codex (Stand `d8270ef0`, fokussierte Bestandsaufnahme, kein Sicherheitsaudit)

Bereits vorhanden: Vault-Chat erzwingt lokale Modelle einschließlich Prüfung auf entfernte Ollama-Modelle; Quellenfrische über Inhaltsprüfsummen und eindeutige Wiederzuordnung von Textstellen; Prüfung von Zitatnummern, wörtlichen Zitaten und Wortdeckung; Notiz-Agent erzeugt Ergebnisse zunächst im Zwischenbereich, Übernahme durch den Nutzer, kollisionsfreie Dateinamen; Tabellenzusammenführung durch Programmcode mit Quelldatei pro Ergebniszeile und Zusatzblatt für problematische Dateien; sichtbare Werkzeugschritte und Fehler; dauerhafte Arbeitsbilanz mit Prüfaufwand und Fehlversuchen; KI-Kennzeichnung mit Modell und Datum.

Grenzen: Nicht alle Funktionen arbeiten ausschließlich lokal (Cloud-Anbieter in anderen Modulen möglich); Wortdeckung ist kein semantischer Wahrheitsnachweis; Freigaben des Notiz-Agenten sind kein universelles Freigabesystem für alle App-Aktionen.

## Drei zentrale Lücken

1. **Dauerhafter Arbeitsnachweis.** Agentenläufe liegen überwiegend im Arbeitsspeicher mit begrenzter Aufbewahrung; das dauerhafte Tätigkeitsprotokoll ist bewusst inhaltsarm. Modell und Datum bleiben, aber nicht durchgängig Auftrag, damalige Quellenstände, Werkzeugparameter, Fehler, Prüfungen und Ergebniszuordnung. „Während der Arbeit nachvollziehbar“ ist weiter als „Wochen später vollständig nachprüfbar“.
2. **Durchgängige Herkunftskette.** Vault-Zitate reichen bis zur Textstelle; Agentenquellen sind überwiegend Listen gelesener Dateien; Tabellen tragen Quelldateinamen, aber keine vollständige Zuordnung auf Originalblatt und -zeile samt Verarbeitungsschritten. Auch deterministische Verarbeitung ist falsch, wenn das Modell falsche Spalten oder Filter wählt.
3. **Belastbarer Qualitätsnachweis.** Phase 3 misst inzwischen; die Holdout-Prüfung steht aus.

## Empfohlene Reihenfolge (kein Implementierungsauftrag)

1. Phase 3 abschließen: Retrieval, Verweigerung und Aussagequalität prüfen.
2. Einen datenschutzbewusst gestalteten, dauerhaften Arbeitsnachweis pro Ergebnis ergänzen.
3. Einen konkreten Ablauf vollständig nachvollziehbar machen, beispielsweise Rückmeldungen → Gesamttabelle → Problemliste → geprüfte Zusammenfassung.

**Schlussgedanke: Der nächste große Schritt ist nicht „mehr Agent“, sondern der Übergang vom sichtbaren Arbeitsfortschritt zum dauerhaft prüfbaren Arbeitsergebnis.**

## Claudes Einordnung (20.09.2026)

- Den drei Lücken und der Reihenfolge stimme ich zu. Lücke 1 lässt sich ohne Bruch mit der Ehrlichkeitsregel der Arbeitsbilanz lösen: nicht das Logbuch anreichern, sondern **pro übernommenem Ergebnis** einen Nachweisblock schreiben (Auftrag, Modell, Quellen mit Inhaltsprüfsumme und Zeile, Werkzeugschritte mit Parametern, Prüfergebnisse, Fehlversuche) — als Datei neben dem Ergebnis oder als Frontmatter/Callout, im Vault, also beim Nutzer. Der Vault-Chat hat die Bausteine dafür schon (sourceHash, chunkHash, Zeile, Prüfzeile).
- Lücke 2 ist die Verlängerung derselben Idee auf `collect_table`: Quelldatei, Blatt, Zeile und die gewählte Spaltenzuordnung pro Ergebniszeile mitführen.
- Zur Zahl „keiner der zwölf Negativfälle verweigert“: das gilt für den Floor 0,30. Mit Floor 0,50 verweigert die Suche 9 von 12 bei einem verlorenen Positivfall; die drei restlichen liegen thematisch im Vault und müssen vom Antwortmodell verweigert werden — genau das misst der `--answer`-Durchlauf mit Handbewertung.
- Reihenfolge bleibt: erst Phase 3 mit Holdout, dann Arbeitsnachweis als eigenes Vorhaben mit Plan und Codex-Review.
