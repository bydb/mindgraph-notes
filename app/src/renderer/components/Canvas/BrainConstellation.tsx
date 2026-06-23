import React, { useEffect, useMemo, useState } from 'react'
import ReactFlow, {
  Background, Controls, Handle, Position,
  useNodesState, useEdgesState, ReactFlowProvider,
  type Node, type Edge, type NodeProps
} from 'reactflow'
import 'reactflow/dist/style.css'
import { useShallow } from 'zustand/react/shallow'
import { useNotesStore } from '../../stores/notesStore'
import { useUIStore } from '../../stores/uiStore'
import { isBrainNote, brainNoteDate, brainNoteLabel, BRAIN_FOLDER_DEFAULT } from '../../utils/brainNote'
import { getNoteKind } from '../../utils/noteKind'
import { resolveLink } from '../../utils/linkExtractor'
import { BrainIcon } from '../BrainIcon'
import type { Note } from '../../../shared/types'

// Brain-Rückblick — das Brain *spricht* über deinen Monat: welcher Tag komplex war,
// welches Thema dich durchgehend beschäftigt hat, was du geklärt hast. Fakten
// deterministisch aus den Brain-Notizen (counts/themes/Links), kein Bild zum Entziffern.
// Die zeitliche Konstellation bleibt als optionales „dazu ansehen" erhalten.

const MONTHS_DE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']
const NEUTRAL = '#9aa3b2'
// Struktur-Themen, die kein Topic sind (Boilerplate) — fürs „was hat dich beschäftigt"
const GENERIC_THEMES = new Set(['email', 'mail', 'journal', 'note', 'notes', 'inbox', 'tasks', 'task'])

