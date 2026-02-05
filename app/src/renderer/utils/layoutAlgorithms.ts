/**
 * Graph Layout Algorithms for MindGraph Notes
 *
 * Provides various layout strategies for positioning notes in the canvas:
 * - Force-Directed: Physics-based simulation with edge crossing minimization
 * - Hierarchical: Tree-like structure based on link direction
 * - Grid: Regular grid with optional clustering
 * - Radial: Concentric circles around a central node
 */

import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  forceX,
  forceY,
  SimulationNodeDatum,
  SimulationLinkDatum,
  Force
} from 'd3-force'

export type LayoutAlgorithm = 'force' | 'hierarchical' | 'grid' | 'radial' | 'cluster'

export interface LayoutNode {
  id: string
  x?: number
  y?: number
  width: number
  height: number
  pinned?: boolean
  linkCount?: number
  tags?: string[]
  folder?: string
}

export interface LayoutEdge {
  source: string
  target: string
}

export interface LayoutResult {
  positions: Record<string, { x: number; y: number }>
}

export interface LayoutOptions {
  width: number
  height: number
  padding?: number
  nodeSpacing?: number
  iterations?: number
  centerX?: number
  centerY?: number
}

// ============================================================================
// OVERLAP DETECTION AND RESOLUTION
// ============================================================================

/**
 * Check if two rectangles overlap
 */
function rectsOverlap(
  x1: number, y1: number, w1: number, h1: number,
  x2: number, y2: number, w2: number, h2: number,
  padding: number = 20
): boolean {
  // Add padding to create minimum gap
  const left1 = x1 - w1/2 - padding
  const right1 = x1 + w1/2 + padding
  const top1 = y1 - h1/2 - padding
  const bottom1 = y1 + h1/2 + padding

  const left2 = x2 - w2/2
  const right2 = x2 + w2/2
  const top2 = y2 - h2/2
  const bottom2 = y2 + h2/2

  return !(right1 < left2 || left1 > right2 || bottom1 < top2 || top1 > bottom2)
}

/**
 * Resolve all overlaps in the layout by pushing nodes apart
 * Performance-optimized: scales iterations based on node count
 */
function resolveOverlaps(
  positions: Record<string, { x: number; y: number }>,
  nodes: LayoutNode[],
  maxIterations?: number
): Record<string, { x: number; y: number }> {
  const result: Record<string, { x: number; y: number }> = {}
  Object.keys(positions).forEach(key => {
    result[key] = { ...positions[key] }
  })

  const nodeList = nodes.filter(n => !n.pinned && result[n.id])
  const minGap = 40  // Minimum gap between nodes

  // Performance guard: scale iterations based on graph size
  const nodeCount = nodeList.length
  const effectiveMaxIterations = maxIterations ?? (
    nodeCount > 100 ? 20 :
    nodeCount > 50 ? 50 :
    nodeCount > 30 ? 100 :
    200
  )

  // For very large graphs, skip overlap resolution entirely
  if (nodeCount > 150) {
    console.log(`[Layout] Skipping overlap resolution for large graph (${nodeCount} nodes)`)
    return result
  }

  for (let iter = 0; iter < effectiveMaxIterations; iter++) {
    let hasOverlap = false

    for (let i = 0; i < nodeList.length; i++) {
      for (let j = i + 1; j < nodeList.length; j++) {
        const nodeA = nodeList[i]
        const nodeB = nodeList[j]

        const posA = result[nodeA.id]
        const posB = result[nodeB.id]

        // Use larger default sizes
        const wA = Math.max(nodeA.width || 250, 250)
        const hA = Math.max(nodeA.height || 150, 150)
        const wB = Math.max(nodeB.width || 250, 250)
        const hB = Math.max(nodeB.height || 150, 150)

        if (rectsOverlap(posA.x, posA.y, wA, hA, posB.x, posB.y, wB, hB, minGap)) {
          hasOverlap = true

          // Calculate overlap amount and push direction
          const dx = posB.x - posA.x
          const dy = posB.y - posA.y

          // Calculate how much they overlap
          const overlapX = (wA/2 + wB/2 + minGap) - Math.abs(dx)
          const overlapY = (hA/2 + hB/2 + minGap) - Math.abs(dy)

          // Push apart - use larger push values
          if (overlapX > 0 && overlapY > 0) {
            if (overlapX < overlapY) {
              // Push horizontally
              const push = (overlapX / 2 + 20) * (dx >= 0 ? 1 : -1)
              posA.x -= push
              posB.x += push
            } else {
              // Push vertically
              const push = (overlapY / 2 + 20) * (dy >= 0 ? 1 : -1)
              posA.y -= push
              posB.y += push
            }
          }
        }
      }
    }

    if (!hasOverlap) break
  }

  return result
}

// ============================================================================
// EDGE CROSSING DETECTION AND RESOLUTION
// ============================================================================

interface CrossingInfo {
  edge1: LayoutEdge
  edge2: LayoutEdge
  // The 4 nodes involved (2 per edge)
  nodes: string[]
}

/**
 * Check if two line segments intersect (excluding shared endpoints)
 */
function segmentsIntersect(
  x1: number, y1: number, x2: number, y2: number,
  x3: number, y3: number, x4: number, y4: number
): boolean {
  const epsilon = 0.0001

  // Check if segments share an endpoint
  if ((Math.abs(x1 - x3) < epsilon && Math.abs(y1 - y3) < epsilon) ||
      (Math.abs(x1 - x4) < epsilon && Math.abs(y1 - y4) < epsilon) ||
      (Math.abs(x2 - x3) < epsilon && Math.abs(y2 - y3) < epsilon) ||
      (Math.abs(x2 - x4) < epsilon && Math.abs(y2 - y4) < epsilon)) {
    return false
  }

  const denom = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1)
  if (Math.abs(denom) < epsilon) return false

  const ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denom
  const ub = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denom

  return ua > epsilon && ua < (1 - epsilon) && ub > epsilon && ub < (1 - epsilon)
}

/**
 * Get all edge crossings in the current layout
 */
function findAllCrossings(
  positions: Record<string, { x: number; y: number }>,
  edges: LayoutEdge[]
): CrossingInfo[] {
  const crossings: CrossingInfo[] = []

  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      const e1 = edges[i]
      const e2 = edges[j]

      const p1 = positions[e1.source]
      const p2 = positions[e1.target]
      const p3 = positions[e2.source]
      const p4 = positions[e2.target]

      if (!p1 || !p2 || !p3 || !p4) continue

      if (segmentsIntersect(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y, p4.x, p4.y)) {
        const nodes = new Set([e1.source, e1.target, e2.source, e2.target])
        crossings.push({
          edge1: e1,
          edge2: e2,
          nodes: Array.from(nodes)
        })
      }
    }
  }

  return crossings
}

/**
 * Count total edge crossings
 */
function countCrossings(
  positions: Record<string, { x: number; y: number }>,
  edges: LayoutEdge[]
): number {
  return findAllCrossings(positions, edges).length
}

/**
 * Get crossing score for a specific node (how many crossings its edges are involved in)
 */
