# Messung: Petrol-Chat bei Alltagsfragen (25.10.2026)

## Anlass

Der Petrol-Chat soll „schnell mal was fragen, gute Antwort“ abdecken. Der Anlass war ein Nutzer, der für
normale Fragen weiter ChatGPT nutzte. Gemessen wurden Wartezeit und Qualität bei Alltagsfragen. Die Messung
lief vor jeder Änderung am Code.

## Aufbau

- **Aufruf:** genau wie `ollama-chat` mit `chatMode 'petrol'` (`app/src/main/index.ts:6577`).
  - Systemtext ist `PETROL_CHAT_SYSTEM_PROMPT`, live aus der Datei gelesen.
  - Dazu kommt eine Frage, `stream: true`, ohne Verlauf.
- **Zwei Bedingungen:**
  - **app:** wie heute, also ohne `think`-Parameter; Qwen denkt verdeckt.
  - **nothink:** `think: false`.
- **Modelle:**
  - qwen3.8:27b-mlx (eingestelltes Modell)
  - qwen3.6:35b-a3b-nvfp4 (MoE)
  - qwen3.5:4b
- **Fragen:** 12 Alltagsfragen, je ein Lauf, warm. Der Kaltstart ist getrennt erfasst.
- **Rechner:** M2 Max, 32 GB, im Akkubetrieb ohne Stromsparmodus.
- **Skript und Rohdaten:** im Scratchpad der Sitzung (`chatmess/mess.mjs`, `results.jsonl`), nicht im Repo.

## Zeiten (Median über 12 Fragen)

| Modell | Bedingung | Erstes Wort | Ganze Antwort | Tokens/s |
|---|---|---|---|---|
| qwen3.8:27b | app (heute) | 7,3 s (max 20,5) | 22,8 s (max 41,6) | 21 |
| qwen3.8:27b | nothink | **0,5 s** | 8,2 s | 20 |
| qwen3.6:35b-a3b | app | 9,2 s (max 23,3) | 11,9 s | 69 |
| qwen3.6:35b-a3b | nothink | **0,2 s** | **2,0 s** | 69 |
| qwen3.5:4b | app | 18,6 s (max 74,0) | 19,8 s | – |
| qwen3.5:4b | nothink | 0,1 s | 2,2 s | – |

- **Kaltstart (Modell laden):**

  | Modell | Laden |
  |---|---|
  | 27b | 15 s |
  | 35b-a3b | 11 s |
  | 4b | 2 s |

- **Zwei Ausreißer bei nothink** (11,5 s und 20,3 s bis zum ersten Wort): In beiden Fällen musste
  Ollama das Modell mitten im Lauf neu laden (`load_duration` 7,9 s bzw. 15,9 s). Das liegt nicht an
  `think: false`. Es ist aber ein echter Wartegrund im Alltag: Irgendetwas hat das Modell aus dem Speicher
  verdrängt.
- **Ursache:** Die Wartezeit von heute ist fast vollständig das verdeckte Nachdenken. Das Schreiben selbst
  ist schnell. Beim 4B-Modell dauerte eine Übersetzung 74 s Denken für eine Zeile Antwort.

## Qualität (eigene Bewertung, 12 Fragen, je ein Lauf)

**Prüfbare Fragen:**

| Frage | 27b app | 27b nothink | 35b app | 35b nothink | 4b app | 4b nothink |
|---|---|---|---|---|---|---|
| Ei wachsweich (6–7 min) | richtig | richtig | richtig | richtig, etwas wirr („kaltes Wasser oder Sieden“) | teils (5–6) | **falsch** (3–4 min) |
| 18 % von 2.450 € (441) | richtig | richtig | richtig | richtig | richtig | richtig |
| Zugspitze (2.962 m) | richtig | richtig | richtig | richtig | **falsch (3.905 m)** | Zahl richtig, „höchste Erhebung der Alpen“ falsch |
| Relativitätstheorie | richtig | Fehler: „Mitte des 20. Jahrhunderts (1915)“ | richtig | richtig | richtig | Fehler: „drei Jahre später, 1915“ |
| EZB-Leitzins (aktuell) | ehrlich „weiß ich nicht“ | ehrlich | ehrlich | ehrlich | **leere Antwort** | **erfunden** („3,50 %, Stand Juli 2024“) |
| Übersetzung | richtig | richtig | richtig | richtig | richtig | richtig |

**Offene Fragen** (Absage, SVERWEIS, Wetter/Klima, Ambiguitätstoleranz, Photosynthese für Kinder, vegetarische Ideen):
- **27b und 35b liefern bei beiden Bedingungen brauchbare Antworten.** Mit Nachdenken werden sie oft länger
  und ausführlicher, aber nicht genauer.
- **Fehler auch MIT Nachdenken (27b app):**
  - Vegetarische Idee Nr. 1 enthält Hack.
  - „Ambiguitätstoleranz geht auf Berlyne zurück“ ist falsch. Üblich wird Else Frenkel-Brunswik (1949)
    genannt.
- **35b nothink** hat kleine Sprachschnitzer („fully gesetzt“, „spreaden“).
- **4b** ist für Sachfragen ungeeignet, mit und ohne Nachdenken. Es erfindet Zahlen, und einmal kam mit
  Nachdenken gar keine Antwort.

