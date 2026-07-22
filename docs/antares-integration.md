# Antares CS Integration

Reverse-engineerte API-Anbindung an **Antares CS 2.0.4** (h+h Software) — das
Verleihsystem vieler deutscher Medienzentren. Liest Entleiher- und Verleihdaten
über den eigenen Admin-/Mitarbeiter-Account aus.

Analog zur EdooBox-Integration aufgebaut.

## Aktivierung

1. Settings → **Module** → "Antares Medienzentrum" aktivieren
2. Settings → **Antares** (eigener Tab, erscheint bei aktivem Modul):
   - Server-URL (z.B. `https://mzantares-he-16.datenbank-bildungsmedien.net`)
   - Kontext (z.B. `HE/16`)
   - Benutzername + Passwort
3. "Zugangsdaten speichern" → "Verbindung testen"

Credentials werden via `electron.safeStorage` verschlüsselt unter
`~/Library/Application Support/mindgraph-notes/antares-credentials.enc` abgelegt.

## API für Renderer (window.electronAPI)

```ts
antaresSaveCredentials(username, password): Promise<boolean>
antaresLoadCredentials(): Promise<{username, password} | null>
antaresCheck(baseUrl, context): Promise<{success, error?}>
antaresListOffeneRegistrierungen(baseUrl, context): Promise<{success, rows?, error?}>
antaresListEntleiher(baseUrl, context, page?, rows?): Promise<{success, total?, rows?, error?}>
antaresListMahnungenGeraete(baseUrl, context): Promise<{success, total?, rows?, error?}>
antaresListMahnungenMedien(baseUrl, context): Promise<{success, total?, rows?, error?}>
antaresListAusgabeliste(baseUrl, context): Promise<{success, total?, rows?, error?}>
```

## Zustand-Store

`renderer/stores/antaresStore.ts` — analog zu `agentStore` (EdooBox):

```ts
const { offeneRegistrierungen, mahnungenGeraete, mahnungenMedien,
        ausgabeliste, loading, lastError, loadAll }
  = useAntaresStore()
```

## API-Architektur (reverse-engineered)

### Auth
- `GET /` → Login-Seite mit initialer PID im JS (`login?pid=<26-char>`)
- `POST /login?pid=<initial>` mit `name`/`password` → Session etabliert
- PID + Cookie für alle weiteren Calls
- Session-TTL: ~25-30 min (Service cached 25 min)

### Datenendpunkte
| Was | Endpunkt | Body | Anmerkung |
|---|---|---|---|
| Offene Registrierungen | `POST /search?table=entleiher&id=2&context=HE/16` | `autosearch=true` | Neu angemeldete, noch nicht freigeschaltete Entleiher |
| Alle Entleiher | `POST /search?table=entleiher&id=1&context=HE/16` | `autosearch=true&page=1&rows=200` | Vorsicht: Tausende |
| Mahnungen Geräte | `POST /verleihsearch?refnr=5_geraete&action=verleih` + `POST /verleihsuchecopies?ref=5_geraete` | init: `apl=mahnung&info=geraete&rtype=M&status=20,21` ; data: `page&rows&sort=fn_rueckdatum&status=10,11,20,21,40` | Zwei-Schritt-Flow |
| Mahnungen Medien | wie oben mit `ref=5_medien`, `info=medien` | | |
| Ausgabeliste heute | `ref=4`, init body `apl=konto&atype=M&ausgabe=YYYY-MM-DD` | | |

### Row-Schema
- **Entleiher**: `identifier, fn_ename, fn_vorname, fn_enr, fn_schulname, fn_schulnr, class`
- **Verleih**: `identifier, fn_leihnr, fn_titel, fn_info ("geraete"/"medien"), fn_status, fn_mahnstufe, fn_kopienummer, fn_entldatum, fn_rueckdatum, fn_eingdatum, fn_ename, fn_vorname, fn_enr, fn_schulname, fn_erfname`

### Status-Codes (vermutet)
- `10, 11` — ausgeliehen / verlängert
- `20, 21` — überfällig / gemahnt
- `40` — sonstig

## Caveats

- **Keine offizielle API**. Endpunkte können bei Antares-Upgrades brechen.
- Wir umgehen keine Auth — Login wird wie im Browser durchgeführt.
- **Gesperrte User**: keine vordefinierte Such-ID gefunden. Workaround: alle
  Entleiher abrufen und clientseitig filtern (sofern Feld `gesperrt` o.ä. im
  Row-Schema sichtbar wird).
- **Höflich bleiben**: Höchstens alle paar Minuten pollen, nicht im Sekunden-
  Takt.