function getNodeCrossingScore(
  nodeId: string,
  positions: Record<string, { x: number; y: number }>,
  edges: LayoutEdge[]
): number {
  let score = 0
  const nodeEdges = edges.filter(e => e.source === nodeId || e.target === nodeId)
  const otherEdges = edges.filter(e => e.source !== nodeId && e.target !== nodeId)

  for (const ne of nodeEdges) {
    const p1 = positions[ne.source]
    const p2 = positions[ne.target]
    if (!p1 || !p2) continue

    for (const oe of otherEdges) {
      const p3 = positions[oe.source]
      const p4 = positions[oe.target]
      if (!p3 || !p4) continue

      if (segmentsIntersect(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y, p4.x, p4.y)) {
        score++
      }
    }
  }

  return score
}

// ============================================================================
// INTELLIGENT INITIAL PLACEMENT
// ============================================================================

/**
 * Create an intelligent initial placement based on graph topology
 * Places highly connected nodes centrally and uses BFS to position neighbors
 */
function createInitialPlacement(
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  canvasWidth: number,
  canvasHeight: number
): Record<string, { x: number; y: number }> {
  const positions: Record<string, { x: number; y: number }> = {}

  if (nodes.length === 0) return positions

  // Build adjacency list and calculate degrees
  const adjacency = new Map<string, Set<string>>()
  const degree = new Map<string, number>()

  nodes.forEach(n => {
    adjacency.set(n.id, new Set())
    degree.set(n.id, 0)
  })

  edges.forEach(e => {
    if (adjacency.has(e.source) && adjacency.has(e.target)) {
      adjacency.get(e.source)!.add(e.target)
      adjacency.get(e.target)!.add(e.source)
      degree.set(e.source, (degree.get(e.source) || 0) + 1)
      degree.set(e.target, (degree.get(e.target) || 0) + 1)
    }
  })

  // Sort nodes by degree (most connected first)
  const sortedNodes = [...nodes].sort((a, b) =>
    (degree.get(b.id) || 0) - (degree.get(a.id) || 0)
  )

  // Place the most connected node at center
  const centerNode = sortedNodes[0]
  const centerX = canvasWidth / 2
  const centerY = canvasHeight / 2
  positions[centerNode.id] = { x: centerX, y: centerY }

  // BFS from center node to place others
  const placed = new Set<string>([centerNode.id])
  const queue: Array<{ id: string; parentPos: { x: number; y: number }; angle: number }> = []

  // Add neighbors of center node
  const centerNeighbors = Array.from(adjacency.get(centerNode.id) || [])
  const angleStep = (2 * Math.PI) / Math.max(centerNeighbors.length, 1)

  centerNeighbors.forEach((neighborId, index) => {
    if (!placed.has(neighborId)) {
      queue.push({
        id: neighborId,
        parentPos: { x: centerX, y: centerY },
        angle: index * angleStep
      })
    }
  })

  // Spacing based on canvas size and node count
  const baseRadius = Math.min(canvasWidth, canvasHeight) / (3 + Math.sqrt(nodes.length))
  let currentRadius = baseRadius

  while (queue.length > 0) {
    const { id, parentPos, angle } = queue.shift()!

    if (placed.has(id)) continue
    placed.add(id)

    // Position this node
    const x = parentPos.x + Math.cos(angle) * currentRadius
    const y = parentPos.y + Math.sin(angle) * currentRadius
    positions[id] = { x, y }

    // Add unplaced neighbors
    const neighbors = Array.from(adjacency.get(id) || []).filter(n => !placed.has(n))
    const neighborAngleStep = Math.PI / Math.max(neighbors.length, 1)
    const baseAngle = angle - Math.PI / 2

    neighbors.forEach((neighborId, index) => {
      queue.push({
        id: neighborId,
        parentPos: { x, y },
        angle: baseAngle + index * neighborAngleStep
      })
    })

    // Gradually increase radius for outer nodes
    currentRadius = baseRadius * (1 + placed.size * 0.1)
  }

  // Place any disconnected nodes
  let disconnectedIndex = 0
  for (const node of nodes) {
    if (!positions[node.id]) {
      const angle = disconnectedIndex * (2 * Math.PI / 6)
      const radius = Math.max(canvasWidth, canvasHeight) * 0.4
      positions[node.id] = {
        x: centerX + Math.cos(angle) * radius,
        y: centerY + Math.sin(angle) * radius
      }
      disconnectedIndex++
    }
  }

  return positions
}

// ============================================================================
// CROSSING RESOLUTION ALGORITHMS
// ============================================================================

/**
 * Find the best position for a node to minimize crossings
 * Tests positions in a grid pattern around the current position
 */
function findBestPositionForNode(
  nodeId: string,
  currentPos: { x: number; y: number },
  positions: Record<string, { x: number; y: number }>,
  edges: LayoutEdge[],
  searchRadius: number,
  gridSize: number
): { x: number; y: number } | null {
  const testPositions = { ...positions }
  let bestPos = currentPos
  let bestCrossings = countCrossings(testPositions, edges)
  let found = false

  // Test positions in expanding rings
  for (let r = gridSize; r <= searchRadius; r += gridSize) {
    const numPoints = Math.max(8, Math.floor(2 * Math.PI * r / gridSize))

    for (let i = 0; i < numPoints; i++) {
      const angle = (2 * Math.PI * i) / numPoints
      const testX = currentPos.x + Math.cos(angle) * r
      const testY = currentPos.y + Math.sin(angle) * r

      testPositions[nodeId] = { x: testX, y: testY }
      const crossings = countCrossings(testPositions, edges)

      if (crossings < bestCrossings) {
        bestCrossings = crossings
        bestPos = { x: testX, y: testY }
        found = true
      }
    }
  }

  testPositions[nodeId] = currentPos
  return found ? bestPos : null
}

/**
 * Resolve a specific crossing by moving one of the involved nodes
 */
function resolveCrossing(
  crossing: CrossingInfo,
  positions: Record<string, { x: number; y: number }>,
  edges: LayoutEdge[],
  pinnedNodes: Set<string>
): boolean {
  const { edge1, edge2 } = crossing

  // Get positions of all 4 endpoints
  const p1 = positions[edge1.source]
  const p2 = positions[edge1.target]
  const p3 = positions[edge2.source]
  const p4 = positions[edge2.target]

  if (!p1 || !p2 || !p3 || !p4) return false

  // Calculate the crossing point
  const denom = (p4.y - p3.y) * (p2.x - p1.x) - (p4.x - p3.x) * (p2.y - p1.y)
  if (Math.abs(denom) < 0.0001) return false

  const t = ((p4.x - p3.x) * (p1.y - p3.y) - (p4.y - p3.y) * (p1.x - p3.x)) / denom
  const crossX = p1.x + t * (p2.x - p1.x)
  const crossY = p1.y + t * (p2.y - p1.y)

  // Try moving each node that isn't pinned
  const nodesToTry = crossing.nodes.filter(n => !pinnedNodes.has(n))

  // Sort by how close they are to the crossing point (move the closest)
  nodesToTry.sort((a, b) => {
    const posA = positions[a]
    const posB = positions[b]
    const distA = Math.hypot(posA.x - crossX, posA.y - crossY)
    const distB = Math.hypot(posB.x - crossX, posB.y - crossY)
    return distA - distB
  })

  for (const nodeId of nodesToTry) {
    const originalPos = positions[nodeId]

    // Calculate perpendicular direction to the OTHER edge
    let perpX: number, perpY: number
    if (edge1.source === nodeId || edge1.target === nodeId) {
      // This node is on edge1, so calculate perpendicular to edge2
      const dx = p4.x - p3.x
      const dy = p4.y - p3.y
      const len = Math.hypot(dx, dy)
      perpX = -dy / len
      perpY = dx / len
    } else {
      // This node is on edge2, so calculate perpendicular to edge1
      const dx = p2.x - p1.x
      const dy = p2.y - p1.y
      const len = Math.hypot(dx, dy)
      perpX = -dy / len
      perpY = dx / len
    }

    // Determine which side of the crossing edge the node is currently on
    const side = (originalPos.x - crossX) * perpX + (originalPos.y - crossY) * perpY

    // Try moving to the other side with varying distances
    const distances = [150, 250, 350, 500, 700]
    const originalCrossings = countCrossings(positions, edges)

    for (const dist of distances) {
      // Move in the same direction but further away
      const direction = side >= 0 ? 1 : -1
      const newX = crossX + perpX * dist * direction
      const newY = crossY + perpY * dist * direction

      positions[nodeId] = { x: newX, y: newY }
      const newCrossings = countCrossings(positions, edges)

      if (newCrossings < originalCrossings) {
        return true // Successfully reduced crossings
      }

      // Try the opposite direction
      positions[nodeId] = {
        x: crossX - perpX * dist * direction,
        y: crossY - perpY * dist * direction
      }

      if (countCrossings(positions, edges) < originalCrossings) {
        return true
      }
    }

    // Restore original position
    positions[nodeId] = originalPos
  }

  return false
}

