// Gespeicherte Gespräche des Petrol-Chats in der linken Seitenleiste (Teil 1,
// docs/codex-collab/chat-verlauf-notizen-bilder.md; Design: chat-verlauf-seitenleiste-design.md).
//
// Nutzer 05.11.2026: nicht über dem Chat, sondern links; Vorbild ist die Liste der Codex-App —
// eine ruhige Zeile je Gespräch (nur Titel), beim Überfahren zwei leise Knöpfe (Anheften,
// Archivieren), Details in einer Karte daneben. Umbenennen und Löschen im Menü (Rechtsklick, Taste
// „Kontextmenü“/Umschalt+F10). Oben „Angeheftet“, darunter Heute / Gestern / Letzte 7 Tage / Älter;
// Archiviertes in einer eigenen Ansicht über „…“. Kein `title`-Attribut: die App macht daraus
// einen ::after-Tooltip, den der Scrollbereich abschneidet (Nutzer-Screenshot 05.11.2026).
//
// Wird nicht gespeichert, sagt der Abschnitt es — nie still. Zerstörendes nur mit Bestätigung in
// der Zeile, der Fokus steht dann zuerst auf „Abbrechen“ (Codex F08).

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation, type TranslationKey } from '../../utils/translations'
import { useUIStore } from '../../stores/uiStore'
import { useNotesStore } from '../../stores/notesStore'
import { useTabStore } from '../../stores/tabStore'
import { usePetrolChatStore } from '../../stores/petrolChatStore'
import type { PetrolConvListItem } from '../../../shared/petrolChat'
import { archivedCount, CHAT_SEARCH_FROM, groupConversations, nextMidnight, type ChatGroupKey } from '../../utils/petrolChatGroups'

function openSettingsAt(tab: 'ai', anchor: string) {
  window.dispatchEvent(new CustomEvent('mindgraph:openSettings', { detail: { tab, anchor } }))
}

/** Kennung des Abschnittskopfs — der Knopf „Gespräche“ im Chat springt dorthin. */
export const PETROL_HISTORY_HEAD_ID = 'petrol-history-head'

const GROUP_LABEL: Record<ChatGroupKey, TranslationKey> = {
  pinned: 'petrolChat.historyGroupPinned',
  today: 'petrolChat.historyGroupToday',
  yesterday: 'petrolChat.historyGroupYesterday',
  week: 'petrolChat.historyGroupWeek',
  older: 'petrolChat.historyGroupOlder',
  archived: 'petrolChat.historyGroupArchived'
}

/** Ist der Abschnitt gerade sichtbar? (Agent-Tab vorne, Chat-Modus.) Auch für den Kopf „Notizen“. */
export function usePetrolHistoryVisible(): boolean {
  const agentTabId = useTabStore(s => s.tabs.find(tab => tab.type === 'agent')?.id ?? null)
  const agentActive = useTabStore(s => !!agentTabId && s.activeTabId === agentTabId)
  const mode = usePetrolChatStore(s => (agentTabId ? s.scopes[agentTabId]?.mode : undefined))
  const defaultMode = useUIStore(s => s.agentTabDefaultMode)
  return !!agentTabId && agentActive && (mode ?? defaultMode) === 'chat'
}

type Confirm = { kind: 'delete'; id: string } | { kind: 'all' } | null
type Menu = { kind: 'head'; x: number; y: number } | { kind: 'row'; id: string; x: number; y: number } | null

