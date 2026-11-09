---
paths:
  - "app/src/renderer/components/DashboardPanel/**"
  - "app/src/renderer/components/LlmPerformance/**"
  - "app/src/shared/activityLog*"
  - "app/src/shared/measurementHistory*"
  - "app/src/main/activityLedger*"
  - "app/src/main/skillActivityId*"
  - "app/src/renderer/utils/contextMemory*"
  - "app/src/renderer/utils/impactText*"
  - "app/src/main/plugins/host*"
  - "app/packages/plugin-api/**"
---

# Dashboard: Relevanz-Radar, Arbeitsbilanz, Kontextgedächtnis

> Ausgelagert aus CLAUDE.md am 09.11.2026. Wird nur geladen, wenn Dateien aus den obigen Pfaden gelesen werden.

## Relevanz-Radar (Dashboard-Widget „Relevante Notizen")
- `DashboardPanel/DashboardView.tsx` → `RadarWidget`.
- **Rein heuristisch, kein LLM.** Score aus überfälligen/heutigen Aufgaben, Backlinks aus Lösungs-/Info-Notizen, thematisch passenden Mails und Terminen. Ein Durchlauf über 4171 Notizen kostet 3 ms.
- **Die KI-Relevanzanalyse wurde 08/2026 entfernt** (IPC `note-analyze-relevance`, `dashboard.radarAi*`, localStorage-Cache `mindgraph:relevance-cache:*`). Sie lief bei jedem Dashboard-Öffnen über alle offenen 🔴-Notizen — an einem realen Vault 37 Stück à rund 9 s auf einem 27B-Modell, also drei Minuten Volllast für ein Ergebnis, das nie genutzt wurde. Nicht wieder einführen ohne Schalter in den Einstellungen und ohne Abbruch beim Verlassen des Tabs.
- Beim Entfernen wurde der Heuristik-Deckel (`Math.min(score, 25)`) mit aufgehoben: er existierte nur, damit die Heuristik die KI-Skala nicht überstrahlt. Ohne KI hätte er die Rangfolge plattgedrückt — alles ab 25 Rohpunkten mit gleichem Endscore.
- Historie/Delta-Anzeige bleibt (`mindgraph:radar-history:{vaultPath}`, 7 Tage).
- ErrorBoundary pro Widget — ein Render-Crash im Radar darf nicht das ganze Dashboard mitnehmen.
- **Nur 🔴-Notizen** kommen ins Radar (Frontmatter `category:` **oder** strikter Titel-Match nach `getNoteKindFromTitleStrict`).
- Widget-Nachträge in `initializeUISettings` laufen **einmalig** über `dashboard.widgetMigrationVersion`. Vorher liefen sie bei jedem Start und holten abgewählte Widgets zurück — Ausschalten hielt nie. Neues Widget nachtragen: Version hochzählen, Nachtrag anhängen. Die Version aus den GESPEICHERTEN Daten lesen, nicht aus dem Deep-Merge-Ergebnis.