/**
 * Main crossing elimination algorithm
 * Uses multiple strategies to eliminate all edge crossings
 * Performance-optimized: scales based on graph size and includes timeout
 */
function eliminateCrossings(
  positions: Record<string, { x: number; y: number }>,
  edges: LayoutEdge[],
  nodes: LayoutNode[],
  maxIterations?: number
): Record<string, { x: number; y: number }> {
  const result: Record<string, { x: number; y: number }> = {}
  Object.keys(positions).forEach(key => {
    result[key] = { ...positions[key] }
  })

  // Performance guard: skip for large graphs
  if (nodes.length > 40) {
    console.log(`[Layout] Skipping crossing elimination for large graph (${nodes.length} nodes)`)
    return result
  }

  const pinnedNodes = new Set(nodes.filter(n => n.pinned).map(n => n.id))
  const movableNodes = nodes.filter(n => !n.pinned).map(n => n.id)

  // Scale iterations based on graph size
  const effectiveMaxIterations = maxIterations ?? (
    nodes.length > 25 ? 50 :
    nodes.length > 15 ? 150 :
    300
  )

  // Timeout mechanism: max 2 seconds for crossing elimination
  const startTime = Date.now()
  const maxDuration = 2000

  let iteration = 0
  let crossings = findAllCrossings(result, edges)
  let lastCrossingCount = crossings.length

  while (crossings.length > 0 && iteration < effectiveMaxIterations) {
    // Check timeout
    if (Date.now() - startTime > maxDuration) {
      console.log(`[Layout] Crossing elimination timeout after ${iteration} iterations`)
      break
    }
    iteration++
    let improved = false

    // Strategy 1: Direct crossing resolution
    for (const crossing of crossings) {
      if (resolveCrossing(crossing, result, edges, pinnedNodes)) {
        improved = true
        break // Restart after each improvement to get fresh crossing list
      }
    }

    if (improved) {
      crossings = findAllCrossings(result, edges)
      continue
    }

    // Strategy 2: Move problematic nodes to better positions
    const nodeScores = movableNodes.map(id => ({
      id,
      score: getNodeCrossingScore(id, result, edges)
    })).filter(n => n.score > 0).sort((a, b) => b.score - a.score)

    for (const { id } of nodeScores) {
      const currentPos = result[id]
      const searchRadius = 400 + iteration * 20
      const newPos = findBestPositionForNode(id, currentPos, result, edges, searchRadius, 50)

      if (newPos) {
        result[id] = newPos
        improved = true
        break
      }
    }

    if (improved) {
      crossings = findAllCrossings(result, edges)
      continue
    }

    // Strategy 3: Swap positions of nodes (limited to first 20 nodes for performance)
    const swapLimit = Math.min(movableNodes.length, 20)
    for (let i = 0; i < swapLimit && !improved; i++) {
      for (let j = i + 1; j < swapLimit && !improved; j++) {
        const nodeA = movableNodes[i]
        const nodeB = movableNodes[j]
        const posA = { ...result[nodeA] }
        const posB = { ...result[nodeB] }

        // Swap
        result[nodeA] = posB
        result[nodeB] = posA

        const newCrossings = findAllCrossings(result, edges)
        if (newCrossings.length < crossings.length) {
          improved = true
          crossings = newCrossings
        } else {
          // Revert
          result[nodeA] = posA
          result[nodeB] = posB
        }
      }
    }

    if (improved) continue

    // Strategy 4: Random perturbation with acceptance (simulated annealing style)
    const temperature = Math.max(0.1, 1 - iteration / maxIterations)
    const randomNode = movableNodes[Math.floor(Math.random() * movableNodes.length)]
    const originalPos = { ...result[randomNode] }
    const perturbation = 200 * temperature

    result[randomNode] = {
      x: originalPos.x + (Math.random() - 0.5) * perturbation * 2,
      y: originalPos.y + (Math.random() - 0.5) * perturbation * 2
    }

    const newCrossingCount = countCrossings(result, edges)
    const delta = newCrossingCount - lastCrossingCount

    if (delta < 0 || Math.random() < Math.exp(-delta * 5 / temperature)) {
      if (delta < 0) improved = true
      lastCrossingCount = newCrossingCount
      crossings = findAllCrossings(result, edges)
    } else {
      result[randomNode] = originalPos
    }

    // Break if stuck
    if (!improved && iteration % 50 === 0) {
      // Force a bigger perturbation
      for (const nodeId of movableNodes) {
        const pos = result[nodeId]
        result[nodeId] = {
          x: pos.x + (Math.random() - 0.5) * 300,
          y: pos.y + (Math.random() - 0.5) * 300
        }
      }
      crossings = findAllCrossings(result, edges)
    }
  }

  return result
}

// ============================================================================
// LAYOUT COMPACTION
// ============================================================================

/**
 * Check if a node position overlaps with any other node
 */
function hasNodeOverlap(
  nodeId: string,
  newPos: { x: number; y: number },
  positions: Record<string, { x: number; y: number }>,
  nodes: LayoutNode[],
  minDistance: number = 250  // Minimum distance between node centers
): boolean {
  const node = nodes.find(n => n.id === nodeId)
  if (!node) return false

  for (const otherNode of nodes) {
    if (otherNode.id === nodeId) continue

    const otherPos = positions[otherNode.id]
    if (!otherPos) continue

    const dist = Math.hypot(newPos.x - otherPos.x, newPos.y - otherPos.y)

    // Calculate minimum required distance based on node sizes
    const nodeSize = Math.max(node.width || 160, node.height || 90)
    const otherSize = Math.max(otherNode.width || 160, otherNode.height || 90)
    const requiredDist = (nodeSize + otherSize) / 2 + 50  // Plus padding

    if (dist < Math.max(requiredDist, minDistance)) {
      return true
    }
  }

  return false
}

/**
 * Compact the layout by moving nodes closer to the center/centroid
 * while preserving the crossing-free AND overlap-free state
 */
