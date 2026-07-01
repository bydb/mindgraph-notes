// Host-Tab für einen externen Renderer-Plugin-Editor (ADR plugin-renderer-host §7). Stellt nur einen
// leeren Container; das Plugin mountet seine EIGENE React-Root imperativ (Dual-React-sicher). Der Mount
// ist LAZY (erst hier, beim Tab-Öffnen). Bei instanceId-Wechsel (Upgrade) wird hart neu gemountet (F10).

import React, { useEffect, useRef, useState } from 'react'
import {
  externalRendererRegistry,
  useRendererRevision,
} from './rendererHostClient'

export const PluginEditorTab: React.FC<{
  pluginId: string
  filePath: string
  editorId?: string
}> = ({ pluginId, filePath, editorId }) => {
  const containerRef = useRef<HTMLDivElement>(null)
  // Re-render bei Lifecycle-Änderungen; die instanceId wird danach frisch gelesen und ist die Effekt-Dep.
  useRendererRevision()
  const instanceId = externalRendererRegistry.getInstanceId(pluginId)
  const [error, setError] = useState<string>()

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    if (!editorId) {
      setError('Diesem Editor wurde keine editorId zugeordnet.')
      return
    }
    if (!externalRendererRegistry.isLoaded(pluginId, editorId)) {
      // Plugin (noch) nicht geladen → der useRendererRevision-Re-Render mountet, sobald es bereit ist.
      setError(undefined)
      return
    }
    const dispose = externalRendererRegistry.mountEditor(pluginId, editorId, container, filePath)
    if (!dispose) {
      setError('Der Editor konnte nicht gemountet werden.')
      return
    }
    setError(undefined)
    return () => dispose()
    // instanceId in den Deps: harter Remount nur bei (Re-)Aktivierung dieses Plugins, nicht bei fremden.
  }, [pluginId, filePath, editorId, instanceId])

  const pending = !error && !externalRendererRegistry.isLoaded(pluginId, editorId)

  return (
    <div className="plugin-editor-tab" style={{ height: '100%', position: 'relative', overflow: 'hidden' }}>
      {error ? (
        <div className="plugin-editor-message" style={{ padding: '1.5rem', color: 'var(--text-secondary, #888)' }}>
          {error}
        </div>
      ) : null}
      {pending ? (
        <div className="plugin-editor-message" style={{ padding: '1.5rem', color: 'var(--text-secondary, #888)' }}>
          Editor wird geladen …
        </div>
      ) : null}
      <div ref={containerRef} style={{ height: '100%', width: '100%' }} />
    </div>
  )
}
