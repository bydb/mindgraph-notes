// Host-Tab für den Arbeitsbereich eines externen Renderer-Plugins (API ≥0.2.3). Wie PluginEditorTab:
// leerer Container, das Plugin mountet seine EIGENE React-Root imperativ. Harter Remount bei
// instanceId-Wechsel (Upgrade), Dispose beim Schließen des Tabs.

import React, { useEffect, useRef } from 'react'
import { externalRendererRegistry, useRendererRevision } from './rendererHostClient'

export const ExternalWorkspaceTab: React.FC<{ pluginId: string; tabId: string }> = ({ pluginId, tabId }) => {
  const containerRef = useRef<HTMLDivElement>(null)
  useRendererRevision()
  const instanceId = externalRendererRegistry.getInstanceId(pluginId)
  const loaded = externalRendererRegistry.listWorkspaceTabs().some((t) => t.pluginId === pluginId && t.tabId === tabId)

  useEffect(() => {
    const container = containerRef.current
    if (!container || !loaded) return
    const dispose = externalRendererRegistry.mountWorkspaceTab(pluginId, tabId, container)
    return () => dispose?.()
  }, [pluginId, tabId, instanceId, loaded])

  return (
    <div className="plugin-view-tab" style={{ height: '100%', position: 'relative', overflow: 'hidden' }}>
      {!loaded && (
        <div style={{ padding: '1.5rem', color: 'var(--text-secondary, #888)' }}>
          Das Plugin ist nicht geladen. Es lässt sich unter Einstellungen → Module → Plugins aktivieren.
        </div>
      )}
      <div ref={containerRef} style={{ height: '100%', width: '100%' }} />
    </div>
  )
}