function compactLayout(
  positions: Record<string, { x: number; y: number }>,
  edges: LayoutEdge[],
  nodes: LayoutNode[]
): Record<string, { x: number; y: number }> {
  const result: Record<string, { x: number; y: number }> = {}
  Object.keys(positions).forEach(key => {
    result[key] = { ...positions[key] }
  })

  // Calculate centroid
  let sumX = 0, sumY = 0, count = 0
  Object.values(result).forEach(pos => {
    sumX += pos.x
    sumY += pos.y
    count++
  })

  if (count === 0) return result

  const centroidX = sumX / count
  const centroidY = sumY / count

  const pinnedNodes = new Set(nodes.filter(n => n.pinned).map(n => n.id))
  const movableNodeIds = nodes.filter(n => !n.pinned).map(n => n.id)

  // Try to move each node closer to centroid without creating crossings or overlaps
  const compactionFactor = 0.1  // Move 10% closer each iteration
  const maxIterations = 8

  for (let iter = 0; iter < maxIterations; iter++) {
    let anyMoved = false

    for (const nodeId of movableNodeIds) {
      const currentPos = result[nodeId]
      if (!currentPos) continue

      // Calculate direction toward centroid
      const dx = centroidX - currentPos.x
      const dy = centroidY - currentPos.y
      const dist = Math.hypot(dx, dy)

      if (dist < 100) continue  // Already close enough

      // Try moving closer
      const moveX = dx * compactionFactor
      const moveY = dy * compactionFactor

      const newPos = {
        x: currentPos.x + moveX,
        y: currentPos.y + moveY
      }

      // Check if this creates any crossings OR overlaps
      result[nodeId] = newPos
      const crossings = countCrossings(result, edges)
      const overlaps = hasNodeOverlap(nodeId, newPos, result, nodes)

      if (crossings === 0 && !overlaps) {
        anyMoved = true  // Keep the move
      } else {
        result[nodeId] = currentPos  // Revert
      }
    }

    if (!anyMoved) break  // No more compaction possible
  }

  // Normalize to start near origin
  let minX = Infinity, minY = Infinity
  Object.values(result).forEach(pos => {
    minX = Math.min(minX, pos.x)
    minY = Math.min(minY, pos.y)
  })

  const padding = 50
  Object.keys(result).forEach(key => {
    result[key] = {
      x: result[key].x - minX + padding,
      y: result[key].y - minY + padding
    }
  })

  return result
}

// ============================================================================
// EDGE UNCROSSING FORCE (for D3 simulation)
// ============================================================================

/**
 * Custom force that actively pushes nodes away from crossing edges
 */
function forceUncross<N extends SimulationNodeDatum & { id: string }>(
  links: SimulationLinkDatum<N>[]
): Force<N, SimulationLinkDatum<N>> {
  let nodes: N[] = []
  let strength = 1.0

  function force(alpha: number) {
    for (const node of nodes) {
      if (node.x === undefined || node.y === undefined) continue

      // Find edges connected to this node
      const nodeEdges = links.filter(l => {
        const source = typeof l.source === 'object' ? l.source : nodes.find(n => n.id === l.source)
        const target = typeof l.target === 'object' ? l.target : nodes.find(n => n.id === l.target)
        return source?.id === node.id || target?.id === node.id
      })

      // Find edges NOT connected to this node
      const otherEdges = links.filter(l => {
        const source = typeof l.source === 'object' ? l.source : nodes.find(n => n.id === l.source)
        const target = typeof l.target === 'object' ? l.target : nodes.find(n => n.id === l.target)
        return source?.id !== node.id && target?.id !== node.id
      })

      for (const nodeEdge of nodeEdges) {
        const neSource = typeof nodeEdge.source === 'object' ? nodeEdge.source : nodes.find(n => n.id === nodeEdge.source)
        const neTarget = typeof nodeEdge.target === 'object' ? nodeEdge.target : nodes.find(n => n.id === nodeEdge.target)

        if (!neSource || !neTarget) continue
        if (neSource.x === undefined || neSource.y === undefined) continue
        if (neTarget.x === undefined || neTarget.y === undefined) continue

        for (const otherEdge of otherEdges) {
          const oeSource = typeof otherEdge.source === 'object' ? otherEdge.source : nodes.find(n => n.id === otherEdge.source)
          const oeTarget = typeof otherEdge.target === 'object' ? otherEdge.target : nodes.find(n => n.id === otherEdge.target)

          if (!oeSource || !oeTarget) continue
          if (oeSource.x === undefined || oeSource.y === undefined) continue
          if (oeTarget.x === undefined || oeTarget.y === undefined) continue

          if (segmentsIntersect(
            neSource.x, neSource.y, neTarget.x, neTarget.y,
            oeSource.x, oeSource.y, oeTarget.x, oeTarget.y
          )) {
            // Calculate strong repulsion perpendicular to the other edge
            const edgeDx = oeTarget.x - oeSource.x
            const edgeDy = oeTarget.y - oeSource.y
            const edgeLen = Math.hypot(edgeDx, edgeDy)

            if (edgeLen > 0) {
              const perpX = -edgeDy / edgeLen
              const perpY = edgeDx / edgeLen

              const midX = (oeSource.x + oeTarget.x) / 2
              const midY = (oeSource.y + oeTarget.y) / 2
              const toNodeX = node.x - midX
              const toNodeY = node.y - midY
              const side = toNodeX * perpX + toNodeY * perpY

              // Very strong push
              const pushStrength = strength * alpha * 300
              const direction = side >= 0 ? 1 : -1

              node.vx = (node.vx || 0) + perpX * pushStrength * direction
              node.vy = (node.vy || 0) + perpY * pushStrength * direction

              // Also push the other edge's endpoints slightly
              const otherPush = pushStrength * 0.3
              if (oeSource.vx !== undefined) {
                oeSource.vx -= perpX * otherPush * direction
                oeSource.vy = (oeSource.vy || 0) - perpY * otherPush * direction
              }
              if (oeTarget.vx !== undefined) {
                oeTarget.vx -= perpX * otherPush * direction
                oeTarget.vy = (oeTarget.vy || 0) - perpY * otherPush * direction
              }
            }
          }
        }
      }
    }
  }

  force.initialize = function(_nodes: N[]) {
    nodes = _nodes
  }

  force.strength = function(s?: number) {
    if (s === undefined) return strength
    strength = s
    return force
  }

  return force
}

// ============================================================================
// FORCE-DIRECTED LAYOUT
// ============================================================================

interface ForceNode extends SimulationNodeDatum {
  id: string
  width: number
  height: number
  pinned?: boolean
  linkCount: number
}

/**
 * Force-directed layout with aggressive edge crossing minimization
 * Performance-optimized for large graphs
 */
