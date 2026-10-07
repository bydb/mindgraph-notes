// Produktions-Verdrahtung der ExternalRendererRegistry: bindet die testbaren Seams an das echte
// `window.electronAPI`, an Blob-URL-`import()`, an host-eigene `<style>`-Elemente und an das App-Theme.
// Singleton + Boot-Init (main.tsx) + React-Hook für den plugin-editor-Tab.
//
// Der dynamische `import(blobUrl)` läuft unter der bestehenden CSP (`script-src … blob:`); KEIN
// `unsafe-eval`. Single-File-ESM wird im Pack/Sign-Pfad erzwungen (F12) — der Loader meldet einen
// fehlschlagenden Sub-Import nur ehrlich als Aktivierungsfehler (kein Regex-Sicherheitsversprechen).

import { useSyncExternalStore } from 'react'
import { useUIStore } from '../../stores/uiStore'
import { ExternalRendererRegistry, type RendererLoaderEnv } from './rendererRegistry'
import { useNotesStore } from '../../stores/notesStore'
import { useTabStore } from '../../stores/tabStore'
import { findNoteForWikilink, resolvePluginFileLink } from '../../utils/linkExtractor'
import { classifyPluginLink } from '../../../shared/pluginLink'

/**
 * Link aus einem Renderer-Plugin öffnen (Excalidraw-Element-Links, Codex F07). Nur während einer Nutzeraktion:
 * ohne Klick soll ein Plugin weder Notizen umschalten noch den Browser öffnen. Notizen über denselben Weg wie
 * Wikilinks im Editor (Notiz → sonst Plugin-Datei), extern über `open-external` (http/https/mailto).
 */
async function openPluginLink(link: string): Promise<'opened' | 'not-found' | 'refused'> {
  if (!navigator.userActivation?.isActive) return 'refused'
  const target = classifyPluginLink(link)
  if (target.kind === 'refused') return 'refused'
  if (target.kind === 'external') {
    return (await window.electronAPI.openExternal(target.url)) ? 'opened' : 'refused'
  }
  const { notes, fileTree, selectNote } = useNotesStore.getState()
  const note = findNoteForWikilink(target.target, notes)
  if (note) {
    selectNote(note.id)
    return 'opened'
  }
  const pluginFile = resolvePluginFileLink(target.target, fileTree)
  if (pluginFile) {
    useTabStore.getState().openPluginEditorTab(
      pluginFile.pluginEditor.pluginId,
      pluginFile.path,
      pluginFile.pluginEditor.editorId,
      pluginFile.name,
    )
    return 'opened'
  }
  return 'not-found'
}

function effectiveTheme(): 'light' | 'dark' {
  const t = useUIStore.getState().theme
  if (t === 'light' || t === 'dark') return t
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

const STYLE_ATTR = 'data-plugin-renderer'

const prodEnv: RendererLoaderEnv = {
  fetchList: () => window.electronAPI.pluginRenderers(),
  fetchEntry: (pluginId) => window.electronAPI.pluginRendererEntry(pluginId),
  invokeHost: (instanceId, op, args) => window.electronAPI.pluginHost(instanceId, op, args),
  ackActivated: async (ack) => {
    await window.electronAPI.pluginRendererActivated(ack)
  },
  createModuleUrl: (code) => URL.createObjectURL(new Blob([code], { type: 'text/javascript' })),
  importUrl: (url) => import(/* @vite-ignore */ url),
  revokeModuleUrl: (url) => URL.revokeObjectURL(url),
  applyStyles: (pluginId, css) => {
    let el = document.head.querySelector<HTMLStyleElement>(`style[${STYLE_ATTR}="${CSS.escape(pluginId)}"]`)
    if (!el) {
      el = document.createElement('style')
      el.setAttribute(STYLE_ATTR, pluginId)
      document.head.appendChild(el)
    }
    el.textContent = css
  },
  removeStyles: (pluginId) => {
    document.head.querySelector(`style[${STYLE_ATTR}="${CSS.escape(pluginId)}"]`)?.remove()
  },
  getTheme: effectiveTheme,
  openLink: openPluginLink,
  onThemeChange: (cb) => {
    let last = effectiveTheme()
    const fire = (): void => {
      const next = effectiveTheme()
      if (next !== last) {
        last = next
        cb(next)
      }
    }
    const unsubStore = useUIStore.subscribe(fire)
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    mq?.addEventListener('change', fire)
    return () => {
      unsubStore()
      mq?.removeEventListener('change', fire)
    }
  },
}

export const externalRendererRegistry = new ExternalRendererRegistry(prodEnv)

let initialized = false
/** Einmaliger Boot-Init (main.tsx): initial syncen + auf Lifecycle-Pushes + Teardown-Requests abonnieren. */
export function initExternalRenderers(): void {
  if (initialized) return
  initialized = true
  window.electronAPI.onPluginRenderersChanged(() => {
    void externalRendererRegistry.sync()
  })
  // Gerichteter Teardown (F15/F16): Main fordert das Entladen EINER instanceId an; wir disposen und acken
  // den §5.5-Ausgang zurück, damit Main erst bei `success` den Nachfolger startet/committet.
  window.electronAPI.onPluginRendererTeardown((rendererInstanceId) => {
    void externalRendererRegistry.teardownInstance(rendererInstanceId).then((outcome) => {
      void window.electronAPI.pluginRendererTornDown({ rendererInstanceId, outcome })
    })
  })
  void externalRendererRegistry.sync()
}

/** React-Hook: re-rendert, sobald sich der Ladezustand der Renderer-Plugins ändert. */
export function useRendererRevision(): number {
  return useSyncExternalStore(
    externalRendererRegistry.subscribe,
    externalRendererRegistry.getRevision,
    externalRendererRegistry.getRevision,
  )
}