function parseThemes(content: string): string[] {
  const fm = content.match(/^---\s*\n([\s\S]*?)\n---/)
  if (!fm) return []
  const m = fm[1].match(/^themes:\s*\n((?:\s*-\s*.+\n?)+)/m)
  if (!m) return []
  return m[1].split('\n').map(l => l.replace(/^\s*-\s*/, '').trim().replace(/^["']|["']$/g, '')).filter(Boolean)
}

function parseCounts(content: string): Record<string, number> {
  const fm = content.match(/^---\s*\n([\s\S]*?)\n---/)
  if (!fm) return {}
  const block = fm[1].match(/^counts:\s*\n((?:\s+\w+:\s*\d+\s*\n?)+)/m)
  if (!block) return {}
  const out: Record<string, number> = {}
  for (const line of block[1].split('\n')) {
    const m = line.match(/^\s+(\w+):\s*(\d+)/)
    if (m) out[m[1]] = Number(m[2])
  }
  return out
}

// ── Graph-Knoten (optionale Konstellation) ────────────────────────────────────
const BrainHubNode: React.FC<NodeProps> = ({ data }) => (
  <div className="bc-hub">
    <Handle type="source" position={Position.Right} className="bc-handle" />
    <Handle type="target" position={Position.Left} className="bc-handle" />
    <div className="bc-hub-head"><BrainIcon size={15} /> <span className="bc-hub-date">{data.label}</span></div>
    {data.themes && <div className="bc-hub-themes">{data.themes}</div>}
    <div className="bc-hub-count">{data.count} Notizen</div>
  </div>
)
const ConstNoteNode: React.FC<NodeProps> = ({ data }) => (
  <div className="bc-note" title={data.title}>
    <Handle type="target" position={Position.Left} className="bc-handle" />
    <Handle type="source" position={Position.Right} className="bc-handle" />
    <span className="bc-note-dot" style={{ background: data.color }} />
    <span className="bc-note-title">{data.title}</span>
  </div>
)
const nodeTypes = { brainHub: BrainHubNode, constNote: ConstNoteNode }

const Inner: React.FC = () => {
  const { notes, vaultPath, selectNote } = useNotesStore(
    useShallow(s => ({ notes: s.notes, vaultPath: s.vaultPath, selectNote: s.selectNote }))
  )
  const brainFolder = useUIStore(s => s.brain.folderPath) || BRAIN_FOLDER_DEFAULT
  const setBrainLensActive = useUIStore(s => s.setBrainLensActive)
  const setViewMode = useUIStore(s => s.setViewMode)

  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [contentMap, setContentMap] = useState<Record<string, string>>({})
  const [showGraph, setShowGraph] = useState(false)

  const monthBrains = useMemo(
    () => notes
      .map(n => ({ n, d: brainNoteDate(n) }))
      .filter(x => !!x.d && isBrainNote(x.n, brainFolder) && x.d!.y === year && x.d!.m === month)
      .sort((a, b) => a.d!.d - b.d!.d),
    [notes, brainFolder, year, month]
  )

  useEffect(() => {
    if (!vaultPath) return
    const toLoad = monthBrains.map(x => x.n.path).filter(p => contentMap[p] === undefined)
    if (!toLoad.length) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await window.electronAPI.readFilesBatch(vaultPath, toLoad)
        if (cancelled) return
        setContentMap(prev => ({ ...prev, ...Object.fromEntries(toLoad.map(p => [p, res[p] || ''])) }))
      } catch { /* ignore */ }
    })()
    return () => { cancelled = true }
  }, [monthBrains, vaultPath, contentMap])

  // Gemeinsame Basis: verlinkte Notizen + Cross-Day-Fäden
  const base = useMemo(() => {
    const linkedBy = new Map<string, { note: Note; hubs: number[] }>()
    const perDayLinks = new Map<number, number>()
    for (const { n, d } of monthBrains) {
      let c = 0
      for (const lt of n.outgoingLinks) {
        const target = resolveLink(lt, notes)
        if (!target || target.id === n.id || isBrainNote(target, brainFolder)) continue
        c++
        const e = linkedBy.get(target.id) || { note: target, hubs: [] }
        if (!e.hubs.includes(d!.d)) e.hubs.push(d!.d)
        linkedBy.set(target.id, e)
      }
      perDayLinks.set(d!.d, c)
    }
    return { linkedBy, perDayLinks }
  }, [monthBrains, notes, brainFolder])

  // ── Der Rückblick (das Brain spricht) ───────────────────────────────────────
  const digest = useMemo(() => {
    if (monthBrains.length === 0) return null
    let totalTouched = 0, totalCreated = 0, totalTasks = 0
    const themeFreq = new Map<string, number>()
    const days = monthBrains.map(({ n, d }) => {
      const content = contentMap[n.path] ?? n.content ?? ''
      const counts = parseCounts(content)
      const themes = parseThemes(content)
      totalTouched += counts.notes_touched || base.perDayLinks.get(d!.d) || 0
      totalCreated += counts.notes_created || 0
      totalTasks += counts.tasks_completed || 0
      for (const th of themes) if (!GENERIC_THEMES.has(th.toLowerCase())) themeFreq.set(th, (themeFreq.get(th) || 0) + 1)
      return { noteId: n.id, day: d!.d, label: brainNoteLabel({ ...n, content }), themes, links: base.perDayLinks.get(d!.d) || 0 }
    })

    const densest = [...days].sort((a, b) => b.links - a.links)[0]
    const quiet = [...days].sort((a, b) => a.links - b.links).slice(0, 2)
    const topThemes = [...themeFreq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(e => e[0])

    let topThread: { note: Note; days: number } | null = null
    for (const { note, hubs } of base.linkedBy.values()) {
      if (hubs.length >= 2 && (!topThread || hubs.length > topThread.days)) topThread = { note, days: hubs.length }
    }
    return { dayCount: days.length, totalTouched, totalCreated, totalTasks, densest, quiet, topThemes, topThread }
  }, [monthBrains, contentMap, base])

  // ── Optionale Konstellation (Graph) ─────────────────────────────────────────
  const layout = useMemo(() => {
    const rfNodes: Node[] = []; const rfEdges: Edge[] = []
    if (monthBrains.length === 0) return { rfNodes, rfEdges }
    const X0 = 120
    const AXIS_W = Math.max(900, (monthBrains.length - 1) * 240)
    const daysInMonth = new Date(year, month, 0).getDate()
    const xForDay = (day: number) => X0 + (daysInMonth > 1 ? (day - 1) / (daysInMonth - 1) : 0.5) * AXIS_W
    const hubX = new Map<number, number>()
    for (const { n, d } of monthBrains) {
      const x = xForDay(d!.d); hubX.set(d!.d, x)
      const content = contentMap[n.path] ?? n.content ?? ''
      rfNodes.push({ id: 'hub-' + n.id, type: 'brainHub', position: { x, y: 0 }, data: { noteId: n.id, label: brainNoteLabel({ ...n, content }), themes: parseThemes(content).slice(0, 3).join(' · '), count: base.perDayLinks.get(d!.d) || 0 } })
    }
    const belowIdx = new Map<number, number>(); let sharedBand = 0
    for (const [id, { note, hubs }] of base.linkedBy) {
      const color = getNoteKind(note)?.dotColor || NEUTRAL
      let x: number, y: number
      if (hubs.length >= 2) { x = hubs.reduce((s, h) => s + (hubX.get(h) || 0), 0) / hubs.length; y = -200 - (sharedBand++ % 4) * 80 }
      else { const day = hubs[0]; const i = belowIdx.get(day) || 0; belowIdx.set(day, i + 1); x = (hubX.get(day) || 0) + (i % 2 === 0 ? -46 : 46); y = 150 + i * 58 }
      rfNodes.push({ id: 'note-' + id, type: 'constNote', position: { x, y }, data: { noteId: note.id, title: note.title, color } })
      for (const day of hubs) {
        const brain = monthBrains.find(b => b.d!.d === day); if (!brain) continue
        rfEdges.push({ id: `e-${brain.n.id}-${id}`, source: 'hub-' + brain.n.id, target: 'note-' + id, type: 'straight', style: { stroke: color, strokeWidth: hubs.length >= 2 ? 1.6 : 1, opacity: 0.55 } })
      }
    }
    return { rfNodes, rfEdges }
  }, [monthBrains, year, month, contentMap, base])

  const [rfNodes, setRfNodes, onNodesChange] = useNodesState([])
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState([])
  useEffect(() => { setRfNodes(layout.rfNodes); setRfEdges(layout.rfEdges) }, [layout, setRfNodes, setRfEdges])

  const prevMonth = () => { setShowGraph(false); if (month === 1) { setMonth(12); setYear(y => y - 1) } else setMonth(m => m - 1) }
  const nextMonth = () => { setShowGraph(false); if (month === 12) { setMonth(1); setYear(y => y + 1) } else setMonth(m => m + 1) }
  const monthName = `${MONTHS_DE[month - 1]} ${year}`
  // Klick auf einen Tag/eine Notiz: zur Editor-Ansicht wechseln, damit die Datei
  // tatsächlich erscheint (im Graph-Modus bliebe sie sonst „hinter" dem Graph).
  const openNote = (id: string) => { selectNote(id); setViewMode('editor') }

  return (
    <div className="brain-constellation">
      <div className="bc-toolbar">
        <button className="bc-btn" onClick={() => setBrainLensActive(false)}>← Freier Graph</button>
        <div className="bc-month">
          <button className="bc-nav" onClick={prevMonth} aria-label="Vorheriger Monat">◂</button>
          <span className="bc-month-label"><BrainIcon size={14} /> {monthName}</span>
          <button className="bc-nav" onClick={nextMonth} aria-label="Nächster Monat">▸</button>
        </div>
        {monthBrains.length > 0 && (
          <button className="bc-btn" onClick={() => setShowGraph(g => !g)}>{showGraph ? 'Rückblick' : 'MindGraph'}</button>
        )}
      </div>

      {monthBrains.length === 0 || !digest ? (
        <div className="bc-empty"><BrainIcon size={28} /><p>Keine Brain-Tage in {monthName}.</p><span>Wechsle den Monat oder erzeuge eine Tageszusammenfassung.</span></div>
      ) : showGraph ? (
        <ReactFlow
          nodes={rfNodes} edges={rfEdges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          onNodeClick={(_e, node) => openNote((node.data as { noteId: string }).noteId)}
          fitView fitViewOptions={{ padding: 0.2 }} minZoom={0.2} maxZoom={1.8} proOptions={{ hideAttribution: true }}
        >
          <Background gap={26} color="rgba(20,23,29,0.05)" />
          <Controls showInteractive={false} />
        </ReactFlow>
      ) : (
        <div className="bc-digest-wrap">
          <div className="bc-digest">
            <div className="bc-digest-head"><BrainIcon size={22} /><h2>Dein {monthName}</h2></div>
            <p className="bc-lead">
              An <b>{digest.dayCount} {digest.dayCount === 1 ? 'Tag' : 'Tagen'}</b> hat dein Brain mitgedacht — rund <b>{digest.totalTouched} Notizen</b> berührt{digest.totalCreated > 0 ? <>, <b>{digest.totalCreated} neue</b> angelegt</> : null}.
            </p>
            {digest.densest && (
              <p>Am <button className="bc-link" onClick={() => openNote(digest.densest.noteId)}>{digest.densest.label}</button> war richtig viel los: <b>{digest.densest.links} Notizen</b>{digest.densest.themes.filter(t => !GENERIC_THEMES.has(t.toLowerCase())).length > 0 ? <> — vor allem rund um <b>{digest.densest.themes.filter(t => !GENERIC_THEMES.has(t.toLowerCase())).slice(0, 2).join(' · ')}</b></> : null}. Dein dichtester Tag.</p>
            )}
            {digest.topThread && (
              <p>Durchgehend beschäftigt hat dich <button className="bc-link" onClick={() => openNote(digest.topThread!.note.id)}>{digest.topThread.note.title}</button> — an <b>{digest.topThread.days} Tagen</b> kam es wieder hoch.</p>
            )}
            {digest.totalTasks > 0 && (
              <p>Geklärt hast du dabei <b>{digest.totalTasks} {digest.totalTasks === 1 ? 'Aufgabe' : 'Aufgaben'}</b>.</p>
            )}
            {digest.topThemes.length > 0 && (
              <p>Themen, die sich durchzogen: <b>{digest.topThemes.join(' · ')}</b>.</p>
            )}
            {digest.quiet.length > 0 && digest.quiet[0].links < (digest.densest?.links ?? 0) && (
              <p className="bc-quiet">Ruhiger war's am {digest.quiet.map(q => q.label).join(' und ')}.</p>
            )}
            <button className="bc-toggle-graph" onClick={() => setShowGraph(true)}>MindGraph anzeigen →</button>
          </div>
        </div>
      )}
    </div>
  )
}

export const BrainConstellation: React.FC = () => (
  <ReactFlowProvider><Inner /></ReactFlowProvider>
)
