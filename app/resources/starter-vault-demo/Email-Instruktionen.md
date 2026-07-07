---
tags: [system, email]
---

# Email-Instruktionen

Diese Notiz steuert die KI-Analyse eingehender Mails. Der Freitext hilft dem Modell, der Konfigurationsblock unten wird exakt ausgewertet.

## Relevanz-Kriterien

Relevant sind Mails, die:

- die **Digitalwoche** betreffen (Referenten, Anmeldungen, Räume, Technik)
- von **Schulleitungen oder Lehrkräften** unserer Partnerschulen kommen
- den **Website-Relaunch** betreffen (Agentur, Texte, Fotos)
- eine **direkte Frage oder Bitte** an mich enthalten

## Was NICHT relevant ist

- Newsletter und Werbung
- Automatische Bestätigungen (Versand, Rechnungen ohne Handlungsbedarf)
- CC-Mails ohne direkte Anrede

## Gewünschte Aktionen

- Aufgaben mit Datum extrahieren
- Bei Terminanfragen: Person und Thema in die Aufgabe aufnehmen

```email-relevance-config
VIP-Absender:
- Frau Weber <weber@gs-sonnenweg.de> = 95
- Herr Schmidt <schmidt@medienzentrum.de>
Domains:
- gs-sonnenweg.de
- medienzentrum.de
Schlüsselwörter:
- Digitalwoche = 85
- Workshop
- Relaunch
```