export function forceDirectedLayout(
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  options: LayoutOptions
): LayoutResult {
  const {
    padding = 50,
    nodeSpacing = 100,
    iterations = 500
  } = options

  if (nodes.length === 0) {
    return { positions: {} }
  }

  console.log(`[Layout] Running force-directed layout for ${nodes.length} nodes, ${edges.length} edges`)

  // Calculate connection count per node
  const connectionCount = new Map<string, number>()
  nodes.forEach(n => connectionCount.set(n.id, 0))
  edges.forEach(e => {
    connectionCount.set(e.source, (connectionCount.get(e.source) || 0) + 1)
    connectionCount.set(e.target, (connectionCount.get(e.target) || 0) + 1)
  })

  // Scale canvas based on node count
  const nodeCount = nodes.length
  const edgeCount = edges.length
  const scaleFactor = Math.max(1, Math.sqrt(nodeCount / 6))
  const canvasWidth = 2000 * scaleFactor
  const canvasHeight = 1600 * scaleFactor

  // Phase 1: Intelligent initial placement
  const initialPositions = createInitialPlacement(nodes, edges, canvasWidth, canvasHeight)

  // Create simulation nodes with initial positions
  const simNodes: ForceNode[] = nodes.map(node => ({
    id: node.id,
    x: initialPositions[node.id]?.x || canvasWidth / 2,
    y: initialPositions[node.id]?.y || canvasHeight / 2,
    width: node.width || 160,
    height: node.height || 90,
    pinned: node.pinned || false,
    linkCount: connectionCount.get(node.id) || 0
  }))

  const nodeMap = new Map(simNodes.map(n => [n.id, n]))

  const simLinks: SimulationLinkDatum<ForceNode>[] = edges
    .filter(edge => nodeMap.has(edge.source) && nodeMap.has(edge.target))
    .map(edge => ({
      source: edge.source,
      target: edge.target
    }))

  // Phase 2: Force simulation with edge uncrossing
  // Adjust parameters based on graph size for performance
  const isLargeGraph = nodeCount > 30
  const isMediumGraph = nodeCount > 15

  const simulation = forceSimulation<ForceNode>(simNodes)
    .force('link', forceLink<ForceNode, SimulationLinkDatum<ForceNode>>(simLinks)
      .id(d => d.id)
      .distance(isLargeGraph ? nodeSpacing * 2 : nodeSpacing * 3.5)
      .strength(isLargeGraph ? 0.5 : 0.3)
    )
    .force('charge', forceManyBody<ForceNode>()
      .strength(isLargeGraph ? -400 : -1000)
      .distanceMin(isLargeGraph ? 50 : 150)
      .distanceMax(isLargeGraph ? 500 : 1200)
    )
    .force('center', forceCenter(canvasWidth / 2, canvasHeight / 2))
    .force('collide', forceCollide<ForceNode>()
      .radius(d => Math.max(d.width, d.height) / 2 + (isLargeGraph ? 40 : 150))
      .strength(1.0)
      .iterations(isLargeGraph ? 2 : 10)
    )
    .force('x', forceX(canvasWidth / 2).strength(isLargeGraph ? 0.05 : 0.01))
    .force('y', forceY(canvasHeight / 2).strength(isLargeGraph ? 0.05 : 0.01))

  // Only add expensive uncrossing force for small graphs
  if (!isLargeGraph) {
    simulation.force('uncross', forceUncross<ForceNode>(simLinks).strength(1.5))
  }

  // Run simulation - adjust based on graph size for performance
  simulation.stop()
  simulation.alpha(1)
  simulation.alphaMin(0.001)

  // Faster decay for larger graphs to prevent freezing
  const decay = nodeCount > 50 ? 0.02 : nodeCount > 20 ? 0.01 : 0.005
  simulation.alphaDecay(decay)

  // Fewer iterations for larger graphs
  const simIterations = nodeCount > 50 ? iterations : nodeCount > 20 ? iterations * 2 : iterations * 3

  for (let i = 0; i < simIterations; i++) {
    simulation.tick()
  }

  // Extract positions
  const positions: Record<string, { x: number; y: number }> = {}
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity

  simNodes.forEach(node => {
    if (node.x !== undefined && node.y !== undefined) {
      minX = Math.min(minX, node.x)
      maxX = Math.max(maxX, node.x)
      minY = Math.min(minY, node.y)
      maxY = Math.max(maxY, node.y)
    }
  })

  const offsetX = -minX + padding
  const offsetY = -minY + padding

  simNodes.forEach(node => {
    if (node.x !== undefined && node.y !== undefined) {
      positions[node.id] = {
        x: node.x + offsetX,
        y: node.y + offsetY
      }
    }
  })

  // Phase 3: Crossing elimination (only for small graphs - expensive operation)
  let finalPositions = positions
  const crossingCount = countCrossings(positions, edges)

  // Only run crossing elimination for smaller graphs (< 30 nodes)
  // For larger graphs, the force simulation should be sufficient
  if (crossingCount > 0 && nodes.length < 30) {
    console.log(`[Layout] ${crossingCount} crossings after simulation, running elimination...`)
    // Limit iterations based on graph size
    const maxIter = Math.min(200, Math.max(50, 500 - nodes.length * 10))
    finalPositions = eliminateCrossings(positions, edges, nodes, maxIter)
    const finalCrossings = countCrossings(finalPositions, edges)
    console.log(`[Layout] ${finalCrossings} crossings after elimination`)
  } else if (crossingCount > 0) {
    console.log(`[Layout] ${crossingCount} crossings - skipping elimination for large graph (${nodes.length} nodes)`)
  }

  // Phase 4: Compact the layout (only for small graphs)
  if (nodes.length < 25) {
    finalPositions = compactLayout(finalPositions, edges, nodes)
  }

  return { positions: finalPositions }
}

// ============================================================================
// HIERARCHICAL LAYOUT (Sugiyama-style with crossing minimization)
// ============================================================================

/**
 * Count edge crossings between two adjacent layers
 */
function countLayerCrossings(
  layer1: string[],
  layer2: string[],
  edges: LayoutEdge[]
): number {
  let crossings = 0

  // Build index maps for O(1) lookups instead of O(n) indexOf
  const layer1Index = new Map<string, number>()
  const layer2Index = new Map<string, number>()
  layer1.forEach((id, idx) => layer1Index.set(id, idx))
  layer2.forEach((id, idx) => layer2Index.set(id, idx))

  // Get edges between these two layers
  const layerEdges: Array<{ source: number; target: number }> = []

  for (const edge of edges) {
    const sourceIdx = layer1Index.get(edge.source)
    const targetIdx = layer2Index.get(edge.target)

    if (sourceIdx !== undefined && targetIdx !== undefined) {
      layerEdges.push({ source: sourceIdx, target: targetIdx })
    }

    // Also check reverse direction
    const sourceIdx2 = layer1Index.get(edge.target)
    const targetIdx2 = layer2Index.get(edge.source)

    if (sourceIdx2 !== undefined && targetIdx2 !== undefined) {
      layerEdges.push({ source: sourceIdx2, target: targetIdx2 })
    }
  }

  // Count crossings: edge (s1,t1) crosses (s2,t2) if (s1 < s2 and t1 > t2) or (s1 > s2 and t1 < t2)
  for (let i = 0; i < layerEdges.length; i++) {
    for (let j = i + 1; j < layerEdges.length; j++) {
      const e1 = layerEdges[i]
      const e2 = layerEdges[j]

      if ((e1.source < e2.source && e1.target > e2.target) ||
          (e1.source > e2.source && e1.target < e2.target)) {
        crossings++
      }
    }
  }

  return crossings
}

/**
 * Calculate barycenter (average position of connected nodes in adjacent layer)
 */
