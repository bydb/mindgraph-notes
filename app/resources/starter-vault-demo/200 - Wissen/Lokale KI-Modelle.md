---
tags: [wissen, ki]
category: 🔵
---

# Lokale KI-Modelle

Sprachmodelle müssen nicht in der Cloud laufen. Mit Ollama oder LM Studio laufen offene Modelle (Qwen, Gemma, Mistral, Llama) direkt auf dem eigenen Rechner.

## Warum lokal?

- **Datenschutz**: Notizen, Mails und Schülerdaten verlassen den Rechner nicht — für Schulen und Behörden oft die einzige zulässige Option
- **Kosten**: Keine API-Gebühren, keine Abos
- **Verfügbarkeit**: Funktioniert auch ohne Internet

## Was man braucht

Als Faustregel: Ein 4-Milliarden-Parameter-Modell (etwa 3 bis 4 GB) läuft ab 8 GB RAM ordentlich, ein 8B-Modell will 16 GB. MindGraph Notes zeigt pro Modell an, wofür es sich empirisch eignet — und warnt, wenn ein Modell nicht in den Arbeitsspeicher passt.

## Grenzen

Kleine lokale Modelle sind schwächer als große Cloud-Modelle — gutes [[Prompt-Engineering Grundlagen|Prompting]] gleicht viel davon aus. Für unkritische Aufgaben lassen sich in MindGraph Notes zusätzlich Cloud-Anbieter freischalten; sensible Daten bleiben per Voreinstellung lokal.
