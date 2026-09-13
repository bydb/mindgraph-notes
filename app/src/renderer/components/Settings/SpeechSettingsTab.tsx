// Einstellungen → Diktat & Vorlesen (Redesign 09/2026): Vorlesen (TTS), Diktieren (Whisper),
// Sprachbefehle & Mikrofon. Logik unverändert, nur die Darstellung im Baukasten-Muster.

import React, { useEffect, useState, useCallback } from 'react'
import { useUIStore } from '../../stores/uiStore'
import { ensureTransformersModel, isTransformersModelReady } from '../../utils/voice/transformersStt'
import type { TabTFn } from './settingsTypes'
import {
  PageHeader, SectionTitle, Card, Row, Note, Details, Toggle, Segmented, Select, Button, TextInput, SecretField, StatusChip
} from './SettingsUI'

export const SpeechSettingsTab: React.FC<{ t: TabTFn }> = ({ t }) => {
  const speech = useUIStore(s => s.speech)
  const setSpeech = useUIStore(s => s.setSpeech)

  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const [whisperStatus, setWhisperStatus] = useState<{ available: boolean; command: string | null; error?: string } | null>(null)
  const [checkingWhisper, setCheckingWhisper] = useState(false)

  // ElevenLabs State
  const [elKeySaved, setElKeySaved] = useState(false)
  const [elSaving, setElSaving] = useState(false)
  const [elVoices, setElVoices] = useState<Array<{ voice_id: string; name: string; labels?: Record<string, string>; category?: string }>>([])
  const [elLoadingVoices, setElLoadingVoices] = useState(false)
  const [elVoicesError, setElVoicesError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const stored = await window.electronAPI.elevenlabsLoadKey()
      if (cancelled) return
      if (stored) setElKeySaved(true) // der gespeicherte Key wird nie angezeigt
    })()
    return () => { cancelled = true }
  }, [])

  const saveElKey = async (key: string) => {
    setElSaving(true)
    try {
      const res = await window.electronAPI.elevenlabsSaveKey(key)
      if (res.success) setElKeySaved(true)
      else setElVoicesError(res.error ?? 'Speichern fehlgeschlagen')
    } finally {
      setElSaving(false)
    }
  }

  const deleteElKey = async () => {
    await window.electronAPI.elevenlabsDeleteKey()
    setElKeySaved(false)
    setElVoices([])
    setSpeech({ elevenlabsVoiceId: '', elevenlabsVoiceName: '' })
  }

  const loadElVoices = async () => {
    setElLoadingVoices(true)
    setElVoicesError(null)
    try {
      const res = await window.electronAPI.elevenlabsListVoices()
      if (res.success && res.voices) setElVoices(res.voices)
      else setElVoicesError(res.error ?? 'Stimmen konnten nicht geladen werden')
    } finally {
      setElLoadingVoices(false)
    }
  }

  const testElVoice = async () => {
    if (!speech.elevenlabsVoiceId) return
    try {
      const res = await window.electronAPI.elevenlabsSynthesize({
        text: t('settings.speech.tts.testSample'),
        voiceId: speech.elevenlabsVoiceId,
        modelId: speech.elevenlabsModel || 'eleven_multilingual_v2',
        stability: speech.elevenlabsStability,
        similarity: speech.elevenlabsSimilarity
      })
      if (!res.success || !res.audio) {
        setElVoicesError(res.error ?? 'Synthese fehlgeschlagen')
        return
      }
      const bytes = new Uint8Array(res.audio)
      if (bytes.byteLength === 0) {
        setElVoicesError('Synthese leer (0 Bytes). API-Key hat evtl. kein text_to_speech-Scope.')
        return
      }
      const blob = new Blob([bytes], { type: 'audio/mpeg' })
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audio.onended = () => URL.revokeObjectURL(url)
      audio.onerror = () => {
        URL.revokeObjectURL(url)
        setElVoicesError(`Wiedergabe fehlgeschlagen (${bytes.byteLength} bytes empfangen, aber kein gültiges MP3).`)
      }
      await audio.play()
    } catch (err) {
      setElVoicesError(err instanceof Error ? err.message : String(err))
    }
  }

  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
    const load = () => setVoices(window.speechSynthesis.getVoices())
    load()
    window.speechSynthesis.addEventListener('voiceschanged', load)
    return () => window.speechSynthesis.removeEventListener('voiceschanged', load)
  }, [])

  // Auto-check Whisper beim Öffnen des Tabs
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setCheckingWhisper(true)
      try {
        const result = await window.electronAPI.voiceCheckWhisper(speech.whisperCommand || 'auto')
        if (!cancelled) setWhisperStatus(result)
      } catch (err) {
        if (!cancelled) setWhisperStatus({ available: false, command: null, error: err instanceof Error ? err.message : String(err) })
      } finally {
        if (!cancelled) setCheckingWhisper(false)
      }
    })()
    return () => { cancelled = true }
  }, [speech.whisperCommand])

  const testVoice = () => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(t('settings.speech.tts.testSample'))
    utterance.rate = speech.ttsRate
    utterance.pitch = speech.ttsPitch
    if (speech.ttsVoice) {
      const voice = voices.find(v => v.voiceURI === speech.ttsVoice)
      if (voice) utterance.voice = voice
    }
    window.speechSynthesis.speak(utterance)
  }

  const runWhisperCheck = async () => {
    setCheckingWhisper(true)
    try {
      setWhisperStatus(await window.electronAPI.voiceCheckWhisper(speech.whisperCommand || 'auto'))
    } finally {
      setCheckingWhisper(false)
    }
  }

  const [preloadingModel, setPreloadingModel] = useState(false)
  const [preloadError, setPreloadError] = useState<string | null>(null)
  const transformersReady = isTransformersModelReady(speech.transformersModel || 'base')
  useEffect(() => { setPreloadError(null) }, [speech.transformersModel, transformersReady])

  const preloadTransformersModel = async () => {
    setPreloadingModel(true)
    setPreloadError(null)
    try {
      await ensureTransformersModel(speech.transformersModel || 'base')
    } catch (err) {
      setPreloadError(err instanceof Error ? err.message : String(err))
    } finally {
      setPreloadingModel(false)
    }
  }

  const rateRow = (
    <Row label={t('settings.speech.tts.rate')}>
      <input type="range" className="sui-range" min={0.5} max={2.0} step={0.1} value={speech.ttsRate} onChange={e => setSpeech({ ttsRate: Number(e.target.value) })} />
      <span className="sui-unit">{speech.ttsRate.toFixed(1)}×</span>
    </Row>
  )

  // Stimmen nach Kategorie gruppieren — premade ist im Free-Tier verfügbar, cloned/generated braucht Upgrade.
  const elGroups = (() => {
    const groups: Record<string, typeof elVoices> = {}
    for (const v of elVoices) {
      const cat = v.category ?? 'other'
      ;(groups[cat] ||= []).push(v)
    }
    const order = ['premade', 'professional', 'cloned', 'generated', 'other']
    const labels: Record<string, string> = { premade: 'Premade (Free)', professional: 'Professional Clone', cloned: 'Instant Clone (Paid)', generated: 'Voice Design (Paid)', other: 'Other' }
    return order.filter(k => groups[k]?.length).map(cat => ({ cat, label: labels[cat] ?? cat, voices: groups[cat] }))
  })()

  return (
    <div className="settings-section">
      <PageHeader title={t('settings.tab.speech')} subtitle={t('settings.speech.hint')} />

      {/* ── Vorlesen ── */}
      <SectionTitle title={t('settings.speech.tts.heading')} />
      <Card>
        <Row label={t('settings.speech.tts.engine')}>
          <Segmented
            options={[{ value: 'system' as const, label: t('settings.speech.tts.engine.system') }, { value: 'elevenlabs' as const, label: t('settings.speech.tts.engine.elevenlabs') }]}
            value={speech.ttsEngine}
            onChange={v => setSpeech({ ttsEngine: v })}
            ariaLabel={t('settings.speech.tts.engine')}
          />
        </Row>
        {speech.ttsEngine === 'system' ? (
          <>
            <Row label={t('settings.speech.tts.voice')}>
              <Select value={speech.ttsVoice} onChange={e => setSpeech({ ttsVoice: e.target.value })}>
                <option value="">{t('settings.speech.tts.voice.default')}</option>
                {voices.map(v => <option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>)}
              </Select>
            </Row>
            {rateRow}
            <Row label={t('settings.speech.tts.pitch')}>
              <input type="range" className="sui-range" min={0.5} max={2.0} step={0.1} value={speech.ttsPitch} onChange={e => setSpeech({ ttsPitch: Number(e.target.value) })} />
              <span className="sui-unit">{speech.ttsPitch.toFixed(1)}</span>
            </Row>
            <Row label={t('settings.speech.tts.test')} hint={t('settings.speech.tts.testSample')}>
              <Button onClick={testVoice}>{t('settings.speech.tts.test')}</Button>
            </Row>
          </>
        ) : (
          <>
            <Note tone="warn">{t('settings.speech.el.cloudWarning')}</Note>
            <Row label={t('settings.speech.el.apiKey')} hint={t('settings.speech.el.apiKey.hint')}>
              <SecretField saved={elKeySaved} onSave={saveElKey} onRemove={deleteElKey} placeholder={t('settings.speech.el.apiKey.placeholder')} busy={elSaving} />
            </Row>
            <Row label={t('settings.speech.el.voice')} hint={!elKeySaved ? t('settings.speech.el.keyMissing') : undefined}>
              <Select
                value={speech.elevenlabsVoiceId}
                onChange={e => {
                  const v = elVoices.find(voice => voice.voice_id === e.target.value)
                  setSpeech({ elevenlabsVoiceId: e.target.value, elevenlabsVoiceName: v?.name ?? '' })
                }}
                disabled={!elKeySaved || elVoices.length === 0}
              >
                <option value="">{t('settings.speech.el.voice.none')}</option>
                {elGroups.map(g => (
                  <optgroup key={g.cat} label={g.label}>
                    {g.voices.map(v => <option key={v.voice_id} value={v.voice_id}>{v.name}{v.labels?.language ? ` (${v.labels.language})` : ''}</option>)}
                  </optgroup>
                ))}
                {speech.elevenlabsVoiceId && !elVoices.some(v => v.voice_id === speech.elevenlabsVoiceId) && (
                  <option value={speech.elevenlabsVoiceId}>{speech.elevenlabsVoiceName || speech.elevenlabsVoiceId}</option>
                )}
              </Select>
              <Button onClick={() => void loadElVoices()} disabled={!elKeySaved || elLoadingVoices}>
                {elLoadingVoices ? t('settings.speech.el.loadingVoices') : t('settings.speech.el.loadVoices')}
              </Button>
              <Button variant="primary" onClick={() => void testElVoice()} disabled={!speech.elevenlabsVoiceId}>{t('settings.speech.tts.test')}</Button>
            </Row>
            {elVoicesError && <Note tone="danger">{elVoicesError}</Note>}
            <Row label={t('settings.speech.el.model')}>
              <Select value={speech.elevenlabsModel} onChange={e => setSpeech({ elevenlabsModel: e.target.value })}>
                <option value="eleven_multilingual_v2">{t('settings.speech.el.model.multilingual')}</option>
                <option value="eleven_turbo_v2_5">{t('settings.speech.el.model.turbo')}</option>
                <option value="eleven_flash_v2_5">{t('settings.speech.el.model.flash')}</option>
              </Select>
            </Row>
            <Row label={t('settings.speech.el.stability')}>
              <input type="range" className="sui-range" min={0} max={1} step={0.05} value={speech.elevenlabsStability} onChange={e => setSpeech({ elevenlabsStability: Number(e.target.value) })} />
              <span className="sui-unit">{speech.elevenlabsStability.toFixed(2)}</span>
            </Row>
            <Row label={t('settings.speech.el.similarity')}>
              <input type="range" className="sui-range" min={0} max={1} step={0.05} value={speech.elevenlabsSimilarity} onChange={e => setSpeech({ elevenlabsSimilarity: Number(e.target.value) })} />
              <span className="sui-unit">{speech.elevenlabsSimilarity.toFixed(2)}</span>
            </Row>
            {rateRow}
          </>
        )}
        <Row label={t('settings.speech.flashcards.autoPlay')} hint={t('settings.speech.flashcards.autoPlay.hint')} htmlFor="speech-fc-autoplay">
          <Toggle id="speech-fc-autoplay" checked={speech.flashcardsAutoPlay} onChange={v => setSpeech({ flashcardsAutoPlay: v })} />
        </Row>
      </Card>

      {/* ── Diktieren ── */}
      <SectionTitle title={t('settings.speech.stt.heading')} />
      <Card anchor="speech-whisper">
        <Row
          label={t('settings.speech.stt.engine')}
          hint={speech.sttEngine === 'transformers' ? t('settings.speech.stt.engine.transformers.hint') : t('settings.speech.stt.engine.cli.hint')}
        >
          <Segmented
            options={[{ value: 'transformers' as const, label: t('settings.speech.stt.engine.transformers') }, { value: 'whisper-cli' as const, label: t('settings.speech.stt.engine.cli') }]}
            value={speech.sttEngine}
            onChange={v => setSpeech({ sttEngine: v })}
            ariaLabel={t('settings.speech.stt.engine')}
          />
        </Row>
        <Row label={t('settings.speech.stt.language')}>
          <Select value={speech.sttLanguage} onChange={e => setSpeech({ sttLanguage: e.target.value })}>
            <option value="auto">{t('settings.speech.stt.language.auto')}</option>
            <option value="de">{t('settings.speech.stt.language.de')}</option>
            <option value="en">{t('settings.speech.stt.language.en')}</option>
            <option value="fr">{t('settings.speech.stt.language.fr')}</option>
            <option value="es">{t('settings.speech.stt.language.es')}</option>
            <option value="it">{t('settings.speech.stt.language.it')}</option>
          </Select>
        </Row>
        {speech.sttEngine === 'transformers' ? (
          <>
            <Row
              label={t('settings.speech.stt.model')}
              hint={<>{t('settings.speech.stt.transformersModel.tiny')} · {t('settings.speech.stt.transformersModel.base')} · {t('settings.speech.stt.transformersModel.small')}<br />{t('settings.speech.stt.transformersModel.hint')}</>}
            >
              <Segmented
                options={[
                  { value: 'tiny' as const, label: 'tiny' },
                  { value: 'base' as const, label: 'base' },
                  { value: 'small' as const, label: 'small' }
                ]}
                value={speech.transformersModel}
                onChange={v => setSpeech({ transformersModel: v })}
                ariaLabel={t('settings.speech.stt.model')}
              />
            </Row>
            <Row label={t('settings.speech.modelInWindow')} hint={transformersReady ? t('settings.speech.stt.preloaded') : undefined}>
              <StatusChip tone={transformersReady ? 'ok' : preloadingModel ? 'checking' : 'warn'} label={transformersReady ? t('settings.speech.stt.prepared') : preloadingModel ? t('settings.speech.stt.preloading') : t('settings.speech.modelNotLoaded')} />
              {!transformersReady && (
                <Button variant="primary" onClick={() => void preloadTransformersModel()} disabled={preloadingModel}>{t('settings.speech.stt.preload')}</Button>
              )}
            </Row>
            {preloadError && <Note tone="danger">{preloadError}</Note>}
          </>
        ) : (
          <>
            <Row label={t('settings.speech.stt.model')} hint={t('settings.speech.stt.model.hint')}>
              <Select value={speech.whisperModel} onChange={e => setSpeech({ whisperModel: e.target.value })}>
                {['tiny', 'base', 'small', 'medium', 'large'].map(m => <option key={m} value={m}>{m}</option>)}
              </Select>
            </Row>
            <Row label={t('settings.speech.stt.command')} hint={t('settings.speech.stt.command.hint')}>
              <TextInput value={speech.whisperCommand} onCommit={v => setSpeech({ whisperCommand: v })} placeholder="auto" />
            </Row>
            <Row label={t('settings.speech.stt.check')}>
              <StatusChip
                tone={checkingWhisper ? 'checking' : whisperStatus?.available ? 'ok' : whisperStatus ? 'off' : 'warn'}
                label={checkingWhisper ? t('settings.speech.stt.checking') : whisperStatus?.available ? t('settings.speech.cliFound') : whisperStatus ? t('settings.speech.cliMissing') : t('settings.remarkable.notChecked')}
              />
              <Button onClick={() => void runWhisperCheck()} disabled={checkingWhisper}>{t('settings.speech.stt.check')}</Button>
            </Row>
            {whisperStatus && (whisperStatus.available ? (
              <Note tone="ok">{t('settings.speech.stt.installed', { path: whisperStatus.command ?? '' })} · {t('settings.speech.stt.ffmpegHint')}</Note>
            ) : (
              <Note tone="warn" action={t('settings.integ.recheck')} onAction={() => void runWhisperCheck()}>
                <b>{t('settings.speech.stt.notInstalled')}</b>
                <div>{t('settings.speech.stt.installMac')}: <code>brew install openai-whisper</code></div>
                <div>{t('settings.speech.stt.installPip')}: <code>pip install openai-whisper</code></div>
                <div>{t('settings.speech.stt.ffmpegHint')}</div>
                {whisperStatus.error && <div className="settings-error-detail">{whisperStatus.error}</div>}
              </Note>
            ))}
          </>
        )}
      </Card>

      {/* ── Sprachbefehle & Mikrofon ── */}
      <SectionTitle title={t('settings.speech.groupCommands')} />
      <Card>
        <Row label={t('settings.speech.inputDevice')} hint={t('settings.speech.inputDeviceHint')}>
          <MicrophonePicker value={speech.inputDeviceId} onChange={id => setSpeech({ inputDeviceId: id })} t={t} />
        </Row>
        <Details title={t('settings.speech.commandsSection')}>
          <p>{t('settings.speech.commandsHint')}</p>
        </Details>
      </Card>
    </div>
  )
}