function calculateBarycenter(
  nodeId: string,
  adjacentLayerIndex: Map<string, number>,
  edges: LayoutEdge[]
): number {
  const positions: number[] = []

  for (const edge of edges) {
    if (edge.source === nodeId) {
      const idx = adjacentLayerIndex.get(edge.target)
      if (idx !== undefined) positions.push(idx)
    }
    if (edge.target === nodeId) {
      const idx = adjacentLayerIndex.get(edge.source)
      if (idx !== undefined) positions.push(idx)
    }
  }

  if (positions.length === 0) return -1
  return positions.reduce((a, b) => a + b, 0) / positions.length
}

/**
 * Minimize crossings using the barycenter heuristic
 * Performance-optimized: scales iterations and skips for very large graphs
 */
function minimizeLayerCrossings(
  layers: string[][],
  edges: LayoutEdge[],
  maxIterations?: number
): string[][] {
  const result = layers.map(layer => [...layer])

  // Calculate total nodes for performance scaling
  const totalNodes = layers.reduce((sum, layer) => sum + layer.length, 0)

  // Performance guard: skip for large graphs
  if (totalNodes > 60) {
    console.log(`[Layout] Skipping crossing minimization for large graph (${totalNodes} nodes)`)
    return result
  }

  // Scale iterations based on graph size
  const effectiveMaxIterations = maxIterations ?? (
    totalNodes > 50 ? 5 :
    totalNodes > 30 ? 10 :
    20
  )

  for (let iter = 0; iter < effectiveMaxIterations; iter++) {
    let improved = false

    // Forward sweep (top to bottom)
    for (let i = 1; i < result.length; i++) {
      const layer = result[i]
      const prevLayer = result[i - 1]

      // Build index map for adjacent layer
      const prevLayerIndex = new Map<string, number>()
      prevLayer.forEach((id, idx) => prevLayerIndex.set(id, idx))

      // Calculate barycenters
      const barycenters = layer.map(nodeId => ({
        nodeId,
        barycenter: calculateBarycenter(nodeId, prevLayerIndex, edges)
      }))

      // Sort by barycenter (nodes without connections keep relative position)
      const withBarycenter = barycenters.filter(b => b.barycenter >= 0)
      const withoutBarycenter = barycenters.filter(b => b.barycenter < 0)

      withBarycenter.sort((a, b) => a.barycenter - b.barycenter)

      // Merge back
      const newLayer: string[] = []
      let withIdx = 0
      let withoutIdx = 0

      for (let j = 0; j < layer.length; j++) {
        if (withIdx < withBarycenter.length &&
            (withoutIdx >= withoutBarycenter.length ||
             barycenters.findIndex(b => b.nodeId === withBarycenter[withIdx].nodeId) <=
             barycenters.findIndex(b => b.nodeId === withoutBarycenter[withoutIdx].nodeId))) {
          newLayer.push(withBarycenter[withIdx].nodeId)
          withIdx++
        } else if (withoutIdx < withoutBarycenter.length) {
          newLayer.push(withoutBarycenter[withoutIdx].nodeId)
          withoutIdx++
        }
      }

      // Check if this improved crossings
      const oldCrossings = i > 0 ? countLayerCrossings(prevLayer, result[i], edges) : 0
      const newCrossings = i > 0 ? countLayerCrossings(prevLayer, newLayer, edges) : 0

      if (newCrossings < oldCrossings) {
        result[i] = newLayer
        improved = true
      } else if (newCrossings === oldCrossings && withBarycenter.length > 0) {
        result[i] = newLayer  // Keep for consistency
      }
    }

    // Backward sweep (bottom to top)
    for (let i = result.length - 2; i >= 0; i--) {
      const layer = result[i]
      const nextLayer = result[i + 1]

      // Build index map for adjacent layer
      const nextLayerIndex = new Map<string, number>()
      nextLayer.forEach((id, idx) => nextLayerIndex.set(id, idx))

      const barycenters = layer.map(nodeId => ({
        nodeId,
        barycenter: calculateBarycenter(nodeId, nextLayerIndex, edges)
      }))

      const withBarycenter = barycenters.filter(b => b.barycenter >= 0)
      withBarycenter.sort((a, b) => a.barycenter - b.barycenter)

      const newLayer = withBarycenter.map(b => b.nodeId)
      barycenters.filter(b => b.barycenter < 0).forEach(b => {
        // Insert at original relative position
        const origIdx = layer.indexOf(b.nodeId)
        const insertIdx = Math.min(origIdx, newLayer.length)
        newLayer.splice(insertIdx, 0, b.nodeId)
      })

      const oldCrossings = countLayerCrossings(result[i], nextLayer, edges)
      const newCrossings = countLayerCrossings(newLayer, nextLayer, edges)

      if (newCrossings <= oldCrossings) {
        result[i] = newLayer
        if (newCrossings < oldCrossings) improved = true
      }
    }

    if (!improved) break
  }

  return result
}

