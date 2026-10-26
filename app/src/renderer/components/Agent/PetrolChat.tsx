// Chat im Agent-Tab („Mit Petrol chatten“, Stufe 1 aus docs/codex-collab/chat-und-agent.md).
//
// Gebaut als Schwester der Auftragskarte (gleiche .agent-card-Bausteine): Verlauf, Eingabe,
// im leeren Zustand Beispiele, unten die Modellzeile mit Weg-Marke. Kein Zielordner,
// keine Befugnisse, keine Notizen: der Main verwirft für chatMode 'petrol' Kontext und
// Anhänge, die Zusage „liest keine Notizen von selbst“ steht deshalb fest in der Zeile.
// Cloud wie im Notiz-Chat (Nutzerentscheidung 23.10.2026): dasselbe Opt-in
// ('notes-chat'), der Weg steht sichtbar unter der Eingabe.
//
// Websuche (Stufe 1b, docs/codex-collab/chat-websuche.md): Globus pro Nachricht, nur mit
// Modul `web-research`. Die Suchwörter stehen sichtbar im Feld und gehen exakt so raus;
// die Datenwege stehen VOR dem Senden da (F11). Ziel: geringe Halluzination.

import React, { useEffect, useMemo, useRef, useState } from 'react'
import MarkdownIt from 'markdown-it'
import { useUIStore } from '../../stores/uiStore'
import { useNotesStore, createNoteFromFile } from '../../stores/notesStore'
import { useNoteAgentStore } from '../../stores/noteAgentStore'
import { usePetrolChatStore, type PetrolChatMessage } from '../../stores/petrolChatStore'
import { useTranslation, type TranslationKey } from '../../utils/translations'
import { sanitizeHtml } from '../../utils/sanitize'
import { writeClipboardText } from '../../utils/clipboard'
import { reserveFreeNoteName } from '../../utils/noteFileName'
import { ModelPicker } from '../Shared/ModelPicker'
import { cloudRoutesForFeature, cloudProviderForSentinel } from '../../../shared/llmBackend'
import { setAiProvenanceInContent } from '../../../shared/aiProvenance'
import { VAULT_CHAT_ANSWER_TYPE } from '../../../shared/rag/indexPolicy'
import type { AgentRoute } from '../../../shared/agentRoute'
import { useIsModuleEnabled } from '../../utils/modules'
import { buildChatHandover, formatHandoverTranscript } from '../../utils/chatHandover'
import { isQueryTooLong, isWebResearchConfigComplete, normalizeQuery, WEB_QUERY_MAX_CHARS, WEB_SEARCH_PROVIDER_META } from '../../../shared/webResearch'
import { applyPreviousTopic, asksForDeeperSearch, asksForMorePages, offerPreviousTopic, previousWebQuestion } from '../../../shared/webChatDeep'
import { followUpQuery, lastSentWebQuery, looksConversational, offerSearchWords, withWebFootnotes, WEB_CHAT_QUERY_SOFT_MAX, type WebChatProvenance } from '../../../shared/webChat'
import { webTopicQuestions } from '../../utils/chatHistory'
import { WebAnswerText, WebCheck, WebDeepLine, WebMarkLegend, WebProvenanceLine, WebSkippedLine, WebSourceList, WebSourcesFold, WebUnfetchedHits, webFlagLabel } from './PetrolWebAnswer'

interface Props {
  tabId: string
  /** Wechselt den Tab auf „Auftrag“ (Umschalter liegt in der AgentView). */
  onSwitchToTask: () => void
}

function fetchedSpan(sources: readonly { fetchedAt: string }[]): string {
  const days = [...new Set(sources.map(s => (s.fetchedAt || '').slice(0, 10)).filter(Boolean))].sort()
  if (days.length === 0) return ''
  if (days.length === 1) return days[0]
  return `${days[0]}–${days[days.length - 1]}`
}

function modelRouteLine(t: (key: TranslationKey, vars?: Record<string, string | number>) => string, p: WebChatProvenance): string {
  if (p.route === 'local') return t('petrolChat.webProvModelLocal')
  if (p.route === 'cloud') return t('petrolChat.webProvModelCloud', { provider: p.routeLabel })
  if (p.route) return t('petrolChat.webProvModelUnverified', { provider: p.routeLabel })
  return ''
}

const md = new MarkdownIt({ html: false, linkify: true, breaks: true })

function renderMarkdown(text: string): string {
  return sanitizeHtml(md.render(text))
}

// Links aus Modelltext: das Hauptfenster verweigert jedes neue Fenster (setWindowOpenHandler →
// deny), `target=_blank` liefe ins Leere (Codex F15). Geöffnet wird nur nach bewusstem Klick
// über den freigegebenen IPC `open-external` (Allowlist http/https/mailto, wie ExternalLink).
const OPENABLE = /^(https?:|mailto:)/i
function onAnswerClick(e: React.MouseEvent<HTMLDivElement>) {
  const a = (e.target as HTMLElement).closest('a')
  if (!a) return
  e.preventDefault()
  const href = a.getAttribute('href') ?? ''
  if (OPENABLE.test(href)) void window.electronAPI.openExternal(href)
}

function openSettingsAt(tab: 'ai' | 'modules', anchor: string) {
  window.dispatchEvent(new CustomEvent('mindgraph:openSettings', { detail: { tab, anchor } }))
}

const CLOUD_LABELS: Record<string, string> = { openrouter: 'OpenRouter', llmbase: 'LLMBase' }

