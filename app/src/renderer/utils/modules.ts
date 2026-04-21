import { useUIStore } from '../stores/uiStore'
import type { ModuleDescriptor } from '../stores/uiStore'

// Reaktiver Hook: liest Modul-Enable-Status aus dem uiStore und re-rendert bei Änderungen.
export function useIsModuleEnabled(id: ModuleDescriptor['id']): boolean {
  return useUIStore(state => {
    switch (id) {
      case 'notes-chat':        return state.notesChatEnabled
      case 'smart-connections': return state.smartConnectionsEnabled
      case 'language-tool':     return state.languageTool.enabled
      case 'email':             return state.email.enabled
      case 'mz-suite':          return state.edoobox.enabled || state.marketing.enabled
      case 'flashcards':        return state.flashcardsEnabled
      case 'semantic-scholar':  return state.semanticScholarEnabled
      case 'zotero':            return state.zoteroEnabled
      case 'readwise':          return state.readwise.enabled
      case 'remarkable':        return state.remarkable.enabled
      case 'docling':           return state.docling.enabled
      case 'vision-ocr':        return state.visionOcr.enabled
      case 'speech':            return state.speech.enabled
      default:                  return false
    }
  })
}

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
    case 'zotero':            return s.zoteroEnabled
    case 'readwise':          return s.readwise.enabled
    case 'remarkable':        return s.remarkable.enabled
    case 'docling':           return s.docling.enabled
    case 'vision-ocr':        return s.visionOcr.enabled
    case 'speech':            return s.speech.enabled
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
    case 'zotero':            s.setZoteroEnabled(enabled); break
    case 'readwise':          s.setReadwise({ enabled }); break
    case 'remarkable':        s.setRemarkable({ enabled }); break
    case 'docling':           s.setDocling({ enabled }); break
    case 'vision-ocr':        s.setVisionOcr({ enabled }); break
    case 'speech':            s.setSpeech({ enabled }); break
  }
}
