import React, { useEffect, useMemo, useState } from 'react'
import ReactFlow, {
  Background, Controls, Handle, Panel, Position, useReactFlow,
  useNodesState, useEdgesState, ReactFlowProvider,
  type Node, type Edge, type NodeProps
} from 'reactflow'
import 'reactflow/dist/style.css'
import { useShallow } from 'zustand/react/shallow'
import { useNotesStore } from '../../stores/notesStore'
import { useUIStore } from '../../stores/uiStore'
import { useTranslation } from '../../utils/translations'
import { isBrainNote, brainNoteDate, brainNoteLabel, BRAIN_FOLDER_DEFAULT } from '../../utils/brainNote'
import { getNoteKind, stripNoteKindMarker, splitZettelTitle, NOTE_KINDS, type NoteKindId } from '../../utils/noteKind'
import { resolveLink } from '../../utils/linkExtractor'
import { BrainIcon } from '../BrainIcon'
import type { Note } from '../../../shared/types'

// Brain-Rückblick — das Brain *spricht* über deinen Monat: welcher Tag komplex war,
// welches Thema dich durchgehend beschäftigt hat, was du geklärt hast. Fakten
// deterministisch aus den Brain-Notizen (counts/themes/Links), kein Bild zum Entziffern.
//
// Design „Lesbarer Graph + Zeitstrahl" (Varianten 1b+1c): drei ZUSTÄNDE im
// Segmented-Control (Rückblick | Zeitstrahl | Ganzer Graph — Label = Zustand,
// nie Aktion), die Konstellation ist ein Zeitstrahl mit Tages-Punkten auf einer
// Spine, Kanten neutral (Kategorie steckt nur im Dot), Legende unten rechts,
// „Heute"-Punkt als leerer Docking-Punkt, Brain einheitlich in --brain-color.

const MONTHS_DE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']
const NEUTRAL = '#9aa3b2'
// Struktur-Themen, die kein Topic sind (Boilerplate) — fürs „was hat dich beschäftigt"
const GENERIC_THEMES = new Set(['email', 'mail', 'journal', 'note', 'notes', 'inbox', 'tasks', 'task'])
const DAY_NODE_W = 170
const CHIP_W = 190

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

// Anzeige-Titel für Chips: Zettel-ID + Kategorie-Marker raus (Befund E3)
function chipTitle(title: string): string {
  return splitZettelTitle(stripNoteKindMarker(title)).displayTitle
}

// ── Graph-Knoten (Zeitstrahl) ─────────────────────────────────────────────────
// nodeTypes MUSS Modul-Konstante bleiben (React-Flow-Loop-Falle).

// Tages-Punkt auf der Spine: Dot oben mittig, Datum + Meta darunter.
const BrainDayNode: React.FC<NodeProps> = ({ data }) => {
  const { t } = useTranslation()
  return (
    <div className={`bc-day${data.densest ? ' bc-day-densest' : ''}`}>
      <Handle type="target" position={Position.Left} id="l" className="bc-handle bc-handle-spine" />
      <Handle type="source" position={Position.Right} id="r" className="bc-handle bc-handle-spine" />
      <Handle type="source" position={Position.Top} id="t" className="bc-handle bc-handle-top" />
      <span className="bc-day-dot" />
      <div className="bc-day-date">
        {data.label}
        {data.densest && <span className="bc-day-badge">{t('brain.densestDay')}</span>}
      </div>
      {data.meta && <div className="bc-day-meta">{data.meta}</div>}
    </div>
  )
}

// „Heute" — leerer Docking-Punkt, lädt zum Verdichten ein.
const BrainTodayNode: React.FC<NodeProps> = ({ data }) => {
  const { t } = useTranslation()
  return (
    <div className="bc-today" title={t('brain.todayPendingHint')}>
      <Handle type="target" position={Position.Left} id="l" className="bc-handle bc-handle-spine" />
      <span className="bc-today-dot" />
      <div className="bc-today-date">{data.label}</div>
      <div className="bc-today-meta">{t('brain.todayPending')}</div>
    </div>
  )
}

// Notiz-Chip über der Spine: Kategorie nur im Dot, PDF als Chip.
const ConstNoteNode: React.FC<NodeProps> = ({ data }) => (
  <div className="bc-note" title={data.title}>
    <Handle type="target" position={Position.Bottom} id="b" className="bc-handle" />
    {data.isPdf
      ? <span className="bc-note-pdf">PDF</span>
      : <span className="bc-note-dot" style={{ background: data.color }} />}
    <span className="bc-note-title">{data.title}</span>
  </div>
)