export function PetrolChatHistory({ noVault = false }: { noVault?: boolean }) {
  const { t, language } = useTranslation()
  const vaultPath = useNotesStore(s => s.vaultPath)
  const agentTabId = useTabStore(s => s.tabs.find(tab => tab.type === 'agent')?.id ?? null)
  const scope = usePetrolChatStore(s => (agentTabId ? s.scopes[agentTabId] : undefined))
  const busy = usePetrolChatStore(s => !!s.activeScope)
  const open = useUIStore(s => s.petrolChatHistoryOpen)
  const setOpen = useUIStore(s => s.setPetrolChatHistoryOpen)
  const visible = usePetrolHistoryVisible()

  const [items, setItems] = useState<PetrolConvListItem[] | null>(null)
  const [mode, setMode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [view, setViewRaw] = useState<'list' | 'archive'>('list')
  const [query, setQuery] = useState('')
  // Ansicht wechseln leert die Suche — sonst filterte ein unsichtbarer Begriff die andere Ansicht (Design F15).
  const setView = (v: 'list' | 'archive') => { setViewRaw(v); setQuery('') }
  // Tageswechsel: um Mitternacht neu gruppieren (Design F16).
  const [now, setNow] = useState(() => Date.now())
  const [confirm, setConfirm] = useState<Confirm>(null)
  const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null)
  const [menu, setMenu] = useState<Menu>(null)
  const [hover, setHover] = useState<{ item: PetrolConvListItem; top: number; left: number; rowBottom: number } | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const menuReturn = useRef<HTMLElement | null>(null)
  const hoverTimer = useRef<number | null>(null)
  // Nur die neueste Listenantwort zählt (F96).
  const loadSeq = useRef(0)
  // Nach Löschen/Archivieren: Fokus auf den Eintrag an derselben Stelle (F95).
  const focusIndex = useRef<number | null>(null)

  const currentId = scope?.conv?.id ?? null
  const storage = scope?.storage ?? null
  const revision = `${currentId ?? ''}|${scope?.messages.length ?? 0}|${scope?.streaming === null ? 'idle' : 'run'}`

  const load = useCallback(async () => {
    if (noVault) return
    const seq = ++loadSeq.current
    try {
      const r = await window.electronAPI.petrolConvList(vaultPath)
      if (seq !== loadSeq.current) return
      if (!r.ok) { setError(r.error); return }
      setItems(r.items)
      setMode(r.storage)
      setError(null)
    } catch (e) {
      if (seq === loadSeq.current) setError(e instanceof Error ? e.message : String(e))
    }
  }, [vaultPath, noVault])

  useEffect(() => {
    if (!visible || !open) return
    void load()
  }, [load, visible, open, revision])

  // Änderungen aus einem anderen Fenster (Titel, Anheften, Archiv, Löschen) — Design F26.
  useEffect(() => {
    if (!visible) return
    window.electronAPI.onPetrolConvChanged?.(() => { void load() })
  }, [load, visible])

  useEffect(() => {
    const id = window.setTimeout(() => setNow(Date.now()), Math.max(1000, nextMidnight(now) - Date.now() + 1000))
    return () => window.clearTimeout(id)
  }, [now])

  // Karte und Menü hängen an Bildschirmkoordinaten: bei Größenänderung schließen; Escape schließt die Karte (Design F18/F20).
  useEffect(() => {
    const close = () => { setHover(null); setMenu(null) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setHover(null) }
    window.addEventListener('resize', close)
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('resize', close); window.removeEventListener('keydown', onKey) }
  }, [])

  // Vault gewechselt: alte Einträge sofort weg (F96).
  // Laufende Listenanfragen des alten Vaults verwerfen (Design F17): ihre Antwort darf nie mehr landen.
  useEffect(() => { loadSeq.current++; setItems(null); setMode(null); setConfirm(null); setRenaming(null); setViewRaw('list'); setQuery('') }, [vaultPath])

  const rows = useMemo(() => groupConversations(items ?? [], now, { archived: view === 'archive', query }), [items, view, query, now])
  const activeCount = (items ?? []).filter(it => !it.archived).length
  const archived = archivedCount(items ?? [])

  useEffect(() => {
    if (focusIndex.current === null || !items) return
    const list = rootRef.current?.querySelectorAll<HTMLElement>('.petrol-history-open')
    const target = list?.[Math.min(focusIndex.current, (list?.length ?? 1) - 1)] ?? document.getElementById(PETROL_HISTORY_HEAD_ID)
    target?.focus()
    focusIndex.current = null
  }, [items, view])

  // Menü: außerhalb klicken schließt; Escape schließt und gibt den Fokus zurück.
  useEffect(() => {
    if (!menu) return
    const onDown = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.petrol-history-menu')) setMenu(null)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [menu])

  useEffect(() => () => { if (hoverTimer.current) window.clearTimeout(hoverTimer.current) }, [])

  if (!visible || !agentTabId) return null
  const chat = usePetrolChatStore.getState
  const loc = language === 'en' ? 'en-GB' : 'de-DE'
  const fmtLong = (at: number) => new Date(at).toLocaleString(loc, { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  const fmtExact = (at: number) => new Date(at).toLocaleString(loc, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const label = (it: PetrolConvListItem) => (it.unreadable ? `${t('petrolChat.historyUnreadable')} · ${fmtExact(it.updatedAt)}` : it.title)
  const describe = (it: PetrolConvListItem) => [fmtLong(it.updatedAt), it.model, it.pinned ? t('petrolChat.historyPinnedHint') : '', it.unreadable ? t('petrolChat.historyUnreadableHint') : ''].filter(Boolean).join(' · ')
  const focusInput = () => requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>('.petrol-chat-compose textarea')?.focus())

  const closeMenu = (returnFocus = true) => {
    setMenu(null)
    if (returnFocus) requestAnimationFrame(() => menuReturn.current?.focus())
  }
  const openMenuAt = (m: NonNullable<Menu>, from: HTMLElement) => {
    menuReturn.current = from
    hideHover()
    setMenu(m)
  }
  const indexOf = (id: string) => Math.max(0, rows.flatMap(g => g.items).findIndex(it => it.id === id))

  const openConv = async (id: string) => {
    setError(null)
    const err = await chat().openConversation(agentTabId, id, vaultPath)
    if (err) setError(err)
    else focusInput()
  }
  const update = async (id: string, patch: { title?: string; pinned?: boolean; archived?: boolean }, refocus = true) => {
    if (refocus) focusIndex.current = indexOf(id)
    setError(null)
    // Jeder Fehler wird sichtbar — auch ein gescheitertes Speichern (`storage: failed`) und ein
    // Aufruf, den der Main nicht kennt (Design F25; Nutzer: „Archivieren funktioniert nicht“).
    try {
      const r = await window.electronAPI.petrolConvUpdate(vaultPath, id, patch)
      if (!r.ok) setError(r.error)
      else if (r.storage === 'failed') setError(t('petrolChat.historyUpdateFailed'))
      // Das offene Gespräch archiviert: ein neues beginnen, damit nichts unsichtbar weiterläuft (Design F22).
      else if (patch.archived === true && id === currentId) chat().clear(agentTabId)
    } catch (e) {
      setError(`${t('petrolChat.historyUpdateFailed')} (${e instanceof Error ? e.message : String(e)})`)
    }
    await load()
  }
  const remove = async (id: string) => {
    setConfirm(null)
    focusIndex.current = indexOf(id)
    const r = await window.electronAPI.petrolConvDelete(vaultPath, id)
    if (!r.ok) { setError(r.error); return }
    if (id === currentId) chat().clear(agentTabId)
    await load()
  }
  const removeAll = async () => {
    setConfirm(null)
    const r = await window.electronAPI.petrolConvDeleteAll(vaultPath)
    if (!r.ok) { setError(r.error); return }
    focusIndex.current = 0
    setView('list')
    if (currentId) chat().clear(agentTabId)
    await load()
  }
  const saveRename = async () => {
    if (!renaming) return
    const { id, title } = renaming
    setRenaming(null)
    await update(id, { title }, true)
  }

  const showHover = (it: PetrolConvListItem, el: HTMLElement, delay: number) => {
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current)
    hoverTimer.current = window.setTimeout(() => {
      const r = el.getBoundingClientRect()
      const sidebar = el.closest('.sidebar')?.getBoundingClientRect()
      setHover({ item: it, top: r.top, left: (sidebar?.right ?? r.right) + 8, rowBottom: r.bottom })
    }, delay)
  }
  const hideHover = () => {
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current)
    hoverTimer.current = null
    setHover(null)
  }

  // Warum (nicht) gespeichert wird — immer sichtbar, wenn nicht (Codex F11/F12).
  const notice = noVault ? t('petrolChat.historyNoVault')
    : storage === 'failed' ? t('petrolChat.historySaveFailed')
      : mode === 'no-encryption' ? t('petrolChat.historyNoKey')
        : mode === 'basic-text' ? t('petrolChat.historyBasicText')
          : null

  const menuItems: Array<{ label: string; onSelect: () => void; danger?: boolean }> = []
  if (menu?.kind === 'head') {
    menuItems.push(view === 'archive'
      ? { label: t('petrolChat.historyBackToList'), onSelect: () => { setView('list'); closeMenu() } }
      : { label: t('petrolChat.historyShowArchived', { n: archived }), onSelect: () => { setView('archive'); closeMenu() } })
    // Wo und wie lange gespeichert wird (Backup, Aufbewahrung) — sichtbar erreichbar statt nur im Tooltip (Codex F12).
    menuItems.push({ label: t('petrolChat.historyStorageSettings'), onSelect: () => { closeMenu(false); openSettingsAt('ai', 'ai-chat-history') } })
    if (items?.length) menuItems.push({ label: t('petrolChat.historyDeleteAll'), danger: true, onSelect: () => { closeMenu(false); setConfirm({ kind: 'all' }) } })
  } else if (menu?.kind === 'row') {
    const it = items?.find(x => x.id === menu.id)
    if (it) {
      if (!it.unreadable) {
        menuItems.push({ label: t('petrolChat.historyRename'), onSelect: () => { closeMenu(false); setRenaming({ id: it.id, title: it.title }) } })
        menuItems.push({ label: t(it.pinned ? 'petrolChat.historyUnpin' : 'petrolChat.historyPin'), onSelect: () => { closeMenu(false); void update(it.id, { pinned: !it.pinned }) } })
        menuItems.push({ label: t(it.archived ? 'petrolChat.historyRestore' : 'petrolChat.historyArchive'), onSelect: () => { closeMenu(false); void update(it.id, { archived: !it.archived }) } })
      }
      menuItems.push({ label: t('petrolChat.historyDelete'), danger: true, onSelect: () => { closeMenu(false); setConfirm({ kind: 'delete', id: it.id }) } })
    }
  }

  const rowKeys = (e: React.KeyboardEvent<HTMLButtonElement>, it: PetrolConvListItem) => {
    if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) {
      e.preventDefault()
      const r = e.currentTarget.getBoundingClientRect()
      openMenuAt({ kind: 'row', id: it.id, x: r.left + 24, y: r.bottom }, e.currentTarget)
    }
  }

  const showSearch = !noVault && (view === 'list' ? activeCount : archived) >= CHAT_SEARCH_FROM

  return (
    <div ref={rootRef} className={`petrol-history ${open ? 'is-open' : ''}`} role="region" aria-labelledby={PETROL_HISTORY_HEAD_ID}>
      <div className="petrol-history-head">
        <button id={PETROL_HISTORY_HEAD_ID} type="button" className="petrol-history-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
          <svg className="petrol-history-chevron" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
          <span>{t(view === 'archive' ? 'petrolChat.historyGroupArchived' : 'petrolChat.historyTitle')}</span>
          {view === 'list' && activeCount > 0 && <span className="petrol-history-count">{activeCount}</span>}
        </button>
        {!noVault && (
          <span className="petrol-history-head-actions">
            <button
              type="button"
              className="petrol-history-headbtn"
              aria-label={t('petrolChat.historyMenu')}
              aria-haspopup="menu"
              aria-expanded={menu?.kind === 'head'}
              onClick={e => { const r = e.currentTarget.getBoundingClientRect(); menu?.kind === 'head' ? closeMenu() : openMenuAt({ kind: 'head', x: r.left, y: r.bottom + 4 }, e.currentTarget) }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="19" cy="12" r="1.7" /></svg>
            </button>
            <button
              type="button"
              className="petrol-history-headbtn"
              aria-label={t('petrolChat.newChat')}
              disabled={!scope?.messages.length}
              onClick={() => { chat().clear(agentTabId); focusInput() }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
            </button>
          </span>
        )}
      </div>

      {open && (
        <>
          {notice && <div className="petrol-history-notice" role="status">{notice}</div>}
          {error && <div className="petrol-history-notice is-error" role="alert">{error}</div>}
          {confirm?.kind === 'all' && (
            <div className="petrol-history-confirm is-block">
              <span>{t('petrolChat.historyDeleteAllConfirm', { n: items?.length ?? 0 })}</span>
              <span className="petrol-history-confirm-btns">
                <button type="button" autoFocus className="petrol-history-act" onClick={() => setConfirm(null)}>{t('petrolChat.makeTaskCancel')}</button>
                <button type="button" className="petrol-history-act is-danger" onClick={() => void removeAll()}>{t('petrolChat.historyDeleteAll')}</button>
              </span>
            </div>
          )}
          {showSearch && (
            <div className="petrol-history-search">
              <input type="search" value={query} placeholder={t('petrolChat.historySearch')} aria-label={t('petrolChat.historySearch')} onChange={e => setQuery(e.target.value)} />
            </div>
          )}
          {!noVault && (items === null ? (
            <div className="petrol-history-empty" role="status">{t('petrolChat.historyLoading')}</div>
          ) : rows.length === 0 ? (
            <div className="petrol-history-empty" role="status">
              {query ? t('petrolChat.historyNoMatch') : view === 'archive' ? t('petrolChat.historyArchivedEmpty') : mode === 'on' ? t('petrolChat.historyEmptyHint') : null}
            </div>
          ) : (
            <div className="petrol-history-list" onScroll={() => { hideHover(); if (menu) setMenu(null) }}>
              {rows.map(group => (
                <div key={group.key} className="petrol-history-group" role="group" aria-label={t(GROUP_LABEL[group.key])}>
                  {view === 'list' && <div className="petrol-history-group-label" aria-hidden="true">{t(GROUP_LABEL[group.key])}</div>}
                  <ul>
                    {group.items.map(it => {
                      const isCurrent = it.id === currentId
                      const confirming = confirm?.kind === 'delete' && confirm.id === it.id
                      return (
                        <li
                          key={it.id}
                          className={`petrol-history-item ${isCurrent ? 'is-current' : ''} ${it.unreadable ? 'is-unreadable' : ''}`}
                          onMouseEnter={e => { if (!renaming && !confirming && !menu) showHover(it, e.currentTarget, 450) }}
                          onMouseLeave={hideHover}
                        >
                          {renaming?.id === it.id ? (
                            <form className="petrol-history-rename" onSubmit={e => { e.preventDefault(); void saveRename() }}>
                              <input
                                autoFocus
                                value={renaming.title}
                                maxLength={120}
                                aria-label={t('petrolChat.historyRename')}
                                onChange={e => setRenaming({ id: it.id, title: e.target.value })}
                                onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setRenaming(null); focusIndex.current = indexOf(it.id); setItems(x => (x ? [...x] : x)) } }}
                                onBlur={() => setRenaming(null)}
                              />
                            </form>
                          ) : confirming ? (
                            <div className="petrol-history-confirm">
                              <span>{t('petrolChat.historyDeleteConfirm')}</span>
                              <span className="petrol-history-confirm-btns">
                                <button type="button" autoFocus className="petrol-history-act" onClick={() => { setConfirm(null); focusIndex.current = indexOf(it.id); setItems(x => (x ? [...x] : x)) }}>{t('petrolChat.makeTaskCancel')}</button>
                                <button type="button" className="petrol-history-act is-danger" onClick={() => void remove(it.id)}>{t('petrolChat.historyDelete')}</button>
                              </span>
                            </div>
                          ) : (
                            <>
                              <button
                                type="button"
                                className="petrol-history-open"
                                disabled={it.unreadable || (busy && !isCurrent)}
                                aria-current={isCurrent ? 'true' : undefined}
                                aria-describedby={`petrol-hd-${it.id}`}
                                onClick={() => { hideHover(); void openConv(it.id) }}
                                onContextMenu={e => { e.preventDefault(); openMenuAt({ kind: 'row', id: it.id, x: e.clientX, y: e.clientY }, e.currentTarget) }}
                                onKeyDown={e => rowKeys(e, it)}
                                onFocus={e => { if (e.currentTarget.matches(':focus-visible')) showHover(it, e.currentTarget.parentElement!, 0) }}
                                onBlur={hideHover}
                              >
                                <span className="petrol-history-item-title">{label(it)}</span>
                              </button>
                              {/* Dauerhafte Beschreibung für Bildschirmleser; die Karte ist nur visuell (Design F19). */}
                              <span id={`petrol-hd-${it.id}`} className="petrol-sr-only">{describe(it)}</span>
                              {/* Zwei leise Knöpfe an fester Stelle (Codex F07, Vorbild Codex-App); Umbenennen/Löschen im Menü. */}
                              <span className="petrol-history-actions">
                                {view === 'archive' ? (
                                  <>
                                    {!it.unreadable && <IconBtn label={`${t('petrolChat.historyRestore')}: ${label(it)}`} onClick={() => void update(it.id, { archived: false })} icon="restore" />}
                                    <IconBtn label={`${t('petrolChat.historyDelete')}: ${label(it)}`} onClick={() => setConfirm({ kind: 'delete', id: it.id })} icon="trash" />
                                  </>
                                ) : it.unreadable ? (
                                  <IconBtn label={`${t('petrolChat.historyDelete')}: ${label(it)}`} describedBy={`petrol-hd-${it.id}`} onClick={() => setConfirm({ kind: 'delete', id: it.id })} icon="trash" />
                                ) : (
                                  <>
                                    <IconBtn label={`${t(it.pinned ? 'petrolChat.historyUnpin' : 'petrolChat.historyPin')}: ${it.title}`} pressed={!!it.pinned} onClick={() => void update(it.id, { pinned: !it.pinned })} icon="pin" />
                                    <IconBtn label={`${t('petrolChat.historyArchive')}: ${it.title}`} onClick={() => void update(it.id, { archived: true })} icon="archive" />
                                  </>
                                )}
                              </span>
                            </>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ))}
            </div>
          ))}
          {!noVault && mode === 'on' && storage !== 'failed' && <div className="petrol-history-info">{t('petrolChat.historyInfo')}</div>}
        </>
      )}

      {menu && menuItems.length > 0 && createPortal(
        <HistoryMenu x={menu.x} y={menu.y} items={menuItems} label={t(menu.kind === 'head' ? 'petrolChat.historyMenu' : 'petrolChat.historyRowMenu')} onClose={() => closeMenu()} onTab={back => { setMenu(null); focusNextFrom(menuReturn.current, back) }} />,
        document.body
      )}
      {hover && createPortal(
        <HoverCard top={hover.top} left={hover.left} rowBottom={hover.rowBottom}>
          <div className="petrol-history-card-title">{label(hover.item)}</div>
          <div className="petrol-history-card-meta">{[fmtLong(hover.item.updatedAt), hover.item.model].filter(Boolean).join(' · ')}</div>
          {hover.item.pinned && <div className="petrol-history-card-meta">{t('petrolChat.historyPinnedHint')}</div>}
          {hover.item.unreadable && <div className="petrol-history-card-meta">{t('petrolChat.historyUnreadableHint')}</div>}
        </HoverCard>,
        document.body
      )}
    </div>
  )
}

/** Karte neben der Zeile — bleibt im Fenster: zu tief → nach oben, zu breit → rechtsbündig (Design F18). Nur visuell. */
function HoverCard({ top, left, rowBottom, children }: { top: number; left: number; rowBottom: number; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ top, left })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const y = top + r.height > window.innerHeight - 8 ? Math.max(8, rowBottom - r.height) : top
    const x = Math.max(8, Math.min(left, window.innerWidth - r.width - 8))
    setPos({ top: y, left: x })
  }, [top, left, rowBottom])
  return <div ref={ref} aria-hidden="true" className="petrol-history-card" style={pos}>{children}</div>
}

function IconBtn({ label, onClick, icon, pressed, describedBy }: { label: string; onClick: () => void; icon: 'pin' | 'archive' | 'restore' | 'trash'; pressed?: boolean; describedBy?: string }) {
  const paths: Record<typeof icon, React.ReactNode> = {
    pin: <><path d="M12 17v5" /><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" /></>,
    archive: <><rect x="3" y="4" width="18" height="4" rx="1" /><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8" /><path d="M10 12h4" /></>,
    restore: <><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /></>,
    trash: <><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /></>
  }
  return (
    <button type="button" className={`petrol-history-icon ${pressed ? 'is-on' : ''}`} aria-label={label} aria-pressed={pressed} aria-describedby={describedBy} onClick={onClick}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[icon]}</svg>
    </button>
  )
}

/** Kleines Menü (Rechtsklick, „…“): Pfeiltasten, Enter, Escape; Position bleibt im Fenster. */
function HistoryMenu({ x, y, items, label, onClose, onTab }: { x: number; y: number; items: Array<{ label: string; onSelect: () => void; danger?: boolean }>; label: string; onClose: () => void; onTab: (back: boolean) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x, y })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setPos({ x: Math.min(x, window.innerWidth - r.width - 8), y: Math.min(y, window.innerHeight - r.height - 8) })
    el.querySelector<HTMLButtonElement>('button')?.focus()
  }, [x, y])
  const move = (dir: 1 | -1) => {
    const btns = [...(ref.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])]
    const i = btns.indexOf(document.activeElement as HTMLButtonElement)
    btns[(i + dir + btns.length) % btns.length]?.focus()
  }
  return (
    <div
      ref={ref}
      className="petrol-history-menu"
      role="menu"
      aria-label={label}
      style={{ left: pos.x, top: pos.y }}
      onKeyDown={e => {
        if (e.key === 'Escape') { e.preventDefault(); onClose() }
        else if (e.key === 'ArrowDown') { e.preventDefault(); move(1) }
        else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1) }
        // Tab schließt und geht in der normalen Reihenfolge weiter — vom Auslöser aus (Design F20).
        else if (e.key === 'Tab') { e.preventDefault(); onTab(e.shiftKey) }
      }}
    >
      {items.map(it => (
        <button key={it.label} type="button" role="menuitem" className={it.danger ? 'is-danger' : ''} onClick={it.onSelect}>{it.label}</button>
      ))}
    </div>
  )
}

/** Fokus auf das nächste (bzw. vorige) fokussierbare Element nach `from` in Dokumentreihenfolge. */
function focusNextFrom(from: HTMLElement | null, back: boolean): void {
  if (!from) return
  const all = [...document.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
    .filter(el => el.offsetParent !== null && !el.closest('.petrol-history-menu'))
  const i = all.indexOf(from)
  const target = i < 0 ? from : all[i + (back ? -1 : 1)] ?? from
  requestAnimationFrame(() => target.focus())
}
