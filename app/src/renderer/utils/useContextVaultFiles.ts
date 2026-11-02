// Notiz-Agent Phase 1: Kandidatenliste für den Kontext-Datei-Picker — alle vom
// Reader unterstützten Dateien aus dem FileTree, flach. Geteilt von Macher-Leiste
// (AiActionBar) und Notes-Chat.

import { useMemo } from 'react'
import { useNotesStore } from '../stores/notesStore'
import type { FileEntry } from '../../shared/types'

const SUPPORTED = /\.(xlsx|xls|docx|pptx|pdf|md|markdown|txt|csv|html|htm)$/i
// Bilder (JPEG, PNG) liest nur der Agent-Auftrag, per lokaler Texterkennung (main/ocr/agentOcr.ts).
// Notiz-Chat und Umschreib-Vorschlag haben keine Erkennung — dort ein Bild anzubieten, hieße
// eine Anfrage, die mit Fehler endet.
const IMAGES = /\.(png|jpe?g)$/i

export interface ContextVaultFile {
  relPath: string
  name: string
  isFolder: boolean
}

export function useContextVaultFiles(opts: { images?: boolean } = {}): ContextVaultFile[] {
  const images = opts.images === true
  const fileTree = useNotesStore(s => s.fileTree)
  return useMemo(() => {
    const out: ContextVaultFile[] = []
    const walk = (entries: FileEntry[]) => {
      for (const e of entries) {
        if (e.isDirectory) {
          // Ordner-Kontext (Stufe 1): Ordner sind selbst anhängbar (Manifest + Prioritätslesen).
          out.push({ relPath: e.path, name: e.name, isFolder: true })
          if (e.children) walk(e.children)
        } else if (SUPPORTED.test(e.name) || (images && IMAGES.test(e.name))) {
          out.push({ relPath: e.path, name: e.name, isFolder: false })
        }
      }
    }
    walk(fileTree)
    return out
  }, [fileTree, images])
}
