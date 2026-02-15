---
title: "Preiskampf, Sicherheitskrise und das Web als KI-Datenbank"
subtitle: "Chinesische Modelle druecken die Preise, xAI verliert Gruender wegen Sicherheitsbedenken, und Google will das Web fuer KI-Agenten umbauen"
author: Jochen Leeder
date: 2026-02-14
created: 2026-02-14 22:00:00
modified: 2026-02-14 22:00:00
tags:
  - ki
  - preiskampf
  - sicherheit
  - xai
  - anthropic
  - google
  - webmcp
  - deepseek
  - bytedance
  - blog
status: publish
type: post
summary: Chinesische KI-Labore unterbieten westliche Anbieter um den Faktor 10, bei xAI fliehen Gruender wegen fehlender Sicherheitsstandards, und Google skizziert mit WebMCP eine Zukunft, in der das Web zur strukturierten Datenbank fuer autonome KI-Agenten wird.
categories:
  - KI
  - Technologie
---

> [!abstract] Die KI-Branche unter Druck
> Chinesische Labore setzen westliche Anbieter mit Modellen unter massiven Preisdruck, die bei vergleichbarer Leistung nur einen Bruchteil kosten. Gleichzeitig offenbart der Exodus bei xAI tiefgreifende Sicherheitsprobleme, waehrend Anthropic-CEO Dario Amodei OpenAI vorwirft, die eigenen Risiken nicht zu verstehen. Und Google skizziert mit WebMCP eine Zukunft, in der das Web zur strukturierten Schnittstelle fuer KI-Agenten wird.

## Wenn Intelligenz zur Massenware wird

Mitte Februar 2026 verdichten sich Entwicklungen, die die KI-Branche in den kommenden Monaten praegen werden. Die vielleicht folgenreichste Nachricht kommt aus China: ByteDance hat mit **Seed2.0** eine Modellfamilie veroeffentlicht, die in Benchmarks mit westlichen Spitzenmodellen mithalt -- zu einem Bruchteil der Kosten.

Die Zahlen sind drastisch: Seed2.0 Pro kostet 0,47 Dollar pro Million Input-Tokens, waehrend Claude Opus 4.5 bei 5 Dollar und GPT-5.2 bei 1,75 Dollar liegt. Das ist eine Preisdifferenz um den Faktor 10. Das Modell erreicht in internationalen Mathematik- und Programmierwettbewerben Goldmedaillen-Niveau und fuehrt bei visuellen Wahrnehmungsaufgaben. Schwaechen zeigen sich bei der Halluzinationsvermeidung -- aber fuer viele Anwendungsfaelle sind diese Unterschiede irrelevant.

Nahezu zeitgleich hat **MiniMax** mit dem M2.5 nachgelegt und verspricht "Intelligence too cheap to meter" -- eine Anspielung auf die historische Prognose, Strom wuerde eines Tages zu billig sein, um ihn abzurechnen. Das Muster ist klar: Chinesische Labore unterbieten westliche Anbieter systematisch und zwingen OpenAI, Anthropic und Google zum Umdenken.

Die Frage ist nicht mehr, ob KI-Inferenz zur Commodity wird, sondern wie schnell.

## Sicherheit unter Druck: xAI im freien Fall

Waehrend der Preiskampf tobt, offenbart sich an anderer Stelle eine Krise, die schwerer wiegt als Margen: die Frage nach Sicherheit.

Bei **xAI** haben etwa die Haelfte der Mitgruender das Unternehmen verlassen. Elon Musk spricht von Umstrukturierung fuer mehr Geschwindigkeit, aber ehemalige Mitarbeiter zeichnen ein anderes Bild:

> [!warning] Keine Sicherheitskultur
> "There is zero safety whatsoever in the company", berichtet ein Ex-Angestellter. Grok sei bewusst mit minimalen Sicherheitsvorkehrungen ausgestattet worden -- Musk habe Schutzmechanismen als Zensur betrachtet.

Das Modell hat unter anderem sexualisierte Bilder von Minderjaehrigen generiert. Mitarbeiter beschreiben eine Kultur, in der Widerspruch unterdrueckt wird: "You survive by shutting up and doing what Elon wants." Mehrere Gruender haben mit Mitteln aus einer SpaceX-Fusion eigene Startups gegruendet -- xAI verliert nicht nur Koepfe, sondern auch institutionelles Wissen.

Am anderen Ende des Spektrums steht **Anthropic-CEO Dario Amodei**, der OpenAI vorwirft, die eigenen Risiken nicht zu verstehen: "They're just doing stuff because it sounds cool." Seine Sorge gilt der Infrastruktur-Wette: Anthropic plant 10+ Gigawatt an Rechenkapazitaet, OpenAI hat Partnerschaften ueber 36 Gigawatt angekuendigt. Selbst wenn man nur ein Jahr danebenliegt mit den Umsatzprognosen, drohe der Bankrott.

Dabei waechst Anthropic selbst rasant: von null auf 100 Millionen Dollar Umsatz in 2023, eine Milliarde in 2024, und aktuell 14 Milliarden annualisiert Anfang 2026. Das Unternehmen rekrutiert gezielt ehemalige Google-Infrastrukturexperten, um eigene Rechenzentren aufzubauen.

