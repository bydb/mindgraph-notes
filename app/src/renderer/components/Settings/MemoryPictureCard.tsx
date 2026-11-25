import { useCallback, useEffect, useState, type ReactElement } from 'react'
import { useUIStore } from '../../stores/uiStore'
import { useTranslation } from '../../utils/translations'
import { Card, Row, Note, Select, Button } from './SettingsUI'
import { AGENT_CONTEXT_DEFAULT, normalizeAgentContextSetting } from '../../../shared/agentContext'
import { contextBytes, reliefPlan, roundTokens, type MemoryPicture, type ProcessGroup } from '../../../shared/memoryPicture'

type State =
  | { state: 'loading' }
  | { state: 'hidden' }
  | { state: 'ready'; picture: MemoryPicture; swapUsedBytes: number | null; apps: ProcessGroup[]; reopenable: string[] }

const GB = 1024 ** 3

// Speicherbild (shared/memoryPicture.ts): was Programme und Modell gerade belegen und wie viel
// Kontext daneben noch in den Arbeitsspeicher passt. Belegung ist gemessen, die Token-Zahl aus
// Ollamas Vorausrechnung gerechnet — die Karte sagt das dazu. Nur für lokale Modelle auf Rechnern
// mit gemeinsamem Speicher; sonst erscheint sie nicht.
export function MemoryPictureCard() {
  const { t, language } = useTranslation()
  // Welches Modell? Vorgabe ist das Standardmodell und folgt dessen Wechsel — wer oben ein anderes
  // Modell wählt, erwartet hier dessen Bild (real: Karte blieb beim Agent-Modell stehen und wirkte
  // kaputt, 25.11.2026). Nutzen die Funktionen verschiedene Modelle, lässt sich umschalten.
  const selectedModel = useUIStore(s => s.ollama.selectedModel || '')
  const overrides = useUIStore(s => s.ollama.moduleModelOverrides)
  const emailModel = useUIStore(s => (s.email.enabled ? s.email.analysisModel : '') || '')
  const agentModel = overrides?.['note-agent'] || selectedModel
  const inUse = [...new Set([selectedModel, ...Object.values(overrides ?? {}), emailModel].filter((m): m is string => !!m))]
  const [picked, setPicked] = useState('')
  useEffect(() => { setPicked('') }, [selectedModel])
  const model = picked && inUse.includes(picked) ? picked : selectedModel || inUse[0] || ''
  const isLmStudio = useUIStore(s => s.ollama.backend === 'lm-studio')
  const wanted = normalizeAgentContextSetting(useUIStore(s => s.noteAgentLocalContextTokens))
  const [data, setData] = useState<State>({ state: 'loading' })
  const [busy, setBusy] = useState(false)
  // Platz schaffen: abgewählte Vorschläge, laufende Aktion, letztes Ergebnis.
  const [chosen, setChosen] = useState<Set<string> | null>(null)
  const [working, setWorking] = useState(false)
  const [outcome, setOutcome] = useState<{ closed: string[]; failed: string[] } | null>(null)

  const load = useCallback(async (): Promise<void> => {
    if (isLmStudio || !model) { setData({ state: 'hidden' }); return }
    setBusy(true)
    try {
      const res = await window.electronAPI.noteAgentMemoryPicture({ model })
      if (!res.success || !res.supported || !res.picture) setData({ state: 'hidden' })
      else setData({ state: 'ready', picture: res.picture, swapUsedBytes: res.swapUsedBytes ?? null, apps: res.apps ?? [], reopenable: res.reopenable ?? [] })
      setChosen(null)
    } catch {
      setData({ state: 'hidden' })
    } finally {
      setBusy(false)
    }
  }, [model, isLmStudio])

  useEffect(() => { void load() }, [load])

  if (data.state !== 'ready') return null
  const { picture, swapUsedBytes, apps, reopenable } = data
  const locale = language === 'en' ? 'en-US' : 'de-DE'
  const gb = (bytes: number): string => (bytes / GB).toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  const fmt = (n: number): string => n.toLocaleString(locale)

  // Ziel ist ein volles Fenster — beim Agent-Modell das eingestellte, sonst der Standard.
  const target = model === agentModel ? wanted : AGENT_CONTEXT_DEFAULT
  const modelBytes = picture.modelBytes ?? 0
  const bufferBytes = picture.bufferBytes
  const needed = picture.otherBytes + modelBytes + bufferBytes
  // Zwei Stufen: passt schon das Modell nicht, oder fehlt nur der Platz für Ollamas Rechenpuffer?
  const overModel = Math.max(0, picture.otherBytes + modelBytes - picture.totalBytes)
  const over = Math.max(0, needed - picture.totalBytes)
  // Der Balken zeigt zusätzlich das GEFÜLLTE Zielfenster: dreht der Nutzer am Regler, wächst der
  // Abschnitt, und was nicht mehr hineinpasst, wird rot. Ist das Modell geladen, steckt der
  // schon belegte Kontext in dessen Größe — dann zählt nur, was bis zum vollen Fenster dazukommt.
  const fullContext = picture.modelBytes == null ? null : contextBytes(picture, target)
  const contextSeg = fullContext == null ? 0
    : picture.loaded && picture.baseModelBytes != null ? Math.max(0, picture.baseModelBytes + fullContext - modelBytes)
      : fullContext
  const neededAll = needed + contextSeg
  const overAll = Math.max(0, neededAll - picture.totalBytes)
  const free = Math.max(0, picture.totalBytes - neededAll)
  const scale = Math.max(picture.totalBytes, neededAll)
  const pct = (bytes: number): string => `${(bytes / scale) * 100}%`
  const tokens = picture.tokensFit == null ? null : roundTokens(picture.tokensFit)
  const wantedBytes = contextBytes(picture, wanted)

  let headline: string
  let tone: 'ok' | 'warn' | 'danger' = 'ok'
  if (picture.modelBytes == null) {
    headline = t('settings.memoryPicture.unknownModel')
    tone = 'warn'
  } else if (overModel > 0) {
    headline = t('settings.memoryPicture.modelOver', { gb: gb(overModel) })
    tone = 'danger'
  } else if (over > 0) {
    headline = t('settings.memoryPicture.bufferOver', { buffer: gb(bufferBytes), gb: gb(over) })
    tone = 'warn'
  } else if (tokens == null) {
    headline = t('settings.memoryPicture.noTokens', { gb: gb(free) })
  } else {
    const arch = picture.tokenSource === 'architecture'
    const exact = picture.tokenSource === 'measured'
    headline = t(
      picture.loaded
        ? (arch ? 'settings.memoryPicture.fitsLoadedArch' : exact ? 'settings.memoryPicture.fitsLoadedMeasured' : 'settings.memoryPicture.fitsLoaded')
        : (arch ? 'settings.memoryPicture.fitsArch' : exact ? 'settings.memoryPicture.fitsMeasured' : 'settings.memoryPicture.fits'),
      { n: fmt(tokens) }
    )
    if (model === agentModel && tokens < wanted) tone = 'warn'
  }

  const plan = reliefPlan(picture, apps, target)
  const closable = apps.filter(a => a.path)
  const selected = chosen ?? new Set((plan?.picks ?? []).map(p => p.path as string))
  const selectedBytes = closable.reduce((sum, a) => sum + (selected.has(a.path as string) ? a.bytes : 0), 0)
  const toggle = (appPath: string): void => {
    const next = new Set(selected)
    if (next.has(appPath)) next.delete(appPath); else next.add(appPath)
    setChosen(next)
  }
  const quitSelected = async (): Promise<void> => {
    setWorking(true)
    setOutcome(null)
    try {
      const res = await window.electronAPI.noteAgentMemoryReliefQuit({ paths: [...selected], en: language === 'en' })
      if (res.success && !res.cancelled) {
        setOutcome({ closed: res.closed ?? [], failed: res.failed ?? [] })
        // Die Programme brauchen einen Moment, bis ihr Speicher frei ist.
        await new Promise(resolve => setTimeout(resolve, 4000))
        await load()
      }
    } finally {
      setWorking(false)
    }
  }
  const reopen = async (): Promise<void> => {
    setWorking(true)
    try {
      await window.electronAPI.noteAgentMemoryReliefReopen()
      await new Promise(resolve => setTimeout(resolve, 1500))
      await load()
    } finally {
      setWorking(false)
    }
  }

  const biggest = apps[0]
  const gain = biggest && picture.bytesPerToken ? roundTokens(biggest.bytes / picture.bytesPerToken) : 0
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
          {inUse.length > 1 && (
            <Select aria-label={t('settings.memoryPicture.pick')} value={model} onChange={e => setPicked(e.target.value)}>
              {inUse.map(m => <option key={m} value={m}>{m}{m === agentModel ? ` · ${t('settings.memoryPicture.agentModel')}` : ''}</option>)}
            </Select>
          )}
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
      <Note tone={tone} action={t('settings.memoryPicture.refresh')} onAction={() => { void load() }} actionDisabled={busy}>
        {headline}
        {model === agentModel && tokens != null && over === 0 && tokens < wanted && wantedBytes != null && (
          <> {t('settings.memoryPicture.settingOver', { n: fmt(wanted), gb: gb(wantedBytes) })}</>
        )}
      </Note>
      {plan && plan.deficitBytes === 0 && (
        <Note tone="ok">{t('settings.memoryPicture.reliefFits', { n: fmt(target), need: gb(plan.needBytes), other: gb(picture.otherBytes), allowed: gb(plan.allowedOtherBytes) })}</Note>
      )}
      {plan && plan.deficitBytes > 0 && (
        <Note tone="warn">
          {t('settings.memoryPicture.reliefNeed', { n: fmt(target), need: gb(plan.needBytes), other: gb(picture.otherBytes), allowed: gb(plan.allowedOtherBytes), gb: gb(plan.deficitBytes) })}
          {closable.length > 0 && (
            <div className="sui-relief">
              <span className="sui-relief-title">{t('settings.memoryPicture.reliefPick')}</span>
              {closable.map(a => (
                <label key={a.path} className="sui-relief-item">
                  <input type="checkbox" checked={selected.has(a.path as string)} disabled={working} onChange={() => toggle(a.path as string)} />
                  <span>{a.name}</span>
                  <span className="sui-relief-size">{gb(a.bytes)} GB</span>
                </label>
              ))}
              <div className="sui-relief-foot">
                <Button variant="primary" onClick={() => { void quitSelected() }} disabled={working || selected.size === 0}>
                  {t('settings.memoryPicture.reliefQuit')}
                </Button>
                <span className={selectedBytes >= plan.deficitBytes ? 'sui-relief-sum is-enough' : 'sui-relief-sum'}>
                  {t(selectedBytes >= plan.deficitBytes ? 'settings.memoryPicture.reliefEnough' : 'settings.memoryPicture.reliefShort', { gb: gb(selectedBytes), need: gb(plan.deficitBytes) })}
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
      {reopenable.length > 0 && (
        <Note tone="muted" action={t('settings.memoryPicture.reliefReopen')} onAction={() => { void reopen() }} actionDisabled={working}>
          {t('settings.memoryPicture.reliefReopenHint', { list: reopenable.join(', ') })}
        </Note>
      )}
      {!plan && apps.length > 0 && over > 0 && (
        <Note tone="muted">
          {t('settings.memoryPicture.apps', { list: apps.slice(0, 4).map(a => `${a.name} ${gb(a.bytes)} GB`).join(' · ') })}
          {gain >= 1000 && <> {t('settings.memoryPicture.appsGain', { app: biggest.name, n: fmt(gain) })}</>}
        </Note>
      )}
      {swapUsedBytes != null && swapUsedBytes >= GB && (
        <Note tone="muted">{t('settings.memoryPicture.swap', { gb: gb(swapUsedBytes) })}</Note>
      )}
      {picture.bytesPerToken != null && (
        <Note tone="muted">{t(picture.tokenSource === 'architecture' ? 'settings.memoryPicture.sourceArch' : picture.tokenSource === 'measured' ? 'settings.memoryPicture.sourceMeasured' : 'settings.memoryPicture.source', { kb: fmt(Math.round(picture.bytesPerToken / 1024)) })}</Note>
      )}
    </Card>
  )
}
