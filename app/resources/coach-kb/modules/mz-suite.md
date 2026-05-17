---
id: mz-suite
moduleId: mz-suite
keywords: [edoobox, veranstaltung, veranstaltungen, veranstaltungsagent, agent, agenten, kurs, kurse, fortbildung, fortbildungen, anmeldung, akkreditierung, marketing, wordpress, iq, evaluation, formular, docx, schulamt]
suggestsModules: [mz-suite]
suggestsWidgets: [bookings]
suggestsProfile: professional
---

# Edoobox Modul (Veranstaltungsagent & Marketing)

Auch bekannt als **Veranstaltungsagent** — in den App-Einstellungen unter
„Agenten" zu finden.

## Wann nutzen
Wenn du Fortbildungen oder Veranstaltungen über edoobox anbietest und
DOCX-Akkreditierungsformulare einliest, Veranstaltungen zu edoobox
pusht, Marketing-Texte für WordPress vorbereitest und am Ende IQ-
Auswertungen (DOCX/XLSX) brauchst.

## Workflow im Detail

1. **Import**: Akkreditierungsformular (DOCX vom Schulamt) ins AgentPanel
   ziehen → `formularParser` extrahiert Titel, Termine, Referenten, Ort,
   Preis, Kontakt, Teilnehmer.
2. **Prüfen**: Du siehst alle geparsten Felder, kannst Korrekturen vornehmen.
3. **Veröffentlichen**: „Push zu edoobox" legt die Veranstaltung über die
   edoobox-API (v2 mit JWT) an.
4. **Marketing**: Im Marketing-Tab generiert Ollama einen Werbetext, der
   per WordPress REST API als Draft veröffentlicht wird. Optional Bild via
   Google Imagen.
5. **Dashboard**: Belegungsgrad, Teilnehmerlisten, Neuanmeldungen pro
   Veranstaltung — auch als „Bookings"-Widget am Dashboard.
6. **IQ-Auswertung**: Am Ende einer Veranstaltung DOCX/XLSX-Reports
   exportieren.

## Wie aktivieren
Einstellungen → Module → "Edoobox Modul", dann Einstellungen →
Agenten: edoobox-API-Key und WordPress-App-Password hinterlegen
(safeStorage). DOCX-Import passiert über AgentPanel.

## Beispiel
Akkreditierungsformular aus dem Schulamt ziehen → "Importieren" → Daten
werden geparst, du prüfst sie, "Veröffentlichen" pusht zur edoobox-API
und legt einen Marketing-Entwurf als WordPress-Draft an.
