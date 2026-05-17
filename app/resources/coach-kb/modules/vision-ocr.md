---
id: vision-ocr
moduleId: vision-ocr
keywords: [ocr, scan, bild, foto, text, erkennen, handschrift, pdf, einlesen]
suggestsModules: [vision-ocr]
---

# Vision OCR

## Wann nutzen
Wenn du gescannte PDFs, Foto-Notizen oder handschriftliche Seiten in
durchsuchbaren Text wandeln willst. Läuft komplett lokal über Ollama-
Vision-Modelle, also auch für sensible Dokumente geeignet.

## Wie aktivieren
Einstellungen → Module → "Vision OCR". Voraussetzung: Ein Vision-
Modell ist in Ollama installiert (z.B. `llava`, `qwen2.5vl`,
`minicpm-v`).

## Beispiel
Ein gescanntes Sitzungsprotokoll (PDF) öffnen → rechts "Per Vision-
Modell extrahieren" → MindGraph rendert jede Seite als Bild, schickt sie
ans Vision-Modell und legt das Ergebnis als Markdown-Notiz neben dem
PDF ab.
