import { useUIStore } from '../stores/uiStore'
import { MODULES as CORE_MODULES, type ModuleDescriptor } from '../stores/uiStore'
import { readBoolPath } from '../../shared/plugins/moduleGate'
import { setPluginEnabled } from '../plugins/client'
import { pluginManifests } from '../plugins/catalog'

const pluginModules = pluginManifests
  .filter((manifest) => !!manifest.module)
  .map((manifest): ModuleDescriptor => ({
    id: manifest.module?.id ?? manifest.id,
    label: manifest.label,
    description: manifest.description,
    category: manifest.category,
    iconText: manifest.icon?.text,
    iconColor: manifest.icon?.color,
  }))

/** Kernmodule plus alle manifest-deklarierten Plugin-Module. */
export const MODULES: readonly ModuleDescriptor[] = [...CORE_MODULES, ...pluginModules]

/** Modul-Ids, die von einem (manifest-deklarierten) Plugin stammen — für die Trennung
 *  „MindGraph-Module" vs. „Installierte Plugins" in der Settings-UI. */
export const PLUGIN_MODULE_IDS: ReadonlySet<string> = new Set(pluginModules.map(m => m.id))

/** Ist dieses Modul plugin-gestützt (vs. Kern-Modul)? */
export function isPluginModule(id: string): boolean {
  return PLUGIN_MODULE_IDS.has(id)
}

function pluginManifestsForModule(id: string) {
  return pluginManifests.filter((manifest) => manifest.module && (manifest.module.id ?? manifest.id) === id)
}

function pluginModuleEnabled(state: unknown, id: string): boolean | undefined {
  const manifests = pluginManifestsForModule(id)
  if (manifests.length === 0) return undefined
  return manifests.some((manifest) => {
    const module = manifest.module!
    return [module.enabledPath, ...(module.linkedEnabledPaths ?? [])]
      .some((path) => readBoolPath(state, path))
  })
}

// Reaktiver Hook: liest Modul-Enable-Status aus dem uiStore und re-rendert bei Änderungen.
export function useIsModuleEnabled(id: ModuleDescriptor['id']): boolean {
  return useUIStore(state => {
    const pluginEnabled = pluginModuleEnabled(state, id)
    if (pluginEnabled !== undefined) return pluginEnabled
    switch (id) {
      case 'notes-chat':        return state.notesChatEnabled
      case 'project-rag':       return state.projectRagEnabled
      case 'smart-connections': return state.smartConnectionsEnabled
      case 'language-tool':     return state.languageTool.enabled
      case 'email':             return state.email.enabled
      case 'flashcards':        return state.flashcardsEnabled
      case 'workflow-canvas':   return state.workflowCanvasEnabled
      case 'semantic-scholar':  return state.semanticScholarEnabled
      case 'zotero':            return state.zoteroEnabled
      case 'readwise':          return state.readwise.enabled
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
  const pluginEnabled = pluginModuleEnabled(s, id)
  if (pluginEnabled !== undefined) return pluginEnabled
  switch (id) {
    case 'notes-chat':        return s.notesChatEnabled
    case 'project-rag':       return s.projectRagEnabled
    case 'smart-connections': return s.smartConnectionsEnabled
    case 'language-tool':     return s.languageTool.enabled
    case 'email':             return s.email.enabled
    case 'flashcards':        return s.flashcardsEnabled
    case 'workflow-canvas':   return s.workflowCanvasEnabled
    case 'semantic-scholar':  return s.semanticScholarEnabled
    case 'zotero':            return s.zoteroEnabled
    case 'readwise':          return s.readwise.enabled
    case 'docling':           return s.docling.enabled
    case 'vision-ocr':        return s.visionOcr.enabled
    case 'speech':            return s.speech.enabled
    default:                  return false
  }
}

/** Setzt nur die uiStore-Flags eines Moduls (synchron). Lifecycle-Sync passiert in setModuleEnabled. */
function applyModuleFlags(id: ModuleDescriptor['id'], enabled: boolean): void {
  const s = useUIStore.getState()
  const manifests = pluginManifestsForModule(id)
  if (manifests.length > 0) {
    for (const manifest of manifests) {
      const module = manifest.module!
      for (const path of [module.enabledPath, ...(module.linkedEnabledPaths ?? [])]) {
        s.setBooleanSettingPath(path, enabled)
      }
    }
    return
  }
  switch (id) {
    case 'notes-chat':        s.setNotesChatEnabled(enabled); break
    case 'project-rag':       s.setProjectRagEnabled(enabled); break
    case 'smart-connections': s.setSmartConnectionsEnabled(enabled); break
    case 'language-tool':     s.setLanguageTool({ enabled }); break
    case 'email':             s.setEmail({ enabled }); break
    case 'flashcards':        s.setFlashcardsEnabled(enabled); break
    case 'workflow-canvas':   s.setWorkflowCanvasEnabled(enabled); break
    case 'semantic-scholar':  s.setSemanticScholarEnabled(enabled); break
    case 'zotero':            s.setZoteroEnabled(enabled); break
    case 'readwise':          s.setReadwise({ enabled }); break
    case 'docling':           s.setDocling({ enabled }); break
    case 'vision-ocr':        s.setVisionOcr({ enabled }); break
    case 'speech':            s.setSpeech({ enabled }); break
  }
}

/**
 * Schaltet ein Modul um und synchronisiert — bei plugin-gestützten Modulen — den
 * Lebenszyklus im Main-Prozess (A-pre Schritt 1). Folgt der Main-Prozess NICHT (Aktivierung
 * schlägt fehl), wird der UI-Schalter zurückgerollt und der Fehler weitergereicht, damit
 * der Renderer-State nicht vom echten Plugin-Zustand abweicht.
 */
export async function setModuleEnabled(id: ModuleDescriptor['id'], enabled: boolean): Promise<void> {
  const manifests = pluginManifestsForModule(id)

  // Kein plugin-gestütztes Modul → reiner Flag-Flip, kein Main-Roundtrip nötig.
  if (manifests.length === 0) {
    applyModuleFlags(id, enabled)
    return
  }

  const prev = isModuleEnabled(id)
  applyModuleFlags(id, enabled)

  // Flag-Zustand NACH dem Setter frisch lesen (das Bundle-Modul 'mz-suite' setzt edoobox.enabled)
  // und nur die von diesem Modul gesteuerten Plugins synchronisieren.
  const next = useUIStore.getState() as unknown
  try {
    await Promise.all(
      manifests.map((manifest) =>
        setPluginEnabled(manifest.id, readBoolPath(next, manifest.module!.enabledPath))
      )
    )
  } catch (err) {
    applyModuleFlags(id, prev) // Rollback: UI-Schalter wieder in den echten Zustand bringen
    console.error(`[plugin] Modul '${id}' konnte im Main-Prozess nicht ${enabled ? 'aktiviert' : 'deaktiviert'} werden:`, err)
    throw err
  }
}
