import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react'
import { useUIStore } from '../../stores/uiStore'
import { useTranslation } from '../../utils/translations'
import { Card, Row, Note, Select, Button } from './SettingsUI'
import { AGENT_CONTEXT_DEFAULT, normalizeAgentContextSetting } from '../../../shared/agentContext'
import { loadMemoryPicture, memoryPictureUnsupported, takeMemoryPictureRequest, type MemoryPictureData, type MemoryPictureRequest } from '../../utils/memoryPictureClient'
import { memoryBar, reliefPlan, roundTokens } from '../../../shared/memoryPicture'

type State =
  | { state: 'loading' }
  | { state: 'hidden' }
  | ({ state: 'ready' } & MemoryPictureData)

const GB = 1024 ** 3

// Speicherbild (shared/memoryPicture.ts): was Programme und Modell gerade belegen und ob ein volles
// Kontextfenster daneben noch in den Arbeitsspeicher passt. Belegung ist gemessen; woher die Kosten
// je Token stammen (eigene Messung, Ollamas Vorausrechnung, Modellaufbau), steht auf der Karte.
// Nur für lokale Modelle auf Rechnern mit gemeinsamem Speicher.
export function MemoryPictureCard() {
  const { t, language } = useTranslation()
  // Welches Modell? Vorgabe ist das Standardmodell und folgt dessen Wechsel — wer oben ein anderes
  // Modell wählt, erwartet hier dessen Bild (real: Karte blieb beim Agent-Modell stehen und wirkte
  // kaputt, 25.11.2026). Nutzen die Funktionen verschiedene Modelle, lässt sich umschalten.
  const selectedModel = useUIStore(s => s.ollama.selectedModel || '')
  const overrides = useUIStore(s => s.ollama.moduleModelOverrides)
  const emailModel = useUIStore(s => (s.email.enabled ? s.email.analysisModel : '') || '')
  const agentModel = overrides?.['note-agent'] || selectedModel
  // Kommt der Nutzer über „Platz schaffen“ aus dem Modell-Menü, zeigt die Karte dessen Modell und
  // dessen Fenster — auch wenn das Modell nur im Agent-Tab gewählt ist (agy F09).
  const [asked, setAsked] = useState<MemoryPictureRequest | null>(() => takeMemoryPictureRequest())
  const [picked, setPicked] = useState(() => asked?.model ?? '')
  const firstModel = useRef(selectedModel)
  useEffect(() => {
    if (firstModel.current !== selectedModel) { firstModel.current = selectedModel; setPicked(''); setAsked(null) }
  }, [selectedModel])
  useEffect(() => {
    const onRequest = (e: Event): void => {
      const detail = (e as CustomEvent<MemoryPictureRequest>).detail
      if (!detail?.model) return
      takeMemoryPictureRequest()
      setAsked(detail)
      setPicked(detail.model)
    }
    window.addEventListener('mindgraph:memoryPictureModel', onRequest)
    return () => window.removeEventListener('mindgraph:memoryPictureModel', onRequest)
  }, [])
  const inUse = [...new Set([selectedModel, ...Object.values(overrides ?? {}), emailModel, picked].filter((m): m is string => !!m))]
  const model = picked || selectedModel || inUse[0] || ''
  const isLmStudio = useUIStore(s => s.ollama.backend === 'lm-studio')
  const wanted = normalizeAgentContextSetting(useUIStore(s => s.noteAgentLocalContextTokens))
  const [data, setData] = useState<State>({ state: 'loading' })
  const [busy, setBusy] = useState(false)
  // Platz schaffen: abgewählte Vorschläge, laufende Aktion, letztes Ergebnis.
  const [chosen, setChosen] = useState<Set<string> | null>(null)
  const [working, setWorking] = useState(false)
  const [outcome, setOutcome] = useState<{ closed: string[]; failed: string[] } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  // Dreht der Nutzer hier am Regler, gilt wieder dessen Wert — das aus dem Menü übergebene Fenster
  // hielt den Balken sonst fest (agy F20).
  const firstWanted = useRef(wanted)
  useEffect(() => {
    if (firstWanted.current !== wanted) { firstWanted.current = wanted; setAsked(a => (a ? { ...a, targetTokens: null } : a)) }
  }, [wanted])
  // Eine verspätete Antwort für ein anderes Modell oder nach dem Schließen darf nichts überschreiben.
  const requestId = useRef(0)
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])

  const load = useCallback(async (fresh = false): Promise<void> => {
    const id = ++requestId.current
    if (isLmStudio || !model) { setData({ state: 'hidden' }); return }
    setBusy(true)
    try {
      const res = await loadMemoryPicture(model, fresh)
      if (!alive.current || id !== requestId.current) return
      setData(res ? { state: 'ready', ...res } : { state: 'hidden' })
      setChosen(null)
    } finally {
      if (alive.current && id === requestId.current) setBusy(false)
    }
  }, [model, isLmStudio])

  useEffect(() => { setData({ state: 'loading' }); void load() }, [load])

  const picker = inUse.length > 1 && (
    <Select aria-label={t('settings.memoryPicture.pick')} value={model} onChange={e => { setAsked(null); setPicked(e.target.value) }}>
      {inUse.map(m => <option key={m} value={m}>{m}{m === agentModel ? ` · ${t('settings.memoryPicture.agentModel')}` : ''}</option>)}
    </Select>
  )
  if (data.state !== 'ready') {
    // Während der Messung steht die Karte schon da (der Sprung aus dem Modell-Menü landete sonst im
    // Leeren). Gibt es für das Modell kein Speicherbild, bleibt die Auswahl sichtbar, solange es
    // andere Modelle gibt.
    // Ohne Speicherbild auf diesem Rechner oder mit LM Studio gibt es die Karte nicht — auch nicht
    // mit Modellauswahl (agy F20: sie stand sonst unter Windows und Linux dauerhaft leer da).
    if (isLmStudio || window.electronAPI.platform !== 'darwin' || memoryPictureUnsupported()) return null
    if (data.state === 'hidden' && !picker) return null
    return (
      <Card>
        <Row label={t('settings.memoryPicture.label', { model })} hint={t('settings.memoryPicture.hint')} stacked>
          <div className="sui-membar-wrap">{picker}</div>
        </Row>
        {data.state === 'loading'
          ? <Note tone="muted">{t('settings.memoryPicture.loading')}</Note>
          : <Note tone="muted" action={t('settings.memoryPicture.refresh')} onAction={() => { void load(true) }} actionDisabled={busy}>{t('settings.memoryPicture.noPicture')}</Note>}
      </Card>
    )
  }
  const { picture, swapUsedBytes, apps, reopenable, sizesPartial } = data
  const locale = language === 'en' ? 'en-US' : 'de-DE'
  const gb = (bytes: number): string => (bytes / GB).toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  const fmt = (n: number): string => n.toLocaleString(locale)

  // Ziel ist ein volles Fenster: das aus dem Modell-Menü übergebene, beim Agent-Modell das
  // eingestellte, sonst der Standard.
  const target = asked?.model === model && asked.targetTokens ? asked.targetTokens : model === agentModel ? wanted : AGENT_CONTEXT_DEFAULT
  const modelBytes = picture.modelBytes ?? 0
  const bufferBytes = picture.bufferBytes
  const needed = picture.otherBytes + modelBytes + bufferBytes
  // Zwei Stufen: passt schon das Modell nicht, oder fehlt nur der Platz für Ollamas Rechenpuffer?
  const overModel = Math.max(0, picture.otherBytes + modelBytes - picture.totalBytes)
  const over = Math.max(0, needed - picture.totalBytes)
  // Der Balken zeigt zusätzlich das GEFÜLLTE Zielfenster: dreht der Nutzer am Regler, wächst der
  // Abschnitt, und was nicht mehr hineinpasst, wird rot. Bedarf und Lücke kommen für Balken,
  // Kopfzeile und Plan aus derselben Rechnung (`memoryBar` → `reliefPlan`).
  const bar = memoryBar(picture, target)
  const plan = reliefPlan(picture, apps, target)
  const contextSeg = bar.contextBytes
  const overAll = bar.overBytes
  const free = bar.freeBytes
  const scale = bar.scaleBytes
  const pct = (bytes: number): string => `${(bytes / scale) * 100}%`
  const tokens = picture.tokensFit == null ? null : roundTokens(picture.tokensFit)

  let headline: string
  let tone: 'ok' | 'warn' | 'danger' = 'ok'
  if (picture.modelBytes == null) {
    headline = t('settings.memoryPicture.unknownModel')
    tone = 'warn'
  } else if (plan?.impossible === 'gpu') {
    // Vor „Modell passt nicht“: dann gibt es keine Schließvorschläge, und die Karte muss sagen, warum.
    headline = t('settings.memoryPicture.impossibleGpu', { n: fmt(target), need: gb(plan.needBytes), gpu: gb(picture.gpuLimitBytes ?? 0) })
    tone = 'danger'
  } else if (plan?.impossible === 'memory') {
    headline = t('settings.memoryPicture.impossibleMemory', { n: fmt(target), need: gb(plan.needBytes), total: gb(picture.totalBytes) })
    tone = 'danger'
  } else if (overModel > 0) {
    headline = t('settings.memoryPicture.modelOver', { gb: gb(overModel) })
    tone = 'danger'
  } else if (over > 0) {
    headline = t('settings.memoryPicture.bufferOver', { buffer: gb(bufferBytes), gb: gb(over) })
    tone = 'warn'
  } else if (tokens == null) {
    headline = t('settings.memoryPicture.noTokens', { gb: gb(Math.max(0, picture.freeBytes ?? 0)) })
  } else {
    const arch = picture.tokenSource === 'architecture'
    const exact = picture.tokenSource === 'measured'
    headline = t(
      picture.loaded
        ? (arch ? 'settings.memoryPicture.fitsLoadedArch' : exact ? 'settings.memoryPicture.fitsLoadedMeasured' : 'settings.memoryPicture.fitsLoaded')
        : (arch ? 'settings.memoryPicture.fitsArch' : exact ? 'settings.memoryPicture.fitsMeasured' : 'settings.memoryPicture.fits'),
      { n: fmt(tokens) }
    )
    // Die Farbe hängt am Plan, nicht an der abgerundeten Token-Zahl — sonst warnte die Kopfzeile
    // über einem grünen „passt“ (agy F09).
    if (plan && (plan.deficitBytes > 0 || plan.tight)) tone = 'warn'
  }

  const closable = apps.filter(a => a.path)
  const selected = chosen ?? new Set((plan?.picks ?? []).map(p => p.path as string))
  const selectedBytes = closable.reduce((sum, a) => sum + (selected.has(a.path as string) ? a.bytes : 0), 0)
  // Gleiche Namen an zwei Orten: dann steht der Ort dabei.
  const nameCount = (name: string): number => closable.filter(a => a.name === name).length
  const toggle = (appPath: string): void => {
    const next = new Set(selected)
    if (next.has(appPath)) next.delete(appPath); else next.add(appPath)
    setChosen(next)
  }
  const wait = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))
  const quitSelected = async (): Promise<void> => {
    setWorking(true)
    setOutcome(null)
    setNotice(null)
    try {
      const res = await window.electronAPI.noteAgentMemoryReliefQuit({ paths: [...selected], en: language === 'en' })
      if (!alive.current) return
      if (res.success && res.stale) {
        // Nichts aus der Auswahl läuft noch oder ist noch angeboten: sagen und neu messen.
        setNotice(t('settings.memoryPicture.reliefStale'))
        await load(true)
      } else if (res.success && !res.cancelled) {
        setOutcome({ closed: res.closed ?? [], failed: res.failed ?? [] })
        // Der Speicher eines beendeten Programms ist erst einen Moment später frei.
        await wait(2500)
        if (alive.current) await load(true)
      }
    } finally {
      if (alive.current) setWorking(false)
    }
  }
  const reopen = async (): Promise<void> => {
    setWorking(true)
    setNotice(null)
    try {
      const res = await window.electronAPI.noteAgentMemoryReliefReopen({ en: language === 'en' })
      if (!alive.current || res.cancelled) return
      const missed = [...(res.skipped ?? []), ...(res.failed ?? [])]
      if (!res.success) setNotice(t('settings.memoryPicture.reopenFailed', { list: reopenable.join(', ') }))
      else if (missed.length > 0) setNotice(t('settings.memoryPicture.reopenFailed', { list: missed.join(', ') }))
      await wait(1500)
      if (alive.current) await load(true)
    } finally {
      if (alive.current) setWorking(false)
    }
  }

  const segment = (bytes: number, kind: string, label: string): ReactElement | null => bytes <= 0 ? null : (
    <div className={`sui-membar-seg is-${kind}`} title={`${label}: ${gb(bytes)} GB`} style={{ width: pct(bytes) }} />
  )
  const legend = (kind: string, label: string, bytes: number): ReactElement => (
    <span className="sui-membar-key"><i className={`sui-membar-dot is-${kind}`} />{label} {gb(bytes)} GB</span>
  )
  const modelLabel = t(picture.loaded ? 'settings.memoryPicture.modelLoaded' : 'settings.memoryPicture.model')
  const contextLabel = t('settings.memoryPicture.context', { n: fmt(target) })
  const freeLabel = t(contextSeg > 0 ? 'settings.memoryPicture.freeRest' : 'settings.memoryPicture.free')
  const inRam = (bytes: number, start: number): number => Math.max(0, Math.min(bytes, picture.totalBytes - start))

  return (
    <Card>
      <Row label={t('settings.memoryPicture.label', { model })} hint={t('settings.memoryPicture.hint')} stacked>
        <div className="sui-membar-wrap">
          {picker}
          <div className="sui-membar" role="img" aria-label={headline}>
            {segment(inRam(picture.otherBytes, 0), 'other', t('settings.memoryPicture.other'))}
            {segment(inRam(modelBytes, picture.otherBytes), 'model', modelLabel)}
            {segment(inRam(bufferBytes, picture.otherBytes + modelBytes), 'buffer', t('settings.memoryPicture.buffer'))}
            {segment(inRam(contextSeg, needed), 'context', contextLabel)}
            {segment(free, 'free', freeLabel)}
            {segment(overAll, 'over', t('settings.memoryPicture.over'))}
          </div>
          <div className="sui-membar-legend">
            {legend('other', t('settings.memoryPicture.other'), picture.otherBytes)}
            {picture.modelBytes != null && legend('model', modelLabel, modelBytes)}
            {bufferBytes > 0 && legend('buffer', t('settings.memoryPicture.buffer'), bufferBytes)}
            {contextSeg > 0 && legend('context', contextLabel, contextSeg)}
            {overAll > 0 ? legend('over', t('settings.memoryPicture.over'), overAll) : legend('free', freeLabel, free)}
            <span className="sui-membar-total">{t('settings.memoryPicture.total', { gb: gb(picture.totalBytes) })}</span>
          </div>
        </div>
      </Row>
      <Note tone={tone} action={t('settings.memoryPicture.refresh')} onAction={() => { void load(true) }} actionDisabled={busy}>
        {headline}
      </Note>
      {plan && !plan.impossible && plan.deficitBytes === 0 && (
        <Note tone={plan.tight ? 'warn' : 'ok'}>
          {t(plan.tight ? 'settings.memoryPicture.reliefTight' : 'settings.memoryPicture.reliefFits', { n: fmt(target), need: gb(plan.needBytes), other: gb(picture.otherBytes), free: gb(plan.freeBytes) })}
        </Note>
      )}
      {plan && !plan.impossible && plan.deficitBytes > 0 && (
        <Note tone="warn">
          {t('settings.memoryPicture.reliefNeed', { n: fmt(target), need: gb(plan.needBytes), other: gb(picture.otherBytes), allowed: gb(plan.allowedOtherBytes), gb: gb(plan.deficitBytes) })}
          {closable.length > 0 && (
            <div className="sui-relief">
              <span className="sui-relief-title">{t('settings.memoryPicture.reliefPick')}</span>
              {closable.map(a => (
                <label key={a.path} className="sui-relief-item">
                  <input type="checkbox" checked={selected.has(a.path as string)} disabled={working} onChange={() => toggle(a.path as string)} />
                  <span>{a.name}{nameCount(a.name) > 1 ? ` — ${a.path}` : ''}</span>
                  <span className="sui-relief-size">{t('settings.memoryPicture.reliefUpToSize', { gb: gb(a.bytes) })}</span>
                </label>
              ))}
              <div className="sui-relief-foot">
                <Button variant="primary" onClick={() => { void quitSelected() }} disabled={working || selected.size === 0}>
                  {t('settings.memoryPicture.reliefQuit')}
                </Button>
                <span className="sui-relief-sum">
                  {t(selectedBytes >= plan.deficitBytes ? 'settings.memoryPicture.reliefUpTo' : 'settings.memoryPicture.reliefShort', { gb: gb(selectedBytes), need: gb(plan.deficitBytes) })}
                  {sizesPartial && <> {t('settings.memoryPicture.sizesPartial')}</>}
                </span>
              </div>
            </div>
          )}
          {closable.length === 0 && <> {t('settings.memoryPicture.reliefNothing')}</>}
        </Note>
      )}
      {outcome && (outcome.closed.length > 0 || outcome.failed.length > 0) && (
        <Note tone={outcome.failed.length > 0 ? 'warn' : 'ok'}>
          {outcome.closed.length > 0 && t('settings.memoryPicture.reliefClosed', { list: outcome.closed.join(', ') })}
          {outcome.failed.length > 0 && <> {t('settings.memoryPicture.reliefFailed', { list: outcome.failed.join(', ') })}</>}
        </Note>
      )}
      {notice && <Note tone="warn">{notice}</Note>}
      {reopenable.length > 0 && (
        <Note tone="muted" action={t('settings.memoryPicture.reliefReopen')} onAction={() => { void reopen() }} actionDisabled={working}>
          {t('settings.memoryPicture.reliefReopenHint', { list: reopenable.join(', ') })}
        </Note>
      )}
      {swapUsedBytes != null && swapUsedBytes >= GB && (
        <Note tone="muted">{t('settings.memoryPicture.swap', { gb: gb(swapUsedBytes) })}</Note>
      )}
      {picture.bytesPerToken != null && (
        <Note tone="muted">
          {picture.tokenSource === 'measured' && picture.measured
            ? t('settings.memoryPicture.sourceMeasured', { kb: fmt(Math.round(picture.bytesPerToken / 1024)), samples: String(picture.measured.samples), max: fmt(picture.measured.maxTokens) })
            : t(picture.tokenSource === 'architecture' ? 'settings.memoryPicture.sourceArch' : 'settings.memoryPicture.source', { kb: fmt(Math.round(picture.bytesPerToken / 1024)) })}
        </Note>
      )}
    </Card>
  )
}