/**
 * Auswahl des Aufnahmegeräts.
 *
 * Die Gerätenamen liefert der Browser erst, NACHDEM die Mikrofonfreigabe erteilt wurde —
 * vorher sind die Labels leer. Deshalb der Knopf „Geräte anzeigen": er fordert einmal
 * kurz Zugriff an, liest die Liste und gibt das Mikrofon sofort wieder frei. Ohne diesen
 * Schritt stünde in der Liste nur „Mikrofon 1", „Mikrofon 2".
 */
const MicrophonePicker: React.FC<{
  value: string
  onChange: (deviceId: string) => void
  t: TabTFn
}> = ({ value, onChange, t }) => {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async (askPermission: boolean) => {
    setLoading(true)
    try {
      if (askPermission) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        stream.getTracks().forEach(track => track.stop())
      }
      const all = await navigator.mediaDevices.enumerateDevices()
      setDevices(all.filter(d => d.kind === 'audioinput'))
    } catch (err) {
      console.warn('[settings] Mikrofonliste nicht lesbar:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load(false) }, [load])

  const labelled = devices.some(d => d.label)

  return (
    <>
      <Select value={value} onChange={e => onChange(e.target.value)}>
        <option value="">{t('settings.speech.inputDeviceDefault')}</option>
        {devices.map((device, index) => (
          <option key={device.deviceId} value={device.deviceId}>
            {device.label || `${t('settings.speech.inputDevice')} ${index + 1}`}
          </option>
        ))}
      </Select>
      {!labelled && (
        <Button onClick={() => void load(true)} disabled={loading}>{t('settings.speech.inputDeviceReveal')}</Button>
      )}
    </>
  )
}