/** Obergrenze für den Text, der beim Übergang in den Auftragsentwurf wandert. */
const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)} …` : text)

export function PetrolChat({ tabId, onSwitchToTask }: Props) {
  const { t } = useTranslation()
  const ollama = useUIStore(s => s.ollama)
  const notesRootFolder = useUIStore(s => s.notesRootFolder)
  const vaultPath = useNotesStore(s => s.vaultPath)
  const scope = usePetrolChatStore(s => s.scopes[tabId])
  const activeScope = usePetrolChatStore(s => s.activeScope)
  const runPhase = useNoteAgentStore(s => s.scopes[tabId]?.run.phase ?? 'idle')
  const taskDraft = useNoteAgentStore(s => s.scopes[tabId]?.draft ?? '')
  const chat = usePetrolChatStore.getState

  const messages = scope?.messages ?? EMPTY_MESSAGES
  const streaming = scope?.streaming ?? null
  const draft = scope?.draft ?? ''
  const localModel = scope?.localModel ?? ''
  const busy = activeScope === tabId
  const busyElsewhere = !!activeScope && activeScope !== tabId

  // Websuche: Modul + Einrichtung wie auf der Auftragskarte (dieselbe Konfiguration).
  const webModule = useIsModuleEnabled('web-research')
  const webConfig = useUIStore(s => s.webResearchConfig)
  const webLoopOn = useUIStore(s => s.petrolWebLoop)
  const checkMarks = useUIStore(s => s.petrolWebCheckMarks)
  const setWebConfig = useUIStore(s => s.setWebResearchConfig)
  useEffect(() => {
    if (webModule && !webConfig) {
      window.electronAPI.webResearchLoadConfig()
        .then(c => setWebConfig({ provider: c.provider, searxngUrl: c.searxngUrl, hasTavilyKey: c.hasTavilyKey, hasLinkupKey: c.hasLinkupKey }))
        .catch(() => { /* ignorieren */ })
    }
  }, [webModule, webConfig, setWebConfig])
  const webConfigured = !!webConfig && (
    webConfig.provider === 'tavily' ? webConfig.hasTavilyKey :
    webConfig.provider === 'linkup' ? webConfig.hasLinkupKey :
    isWebResearchConfigComplete({ provider: 'searxng', searxngUrl: webConfig.searxngUrl })
  )
  const webProvider = webConfig ? WEB_SEARCH_PROVIDER_META[webConfig.provider].label : ''
  const webOn = !!scope?.webArmed && webModule && webConfigured
  // „Gründlich“ (chat-gruendliche-suche.md): Modell plant die Suche, eine Wahl je Frage (R1).
  // Recherche-Schleife (experimentell): läuft im Main über den gründlichen Weg; keine Wahl
  // schnell/gründlich, keine Satz- oder Themenhinweise — das Modell versteht den Zusammenhang selbst.
  const webDeep = webOn && (webLoopOn || !!scope?.webDeep)
  const prevWebQuestion = previousWebQuestion(messages)
  // Vorige Frage sichtbar ins Feld (chat-nachfrage-weitere-seiten.md, F02/F06/F07): sie gilt dann für
  // Suche, Antwort und Prüfung, und gesendet wird, was im Feld steht. Nur auf Klick, nie still.
  const topicHint = webOn && !webLoopOn && offerPreviousTopic(prevWebQuestion, draft, webDeep, webDeep ? null : scope?.webQuery ?? null)
  // „Suche noch gründlicher“ in der Schnellsuche: gemeint ist der Schalter — ein Klick schaltet
  // ihn ein und setzt die vorige Frage sichtbar ins Feld (GUI-Test 26.10.2026).
  const deeperAsk = topicHint && !webDeep && asksForDeeperSearch(draft)
  const topicHintText = deeperAsk ? t('petrolChat.webDeeperHint')
    : asksForMorePages(draft) ? t('petrolChat.webMorePagesHint') : t('petrolChat.webDeepFollowHint')
  // Ein offenes Suchfeld der Schnellsuche geht statt des Entwurfs an die Suche (Codex F12): dann
  // bekommt auch das Feld die Vorfrage, sichtbar — sonst fehlte der Suche das Thema weiter.
  const searchDeeperWithTopic = () => {
    chat().setDraft(tabId, applyPreviousTopic(prevWebQuestion ?? '', draft, null).draft)
    chat().setWeb(tabId, { webDeep: true, webQuery: null })
  }
  const addPreviousTopic = () => {
    const next = applyPreviousTopic(prevWebQuestion ?? '', draft, webDeep ? null : scope?.webQuery ?? null)
    chat().setDraft(tabId, next.draft)
    if (next.webQuery !== (scope?.webQuery ?? null)) chat().setWeb(tabId, { webQuery: next.webQuery })
  }
  // Vorschlag = die Frage, unverändert (F08). Gesendet wird exakt, was im Feld steht.
  const webQuery = scope?.webQuery ?? draft
  // Stichwörter nur als Angebot auf Klick, bei langen Fragen und Gesprächssätzen (Codex-Prüfung
  // chat-suchqualitaet-2.md, Urteil zu Frage 6): die Messung trug keinen Standardwechsel.
  const keywordOffer = offerSearchWords(draft)
  const webQueryNorm = normalizeQuery(webQuery)
  const webQueryLen = [...webQueryNorm].length
  // Nachfrage nach einer Websuche (Codex-Prüfung chat-suchwoerter-vorschlag.md, F07): auf Klick
  // werden die damals gesendeten Suchwörter vor die neue Frage gesetzt — ohne Modell, sichtbar
  // im Feld. Eine alte Webantwort oder ihre Quellen wandern dabei nie mit (F09).
  const previousWebQuery = lastSentWebQuery(messages)
  const followUpId = scope?.followUp?.snapshotId ?? null
  const followUpMsg = followUpId
    ? [...messages].reverse().find(m => m.role === 'assistant' && m.web?.snapshotId === followUpId)
    : undefined
  const followUpSources = followUpMsg?.web?.sources ?? []
  const followUpActive = !!followUpId && !webOn
  // Thema früherer Webfragen, das bei der nächsten Nachricht mitgeht (Weg 1) — gleiche Auswahl wie im Store.
  const webTopicCount = webTopicQuestions(messages).length
  const takePreviousQuery = () => {
    if (previousWebQuery) chat().setWeb(tabId, { webQuery: followUpQuery(previousWebQuery, draft) })
  }
  // Eigenes Feld nur, wenn der Nutzer ändern will (webQuery gesetzt) oder die Frage zu lang ist.
  const webQueryOpen = !webDeep && (scope?.webQuery != null || isQueryTooLong(normalizeQuery(draft)))
  const webQueryProblem = !webOn || webDeep ? null
    : !webQueryNorm ? t('petrolChat.webQueryEmpty')
    : isQueryTooLong(webQueryNorm) ? t('petrolChat.webQueryTooLong', { max: WEB_QUERY_MAX_CHARS, n: webQueryLen })
    : null
  // Lange Suchwörter: Hinweis, keine Sperre (Nutzertest: lange Suche → Spam-Treffer).
  const webQueryLong = webOn && !webDeep && !webQueryProblem && webQueryLen > WEB_CHAT_QUERY_SOFT_MAX
  // Gesprächssatz statt Stichwörter: nur Warnung, gesendet wird trotzdem (Nutzertest 24.10.2026).
  // Geprüft wird, was gesendet würde: nach „Stichwörter verwenden“ ist der Gesprächsanfang weg
  // (OPENER_RE), die Warnung verschwindet dann zu Recht (GUI-Test 25.10.2026).
  // Steht der Themenhinweis, ist er der genauere Rat — die Satzwarnung träte doppelt daneben.
  const webQueryChatty = webOn && !webDeep && !webQueryProblem && !topicHint && looksConversational(webQueryNorm)
  const webProgress = busy ? scope?.webProgress ?? null : null

  // Modelle des aktiven Backends (Ollama bzw. LM Studio), wie im Notiz-Chat.
  const [models, setModels] = useState<Array<{ name: string }>>([])
  useEffect(() => {
    if (!ollama.enabled) return
    let cancelled = false
    ;(async () => {
      try {
        const list = ollama.backend === 'lm-studio'
          ? await window.electronAPI.lmstudioModels(ollama.lmStudioPort)
          : await window.electronAPI.ollamaModels()
        if (!cancelled && Array.isArray(list)) setModels(list)
      } catch (e) {
        console.warn('[PetrolChat] Modell-Liste laden fehlgeschlagen:', e)
      }
    })()
    return () => { cancelled = true }
  }, [ollama.enabled, ollama.backend, ollama.lmStudioPort])

  const cloudRoutes = useMemo(() => cloudRoutesForFeature('notes-chat', ollama), [ollama])
  const activeCloudRoute = scope?.cloudProvider ? (cloudRoutes.find(r => r.provider === scope.cloudProvider) ?? null) : null
  const model = localModel || ollama.selectedModel || ''
  const pickerValue = activeCloudRoute ? activeCloudRoute.sentinel : model
  const hasModel = !!activeCloudRoute || !!model

  // Modellweg aus dem Main — dieselbe Einstufung wie auf der Auftragskarte (lokal nur
  // nach Prüfung der Ollama-Metadaten). Das Zustimmungs-Gate des Agenten gilt hier nicht.
  const routeKey = `${ollama.backend}|${model}|${activeCloudRoute ? `${activeCloudRoute.provider}:${activeCloudRoute.model}` : ''}`
  // route: null = Prüfung gescheitert (Ollama nicht erreichbar o. Ä.) — eigener Hinweis statt
  // dauerhaft „wird geprüft“ (Codex F33).
  const [route, setRoute] = useState<{ key: string; route: AgentRoute | null } | null>(null)
  useEffect(() => {
    if (!hasModel) return
    let cancelled = false
    window.electronAPI.noteAgentRoutePreflight({
      model,
      localBackend: ollama.backend === 'lm-studio' ? 'lmstudio' : 'ollama',
      cloud: activeCloudRoute ? { model: activeCloudRoute.model, provider: activeCloudRoute.provider } : null
    }).then(r => {
      if (!cancelled) setRoute({ key: routeKey, route: r.success && r.route ? r.route : null })
    }).catch(() => {
      if (!cancelled) setRoute({ key: routeKey, route: null })
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey, hasModel])
  const routeSettled = route?.key === routeKey
  const currentRoute = routeSettled ? route.route : null
  const runtime = ollama.backend === 'lm-studio' ? 'LM Studio' : 'Ollama'
  const selectedRouteText = !routeSettled ? t('agentCard.routeChecking')
    : !currentRoute ? t('petrolChat.routeFailed')
    : currentRoute.kind === 'cloud' ? t('agentCard.routeCloud', { provider: currentRoute.providerLabel })
    : currentRoute.kind === 'local' ? t('agentCard.routeVerified', { runtime })
    : currentRoute.provider === 'lmstudio' ? t('agentCard.routeLmStudio')
    : t('agentCard.routeLocal', { runtime })
  const selectedRouteKind = !routeSettled ? 'checking' : currentRoute?.kind ?? 'unverified'
  // Während einer Antwort zeigt die Zeile den Weg DIESER Anfrage, eingefroren beim Senden —
  // nicht, was gerade in den Einstellungen steht (Codex F18).
  const active = busy ? scope?.active ?? null : null
  // Wer direkt nach der Modellwahl sendet, friert „wird geprüft“ ein; das Ergebnis wird
  // nachgetragen, sobald es für genau diesen Weg vorliegt (Codex F28).
  useEffect(() => {
    if (busy && routeSettled) chat().resolveActiveRoute(tabId, routeKey, selectedRouteText, selectedRouteKind)
  }, [busy, routeSettled, routeKey, selectedRouteText, selectedRouteKind, tabId, chat])
  const routeText = active ? active.routeText : selectedRouteText
  const routeKind = active ? active.routeKind : selectedRouteKind
  // Datenwege vor dem Senden (F11), an die tatsächliche Route gebunden. Ein gewählter
  // Cloud-Anbieter steht immer da, unabhängig vom Prüfergebnis.
  const webModelPath = activeCloudRoute
    ? t('petrolChat.webPathCloud', { provider: CLOUD_LABELS[activeCloudRoute.provider] ?? activeCloudRoute.label })
    : !routeSettled ? t('petrolChat.webPathChecking')
    : currentRoute?.kind === 'cloud' ? t('petrolChat.webPathCloud', { provider: currentRoute.providerLabel })
    : currentRoute?.kind === 'local' ? t('petrolChat.webPathLocal')
    : t('petrolChat.webPathUnverified')
  // Wohin die Themenfragen gehen (Codex F07): derselbe Weg wie die Nachricht, bei Cloud mit Namen.
  const topicRouteText = activeCloudRoute
    ? t('petrolChat.topicRouteCloud', { provider: CLOUD_LABELS[activeCloudRoute.provider] ?? activeCloudRoute.label })
    : !routeSettled ? t('petrolChat.webPathChecking')
    : currentRoute?.kind === 'cloud' ? t('petrolChat.topicRouteCloud', { provider: currentRoute.providerLabel })
    : currentRoute?.kind === 'local' ? t('petrolChat.topicRouteLocal')
    : t('petrolChat.webPathUnverified')
  const webPathParts = [
    webConfig?.provider === 'searxng' ? t('petrolChat.webPathSearxngLong') : '',
    webTopicCount > 0 ? t('petrolChat.webPathTopics', { n: webTopicCount }) : '',
    t('petrolChat.webPathPages'),
    webModelPath
  ].filter(Boolean)
  // Senden mit Globus wartet auf die Wegprüfung; scheitert sie, ist Senden erlaubt.
  const webWaitsForRoute = webOn && !routeSettled
  const followUpMissing = followUpActive && !followUpMsg
  const followUpWaits = followUpActive && !routeSettled

  const inputRef = useRef<HTMLTextAreaElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`
  }, [draft, messages.length === 0])
  // Mitscrollen, solange man unten ist — wer hochgescrollt hat, wird nicht zurückgerissen.
  const stickToBottom = useRef(true)
  useEffect(() => {
    const el = listRef.current
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight
  }, [messages.length, streaming])

  // `text` gesetzt = „Erneut senden“ einer gescheiterten Frage; der laufende Entwurf bleibt dann
  // stehen (der Store leert den Entwurf beim Senden synchron, deshalb danach zurücklegen).
  const send = (text?: string, snapshotId?: string) => {
    const question = text ?? draft
    if (!question.trim() || busy || busyElsewhere || !hasModel) return
    // „Erneut senden“ geht immer ohne Web — eine neue Suche braucht den Globus (bewusst).
    // Eine Nachfrage geht nur mit, wenn sie ausdrücklich gewählt ist oder am Wiederholen hängt.
    const withWeb = text === undefined && webOn
    const followId = withWeb ? undefined : snapshotId ?? (text === undefined ? followUpId ?? undefined : undefined)
    if (withWeb && (webQueryProblem || webWaitsForRoute)) return
    if (followId && (followUpWaits || (text === undefined && followUpMissing))) return
    const keep = text !== undefined ? draft : ''
    stickToBottom.current = true
    void chat().send(tabId, question, {
      model,
      backend: ollama.backend === 'lm-studio' ? 'lm-studio' : 'ollama',
      lmStudioPort: ollama.lmStudioPort,
      cloud: activeCloudRoute ? { model: activeCloudRoute.model, provider: activeCloudRoute.provider } : null,
      run: { label: activeCloudRoute ? activeCloudRoute.label : model, routeText: selectedRouteText, routeKind: selectedRouteKind, routeKey },
      web: withWeb ? (webDeep ? { query: question.trim(), deep: true } : { query: webQueryNorm }) : undefined,
      followUp: followId ? { snapshotId: followId } : undefined
    })
    if (keep) chat().setDraft(tabId, keep)
  }

  const applyChip = (text: string) => {
    chat().setDraft(tabId, text)
    requestAnimationFrame(() => {
      const el = inputRef.current
      if (!el) return
      el.focus()
      el.setSelectionRange(text.length, text.length)
    })
  }

  // Antwort-Aktionen
  const [copiedAt, setCopiedAt] = useState<number | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const questionFor = (msg: PetrolChatMessage): string => {
    const i = messages.indexOf(msg)
    for (let j = i - 1; j >= 0; j--) if (messages[j].role === 'user') return messages[j].content
    return ''
  }
  // Webantworten mit Fußnoten aus eingefrorener Liste + gespeichertem Bericht (F13).
  const exportText = (msg: PetrolChatMessage): string => {
    // Antwort mit Thema aus früherer Webfrage (Codex F09): die Einschränkung reist mit, sonst
    // wirkt der Text in Kopie oder Notiz wie eine belegte Fortsetzung der Webantwort.
    if (!msg.web?.report || !msg.web.answer) return msg.webTopicsUsed ? `${msg.content}\n\n> ${t('petrolChat.topicOnlyExport')}` : msg.content
    const fid = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`
    const { report, extras } = msg.web
    return withWebFootnotes(msg.web.answer, msg.web.sources, report, fid, {
      retrieved: t('petrolChat.webFootRetrieved'),
      check: t('petrolChat.webFootCheck'),
      warnings: t('petrolChat.webFootWarnings'),
      // Eine benannte Lücke ist keine Warnung — sie steht im Text selbst.
      flagFor: k => (!checkMarks || extras?.[k]?.gap && report.sentences[k]?.status === 'uncited' ? null : webFlagLabel(report, extras, k, t))
    })
  }
  const copy = async (msg: PetrolChatMessage) => {
    try {
      await writeClipboardText(exportText(msg))
      setCopiedAt(msg.at)
      setTimeout(() => setCopiedAt(c => (c === msg.at ? null : c)), 2000)
    } catch (e) {
      console.warn('[PetrolChat] Kopieren fehlgeschlagen:', e)
    }
  }
  // Wie „Als Notiz speichern“ im Notiz-Chat: Standard-Notizordner, nie überschreiben,
  // KI-Herkunft im Frontmatter, `ki-typ`, damit der Vault-Index die Antwort nicht als Quelle nimmt.
  const saveAsNote = async (msg: PetrolChatMessage) => {
    const vault = vaultPath
    if (!vault) return
    setSaveError(null)
    try {
      const question = questionFor(msg)
      const safeTitle = question.replace(/\s+/g, ' ')
        .replace(/[\x00-\x1F\x7F]/g, '')
        .replace(/[\\/:*?"<>|#[\]]/g, '')
        .trim()
        .substring(0, 60)
        // Kein Punkt am Ende: sonst heißt die Datei „…Frage..md“.
        .replace(/[.\s]+$/, '') || t('petrolChat.answerTitle')
      const d = new Date(msg.at)
      const stamp = [d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes()]
        .map((n, i) => (i === 0 ? String(n) : String(n).padStart(2, '0'))).join('')
      const folder = notesRootFolder.trim().replace(/^\/+|\/+$/g, '')
      if (folder) await window.electronAPI.ensureDir(`${vault}/${folder}`)
      const relFor = (name: string) => (folder ? `${folder}/${name}` : name)
      const frontmatter = `---\ntitle: "${safeTitle.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"\ncreated: ${d.toISOString()}\nki-typ: ${VAULT_CHAT_ANSWER_TYPE}\n${msg.web ? 'ki-quellen: web\n' : ''}---\n\n`
      const quote = question ? `\n\n---\n> [!quote] KI-generiert\n> **Frage:** *${question.replace(/\s+/g, ' ').slice(0, 300)}*\n> **Modell:** ${msg.model || '?'}` : ''
      let content = `${frontmatter}${exportText(msg)}${quote}\n`
      if (msg.model) content = setAiProvenanceInContent(content, msg.model, d.toISOString().slice(0, 10))
      // Freien Namen suchen und exklusiv anlegen (Codex F16): zwischen Prüfung und Schreiben
      // kann ein zweiter Klick oder ein zweites Fenster denselben Namen nehmen — dann scheitert
      // `write-file-new` mit `exists`, und der nächste Name wird versucht. Nie überschreiben.
      const taken = new Set<string>()
      let relativePath: string | null = null
      for (let attempt = 0; attempt < 5 && !relativePath; attempt++) {
        const fileName = await reserveFreeNoteName(`${stamp} - ${safeTitle}`, async name => {
          if (taken.has(name)) return true
          const existing = await window.electronAPI.readFileOptional(`${vault}/${relFor(name)}`)
          return existing !== null && existing !== undefined
        })
        if (!fileName) break
        const res = await window.electronAPI.writeFileNew(`${vault}/${relFor(fileName)}`, content)
        if (res.success) relativePath = relFor(fileName)
        else if (res.exists) taken.add(fileName)
        else throw new Error(res.error || 'write-file-new')
      }
      if (!relativePath) { setSaveError(t('petrolChat.saveFailed')); return }
      const filePath = `${vault}/${relativePath}`
      // Vault inzwischen gewechselt (Codex F17): die Datei liegt richtig in A, aber sie gehört
      // nicht in die Dateiliste von B.
      if (useNotesStore.getState().vaultPath === vault) {
        const note = await createNoteFromFile(filePath, relativePath, content)
        // Nach dem await erneut prüfen — der Wechsel kann genau in die Wartezeit fallen (Codex F26).
        if (useNotesStore.getState().vaultPath === vault) useNotesStore.getState().addNote(note)
      }
      setSavedAt(msg.at)
      setTimeout(() => setSavedAt(c => (c === msg.at ? null : c)), 2000)
    } catch (e) {
      console.error('[PetrolChat] Speichern fehlgeschlagen:', e)
      setSaveError(t('petrolChat.saveFailed'))
    }
  }
  // Stufe 1: der Übergang füllt nur den Auftragsentwurf vor und schaltet um. Den Rest
  // (Zielordner, Befugnisse, Start) entscheidet der Nutzer auf der Karte wie bisher.
  // Frage UND Antwort wandern mit (Codex F19) — eine Antwort wie „Erstens …“ ist ohne die
  // Frage kein brauchbarer Auftrag.
  // Prüfung „Daraus etwas erstellen“ (docs/codex-collab/chat-daraus-erstellen.md): der Klick
  // öffnet erst eine Erklärung (F01), der Text geht als UNGEPRÜFTER Chatentwurf mit
  // Kürzungshinweis in den Auftrag (F05), ein vorhandener Entwurf wird nur ersetzt, nie
  // angehängt (F06), und bei Webantworten gibt es den Weg vorerst nicht (F03): die Quellen
  // zu [1], [2] wanderten nicht mit, der Agent könnte sie erfinden.
  const [makeFor, setMakeFor] = useState<number | null>(null)
  // Übergabe mit dem ganzen Gespräch bis zu dieser Antwort (utils/chatHandover.ts), aber getrennt
  // (docs/codex-collab/chat-uebergabe-kontext.md): der AUFTRAG ist nur der Wunsch, den der Nutzer
  // im Bestätigungsschritt sieht und ändern kann (F02/F03, nie gekürzt); der Verlauf geht als
  // abgegrenzter Kontext an den Main (F04/F06/F07). Ob Fakten im Web geprüft werden, wählt der
  // Nutzer dort mit zwei Knöpfen (F05; ein Hinweis auf der Karte wurde real übersehen).
  const [makeWish, setMakeWish] = useState('')
  const handoverFor = (msg: PetrolChatMessage) => buildChatHandover(messages, messages.indexOf(msg))
  const openMake = (msg: PetrolChatMessage) => {
    if (makeFor === msg.at) { setMakeFor(null); return }
    setMakeWish(handoverFor(msg).goal)
    setMakeFor(msg.at)
  }
  const applyMakeTask = (msg: PetrolChatMessage, web: boolean) => {
    const wish = makeWish.trim()
    if (!wish) return
    const h = handoverFor(msg)
    const transcript = formatHandoverTranscript(h, {
      user: t('petrolChat.handoverUser'),
      petrol: t('petrolChat.handoverPetrol'),
      webAnswer: t('petrolChat.handoverWebAnswer'),
      omitted: t('petrolChat.handoverOmitted'),
      clippedMark: t('petrolChat.handoverAnswerClipped'),
      topicOnly: t('petrolChat.handoverTopicOnly'),
      dropped: (n) => t('petrolChat.handoverDropped', { n })
    })
    const agent = useNoteAgentStore.getState()
    agent.setPickedExample(tabId, null)
    agent.setDraft(tabId, wish)
    agent.setChatContext(tabId, h.turns.length ? transcript + (h.clipped ? `\n\n${t('petrolChat.makeTaskClipped')}` : '') : null)
    // Websuche nur, wenn der Nutzer hier „mit Faktenprüfung“ wählt; Shell/Rechner schaltet die
    // Karte bei der Übergabe ab (F04 aus chat-daraus-erstellen.md).
    agent.setPrefs(tabId, { webArmed: web })
    agent.setChatHandover(tabId, { at: Date.now(), clipped: h.clipped, web, webTurns: h.webTurns })
    setMakeFor(null)
    onSwitchToTask()
  }
  const hasTaskDraft = !!taskDraft.trim()
  // Webantwort → Agent recherchiert NEU (Codex, chat-recherche-zum-agenten.md, kleinster Schritt):
  // nur die Frage wandert mit, nie die alte Antwort oder ihre Quellen (F03/F07) — der Agent liest
  // die Seiten selbst und hängt seinen eigenen Quellenblock an. Webrecherche ist vorgewählt und
  // auf der Karte sichtbar; Shell/Rechner schaltet die Übergabe ab.
  const [researchFor, setResearchFor] = useState<number | null>(null)
  const applyResearch = (msg: PetrolChatMessage) => {
    const agent = useNoteAgentStore.getState()
    agent.setPickedExample(tabId, null)
    agent.setDraft(tabId, t('petrolChat.researchDraft', { question: clip(questionFor(msg).trim(), 1000) }))
    agent.setChatContext(tabId, null)
    agent.setPrefs(tabId, { webArmed: true })
    agent.setChatHandover(tabId, { at: Date.now(), clipped: false, kind: 'research' })
    setResearchFor(null)
    onSwitchToTask()
  }

  const empty = messages.length === 0 && streaming === null
  const turns = toTurns(messages)
  // Laufende Antwort hängt an der letzten Frage (sie steht schon im Verlauf).
  const lastTurn = turns[turns.length - 1]
  const routeClass = routeKind === 'local' ? '' : routeKind === 'cloud' ? 'is-out' : 'is-muted'

  const answerFoot = (msg: PetrolChatMessage) => (
    <div className="petrol-turn-foot">
      <span className="petrol-turn-model">
        {[msg.model, msg.stopped ? t('petrolChat.stopped') : '', msg.webTopicsUsed ? t('petrolChat.topicOnlyLabel') : ''].filter(Boolean).join(' · ')}
      </span>
      {/* Ein gestopptes Web-Bruchstück ist ungeprüft (F23): nicht kopieren, nicht speichern,
          nicht in einen Auftrag übernehmen — sonst landet ein erfundener Halbsatz im Vault.
          Ohne Antworttext (Websuche ohne lesbare Seite) bleibt nur „neu recherchieren“. */}
      {!(msg.origin === 'web' && msg.stopped) && <div className="petrol-turn-actions">
        {msg.content.trim() && <button type="button" className="agent-card-btn" onClick={() => void copy(msg)}>{copiedAt === msg.at ? t('petrolChat.copied') : t('petrolChat.copy')}</button>}
        {vaultPath && msg.content.trim() && <button type="button" className="agent-card-btn" onClick={() => void saveAsNote(msg)}>{savedAt === msg.at ? t('petrolChat.saved') : t('petrolChat.saveNote')}</button>}
        {msg.web?.snapshotId && msg.web.kind === 'answer' && !msg.stopped && (
          <button
            type="button"
            className="agent-card-btn"
            aria-pressed={followUpId === msg.web.snapshotId}
            onClick={() => {
              chat().setFollowUp(tabId, followUpId === msg.web?.snapshotId ? null : msg.web!.snapshotId!)
              inputRef.current?.focus()
            }}
          >{t('petrolChat.askWithSources')}</button>
        )}
        {msg.origin !== 'web' ? (
          <button type="button" className="agent-card-btn is-accent" aria-expanded={makeFor === msg.at} onClick={() => openMake(msg)}>{t('petrolChat.makeTask')}</button>
        ) : (
          <button type="button" className="agent-card-btn is-accent" aria-expanded={researchFor === msg.at} onClick={() => setResearchFor(researchFor === msg.at ? null : msg.at)}>{t('petrolChat.research')}</button>
        )}
      </div>}
      {researchFor === msg.at && (
        <div className="petrol-turn-confirm" role="group" aria-label={t('petrolChat.research')}>
          <span>
            {t('petrolChat.researchExplain')}
            {hasTaskDraft && <> <strong>{t('petrolChat.makeTaskExisting')}</strong></>}
          </span>
          <div className="petrol-turn-actions">
            <button type="button" className="agent-card-btn" onClick={() => setResearchFor(null)}>{t('petrolChat.makeTaskCancel')}</button>
            <button type="button" className="agent-card-btn is-primary" onClick={() => applyResearch(msg)}>{t(hasTaskDraft ? 'petrolChat.makeTaskReplace' : 'petrolChat.makeTaskGo')}</button>
          </div>
        </div>
      )}
      {makeFor === msg.at && (() => {
        const wish = makeWish.trim()
        const webTurns = handoverFor(msg).webTurns
        return (
          <div className="petrol-turn-confirm petrol-handover" role="group" aria-label={t('petrolChat.makeTask')}>
            <span>
              {t('petrolChat.makeTaskExplain')}
              {hasTaskDraft && <> <strong>{t('petrolChat.makeTaskExisting')}</strong></>}
            </span>
            <label className="petrol-handover-wish">
              <span>{t('petrolChat.makeWishLabel')}</span>
              <textarea rows={3} value={makeWish} onChange={e => setMakeWish(e.target.value)} />
            </label>
            {wish.length > 0 && wish.length < 25 && <span className="petrol-handover-note">{t('petrolChat.makeWishShort')}</span>}
            {webTurns > 0 && <span className="petrol-handover-note">{t('petrolChat.makeWebTurns', { n: webTurns })}</span>}
            {webModule && <span className="petrol-handover-note">{t('petrolChat.makeCheckExplain')}</span>}
            <div className="petrol-turn-actions">
              <button type="button" className="agent-card-btn" onClick={() => setMakeFor(null)}>{t('petrolChat.makeTaskCancel')}</button>
              {webModule && (webConfigured
                ? <button type="button" className="agent-card-btn is-accent" disabled={!wish} onClick={() => applyMakeTask(msg, true)}>{t('petrolChat.makeGoWeb')}</button>
                : <button type="button" className="agent-card-btn" onClick={() => openSettingsAt('ai', 'ai-webresearch')}>{t('petrolChat.makeWebSetup')}</button>)}
              <button type="button" className="agent-card-btn is-primary" disabled={!wish} onClick={() => applyMakeTask(msg, false)}>
                {t(webModule ? 'petrolChat.makeGoPlain' : (hasTaskDraft ? 'petrolChat.makeTaskReplace' : 'petrolChat.makeTaskGo'))}
              </button>
            </div>
          </div>
        )
      })()}
    </div>
  )

  return (
    // Dieselbe Karte wie der Auftrag (.agent-card): Verlauf, Eingabe und Modellzeile sind
    // Abschnitte darin (Codex-Optikprüfung F03/F14, docs/codex-collab/chat-optik.md).
    <div className={`agent-card petrol-chat ${empty ? 'is-empty' : 'has-turns'}`}>
      {runPhase !== 'idle' && (
        <div className="petrol-chat-taskhint">
          <span>{t(runPhase === 'running' ? 'petrolChat.taskRunning' : 'petrolChat.taskWaiting')}</span>
          <button type="button" className="agent-card-link-btn is-strong" onClick={onSwitchToTask}>{t('petrolChat.showTask')}</button>
        </div>
      )}

      {!empty && (
        <div
          className="petrol-chat-list"
          ref={listRef}
          onScroll={e => {
            const el = e.currentTarget
            stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
          }}
        >
          {turns.map((turn, i) => {
            const isLive = streaming !== null && turn === lastTurn && !turn.answer
            return (
              <div key={turn.question?.at ?? turn.answer?.at ?? i} className="petrol-turn">
                {turn.question && (
                  <div className="petrol-turn-q">
                    <span className="petrol-turn-q-text">
                      {turn.question.content}
                      {turn.question.origin === 'web' && turn.question.webQuery && turn.question.webQuery !== turn.question.content.trim() && (
                        <span className="petrol-turn-webq">{t('petrolChat.webQueryLabel')}: {turn.question.webQuery}</span>
                      )}
                      {!!turn.question.webSentQueries?.length && (
                        <span className="petrol-turn-webq">{t('petrolChat.webDeepSentUntilStop', { queries: turn.question.webSentQueries.map(q => `„${q}“`).join(', ') })}</span>
                      )}
                    </span>
                    {turn.question.followUp
                      ? <span className="petrol-turn-webbadge">{t('petrolChat.followUpBadge')}</span>
                      : turn.question.webDeep ? <span className="petrol-turn-webbadge">{t('petrolChat.webDeepBadge')}</span>
                      : turn.question.origin === 'web' && turn.question.webQuery && <span className="petrol-turn-webbadge">{t('petrolChat.webBadge')}</span>}
                    {turn.question.stopped && <span className="petrol-turn-flag">{t('petrolChat.stopped')}</span>}
                  </div>
                )}
                {turn.answer?.appNote === 'old-web-source' ? (
                  <div className="petrol-turn-a petrol-web-appnote">{t('petrolChat.oldWebSourceNote')}</div>
                ) : turn.answer?.error ? (
                  <>
                    <div className="petrol-turn-error">
                      <span>{turn.answer.content ? t('petrolChat.error', { error: turn.answer.content }) : t('petrolChat.errorEmpty')}</span>
                      {/* Sind die Seiten weg, scheitert jede Wiederholung gleich — dann kein Knopf. */}
                      {turn.question && !turn.answer.web?.snapshotGone && (
                        <button type="button" className="agent-card-btn" onClick={() => send(turn.question!.content, turn.question!.followUpSnapshotId)} disabled={busy || busyElsewhere || !hasModel}>
                          {t('petrolChat.retry')}
                        </button>
                      )}
                    </div>
                    {turn.answer.web?.snapshotGone && <div className="petrol-web-muted">{t('petrolChat.followUpGoneHint')}</div>}
                    {turn.answer.web?.deep && <div className="petrol-web-block"><WebDeepLine deep={turn.answer.web.deep} /></div>}
                    {turn.answer.web?.basis?.kind === 'snapshot' && (
                      <div className="petrol-web-muted">{t('petrolChat.notRefetched', { date: fetchedSpan(turn.answer.web.sources) })}</div>
                    )}
                    {turn.answer.web && <div className="petrol-web-block"><WebSkippedLine skipped={turn.answer.web.skipped} /><WebProvenanceLine p={turn.answer.web.provenance} /></div>}
                  </>
                ) : turn.answer?.web?.kind === 'nothing-readable' ? (
                  <>
                  <div className="petrol-web-block">
                    <WebUnfetchedHits hits={turn.answer.web.unfetchedHits ?? []} failures={turn.answer.web.failures} />
                    <WebDeepLine deep={turn.answer.web.deep} />
                    <WebSkippedLine skipped={turn.answer.web.skipped} />
                    <WebProvenanceLine p={turn.answer.web.provenance} />
                  </div>
                  {answerFoot(turn.answer)}
                  </>
                ) : turn.answer?.origin === 'web' ? (
                  <>
                    <WebAnswerText answer={turn.answer.content} report={turn.answer.web?.report} extras={turn.answer.web?.extras} anchor={`petrol-src-${turn.answer.at}`} marks={checkMarks} />
                    <div className="petrol-web-block">
                      {checkMarks && turn.answer.web?.report && <WebMarkLegend report={turn.answer.web.report} extras={turn.answer.web.extras} />}
                      {checkMarks && (turn.answer.web?.report
                        ? <WebCheck answer={turn.answer.content} report={turn.answer.web.report} extras={turn.answer.web.extras} />
                        : <div className="petrol-web-muted">{t('petrolChat.webStoppedNoCheck')}</div>)}
                      <WebSourcesFold
                        sources={turn.answer.web?.sources ?? turn.answer.webPartial?.sources ?? []}
                        used={turn.answer.web?.report ? new Set(turn.answer.web.report.usedSources) : null}
                        limited={(turn.answer.web?.deep?.limited.length ?? 0) > 0}
                        unused={turn.answer.web?.deep?.unused.length ?? 0}
                        failed={(turn.answer.web?.failures ?? turn.answer.webPartial?.failures ?? []).length}
                      >
                      {(turn.answer.web?.sources ?? turn.answer.webPartial?.sources ?? []).length > 0 && (
                        <WebSourceList
                          sources={turn.answer.web?.sources ?? turn.answer.webPartial?.sources ?? []}
                          used={turn.answer.web?.report ? new Set(turn.answer.web.report.usedSources) : null}
                          failures={turn.answer.web?.failures ?? turn.answer.webPartial?.failures ?? []}
                          notFetched={turn.answer.web?.notFetched ?? turn.answer.webPartial?.notFetched ?? 0}
                          anchor={`petrol-src-${turn.answer.at}`}
                          noHeading
                        />
                      )}
                      {turn.answer.web?.basis?.kind === 'snapshot' ? (
                        <div className="petrol-web-muted petrol-web-prov">{[t('petrolChat.notRefetched', { date: fetchedSpan(turn.answer.web.sources) }), modelRouteLine(t, turn.answer.web.provenance)].filter(Boolean).join(' · ')}</div>
                      ) : turn.answer.web ? <WebProvenanceLine p={turn.answer.web.provenance} /> : null}
                      <WebDeepLine deep={turn.answer.web?.deep} />
                      <WebSkippedLine skipped={turn.answer.web?.skipped} />
                      </WebSourcesFold>
                      {!!turn.answer.web?.historyDropped && (
                        <div className="petrol-web-muted">{t('petrolChat.historyDropped', { n: turn.answer.web.historyDropped })}</div>
                      )}
                      <div className="petrol-web-muted">{turn.answer.web?.snapshotId ? t('petrolChat.webFollowUpChoice') : t('petrolChat.webFollowUp')}</div>
                    </div>
                    {answerFoot(turn.answer)}
                  </>
                ) : turn.answer ? (
                  <>
                    <div className="petrol-turn-a" onClick={onAnswerClick} dangerouslySetInnerHTML={{ __html: renderMarkdown(turn.answer.content) }} />
                    {answerFoot(turn.answer)}
                  </>
                ) : isLive && webProgress ? (
                  <>
                    {streaming
                      ? <WebAnswerText answer={streaming} anchor={`petrol-live-${tabId}`} />
                      : <div className="petrol-turn-a"><div className="petrol-msg-wait" aria-label={t('petrolChat.waiting')}><span /><span /><span /></div></div>}
                    {turn.question?.followUp && <div className="petrol-web-muted">{t('petrolChat.followUpNoSearch')}</div>}
                    {webProgress.sources && webProgress.sources.length > 0 && (
                      <div className="petrol-web-block">
                        <WebSourceList sources={webProgress.sources} used={null} failures={webProgress.failures ?? []} notFetched={webProgress.notFetched ?? 0} anchor={`petrol-live-${tabId}`} />
                      </div>
                    )}
                    <div className="petrol-turn-foot">
                      <span className="petrol-turn-model">{active?.label ?? ''}</span>
                      <span className="petrol-turn-model">
                        {webProgress.phase === 'plan' ? t('petrolChat.webPhasePlan')
                          : webProgress.phase === 'pick' ? t('petrolChat.webPhasePick')
                          : webProgress.phase === 'search' && webProgress.queries?.length ? t('petrolChat.webPhaseSearchQuery', { provider: webProvider, query: webProgress.queries[webProgress.queries.length - 1] })
                          : webProgress.phase === 'search' ? t('petrolChat.webPhaseSearch', { provider: webProvider })
                          : webProgress.phase === 'fetch' ? t('petrolChat.webPhaseFetch', { n: webProgress.hosts.length })
                          : streaming ? t('petrolChat.writing') : t('petrolChat.webPhaseModel', { n: webProgress.sources?.length ?? 0 })}
                      </span>
                    </div>
                  </>
                ) : isLive ? (
                  <>
                    {streaming
                      ? <div className="petrol-turn-a" onClick={onAnswerClick} dangerouslySetInnerHTML={{ __html: renderMarkdown(streaming) }} />
                      : <div className="petrol-turn-a"><div className="petrol-msg-wait" aria-label={t('petrolChat.waiting')}><span /><span /><span /></div></div>}
                    <div className="petrol-turn-foot">
                      <span className="petrol-turn-model">{active?.label ?? ''}</span>
                      <span className="petrol-turn-model">{t('petrolChat.writing')}</span>
                    </div>
                  </>
                ) : null}
              </div>
            )
          })}
        </div>
      )}

      <div className="petrol-chat-compose">
        <div className="petrol-chat-input">
          <textarea
            ref={inputRef}
            rows={empty ? 3 : 1}
            value={draft}
            placeholder={t(empty ? 'petrolChat.placeholder' : 'petrolChat.placeholderReply')}
            aria-label={t('petrolChat.placeholder')}
            title={t('petrolChat.sendKeys')}
            onChange={e => chat().setDraft(tabId, e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send() }
            }}
          />
          {webModule && !busy && (
            <button
              type="button"
              className={`petrol-chat-globe ${webOn ? 'is-on' : ''}`}
              aria-pressed={webOn}
              aria-label={webConfigured ? t(webOn ? 'petrolChat.webToggleOn' : 'petrolChat.webToggle') : t('petrolChat.webSetup')}
              title={webConfigured ? t(webOn ? 'petrolChat.webToggleOn' : 'petrolChat.webToggle') : t('petrolChat.webSetup')}
              disabled={busyElsewhere}
              onClick={() => {
                if (!webConfigured) { openSettingsAt('ai', 'ai-webresearch'); return }
                chat().setWeb(tabId, { webArmed: !webOn, webQuery: null })
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18z" /></svg>
            </button>
          )}
          {/* Themenangebot direkt neben Senden (Nutzer, 26.10.2026): als graue Zeile über dem Feld wurde es
              beim schnellen Tippen übersehen. Nur ein Angebot — Senden bleibt unverändert möglich. */}
          {topicHint && !busy && (
            <button
              type="button"
              className="agent-card-btn is-accent petrol-chat-topic-btn"
              title={t('petrolChat.webTopicPrevious', { q: prevWebQuestion ?? '' })}
              onClick={deeperAsk ? searchDeeperWithTopic : addPreviousTopic}
            >
              {t(deeperAsk ? 'petrolChat.webDeeperTakeTopic' : 'petrolChat.webDeepAddTopic')}
            </button>
          )}
          {busy ? (
            <button type="button" className="petrol-chat-send is-stop" onClick={() => chat().stop(tabId)} aria-label={t('petrolChat.stop')} title={t('petrolChat.stop')}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
            </button>
          ) : (
            <button type="button" className="petrol-chat-send" onClick={() => send()} disabled={!draft.trim() || busyElsewhere || !hasModel || (webOn && (!!webQueryProblem || webWaitsForRoute)) || followUpWaits || followUpMissing} aria-label={webWaitsForRoute || followUpWaits ? t('petrolChat.webSendChecking') : t('petrolChat.send')} title={webWaitsForRoute || followUpWaits ? t('petrolChat.webSendChecking') : t('petrolChat.send')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
            </button>
          )}
        </div>
        {/* Websuche an: im Normalfall EINE leise Zeile statt der Tastenhilfe (Nutzer, 24.10.2026:
            „nimmt viel Platz weg“). Sie nennt alle Datenwege (F11). Das Suchfeld erscheint nur zum
            Ändern oder wenn die Frage für eine Suche zu lang ist (F08: gesendet wird exakt der
            sichtbare Text, nichts wird still gekürzt). */}
        {webDeep && !busy && (
          <div className="petrol-web-line">
            <span>{[t(webLoopOn ? 'petrolChat.webLoopConsent' : 'petrolChat.webDeepConsent', { route: activeCloudRoute ? activeCloudRoute.label : model, provider: webProvider }), ...webPathParts].join(' · ')}</span>
            {!webLoopOn && <button type="button" className="agent-card-link-btn" aria-pressed={true} onClick={() => chat().setWeb(tabId, { webDeep: false })}>{t('petrolChat.webDeepOff')}</button>}
            {topicHint && (
              <span className="petrol-web-line-warn">
                {topicHintText} {t('petrolChat.webTopicPrevious', { q: prevWebQuestion ?? '' })}
              </span>
            )}
          </div>
        )}
        {webOn && !webDeep && !busy && !webQueryOpen && (
          <div className="petrol-web-line">
            <span>{[t('petrolChat.webLineSearch', { provider: webProvider }), ...webPathParts].join(' · ')}</span>
            <button type="button" className="agent-card-link-btn" aria-pressed={false} onClick={() => chat().setWeb(tabId, { webDeep: true })}>{t('petrolChat.webDeepToggle')}</button>
            <button type="button" className="agent-card-link-btn" onClick={() => chat().setWeb(tabId, { webQuery: draft })}>{t('petrolChat.webQueryEdit')}</button>
            {keywordOffer && (
              <button type="button" className="agent-card-link-btn" title={keywordOffer} onClick={() => chat().setWeb(tabId, { webQuery: keywordOffer })}>{t('petrolChat.webQueryUseKeywords')}</button>
            )}
            {previousWebQuery && (
              <button type="button" className="agent-card-link-btn" title={previousWebQuery} onClick={takePreviousQuery}>{t('petrolChat.webQueryTakePrevious')}</button>
            )}
            {webQueryLong && <span className="petrol-web-line-warn">{t('petrolChat.webQueryLongHint')}</span>}
            {webQueryChatty && <span className="petrol-web-line-warn">{t('petrolChat.webQueryChattyHint')}</span>}
            {topicHint && (
              <span className="petrol-web-line-warn">
                {topicHintText} {t('petrolChat.webTopicPrevious', { q: prevWebQuestion ?? '' })}
              </span>
            )}
          </div>
        )}
        {webOn && !busy && webQueryOpen && (
          <div className="petrol-web-query">
            <label className="petrol-web-query-row">
              <span className="petrol-web-query-label">{t('petrolChat.webQueryLabel')}</span>
              <input
                type="text"
                autoFocus
                value={webQuery}
                onChange={e => chat().setWeb(tabId, { webQuery: e.target.value })}
                onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); send() } }}
              />
              <button type="button" className="petrol-web-query-off" aria-label={t('petrolChat.webQueryOff')} title={t('petrolChat.webQueryOff')} onClick={() => chat().setWeb(tabId, { webArmed: false, webQuery: null })}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </label>
            {webQueryProblem && <div className="petrol-chat-note is-error">{webQueryProblem}</div>}
            {webQueryLong && <div className="petrol-chat-note is-warn">{t('petrolChat.webQueryLongHint')}</div>}
            {webQueryChatty && <div className="petrol-chat-note is-warn">{t('petrolChat.webQueryChattyHint')}</div>}
            {topicHint && (
              <div className="petrol-chat-note is-warn">
                {topicHintText} {t('petrolChat.webTopicPrevious', { q: prevWebQuestion ?? '' })}
              </div>
            )}
            <div className="petrol-web-paths">
              {[t('petrolChat.webPathSearch', { provider: webProvider }), ...webPathParts].join(' · ')}
              {/* Gerade bei langen Fragen nützt „gründlich“ am meisten (Codex F30). */}
              {' '}<button type="button" className="agent-card-link-btn" aria-pressed={false} onClick={() => chat().setWeb(tabId, { webDeep: true })}>{t('petrolChat.webDeepToggle')}</button>
              {previousWebQuery && webQuery.indexOf(previousWebQuery) !== 0 && (
                <> <button type="button" className="agent-card-link-btn" title={previousWebQuery} onClick={takePreviousQuery}>{t('petrolChat.webQueryTakePrevious')}</button></>
              )}
              {keywordOffer && webQuery !== keywordOffer && (
                <> <button type="button" className="agent-card-link-btn" title={keywordOffer} onClick={() => chat().setWeb(tabId, { webQuery: keywordOffer })}>{t('petrolChat.webQueryUseKeywords')}</button></>
              )}
            </div>
          </div>
        )}
        {/* Nach Webantworten ohne Globus: ehrlich sagen, dass sie nicht mitgelesen werden
            (Codex, chat-recherche-zum-agenten.md F01) — nur solange eine Nachricht getippt wird. */}
        {followUpActive && !busy && (
          <div className="petrol-chat-note" role="status">
            {followUpMissing
              ? t('petrolChat.followUpGone')
              : t('petrolChat.followUpChip', {
                n: followUpSources.length,
                chars: followUpSources.reduce((n, s) => n + s.excerpt.length, 0),
                hosts: [...new Set(followUpSources.map(s => s.host))].join(', '),
                date: fetchedSpan(followUpSources)
              })}
            <div className="petrol-web-paths">{webModelPath}. {t('petrolChat.followUpNoSearch')}</div>
            <button type="button" className="agent-card-link-btn" onClick={() => chat().setFollowUp(tabId, null)}>{t('petrolChat.followUpDismiss')}</button>
          </div>
        )}
        {!webOn && !followUpActive && !busy && previousWebQuery && draft.trim() && (
          <div className="petrol-chat-note">
            {webTopicCount > 0
              ? t('petrolChat.webTopicsGoAlong', { n: webTopicCount, route: topicRouteText })
              : t('petrolChat.webNotRemembered')}
          </div>
        )}
        {(!webOn || busy || webQueryOpen || webWaitsForRoute) && (
          <span className="agent-card-help">{webWaitsForRoute ? t('petrolChat.webSendChecking') : t('petrolChat.sendKeys')}</span>
        )}
        {saveError && <div className="petrol-chat-note is-error">{saveError}</div>}
        {!hasModel && <div className="petrol-chat-note">{t('petrolChat.noModel')}</div>}
        {busyElsewhere && <div className="petrol-chat-note">{t('petrolChat.busyElsewhere')}</div>}
      </div>

      {/* Beispiele nur im leeren Zustand, wie auf der Auftragskarte: ein Klick füllt nur den Text. */}
      {empty && (
        <div className="agent-card-examples">
          <span className="agent-card-eyebrow">{t('agentCard.examplesTitle')}</span>
          <div className="agent-card-examples-grid">
            {CHAT_EXAMPLES.map(ex => (
              <button key={ex.title} type="button" className="agent-card-example" onClick={() => applyChip(t(ex.text))}>
                <span className="agent-card-example-icon" aria-hidden="true"><ChatGlyph icon={ex.icon} /></span>
                <span className="agent-card-example-body">
                  <span className="agent-card-example-title">{t(ex.title)}</span>
                  <span className="agent-card-example-meta">
                    {t(ex.from)} <span aria-hidden="true">&rarr;</span> <span className="is-accent">{t(ex.to)}</span>
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Modell + Weg wie in der Auftragskarte: beschriftete Zeile, Weg als Marke. */}
      {/* „Neues Gespräch“ ist eine Gesprächsaktion und steht deshalb hier, nicht an der Eingabe (F15). */}
      <div className={`agent-card-row ${empty ? 'is-two-col' : ''}`}>
        <span className="agent-card-label">{t('agentCard.rowModel')}</span>
        <div className="agent-card-value">
          <ModelPicker
            value={pickerValue}
            models={[...cloudRoutes.map(r => ({ name: r.sentinel })), ...models]}
            onChange={name => {
              const provider = cloudProviderForSentinel(name)
              if (provider) chat().setModel(tabId, { cloudProvider: provider })
              else chat().setModel(tabId, { cloudProvider: null, localModel: name })
            }}
            getLabel={name => cloudRoutes.find(r => r.sentinel === name)?.label ?? name}
            disabled={busy}
            ariaLabel={t('petrolChat.modelLabel')}
            maxWidth={360}
          />
          {hasModel && (
            <div className="agent-card-tags">
              <span className={`agent-card-route ${routeClass}`}>{routeText}</span>
              <span className="agent-card-route is-muted">{t('petrolChat.noNotes')}</span>
            </div>
          )}
        </div>
        {!empty && (
          <button type="button" className="agent-card-btn" onClick={() => chat().clear(tabId)}>{t('petrolChat.newChat')}</button>
        )}
      </div>
    </div>
  )
}

interface Turn { question?: PetrolChatMessage; answer?: PetrolChatMessage }

/** Verlauf → Wechsel aus Frage und Antwort (oder Fehler); eine gestoppte Frage steht allein. */
function toTurns(messages: PetrolChatMessage[]): Turn[] {
  const out: Turn[] = []
  for (const m of messages) {
    if (m.role === 'user') out.push({ question: m })
    else {
      const last = out[out.length - 1]
      if (last && !last.answer && !last.question?.stopped) last.answer = m
      else out.push({ answer: m })
    }
  }
  return out
}

type ChatIcon = 'rewrite' | 'idea' | 'explain'
const CHAT_EXAMPLES: Array<{ icon: ChatIcon; title: TranslationKey; text: TranslationKey; from: TranslationKey; to: TranslationKey }> = [
  { icon: 'rewrite', title: 'petrolChat.chip1', text: 'petrolChat.chip1Text', from: 'petrolChat.chip1From', to: 'petrolChat.chip1To' },
  { icon: 'idea', title: 'petrolChat.chip2', text: 'petrolChat.chip2Text', from: 'petrolChat.chip2From', to: 'petrolChat.chip2To' },
  { icon: 'explain', title: 'petrolChat.chip3', text: 'petrolChat.chip3Text', from: 'petrolChat.chip3From', to: 'petrolChat.chip3To' }
]

function ChatGlyph({ icon }: { icon: ChatIcon }) {
  const common = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  switch (icon) {
    case 'rewrite': return <svg {...common}><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg>
    case 'idea': return <svg {...common}><path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/></svg>
    case 'explain': return <svg {...common}><path d="M4 5h16v11H9l-5 4z"/><path d="M10 9.5a2 2 0 1 1 2.6 1.9c-.4.1-.6.5-.6.9v.2M12 14.5h.01"/></svg>
  }
}

const EMPTY_MESSAGES: PetrolChatMessage[] = []
