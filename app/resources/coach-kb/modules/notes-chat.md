---
id: notes-chat
moduleId: notes-chat
keywords: [chat, ki, fragen, notizen, antworten, gespräch, kontext, llm, sokratisch, sokratischer, dialog, lernen, direkt, modus, modi]
suggestsModules: [notes-chat]
---

# Notes-Chat

## Wann nutzen
Wenn du Fragen zu deinen Notizen stellen willst ("was habe ich über X
geschrieben?") oder Texte umformulieren, zusammenfassen, weiterführen
willst. Greift wahlweise auf die aktuelle Notiz, einen Ordner oder den
ganzen Vault als Kontext zu.

## Wie aktivieren
Einstellungen → Module → "Notes-Chat" aktivieren. Voraussetzung: Ollama
läuft lokal, LM Studio läuft lokal, **oder** ein Anthropic-API-Key ist
eingerichtet (Settings → Telegram). Notes-Chat unterstützt alle drei
Backends.

## Die zwei Chat-Modi

Im Notes-Chat-Panel oben gibt es einen Modus-Umschalter mit zwei Buttons:

### Direkt (Default)
Die KI antwortet auf deine Frage so gut sie kann — direkter Frage-
Antwort-Stil. Das ist der normale Chat-Modus.

### Sokratisch
Die KI antwortet **nicht** direkt, sondern stellt **eine** gezielte
Rückfrage, die dich zum Nachdenken anregt. Lernmodus — gut, wenn du
selbst auf die Antwort kommen willst, statt sie vorgekaut zu bekommen.
Nur wenn du "Ich weiß nicht" oder "Sag es mir" tippst, gibt die KI
einen kleinen Hinweis statt die nächste Frage.

Wechseln kannst du den Modus jederzeit über den Toggle oben im
Chat-Panel.

## Kontext-Modi

Unabhängig vom Chat-Modus stellst du ein, wieviel Kontext die KI sieht:

- **Aktuelle Notiz** — nur die offene Notiz
- **Ordner** — alle Notizen im aktuellen Ordner
- **Alle Notizen** — der gesamte Vault (kann bei großen Vaults
  ausbremsen)

## Beispiele

**Direkt**: Notiz "Projektbesprechung 2026-04-12" öffnen → "Fasse die
Kernpunkte und offenen Aufgaben zusammen" → KI liefert eine
strukturierte Zusammenfassung.

**Sokratisch**: Notiz "Konzept Lernscreens" öffnen → "Warum ist
Spaced Repetition besser als Massed Practice?" → KI antwortet z.B.
"Was passiert in deinem Gedächtnis, wenn du etwas direkt nach dem
Lernen wiederholst, im Vergleich zu einer Wiederholung am nächsten
Tag?" — du denkst nach, antwortest, KI fragt weiter.
