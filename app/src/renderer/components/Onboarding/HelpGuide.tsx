// Hilfe-Guide (⌘/): App-Übersicht als Graph — Zentrum plus vier Cluster (Schreiben, KI,
// Organisation, Integrationen). Inhalte liegen übersetzt in utils/i18n/helpGuide.ts;
// hier stehen nur Struktur (welches Thema in welchem Cluster), Icons und Sprungziele.
// Farben kommen aus den App-Tokens (--color-editor/-ai/-organize/-integrate), damit die
// Hilfe mit Akzentfarbe und Dark Mode mitzieht.

import React, { useState, useCallback, useMemo, memo } from 'react'
import ReactFlow, {
  Node,
  Edge,
  useNodesState,
  useEdgesState,
  ReactFlowProvider,
  Controls,
  Background,
  BackgroundVariant,
  MarkerType,
  Handle,
  Position,
  type NodeProps
} from 'reactflow'
import 'reactflow/dist/style.css'
import { useUIStore } from '../../stores/uiStore'
import { useTabStore } from '../../stores/tabStore'
import { useShallow } from 'zustand/react/shallow'
import { useTranslation, type TranslationKey } from '../../utils/translations'
import './HelpGuide.css'

type Cluster = 'core' | 'editor' | 'ai' | 'organize' | 'integrate'
type Action =
  | { kind: 'dashboard' }
  | { kind: 'workflow' }
  | { kind: 'agent' }
  | { kind: 'brain' }
  | { kind: 'performance' }
  | { kind: 'settings'; tab: string; anchor?: string }

const CLUSTER_COLOR: Record<Cluster, string> = {
  core: 'var(--accent-color)',
  editor: 'var(--color-editor)',
  ai: 'var(--color-ai)',
  organize: 'var(--color-organize)',
  integrate: 'var(--color-integrate)'
}

// ============ SVG ICONS ============
const icons: Record<string, React.ReactNode> = {
  mindgraph: <><line x1="12" y1="3" x2="7" y2="8"/><line x1="12" y1="3" x2="17" y2="8"/><line x1="7" y1="8" x2="17" y2="8"/><line x1="7" y1="8" x2="3" y2="14"/><line x1="7" y1="8" x2="12" y2="13"/><line x1="17" y1="8" x2="21" y2="14"/><line x1="17" y1="8" x2="12" y2="13"/><line x1="3" y1="14" x2="12" y2="13"/><line x1="21" y1="14" x2="12" y2="13"/><line x1="3" y1="14" x2="8" y2="21"/><line x1="12" y1="13" x2="8" y2="21"/><line x1="12" y1="13" x2="16" y2="21"/><line x1="21" y1="14" x2="16" y2="21"/><line x1="8" y1="21" x2="16" y2="21"/><circle cx="12" cy="3" r="1.6" fill="currentColor"/><circle cx="7" cy="8" r="1.6" fill="currentColor"/><circle cx="17" cy="8" r="1.6" fill="currentColor"/><circle cx="3" cy="14" r="1.6" fill="currentColor"/><circle cx="12" cy="13" r="1.6" fill="currentColor"/><circle cx="21" cy="14" r="1.6" fill="currentColor"/><circle cx="8" cy="21" r="1.6" fill="currentColor"/><circle cx="16" cy="21" r="1.6" fill="currentColor"/></>,
  editor: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></>,
  bold: <><path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/></>,
  image: <><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></>,
  export: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></>,
  sparkle: <><path d="m12 3 1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3z"/></>,
  agent: <><path d="M12 8V4H8"/><rect x="4" y="12" width="16" height="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 16h.01"/><path d="M9 16h.01"/></>,
  brain: <><path d="M12 4a3.5 3.5 0 0 0-6 2.5A3.5 3.5 0 0 0 4.5 12 3.5 3.5 0 0 0 6 17.5 3.5 3.5 0 0 0 12 20a3.5 3.5 0 0 0 6-2.5 3.5 3.5 0 0 0 1.5-5.5A3.5 3.5 0 0 0 18 6.5 3.5 3.5 0 0 0 12 4z"/><path d="M12 4v16M8.5 9c1.5 1 5.5 1 7 0M8.5 15c1.5-1 5.5-1 7 0"/></>,
  chat: <><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></>,
  voice: <><path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v1a7 7 0 0 1-14 0v-1"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="8" y1="22" x2="16" y2="22"/></>,
  cpu: <><rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="12" cy="12" r="3"/><path d="M12 4V2M12 22v-2M4 12H2M22 12h-2"/></>,
  dashboard: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
  task: <><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><path d="M9 12l2 2 4-4"/></>,
  kinds: <><circle cx="6" cy="12" r="3"/><circle cx="18" cy="6" r="3"/><circle cx="18" cy="18" r="3"/></>,
  transport: <><path d="M12 19V5"/><polyline points="5 12 12 5 19 12"/></>,
  flashcards: <><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M10 4v4"/><path d="M14 4v4"/></>,
  clock: <><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>,
  email: <><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></>,
  sync: <><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></>,
  book: <><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></>,
  workflow: <><rect x="3" y="3" width="6" height="6" rx="1"/><rect x="15" y="15" width="6" height="6" rx="1"/><path d="M9 6h6a3 3 0 0 1 3 3v6"/><path d="M7 9v3a3 3 0 0 0 3 3h5"/></>,
  events: <><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></>,
  devices: <><rect x="3" y="1" width="12" height="16" rx="2"/><path d="M7 5h4M7 8h4M7 11h2"/><polyline points="17 19 20 22 23 19"/></>,
  send: <><path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/></>,
  folder: <><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></>,
  link: <><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></>
}

