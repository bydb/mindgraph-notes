import { useCallback, useEffect, useRef, useState } from 'react'
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  useNodesState,
  useEdgesState,
  type Connection,
  type Edge,
  type Node,
  type OnConnectStartParams
} from 'reactflow'
import 'reactflow/dist/style.css'
import './workflowCanvas.css'

import { useWorkflowStore } from '../../stores/workflowStore'
import { useNotesStore } from '../../stores/notesStore'
import { useVaultSettingsStore } from '../../stores/vaultSettingsStore'
import { useEmailStore } from '../../stores/emailStore'
import { getActionById, getPortDef } from '../../../shared/workflow/registry'
import { canConnectPorts } from '../../../shared/workflow/validation'
import { WorkflowNodeCard, type WorkflowNodeData } from './WorkflowNodeCard'
import { WorkflowPalette } from './WorkflowPalette'
import { WorkflowInspector } from './WorkflowInspector'
import { WorkflowRunPanel } from './WorkflowRunPanel'
import { portColor } from './ui'

function edgeColor(fromActionId: string, fromPortId: string): string {
  const action = getActionById(fromActionId)
  const port = action && getPortDef(action, fromPortId, 'output')
  return port ? portColor(port.kind) : '#9ca3af'
}

// Modul-Konstante (React Flow warnt sonst vor neuem nodeTypes-Objekt pro Render).
const nodeTypes = { workflowNode: WorkflowNodeCard }

// Versehentliche "Betreff:"-Zeile aus dem Entwurf entfernen (Markdown bleibt sonst erhalten
// und wird beim Senden via renderEmailHtml dargestellt).
function cleanDraft(text: string): string {
  return text.replace(/^\s*(?:\*\*)?betreff(?:\*\*)?\s*:.*$\n?/im, '').trimStart()
}

