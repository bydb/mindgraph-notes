import React, { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { WidgetView } from '@mindgraph/plugin-api'
import type { ExternalWidgetDescriptor } from '../../../shared/plugins/widget'
import { ExternalWidgetHost } from './ExternalWidgetHost'
import { ExternalWidgetRegistry, type ExternalWidgetSlot as ExternalWidgetSlotId } from './registry'
import './ExternalWidget.css'

export const externalWidgetRegistry = new ExternalWidgetRegistry()

export async function refreshExternalWidgets(): Promise<void> {
  const result = await window.electronAPI.pluginWidgets()
  if (!result.ok) throw new Error(result.error ?? 'Widget-Liste konnte nicht geladen werden')
  externalWidgetRegistry.replace(result.data ?? [])
}

const WidgetInstance: React.FC<{ descriptor: ExternalWidgetDescriptor }> = ({ descriptor }) => {
  const [view, setView] = useState<WidgetView>()
  const [error, setError] = useState<string>()

  useEffect(() => {
    let live = true
    setView(undefined)
    setError(undefined)
    window.electronAPI.pluginWidgetData(descriptor.instanceId)
      .then((result) => {
        if (!live) return
        if (result.ok && result.data) setView(result.data)
        else setError(result.error ?? 'Widget-Daten konnten nicht geladen werden')
      })
      .catch((err) => {
        if (live) setError(err instanceof Error ? err.message : String(err))
      })
    return () => { live = false }
  }, [descriptor.instanceId])

  return (
    <ExternalWidgetHost
      pluginId={descriptor.pluginId}
      view={view}
      loading={!view && !error}
      error={error}
    />
  )
}

export const ExternalWidgetSlot: React.FC<{ slot: ExternalWidgetSlotId }> = ({ slot }) => {
  const revision = useSyncExternalStore(
    externalWidgetRegistry.subscribe,
    externalWidgetRegistry.getRevision,
    externalWidgetRegistry.getRevision
  )
  const entries = useMemo(() => externalWidgetRegistry.getBySlot(slot), [slot, revision])
  const [listError, setListError] = useState<string>()

  useEffect(() => {
    const refresh = () => {
      refreshExternalWidgets()
        .then(() => setListError(undefined))
        .catch((err) => setListError(err instanceof Error ? err.message : String(err)))
    }
    refresh()
    const unsubscribe = window.electronAPI.onPluginWidgetsChanged(refresh)
    return unsubscribe
  }, [])

  if (listError) {
    return <div className="ext-widget-error">{listError}</div>
  }
  if (entries.length === 0) return null
  return (
    <div className="ext-widget-slot" data-external-widget-slot={slot}>
      {entries.map((entry) => <WidgetInstance key={entry.instanceId} descriptor={entry} />)}
    </div>
  )
}
