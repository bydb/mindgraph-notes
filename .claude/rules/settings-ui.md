---
paths:
  - "app/src/renderer/components/Settings/**"
  - "app/src/renderer/utils/i18n/**"
---

# Einstellungen: geteilte Bausteine

> Ausgelagert aus CLAUDE.md am 09.11.2026. Wird nur geladen, wenn Dateien aus den obigen Pfaden gelesen werden.

## Einstellungen: geteilte Bausteine (Redesign 09/2026)
- Quelle: Claude-Design-Export „Mindgraph Notes Einstellungsdesign" (Desktop-Ordner) — drei Ziel-Seiten plus Prototyp aller 22 Seiten. **Alle Seiten sind umgebaut.** Jede Seite ist eine eigene Datei unter `Settings/` (`GeneralSettingsTab`, `EditorSettingsTab`, `EmailSettingsTab`, `SyncSettingsTab`, …); `Settings.tsx` hält nur noch Shell, Navigation, Suche, den KI-Tab und die kleinen Seiten Tägliche Notiz/Gehirn/Templates. Plugin-Seiten (Antares, WordPress) importieren die Bausteine aus `renderer/components/Settings/SettingsUI`.
- **Übersetzungen der umgebauten Seiten liegen in `utils/i18n/settingsPages.ts`** (in `translations.ts` per Spread eingestreut, `en` ist typgeprüft vollständig). Neue Seiten-Schlüssel dorthin, nicht in die 7000-Zeilen-Datei. Ein Schlüssel in `translations.ts` gewinnt gegen denselben Schlüssel im Modul — Kollisionen vermeiden.
- **`Settings/SettingsUI.tsx` + `SettingsUI.css` sind die einzige Quelle für Optik und Verhalten** (Klassenpräfix `sui-`): `PageHeader`, `SectionTitle` (mit Meta „3 von 5 aktiv"), `Card`, `ServiceHead` (Icon-Kachel · Name · Status-Chip · Handlung · Schalter), `Row` (Label + Hinweis links, Control rechts), `Note` (Diagnose MIT nächstem Schritt), `Details` (Aufklapper), `Toggle`, `Segmented`, `Select`, `TextInput`/`NumberInput` (Auto-Save bei blur/Enter), `SecretField` („Gespeichert •••• …4f2a Entfernen"), `ChipSelect`, `Hero`, `ModuleOffCard`. Neue Seiten NUR daraus zusammensetzen — keine Inline-Styles, keine „Speichern"-Knöpfe pro Feld.
- **Auto-Save-Konvention**: Textfelder übernehmen beim Verlassen oder mit Enter, nie pro Tastendruck (sonst prüft eine URL-Zeile nach jedem Zeichen den Server). Schalter/Segmente/Selects sofort. Secret-Felder zeigen den Klartext nie wieder an, nur die letzten vier Zeichen. **Bewusste Ausnahme:** die E-Mail-Relevanzregeln (`EmailRelevanceRulesSection`) haben EINEN Speichern-Knopf für alle drei Listen — ein halb getippter Domainname darf nicht sofort als Regel in die Instruktions-Notiz.
- **`useIntegrationStatus`** hält den Verbindungszustand der externen Dienste (Zotero, OpenAlex, Docling, Vision OCR, LanguageTool, Readwise) für Integrations- UND Modul-Tab. Prüft beim Aktivwerden eines der beiden Tabs einmal alle Dienste, danach nur auf Knopfdruck. Der Modul-Tab zeigt daraus Status-Zeilen („Verbunden · Einstellungen →" / „Nicht verbunden · Einrichten →") und den Filter „Einrichtung nötig".
- **Modul ↔ Konfiguration beidseitig verlinkt**: `MODULE_CONFIG_TABS` mappt Modul → Tab + `data-settings-anchor` (Dienst-Karte); ausgeschaltete Module zeigen auf der Konfigurationsseite eine gestrichelte `ModuleOffCard` mit „Modul einschalten" (schaltet direkt ein, kein Umweg über den Modul-Tab).
- **Navigation klappt inaktive Gruppen ein** (Label + Zähler), damit alle Gruppen ohne Scrollen sichtbar sind; ein Seitenwechsel setzt manuelle Aufklappungen zurück und scrollt den Inhalt nach oben. Icons in `NAV_ICONS`, Gruppen datengetrieben in `navGroups`.
- **Cloud-Anbieter**: `CloudProviderSection` ist EINE Komponente für OpenRouter und LLMBase (vorher zwei zeilengleiche Dateien); `OpenRouterSection`/`LLMBaseSection` sind nur noch Wrapper. Karten kollabieren auf den Kopf, solange der Anbieter aus ist. Bild-Generierung trägt den Modul-Schalter im Kartenkopf.
- **GUI-Prüfung ohne Computer-Use**: Dev-App gegen geklontes Profil ohne `*.enc` starten (`MINDGRAPH_USER_DATA_DIR`, Vault auf `~/MindGraph-Modelltest-Vault`), Schlüsselbund-Dialog per osascript „Nicht erlauben", dann per CDP (`--remote-debugging-port=9222`, `Page.captureScreenshot` mit `scale: 2`) Tabs anklicken und Screenshots lesen. Das `/json`-Endpoint hängt, wenn ein früherer `curl` die Verbindung offen hält.
