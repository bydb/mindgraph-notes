---
id: workflow-canvas
moduleId: workflow-canvas
keywords: [workflow, workflows, canvas, automation, automatisierung, ablauf, baustein, bausteine, knoten, verbinden, trigger, mail, email, e-mail, ollama, ki, agent, no-code, low-code, flow]
suggestsModules: [workflow-canvas, email]
---

# Workflow Canvas

## Wann nutzen
Wenn du E-Mail-Verarbeitung oder andere Schritte **visuell als Ablauf
aus Bausteinen** zusammensteckst, statt sie fest einzubauen. Beispiel:
neue Mail → analysieren → Projekt erkennen → Antwortentwurf von Ollama →
du prüfst und schickst. Der Canvas ersetzt keine vorhandene Funktion,
er verkettet sie.

## Wie aktivieren
Einstellungen → Module → „Workflow Canvas" einschalten. Danach gibt es
einen neuen Tab-Typ „Workflow Canvas" und im Dashboard das Canvas-
Symbol. Voraussetzung für die Ollama-Bausteine: Ollama läuft lokal.

## Was ein Workflow ist
Eine Fläche (React Flow) mit **Knoten** und **typisierten Verbindungen**.
Jeder Knoten ist eine Aktion mit Input- und Output-Ports — nur passende
Typen lassen sich verbinden. Aktuell ist **ein** Workflow pro Vault
persistiert (`.mindgraph/workflows.json`), Multi-Workflow-Verwaltung
kommt später.

## Die eingebauten Bausteine

### Auslöser
- **E-Mail (Auslöser)** — `email.selectedEmail`. Liefert die aktuell
  markierte oder neu eingegangene Mail als Start-Input.

### Analyse / Kontext
- **E-Mail analysieren** — Relevanz, Sentiment, Zusammenfassung,
  Aufgaben, Reply-Bedarf.
- **Projekt erkennen** — matcht die Mail über die `_STATUS.md`-Keywords
  auf ein Projekt im Vault.
- **Projektkontext laden** — liest die `_STATUS*.md`-Dateien des
  erkannten Projekts und gibt sie als Kontext weiter.

### Ollama (lokal)
- **Ollama: Zusammenfassen**
- **Ollama: Antwort entwerfen**
- **Ollama: Aufgaben extrahieren**
- **Ollama: Klassifizieren**
- **Ollama: Freier Prompt** (du gibst den Prompt selbst vor)

Jeder Ollama-Baustein hat einen Modell-Picker. Bei kritischen Aktionen
(z.B. Aufgaben-Extraktion) greift die Modell-Kompatibilitäts-Matrix —
ungeeignete Modelle werden hart geblockt.

### Notizen
- **Notiz erstellen** in einem Zielordner
- **Notizen suchen** im Vault
- **An Notiz anhängen**

Schreibvorgänge laufen alle durch dieselbe geprüfte Schreibgrenze mit
automatischem Backup.

### Mensch-in-der-Schleife
- **Mensch prüft (Text)**
- **Mensch prüft (Antwort)** — bei manuellem Lauf öffnet sich direkt
  das Compose-Fenster mit dem Entwurf; bei automatischem Lauf entsteht
  ein Task „✉️ Entwurf prüfen" in deiner Aufgabenliste.

## Trigger
- **Manuell** — Play-Button. Seed ist die ausgewählte Mail.
- **Event** — neue relevante Mail, solange der Canvas-Tab offen ist.
  Jede Mail feuert pro Workflow **genau einmal** (exactly-once).

## Beispiel-Flows
1. *Neue Mail → analysieren → Projekt erkennen → Projektkontext laden →
   Ollama Antwort entwerfen → Mensch prüft (Antwort)*
2. *Neue Mail → analysieren → Ollama Aufgaben extrahieren → an
   Projektnotiz anhängen*
3. *Mail (Auslöser) → Ollama Klassifizieren → Notiz erstellen im
   passenden Ordner*

## Grenzen heute (ehrlich)
- Nur **ein** Workflow gleichzeitig pro Vault.
- Trigger ist auf E-Mail-Events ausgelegt — kein Zeitplan, keine
  Webhooks, keine generischen Datei-Trigger.
- Kein Pause/Resume: „Mensch prüft" ist ein Hand-off, nicht ein Halt
  mit Wiederaufnahme.
