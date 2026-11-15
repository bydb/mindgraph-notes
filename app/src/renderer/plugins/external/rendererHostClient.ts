// Produktions-Verdrahtung der ExternalRendererRegistry: bindet die testbaren Seams an das echte
// `window.electronAPI`, an Blob-URL-`import()`, an host-eigene `<style>`-Elemente und an das App-Theme.
// Singleton + Boot-Init (main.tsx) + React-Hook für den plugin-editor-Tab.
//
// Der dynamische `import(blobUrl)` läuft unter der bestehenden CSP (`script-src … blob:`); KEIN
// `unsafe-eval`. Single-File-ESM wird im Pack/Sign-Pfad erzwungen (F12) — der Loader meldet einen
// fehlschlagenden Sub-Import nur ehrlich als Aktivierungsfehler (kein Regex-Sicherheitsversprechen).

import { useSyncExternalStore } from 'react'
import { useUIStore } from '../../stores/uiStore'
import { ExternalRendererRegistry, type RendererLoaderEnv } from './rendererRegistry'
import { useNotesStore } from '../../stores/notesStore'
import { useTabStore } from '../../stores/tabStore'
import { findNoteForWikilink, resolvePluginFileLink } from '../../utils/linkExtractor'
import { classifyPluginLink } from '../../../shared/pluginLink'
import { useEmailStore } from '../../stores/emailStore'
import type { ComposeMailDraft } from '@mindgraph/plugin-api'

/**
 * Mail-Schreibfenster aus einem Renderer-Plugin vorbelegen (API ≥0.2.3). Anhänge kommen als Bytes und
 * werden über denselben Ablageweg wie gezogene Dateien abgelegt (`email-stage-compose-files`: nur
 * Basisname, Größengrenzen). Es wird NICHTS verschickt — Senden bleibt beim Nutzer.
 */
async function composeMailFromPlugin(pluginId: string, draft: ComposeMailDraft): Promise<void> {
  const accounts = useUIStore.getState().email.accounts
  if (!accounts.length) throw new Error('Kein Mailkonto eingerichtet (Einstellungen → E-Mail).')
  const files = (draft.attachments ?? []).map((a) => ({ name: String(a.name ?? ''), data: a.bytes }))
  let attachments: Awaited<ReturnType<typeof window.electronAPI.emailStageComposeFiles>>['attachments'] = []
  if (files.length) {
    const res = await window.electronAPI.emailStageComposeFiles(files)
    if (!res.success || (res.skipped?.length ?? 0) > 0) {
      throw new Error(res.error || `Anhang konnte nicht übernommen werden: ${(res.skipped ?? []).join(', ')}`)
    }
    attachments = res.attachments
  }
  const to = (draft.to ?? [])
    .filter((r) => typeof r?.address === 'string' && r.address.includes('@'))
    .map((r) => ({ name: String(r.name ?? ''), address: r.address.trim() }))
  console.log(`[plugin:${pluginId}] Schreibfenster vorbelegt (${to.length} Empfänger, ${attachments?.length ?? 0} Anhänge)`)
  useEmailStore.getState().setComposeState({
    to,
    subject: String(draft.subject ?? ''),
    body: String(draft.body ?? ''),
    accountId: accounts[0].id,
    attachments: attachments ?? [],
  })
}

/**
 * Link aus einem Renderer-Plugin öffnen (Excalidraw-Element-Links, Codex F07). Nur während einer Nutzeraktion:
 * ohne Klick soll ein Plugin weder Notizen umschalten noch den Browser öffnen. Notizen über denselben Weg wie
 * Wikilinks im Editor (Notiz → sonst Plugin-Datei), extern über `open-external` (http/https/mailto).
 */
async function openPluginLink(link: string): Promise<'opened' | 'not-found' | 'refused'> {
  if (!navigator.userActivation?.isActive) return 'refused'
  const target = classifyPluginLink(link)
  if (target.kind === 'refused') return 'refused'
  if (target.kind === 'external') {
    return (await window.electronAPI.openExternal(target.url)) ? 'opened' : 'refused'
  }
  const { notes, fileTree, selectNote } = useNotesStore.getState()
  const note = findNoteForWikilink(target.target, notes)
  if (note) {
    selectNote(note.id)
    return 'opened'
  }
  const pluginFile = resolvePluginFileLink(target.target, fileTree)
  if (pluginFile) {
    useTabStore.getState().openPluginEditorTab(
      pluginFile.pluginEditor.pluginId,
      pluginFile.path,
      pluginFile.pluginEditor.editorId,
      pluginFile.name,
    )
    return 'opened'
  }
  // PDF im Vault (API ≥0.2.3, z. B. eine Rechnung aus Faktura) → eingebauter PDF-Betrachter. Nur exakte
  // Pfade, die im Dateibaum stehen — kein Namensraten über Ordner hinweg.
  if (/\.pdf$/i.test(target.target) && vaultFileExists(target.target, fileTree)) {
    useNotesStore.getState().selectPdf(target.target)
    return 'opened'
  }
  return 'not-found'
}

