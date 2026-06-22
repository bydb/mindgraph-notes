import type { AIResult } from '../components/Editor/AIContextMenu'

const ACTION_LABELS: Record<string, string> = {
  translate: 'Übersetzung',
  summarize: 'Zusammenfassung',
  continue: 'Fortsetzung',
  improve: 'Verbesserung',
  'ocr-cleanup': 'OCR-Bereinigung',
  custom: 'Eigener Prompt'
}

/**
 * Zählt bestehende KI-Fußnoten im Dokument
 */
export function countAIFootnotes(content: string): number {
  const matches = content.match(/\[\^ai-\d+\]/g)
  return matches ? matches.length : 0
}

/**
 * Findet die nächste verfügbare Fußnoten-Nummer
 */
export function getNextFootnoteNumber(content: string): number {
  const matches = content.match(/\[\^ai-(\d+)\]/g)
  if (!matches) return 1

  const numbers = matches.map(m => {
    const match = m.match(/\[\^ai-(\d+)\]/)
    return match ? parseInt(match[1], 10) : 0
  })

  return Math.max(...numbers) + 1
}

/**
 * Generiert eine KI-Fußnote im Markdown-Format (kompakt, einzeilig)
 */
export function generateAIFootnote(result: AIResult, footnoteNumber: number): string {
  const actionLabel = ACTION_LABELS[result.action] || result.action
  const date = new Date(result.timestamp).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })

  // Originaltext kürzen wenn zu lang (für die Fußnote)
  const originalPreview = result.originalText.length > 50
    ? result.originalText.slice(0, 50) + '…'
    : result.originalText

  // Kompaktes Format: alles in einer Zeile
  let actionInfo = actionLabel
  if (result.targetLanguage) {
    actionInfo += ` → ${result.targetLanguage}`
  }
  if (result.action === 'custom' && result.customPrompt) {
    const shortPrompt = result.customPrompt.length > 30
      ? result.customPrompt.slice(0, 30) + '…'
      : result.customPrompt
    actionInfo += `: "${shortPrompt}"`
  }

  // Einzeilige Fußnote mit Ollama-Kennzeichnung
  const footnoteContent = `[^ai-${footnoteNumber}]: ⚡ ${actionInfo} · \`${result.model}\` · ${date} · „${originalPreview.replace(/\n/g, ' ')}"\n`

  return footnoteContent
}

/**
 * Fügt das AI-Ergebnis mit Fußnote in den Text ein
 */
export function insertAIResultWithFootnote(
  currentContent: string,
  selectionStart: number,
  selectionEnd: number,
  result: AIResult
): { newContent: string; newCursorPos: number } {
  const footnoteNumber = getNextFootnoteNumber(currentContent)
  const footnoteRef = `[^ai-${footnoteNumber}]`
  const footnoteDefinition = generateAIFootnote(result, footnoteNumber)

  // Text vor und nach der Selektion
  const beforeSelection = currentContent.slice(0, selectionStart)
  const afterSelection = currentContent.slice(selectionEnd)

  // Das Ergebnis mit Fußnotenreferenz
  let resultText = ''

  switch (result.action) {
    case 'translate':
      // Bei Übersetzung: Originaltext behalten, Übersetzung danach
      resultText = `${result.originalText} *${result.result}*${footnoteRef}`
      break

    case 'summarize':
      // Bei Zusammenfassung: Zusammenfassung ersetzt Originaltext
      resultText = `${result.result}${footnoteRef}`
      break

    case 'continue':
      // Bei Fortsetzung: Originaltext + Fortsetzung (markiert)
      resultText = `${result.originalText} *${result.result}*${footnoteRef}`
      break

    case 'improve':
      // Bei Verbesserung: Verbesserter Text ersetzt Original
      resultText = `${result.result}${footnoteRef}`
      break

    case 'custom':
      // Bei eigenem Prompt: Ergebnis ersetzt Original
      resultText = `${result.result}${footnoteRef}`
      break

    default:
      resultText = `${result.result}${footnoteRef}`
  }

  // Prüfen ob es bereits einen Fußnoten-Bereich gibt
  // Kleine, dezente Überschrift mit Ollama-Hinweis
  const footnoteSection = '\n\n---\n<small>🦙 KI-Dokumentation</small>\n\n'
  let newContent = ''

  if (currentContent.includes('KI-Dokumentation')) {
    // Fußnote am Ende des bestehenden Bereichs hinzufügen
    newContent = beforeSelection + resultText + afterSelection + '\n' + footnoteDefinition
  } else {
    // Neuen Fußnoten-Bereich erstellen
    newContent = beforeSelection + resultText + afterSelection + footnoteSection + footnoteDefinition
  }

  return {
    newContent,
    newCursorPos: selectionStart + resultText.length
  }
}