// Echte Antwortadresse aus dem Mail-Body ziehen (Formular-Mails: From ist generisch,
// die Kontaktadresse steht als "E-Mail: …" im Text). Sonst null → From-Adresse nutzen.
function findContactEmail(body: string, fromAddress: string): string | null {
  const labeled = body.match(/(?:e-?mail|kontakt)\s*:\s*([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/i)
  if (labeled) return labeled[1]
  const any = body.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/)
  if (any && any[0].toLowerCase() !== (fromAddress || '').toLowerCase()) return any[0]
  return null
}

interface Props {
  /** Öffnet das Inbox-Panel (damit das Compose-Modal beim Hand-off sichtbar wird). */
  onOpenInbox?: () => void
}

function InnerCanvas({ onOpenInbox }: Props) {
  const workflow = useWorkflowStore(s => s.workflow)
  const selectedNodeId = useWorkflowStore(s => s.selectedNodeId)
  const validation = useWorkflowStore(s => s.validation)
  const running = useWorkflowStore(s => s.running)
  const run = useWorkflowStore(s => s.run)
  const addNode = useWorkflowStore(s => s.addNode)
  const addEdge = useWorkflowStore(s => s.addEdge)
  const removeEdge = useWorkflowStore(s => s.removeEdge)
  const removeNode = useWorkflowStore(s => s.removeNode)
  const updateNodePosition = useWorkflowStore(s => s.updateNodePosition)
  const selectNode = useWorkflowStore(s => s.selectNode)
  const setConnecting = useWorkflowStore(s => s.setConnecting)
  const setName = useWorkflowStore(s => s.setName)
  const loadExample = useWorkflowStore(s => s.loadExample)
  const newWorkflow = useWorkflowStore(s => s.newWorkflow)
  const simulate = useWorkflowStore(s => s.simulate)
  const execute = useWorkflowStore(s => s.execute)
  const setEnabled = useWorkflowStore(s => s.setEnabled)
  const runForNewEmails = useWorkflowStore(s => s.runForNewEmails)
  const loadFromDisk = useWorkflowStore(s => s.loadFromDisk)
  const persist = useWorkflowStore(s => s.persist)
  const vaultPath = useNotesStore(s => s.vaultPath)
  const emailActive = useVaultSettingsStore(s => s.features.email)
  // Signal für den Auto-Trigger: ändert sich, wenn Mails dazukommen/neu analysiert werden.
  const emailSignal = useEmailStore(s => s.emails.length + ':' + s.emails.filter(e => e.analysis?.relevant).length)

  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<WorkflowNodeData>([])
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState([])
  const [paletteOpen, setPaletteOpen] = useState(true)

  // Gespeicherten Workflow laden, sobald ein Vault offen ist.
  useEffect(() => {
    if (vaultPath) loadFromDisk(vaultPath)
  }, [vaultPath, loadFromDisk])

  // Autosave (debounced) bei jeder Workflow-Änderung.
  useEffect(() => {
    if (!vaultPath) return
    const t = setTimeout(() => persist(vaultPath), 800)
    return () => clearTimeout(t)
  }, [workflow, vaultPath, persist])

  // Auto-Trigger bei neuer relevanter Mail (nur wenn aktiviert). Seriell +
  // exactly-once im Store; läuft, solange der Canvas-Tab offen ist (Decisions #4/#5/#10).
  useEffect(() => {
    if (workflow.enabled && vaultPath) runForNewEmails(vaultPath)
  }, [emailSignal, workflow.enabled, vaultPath, runForNewEmails])

  // Compose-Hand-off: bei einem echten Lauf (kein Trockenlauf), der einen
  // Antwortentwurf liefert, das Compose-Fenster mit dem Entwurf öffnen (Decision #6).
  // onOpenInbox über Ref, damit der Effekt nur an `run` hängt (kein Re-Fire bei App-Render).
  const onOpenInboxRef = useRef(onOpenInbox)
  onOpenInboxRef.current = onOpenInbox
  useEffect(() => {
    if (!run || run.mode !== 'execute' || run.handoff?.kind !== 'compose') return
    const draft = String((run.handoff.payload as { draft?: unknown }).draft || '')
    if (!draft) return
    const cleaned = cleanDraft(draft)
    const emailId = (run.handoff.payload as { emailId?: string }).emailId
    const es = useEmailStore.getState()
    const email = es.emails.find(e => e.id === emailId) || es.emails.find(e => e.id === es.selectedEmailId)
    if (email) {
      es.startReply(email)
      const cs = useEmailStore.getState().composeState
      if (cs) {
        // Echte Kontaktadresse aus dem Body bevorzugen (Formular-Mails).
        const contact = findContactEmail(email.bodyText || '', email.from?.address || '')
        const to = contact ? [{ name: '', address: contact }] : cs.to
        es.setComposeState({ ...cs, to, body: `${cleaned}\n${cs.body}` })
      }
    } else {
      es.startNewEmail()
      const cs = useEmailStore.getState().composeState
      if (cs) es.setComposeState({ ...cs, body: `${cleaned}${cs.body || ''}` })
    }
    es.setCurrentView('compose')
    onOpenInboxRef.current?.()
  }, [run])

  // Store → React Flow synchronisieren (Struktur + Auswahl).
  useEffect(() => {
    const nodes: Node<WorkflowNodeData>[] = workflow.nodes.flatMap(n => {
      const action = getActionById(n.actionId)
      if (!action) return []
      return [{
        id: n.id,
        type: 'workflowNode',
        position: n.position,
        selected: n.id === selectedNodeId,
        data: { action }
      }]
    })
    setRfNodes(nodes)
  }, [workflow.nodes, selectedNodeId, setRfNodes])

  useEffect(() => {
    const edges: Edge[] = workflow.edges.map(e => {
      const fromActionId = workflow.nodes.find(n => n.id === e.fromNodeId)?.actionId || ''
      return {
        id: e.id,
        source: e.fromNodeId,
        target: e.toNodeId,
        sourceHandle: e.fromPortId,
        targetHandle: e.toPortId,
        style: { stroke: edgeColor(fromActionId, e.fromPortId), strokeWidth: 2 }
      }
    })
    setRfEdges(edges)
  }, [workflow.edges, workflow.nodes, setRfEdges])

  const isValidConnection = useCallback((conn: Connection): boolean => {
    if (!conn.source || !conn.target || !conn.sourceHandle || !conn.targetHandle) return false
    const from = workflow.nodes.find(n => n.id === conn.source)
    const to = workflow.nodes.find(n => n.id === conn.target)
    if (!from || !to) return false
    return canConnectPorts(from.actionId, conn.sourceHandle, to.actionId, conn.targetHandle)
  }, [workflow.nodes])

  const onConnect = useCallback((conn: Connection) => {
    if (conn.source && conn.target && conn.sourceHandle && conn.targetHandle) {
      addEdge(conn.source, conn.sourceHandle, conn.target, conn.targetHandle)
    }
    setConnecting(null)
  }, [addEdge, setConnecting])

  const onConnectStart = useCallback((_e: unknown, params: OnConnectStartParams) => {
    if (params.handleType !== 'source' || !params.nodeId || !params.handleId) return
    const node = workflow.nodes.find(n => n.id === params.nodeId)
    const action = node && getActionById(node.actionId)
    const port = action && getPortDef(action, params.handleId, 'output')
    if (node && port) setConnecting({ nodeId: node.id, actionId: node.actionId, portId: port.id, kind: port.kind })
  }, [workflow.nodes, setConnecting])

  const canExecute = validation.ok && Boolean(vaultPath) && !running

  return (
    <div className="wf-canvas-view">
      <div className="wf-toolbar">
        <button
          className="wf-btn wf-btn--ghost"
          onClick={() => setPaletteOpen(o => !o)}
          title={paletteOpen ? 'Bausteine ausblenden' : 'Bausteine einblenden'}
        >
          ☰
        </button>
        <input
          className="wf-toolbar__name"
          value={workflow.name}
          onChange={e => setName(e.target.value)}
          aria-label="Workflow-Name"
        />
        <div className="wf-toolbar__spacer" />
        <button className="wf-btn wf-btn--ghost" onClick={newWorkflow}>Neu</button>
        <button className="wf-btn wf-btn--ghost" onClick={loadExample}>Beispiel laden</button>
        <button className="wf-btn" onClick={simulate}>▶ Simulieren</button>
        <button
          className="wf-btn wf-btn--primary"
          disabled={!canExecute}
          title={!vaultPath ? 'Kein Vault geöffnet' : !validation.ok ? 'Workflow ist unvollständig' : 'Echten Lauf starten'}
          onClick={() => vaultPath && execute(vaultPath)}
        >
          ▶ Ausführen
        </button>
        {emailActive && (
          <>
            <span className="view-mode-separator" style={{ margin: '0 4px' }} />
            <label className="wf-trigger-toggle" title="Workflow automatisch bei neuer relevanter Mail auslösen (exactly-once)">
              <input
                type="checkbox"
                checked={Boolean(workflow.enabled)}
                onChange={e => setEnabled(e.target.checked)}
              />
              Auto bei neuer Mail
            </label>
            <button
              className="wf-btn wf-btn--ghost"
              disabled={!vaultPath || running}
              title="Den Workflow jetzt für relevante, noch nicht getriggerte Mails ausführen (exactly-once)"
              onClick={() => vaultPath && runForNewEmails(vaultPath)}
            >
              Für neue Mails ausführen
            </button>
          </>
        )}
      </div>

      <div className="wf-body">
        {paletteOpen && (
          <WorkflowPalette onAdd={(actionId) => addNode(actionId, { x: 260 + Math.random() * 80, y: 160 + Math.random() * 80 })} />
        )}

        <div className="wf-flow">
          <ReactFlow
            nodes={rfNodes}
            edges={rfEdges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onConnectStart={onConnectStart}
            onConnectEnd={() => setConnecting(null)}
            isValidConnection={isValidConnection}
            onNodeClick={(_e, node) => selectNode(node.id)}
            onPaneClick={() => selectNode(null)}
            onNodeDragStop={(_e, node) => updateNodePosition(node.id, node.position)}
            onNodesDelete={(nodes) => nodes.forEach(n => removeNode(n.id))}
            onEdgesDelete={(edges) => edges.forEach(e => removeEdge(e.id))}
            fitView
            proOptions={{ hideAttribution: true }}
          >
            <Background />
            <Controls />
            <MiniMap pannable zoomable />
          </ReactFlow>
        </div>

        {selectedNodeId && <WorkflowInspector />}
      </div>

      <WorkflowRunPanel />
    </div>
  )
}

export function WorkflowCanvasView({ onOpenInbox }: Props) {
  return (
    <ReactFlowProvider>
      <InnerCanvas onOpenInbox={onOpenInbox} />
    </ReactFlowProvider>
  )
}
