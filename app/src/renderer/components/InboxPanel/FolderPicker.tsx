import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { EmailFolder } from '../../../shared/types'
import { useEmailStore } from '../../stores/emailStore'
import { useUIStore } from '../../stores/uiStore'
import { useTranslation } from '../../utils/translations'

interface FolderPickerProps {
  /** Wird gerufen nachdem der User einen anderen Folder gewählt hat. Auslöser für Fetch. */
  onFolderChange?: (accountId: string, folder: string) => void
}

// Reihenfolge der bekannten SPECIAL-USE-Flags für die Sortierung im Dropdown.
const SPECIAL_USE_ORDER: Record<string, number> = {
  '\\Inbox': 0,
  '\\Drafts': 1,
  '\\Sent': 2,
  '\\Junk': 3,
  '\\Trash': 4,
  '\\Archive': 5,
  '\\All': 6,
  '\\Flagged': 7
}

function sortFolders(folders: EmailFolder[]): EmailFolder[] {
  return [...folders].sort((a, b) => {
    // INBOX immer ganz oben (auch ohne SPECIAL-USE-Flag).
    const aIsInbox = a.path === 'INBOX' || a.specialUse === '\\Inbox'
    const bIsInbox = b.path === 'INBOX' || b.specialUse === '\\Inbox'
    if (aIsInbox && !bIsInbox) return -1
    if (bIsInbox && !aIsInbox) return 1

    const aSpecial = a.specialUse ? (SPECIAL_USE_ORDER[a.specialUse] ?? 99) : 99
    const bSpecial = b.specialUse ? (SPECIAL_USE_ORDER[b.specialUse] ?? 99) : 99
    if (aSpecial !== bSpecial) return aSpecial - bSpecial

    return a.path.localeCompare(b.path, undefined, { sensitivity: 'base', numeric: true })
  })
}

function folderDisplayName(folder: EmailFolder): string {
  if (folder.path === 'INBOX') return 'Inbox'
  const segs = folder.path.split(folder.delimiter || '/').filter(Boolean)
  return segs[segs.length - 1] || folder.path
}

function folderDepth(folder: EmailFolder): number {
  const segs = folder.path.split(folder.delimiter || '/').filter(Boolean)
  // INBOX-Prefix (Courier/Dovecot) zählt nicht als Verschachtelung.
  return Math.max(0, segs.length - 1)
}

function folderIcon(folder: { path: string; specialUse?: string }): React.ReactNode {
  const su = folder.specialUse
  const isInbox = folder.path === 'INBOX' || su === '\\Inbox'

  if (isInbox) {
    return (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
        <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
      </svg>
    )
  }
  if (su === '\\Sent') {
    return (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="22" y1="2" x2="11" y2="13" />
        <polygon points="22 2 15 22 11 13 2 9 22 2" />
      </svg>
    )
  }
  if (su === '\\Drafts') {
    return (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
      </svg>
    )
  }
  if (su === '\\Trash') {
    return (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6" />
      </svg>
    )
  }
  if (su === '\\Junk') {
    return (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
      </svg>
    )
  }
  if (su === '\\Archive' || su === '\\All') {
    return (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="21 8 21 21 3 21 3 8" />
        <rect x="1" y="3" width="22" height="5" />
        <line x1="10" y1="12" x2="14" y2="12" />
      </svg>
    )
  }
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  )
}