const Icon: React.FC<{ name: string; size?: number }> = ({ name, size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {icons[name]}
  </svg>
)

// ============ THEMEN ============
interface HelpTopic {
  id: string
  icon: string
  cluster: Cluster
  shortcut?: string
  action?: Action
}

const TOPICS: HelpTopic[] = [
  { id: 'start', icon: 'mindgraph', cluster: 'core' },

  { id: 'editor', icon: 'editor', cluster: 'editor', shortcut: '⌘E', action: { kind: 'settings', tab: 'editor' } },
  { id: 'formatting', icon: 'bold', cluster: 'editor', action: { kind: 'settings', tab: 'dataview' } },
  { id: 'media', icon: 'image', cluster: 'editor' },
  { id: 'export', icon: 'export', cluster: 'editor', action: { kind: 'settings', tab: 'editor', anchor: 'editor-header-actions' } },

  { id: 'aibar', icon: 'sparkle', cluster: 'ai', shortcut: '⌘⇧A' },
  { id: 'agent', icon: 'agent', cluster: 'ai', action: { kind: 'agent' } },
  { id: 'brain', icon: 'brain', cluster: 'ai', action: { kind: 'settings', tab: 'brain' } },
  { id: 'chat', icon: 'chat', cluster: 'ai', action: { kind: 'settings', tab: 'modules' } },
  { id: 'voice', icon: 'voice', cluster: 'ai', action: { kind: 'settings', tab: 'speech' } },
  { id: 'models', icon: 'cpu', cluster: 'ai', action: { kind: 'settings', tab: 'ai' } },

  { id: 'dashboard', icon: 'dashboard', cluster: 'organize', action: { kind: 'dashboard' } },
  { id: 'tasks', icon: 'task', cluster: 'organize' },
  { id: 'kinds', icon: 'kinds', cluster: 'organize' },
  { id: 'transport', icon: 'transport', cluster: 'organize', shortcut: '⌘⇧N', action: { kind: 'settings', tab: 'transport' } },
  { id: 'flashcards', icon: 'flashcards', cluster: 'organize' },
  { id: 'impact', icon: 'clock', cluster: 'organize', action: { kind: 'performance' } },

  { id: 'email', icon: 'email', cluster: 'integrate', action: { kind: 'settings', tab: 'email' } },
  { id: 'sync', icon: 'sync', cluster: 'integrate', action: { kind: 'settings', tab: 'sync' } },
  { id: 'research', icon: 'book', cluster: 'integrate', shortcut: '⌘⇧Z', action: { kind: 'settings', tab: 'integrations' } },
  { id: 'workflow', icon: 'workflow', cluster: 'integrate', action: { kind: 'workflow' } },
  { id: 'events', icon: 'events', cluster: 'integrate', action: { kind: 'settings', tab: 'agents' } },
  { id: 'devices', icon: 'devices', cluster: 'integrate', action: { kind: 'settings', tab: 'remarkable' } },
  { id: 'telegram', icon: 'send', cluster: 'integrate', action: { kind: 'settings', tab: 'telegram' } }
]

const topicKey = (id: string, part: string) => `help.t.${id}.${part}` as TranslationKey

// ============ GRAPH LAYOUT ============
function buildGraph(): { nodes: Node[]; edges: Edge[] } {
  const center = { x: 420, y: 320 }
  const nodes: Node[] = []
  const edges: Edge[] = []

  const start = TOPICS.find(t => t.id === 'start')!
  nodes.push({ id: 'start', type: 'helpNode', position: { x: center.x - 65, y: center.y - 32 }, data: { topic: start, isCenter: true } })

  const clusters: Record<Exclude<Cluster, 'core'>, { cx: number; cy: number; topics: HelpTopic[] }> = {
    editor:    { cx: center.x - 360, cy: center.y - 230, topics: [] },
    ai:        { cx: center.x + 360, cy: center.y - 230, topics: [] },
    organize:  { cx: center.x - 360, cy: center.y + 230, topics: [] },
    integrate: { cx: center.x + 360, cy: center.y + 230, topics: [] }
  }
  for (const topic of TOPICS) {
    if (topic.cluster !== 'core') clusters[topic.cluster].topics.push(topic)
  }

  for (const cluster of Object.values(clusters)) {
    const count = cluster.topics.length
    // Knoten sind 120 px breit: Radius so wählen, dass sich Nachbarn nicht überlappen
    const radius = Math.max(100, Math.round(count * 23))
    cluster.topics.forEach((topic, i) => {
      const angle = (i / count) * Math.PI * 2 - Math.PI / 2
      const color = CLUSTER_COLOR[topic.cluster]
      nodes.push({
        id: topic.id,
        type: 'helpNode',
        position: { x: cluster.cx + Math.cos(angle) * radius - 60, y: cluster.cy + Math.sin(angle) * radius - 30 },
        data: { topic, isCenter: false }
      })
      edges.push({
        id: `start-${topic.id}`,
        source: 'start',
        target: topic.id,
        style: { stroke: color, strokeWidth: 1.5, opacity: 0.3 },
        markerEnd: { type: MarkerType.ArrowClosed, color, width: 8, height: 8 }
      })
    })
    for (let i = 0; i < count && count > 1; i++) {
      const next = (i + 1) % count
      edges.push({
        id: `${cluster.topics[i].id}-${cluster.topics[next].id}`,
        source: cluster.topics[i].id,
        target: cluster.topics[next].id,
        style: { stroke: CLUSTER_COLOR[cluster.topics[i].cluster], strokeWidth: 1, opacity: 0.2 }
      })
    }
  }
  return { nodes, edges }
}

// ============ KNOTEN ============
const HelpNode: React.FC<NodeProps> = memo(({ data }) => {
  const { t } = useTranslation()
  const { topic, isCenter } = data as { topic: HelpTopic; isCenter: boolean }
  const color = CLUSTER_COLOR[topic.cluster]
  return (
    <div
      className={`help-graph-node ${isCenter ? 'center' : ''}`}
      style={{ width: isCenter ? 130 : 120, borderColor: color, '--node-color': color } as React.CSSProperties}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
      <div className="help-graph-node-icon" style={{ color }}>
        <Icon name={topic.icon} size={isCenter ? 22 : 18} />
      </div>
      <div className="help-graph-node-label">{t(topicKey(topic.id, 'label'))}</div>
      {topic.shortcut && <kbd className="help-graph-node-kbd">{topic.shortcut}</kbd>}
    </div>
  )
})
HelpNode.displayName = 'HelpNode'

const nodeTypes = { helpNode: HelpNode } as const

// ============ DETAIL ============
const DetailPanel: React.FC<{ topic: HelpTopic | null; onClose: () => void; onAction: (topic: HelpTopic) => void }> = ({ topic, onClose, onAction }) => {
  const { t } = useTranslation()
  if (!topic) return null
  const color = CLUSTER_COLOR[topic.cluster]
  return (
    <div className="help-detail">
      <div className="help-detail-header" style={{ borderColor: color }}>
        <div className="help-detail-icon" style={{ color }}><Icon name={topic.icon} size={20} /></div>
        <h3>{t(topicKey(topic.id, 'label'))}</h3>
        {topic.shortcut && <kbd className="help-kbd">{topic.shortcut}</kbd>}
        <button className="help-detail-close" onClick={onClose} aria-label={t('panel.close')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <ul className="help-detail-list">
        {['1', '2', '3', '4'].map(n => <li key={n}>{t(topicKey(topic.id, n))}</li>)}
      </ul>
      {topic.action && (
        <div className="help-detail-action">
          <button className="help-detail-action-btn" style={{ background: color }} onClick={() => onAction(topic)}>
            {t(topicKey(topic.id, 'action'))}
          </button>
        </div>
      )}
    </div>
  )
}

// ============ GRAPH ============
const HelpGraphInner: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { t } = useTranslation()
  const [selectedTopic, setSelectedTopic] = useState<HelpTopic | null>(null)
  const { nodes: initialNodes, edges: initialEdges } = useMemo(() => buildGraph(), [])
  const [nodes, , onNodesChange] = useNodesState(initialNodes)
  const [edges] = useEdgesState(initialEdges)
  const openDashboardTab = useTabStore(s => s.openDashboardTab)
  const openWorkflowCanvasTab = useTabStore(s => s.openWorkflowCanvasTab)
  const openAgentTab = useTabStore(s => s.openAgentTab)
  const openLlmPerformanceTab = useTabStore(s => s.openLlmPerformanceTab)

  const handleNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedTopic(TOPICS.find(x => x.id === node.id) || null)
  }, [])

  const handleAction = useCallback((topic: HelpTopic) => {
    if (!topic.action) return
    const a = topic.action
    // Tabs liegen im Editor-Modus: im Brain-Modus verdeckt der Canvas die Tab-Leiste.
    const toEditor = () => useUIStore.getState().setViewMode('editor')
    switch (a.kind) {
      case 'dashboard': toEditor(); openDashboardTab(); onClose(); break
      case 'workflow': toEditor(); openWorkflowCanvasTab(); onClose(); break
      case 'agent': toEditor(); openAgentTab(); onClose(); break
      case 'performance': toEditor(); openLlmPerformanceTab(); onClose(); break
      case 'brain': useUIStore.getState().setViewMode('canvas'); onClose(); break
      case 'settings':
        onClose()
        window.dispatchEvent(new CustomEvent('mindgraph:openSettings', { detail: { tab: a.tab, anchor: a.anchor } }))
        break
    }
  }, [openDashboardTab, openWorkflowCanvasTab, openAgentTab, openLlmPerformanceTab, onClose])

  return (
    <div className="help-graph-wrapper">
      <div className="help-graph-header">
        <h1>{t('help.title')}</h1>
        <span className="help-graph-hint">{t('help.graphHint')}</span>
        <button
          className="help-restart-onboarding"
          title={t('help.restartOnboardingTitle')}
          onClick={() => {
            const { setOnboardingCompleted, setOnboardingOpen, setUserProfile } = useUIStore.getState()
            setOnboardingCompleted(false)
            setUserProfile(null)
            setOnboardingOpen(true)
            onClose()
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7"/><polyline points="21 3 21 9 15 9"/></svg>
          <span>{t('help.restartOnboarding')}</span>
        </button>
        <button className="help-close" onClick={onClose} title={t('panel.close')} aria-label={t('panel.close')}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <div className="help-graph-canvas">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          nodeTypes={nodeTypes}
          onNodeClick={handleNodeClick}
          onPaneClick={() => setSelectedTopic(null)}
          fitView
          fitViewOptions={{ padding: 0.25 }}
          minZoom={0.4}
          maxZoom={1.5}
          nodesDraggable
          nodesConnectable={false}
          elementsSelectable
          proOptions={{ hideAttribution: true }}
        >
          <Controls showInteractive={false} />
          <Background variant={BackgroundVariant.Dots} gap={24} size={1} />
        </ReactFlow>
      </div>

      <DetailPanel topic={selectedTopic} onClose={() => setSelectedTopic(null)} onAction={handleAction} />

      <div className="help-graph-legend">
        <span style={{ color: CLUSTER_COLOR.editor }}><Icon name="editor" size={12} /> {t('help.legend.editor')}</span>
        <span style={{ color: CLUSTER_COLOR.ai }}><Icon name="sparkle" size={12} /> {t('help.legend.ai')}</span>
        <span style={{ color: CLUSTER_COLOR.organize }}><Icon name="folder" size={12} /> {t('help.legend.organize')}</span>
        <span style={{ color: CLUSTER_COLOR.integrate }}><Icon name="link" size={12} /> {t('help.legend.integrate')}</span>
      </div>
    </div>
  )
}

// ============ EXPORT ============
export const HelpGuide: React.FC = () => {
  const { helpGuideOpen, setHelpGuideOpen } = useUIStore(
    useShallow(s => ({ helpGuideOpen: s.helpGuideOpen, setHelpGuideOpen: s.setHelpGuideOpen }))
  )
  if (!helpGuideOpen) return null
  return (
    <div className="help-overlay" onClick={() => setHelpGuideOpen(false)}>
      <div className="help-container" onClick={e => e.stopPropagation()}>
        <ReactFlowProvider>
          <HelpGraphInner onClose={() => setHelpGuideOpen(false)} />
        </ReactFlowProvider>
      </div>
    </div>
  )
}
