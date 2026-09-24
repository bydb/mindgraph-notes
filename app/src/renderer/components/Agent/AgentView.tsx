// Agent-Tab: der Notiz-Agent ohne offene Notiz.
//
// Anlass: Ordner-Aufträge („werte die Rückmeldungen aller Schulen aus") haben keine
// Ausgangsnotiz. Bis hierher wohnte der Agent ausschließlich in der Macher-Leiste
// unter dem Editor — ohne geöffnete Datei war er nicht erreichbar.
//
// Zustand und IPC liegen im noteAgentStore (Bereich = Tab-ID), die Lauf-Anzeige ist
// dieselbe wie in der Macher-Leiste (AgentRunPanel).
//
// Auftragskarte (Redesign 09/2026, Entwurf „Agent Redesign“ Runde 2): jede
// Vorbedingung ist eine Zeile mit Zustand, der Startknopf nennt die erste Lücke.
// Ersetzt die bis zu vier gestapelten Hinweisbalken. Jede Aussage der Karte ist gegen
// den Code geprüft (docs/codex-collab/agent-auftragskarte-quellen.md) — deshalb kein
// „nur Vault“, kein „lokal“ als Garantie und die Sofortwirkung von Shell/Rechner
// direkt am Schalter.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useUIStore, flushUISettings } from '../../stores/uiStore'
import { useNotesStore, createNoteFromFile } from '../../stores/notesStore'
import { useComposeMeasurement } from '../../utils/activeTimeTracker'
import { useComparisonStore } from '../../stores/comparisonStore'
import { useTranslation, type TranslationKey } from '../../utils/translations'
import { ContextAttachmentRow, FolderGlyph } from '../Shared/ContextAttachmentRow'
import { ModelPicker } from '../Shared/ModelPicker'
import { MindGraphLogo } from '../Shared/MindGraphLogo'
import { AgentRunPanel } from './AgentRunPanel'
import { useContextVaultFiles } from '../../utils/useContextVaultFiles'
import { measurePlacement, type PickerLayout } from '../../utils/pickerPlacement'
import { useIsModuleEnabled, isModuleAvailable } from '../../utils/modules'
import { useNoteAgentStore, EMPTY_AGENT_SCOPE, type AgentExampleNeed } from '../../stores/noteAgentStore'
import { cloudRoutesForFeature, cloudProviderForSentinel, CLOUD_PROVIDER_META, type CloudProviderId } from '../../../shared/llmBackend'
import { isCloudModel } from '../../../shared/modelCompatibility'
import { WEB_SEARCH_PROVIDER_META, isWebResearchConfigComplete } from '../../../shared/webResearch'
import { DEFAULT_COMPUTER_CONTROL, activeComputerVerbs, computerVerbLabel } from '../../../shared/computerControl'
import { NOTE_AGENT_CLOUD_CONSENT_VERSION, type AgentRoute } from '../../../shared/agentRoute'

interface Props {
  /** Tab-ID — zugleich der Bereich im noteAgentStore. */
  tabId: string
}

// Shell und Rechner-Steuerung gibt es nur auf dem Mac (macOnly im Modul-Katalog).
const HAS_MAC_TOOLS = isModuleAvailable({ macOnly: true })
const SUBMIT_KEYS = HAS_MAC_TOOLS ? '\u2318\u21A9' : 'Ctrl+Enter'

// `need`: was der unveränderte Beispielauftrag zwingend braucht (Codex F25/F29/F30).
// Verwaltung: ein Ordner (collect_table gibt es nur mit Ordner-Anhang). Beschaffung: zwei
// Angebote. Arbeitsblatt: Web — die Arbeitsblatt-Skill bricht ohne web_search/web_fetch
// ab. Wissensrecherche braucht nichts außer dem Vault.
const EXAMPLES: Array<{ cat: TranslationKey; text: TranslationKey; docs: TranslationKey; result: TranslationKey; need: AgentExampleNeed }> = [
  { cat: 'agentCard.ex1Cat', text: 'agentCard.ex1', docs: 'agentCard.ex1Docs', result: 'agentCard.ex1Result', need: 'folder' },
  { cat: 'agentCard.ex2Cat', text: 'agentCard.ex2', docs: 'agentCard.ex2Docs', result: 'agentCard.ex2Result', need: 'files2' },
  { cat: 'agentCard.ex3Cat', text: 'agentCard.ex3', docs: 'agentCard.ex3Docs', result: 'agentCard.ex3Result', need: 'none' },
  { cat: 'agentCard.ex4Cat', text: 'agentCard.ex4', docs: 'agentCard.ex4Docs', result: 'agentCard.ex4Result', need: 'web' }
]

type PermState = 'on' | 'off' | 'locked' | 'modOff' | 'setup'

/** Wie useEffect, aber NICHT beim Einhängen — nur wenn sich eine Abhängigkeit wirklich
 *  ändert. Die Ansicht wird bei jedem Tab-Wechsel neu eingehängt; Zurücksetz-Regeln
 *  („Web aus bei Vault-Wechsel“) dürfen dabei nicht feuern. */
function useOnChange(deps: unknown[], fn: () => void) {
  const mounted = useRef(false)
  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return }
    fn()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}

/** „300 – Ressourcen/398 – Arbeitsblätter“ → Name vorn, nur der direkte Elternordner dahinter. */
function splitTargetPath(rel: string): { name: string; parent: string; deeper: boolean } {
  const parts = rel.split('/').filter(Boolean)
  const name = parts.pop() ?? rel
  return { name, parent: parts[parts.length - 1] ?? '', deeper: parts.length > 1 }
}

function openSettingsAt(tab: 'ai' | 'modules', anchor: string) {
  window.dispatchEvent(new CustomEvent('mindgraph:openSettings', { detail: { tab, anchor } }))
}
// Modul aus → Modul-Tab (die KI-Karten dieser Module gibt es erst, wenn das Modul an ist),
// nicht eingerichtet → die Karte im KI-Tab.
function openPermSetup(state: PermState, moduleId: string, aiAnchor: string) {
  if (state === 'modOff') openSettingsAt('modules', `module-${moduleId}`)
  else openSettingsAt('ai', aiAnchor)
}

