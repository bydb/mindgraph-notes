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
import { useShallow } from 'zustand/react/shallow'
import { useTranslation } from '../../utils/translations'
import './HelpGuide.css'

// ============ SVG ICONS (aus der App) ============
const icons: Record<string, React.ReactNode> = {
  editor: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></>,
  canvas: <><circle cx="6" cy="6" r="3"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="18" r="3"/><line x1="8.5" y1="7.5" x2="15.5" y2="16.5"/><line x1="15.5" y1="7.5" x2="8.5" y2="16.5"/></>,
  ai: <><path d="M12 2v4"/><path d="M12 18v4"/><path d="M4.93 4.93l2.83 2.83"/><path d="M16.24 16.24l2.83 2.83"/><path d="M2 12h4"/><path d="M18 12h4"/><path d="M4.93 19.07l2.83-2.83"/><path d="M16.24 7.76l2.83-2.83"/><circle cx="12" cy="12" r="3"/></>,
  chat: <><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></>,
  flashcards: <><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M10 4v4"/><path d="M14 4v4"/></>,
  email: <><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></>,
  calendar: <><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>,
  search: <><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></>,
  tags: <><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></>,
  link: <><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></>,
  terminal: <><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></>,
  book: <><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></>,
  clock: <><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>,
  bold: <><path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/></>,
  image: <><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></>,
  sync: <><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></>,
  transport: <><path d="M12 19V5"/><polyline points="5 12 12 5 19 12"/></>,
  pdf: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></>,
  math: <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>,
  folder: <><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></>,
  remarkable: <><rect x="3" y="1" width="12" height="16" rx="2"/><path d="M7 5h4M7 8h4M7 11h2"/></>,
  bookmark: <><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></>,
  task: <><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><path d="M9 12l2 2 4-4"/></>,
}