export function hierarchicalLayout(
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  options: LayoutOptions
): LayoutResult {
  const {
    width = 1600,
    height = 1200,
    padding = 80,
    nodeSpacing = 80
  } = options

  if (nodes.length === 0) {
    return { positions: {} }
  }

  // Performance guard: for large or highly connected graphs, use simpler grid layout
  const edgeDensity = edges.length / Math.max(nodes.length, 1)
  if (nodes.length > 80 || (nodes.length > 40 && edgeDensity > 2)) {
    console.log(`[Layout] Graph too large/dense for hierarchical layout (${nodes.length} nodes, ${edges.length} edges, density ${edgeDensity.toFixed(1)}). Using grid fallback.`)
    return smartGridLayout(nodes, edges, options)
  }

  console.log(`[Layout] Running hierarchical layout for ${nodes.length} nodes, ${edges.length} edges`)
  const layoutStartTime = Date.now()
  const layoutTimeout = 3000 // Max 3 seconds for entire hierarchical layout

  // Build adjacency lists
  const outgoing = new Map<string, string[]>()
  const incoming = new Map<string, string[]>()
  const nodeSet = new Set(nodes.map(n => n.id))

  nodes.forEach(n => {
    outgoing.set(n.id, [])
    incoming.set(n.id, [])
  })

  edges.forEach(edge => {
    if (nodeSet.has(edge.source) && nodeSet.has(edge.target)) {
      outgoing.get(edge.source)?.push(edge.target)
      incoming.get(edge.target)?.push(edge.source)
    }
  })

  // Step 1: Assign layers using longest path method
  const levels = new Map<string, number>()

  // Find nodes with no incoming edges as starting points
  const roots = nodes.filter(n => incoming.get(n.id)?.length === 0)

  if (roots.length === 0 && nodes.length > 0) {
    // If no roots, pick node with most outgoing edges
    const sorted = [...nodes].sort((a, b) =>
      (outgoing.get(b.id)?.length || 0) - (outgoing.get(a.id)?.length || 0)
    )
    roots.push(sorted[0])
  }

  // BFS to assign levels (with cycle protection)
  const queue: string[] = []
  const inQueue = new Set<string>()
  const maxLevel = nodes.length - 1  // In a DAG, longest path can't exceed this
  roots.forEach(r => {
    levels.set(r.id, 0)
    queue.push(r.id)
    inQueue.add(r.id)
  })

  let bfsIterations = 0
  const maxBfsIterations = nodes.length * nodes.length  // Safety cap for cycles

  while (queue.length > 0 && bfsIterations < maxBfsIterations) {
    bfsIterations++
    const current = queue.shift()!
    inQueue.delete(current)
    const currentLevel = levels.get(current) || 0

    outgoing.get(current)?.forEach(target => {
      const newLevel = currentLevel + 1
      // Cap level to prevent infinite growth from cycles
      if (newLevel > maxLevel) return
      const existingLevel = levels.get(target)
      if (existingLevel === undefined || existingLevel < newLevel) {
        levels.set(target, newLevel)
        if (!inQueue.has(target)) {
          queue.push(target)
          inQueue.add(target)
        }
      }
    })
  }

  if (bfsIterations >= maxBfsIterations) {
    console.warn(`[Layout] BFS hit iteration limit (possible cycles in graph)`)
  }

  // Handle disconnected nodes
  nodes.forEach(n => {
    if (!levels.has(n.id)) {
      levels.set(n.id, 0)
    }
  })

  // Group nodes by level
  const maxAssignedLevel = Math.max(...Array.from(levels.values()))
  const layers: string[][] = []

  for (let i = 0; i <= maxAssignedLevel; i++) {
    layers.push([])
  }

  nodes.forEach(n => {
    const level = levels.get(n.id) || 0
    layers[level].push(n.id)
  })

  // Step 2: Minimize crossings using barycenter method (with timeout check)
  if (Date.now() - layoutStartTime > layoutTimeout) {
    console.log(`[Layout] Hierarchical layout timeout before crossing minimization`)
    // Skip crossing minimization, use layers as-is
  }
  const optimizedLayers = (Date.now() - layoutStartTime > layoutTimeout)
    ? layers.map(l => [...l])
    : minimizeLayerCrossings(layers, edges, 30)

  // Step 3: Assign coordinates with proper spacing based on actual node sizes
  const positions: Record<string, { x: number; y: number }> = {}

  // Build a map of node sizes
  const nodeSizes = new Map<string, { width: number; height: number }>()
  nodes.forEach(n => {
    nodeSizes.set(n.id, {
      width: n.width || 200,
      height: n.height || 100
    })
  })

  // Calculate the maximum width needed for each layer
  const layerWidths: number[] = optimizedLayers.map(layer => {
    let maxWidth = 200
    layer.forEach(nodeId => {
      const size = nodeSizes.get(nodeId)
      if (size) maxWidth = Math.max(maxWidth, size.width)
    })
    return maxWidth + 80  // Add padding between layers
  })

  // Calculate total height needed for each layer (sum of node heights + spacing)
  const verticalPadding = 30  // Space between nodes vertically
  const layerHeights: number[] = optimizedLayers.map(layer => {
    let totalHeight = 0
    layer.forEach(nodeId => {
      const size = nodeSizes.get(nodeId)
      totalHeight += (size?.height || 100) + verticalPadding
    })
    return totalHeight
  })

  // Find the maximum layer height to ensure all layers have same total height
  const maxLayerHeight = Math.max(...layerHeights, height - padding * 2)

  // Calculate x positions for each layer
  const layerXPositions: number[] = []
  let currentX = padding
  layerWidths.forEach((w, idx) => {
    layerXPositions.push(currentX + w / 2)
    currentX += w
  })

  // Position nodes in each layer
  optimizedLayers.forEach((layer, layerIdx) => {
    // Calculate total height of nodes in this layer
    let totalNodesHeight = 0
    layer.forEach(nodeId => {
      const size = nodeSizes.get(nodeId)
      totalNodesHeight += (size?.height || 100) + verticalPadding
    })

    // Start position - center vertically
    let currentY = padding + (maxLayerHeight - totalNodesHeight) / 2

    layer.forEach((nodeId) => {
      const node = nodes.find(n => n.id === nodeId)
      const size = nodeSizes.get(nodeId) || { width: 200, height: 100 }

      if (node?.pinned && node.x !== undefined && node.y !== undefined) {
        positions[nodeId] = { x: node.x, y: node.y }
      } else {
        positions[nodeId] = {
          x: layerXPositions[layerIdx],
          y: currentY + size.height / 2
        }
      }

      // Move to next position
      currentY += size.height + verticalPadding
    })
  })

  // Resolve any remaining overlaps (skip if already over time budget)
  if (Date.now() - layoutStartTime > layoutTimeout) {
    console.log(`[Layout] Hierarchical layout timeout (${Date.now() - layoutStartTime}ms), skipping overlap resolution`)
    return { positions }
  }
  const finalPositions = resolveOverlaps(positions, nodes)
  console.log(`[Layout] Hierarchical layout completed in ${Date.now() - layoutStartTime}ms`)
  return { positions: finalPositions }
}

// ============================================================================
// SMART GRID LAYOUT
// ============================================================================

export function smartGridLayout(
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  options: LayoutOptions
): LayoutResult {
  const { padding = 50 } = options
  const gap = 30

  if (nodes.length === 0) {
    return { positions: {} }
  }

  // Build directed adjacency (source -> targets)
  const outgoing = new Map<string, Set<string>>()
  const incoming = new Map<string, Set<string>>()
  nodes.forEach(n => {
    outgoing.set(n.id, new Set())
    incoming.set(n.id, new Set())
  })

  edges.forEach(edge => {
    if (outgoing.has(edge.source) && incoming.has(edge.target)) {
      outgoing.get(edge.source)!.add(edge.target)
      incoming.get(edge.target)!.add(edge.source)
    }
  })

  // Build node size map
  const nodeSizes = new Map<string, { width: number; height: number }>()
  nodes.forEach(n => {
    nodeSizes.set(n.id, {
      width: n.width || 220,
      height: n.height || 180
    })
  })

  // Assign columns using topological-like ordering
  // Nodes with no incoming edges go first, then their targets, etc.
  const columns: string[][] = []
  const nodeColumn = new Map<string, number>()
  const placed = new Set<string>()

  // Find root nodes (no incoming edges or most outgoing)
  const roots = nodes
    .filter(n => incoming.get(n.id)!.size === 0 && outgoing.get(n.id)!.size > 0)
    .sort((a, b) => outgoing.get(b.id)!.size - outgoing.get(a.id)!.size)

  // If no clear roots, start with nodes that have most outgoing links
  if (roots.length === 0) {
    const sorted = [...nodes].sort((a, b) =>
      outgoing.get(b.id)!.size - outgoing.get(a.id)!.size
    )
    if (sorted.length > 0 && outgoing.get(sorted[0].id)!.size > 0) {
      roots.push(sorted[0])
    }
  }

  // BFS to assign columns - sources before targets
  const queue: Array<{ id: string; col: number }> = []

  roots.forEach(root => {
    if (!placed.has(root.id)) {
      queue.push({ id: root.id, col: 0 })
      placed.add(root.id)
    }
  })

  while (queue.length > 0) {
    const { id, col } = queue.shift()!

    // Ensure column exists
    while (columns.length <= col) {
      columns.push([])
    }

    columns[col].push(id)
    nodeColumn.set(id, col)

    // Add targets to next column
    const targets = Array.from(outgoing.get(id) || [])
    targets.forEach(targetId => {
      if (!placed.has(targetId)) {
        placed.add(targetId)
        queue.push({ id: targetId, col: col + 1 })
      } else {
        // If already placed, ensure it's not before the source
        const existingCol = nodeColumn.get(targetId)
        if (existingCol !== undefined && existingCol <= col) {
          // Move target to later column - remove from old, add to new
          const oldCol = columns[existingCol]
          const idx = oldCol.indexOf(targetId)
          if (idx >= 0) oldCol.splice(idx, 1)

          const newCol = col + 1
          while (columns.length <= newCol) columns.push([])
          columns[newCol].push(targetId)
          nodeColumn.set(targetId, newCol)
        }
      }
    })
  }

  // Add unconnected nodes at the end
  nodes.forEach(n => {
    if (!placed.has(n.id)) {
      // Put unconnected nodes in a new column at the end
      if (columns.length === 0) columns.push([])
      const lastCol = columns.length - 1
      columns[lastCol].push(n.id)
      nodeColumn.set(n.id, lastCol)
    }
  })

  // Remove empty columns
  const nonEmptyColumns = columns.filter(col => col.length > 0)

  // Calculate column widths (max node width in each column)
  const colWidths = nonEmptyColumns.map(col => {
    let maxWidth = 220
    col.forEach(nodeId => {
      const size = nodeSizes.get(nodeId)
      if (size) maxWidth = Math.max(maxWidth, size.width)
    })
    return maxWidth
  })

  // Calculate column X positions
  const colX: number[] = [padding]
  for (let c = 1; c < nonEmptyColumns.length; c++) {
    colX[c] = colX[c - 1] + colWidths[c - 1] + gap
  }

  // Position nodes in each column
  const positions: Record<string, { x: number; y: number }> = {}

  nonEmptyColumns.forEach((col, colIndex) => {
    // Calculate row heights for this column
    let currentY = padding

    col.forEach(nodeId => {
      const node = nodes.find(n => n.id === nodeId)
      const size = nodeSizes.get(nodeId) || { width: 220, height: 180 }

      if (node?.pinned && node.x !== undefined && node.y !== undefined) {
        positions[nodeId] = { x: node.x, y: node.y }
      } else {
        positions[nodeId] = {
          x: colX[colIndex],
          y: currentY
        }
      }

      currentY += size.height + gap
    })
  })

  return { positions }
}