// „Das Brain sagt" — die Rückblick-Essenz als Karte IM Zeitstrahl (1c ②).
const BrainSayNode: React.FC<NodeProps> = ({ data }) => {
  const { t } = useTranslation()
  const selectNote = useNotesStore(s => s.selectNote)
  const setViewMode = useUIStore(s => s.setViewMode)
  const open = (id: string) => { selectNote(id); setViewMode('editor') }
  return (
    <div className="bc-say">
      <div className="bc-say-label">{t('brain.says')}</div>
      <div className="bc-say-text">
        {data.densest && (
          <>Am <button className="bc-link" onClick={() => open(data.densest.noteId)}>{data.densest.label}</button> war
            richtig viel los: <b>{data.densest.links} Notizen</b>
            {data.densest.themes.length > 0 && <> — vor allem rund um <b>{data.densest.themes.join(' · ')}</b></>}. </>
        )}
        {data.thread && (
          <>Durchgehend beschäftigt hat dich <button className="bc-link" onClick={() => open(data.thread.noteId)}>{data.thread.title}</button> — an <b>{data.thread.days} Tagen</b> kam es wieder hoch.</>
        )}
      </div>
    </div>
  )
}

const nodeTypes = { brainDay: BrainDayNode, brainToday: BrainTodayNode, constNote: ConstNoteNode, brainSay: BrainSayNode }

type BrainView = 'digest' | 'timeline'

