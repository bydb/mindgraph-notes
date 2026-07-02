// Plugin-Embeds (R2): gemeinsame Logik für `![[datei.ext]]`-Embeds von Renderer-Plugins —
// genutzt vom Live-Preview-Widget (Schreiben-Modus) UND der Preview-Hydration (Lesen-Modus).
//
// - resolvePluginEmbedTarget: synchrone Auflösung gegen den fileTree (memoisiert pro Referenz —
//   decorateImage läuft bei JEDEM selectionSet-Rebuild, ein Tree-Walk pro Cursor-Bewegung wäre teuer).
// - buildPluginEmbedFrame: der gemeinsame DOM-Rahmen (Header mit Dateiname + Öffnen-Aktion, Body).
// - mountPluginEmbedBody: mountet den vom Plugin registrierten Read-only-Embed in den Body;
//   Fallback-Hinweis wenn das Plugin keinen Embed liefert; wartet via Registry-Subscribe auf
//   spät ladende Plugins (App-Start-Race). Rückgabe = Cleanup (dispose + unsubscribe).

import { useNotesStore } from '../stores/notesStore'
import { externalRendererRegistry } from '../plugins/external/rendererHostClient'
import { resolvePluginFileLink, type ResolvedPluginFile } from './linkExtractor'
import type { FileEntry } from '../../shared/types'

let cachedTree: FileEntry[] | null = null
const cache = new Map<string, ResolvedPluginFile | null>()

export function resolvePluginEmbedTarget(fileName: string): ResolvedPluginFile | null {
  const key = fileName.trim().toLowerCase()
  if (!key || !key.includes('.')) return null

  const tree = useNotesStore.getState().fileTree
  if (tree !== cachedTree) {
    cachedTree = tree
    cache.clear()
  }

  const hit = cache.get(key)
  if (hit !== undefined) return hit
  const resolved = resolvePluginFileLink(key, tree)
  cache.set(key, resolved)
  return resolved
}

/** Größen-Syntax `![[datei.ext|400]]` bzw. `![[datei.ext|400x300]]`: Breite skaliert den
 *  Rahmen, Höhe den Body (Default 360px aus dem CSS). Gleiche Semantik wie Bild-Embeds. */
export interface PluginEmbedSize {
  width: number | null
  height: number | null
}

export function parsePluginEmbedSize(sizeSpec: string | null | undefined): PluginEmbedSize | null {
  if (!sizeSpec) return null
  const m = /^(\d+)(?:x(\d+))?$/.exec(sizeSpec.trim())
  if (!m) return null
  return { width: parseInt(m[1], 10), height: m[2] ? parseInt(m[2], 10) : null }
}

export function buildPluginEmbedFrame(
  fileName: string,
  onOpen: () => void,
  size?: PluginEmbedSize | null
): { frame: HTMLElement; body: HTMLElement } {
  const frame = document.createElement('div')
  frame.className = 'plugin-embed-frame'
  // Im WYSIWYG-Lesen-Modus (contentEditable) darf die Caret nicht in den Plugin-Inhalt wandern;
  // im CodeMirror-Widget ist non-editable ohnehin korrekt.
  frame.contentEditable = 'false'
  if (size?.width) {
    frame.style.width = `${size.width}px`
    frame.style.maxWidth = '100%'
  }

  const header = document.createElement('div')
  header.className = 'plugin-embed-header'
  const name = document.createElement('span')
  name.className = 'plugin-embed-name'
  name.textContent = fileName
  const openBtn = document.createElement('button')
  openBtn.type = 'button'
  openBtn.className = 'plugin-embed-open'
  openBtn.textContent = 'Öffnen'
  openBtn.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    onOpen()
  })
  header.append(name, openBtn)

  const body = document.createElement('div')
  body.className = 'plugin-embed-body'
  if (size?.height) body.style.height = `${size.height}px`
  frame.append(header, body)
  return { frame, body }
}

export function mountPluginEmbedBody(
  body: HTMLElement,
  pluginId: string,
  editorId: string,
  filePath: string
): () => void {
  const cleanup: Array<() => void> = []

  const showHint = (text: string): void => {
    body.classList.add('plugin-embed-hint')
    body.textContent = text
  }

  // 'mounted' ist terminal; 'hint' und 'pending' beobachten die Registry weiter — sonst bleibt
  // nach einem Plugin-Update bei OFFENER Notiz der v-alt-Hinweis-Chip stehen, obwohl die neue
  // Version einen Embed registriert (real passiert beim 0.1.4→0.2.0-Update des Excalidraw-Plugins).
  const tryMount = (): 'mounted' | 'hint' | 'pending' => {
    if (!externalRendererRegistry.isLoaded(pluginId, editorId)) return 'pending'
    if (!externalRendererRegistry.hasEmbed(pluginId, editorId)) {
      showHint('Dieses Plugin liefert keine Inline-Vorschau — „Öffnen" zeigt die Datei im Editor-Tab.')
      return 'hint'
    }
    // Body vor dem Mount leeren: das Plugin mountet seine eigene React-Root und erwartet
    // einen leeren Container (Lade-/Hinweis-Text würde sonst neben dem Embed stehen bleiben).
    body.classList.remove('plugin-embed-hint')
    body.textContent = ''
    const dispose = externalRendererRegistry.mountEmbed(pluginId, editorId, body, filePath)
    if (!dispose) {
      // Race: Registry-Stand hat sich zwischen hasEmbed und mountEmbed geändert → weiter beobachten.
      showHint('Embed konnte nicht geladen werden.')
      return 'hint'
    }
    cleanup.push(dispose)
    return 'mounted'
  }

  if (tryMount() !== 'mounted') {
    if (!body.textContent) showHint('Plugin lädt …')
    const unsub = externalRendererRegistry.subscribe(() => {
      if (tryMount() === 'mounted') unsub()
    })
    cleanup.push(unsub)
  }

  return () => {
    for (const fn of cleanup.splice(0)) {
      try {
        fn()
      } catch {
        /* best-effort */
      }
    }
  }
}
