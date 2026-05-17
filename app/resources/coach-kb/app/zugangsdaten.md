---
id: app-zugangsdaten
keywords: [zugangsdaten, credentials, api, key, schlüssel, anthropic, claude, cloud, openalex, readwise, elevenlabs, edoobox, antares, telegram, passwort, password, einrichten, eingeben, eintragen, wo, safe, storage, sicher]
---

# Zugangsdaten / API-Keys verwalten

MindGraph hat eine zentrale Übersicht aller API-Keys, Passwörter und
Tokens unter:

**Settings → Zugangsdaten** (eigener Tab)

Dort siehst du pro Eintrag, ob er gesetzt ist (grüner Punkt) oder fehlt
(grauer Punkt), und kommst mit einem Klick auf „Einrichten" zum
richtigen Feature-Tab, in dem der Wert gespeichert wird.

## Wo lebt welcher Key?

| Credential | Eingabe in Settings → … | Verschlüsselt? |
|---|---|---|
| Anthropic API-Key | **Telegram** (historisch — wird aber von vielen Modulen genutzt) | safeStorage |
| Telegram Bot-Token | Telegram | safeStorage |
| ElevenLabs API-Key | Sprache (TTS) | safeStorage |
| Sync-Passphrase | Sync | safeStorage |
| Email-Passwort (pro Account) | Email | safeStorage |
| edoobox API-Key + Secret | Agenten | safeStorage |
| Antares (User + Passwort) | Agenten | safeStorage |
| WordPress App-Passwort | Agenten | safeStorage |
| OpenAlex API-Key | Integrationen | im uiStore (Klartext) ⚠️ |
| Readwise API-Key | Integrationen | im uiStore (Klartext) ⚠️ |
| LanguageTool API-Key (Premium) | Integrationen | im uiStore (Klartext) ⚠️ |
| Google Imagen API-Key | Agenten | im uiStore (Klartext) ⚠️ |

## Wo trage ich den Anthropic-API-Key ein?

**Settings → Telegram** → Sektion „Anthropic API-Key" → Key eingeben →
„Speichern".

Der Key liegt verschlüsselt via `electron.safeStorage` in
`userData/anthropic-api-key.enc`. Trotz des Telegram-Tabs wird der Key
auch von **Notes-Chat**, **Coach-Bot**, dem **Smart-Connections-LLM-
Reranker** und der **Email-Analyse** mitgenutzt — überall, wo die
Backend-Auswahl auf „Anthropic" oder „Auto" steht. Die Verortung im
Telegram-Tab ist historisch und wird vermutlich später in einen
eigenen „KI-Backends"-Tab gezogen.

## Wo trage ich Ollama-Modelle ein?

Ollama braucht keinen API-Key — es läuft lokal auf `localhost:11434`.
In **Settings → Integrationen → Ollama** wählst du das Standard-Modell
und siehst die Modul-Kompatibilität (welches Modell für welches
Feature geeignet ist).

## Sicherheit

Alles mit „safeStorage" in der Tabelle oben ist mit dem OS-Keychain
verschlüsselt und verlässt deinen Rechner nicht. Die mit ⚠️ markierten
Werte (Readwise, OpenAlex, LanguageTool, Imagen) liegen aktuell im
Klartext in `ui-settings.json` — bei Bedarf sollten sie auf safeStorage
migriert werden.

## Wenn ein Key fehlt

- Im **Zugangsdaten-Tab** klick auf „Einrichten" → springt zum richtigen
  Tab.
- Der **Coach (Onboarding)** prüft beim Start, ob Anthropic-Key oder
  Ollama verfügbar ist, und gibt einen direkten Hinweis, wenn nichts
  konfiguriert ist.
