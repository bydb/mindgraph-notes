---
id: app-dashboard
keywords: [dashboard, widget, übersicht, startseite, focus, radar, aktivität, briefing, kalender]
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

## Konfiguration

Settings → Allgemein → Dashboard: Widgets ein-/ausblenden, Reihenfolge
festlegen, Morning-Briefing aktivieren.

## Morning-Briefing

Beim ersten Öffnen am Tag (optional) zeigt das Dashboard ein
KI-Briefing: zusammengefasste Mails, Termine, Tasks und Hinweise auf
🔴-Notizen, die wieder hoch im Radar stehen.

## Tipp

Wenn ein Widget einen Fehler wirft, geht nur dieses Widget aus — die
restlichen bleiben funktional (ErrorBoundary pro Widget).
