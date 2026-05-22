---
id: app-dashboard
keywords: [dashboard, widget, widgets, übersicht, startseite, focus, radar, aktivität, briefing, kalender, einstellen, konfigurieren, anzeigen, ausblenden, reihenfolge, sortieren, aktivieren, deaktivieren, anpassen]
---

# Dashboard und Widgets

Das Dashboard ist eine eigene Tab-Ansicht — du öffnest es über den
Dashboard-Tab in der Sidebar. Es zeigt mehrere konfigurierbare Widgets
in einer Reihenfolge, die du frei festlegst.

## Verfügbare Widgets

- **Focus** — was heute ansteht (Tasks fällig heute + nächste Kalender-
  Events).
- **Radar** — die wichtigsten 🔴-Problem-Notizen, sortiert nach
  KI-Relevanz + Aktivität. Aktualisiert sich automatisch.
- **Activity** — kürzlich berührte Notizen + Top-Ordner.
- **Tasks** — alle offenen Aufgaben aus deinem Vault, gruppiert.
- **Emails** — letzte ungelesene/wichtige Mails (braucht Email-Modul).
- **Calendar** — Termine der nächsten Tage (macOS: Apple Calendar).
- **Bookings** — edoobox-Buchungen (braucht Edoobox-Modul).
- **Antares** — Verleih-Übersicht für Medienzentren (braucht Antares-Modul).
- **Project-Status** — KI-konsolidierter Status pro Projekt-Ordner.
- **Sync** — Sync-Status zwischen Geräten.

## Wo stellst du Widgets ein?

**Einstellungen → Dashboard** (eigener Tab in den Settings). Dort:

- **Master-Schalter „Dashboard aktivieren"** ganz oben.
- **Sektion „Widgets"** — pro Widget eine Checkbox zum Ein- bzw.
  Ausblenden und zwei Pfeile (▲/▼) zum Verschieben in der Anzeige-
  Reihenfolge. Die Reihenfolge im Settings-Tab = Reihenfolge im
  Dashboard von oben nach unten.
- **Sektion „Morning Briefing"** — Briefing ein-/ausschalten,
  Kalender-Termine einbinden, Anzahl Tage in die Zukunft (0–14).
- **Sektion „Aufgaben-Vorlauf"** — kritische vs. normale Lead-Time.

Widgets, die ein Modul brauchen (Emails, Bookings, Antares), bleiben
ausblendbar; ohne aktives Modul zeigen sie nur einen Hinweis.

## Morning-Briefing

Beim ersten Öffnen am Tag (optional) zeigt das Dashboard ein
KI-Briefing: zusammengefasste Mails, Termine, Tasks und Hinweise auf
🔴-Notizen, die wieder hoch im Radar stehen.

## Tipp

Wenn ein Widget einen Fehler wirft, geht nur dieses Widget aus — die
restlichen bleiben funktional (ErrorBoundary pro Widget).