/** Einzelschalter der Befugnis-Zeile. Nicht verfügbare Schalter nennen den nächsten Schritt. */
function PermToggle({ label, state, reason, reasonId, disabled, onToggle, onSetup }: {
  label: string
  state: PermState
  reason?: string
  reasonId?: string
  disabled: boolean
  onToggle: () => void
  onSetup: () => void
}) {
  const { t } = useTranslation()
  if (state === 'modOff' || state === 'setup') {
    return (
      <button type="button" className="agent-card-perm is-setup" onClick={onSetup} disabled={disabled}>
        {label} · {t(state === 'modOff' ? 'agentCard.permModuleOff' : 'agentCard.permNotSetup')}
        <span className="agent-card-link">{t(state === 'modOff' ? 'agentCard.permEnable' : 'agentCard.permSetup')}</span>
      </button>
    )
  }
  const on = state === 'on'
  return (
    <button
      type="button"
      className={`agent-card-perm ${on ? 'is-on' : ''} ${state === 'locked' ? 'is-locked' : ''}`}
      onClick={state === 'locked' ? undefined : onToggle}
      disabled={disabled}
      aria-pressed={on}
      aria-disabled={state === 'locked'}
      title={state === 'locked' ? reason : undefined}
      aria-describedby={state === 'locked' ? reasonId : undefined}
    >
      <span className="agent-card-switch" aria-hidden="true"><span /></span>
      {label}
    </button>
  )
}

