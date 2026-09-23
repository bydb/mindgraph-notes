# Email-Instruktionen (Beispiel für die Auswertung)

Diese Datei hat denselben Aufbau wie die echte Instruktions-Notiz im Vault: unten der
deterministische Konfig-Block, darüber die weichen Kriterien im Fließtext. Sie ist ein
Beispiel für `--instruction`, keine Nutzerkonfiguration — erfundene Adressen (`.example`).

**Wichtig für den Piloten:** Sobald hier weiche Kriterien stehen, blockieren sie jedes
hypothetische Überspringen (`soft-criteria-uncovered`). Vier generische Fragen decken
beliebige persönliche Kriterien nicht ab. Wie viel Einsparung das kostet, steht im Bericht.

## Weiche Kriterien

- Alles zum Medienzentrum und zum Geräteverleih.
- Anfragen von Schulen zu Fortbildungen.
- Rückfragen zu laufenden Projekten.

## Feste Regeln (deterministisch, im Code geprüft)

```email-relevance-config
VIP-Absender:
- Wichtige Person <vip@amt.example>

Domains:
- amt.example

Schlüsselwörter:
- Medienzentrum
```
