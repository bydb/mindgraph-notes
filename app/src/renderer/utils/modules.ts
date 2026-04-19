import { useUIStore } from '../stores/uiStore'
import type { ModuleDescriptor } from '../stores/uiStore'

// Mappt eine Modul-ID auf die bestehenden uiStore-Flags.
// MZ-Suite ist ein Bundle, das mehrere Flags gleichzeitig setzt.
export function isModuleEnabled(id: ModuleDescriptor['id']): boolean {
  const s = useUIStore.getState()
  switch (id) {
    case 'notes-chat':        return s.notesChatEnabled
    case 'smart-connections': return s.smartConnectionsEnabled
    case 'language-tool':     return s.languageTool.enabled
    case 'email':             return s.email.enabled
    case 'mz-suite':          return s.edoobox.enabled || s.marketing.enabled
    case 'flashcards':        return s.flashcardsEnabled
    case 'semantic-scholar':  return s.semanticScholarEnabled
    case 'readwise':          return s.readwise.enabled
    case 'remarkable':        return s.remarkable.enabled
    case 'docling':           return s.docling.enabled
    case 'vision-ocr':        return s.visionOcr.enabled
    default:                  return false
  }
}

export function setModuleEnabled(id: ModuleDescriptor['id'], enabled: boolean): void {
  const s = useUIStore.getState()
  switch (id) {
    case 'notes-chat':        s.setNotesChatEnabled(enabled); break
    case 'smart-connections': s.setSmartConnectionsEnabled(enabled); break
    case 'language-tool':     s.setLanguageTool({ enabled }); break
    case 'email':             s.setEmail({ enabled }); break
    case 'mz-suite':
      s.setEdoobox({ enabled })
      s.setMarketing({ enabled })
      break
    case 'flashcards':        s.setFlashcardsEnabled(enabled); break
    case 'semantic-scholar':  s.setSemanticScholarEnabled(enabled); break
    case 'readwise':          s.setReadwise({ enabled }); break
    case 'remarkable':        s.setRemarkable({ enabled }); break
    case 'docling':           s.setDocling({ enabled }); break
    case 'vision-ocr':        s.setVisionOcr({ enabled }); break
  }
}