function vaultFileExists(relPath: string, tree: Array<{ path: string; isDirectory?: boolean; children?: unknown[] }>): boolean {
  const want = relPath.replace(/\\/g, '/').toLowerCase()
  const stack = [...tree]
  while (stack.length) {
    const e = stack.pop()!
    if (e.isDirectory) { stack.push(...((e.children ?? []) as typeof tree)); continue }
    if (e.path.replace(/\\/g, '/').toLowerCase() === want) return true
  }
  return false
}

function effectiveTheme(): 'light' | 'dark' {
  const t = useUIStore.getState().theme
  if (t === 'light' || t === 'dark') return t
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

const STYLE_ATTR = 'data-plugin-renderer'

const prodEnv: RendererLoaderEnv = {
  fetchList: () => window.electronAPI.pluginRenderers(),
  fetchEntry: (pluginId) => window.electronAPI.pluginRendererEntry(pluginId),
  invokeHost: (instanceId, op, args) => window.electronAPI.pluginHost(instanceId, op, args),
  ackActivated: async (ack) => {
    await window.electronAPI.pluginRendererActivated(ack)
  },
  createModuleUrl: (code) => URL.createObjectURL(new Blob([code], { type: 'text/javascript' })),
  importUrl: (url) => import(/* @vite-ignore */ url),
  revokeModuleUrl: (url) => URL.revokeObjectURL(url),
  applyStyles: (pluginId, css) => {
    let el = document.head.querySelector<HTMLStyleElement>(`style[${STYLE_ATTR}="${CSS.escape(pluginId)}"]`)
    if (!el) {
      el = document.createElement('style')
      el.setAttribute(STYLE_ATTR, pluginId)
      document.head.appendChild(el)
    }
    el.textContent = css
  },
  removeStyles: (pluginId) => {
    document.head.querySelector(`style[${STYLE_ATTR}="${CSS.escape(pluginId)}"]`)?.remove()
  },
  getTheme: effectiveTheme,
  openLink: openPluginLink,
  invokeAction: async (pluginId, actionId, payload) => {
    const res = await window.electronAPI.pluginInvoke(pluginId, actionId, payload)
    if (!res.ok) throw new Error(res.error ?? `Plugin-Aufruf '${actionId}' fehlgeschlagen`)
    return res.data
  },
  composeMail: composeMailFromPlugin,
  onThemeChange: (cb) => {
    let last = effectiveTheme()
    const fire = (): void => {
      const next = effectiveTheme()
      if (next !== last) {
        last = next
        cb(next)
      }
    }
    const unsubStore = useUIStore.subscribe(fire)
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    mq?.addEventListener('change', fire)
    return () => {
      unsubStore()
      mq?.removeEventListener('change', fire)
    }
  },
}

export const externalRendererRegistry = new ExternalRendererRegistry(prodEnv)

let initialized = false
/** Einmaliger Boot-Init (main.tsx): initial syncen + auf Lifecycle-Pushes + Teardown-Requests abonnieren. */
export function initExternalRenderers(): void {
  if (initialized) return
  initialized = true
  window.electronAPI.onPluginRenderersChanged(() => {
    void externalRendererRegistry.sync()
  })
  // Gerichteter Teardown (F15/F16): Main fordert das Entladen EINER instanceId an; wir disposen und acken
  // den §5.5-Ausgang zurück, damit Main erst bei `success` den Nachfolger startet/committet.
  window.electronAPI.onPluginRendererTeardown((rendererInstanceId) => {
    void externalRendererRegistry.teardownInstance(rendererInstanceId).then((outcome) => {
      void window.electronAPI.pluginRendererTornDown({ rendererInstanceId, outcome })
    })
  })
  void externalRendererRegistry.sync()
}

/** React-Hook: re-rendert, sobald sich der Ladezustand der Renderer-Plugins ändert. */
export function useRendererRevision(): number {
  return useSyncExternalStore(
    externalRendererRegistry.subscribe,
    externalRendererRegistry.getRevision,
    externalRendererRegistry.getRevision,
  )
}
