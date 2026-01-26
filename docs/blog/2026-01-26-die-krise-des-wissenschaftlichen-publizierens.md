---
title: "Paper Mills, Fake Journals und die Erosion des Vertrauens"
subtitle: "Teil 2 der Serie: Epistemische Disruption"
author: Jochen Leeder
date: 2026-01-26
created: 2026-01-26 12:30:00
modified: 2026-01-26 12:30:00
tags:
  - ki
  - wissenschaft
  - publishing
  - paper-mills
  - desci
  - peer-review
  - forschung
  - blog
status: publish
type: post
summary: LLMs haben das Geschäftsmodell wissenschaftlicher Betrüger revolutioniert. Die Produktion gefälschter Wissenschaft ist skalierbar geworden. Wie reagieren Verlage – und welche radikalen Alternativen entstehen?
categories:
  - Wissenschaft
  - Technologie
---

> [!abstract] Die Industrialisierung des Betrugs
> Während KI im persönlichen Bereich als Effizienzgewinn gefeiert wird, hat sie im Kontext der Wissenschaft eine Integritätskrise ausgelöst. Das Vertrauen in die wissenschaftliche Aufzeichnung erodiert – mit weitreichenden Folgen.

## Die Skalierung der Täuschung

Das Phänomen der "Paper Mills" – Organisationen, die Autorschaften auf gefälschten Studien verkaufen – existierte bereits vor der generativen KI. Doch Large Language Models haben das Geschäftsmodell dieser Betrüger revolutioniert.

Vor 2023 mussten Paper Mills auf "Spinbots" zurückgreifen, die Texte umschrieben, um Plagiatssoftware zu täuschen. Das führte zu den berüchtigten "tortured phrases" – gequälte Phrasen, bei denen etablierte Begriffe durch bizarre Synonyme ersetzt wurden. "Counterfeit consciousness" statt "artificial intelligence". Solche Absurditäten waren relativ leicht zu erkennen.

LLMs hingegen generieren Texte, die grammatikalisch perfekt und stilistisch überzeugend sind. Sie halluzinieren Daten, Referenzen und Experimente, die für einen menschlichen Leser auf den ersten Blick plausibel wirken.

> [!warning] Das Ausmaß des Problems
> Der Verlag Sage musste 2025 über 1.500 Artikel aus dem Journal of Intelligent and Fuzzy Systems zurückziehen. Die Datenbank von Retraction Watch nähert sich 55.000 Einträgen. Das traditionelle Peer-Review-System ist der Flut nicht gewachsen.

## Hijacked Journals: Die unsichtbare Front

Eine weitere Dimension des Betrugs sind "Hijacked Journals". Betrüger kopieren die Webseiten legitimer, oft kleinerer Journale und leiten Einreichungen – und Publikationsgebühren – auf ihre eigenen Server um.

KI erleichtert das Erstellen dieser täuschend echten Fassaden und das Füllen der Seiten mit pseudowissenschaftlichem "Füllmaterial". Das führt zu einer Kontamination der wissenschaftlichen Datenbanken wie Scopus oder Web of Science. Gefälschte Artikel zitieren legitime Artikel und verzerren so Zitationsmetriken.

Das Perfide: Selbst wenn ein Forscher sorgfältig recherchiert, kann er unwissentlich auf gefälschte Quellen stoßen, die alle äußeren Merkmale seriöser Wissenschaft tragen.

## Die Antwort der Verlage

Die großen Wissenschaftsverlage – Elsevier, Springer Nature, Wiley – haben mit verschärften Richtlinien reagiert. Der Konsens ist klar:

**Keine KI als Autor:** Eine KI kann juristisch und ethisch keine Verantwortung für die Integrität einer Studie übernehmen und darf niemals als Autor gelistet werden. Autoren müssen die Nutzung von KI transparent machen, oft in Form eines "AI Declaration Statement".