// ============================================================================
// RADIAL LAYOUT
// ============================================================================

export function radialLayout(
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  options: LayoutOptions
): LayoutResult {
  const { width = 1200, height = 800, padding = 80 } = options

  if (nodes.length === 0) {
    return { positions: {} }
  }

  const centerX = width / 2
  const centerY = height / 2
  const maxRadius = Math.min(width, height) / 2 - padding

  const linkCounts = new Map<string, number>()
  nodes.forEach(n => linkCounts.set(n.id, 0))

  edges.forEach(edge => {
    if (linkCounts.has(edge.source)) {
      linkCounts.set(edge.source, (linkCounts.get(edge.source) || 0) + 1)
    }
    if (linkCounts.has(edge.target)) {
      linkCounts.set(edge.target, (linkCounts.get(edge.target) || 0) + 1)
    }
  })

  const sortedNodes = [...nodes].sort((a, b) => {
    return (linkCounts.get(b.id) || 0) - (linkCounts.get(a.id) || 0)
  })

  const positions: Record<string, { x: number; y: number }> = {}

  if (sortedNodes.length > 0) {
    const centerNode = sortedNodes[0]
    if (centerNode.pinned && centerNode.x !== undefined && centerNode.y !== undefined) {
      positions[centerNode.id] = { x: centerNode.x, y: centerNode.y }
    } else {
      positions[centerNode.id] = { x: centerX, y: centerY }
    }
  }

  const remaining = sortedNodes.slice(1)
  const rings = Math.ceil(Math.sqrt(remaining.length))

  let nodeIndex = 0
  for (let ring = 1; ring <= rings && nodeIndex < remaining.length; ring++) {
    const radius = (ring / rings) * maxRadius
    const nodesInRing = Math.min(
      Math.floor(2 * Math.PI * radius / 100),
      remaining.length - nodeIndex
    )

    for (let i = 0; i < nodesInRing && nodeIndex < remaining.length; i++) {
      const node = remaining[nodeIndex]
      const angle = (2 * Math.PI * i) / nodesInRing - Math.PI / 2

      if (node.pinned && node.x !== undefined && node.y !== undefined) {
        positions[node.id] = { x: node.x, y: node.y }
      } else {
        positions[node.id] = {
          x: centerX + Math.cos(angle) * radius,
          y: centerY + Math.sin(angle) * radius
        }
      }
      nodeIndex++
    }
  }

  return { positions: resolveOverlaps(positions, nodes) }
}

// ============================================================================
// CLUSTER LAYOUT
// ============================================================================

export function clusterLayout(
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  options: LayoutOptions,
  groupBy: 'folder' | 'tag' = 'folder'
): LayoutResult {
  const { width = 1200, height = 800, padding = 50, nodeSpacing = 40 } = options

  if (nodes.length === 0) {
    return { positions: {} }
  }

  const groups = new Map<string, LayoutNode[]>()

  nodes.forEach(node => {
    let groupKey: string

    if (groupBy === 'folder') {
      groupKey = node.folder || 'root'
    } else {
      groupKey = node.tags?.[0] || 'untagged'
    }

    if (!groups.has(groupKey)) {
      groups.set(groupKey, [])
    }
    groups.get(groupKey)!.push(node)
  })

  const groupCount = groups.size
  const groupCols = Math.ceil(Math.sqrt(groupCount))
  const groupRows = Math.ceil(groupCount / groupCols)

  const groupWidth = (width - padding * 2) / groupCols
  const groupHeight = (height - padding * 2) / groupRows

  const positions: Record<string, { x: number; y: number }> = {}
  let groupIndex = 0

  groups.forEach((groupNodes) => {
    const groupCol = groupIndex % groupCols
    const groupRow = Math.floor(groupIndex / groupCols)

    const groupCenterX = padding + groupCol * groupWidth + groupWidth / 2
    const groupCenterY = padding + groupRow * groupHeight + groupHeight / 2

    const cols = Math.ceil(Math.sqrt(groupNodes.length))
    const nodeWidth = 160
    const nodeHeight = 90

    groupNodes.forEach((node, nodeIndex) => {
      if (node.pinned && node.x !== undefined && node.y !== undefined) {
        positions[node.id] = { x: node.x, y: node.y }
      } else {
        const col = nodeIndex % cols
        const row = Math.floor(nodeIndex / cols)

        positions[node.id] = {
          x: groupCenterX + (col - cols / 2) * (nodeWidth + nodeSpacing),
          y: groupCenterY + (row - Math.ceil(groupNodes.length / cols) / 2) * (nodeHeight + nodeSpacing)
        }
      }
    })

    groupIndex++
  })

  return { positions: resolveOverlaps(positions, nodes) }
}

// ============================================================================
// MAIN LAYOUT FUNCTION
// ============================================================================

export function applyLayout(
  algorithm: LayoutAlgorithm,
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  options: LayoutOptions
): LayoutResult {
  switch (algorithm) {
    case 'force':
      return forceDirectedLayout(nodes, edges, options)
    case 'hierarchical':
      return hierarchicalLayout(nodes, edges, options)
    case 'grid':
      return smartGridLayout(nodes, edges, options)
    case 'radial':
      return radialLayout(nodes, edges, options)
    case 'cluster':
      return clusterLayout(nodes, edges, options)
    default:
      return forceDirectedLayout(nodes, edges, options)
  }
}