const Inner: React.FC = () => {
  const { t } = useTranslation()
  const { notes, vaultPath, selectNote } = useNotesStore(
    useShallow(s => ({ notes: s.notes, vaultPath: s.vaultPath, selectNote: s.selectNote }))
  )
  const brainFolder = useUIStore(s => s.brain.folderPath) || BRAIN_FOLDER_DEFAULT
  const setBrainLensActive = useUIStore(s => s.setBrainLensActive)
  const setViewMode = useUIStore(s => s.setViewMode)
  const rf = useReactFlow()

  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [contentMap, setContentMap] = useState<Record<string, string>>({})
  const [view, setView] = useState<BrainView>('digest')

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

  // ── Zeitstrahl-Layout (1c): Spine mit Tages-Punkten, Chips darüber ─────────
  const layout = useMemo(() => {
    const rfNodes: Node[] = []; const rfEdges: Edge[] = []
    const hubX = new Map<number, number>()
    if (monthBrains.length === 0) return { rfNodes, rfEdges, hubX }
    // Gleichmäßige Abstände statt datumsproportional — aufeinanderfolgende Tage
    // würden sonst kollidieren (Labels sind ~170px breit).
    const X0 = 120
    const DAY_GAP = 240
    monthBrains.forEach((b, i) => hubX.set(b.d!.d, X0 + i * DAY_GAP))
    const densestDay = monthBrains.length > 1 ? digest?.densest?.day : undefined

    for (const { n, d } of monthBrains) {
      const x = hubX.get(d!.d)!
      const content = contentMap[n.path] ?? n.content ?? ''
      const themes = parseThemes(content).filter(th => !GENERIC_THEMES.has(th.toLowerCase())).slice(0, 3).join(' · ')
      const count = base.perDayLinks.get(d!.d) || 0
      rfNodes.push({
        id: 'day-' + n.id, type: 'brainDay', draggable: false,
        position: { x: x - DAY_NODE_W / 2, y: -9 },
        data: {
          noteId: n.id,
          label: brainNoteLabel({ ...n, content }),
          meta: themes || (count === 1 ? t('brain.oneNote') : t('brain.notesCount', { count })),
          densest: d!.d === densestDay
        }
      })
    }

    // Spine: neutrale Verbindungen zwischen aufeinanderfolgenden Tagen
    for (let i = 1; i < monthBrains.length; i++) {
      rfEdges.push({
        id: `spine-${i}`, type: 'straight', focusable: false,
        source: 'day-' + monthBrains[i - 1].n.id, target: 'day-' + monthBrains[i].n.id,
        sourceHandle: 'r', targetHandle: 'l',
        style: { stroke: 'var(--edge-color)', strokeWidth: 2 }
      })
    }

    // „Heute" als leerer Docking-Punkt (nur im aktuellen Monat, solange unverdichtet)
    const today = new Date()
    const isCurrentMonth = today.getFullYear() === year && today.getMonth() + 1 === month
    const showTodayDock = isCurrentMonth && !monthBrains.some(b => b.d!.d === today.getDate())
    if (showTodayDock) {
      const x = X0 + monthBrains.length * DAY_GAP
      rfNodes.push({
        id: 'today', type: 'brainToday', draggable: false, selectable: false,
        position: { x: x - DAY_NODE_W / 2, y: -7 },
        data: { label: `${today.getDate()}. ${MONTHS_DE[month - 1]}` }
      })
      const last = monthBrains[monthBrains.length - 1]
      rfEdges.push({
        id: 'spine-today', type: 'straight', focusable: false,
        source: 'day-' + last.n.id, target: 'today', sourceHandle: 'r', targetHandle: 'l',
        style: { stroke: 'var(--edge-color)', strokeWidth: 2, strokeDasharray: '5 5' }
      })
    }

    // Notiz-Chips ÜBER der Spine; Kategorie nur im Dot, Kanten neutral (1b ②)
    const aboveIdx = new Map<number, number>(); let sharedBand = 0
    for (const [id, { note, hubs }] of base.linkedBy) {
      const color = getNoteKind(note)?.dotColor || NEUTRAL
      let x: number, y: number
      if (hubs.length >= 2) {
        x = hubs.reduce((s, h) => s + (hubX.get(h) || 0), 0) / hubs.length - CHIP_W / 2
        y = -300 - (sharedBand++ % 3) * 52
      } else {
        const day = hubs[0]; const i = aboveIdx.get(day) || 0; aboveIdx.set(day, i + 1)
        x = (hubX.get(day) || 0) - CHIP_W / 2 + (i % 2 === 0 ? -52 : 52)
        y = -96 - i * 48
      }
      rfNodes.push({
        id: 'note-' + id, type: 'constNote', position: { x, y },
        data: { noteId: note.id, title: chipTitle(note.title), color, isPdf: !!note.sourcePdf }
      })
      for (const day of hubs) {
        const brain = monthBrains.find(b => b.d!.d === day); if (!brain) continue
        rfEdges.push({
          id: `e-${brain.n.id}-${id}`, focusable: false,
          source: 'day-' + brain.n.id, target: 'note-' + id,
          sourceHandle: 't', targetHandle: 'b',
          type: hubs.length >= 2 ? 'default' : 'straight',
          style: { stroke: 'var(--edge-color)', strokeWidth: hubs.length >= 2 ? 1.6 : 1.2, opacity: 0.85 }
        })
      }
    }

    // „Das Brain sagt" — Rückblick-Essenz als Karte unter der Spine (1c ②)
    if (digest && (digest.densest || digest.topThread)) {
      const spineW = (monthBrains.length - 1 + (showTodayDock ? 1 : 0)) * DAY_GAP
      rfNodes.push({
        id: 'say', type: 'brainSay', draggable: false, selectable: false,
        position: { x: X0 + spineW / 2 - 280, y: 130 },
        data: {
          densest: digest.densest ? {
            noteId: digest.densest.noteId,
            label: digest.densest.label,
            links: digest.densest.links,
            themes: digest.densest.themes.filter(th => !GENERIC_THEMES.has(th.toLowerCase())).slice(0, 2)
          } : null,
          thread: digest.topThread ? {
            noteId: digest.topThread.note.id,
            title: chipTitle(digest.topThread.note.title),
            days: digest.topThread.days
          } : null
        }
      })
    }

    return { rfNodes, rfEdges, hubX }
  }, [monthBrains, year, month, contentMap, base, digest, t])

  const [rfNodes, setRfNodes, onNodesChange] = useNodesState([])
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState([])
  useEffect(() => { setRfNodes(layout.rfNodes); setRfEdges(layout.rfEdges) }, [layout, setRfNodes, setRfEdges])

  // Beim Monats-/Ansichtswechsel den Zeitstrahl einpassen
  useEffect(() => {
    if (view !== 'timeline') return
    const id = window.setTimeout(() => rf.fitView({ padding: 0.25, duration: 300 }), 60)
    return () => window.clearTimeout(id)
  }, [layout, view, rf])

  const prevMonth = () => { if (month === 1) { setMonth(12); setYear(y => y - 1) } else setMonth(m => m - 1) }
  const nextMonth = () => { if (month === 12) { setMonth(1); setYear(y => y + 1) } else setMonth(m => m + 1) }
  const goToday = () => { setYear(now.getFullYear()); setMonth(now.getMonth() + 1) }
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1
  const monthName = `${MONTHS_DE[month - 1]} ${year}`
  // Klick auf einen Tag/eine Notiz: zur Editor-Ansicht wechseln, damit die Datei
  // tatsächlich erscheint (im Graph-Modus bliebe sie sonst „hinter" dem Graph).
  const openNote = (id: string) => { selectNote(id); setViewMode('editor') }
  const centerDay = (day: number) => {
    const x = layout.hubX.get(day)
    if (x !== undefined) rf.setCenter(x, -60, { zoom: 0.9, duration: 400 })
  }

  const LEGEND_KINDS: NoteKindId[] = ['problem', 'solution', 'info']

  return (
    <div className="brain-constellation">
      <div className="bc-toolbar">
        {/* Zustands-Control (1b ①): Label = Zustand, nie Aktion */}
        <div className="bc-seg">
          <button
            className={`bc-seg-btn ${view === 'digest' ? 'active' : ''}`}
            onClick={() => setView('digest')}
          >{t('brain.view.digest')}</button>
          <button
            className={`bc-seg-btn ${view === 'timeline' ? 'active' : ''}`}
            onClick={() => setView('timeline')}
          ><BrainIcon size={12} /> {t('brain.view.timeline')}</button>
          <button
            className="bc-seg-btn"
            onClick={() => setBrainLensActive(false)}
          >{t('brain.view.fullGraph')}</button>
        </div>
        <div className="bc-month">
          <button className="bc-nav" onClick={prevMonth} aria-label="Vorheriger Monat">◂</button>
          <span className="bc-month-label"><BrainIcon size={14} /> {monthName}</span>
          <button className="bc-nav" onClick={nextMonth} aria-label="Nächster Monat">▸</button>
          {!isCurrentMonth && (
            <button className="bc-today-btn" onClick={goToday}>{t('brain.today')}</button>
          )}
        </div>
      </div>

      {monthBrains.length === 0 || !digest ? (
        <div className="bc-empty"><BrainIcon size={28} /><p>Keine Brain-Tage in {monthName}.</p><span>Wechsle den Monat oder erzeuge eine Tageszusammenfassung.</span></div>
      ) : view === 'timeline' ? (
        <ReactFlow
          nodes={rfNodes} edges={rfEdges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          onNodeClick={(_e, node) => {
            const noteId = (node.data as { noteId?: string }).noteId
            if (noteId) openNote(noteId)
          }}
          fitView fitViewOptions={{ padding: 0.25 }} minZoom={0.2} maxZoom={1.8} proOptions={{ hideAttribution: true }}
        >
          <Background gap={26} color="rgba(20,23,29,0.05)" />
          <Controls showInteractive={false} />
          {/* Monats-Scrubber: Brain-Tage als Punkte, Klick zentriert den Tag (1c ④) */}
          {monthBrains.length > 1 && (
            <Panel position="bottom-center" className="bc-scrubber">
              {monthBrains.map(b => (
                <button
                  key={b.n.id}
                  className="bc-scrubber-dot"
                  title={`${b.d!.d}. ${MONTHS_DE[month - 1]}`}
                  onClick={() => centerDay(b.d!.d)}
                />
              ))}
            </Panel>
          )}
          {/* Legende (1b ③): Kategorie-Farben + Kantenbedeutung */}
          <Panel position="bottom-right" className="bc-legend">
            {LEGEND_KINDS.map(k => (
              <span key={k} className="bc-legend-item">
                <span className="bc-legend-dot" style={{ background: NOTE_KINDS[k].dotColor }} />
                {NOTE_KINDS[k].label}
              </span>
            ))}
            <span className="bc-legend-item">
              <span className="bc-legend-line" />
              {t('brain.legend.touched')}
            </span>
          </Panel>
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
            <button className="bc-toggle-graph" onClick={() => setView('timeline')}>{t('brain.showTimeline')}</button>
          </div>
        </div>
      )}
    </div>
  )
}

export const BrainConstellation: React.FC = () => (
  <ReactFlowProvider><Inner /></ReactFlowProvider>
)