## Arbeitsbilanz (Zeitbilanz, Messgeschichte, Plugin-Vorgänge)
- Schema und Rechenregeln in `shared/activityLog.ts` (rein, getestet); Ablage `userData/activity/<hash>.json` (`main/activityLedger.ts`, 365 Tage / 20 000). Historie im Leistungsfenster (`LlmPerformance/HistorySection.tsx`, Auswertung `shared/measurementHistory.ts`). Entwurf und Stand: `docs/measurement-history-plan.md`, Review + Entscheidungen: `docs/codex-collab/modell-leistung-demo-review.md`.
- **Ehrlichkeitsregeln** (jede wurde real eingefordert): abgezogen wird aktive Vordergrundzeit, nie Agent-Laufzeit; nicht gemessen ist nicht null (gezählt, nicht bewertet); keine Kappung bei null; Minuten nur gegen selbst eingetragene Referenz; **Fehlversuche zählen** (`discardedRuns`, Abzug ohne Gutschrift); Zeitwert nur als Szenario mit offengelegtem Stundensatz, Nettorechnung gegen USD-Ausgaben nur bei USD, kein Wechselkurs.
- **`KNOWN_KINDS` muss jede Ereignisart des Typs enthalten** — sonst wirft der Ledger sie beim Lesen weg und der nächste Eintrag löscht sie aus der Datei (so verschwand `reference-changed` bis 0.11.4). Test „kennt jede Art" in `activityLog.test.ts` hält Typ und Allowlist zusammen: neue Art = Typ + Allowlist + Beispiel im Test.
- **Plugin-Vorgänge** laufen über die Host-Fähigkeit `activity` (`app/packages/plugin-api`, `main/plugins/host.ts`): Plugin meldet `job-started`/`job-outcome`, der Kern setzt Zeit und Plugin-ID, prüft alles (`pluginActivityEvent`) und hängt den Modellverbrauch der `runId` an. Etikett nur so weit wie der Nachweis (Teilnehmerliste `saved`, WordPress `draft|published` aus der Antwort, Instagram `used` nur per Klick). Bewertung auf VORGANGSEBENE (`JobRun`): gespart = Σ Referenz der bepreisten Kanäle − aktive Zeit des Vorgangs, einmal; ohne jede Referenz unbewertet. Aufgegebene Vorbereitungen (`job-abandoned`) sind Fehlversuche mit Abzug; „vorbereitet ohne Abschluss" wird gezählt, nie bewertet. Die Vordergrundzeit ist beim Abschluss im Kern noch nicht fertig gemessen — der Renderer hebt sie danach über `activity-job-foreground` an (nur anheben). `activity-append` bleibt auf Sprachbefehle beschränkt.
- **Referenzzeit je Skill** (seit 02.10.2026, Plan + Codex F01–F11: `docs/codex-collab/zeitbilanz-skill-referenz.md`): `use_skill` merkt sich den Skill, `agent-run-finished.skills` trägt nur **opake, vault-gebundene Kennungen** (`main/skillActivityId.ts`, nie den Ordnernamen — der kann einen Kunden nennen). Referenzen in `impact.skillReferences` (Kennung → Minuten/Label/Quelle, Main bereinigt vor dem Speichern per `normalizeSkillReferences`), Einstellung je Vault-Skill unter Allgemein → Zeitbilanz, Rückfrage auf der Ergebniskarte erst wenn alle Karten entschieden und eine übernommen ist (`SkillReferencePrompt`). Bewertung über einen Skill (`resolveRunSkill`) NUR bei genau einem bepreisten Skill, nie bei Shell-Läufen, nie bei abgeschnittener Liste; sonst die Art, mehrdeutige werden als `ambiguousSkillRuns` ausgewiesen. Skill-Läufe haben eigene Bilanzzeilen (`line.skill`, Beschriftung über `lineLabel`), sonst ginge „N × Referenz − aktiv" nicht auf. Änderungen als `skill-reference-changed` (nur für in diesem Vault gesehene Kennungen, nur nach geglücktem Schreiben der Einstellungen).
- **Manuelle Zeitkorrektur** (`time-correction`, IPC `activity-correct-time`): Nutzerangabe, nie Messung — der Ledger nimmt nur bekannte Ziele und 1 min–8 h an, die Rohmessung bleibt, der Nachtrag wird überall als „nachgetragen" ausgewiesen. **Referenzquelle** (`impact.referenceSources`, geschätzt/selbst gestoppt) ändert nicht die Rechnung, nur die Aussage an der Zahl.
- **Kartentexte**: gezeigte Zahlen müssen aufgehen — Rechnung brutto (`grossMinutes`), aktive Zeit aus der Gleichung abgeleitet, Fehlversuch-Zeile nennt Abzug und Netto (`renderer/utils/impactText.test.ts`). Nach jeder Änderung Karte, Statusleiste und Sprachausgabe mit 1 Vorgang, mehreren und einem negativen Wert durchsehen.

## Lokales Kontextgedächtnis (`utils/contextMemory.ts`)
- localStorage-Event-Log mit 6 Typen: `note_opened`, `note_created`, `note_updated`, `note_deleted`, `task_created`, `task_updated`.
- Throttling pro Event-Typ + Note (z.B. `note_opened` 30s, `note_updated` 60s).
- 90-Tage-Retention, max 2500 Events. Zero-Backend.
- Wird vom **Aktivität-Widget** (Top-Notes-Bars + Top-Folders) und von **Brain** (Sensor „berührte Notizen") gelesen.
- Gewichtetes Event-Scoring: `task_*` ×4/×3, `note_opened` ×3, `note_updated` ×2, `note_deleted` ×0.5. Inbox-/Eingang-Folder Faktor 0.35.