const Icon: React.FC<{ name: string; size?: number }> = ({ name, size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {icons[name]}
  </svg>
)

// ============ HELP DATA ============
interface HelpTopic {
  id: string
  label: string
  icon: string
  color: string
  category: 'core' | 'editor' | 'ai' | 'organize' | 'integrate'
  shortcut?: string
  details: string[]
}

const helpTopics: HelpTopic[] = [
  // Core (center)
  { id: 'start', label: 'MindGraph', icon: 'canvas', color: '#e8685a', category: 'core',
    details: ['Markdown-Notizen mit Wissensgraph', 'Wikilinks mit [[ verbinden Notizen', 'Split-Ansicht: Editor + Graph', 'Canvas: Dein Wissen als Netzwerk'] },

  // Editor cluster
  { id: 'editor', label: 'Editor', icon: 'editor', color: '#4a9eff', category: 'editor', shortcut: '⌘N',
    details: ['Live Preview mit CodeMirror 6', 'Slash Commands: /date /task /table /code', 'Rechtsklick-Kontextmenue mit KI-Aktionen', 'Formatting-Toolbar aktivierbar'] },
  { id: 'media', label: 'Medien', icon: 'image', color: '#4a9eff', category: 'editor',
    details: ['Bilder per Drag & Drop einfuegen', 'PDF-Viewer mit OCR-Extraktion', 'Office-Dateien (Excel, Word, PPT)', '![[datei]] fuer Inline-Embeds'] },
  { id: 'formatting', label: 'Formatierung', icon: 'bold', color: '#4a9eff', category: 'editor',
    details: ['**Fett** (⌘B), *Kursiv* (⌘I), `Code` (⌘`)', 'Mermaid-Diagramme in Code-Bloecken', 'KaTeX-Matheformeln ($..$ und $$..$$)', 'Callouts: note, tip, warning, info, ...'] },

  // AI cluster
  { id: 'noteschat', label: 'KI-Chat', icon: 'chat', color: '#a855f7', category: 'ai',
    details: ['Chat mit Kontext deiner Notizen', 'Modi: Direkt oder Sokratisch', 'Kontext: Aktuelle Notiz / Ordner / Alle', 'Ollama, LM Studio oder Claude API'] },
  { id: 'smartconn', label: 'Smart Connections', icon: 'ai', color: '#a855f7', category: 'ai',
    details: ['Semantische Aehnlichkeit berechnen', 'Verwandte Notizen automatisch finden', 'Hybrid-Scoring: Embeddings + Keywords', 'Gewichtung individuell anpassbar'] },
  { id: 'languagetool', label: 'LanguageTool', icon: 'task', color: '#a855f7', category: 'ai',
    details: ['Grammatik- und Rechtschreibpruefung', 'Direkt im Editor integriert', 'Unterstuetzt Deutsch und Englisch', 'Konfigurierbar in den Einstellungen'] },

  // Organize cluster
  { id: 'flashcards', label: 'Flashcards', icon: 'flashcards', color: '#f59e0b', category: 'organize',
    details: ['Karteikarten mit Spaced Repetition', 'Quiz-Modus aus deinen Notizen', 'Anki-Import (AnkiDroid-Format)', 'Lernstatistiken und Fortschritt'] },
  { id: 'tasks', label: 'Aufgaben', icon: 'clock', color: '#f59e0b', category: 'organize',
    details: ['- [ ] Checkbox-Tasks im Markdown', 'Faelligkeitsdatum: @[[2026-04-16]]', 'Desktop-Erinnerungen bei Faelligkeit', 'Ueberfaellige Tasks in der Titelleiste'] },
  { id: 'transport', label: 'Transport', icon: 'transport', color: '#f59e0b', category: 'organize', shortcut: '⌘⇧N',
    details: ['Quick Capture via macOS-Menuleiste', 'Globaler Shortcut: ⌘⇧N', 'Kategorien: 🔴 Aktion 🟢 Wissen 🔵 Info', 'Tags, Zielordner, YAML-Frontmatter'] },
  { id: 'tags', label: 'Tags & Ordner', icon: 'tags', color: '#f59e0b', category: 'organize',
    details: ['Tags-Panel: Alle Tags durchsuchen', 'Ordner per Rechtsklick erstellen', 'Templates fuer neue Notizen (⌘⇧T)', 'Lesezeichen fuer Schnellzugriff'] },
  { id: 'sync', label: 'E2E Sync', icon: 'sync', color: '#f59e0b', category: 'organize',
    details: ['Ende-zu-Ende-verschluesselt', 'Zero-Knowledge: Server sieht nichts', 'Passphrase verlasst nie dein Geraet', 'Konflikte: neuerer Timestamp gewinnt'] },

  // Integrations cluster
  { id: 'email', label: 'Email', icon: 'email', color: '#10b981', category: 'integrate',
    details: ['IMAP-Empfang direkt in MindGraph', 'KI-Analyse: Relevanz, Sentiment, Tasks', 'Emails schreiben und per SMTP senden', 'KI-Chat ueber einzelne Emails'] },
  { id: 'research', label: 'Forschung', icon: 'book', color: '#10b981', category: 'integrate',
    details: ['Semantic Scholar: Paper suchen', 'Zotero-Bibliothek durchsuchen (⌘⇧Z)', 'Readwise-Highlights synchronisieren', 'Zitate direkt in Notizen einfuegen'] },
  { id: 'devices', label: 'Geraete', icon: 'remarkable', color: '#10b981', category: 'integrate',
    details: ['reMarkable-Tablet: Dokumente importieren', 'Integriertes Terminal mit Shell-Zugriff', 'KI-Tool-Erkennung (Claude, opencode)', 'PDF-Export und -Optimierung'] },
  { id: 'business', label: 'Business', icon: 'calendar', color: '#10b981', category: 'integrate',
    details: ['edoobox: Veranstaltungen verwalten', 'WordPress: Blog-Posts publizieren', 'KI-Content-Generierung', 'Google Imagen fuer Bilder'] },
]

// ============ GRAPH LAYOUT ============
function buildGraph(): { nodes: Node[]; edges: Edge[] } {
  const center = { x: 400, y: 300 }
  const nodes: Node[] = []
  const edges: Edge[] = []

  // Center node
  const startTopic = helpTopics.find(t => t.id === 'start')!
  nodes.push({
    id: 'start',
    type: 'helpNode',
    position: { x: center.x - 60, y: center.y - 30 },
    data: { topic: startTopic, isCenter: true }
  })

  // Cluster positions around center
  const clusters: Record<string, { cx: number; cy: number; topics: HelpTopic[] }> = {
    editor:    { cx: center.x - 280, cy: center.y - 200, topics: [] },
    ai:        { cx: center.x + 280, cy: center.y - 200, topics: [] },
    organize:  { cx: center.x - 280, cy: center.y + 200, topics: [] },
    integrate: { cx: center.x + 280, cy: center.y + 200, topics: [] },
  }

  for (const topic of helpTopics) {
    if (topic.category !== 'core' && clusters[topic.category]) {
      clusters[topic.category].topics.push(topic)
    }
  }

  // Place cluster nodes
  for (const [category, cluster] of Object.entries(clusters)) {
    const count = cluster.topics.length
    const radius = 100
    cluster.topics.forEach((topic, i) => {
      const angle = (i / count) * Math.PI * 2 - Math.PI / 2
      const x = cluster.cx + Math.cos(angle) * radius - 60
      const y = cluster.cy + Math.sin(angle) * radius - 30

      nodes.push({
        id: topic.id,
        type: 'helpNode',
        position: { x, y },
        data: { topic, isCenter: false }
      })

      // Edge from center to each topic
      edges.push({
        id: `start-${topic.id}`,
        source: 'start',
        target: topic.id,
        style: { stroke: topic.color, strokeWidth: 1.5, opacity: 0.3 },
        markerEnd: { type: MarkerType.ArrowClosed, color: topic.color, width: 8, height: 8 }
      })
    })

    // Edges within cluster (connect neighbors)
    for (let i = 0; i < cluster.topics.length; i++) {
      const next = (i + 1) % cluster.topics.length
      if (cluster.topics.length > 1) {
        edges.push({
          id: `${cluster.topics[i].id}-${cluster.topics[next].id}`,
          source: cluster.topics[i].id,
          target: cluster.topics[next].id,
          style: { stroke: cluster.topics[i].color, strokeWidth: 1, opacity: 0.2 },
        })
      }
    }
  }

  return { nodes, edges }
}

// ============ CUSTOM NODE ============
const HelpNode: React.FC<NodeProps> = memo(({ data }) => {
  const { topic, isCenter } = data as { topic: HelpTopic; isCenter: boolean }
  const size = isCenter ? 130 : 120

  return (
    <div
      className={`help-graph-node ${isCenter ? 'center' : ''}`}
      style={{
        width: size,
        borderColor: topic.color,
        '--node-color': topic.color
      } as React.CSSProperties}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />

      <div className="help-graph-node-icon" style={{ color: topic.color }}>
        <Icon name={topic.icon} size={isCenter ? 22 : 18} />
      </div>
      <div className="help-graph-node-label">{topic.label}</div>
      {topic.shortcut && (
        <kbd className="help-graph-node-kbd">{topic.shortcut}</kbd>
      )}
    </div>
  )
})

HelpNode.displayName = 'HelpNode'

const nodeTypes = { helpNode: HelpNode } as const

// ============ DETAIL PANEL ============
const DetailPanel: React.FC<{ topic: HelpTopic | null; onClose: () => void }> = ({ topic, onClose }) => {
  if (!topic) return null

  return (
    <div className="help-detail">
      <div className="help-detail-header" style={{ borderColor: topic.color }}>
        <div className="help-detail-icon" style={{ color: topic.color }}>
          <Icon name={topic.icon} size={20} />
        </div>
        <h3>{topic.label}</h3>
        {topic.shortcut && <kbd className="help-kbd">{topic.shortcut}</kbd>}
        <button className="help-detail-close" onClick={onClose}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      <ul className="help-detail-list">
        {topic.details.map((detail, i) => (
          <li key={i}>{detail}</li>
        ))}
      </ul>
    </div>
  )
}

// ============ MAIN GRAPH ============
const HelpGraphInner: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { t } = useTranslation()
  const [selectedTopic, setSelectedTopic] = useState<HelpTopic | null>(null)
  const { nodes: initialNodes, edges: initialEdges } = useMemo(() => buildGraph(), [])
  const [nodes, , onNodesChange] = useNodesState(initialNodes)
  const [edges] = useEdgesState(initialEdges)

  const handleNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    const topic = helpTopics.find(t => t.id === node.id) || null
    setSelectedTopic(topic)
  }, [])

  const handlePaneClick = useCallback(() => {
    setSelectedTopic(null)
  }, [])

  return (
    <div className="help-graph-wrapper">
      {/* Header */}
      <div className="help-graph-header">
        <h1>{t('help.title')}</h1>
        <span className="help-graph-hint">{t('help.graphHint')}</span>
        <button className="help-close" onClick={onClose}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      {/* Graph */}
      <div className="help-graph-canvas">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          nodeTypes={nodeTypes}
          onNodeClick={handleNodeClick}
          onPaneClick={handlePaneClick}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          minZoom={0.4}
          maxZoom={1.5}
          nodesDraggable={true}
          nodesConnectable={false}
          elementsSelectable={true}
          proOptions={{ hideAttribution: true }}
        >
          <Controls showInteractive={false} />
          <Background variant={BackgroundVariant.Dots} gap={24} size={1} />
        </ReactFlow>
      </div>

      {/* Detail Panel */}
      <DetailPanel topic={selectedTopic} onClose={() => setSelectedTopic(null)} />

      {/* Legend */}
      <div className="help-graph-legend">
        <span style={{ color: '#4a9eff' }}><Icon name="editor" size={12} /> Editor</span>
        <span style={{ color: '#a855f7' }}><Icon name="ai" size={12} /> KI</span>
        <span style={{ color: '#f59e0b' }}><Icon name="folder" size={12} /> Organisation</span>
        <span style={{ color: '#10b981' }}><Icon name="link" size={12} /> Integrationen</span>
      </div>
    </div>
  )
}

// ============ EXPORT ============
export const HelpGuide: React.FC = () => {
  const { helpGuideOpen, setHelpGuideOpen } = useUIStore(
    useShallow(s => ({
      helpGuideOpen: s.helpGuideOpen,
      setHelpGuideOpen: s.setHelpGuideOpen
    }))
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
