import React, { useCallback, useMemo, useEffect, memo } from 'react'
import ReactFlow, {
  Node,
  Edge,
  useNodesState,
  useEdgesState,
  Controls,
  MiniMap,
  Background,
  BackgroundVariant,
  ReactFlowProvider,
  useReactFlow
} from 'reactflow'
import 'reactflow/dist/style.css'

import { useNotesStore } from '../../stores/notesStore'
import { useTabStore } from '../../stores/tabStore'
import { SimpleNoteNode } from './SimpleNoteNode'
import { useTranslation } from '../../utils/translations'
import type { Note } from '../../../shared/types'

// Node types - nur SimpleNoteNode
const nodeTypes = { note: SimpleNoteNode } as const

// Fit view options
const fitViewOptions = { padding: 0.2, minZoom: 0.5, maxZoom: 1.5 }

interface LocalCanvasProps {
  tabId: string
  rootNoteId: string
}

// Inner component that uses ReactFlow hooks
const LocalCanvasInner: React.FC<LocalCanvasProps> = memo(({ tabId, rootNoteId }) => {
  const { t } = useTranslation()
  // Nur die nötigsten Store-Zugriffe
  const allNotes = useNotesStore((s) => s.notes)
  const selectNote = useNotesStore((s) => s.selectNote)

  const { getCanvasState, expandNode, resetCanvasTab } = useTabStore()
  const { fitView } = useReactFlow()

  // Canvas State für diesen Tab
  const canvasState = getCanvasState(tabId)
  const expandedNoteIds = canvasState?.expandedNoteIds || new Set<string>()

  // Schnelle Map für Note-Lookups
  const noteMap = useMemo(() => {
    const map = new Map<string, Note>()
    allNotes.forEach(note => map.set(note.id, note))
    return map
  }, [allNotes])

  // Gefilterte Notizen: NUR Root + direkte Verbindungen + erweiterte
  const visibleNotes = useMemo(() => {
    const rootNote = noteMap.get(rootNoteId)
    if (!rootNote) return []

    const visibleIds = new Set<string>([rootNoteId])

    // Verbindungen einer Note hinzufügen
    const addConnections = (note: Note) => {
      // Outgoing links
      for (const linkText of note.outgoingLinks) {
        const targetNote = allNotes.find(n =>
          n.title === linkText ||
          n.path === linkText ||
          n.path.endsWith(`/${linkText}.md`) ||
          n.path.endsWith(`/${linkText}`)
        )
        if (targetNote) visibleIds.add(targetNote.id)
      }
      // Incoming links
      for (const backlinkId of note.incomingLinks) {
        visibleIds.add(backlinkId)
      }
    }

    // Root-Verbindungen
    addConnections(rootNote)

    // Erweiterte Nodes
    for (const expandedId of expandedNoteIds) {
      const expandedNote = noteMap.get(expandedId)
      if (expandedNote) {
        addConnections(expandedNote)
      }
    }

    return allNotes.filter(n => visibleIds.has(n.id))
  }, [rootNoteId, expandedNoteIds, noteMap, allNotes])

  // Versteckte Verbindungen pro Note berechnen
  const hiddenConnectionsMap = useMemo(() => {
    const result = new Map<string, number>()
    const visibleIds = new Set(visibleNotes.map(n => n.id))

    for (const note of visibleNotes) {
      if (expandedNoteIds.has(note.id)) continue // Bereits expandiert

      let hidden = 0
      // Outgoing
      for (const linkText of note.outgoingLinks) {
        const target = allNotes.find(n =>
          n.title === linkText || n.path === linkText ||
          n.path.endsWith(`/${linkText}.md`) || n.path.endsWith(`/${linkText}`)
        )
        if (target && !visibleIds.has(target.id)) hidden++
      }
      // Incoming
      for (const backlinkId of note.incomingLinks) {
        if (!visibleIds.has(backlinkId)) hidden++
      }

      if (hidden > 0) result.set(note.id, hidden)
    }
    return result
  }, [visibleNotes, expandedNoteIds, allNotes])

  // Callbacks
  const handleExpand = useCallback((noteId: string) => {
    expandNode(tabId, noteId)
  }, [tabId, expandNode])

  const handleNodeClick = useCallback((noteId: string) => {
    selectNote(noteId)
  }, [selectNote])

  const handleReset = useCallback(() => {
    resetCanvasTab(tabId)
  }, [tabId, resetCanvasTab])

  // Nodes erstellen - Grid-Layout mit Root oben
  const initialNodes: Node[] = useMemo(() => {
    const nodes: Node[] = []
    const nodeWidth = 220
    const nodeHeight = 100
    const spacingX = nodeWidth + 40
    const spacingY = nodeHeight + 40

    // Root-Note finden
    const rootNote = visibleNotes.find(n => n.id === rootNoteId)
    const connectedNotes = visibleNotes.filter(n => n.id !== rootNoteId)

    // Grid-Berechnung für verbundene Notizen
    const cols = Math.max(1, Math.ceil(Math.sqrt(connectedNotes.length)))
    const gridWidth = cols * spacingX
    const startX = 300 - gridWidth / 2 + spacingX / 2

    // Root-Note oben mittig
    if (rootNote) {
      nodes.push({
        id: rootNote.id,
        type: 'note',
        position: { x: 300 - nodeWidth / 2, y: 30 },
        data: {
          title: rootNote.title,
          note: rootNote,
          isRoot: true,
          isExpanded: expandedNoteIds.has(rootNote.id),
          hiddenConnections: hiddenConnectionsMap.get(rootNote.id) || 0,
          onExpand: handleExpand,
          onClick: handleNodeClick
        },
        style: { width: nodeWidth }
      })
    }

    // Verbundene Notizen im Grid
    connectedNotes.forEach((note, index) => {
      const row = Math.floor(index / cols)
      const col = index % cols

      nodes.push({
        id: note.id,
        type: 'note',
        position: {
          x: startX + col * spacingX - nodeWidth / 2,
          y: 180 + row * spacingY
        },
        data: {
          title: note.title,
          note: note,
          isRoot: false,
          isExpanded: expandedNoteIds.has(note.id),
          hiddenConnections: hiddenConnectionsMap.get(note.id) || 0,
          onExpand: handleExpand,
          onClick: handleNodeClick
        },
        style: { width: nodeWidth }
      })
    })

    return nodes
  }, [visibleNotes, rootNoteId, expandedNoteIds, hiddenConnectionsMap, handleExpand, handleNodeClick])

  // Edges erstellen
  const initialEdges: Edge[] = useMemo(() => {
    const edges: Edge[] = []
    const visibleIds = new Set(visibleNotes.map(n => n.id))
    const addedEdges = new Set<string>()

    for (const note of visibleNotes) {
      for (const linkText of note.outgoingLinks) {
        const target = allNotes.find(n =>
          n.title === linkText || n.path === linkText ||
          n.path.endsWith(`/${linkText}.md`) || n.path.endsWith(`/${linkText}`)
        )

        if (target && visibleIds.has(target.id)) {
          const edgeId = `${note.id}->${target.id}`
          const reverseId = `${target.id}->${note.id}`

          if (!addedEdges.has(edgeId) && !addedEdges.has(reverseId)) {
            edges.push({
              id: edgeId,
              source: note.id,
              target: target.id,
              style: {
                stroke: note.id === rootNoteId || target.id === rootNoteId
                  ? 'var(--accent-color)'
                  : 'var(--edge-color)',
                strokeWidth: note.id === rootNoteId || target.id === rootNoteId ? 2 : 1
              }
            })
            addedEdges.add(edgeId)
          }
        }
      }
    }

    return edges
  }, [visibleNotes, rootNoteId, allNotes])

  // ReactFlow State
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges] = useEdgesState(initialEdges)

  // Sync wenn sich Daten ändern
  useEffect(() => {
    setNodes(initialNodes)
    setEdges(initialEdges)
  }, [initialNodes, initialEdges, setNodes, setEdges])

  // Auto-FitView
  useEffect(() => {
    const timer = setTimeout(() => {
      fitView(fitViewOptions)
    }, 50)
    return () => clearTimeout(timer)
  }, [visibleNotes.length, fitView])

  // Root Note Titel
  const rootNote = noteMap.get(rootNoteId)
  const rootTitle = rootNote?.title || t('localCanvas.unknown')

  return (
    <div className="local-canvas">
      {/* Header - matching editor-header style */}
      <div className="local-canvas-header">
        <div className="local-canvas-header-left">
          <svg className="local-canvas-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="4" cy="4" r="2" fill="currentColor" opacity="0.6" />
            <circle cx="12" cy="4" r="2" fill="currentColor" opacity="0.6" />
            <circle cx="8" cy="12" r="2" fill="currentColor" opacity="0.6" />
            <line x1="5.5" y1="5" x2="7" y2="10.5" />
            <line x1="10.5" y1="5" x2="9" y2="10.5" />
          </svg>
          <h3>{rootTitle}</h3>
          <span className="local-canvas-stats">
            {visibleNotes.length} {t('localCanvas.notes')} · {edges.length} {t('localCanvas.connections')}
            {expandedNoteIds.size > 0 && ` · ${t('localCanvas.depth')} ${expandedNoteIds.size + 1}`}
          </span>
        </div>
        <div className="local-canvas-header-right">
          <button className="local-canvas-header-btn" onClick={handleReset} title={t('localCanvas.reset')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
              <path d="M3 3v5h5"/>
            </svg>
          </button>
          <button className="local-canvas-header-btn" onClick={() => fitView(fitViewOptions)} title={t('localCanvas.fitView')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 3h6v6"/>
              <path d="M9 21H3v-6"/>
              <path d="M21 3l-7 7"/>
              <path d="M3 21l7-7"/>
            </svg>
          </button>
        </div>
      </div>

      {/* ReactFlow Canvas */}
      <div className="local-canvas-flow">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={fitViewOptions}
          minZoom={0.3}
          maxZoom={2}
          defaultEdgeOptions={{
            type: 'default',
            style: { stroke: 'var(--edge-color)', strokeWidth: 1 }
          }}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--border-subtle)" />
          <MiniMap
            nodeColor={(node) => node.id === rootNoteId ? 'var(--accent-color)' : 'var(--text-muted)'}
            maskColor="var(--minimap-mask)"
            style={{ borderRadius: 8 }}
          />
          <Controls showInteractive={false} style={{ borderRadius: 8 }} />
        </ReactFlow>
      </div>
    </div>
  )
})

LocalCanvasInner.displayName = 'LocalCanvasInner'

// Wrapper component with its own ReactFlowProvider
export const LocalCanvas: React.FC<LocalCanvasProps> = memo(({ tabId, rootNoteId }) => {
  return (
    <ReactFlowProvider>
      <LocalCanvasInner tabId={tabId} rootNoteId={rootNoteId} />
    </ReactFlowProvider>
  )
})

LocalCanvas.displayName = 'LocalCanvas'

export default LocalCanvas