export const FolderPicker: React.FC<FolderPickerProps> = ({ onFolderChange }) => {
  const { t } = useTranslation()
  const accounts = useUIStore(s => s.email.accounts)
  const activeFolders = useUIStore(s => s.email.activeFolders) || {}
  const folders = useEmailStore(s => s.folders)
  const foldersLoading = useEmailStore(s => s.foldersLoading)
  const foldersError = useEmailStore(s => s.foldersError)
  const loadFolders = useEmailStore(s => s.loadFolders)
  const setActiveFolder = useEmailStore(s => s.setActiveFolder)

  const [openFor, setOpenFor] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)

  // Pro Account: sortierte, selektierbare Folder-Liste.
  const sortedByAccount = useMemo(() => {
    const map: Record<string, EmailFolder[]> = {}
    for (const a of accounts) {
      const list = folders[a.id] || []
      map[a.id] = sortFolders(list.filter(f => f.selectable !== false))
    }
    return map
  }, [accounts, folders])

  useEffect(() => {
    if (!openFor) return
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpenFor(null)
      }
    }
    window.addEventListener('mousedown', handler)
    return () => window.removeEventListener('mousedown', handler)
  }, [openFor])

  const handleSelect = useCallback((accountId: string, folder: string) => {
    setOpenFor(null)
    if ((activeFolders[accountId] || 'INBOX') === folder) return
    setActiveFolder(accountId, folder)
    onFolderChange?.(accountId, folder)
  }, [activeFolders, setActiveFolder, onFolderChange])

  const handleToggle = useCallback((accountId: string) => {
    setOpenFor(prev => prev === accountId ? null : accountId)
    if (!folders[accountId]?.length) {
      loadFolders(accountId).catch(() => {})
    }
  }, [folders, loadFolders])

  const handleRefresh = useCallback((accountId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    loadFolders(accountId, true).catch(() => {})
  }, [loadFolders])

  if (accounts.length === 0) return null

  return (
    <div className="inbox-folder-bar" ref={containerRef}>
      {accounts.map(account => {
        const current = activeFolders[account.id] || 'INBOX'
        const sorted = sortedByAccount[account.id] || []
        const currentFolder = sorted.find(f => f.path === current)
        const displayName = currentFolder ? folderDisplayName(currentFolder) : (current === 'INBOX' ? 'Inbox' : current)
        const loading = !!foldersLoading[account.id]
        const error = foldersError[account.id]
        const isOpen = openFor === account.id

        return (
          <div key={account.id} className="inbox-folder-row">
            {accounts.length > 1 && (
              <span className="inbox-folder-account" title={account.user}>{account.name || account.user}</span>
            )}
            <button
              type="button"
              className={`inbox-folder-toggle ${isOpen ? 'open' : ''}`}
              onClick={() => handleToggle(account.id)}
              title={t('inbox.folders.switch')}
            >
              {folderIcon(currentFolder || { path: current })}
              <span className="inbox-folder-name">{displayName}</span>
              {loading && <span className="inbox-folder-spinner" aria-hidden="true" />}
              <svg className="inbox-folder-chevron" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                {isOpen ? <polyline points="18 15 12 9 6 15" /> : <polyline points="6 9 12 15 18 9" />}
              </svg>
            </button>
            {isOpen && (
              <div className="inbox-folder-dropdown" role="menu">
                <div className="inbox-folder-dropdown-header">
                  <span>{t('inbox.folders.title')}</span>
                  <button
                    type="button"
                    className="inbox-folder-refresh"
                    onClick={(e) => handleRefresh(account.id, e)}
                    title={t('inbox.folders.refresh')}
                    disabled={loading}
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={loading ? 'spinning' : ''}>
                      <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                      <path d="M3 3v5h5" />
                      <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                      <path d="M16 16h5v5" />
                    </svg>
                  </button>
                </div>
                {error && (
                  <div className="inbox-folder-error">{error}</div>
                )}
                {sorted.length === 0 && !loading && !error && (
                  <div className="inbox-folder-empty">{t('inbox.folders.empty')}</div>
                )}
                {sorted.map(f => {
                  const depth = folderDepth(f)
                  const isCurrent = f.path === current
                  return (
                    <button
                      key={f.path}
                      type="button"
                      className={`inbox-folder-item ${isCurrent ? 'is-current' : ''}`}
                      style={{ paddingLeft: `${10 + depth * 14}px` }}
                      onClick={() => handleSelect(account.id, f.path)}
                      title={f.path}
                    >
                      {folderIcon(f)}
                      <span className="inbox-folder-item-name">{folderDisplayName(f)}</span>
                      {isCurrent && (
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