## Distillation: Wenn Modelle ihre eigenen Klone erzeugen

Ein weiteres Sicherheitsthema betrifft den Schutz geistigen Eigentums -- ironischerweise bei Unternehmen, die ihre Modelle selbst mit fremden Daten trainiert haben.

**Google** berichtet von ueber 100.000 gezielten Anfragen in einer einzigen Kampagne, die darauf abzielten, Geminis internes Reasoning zu extrahieren. **OpenAI** beschuldigt DeepSeek in einem Memo an den US-Kongress, amerikanische Modelle kopiert zu haben.

Die Technik heisst **Distillation**: Man flutet ein Modell mit Prompts, extrahiert dessen Denkprozesse und trainiert damit ein eigenes, guenstigeres System. So lassen sich Milliarden an Trainingskosten umgehen. Die Ironie entgeht niemandem: Dieselben Unternehmen, die ihre Modelle mit massiven Mengen fremder Daten trainiert haben, beklagen sich nun ueber den Diebstahl ihres geistigen Eigentums.

## WebMCP: Das Internet wird zur KI-Datenbank

Google skizziert mit **WebMCP** eine Entwicklung, die das Internet grundlegend veraendern koennte. Das Projekt implementiert das Model Context Protocol fuer Web-Interaktionen: Statt HTML zu parsen, kommunizieren KI-Agenten ueber standardisierte Schnittstellen direkt mit Webseiten.

> [!info] Was WebMCP ermoeglicht
> WebMCP definiert strukturierte Tools, mit denen Agenten Fluege buchen, Support-Tickets erstellen oder Produkte suchen koennen -- ohne eine Webseite visuell "verstehen" zu muessen. Das System nutzt eine deklarative API fuer einfache Formulare und eine imperative API fuer komplexe JavaScript-Prozesse.

Die Konsequenzen sind weitreichend: Wenn KI-Agenten Suchen, Vergleiche und Buchungen autonom abwickeln, verlieren Webseiten ihren direkten Nutzerkontakt -- und damit Werbeeinnahmen und Kundenbeziehungen. Das Web wird zur "Hintergrund-Infrastruktur". Gleichzeitig bleiben erhebliche Sicherheitsluecken: Prompt-Injection-Angriffe sind weitgehend ungeloest. Selbst Claude Opus 4.5 scheitert bei gezielten Attacken in rund 30 Prozent der Faelle.

## Am Rande: Urheberrecht und Voegel, die Wale finden

Ein **deutsches Gericht** hat entschieden, dass KI-generierte Logos keinen Urheberrechtsschutz geniessen. Das Urheberrecht schuetze "nicht Investition, Zeitaufwand oder Sorgfalt, sondern nur das Ergebnis einer schoepferischen Taetigkeit". Aufwendige Prompts allein genuegen nicht -- die Arbeit muss die "Persoenlichkeit des Prompters" widerspiegeln.

Auf der wissenschaftlichen Seite zeigt **Google DeepMinds Perch 2.0**, wie maechtig Generalisierung sein kann. Das Modell wurde mit 1,5 Millionen Tieraufnahmen trainiert -- fast ausschliesslich Voegel. Trotzdem uebertrifft es spezialisierte Wal-Erkennungsmodelle bei der Klassifikation von Orca-Subpopulationen. Der Grund: Vogelakustik erfordert extrem feinkoernige Unterscheidungen, und Voegel und Meeressaeuger haben unabhaengig voneinander aehnliche Schallmechanismen entwickelt.

## Wohin das fuehrt

Die KI-Branche bewegt sich auf mehreren Achsen gleichzeitig: Chinesische Modelle machen Intelligenz zur Massenware. Die xAI-Krise zeigt, dass Geschwindigkeit ohne Sicherheitskultur in die Katastrophe fuehren kann. Anthropics Amodei warnt vor einer Infrastrukturblase, waehrend sein Unternehmen selbst hunderte Milliarden investiert. Und Google bereitet mit WebMCP eine Zukunft vor, in der das Web nicht mehr fuer Menschen, sondern fuer Agenten gebaut wird.

Die verbindende Frage hinter all dem: **Wer kontrolliert die naechste Infrastruktur -- und zu welchem Preis?**

Parallel warnen die **Friedrich-Ebert-Stiftung** und Stimmen aus der KI-Beratungsbranche vor blinden Flecken: Generative KI reproduziert bestehende Diskriminierungsmuster, und die "Post-Labor Economy" wirft Fragen auf, die weit ueber Technologie hinausgehen. Ein wichtiger Kontrapunkt zur technologischen Euphorie.

---

**Quellen:** [THE DECODER](https://the-decoder.com/) (ByteDance Seed2.0, MiniMax M2.5, xAI Exodus, Amodei vs OpenAI, Distillation Attacks, WebMCP, Anthropic Infrastructure, AI Copyright, DeepMind Perch 2.0) | [KI-Beratung](https://www.kiberatung.de/blog) | [FES Digitales Lernen](https://www.fes.de/digitales-lernen/digitales-lernen-der-blog)
