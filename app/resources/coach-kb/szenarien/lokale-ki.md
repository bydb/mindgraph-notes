---
id: szenario-lokale-ki
keywords: [lokal, datenschutz, ollama, privacy, offline, ki, cloud, vertraulich, sensibel]
suggestsModules: [notes-chat, smart-connections, vision-ocr, speech]
suggestsWidgets: [focus, activity, radar]
---

# Szenario: Lokales KI-Wissenssystem

## Für wen
Wer KI auf eigenen Notizen will, aber nichts in die Cloud schicken
möchte. Alles läuft über Ollama lokal auf demselben Rechner.

## Bausteine
- **Ollama** lokal installiert (https://ollama.com), Modell installiert
  (empfohlen: `qwen3`, `llama3.1`)
- **Notes-Chat**: Fragen an den eigenen Vault
- **Smart Connections**: Ähnliche Notizen finden (Embedding `bge-m3`)
- **Vision OCR**: Scans lokal extrahieren
- **Sprache** (Whisper) für Diktat ohne Cloud

## Dashboard
Empfehlung: `focus`, `activity`, `radar`.

## Erste Notizen
- Ordner `600 - Wissen`
- Notiz `600 - Wissen/Hauptthemen.md`

## Was vermeiden
Bei wenig RAM kein 70B-Modell wählen — `qwen3:8b` oder `llama3.1:8b`
sind ein guter Kompromiss aus Qualität und Geschwindigkeit.