export function AgentView({ tabId }: Props) {
  const { t, language } = useTranslation()
  const en = language === 'en'
  const vaultPath = useNotesStore(s => s.vaultPath)
  const ollama = useUIStore(s => s.ollama)
  const customLogo = useUIStore(s => s.customLogo)
  const webResearchModule = useIsModuleEnabled('web-research')
  const shellModule = useIsModuleEnabled('agent-shell')
  const computerModule = useIsModuleEnabled('agent-computer')
  const imageModule = useIsModuleEnabled('image-generation')
  const computerSettings = useUIStore(s => s.agentComputer) ?? DEFAULT_COMPUTER_CONTROL
  const shellNetwork = useUIStore(s => s.agentShell?.network === true)
  const webResearchConfig = useUIStore(s => s.webResearchConfig)
  const setWebResearchConfig = useUIStore(s => s.setWebResearchConfig)

  const scope = useNoteAgentStore(s => s.scopes[tabId] ?? EMPTY_AGENT_SCOPE)
  const run = scope.run

  // Auftragsentwurf und gewähltes Beispiel liegen im Store (überleben den Tab-Wechsel).
  // Solange der Text dem Beispiel entspricht, gelten dessen Voraussetzungen; wer
  // umschreibt, formuliert einen eigenen Auftrag.
  const instruction = scope.draft ?? ''
  const setInstruction = (text: string) => useNoteAgentStore.getState().setDraft(tabId, text)
  const pickedExample = scope.pickedExample ?? null
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [models, setModels] = useState<Array<{ name: string }>>([])
  // Modellwahl und Web-Schalter liegen im Scope (überleben den Tab-Wechsel, wie der Entwurf).
  const prefs = scope.prefs ?? {}
  const setPrefs = (patch: Parameters<ReturnType<typeof useNoteAgentStore.getState>['setPrefs']>[1]) =>
    useNoteAgentStore.getState().setPrefs(tabId, patch)
  const localModel = prefs.localModel ?? ''
  const setLocalModel = (v: string) => setPrefs({ localModel: v })
  const webArmed = prefs.webArmed ?? false
  const setWebArmed = (v: boolean) => setPrefs({ webArmed: v })
  const [shellArmed, setShellArmed] = useState(false)
  const [computerArmed, setComputerArmed] = useState(false)
  const [starting, setStarting] = useState(false)
  useOnChange([vaultPath, shellModule], () => setShellArmed(false))
  useOnChange([vaultPath, computerModule], () => setComputerArmed(false))
  useOnChange([vaultPath, webResearchModule], () => setWebArmed(false))

  // Cloud-Routing: hier zählt ausschließlich das 'note-agent'-Opt-in — der Tab kann
  // nichts anderes als Agent-Läufe starten.
  const agentRoutes = useMemo(() => cloudRoutesForFeature('note-agent', ollama), [ollama])
  const cloudProvider = prefs.cloudProvider ?? null
  const setCloudProvider = (v: CloudProviderId | null) => setPrefs({ cloudProvider: v })
  const activeCloudRoute = cloudProvider ? (agentRoutes.find(r => r.provider === cloudProvider) ?? null) : null

  // Modell-Präzedenz wie in der Macher-Leiste (CLAUDE.md): Auswahl im Tab →
  // Modul-Override → globales Modell.
  const effectiveModel = localModel || ollama.moduleModelOverrides?.['note-agent'] || ollama.selectedModel
  const pickerValue = activeCloudRoute ? activeCloudRoute.sentinel : effectiveModel
  // Ollama-Modelle mit Cloud-Anteil (`…:cloud`) erkennt die App nur am Namen — sie
  // bekommen das Cloud-Etikett, nicht das Rechner-Etikett.
  // LM Studio kennt keine Ollama-Cloud — dort sagt ein Suffix nichts über den Weg.
  const ollamaCloudModel = !activeCloudRoute && ollama.backend !== 'lm-studio' && isCloudModel(effectiveModel)
  const runtimeLabel = ollama.backend === 'lm-studio' ? 'LM Studio' : 'Ollama'

  // Modellweg aus dem Main (Codex F15/F26): lokal nur nach Prüfung der Ollama-Metadaten,
  // Cloud auch bei neutral benannten Modellen mit remote_host, LM Studio „nicht geprüft“.
  // Bis die Antwort da ist, gilt nur die Namensregel als vorläufiger Hinweis.
  const consentVersion = useUIStore(s => s.noteAgentCloudConsentVersion)
  const setConsentVersion = useUIStore(s => s.setNoteAgentCloudConsentVersion)
  const routeKey = `${ollama.backend}|${effectiveModel}|${activeCloudRoute ? `${activeCloudRoute.provider}:${activeCloudRoute.model}` : ''}`
  type Preflight = { key: string; route?: AgentRoute; gate?: { ok: true } | { ok: false; code: 'optin' | 'consent'; error: string } }
  const [preflight, setPreflight] = useState<Preflight | null>(null)
  const preflightReq = useRef(0)
  const runPreflight = useCallback(() => {
    const req = ++preflightReq.current
    if (!effectiveModel && !activeCloudRoute) { setPreflight(null); return }
    setPreflight(p => (p && p.key === routeKey ? p : null))
    window.electronAPI.noteAgentRoutePreflight({
      model: effectiveModel,
      localBackend: ollama.backend === 'lm-studio' ? 'lmstudio' : 'ollama',
      cloud: activeCloudRoute ? { model: activeCloudRoute.model, provider: activeCloudRoute.provider } : null
    }).then(r => {
      if (req === preflightReq.current && r.success) setPreflight({ key: routeKey, route: r.route, gate: r.gate })
    }).catch(() => { /* bleibt „wird geprüft“ */ })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey, consentVersion])
  useEffect(() => { runPreflight() }, [runPreflight])
  useEffect(() => {
    window.addEventListener('focus', runPreflight)
    window.addEventListener('mindgraph:settingsClosed', runPreflight)
    return () => {
      window.removeEventListener('focus', runPreflight)
      window.removeEventListener('mindgraph:settingsClosed', runPreflight)
    }
  }, [runPreflight])
  const preRoute = preflight?.key === routeKey ? preflight.route : undefined
  const preGate = preflight?.key === routeKey ? preflight.gate : undefined
  const cloudSelected = preRoute ? preRoute.kind === 'cloud' : (!!activeCloudRoute || ollamaCloudModel)
  const cloudProviderLabel = preRoute?.providerLabel ?? (activeCloudRoute ? CLOUD_PROVIDER_META[activeCloudRoute.provider].label : 'ollama.com')

  // Die Liste gehört zu genau einem Backend (Ollama bzw. LM Studio + Port). Wechselt es,
  // wird neu geladen und die Tab-Auswahl verworfen — sonst setzt „Lokales Modell wählen“
  // ein Modell, das es im aktiven Programm nicht gibt (Codex F15).
  const modelsSource = `${ollama.backend}:${ollama.lmStudioPort}`
  const [loadedSource, setLoadedSource] = useState('')
  // Ladefehler ist nicht „keine Modelle“: gemerkt, angezeigt, bei Fensterfokus neu versucht.
  const [modelsFailed, setModelsFailed] = useState(false)
  const [modelsRetry, setModelsRetry] = useState(0)
  const modelsLoaded = loadedSource === modelsSource
  // Die Auswahl nur verwerfen, wenn das Backend WIRKLICH gewechselt hat — nicht beim
  // Neu-Einhängen der Ansicht (dann ist die Liste nur leer, die Wahl gilt weiter).
  const prevSource = useRef<string | null>(null)
  useEffect(() => {
    if (!ollama.enabled || modelsLoaded) return
    let cancelled = false
    setModels([])
    if (prevSource.current && prevSource.current !== modelsSource) setLocalModel('')
    prevSource.current = modelsSource
    setModelsFailed(false)
    ;(async () => {
      try {
        const list = ollama.backend === 'lm-studio'
          ? await window.electronAPI.lmstudioModels(ollama.lmStudioPort)
          : await window.electronAPI.ollamaModels()
        if (cancelled) return
        if (Array.isArray(list)) { setModels(list); setLoadedSource(modelsSource); setModelsFailed(false); setNoLocalModel(n => (n === 'notLoaded' ? false : n)) }
        else setModelsFailed(true)
      } catch (e) {
        console.error('[Agent-Tab] Modell-Liste laden fehlgeschlagen:', e)
        if (!cancelled) setModelsFailed(true)
      }
    })()
    return () => { cancelled = true }
  }, [ollama.enabled, ollama.backend, ollama.lmStudioPort, modelsSource, modelsLoaded, modelsRetry])
  useEffect(() => {
    if (!modelsFailed) return
    const retry = () => setModelsRetry(n => n + 1)
    window.addEventListener('focus', retry)
    return () => window.removeEventListener('focus', retry)
  }, [modelsFailed])

  useEffect(() => {
    if (webResearchModule && !webResearchConfig) {
      window.electronAPI.webResearchLoadConfig()
        .then(c => setWebResearchConfig({ provider: c.provider, searxngUrl: c.searxngUrl, hasTavilyKey: c.hasTavilyKey, hasLinkupKey: c.hasLinkupKey }))
        .catch(() => { /* ignorieren */ })
    }
  }, [webResearchModule, webResearchConfig, setWebResearchConfig])

  const webConfigured = !!webResearchConfig && (
    webResearchConfig.provider === 'tavily' ? webResearchConfig.hasTavilyKey :
    webResearchConfig.provider === 'linkup' ? webResearchConfig.hasLinkupKey :
    isWebResearchConfigComplete({ provider: 'searxng', searxngUrl: webResearchConfig.searxngUrl })
  )
  const webProviderLabel = webResearchConfig ? WEB_SEARCH_PROVIDER_META[webResearchConfig.provider].label : ''

  // Bilder: nur „möglich“, wenn Modul an UND Schlüssel hinterlegt — dieselbe Bedingung
  // wie beim Laufstart im Main. Der Schlüssel selbst kommt nie in den Renderer.
  const [imageKey, setImageKey] = useState<'yes' | 'no' | 'unknown' | 'checking'>('no')
  const imageReq = useRef(0)
  // `recheck`: nach dem Schließen der Einstellungen (dort wird der Schlüssel geändert)
  // gilt die alte Zusage nicht mehr, bis die neue Antwort da ist.
  const refreshImageKey = useCallback((recheck = false) => {
    const req = ++imageReq.current
    if (!imageModule) { setImageKey('no'); return }
    if (recheck) setImageKey('checking')
    // Ladefehler heißt „unbekannt“ — weder die alte Zusage noch „kein Schlüssel“.
    window.electronAPI.imageGenHasKey()
      .then(v => { if (req === imageReq.current) setImageKey(v ? 'yes' : 'no') })
      .catch(() => { if (req === imageReq.current) setImageKey('unknown') })
  }, [imageModule])
  const imagesPossible = imageModule && imageKey === 'yes'
  const imagesUnknown = imageModule && imageKey === 'unknown'
  const imagesChecking = imageModule && imageKey === 'checking'

  // Gedächtnis: leer / gefüllt / wird gekürzt. Neu lesen nach jedem Lauf — „Merken“
  // schreibt in genau diese Notiz.
  type MemoryState = 'empty' | 'filled' | 'long' | 'checking' | 'unknown'
  const [memory, setMemory] = useState<{ state: MemoryState; relPath: string; vault: string }>({ state: 'checking', relPath: '', vault: '' })
  const memoryReq = useRef(0)
  const refreshMemory = useCallback(() => {
    const req = ++memoryReq.current
    if (!vaultPath) { setMemory({ state: 'empty', relPath: '', vault: '' }); return }
    // Anderer Vault: sofort „wird geprüft“ statt des alten Stands. Nur die jüngste
    // Antwort zählt, ein Fehler heißt „unbekannt“, nie die alte Zusage.
    setMemory(m => (m.vault === vaultPath ? m : { state: 'checking', relPath: '', vault: vaultPath }))
    window.electronAPI.noteAgentMemoryStatus(vaultPath)
      .then(m => { if (req === memoryReq.current) setMemory({ ...m, vault: vaultPath }) })
      .catch(() => { if (req === memoryReq.current) setMemory({ state: 'unknown', relPath: '', vault: vaultPath }) })
  }, [vaultPath])
  useEffect(() => { refreshMemory() }, [refreshMemory, run.phase])
  useEffect(() => { refreshImageKey() }, [refreshImageKey, run.phase])
  // Gedächtnis-Anzeige nur für den aktuellen Vault — auch im ersten Render nach einem
  // Wechsel, bevor der Effekt „wird geprüft“ setzt (Codex F18).
  const memoryState: MemoryState = memory.vault === (vaultPath ?? '') ? memory.state : 'checking'
  useEffect(() => {
    const onFocus = () => { refreshMemory(); refreshImageKey() }
    const onSettingsClosed = () => { refreshMemory(); refreshImageKey(true) }
    const onImageKeyChanged = () => refreshImageKey(true)
    window.addEventListener('focus', onFocus)
    window.addEventListener('mindgraph:settingsClosed', onSettingsClosed)
    window.addEventListener('mindgraph:imageKeyChanged', onImageKeyChanged)
    return () => {
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('mindgraph:settingsClosed', onSettingsClosed)
      window.removeEventListener('mindgraph:imageKeyChanged', onImageKeyChanged)
    }
  }, [refreshMemory, refreshImageKey])
  const openMemoryNote = async () => {
    const vp = useNotesStore.getState().vaultPath
    if (!vp || !memory.relPath || memory.vault !== vp) return
    try {
      let note = useNotesStore.getState().getNoteByPath(memory.relPath)
      if (!note) {
        const abs = `${vp}/${memory.relPath}`
        const content = await window.electronAPI.readFile(abs)
        note = await createNoteFromFile(abs, memory.relPath, content)
        useNotesStore.getState().addNote(note)
      }
      useNotesStore.getState().selectNote(note.id)
    } catch (e) {
      console.warn('[Agent-Tab] Gedächtnis-Notiz konnte nicht geöffnet werden:', e)
    }
  }

  // Zielordner-Picker
  const vaultEntries = useContextVaultFiles()
  const [targetPickerOpen, setTargetPickerOpen] = useState(false)
  const [targetQuery, setTargetQuery] = useState('')
  const targetWrapRef = useRef<HTMLDivElement>(null)
  const [targetLayout, setTargetLayout] = useState<PickerLayout>({ placement: 'below', maxHeight: 300 })
  const targetMatches = useMemo(() => {
    const q = targetQuery.trim().toLowerCase()
    const folders = vaultEntries.filter(f => f.isFolder)
    const pool = q ? folders.filter(f => f.name.toLowerCase().includes(q) || f.relPath.toLowerCase().includes(q)) : folders
    return pool.slice(0, 8)
  }, [targetQuery, vaultEntries])
  const closeTargetPicker = () => {
    setTargetPickerOpen(false)
    setTargetQuery('')
  }
  const openTargetPicker = () => {
    setTargetLayout(measurePlacement(targetWrapRef.current))
    setTargetPickerOpen(true)
  }

  const store = useNoteAgentStore.getState
  // Aktive Zeit am Auftrag: läuft ab dem ersten Tastendruck, pausiert, sobald das
  // Fenster in den Hintergrund geht. Grundlage der Wirkungsbilanz.
  const compose = useComposeMeasurement(tabId)
  // Läuft eine Vergleichskampagne und ist ein Fall zugerechnet, wandern die gemessenen
  // Zeiten dieses Laufs zusätzlich als Arbeitssitzungen in den Fall.
  const comparisonCaseId = useComparisonStore(s => s.activeCaseId)
  const busy = run.phase === 'running' || starting
  const hasTask = !!instruction.trim()
  const hasTarget = !!scope.targetFolder

  // Befugnisse: Web schließt Shell und Rechner aus (Main sperrt die Kombination),
  // Shell + Rechner sind kombinierbar.
  // Anzeige UND Start lesen denselben wirksamen Zustand: ein angefragter Schalter zählt
  // nur, solange Modul, Einrichtung und Plattform ihn tragen (Codex F02).
  const computerVerbs = activeComputerVerbs(computerSettings)
  // Fällt die Einrichtung weg, verfällt auch die Anfrage — kommt sie zurück, braucht es
  // einen neuen, bewussten Klick (Codex F12). Bei Web erst, wenn die Konfiguration
  // geladen ist: vorher ist „nicht eingerichtet“ nur „noch nicht gelesen“.
  useEffect(() => { if (webResearchConfig && !webConfigured) setWebArmed(false) }, [webResearchConfig, webConfigured])
  useEffect(() => { if (computerVerbs.length === 0) setComputerArmed(false) }, [computerVerbs.length])
  const webOn = webArmed && webResearchModule && webConfigured
  const shellOn = shellArmed && shellModule && HAS_MAC_TOOLS
  const computerOn = computerArmed && computerModule && computerVerbs.length > 0 && HAS_MAC_TOOLS
  const webState: PermState = !webResearchModule ? 'modOff' : !webConfigured ? 'setup'
    : webOn ? 'on' : (shellOn || computerOn) ? 'locked' : 'off'
  const shellState: PermState = !shellModule ? 'modOff' : shellOn ? 'on' : webOn ? 'locked' : 'off'
  const computerState: PermState = !computerModule ? 'modOff' : computerVerbs.length === 0 ? 'setup'
    : computerOn ? 'on' : webOn ? 'locked' : 'off'
  const webLockedBy = [shellOn ? t('aiBar.shell.label') : '', computerOn ? t('aiBar.computer.label') : ''].filter(Boolean).join(' / ')
  // Während ein Lauf arbeitet, zeigt die Karte SEINE Einstellungen — nicht die für den
  // nächsten Lauf. Sonst steht neben „Agent arbeitet“ ein anderes Modell und Web aus.
  const running = run.phase === 'running'
  const runWeb = !!run.webResearch, runShell = !!run.shellAccess, runComputer = !!run.computerAccess
  const shownWebState: PermState = running ? (runWeb ? 'on' : 'off') : webState
  const shownShellState: PermState = running ? (runShell ? 'on' : 'off') : shellState
  const shownComputerState: PermState = running ? (runComputer ? 'on' : 'off') : computerState
  const actsNow = running ? runShell || runComputer : shellOn || computerOn
  const allOff = running ? !runWeb && !runShell && !runComputer : !webOn && !shellOn && !computerOn
  const lockedReason = webState === 'locked'
    ? t('agentCard.permLocked', { a: webLockedBy, b: t('aiBar.web.label') })
    : (shellState === 'locked' || computerState === 'locked')
      ? t('agentCard.permLocked', { a: t('aiBar.web.label'), b: [shellState === 'locked' ? t('aiBar.shell.label') : '', computerState === 'locked' ? t('aiBar.computer.label') : ''].filter(Boolean).join(' / ') })
      : ''
  const lockedReasonId = `agent-card-locked-${tabId}`

  // Voraussetzungen des gewählten Beispiels — gelten nur, solange sein Text unverändert ist.
  const exampleNeed: AgentExampleNeed = pickedExample && pickedExample.text === instruction ? pickedExample.need : 'none'
  const hasFolder = scope.attachments.some(a => a.kind === 'folder')
  // Als Angebot zählen nur PDF und Word; ein Ordner wird zugelassen, sein Inhalt aber nicht geprüft.
  const offerCount = scope.attachments.filter(a => a.kind === 'pdf' || a.kind === 'docx').length
  const docsMissing = (exampleNeed === 'folder' && !hasFolder) || (exampleNeed === 'files2' && !hasFolder && offerCount < 2)
  const docsHint: TranslationKey = exampleNeed === 'folder' ? 'agentCard.docsNeededFolder' : 'agentCard.docsNeededFiles'
  const webMissing = exampleNeed === 'web' && !webOn
  const webHint: TranslationKey = webState === 'modOff' ? 'agentCard.webNeededModule' : webState === 'setup' ? 'agentCard.webNeededSetup' : 'agentCard.webNeeded'
  const webButton: TranslationKey = webState === 'modOff' ? 'agentCard.btnWebModule' : webState === 'setup' ? 'agentCard.btnWebSetup' : 'agentCard.btnWeb'
  // Offene Ergebnis-Karten zuerst entscheiden: ein neuer Lauf ersetzt die Karten, die
  // Dateien blieben ohne Knopf zum Übernehmen im Zwischenspeicher (Codex F35).
  const resultsPending = run.phase === 'review' && run.results.some(r => r.state === 'pending')
  const gateBlock = preGate && !preGate.ok ? preGate.code : scope.startGate?.code ?? null
  const canRun = !!vaultPath && hasTarget && hasTask && !docsMissing && !webMissing && !resultsPending && !gateBlock && !busy

  const submit = async () => {
    if (!canRun || !vaultPath) return
    let cloud: { model: string; provider: CloudProviderId } | null = null
    let cloudLabel: string | null = null
    if (activeCloudRoute) {
      cloud = { model: activeCloudRoute.model, provider: activeCloudRoute.provider }
      cloudLabel = activeCloudRoute.label
    }
    setStarting(true)
    const shellAccess = shellOn
    const computerAccess = computerOn
    setShellArmed(false)
    setComputerArmed(false)
    try { await store().startRun(tabId, {
      vaultPath,
      // Der Lauf hat keine Ausgangsnotiz — die Tab-ID ist die Kennung, der Inhalt leer.
      noteId: tabId,
      noteContent: '',
      instruction: instruction.trim(),
      model: effectiveModel,
      localBackend: ollama.backend === 'lm-studio' ? 'lmstudio' : 'ollama',
      lmStudioPort: ollama.lmStudioPort,
      cloud,
      cloudLabel,
      webResearch: webOn,
      shellAccess,
      computerAccess,
      instructionMs: compose.take(),
      comparisonCaseId: comparisonCaseId ?? undefined
    }) } finally { setStarting(false) }
  }

  // Wechselt nur, wenn es wirklich ein Modell ohne Cloud-Kennung gibt — sonst sagt die
  // Karte das, statt still bei der Cloud zu bleiben (Codex F04).
  const [noLocalModel, setNoLocalModel] = useState<false | 'none' | 'notLoaded'>(false)
  useEffect(() => { if (!cloudSelected) setNoLocalModel(false) }, [cloudSelected])
  const pickLocalModel = () => {
    // Nur Modelle, die das aktive Backend gerade meldet — ein Override, den es dort
    // nicht gibt, ist kein Ziel.
    const available = new Set(models.map(m => m.name))
    const firstLocal = models.find(m => !isCloudModel(m.name))
    const current = localModel || ollama.moduleModelOverrides?.['note-agent'] || ollama.selectedModel
    const currentUsable = !!current && !isCloudModel(current) && available.has(current)
    if (!modelsLoaded) { setNoLocalModel('notLoaded'); setModelsRetry(n => n + 1); return }
    if (!currentUsable && !firstLocal) { setNoLocalModel('none'); return }
    setCloudProvider(null)
    if (!currentUsable && firstLocal) setLocalModel(firstLocal.name)
  }

  if (!ollama.enabled) {
    return (
      <div className="agent-view">
        <div className="agent-view-inner">
          <div className="agent-view-empty">{t('agentTab.aiDisabled')}</div>
        </div>
      </div>
    )
  }

  // Startknopf: erste Lücke in fester Reihenfolge — Auftrag, dann Zielordner.
  const buttonLabel = busy ? t('aiBar.agent.working')
    : !vaultPath ? t('agentCard.btnNoVault')
    : resultsPending ? t('agentCard.btnPending')
    : gateBlock === 'consent' ? t('agentCard.btnConsent')
    : gateBlock === 'optin' ? t('agentCard.btnOptin')
    : !hasTask ? t('agentCard.btnTask')
    : docsMissing ? t('agentCard.btnDocs')
    : webMissing ? t(webButton)
    : !hasTarget ? t('agentCard.btnTarget')
    : t('agentCard.btnStart')

  const ops: string[] = []
  if (shellOn) ops.push(t('agentCard.opShell'))
  if (computerOn) {
    ops.push(t('agentCard.opComputer', { verbs: computerVerbs.map(v => computerVerbLabel(v, en ? 'en' : 'de')).join(', ') }))
    ops.push(t('agentCard.opComputerNote'))
    if (computerVerbs.includes('mail_draft')) ops.push(t('agentCard.opMailDraft'))
  }

  return (
    <div className="agent-view">
      <div className="agent-view-inner">
        <div className="agent-card-head">
          <span className="agent-card-logo" aria-hidden="true">
            {customLogo
              ? <img src={customLogo} width="30" height="30" alt="" />
              : <MindGraphLogo size={30} />}
          </span>
          <div className="agent-card-head-text">
            <h2 className="agent-view-title">{t('agentTab.title')}</h2>
            <p className="agent-card-tagline">{t('agentCard.tagline')}</p>
          </div>
        </div>

        <div className="agent-card">
          {/* Auftrag */}
          <div className={`agent-card-task ${hasTask ? '' : 'is-missing'}`}>
            <div className="agent-card-task-top">
              <textarea
                ref={inputRef}
                className="agent-card-input"
                placeholder={t('agentCard.inputPlaceholder')}
                aria-label={t('agentCard.inputLabel')}
                value={instruction}
                onChange={e => { compose.noteTyping(); setInstruction(e.target.value) }}
                rows={3}
                disabled={busy}
                onKeyDown={e => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void submit() }
                }}
              />
              {!hasTask && <span className="agent-card-flag">&#9679; {t('agentCard.taskMissing')}</span>}
            </div>
            <span className="agent-card-help">{t('agentCard.inputHelp')}</span>
          </div>

          {/* Beispiele nur im leeren Zustand: ein Klick füllt den Text, Unterlagen hängt
              der Nutzer selbst an — ein Beispiel kennt seine Dateien nicht. */}
          {!hasTask && !busy && (
            <div className="agent-card-examples">
              <span className="agent-card-eyebrow">{t('agentCard.examplesTitle')}</span>
              <div className="agent-card-examples-grid">
                {EXAMPLES.map(ex => (
                  <button
                    key={ex.text}
                    type="button"
                    className="agent-card-example"
                    onClick={() => {
                      compose.noteTyping()
                      setInstruction(t(ex.text))
                      useNoteAgentStore.getState().setPickedExample(tabId, { text: t(ex.text), need: ex.need })
                      inputRef.current?.focus()
                    }}
                  >
                    <span className="agent-card-example-cat">{t(ex.cat)}</span>
                    <span className="agent-card-example-text">{t(ex.text)}</span>
                    <span className="agent-card-example-tags">
                      <span className="agent-card-tag">{t('agentCard.exDocs', { x: t(ex.docs) })}</span>
                      <span className="agent-card-tag is-accent">{t('agentCard.exResult', { x: t(ex.result) })}</span>
                      {ex.need === 'web' && <span className="agent-card-tag is-out">{t('agentCard.exNeedsWeb')}</span>}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Unterlagen */}
          <div className={`agent-card-row ${docsMissing ? 'is-missing' : ''}`}>
            <span className="agent-card-label">{t('agentCard.rowDocs')}{docsMissing && <> &#9679;</>}</span>
            <div className="agent-card-value">
              <ContextAttachmentRow
                attachments={scope.attachments}
                onAttachDialog={() => void store().attachFromDialog(tabId)}
                onAttachFolderDialog={() => void store().attachFolderFromDialog(tabId)}
                onAttachVaultFile={rel => { if (vaultPath) void store().attachVaultPath(tabId, vaultPath, rel) }}
                onDetach={id => void store().detach(tabId, id)}
                disabled={busy}
                attachError={scope.attachError}
                cloudSelected={false}
              />
              {docsMissing && <span className="agent-card-missing-title">{t(docsHint)}</span>}
              {!docsMissing && scope.attachments.length === 0 && <span className="agent-card-muted">{t('agentCard.docsEmpty')}</span>}
              <span className="agent-card-help">{t('agentCard.docsHelp')}</span>
            </div>
          </div>

          {/* Ablage — kein automatischer Vorschlag: der Zielordner ist die Ablage, nicht
              die Datenquelle (Codex F11). */}
          <div className={`agent-card-row ${hasTarget ? '' : 'is-missing'}`}>
            <span className="agent-card-label">
              {t('agentCard.rowTarget')}{!hasTarget && <> &#9679;</>}
            </span>
            <div className="agent-card-value">
              {hasTarget ? (
                (() => {
                  const p = splitTargetPath(scope.targetFolder ?? '')
                  return (
                    <span className="agent-card-target" title={scope.targetFolder ?? ''}>
                      <FolderGlyph size={13} />
                      <span className="agent-card-target-name">{p.name}</span>
                      {p.parent && <span className="agent-card-target-parent">in {p.deeper ? '… / ' : ''}{p.parent}</span>}
                    </span>
                  )
                })()
              ) : (
                <>
                  <span className="agent-card-missing-title">{t('agentCard.targetMissing')}</span>
                  <span className="agent-card-help">{t('agentCard.targetHelp')}</span>
                </>
              )}
            </div>
            <div className="ai-bar-context-picker-wrap" ref={targetWrapRef}>
              <button
                type="button"
                className={hasTarget ? 'agent-card-link-btn' : 'agent-card-btn'}
                onClick={() => (targetPickerOpen ? closeTargetPicker() : openTargetPicker())}
                disabled={busy}
                aria-expanded={targetPickerOpen}
              >
                {hasTarget ? t('agentCard.targetChange') : <><FolderGlyph /> {t('agentCard.targetPick')}</>}
              </button>
              {targetPickerOpen && (
                <div
                  className={`ai-bar-context-picker agent-card-picker ${targetLayout.placement === 'below' ? 'is-below' : ''}`}
                  style={{ ['--picker-max-height' as string]: `${targetLayout.maxHeight}px` }}
                >
                  <input
                    autoFocus
                    className="ai-bar-context-search"
                    placeholder={t('aiBar.target.searchPlaceholder')}
                    value={targetQuery}
                    onChange={e => setTargetQuery(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); closeTargetPicker() } }}
                  />
                  <div className="ai-bar-context-results">
                    {targetMatches.map(f => (
                      <button
                        key={f.relPath}
                        type="button"
                        className="ai-bar-context-result"
                        onClick={() => { store().setTargetFolder(tabId, f.relPath); closeTargetPicker() }}
                        title={f.relPath}
                      >
                        <span className="ai-bar-context-result-name">{f.name}</span>
                        <span className="ai-bar-context-result-path">{f.relPath}</span>
                      </button>
                    ))}
                    {targetMatches.length === 0 && (
                      <div className="ai-bar-context-empty">{t('aiBar.context.noResults')}</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Befugnisse */}
          <div className={`agent-card-row is-two-col ${webMissing ? 'is-missing' : ''}`}>
            <span className="agent-card-label">{t('agentCard.rowPerms')}{webMissing && <> &#9679;</>}</span>
            <div className="agent-card-value">
              <div className="agent-card-perms">
                <PermToggle
                  label={t('aiBar.web.label')}
                  state={shownWebState}
                  reason={lockedReason}
                  reasonId={lockedReasonId}
                  disabled={busy}
                  onToggle={() => { setWebArmed(!webArmed); setShellArmed(false); setComputerArmed(false) }}
                  onSetup={() => openPermSetup(webState, 'web-research', 'ai-webresearch')}
                />
                {HAS_MAC_TOOLS && (
                  <>
                    <PermToggle
                      label={t('aiBar.shell.label')}
                      state={shownShellState}
                      reason={lockedReason}
                      reasonId={lockedReasonId}
                      disabled={busy}
                      onToggle={() => { setShellArmed(v => !v); setWebArmed(false) }}
                      onSetup={() => openPermSetup(shellState, 'agent-shell', 'ai-agentshell')}
                    />
                    <PermToggle
                      label={t('aiBar.computer.label')}
                      state={shownComputerState}
                      reason={lockedReason}
                      reasonId={lockedReasonId}
                      disabled={busy}
                      onToggle={() => { setComputerArmed(v => !v); setWebArmed(false) }}
                      onSetup={() => openPermSetup(computerState, 'agent-computer', 'ai-agentcomputer')}
                    />
                  </>
                )}
              </div>
              {webMissing && <span className="agent-card-missing-title">{t(webHint)}</span>}
              {lockedReason && <span id={lockedReasonId} className="agent-card-muted">{lockedReason}</span>}
              {allOff && (
                <span className="agent-card-muted">
                  {HAS_MAC_TOOLS ? t('agentCard.allOff') : t('agentCard.allOffNoMac')}
                </span>
              )}
              {actsNow && (
                <div className="agent-card-acts">
                  <span className="agent-card-acts-title">{t('agentCard.actsNow')}</span>
                  {ops.map(o => <span key={o}>{o}</span>)}
                  <span>{t('agentCard.askAtStart')}</span>
                </div>
              )}
            </div>
          </div>

          {/* Modell + Datenwege nach Weg, nicht nach Hersteller. Vor dem Lauf zeigt die Karte die
              Vorabprüfung, während des Laufs ausschließlich den beim Start gespeicherten Befund. */}
          <div className="agent-card-row is-two-col">
            <span className="agent-card-label">{t('agentCard.rowModel')}</span>
            <div className="agent-card-value">
              {running
                ? <span className="agent-card-running-model">{run.model}</span>
                : (
                  <ModelPicker
                    value={pickerValue}
                    models={[...agentRoutes.map(r => ({ name: r.sentinel })), ...models]}
                    onChange={name => {
                      const provider = cloudProviderForSentinel(name)
                      if (provider) setCloudProvider(provider)
                      else { setCloudProvider(null); setLocalModel(name) }
                    }}
                    getLabel={name => agentRoutes.find(r => r.sentinel === name)?.label ?? name}
                    ariaLabel={t('aiBar.model')}
                    disabled={busy}
                    maxWidth={360}
                  />
                )}
              {!running && modelsFailed && <span className="agent-card-help">{t('agentCard.modelsNotLoaded')}</span>}
              {(() => {
                const route = running ? run.route : preRoute
                const webShown = running ? runWeb : webOn
                return (
                  <>
                    <div className="agent-card-tags">
                      {!route
                        ? <span className="agent-card-route is-muted">{t('agentCard.routeChecking')}</span>
                        : route.kind === 'local'
                          ? <span className="agent-card-route">{t('agentCard.routeVerified', { runtime: route.providerLabel })}</span>
                          : route.kind === 'cloud'
                            ? <span className="agent-card-route is-out">{t('agentCard.routeCloud', { provider: route.providerLabel })}</span>
                            : <span className="agent-card-route is-muted">{route.provider === 'lmstudio' ? t('agentCard.routeLmStudio') : t('agentCard.routeLocal', { runtime: route.providerLabel })}</span>}
                      {webShown && webProviderLabel && (
                        <span className="agent-card-route is-out">{t('agentCard.routeWeb', { provider: webProviderLabel })}</span>
                      )}
                    </div>
                    {route?.kind === 'cloud' && (
                      <div className="agent-card-cloud-note">
                        <span>{t('agentCard.cloudShort', { provider: route.providerLabel })}</span>
                        {!running && (
                          <button type="button" className="agent-card-link-btn is-strong" onClick={pickLocalModel} disabled={busy}>
                            {t('agentCard.pickLocal')}
                          </button>
                        )}
                        {!running && noLocalModel && <span className="agent-card-no-local">{t(noLocalModel === 'notLoaded' ? 'agentCard.modelsNotLoaded' : 'agentCard.noLocalModel')}</span>}
                      </div>
                    )}
                    {route?.kind === 'unverified' && <span className="agent-card-help">{t('agentCard.unverifiedShort')}</span>}
                    {!running && gateBlock === 'consent' && route?.kind === 'cloud' && (
                      <div className="agent-card-consent">
                        <strong>{t('agentCard.consentTitle')}</strong>
                        <span>{t('agentCard.consentBody', { provider: route.providerLabel })}</span>
                        <button
                          type="button"
                          className="agent-card-btn"
                          onClick={async () => {
                            setConsentVersion(NOTE_AGENT_CLOUD_CONSENT_VERSION)
                            useNoteAgentStore.setState(st => {
                              const sc = st.scopes[tabId]
                              return sc ? { scopes: { ...st.scopes, [tabId]: { ...sc, startGate: null } } } : {}
                            })
                            // Der Main liest die Zustimmung aus ui-settings.json — erst schreiben, dann neu prüfen.
                            await flushUISettings()
                            runPreflight()
                          }}
                        >
                          {t('agentCard.consentButton')}
                        </button>
                      </div>
                    )}
                    {!running && gateBlock === 'optin' && (
                      <div className="agent-card-consent">
                        <span>{t('agentCard.optinMissing', { provider: route?.providerLabel ?? cloudProviderLabel })}</span>
                        <button type="button" className="agent-card-link-btn is-strong" onClick={() => openSettingsAt('ai', 'ai-openrouter')}>
                          {t('agentCard.optinLink')}
                        </button>
                      </div>
                    )}
                    {/* Welche Daten wohin gehen — nach Empfänger, nur die in diesem Lauf möglichen
                        Wege (Codex F23–F25, F29–F31). Standardmäßig zu; die Kurzzeile oben bleibt. */}
                    <details className="agent-card-flows">
                      <summary>{t('agentCard.flowsTitle')}</summary>
                      <dl>
                        <dt>{t(
                          !route || route.kind === 'unverified' ? 'agentCard.flowModelUnverified'
                          : route.kind === 'cloud' ? 'agentCard.flowModelCloud' : 'agentCard.flowModelLocal',
                          { provider: route?.providerLabel ?? runtimeLabel }
                        )}</dt>
                        <dd>{t('agentCard.flowModelBody')}</dd>
                        {webShown && (<>
                          <dt>{t('agentCard.flowWebHead')}</dt>
                          <dd>{t('agentCard.flowWebBody', { provider: webProviderLabel || '—' })}</dd>
                        </>)}
                        {imagesPossible && (<>
                          <dt>{t('agentCard.flowImagesHead')}</dt>
                          <dd>{t('agentCard.flowImagesBody')}</dd>
                        </>)}
                        {(running ? runShell : shellOn) && (<>
                          <dt>{t('agentCard.flowShellHead')}</dt>
                          <dd>{t(shellNetwork ? 'agentCard.flowShellNet' : 'agentCard.flowShellNoNet')}</dd>
                        </>)}
                        {(running ? runComputer : computerOn) && computerVerbs.includes('mail_draft') && (<>
                          <dt>{t('agentCard.flowMailHead')}</dt>
                          <dd>{t('agentCard.flowMailBody')}</dd>
                        </>)}
                        <dt>{t('agentCard.flowLocalHead')}</dt>
                        <dd>{t('agentCard.flowLocalBody')}</dd>
                      </dl>
                    </details>
                  </>
                )
              })()}
            </div>
          </div>

          {imagesChecking && (
            <div className="agent-card-row is-two-col">
              <span className="agent-card-label">{t('agentCard.rowImages')}</span>
              <span className="agent-card-value agent-card-muted">{t('agentCard.imagesChecking')}</span>
            </div>
          )}
          {imagesUnknown && (
            <div className="agent-card-row is-two-col">
              <span className="agent-card-label">{t('agentCard.rowImages')}</span>
              <span className="agent-card-value agent-card-muted">{t('agentCard.imagesUnknown')}</span>
            </div>
          )}
          {imagesPossible && (
            <div className="agent-card-row is-two-col">
              <span className="agent-card-label">{t('agentCard.rowImages')}</span>
              <span className="agent-card-value agent-card-out-text">{t('agentCard.images')}</span>
            </div>
          )}

          {/* Gedächtnis: nur „wird berücksichtigt“, wenn es Inhalt gibt — eine leere Notiz
              erzeugt keinen Gedächtnisblock im Lauf. */}
          <div className="agent-card-row is-center">
            <span className="agent-card-label">{t('agentCard.rowMemory')}</span>
            <span className={`agent-card-value ${memoryState === 'long' ? 'agent-card-warn-text' : memoryState === 'filled' ? '' : 'agent-card-muted'}`}>
              {t(
                memoryState === 'empty' ? 'agentCard.memEmpty'
                : memoryState === 'long' ? 'agentCard.memLong'
                : memoryState === 'filled' ? 'agentCard.memFilled'
                : memoryState === 'checking' ? 'agentCard.memChecking'
                : 'agentCard.memUnknown'
              )}
            </span>
            {(memoryState === 'filled' || memoryState === 'long')
              ? <button type="button" className="agent-card-link-btn" onClick={() => void openMemoryNote()}>{t('agentCard.memView')}</button>
              : <span />}
          </div>
        </div>

        <div className="agent-card-footer">
          <div className="agent-card-footer-text">
            <span>{t('agentCard.footer')}</span>
            {actsNow && <span className="agent-card-acts-title">{t('agentCard.footerActsNow')}</span>}
            {!cloudSelected && <span>{t('agentCard.duration')}</span>}
          </div>
          <button type="button" className={`agent-card-start ${canRun ? 'is-ready' : ''}`} onClick={() => void submit()} disabled={!canRun}>
            {buttonLabel}{canRun && <span className="agent-card-kbd"> {SUBMIT_KEYS}</span>}
          </button>
        </div>

        <AgentRunPanel
          run={run}
          onCancel={() => store().cancelRun(tabId)}
          onAccept={(id, openAfter) => void store().acceptResult(tabId, id, openAfter)}
          onDiscard={id => void store().discardResult(tabId, id)}
          onPreview={id => store().previewResult(tabId, id)}
          onDismiss={() => store().dismissRun(tabId)}
          onRemember={async text => {
            if (!vaultPath) return { success: false, error: 'Kein Vault geöffnet' }
            const res = await window.electronAPI.noteAgentRemember(vaultPath, text)
            refreshMemory()
            return res
          }}
        />
      </div>
    </div>
  )
}