**Das Bild-Verbot:** Besonders strikt sind die Regeln für wissenschaftliche Abbildungen. Elsevier verbietet die Nutzung generativer KI zur Erstellung oder Veränderung von Bildern fast vollständig. Der Grund: Ein generiertes Bild eines Zellkulturschnitts enthält keine "Wahrheit", sondern eine statistische Wahrscheinlichkeit von Pixeln. Da wissenschaftliche Evidenz auf Beobachtung und nicht auf Generierung beruht, gelten synthetische Bilder als Fälschung.

**Peer Review im Kreuzfeuer:** Auch der Review-Prozess selbst ist betroffen. Einerseits nutzen Reviewer KI, um Manuskripte schneller zu scannen. Andererseits gibt es Berichte über Review-Texte, die offensichtlich komplett von ChatGPT generiert wurden – erkennbar an Phrasen wie "As an AI language model...". Das untergräbt das Vertrauen der Autoren in eine faire Bewertung.

## Radikale Alternativen: DeSci und Executable Papers

Angesichts der Schwächen des traditionellen Systems gewinnen alternative Modelle an Attraktivität.

### Das Ende des PDF

Das PDF-Format ist ein Anachronismus – eine digitale Simulation von Papier. Es ist "tot", schwer maschinell zu lesen und trennt die Behauptung (Text) vom Beweis (Daten/Code).

Plattformen wie DeSci Labs oder Curvenote propagieren das "Executable Paper". In diesem Format ist ein Artikel kein monolithischer Block, sondern ein Container aus modularen Komponenten. Leser können Grafiken nicht nur betrachten, sondern den zugrundeliegenden Code live im Browser ausführen, Parameter ändern und die Robustheit der Ergebnisse prüfen.

Das erhöht die Hürde für Betrüger massiv: Wer Daten erfindet, kann oft keinen funktionierenden Code liefern, der diese Daten plausibel generiert.

### Dezentralisierte Wissenschaft (DeSci)

DeSci nutzt Web3-Technologien, um die Kontrolle über das wissenschaftliche Protokoll zu dezentralisieren:

- **Permanenz**: Anstatt auf Verlagsservern zu liegen, werden Forschungsobjekte im IPFS (InterPlanetary File System) gespeichert. Das garantiert Unveränderlichkeit und Zensurresistenz.

- **Identität**: Durch "Persistent Identifiers" wird jede Version eines Manuskripts eindeutig und dauerhaft referenzierbar. Das bekämpft "Link Rot" (das Verschwinden von Quellen) und "Content Drift" (das nachträgliche Ändern von Inhalten).

- **Incentivierung**: DeSci-Modelle experimentieren mit Token-basierten Belohnungen für Peer Review, um die unbezahlte Arbeit der Gutachter wertzuschätzen.

## Was das für meine Arbeit bedeutet

Als Entwickler einer Wissensmanagement-App muss ich diese Entwicklung im Blick behalten. Zukünftige Tools werden wahrscheinlich nicht mehr PDFs parsen, sondern direkt mit strukturierten, semantischen Forschungsobjekten interagieren.

Die Frage der Provenienz – woher stammt eine Information? – wird zum zentralen Designprinzip. Wenn meine App eine Zusammenfassung generiert, muss sie die Quelle transparent machen. Nicht als nettes Feature, sondern als ethische Notwendigkeit in einer Welt, in der die Grenze zwischen Wissen und Halluzination verschwimmt.

> [!tip] Die Chance in der Krise
> Die Vertrauenskrise könnte paradoxerweise zu besserer Wissenschaft führen. Executable Papers, offene Daten, dezentrale Verifizierung – all das macht Forschung reproduzierbarer und transparenter. Die Technologie, die das Problem geschaffen hat, könnte auch Teil der Lösung sein.

---

## 🔗 Verwandte Beiträge

- [[Vom Zettelkasten zum KI-Agenten]]
- [[Wenn die KI das Denken übernimmt]]
- [[Wir sollten über unser Selbstwertgefühl nachdenken]]
