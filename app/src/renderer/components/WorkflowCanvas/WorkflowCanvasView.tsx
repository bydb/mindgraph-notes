import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { createPortal } from 'react-dom'
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
import { invokePlugin } from '../../plugins/client'
import { edooboxService } from '../../stores/edooboxServiceBridge'
import { useTranslation } from '../../utils/translations'
import { useNotesStore } from '../../stores/notesStore'
import { useVaultSettingsStore } from '../../stores/vaultSettingsStore'
import { useEmailStore } from '../../stores/emailStore'
import { useUIStore } from '../../stores/uiStore'
import { getActionById, getPortDef } from '../../../shared/workflow/registry'
import { canConnectPorts } from '../../../shared/workflow/validation'
import type { WorkflowModuleId } from '../../../shared/workflow/types'
import { WorkflowNodeCard, type WorkflowNodeData } from './WorkflowNodeCard'
import { WorkflowPalette, type ModuleAvailability } from './WorkflowPalette'
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

// Echte Antwortadresse aus dem Mail-Body ziehen — NUR aus einer beschrifteten
// Kontaktzeile ("E-Mail: …" / "Kontakt: …"), wie bei Formular-Mails (From ist
// generisch). Bewusst KEIN Fallback auf die erste @-Adresse irgendwo im Body:
// das würde eine zitierte Signatur / einen Listen-Footer / eine untergeschobene
// Adresse als Empfänger eines KI-Entwurfs übernehmen. Sonst null → From bzw.
// der vom Runner gelieferte Empfänger (payload.to).
function findContactEmail(body: string): string | null {
  const labeled = body.match(/(?:e-?mail|kontakt)\s*:\s*([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/i)
  return labeled ? labeled[1] : null
}

interface Props {
  /** Öffnet das Inbox-Panel (damit das Compose-Modal beim Hand-off sichtbar wird). */
  onOpenInbox?: () => void
}

function InnerCanvas({ onOpenInbox }: Props) {
  const { t } = useTranslation()
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
  const workflows = useWorkflowStore(s => s.workflows)
  const activeId = useWorkflowStore(s => s.activeId)
  const switchWorkflow = useWorkflowStore(s => s.switchWorkflow)
  const duplicateWorkflow = useWorkflowStore(s => s.duplicateWorkflow)
  const deleteWorkflow = useWorkflowStore(s => s.deleteWorkflow)
  const simulate = useWorkflowStore(s => s.simulate)
  const execute = useWorkflowStore(s => s.execute)
  const setEnabled = useWorkflowStore(s => s.setEnabled)
  const runForNewEmails = useWorkflowStore(s => s.runForNewEmails)
  const runTrigger = useWorkflowStore(s => s.runTrigger)
  const loadFromDisk = useWorkflowStore(s => s.loadFromDisk)
  const persist = useWorkflowStore(s => s.persist)
  const vaultPath = useNotesStore(s => s.vaultPath)
  const emailActive = useVaultSettingsStore(s => s.features.email)
  // Konfig-Status für ehrliches Modul-Gating (Toggle AN UND konfiguriert).
  const edooboxFeature = useVaultSettingsStore(s => s.features.edoobox)
  const antaresEnabled = useUIStore(s => s.antares.enabled)
  const projectsFolder = useUIStore(s => s.projectsRootFolder)
  const emailAccounts = useUIStore(s => s.email.accounts)
  // Signal für den Auto-Trigger: ändert sich, wenn Mails dazukommen/neu analysiert werden.
  const emailSignal = useEmailStore(s => s.emails.length + ':' + s.emails.filter(e => e.analysis?.relevant).length)

  // Aktiver Trigger-Baustein → bestimmt Bedienelemente + Poll-Verhalten.
  const triggerActionId = workflow.nodes.map(n => n.actionId).find(id => getActionById(id)?.isTrigger)
  const isPollTrigger = Boolean(triggerActionId && ['antares.mahnung', 'edoobox.newBooking', 'tasks.dueSoon'].includes(triggerActionId))
  const isEmailTrigger = Boolean(triggerActionId && triggerActionId.startsWith('email.'))
  const isScheduleTrigger = triggerActionId === 'schedule.timer'
  const showTriggerControls = isPollTrigger || isScheduleTrigger || (isEmailTrigger && emailActive)

  // Multi-Workflow-Gating: die Event-/Poll-Trigger sollen feuern, sobald IRGENDEIN
  // aktivierter Workflow den jeweiligen Trigger trägt — nicht nur der im Canvas
  // ausgewählte. Aktive Arbeitskopie + inaktive Listeneinträge zusammenfassen
  // (dedupe per id; die Live-`workflow` gewinnt). Render-lokal, kein Store-Selektor
  // mit neuem Array (vermeidet die dokumentierte „Maximum update depth"-Falle).
  const trig = (w: typeof workflow) => w.nodes.map(n => n.actionId).find(id => getActionById(id)?.isTrigger) || ''
  const allWorkflowsForGating = [workflow, ...workflows.filter(w => w.id !== activeId)]
  const hasEnabledEmailTrigger = allWorkflowsForGating.some(w => Boolean(w.enabled) && trig(w).startsWith('email.'))
  const hasEnabledPollTrigger = allWorkflowsForGating.some(w => Boolean(w.enabled) && ['antares.mahnung', 'edoobox.newBooking', 'tasks.dueSoon'].includes(trig(w)))

  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<WorkflowNodeData>([])
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState([])
  const [paletteOpen, setPaletteOpen] = useState(true)
  // Zwei-Klick-Bestätigung fürs Löschen (kein nativer confirm-Dialog → blockiert nichts).
  const [confirmDel, setConfirmDel] = useState(false)
  // Eigenes Workflow-Dropdown (statt nativem <select> mit OS-fester Zeilenhöhe):
  // komfortable, gut treffbare Zeilen via Portal.
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerRect, setPickerRect] = useState<{ left: number; top: number; width: number } | null>(null)
  const pickerBtnRef = useRef<HTMLButtonElement>(null)
  const togglePicker = () => {
    const r = pickerBtnRef.current?.getBoundingClientRect()
    if (r) setPickerRect({ left: r.left, top: r.bottom + 4, width: Math.max(r.width, 280) })
    setPickerOpen(o => !o)
  }
  // Breite der Bausteine-Palette — ziehbar via Trenner, geräte-lokal gemerkt.
  const [paletteWidth, setPaletteWidth] = useState<number>(() => {
    const v = Number(localStorage.getItem('mindgraph:wf-palette-width'))
    return Number.isFinite(v) && v >= 180 && v <= 600 ? v : 220
  })
  const startPaletteResize = (e: ReactMouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startW = paletteWidth
    const onMove = (ev: MouseEvent) => setPaletteWidth(Math.min(600, Math.max(180, startW + (ev.clientX - startX))))
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
      setPaletteWidth(w => {
        try { localStorage.setItem('mindgraph:wf-palette-width', String(Math.round(w))) } catch { /* Quota */ }
        return w
      })
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'col-resize'
  }

  // Credential-Präsenz (safeStorage via IPC) für edoobox/antares — einmalig beim Mount.
  const [creds, setCreds] = useState<{ edoobox: boolean; antares: boolean }>({ edoobox: false, antares: false })
  useEffect(() => {
    let alive = true
    Promise.all([
      edooboxService.loadCredentials().then(c => !!(c && c.apiKey)).catch(() => false),
      invokePlugin<{ username?: string } | null>('antares', 'antares.loadCredentials').then(c => !!(c && c.username)).catch(() => false)
    ]).then(([edoobox, antares]) => { if (alive) setCreds({ edoobox, antares }) })
    return () => { alive = false }
  }, [])

  // Ehrliche Modul-Verfügbarkeit: Toggle AN UND konfiguriert. Module ohne Eintrag
  // hier gelten als Kern-Module (immer verfügbar, via Feature-Toggle-Fallback in der Palette).
  const moduleAvailability: Partial<Record<WorkflowModuleId, ModuleAvailability>> = {
    email: !emailActive
      ? { ok: false, reason: 'Modul „E-Mail" ist aus — Einstellungen → Module' }
      : (emailAccounts.length > 0 && emailAccounts[0]?.host)
        ? { ok: true }
        : { ok: false, reason: 'Kein E-Mail-Konto eingerichtet — Einstellungen → Email' },
    edoobox: !edooboxFeature
      ? { ok: false, reason: 'Modul „edoobox" ist aus — Einstellungen → Module' }
      : creds.edoobox
        ? { ok: true }
        : { ok: false, reason: 'Keine edoobox-Credentials — Einstellungen → Agenten' },
    antares: !antaresEnabled
      ? { ok: false, reason: 'Modul „Antares" ist aus — Einstellungen → Module' }
      : creds.antares
        ? { ok: true }
        : { ok: false, reason: 'Keine Antares-Credentials — Einstellungen → Agenten' },
    project: projectsFolder.trim()
      ? { ok: true }
      : { ok: false, reason: 'Kein Projektordner gesetzt — Einstellungen → Allgemein' }
  }

  // Gespeicherten Workflow laden, sobald ein Vault offen ist.
  useEffect(() => {
    if (vaultPath) loadFromDisk(vaultPath)
  }, [vaultPath, loadFromDisk])

  // Autosave (debounced) bei jeder Änderung — auch an Liste/Auswahl (Löschen eines
  // inaktiven Workflows ändert nur `workflows`, Wechsel ändert `activeId`).
  useEffect(() => {
    if (!vaultPath) return
    const t = setTimeout(() => persist(vaultPath), 800)
    return () => clearTimeout(t)
  }, [workflow, workflows, activeId, vaultPath, persist])

  // Auto-Trigger bei neuer relevanter Mail: feuert für ALLE aktivierten Email-Trigger-
  // Workflows (nicht nur den aktiven). Seriell + exactly-once im Store; läuft, solange
  // der Canvas-Tab offen ist (Decisions #4/#5/#10).
  useEffect(() => {
    if (hasEnabledEmailTrigger && vaultPath) runForNewEmails(vaultPath)
  }, [emailSignal, hasEnabledEmailTrigger, vaultPath, runForNewEmails])

  // Sanfter Poll für Nicht-Mail-Trigger (antares/edoobox/tasks): sofort + alle 10 Min,
  // solange der Canvas-Tab offen ist UND irgendein aktivierter Workflow einen Poll-
  // Trigger trägt (Decision #4, kein Leerlauf-Traffic). runTrigger pollt nur die
  // tatsächlich aktivierten Trigger-Quellen.
  useEffect(() => {
    if (!hasEnabledPollTrigger || !vaultPath) return
    runTrigger(vaultPath)
    const iv = setInterval(() => runTrigger(vaultPath), 10 * 60 * 1000)
    return () => clearInterval(iv)
  }, [hasEnabledPollTrigger, vaultPath, runTrigger])

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
    const payload = run.handoff.payload as { emailId?: string; to?: string; toName?: string; subject?: string }
    const emailId = payload.emailId
    const es = useEmailStore.getState()
    // KEIN Fallback auf die markierte Inbox-Mail: ohne Seed-Mail (z.B. Termin-/
    // Antares-/edoobox-Lauf) sonst ein „Re:" an einen unbeteiligten Kontakt.
    const email = emailId ? es.emails.find(e => e.id === emailId) : undefined
    if (email) {
      es.startReply(email)
      const cs = useEmailStore.getState().composeState
      if (cs) {
        // Empfänger-Priorität: beschriftete Kontaktzeile (Formular-Mail) → vom Runner
        // gelieferter Empfänger (seededRecipient) → der von startReply gesetzte Absender.
        const labeled = findContactEmail(email.bodyText || '')
        const to = labeled
          ? [{ name: '', address: labeled }]
          : payload.to
            ? [{ name: payload.toName || '', address: payload.to }]
            : cs.to
        es.setComposeState({ ...cs, to, body: `${cleaned}\n${cs.body}` })
      }
    } else {
      es.startNewEmail()
      const cs = useEmailStore.getState().composeState
      if (cs) {
        const to = payload.to ? [{ name: payload.toName || '', address: payload.to }] : cs.to
        es.setComposeState({
          ...cs,
          to,
          subject: payload.subject || cs.subject,
          body: `${cleaned}${cs.body || ''}`
        })
      }
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
        <button
          ref={pickerBtnRef}
          className="wf-toolbar__select"
          onClick={togglePicker}
          title={t('workflowCanvas.selectSaved')}
          aria-haspopup="listbox"
          aria-expanded={pickerOpen}
        >
          <span className="wf-picker__current">{workflow.name || '(ohne Namen)'}</span>
          <span className="wf-picker__chev" aria-hidden="true">▾</span>
        </button>
        {pickerOpen && pickerRect && createPortal(
          <>
            <div className="wf-picker__backdrop" onClick={() => setPickerOpen(false)} />
            <div
              className="wf-picker__menu"
              role="listbox"
              style={{ left: pickerRect.left, top: pickerRect.top, width: pickerRect.width }}
            >
              {workflows.map(w => (
                <button
                  key={w.id}
                  role="option"
                  aria-selected={w.id === activeId}
                  className={`wf-picker__item${w.id === activeId ? ' wf-picker__item--active' : ''}`}
                  onClick={() => { setPickerOpen(false); setConfirmDel(false); if (w.id !== activeId) switchWorkflow(w.id) }}
                >
                  <span className="wf-picker__check" aria-hidden="true">{w.id === activeId ? '✓' : ''}</span>
                  <span className="wf-picker__name">{w.name || '(ohne Namen)'}</span>
                </button>
              ))}
            </div>
          </>,
          document.body
        )}
        <input
          className="wf-toolbar__name"
          value={workflow.name}
          onChange={e => setName(e.target.value)}
          aria-label={t('workflowCanvas.renameAria')}
          title={t('workflowCanvas.renameTitle')}
        />
        <div className="wf-toolbar__spacer" />
        <button className="wf-btn wf-btn--ghost" onClick={() => { setConfirmDel(false); newWorkflow() }} title={t('workflowCanvas.newTitle')}>{t('workflowCanvas.newBtn')}</button>
        <button className="wf-btn wf-btn--ghost" onClick={() => { setConfirmDel(false); duplicateWorkflow() }} title={t('workflowCanvas.duplicateTitle')}>{t('workflowCanvas.duplicateBtn')}</button>
        <button className="wf-btn wf-btn--ghost" onClick={() => { setConfirmDel(false); loadExample() }} title={t('workflowCanvas.addExample')}>{t('workflowCanvas.exampleBtn')}</button>
        <button
          className={confirmDel ? 'wf-btn wf-btn--danger' : 'wf-btn wf-btn--ghost'}
          disabled={workflows.length <= 1}
          title={workflows.length <= 1 ? t('workflowCanvas.deleteLastTitle') : t('workflowCanvas.deleteTitle')}
          onClick={() => {
            if (confirmDel) { setConfirmDel(false); deleteWorkflow(activeId) }
            else { setConfirmDel(true); window.setTimeout(() => setConfirmDel(false), 3000) }
          }}
        >
          {confirmDel ? t('workflowCanvas.confirmDelete') : t('workflowCanvas.deleteBtn')}
        </button>
        <button className="wf-btn" onClick={simulate}>{t('workflowCanvas.simulateBtn')}</button>
        <button
          className="wf-btn wf-btn--primary"
          disabled={!canExecute}
          title={!vaultPath ? t('workflowCanvas.noVaultTitle') : !validation.ok ? t('workflowCanvas.incompleteTitle') : t('workflowCanvas.executeTitle')}
          onClick={() => vaultPath && execute(vaultPath)}
        >
          {t('workflowCanvas.executeBtn')}
        </button>
        {showTriggerControls && (
          <>
            <span className="view-mode-separator" style={{ margin: '0 4px' }} />
            <label
              className="wf-trigger-toggle"
              title={isScheduleTrigger
                ? t('workflowCanvas.triggerScheduleTitle')
                : isPollTrigger
                  ? t('workflowCanvas.triggerPollTitle')
                  : t('workflowCanvas.triggerMailTitle')}
            >
              <input
                type="checkbox"
                checked={Boolean(workflow.enabled)}
                onChange={e => setEnabled(e.target.checked)}
              />
              {isScheduleTrigger ? t('workflowCanvas.scheduleActive') : isPollTrigger ? t('workflowCanvas.autoTabOpen') : t('workflowCanvas.autoNewMail')}
            </label>
            {!isScheduleTrigger && (
              <button
                className="wf-btn wf-btn--ghost"
                disabled={!vaultPath || running}
                title={t('workflowCanvas.runNowTitle')}
                onClick={() => vaultPath && runTrigger(vaultPath)}
              >
                {isPollTrigger ? t('workflowCanvas.checkNow') : t('workflowCanvas.runForNewMails')}
              </button>
            )}
          </>
        )}
      </div>

      <div className="wf-body">
        {paletteOpen && (
          <WorkflowPalette
            width={paletteWidth}
            availability={moduleAvailability}
            onAdd={(actionId) => addNode(actionId, { x: 260 + Math.random() * 80, y: 160 + Math.random() * 80 })}
          />
        )}
        {paletteOpen && (
          <div
            className="wf-resizer"
            onMouseDown={startPaletteResize}
            title={t('workflowCanvas.resizePaletteTitle')}
            role="separator"
            aria-orientation="vertical"
          />
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
