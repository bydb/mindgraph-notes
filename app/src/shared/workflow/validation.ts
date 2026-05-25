// Workflow Canvas — Verbindungs- und Workflow-Validierung.
//
// Strikte Allowlist (Decision #8): Verbindung erlaubt, wenn Port-Arten exakt
// gleich sind ODER das Paar explizit in EXTRA_COMPAT steht. KEINE impliziten
// Adapter — Typ-Brücken entstehen über ehrliche Multi-Output-Ports.

import type { WorkflowPortKind } from './types'
import type {
  Workflow,
  WorkflowValidationIssue,
  WorkflowValidationResult
} from './model'
import { getActionById, getPortDef } from './registry'

/**
 * Explizit erlaubte Kreuz-Paare (`from->to`). Bewusst leer in v1 — alle
 * Beispielworkflows sind über exakte Port-Arten verkabelbar. Hier kämen
 * später kuratierte Brücken rein, nie automatische Adapter.
 */
const EXTRA_COMPAT = new Set<string>([])

/** Sind zwei Port-Arten verbindbar? */
export function canConnect(from: WorkflowPortKind, to: WorkflowPortKind): boolean {
  if (from === to) return true
  return EXTRA_COMPAT.has(`${from}->${to}`)
}

/**
 * Kann der konkrete Ausgangs-Port eines Nodes an den Eingangs-Port eines
 * anderen? Löst Action + Port auf und prüft canConnect. Genutzt von der
 * Canvas-UI (isValidConnection) und validateWorkflow.
 */
export function canConnectPorts(
  fromActionId: string,
  fromPortId: string,
  toActionId: string,
  toPortId: string
): boolean {
  const fromAction = getActionById(fromActionId)
  const toAction = getActionById(toActionId)
  if (!fromAction || !toAction) return false
  const fromPort = getPortDef(fromAction, fromPortId, 'output')
  const toPort = getPortDef(toAction, toPortId, 'input')
  if (!fromPort || !toPort) return false
  return canConnect(fromPort.kind, toPort.kind)
}

/** Grund-Text, warum eine Verbindung (nicht) passt — für UI-Hover. */
export function explainConnection(
  fromActionId: string,
  fromPortId: string,
  toActionId: string,
  toPortId: string
): { ok: boolean; reason: string } {
  const fromAction = getActionById(fromActionId)
  const toAction = getActionById(toActionId)
  if (!fromAction || !toAction) return { ok: false, reason: 'Unbekannte Action.' }
  const fromPort = getPortDef(fromAction, fromPortId, 'output')
  const toPort = getPortDef(toAction, toPortId, 'input')
  if (!fromPort || !toPort) return { ok: false, reason: 'Unbekannter Port.' }
  if (canConnect(fromPort.kind, toPort.kind)) {
    return { ok: true, reason: `${toAction.label} akzeptiert „${fromPort.label}" als Eingang.` }
  }
  return {
    ok: false,
    reason: `${toAction.label}.${toPort.label} erwartet ${toPort.kind}, bekommt aber ${fromPort.kind}.`
  }
}

/** Topologische Reihenfolge der Node-IDs; null bei Zyklus. */
export function topoSort(workflow: Workflow): string[] | null {
  const indegree = new Map<string, number>()
  const adj = new Map<string, string[]>()
  for (const node of workflow.nodes) {
    indegree.set(node.id, 0)
    adj.set(node.id, [])
  }
  for (const edge of workflow.edges) {
    if (!indegree.has(edge.fromNodeId) || !indegree.has(edge.toNodeId)) continue
    adj.get(edge.fromNodeId)!.push(edge.toNodeId)
    indegree.set(edge.toNodeId, (indegree.get(edge.toNodeId) || 0) + 1)
  }
  const queue: string[] = []
  for (const [id, deg] of indegree) if (deg === 0) queue.push(id)
  const order: string[] = []
  while (queue.length) {
    const id = queue.shift()!
    order.push(id)
    for (const next of adj.get(id) || []) {
      const d = (indegree.get(next) || 0) - 1
      indegree.set(next, d)
      if (d === 0) queue.push(next)
    }
  }
  return order.length === workflow.nodes.length ? order : null
}

export function validateWorkflow(workflow: Workflow): WorkflowValidationResult {
  const issues: WorkflowValidationIssue[] = []
  const nodeById = new Map(workflow.nodes.map(n => [n.id, n]))

  // 1) Jede Kante: Endpunkte existieren + Port-Arten kompatibel.
  const incomingByPort = new Map<string, number>() // `${nodeId}:${portId}` → count
  for (const edge of workflow.edges) {
    const fromNode = nodeById.get(edge.fromNodeId)
    const toNode = nodeById.get(edge.toNodeId)
    if (!fromNode || !toNode) {
      issues.push({ level: 'error', edgeId: edge.id, message: 'Kante verweist auf fehlenden Node.' })
      continue
    }
    if (!canConnectPorts(fromNode.actionId, edge.fromPortId, toNode.actionId, edge.toPortId)) {
      issues.push({
        level: 'error',
        edgeId: edge.id,
        message: 'Inkompatible Port-Arten.'
      })
    }
    const key = `${edge.toNodeId}:${edge.toPortId}`
    incomingByPort.set(key, (incomingByPort.get(key) || 0) + 1)
  }

  // 2) Pflicht-Eingänge verbunden? Nicht-multiple Ports höchstens einmal belegt?
  for (const node of workflow.nodes) {
    const action = getActionById(node.actionId)
    if (!action) {
      issues.push({ level: 'error', nodeId: node.id, message: `Unbekannte Action: ${node.actionId}` })
      continue
    }
    for (const port of action.inputs) {
      const count = incomingByPort.get(`${node.id}:${port.id}`) || 0
      if (port.required && count === 0) {
        issues.push({
          level: 'error',
          nodeId: node.id,
          message: `Pflicht-Eingang „${port.label}" ist nicht verbunden.`
        })
      }
      if (!port.multiple && count > 1) {
        issues.push({
          level: 'error',
          nodeId: node.id,
          message: `Eingang „${port.label}" darf nur eine Verbindung haben.`
        })
      }
    }
  }

  // 3) Zyklus?
  if (topoSort(workflow) === null) {
    issues.push({ level: 'error', message: 'Der Workflow enthält einen Zyklus.' })
  }

  // 4) Mindestens ein Trigger-Node (kein Pflicht-Eingang offen).
  const hasTrigger = workflow.nodes.some(n => {
    const a = getActionById(n.actionId)
    return a?.isTrigger
  })
  if (workflow.nodes.length > 0 && !hasTrigger) {
    issues.push({ level: 'warning', message: 'Kein Auslöser-Node — der Workflow hat keinen klaren Startpunkt.' })
  }

  return { ok: issues.every(i => i.level !== 'error'), issues }
}