**Systemtext:** Bei „aktueller Leitzins“ verweisen alle Modelle auf die EZB-Webseite oder eine
Suchmaschine. Den Globus im selben Chat erwähnt keines, weil der Systemtext „du kannst nichts im Internet
nachsehen“ sagt und den Globus nicht kennt.

## Folgerungen (Vorschlag, nicht umgesetzt)

1. **`think: false` für den normalen Petrol-Chat.**
   - Das erste Wort kommt dann nach 0,5 statt 7 s (27b).
   - In dieser Stichprobe war die Qualität nicht schlechter. Fehler gab es in beiden Bedingungen.
   - Der größte Einzelgewinn bei kleinster Änderung.
   - Gilt für Ollama. LM Studio und Cloud-Weg sind getrennt zu prüfen.
2. **Hinweis auf den Globus im Systemtext:** „Für aktuelle Zahlen oder Fakten, die du nicht sicher weißt:
   Weise auf den Globus (Websuche) in diesem Chat hin.“
3. **Modell nicht verdrängen lassen:** `keep_alive` für den Chat prüfen. Zuerst klären, wer das Modell
   verdrängt hat (Vault-Index mit bge-m3? die installierte App?).
4. **qwen3.6:35b-a3b als Chatmodell** ist in dieser Stichprobe am schnellsten (2 s für eine ganze Antwort)
   bei gleicher Qualität.
   - Kein Wechsel der Voreinstellung nach einem Lauf (Memory: kontrolliertes A/B).
   - Höchstens als Empfehlung in den Einstellungen nach einer zweiten Runde.
5. **Optional später:** Schalter „gründlich nachdenken“ für schwierige Fragen, wie bei ChatGPT. Nicht als
   Voreinstellung.

## Grenzen

- 12 Fragen, je ein Lauf, Qualität von mir allein bewertet.
- Keine echten Fragen des Nutzers, der den Anlass gab. Eine zweite Runde mit solchen Fragen wäre der
  bessere Maßstab.
- Keine Gesprächsverläufe mit mehreren Zügen gemessen.

## Umsetzung (25.10.2026, Nutzerfreigabe für 1 und 2)

- **1:** `think: false` nur für `chatMode 'petrol'` im `ollama-chat`-Handler (`app/src/main/index.ts`).
  - Nicht geändert: Notiz-Chat, Websuche/Nachfrage (`streamPetrolWebModel`), LM Studio, Cloud.
- **2:** `PETROL_CHAT_WEB_HINT` und `buildPetrolChatSystemPrompt(webAvailable)` (`app/src/main/llm/petrolChatPrompt.ts`).
  - Der Hinweis kommt nur dazu, wenn `webResearchEnabled` in `ui-settings.json` an ist, also wenn der Globus sichtbar ist.
  - Gilt für Ollama und LM Studio. Test in `petrolChatPrompt.test.ts`.
- **Gegenprobe am Modell** (qwen3.8:27b, think aus):
  - „aktueller Leitzins“ und „Was kostet gerade ein iPhone 17?“ verweisen jetzt auf den Globus.
  - „Zugspitze“ wird weiter direkt beantwortet (1,4 s).
- **Geprüft:** typecheck grün, 93 Tests grün (llm-Ordner und Store). Die Dev-App ist neu gestartet. Eine GUI-Probe durch den Nutzer steht aus.

## Übergabe Chat → Auftrag (25.10.2026, Nutzerfreigabe)

- **Auslöser:** Realer Lauf in der Dev-App.
  - Chat: Eiffelturm, höchstes Gebäude New York, dann „aus den beiden Infos eine Tabelle“.
  - „Notiz mit Petrol ausarbeiten“ gab nur das letzte Paar weiter.
  - Der Agent baute nach 5 min eine Notiz statt einer Tabelle und markierte jeden Wert „offen“, auch die
    richtigen. Den falschen Satz „höchstes Gebäude der USA“ ließ er stehen (Webrecherche bei der Übergabe aus).
- **Umsetzung:**
  - `renderer/utils/chatHandover.ts` (getestet) übergibt das ganze Gespräch bis zur gewählten Antwort:
    - Ziel ist deren Frage.
    - Von Webantworten nur die Frage (Codex F03).
    - Abgebrochene, fehlerhafte und App-Antworten fallen weg.
    - Budget 12 000 Zeichen: letzte Antwort ≤ 6 000, frühere ≤ 1 500, Fragen ≤ 1 000.
    - Zu lang: erst ältere Antworten auslassen, dann die ältesten Wechsel, sichtbar gezählt.
  - Auftragstext (`petrolChat.makeTaskDraft`): Ziel oben, Form nach Wunsch (sonst Notiz), Verlauf als
    ungeprüfter Kontext, Grenz-Hinweise des Chats ausdrücklich ignorieren.
  - Knopf jetzt „Im Auftrag weitermachen …“.
  - Übergabe-Hinweis nennt den Weg zur Faktenprüfung (Webrecherche einschalten), wenn das Modul an ist.
    Die Websuche bleibt bei der Übergabe aus (Codex F04).
  - Chat-Systemtext: Hinweis auf „Auftrag“ höchstens als kurzer Schlusssatz, nie als Einleitung.
- **Geprüft:** typecheck grün, 327 Tests grün (renderer + llm). Die Übergabe wurde mit dem echten
  Chatverlauf in der App erzeugt. Ein neuer Agentenlauf mit der neuen Übergabe steht aus.
