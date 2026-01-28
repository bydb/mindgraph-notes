import React, { memo } from 'react'
import { useTabStore, type Tab } from '../../stores/tabStore'
import { useTranslation } from '../../utils/translations'

interface TabBarProps {
  className?: string
}

// File icon for editor tabs
const FileIcon: React.FC = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
    <path
      d="M4 2C3.45 2 3 2.45 3 3V13C3 13.55 3.45 14 4 14H12C12.55 14 13 13.55 13 13V5.41C13 5.15 12.89 4.9 12.71 4.71L10.29 2.29C10.1 2.11 9.85 2 9.59 2H4Z"
      fill="currentColor"
      opacity="0.6"
    />
    <path
      d="M5 7H11M5 9H11M5 11H9"
      stroke="var(--bg-primary)"
      strokeWidth="1"
      strokeLinecap="round"
    />
  </svg>
)

// Canvas/Graph icon for canvas tabs
const CanvasIcon: React.FC = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="4" cy="4" r="2" fill="currentColor" opacity="0.6" />
    <circle cx="12" cy="4" r="2" fill="currentColor" opacity="0.6" />
    <circle cx="8" cy="12" r="2" fill="currentColor" opacity="0.6" />
    <line x1="5.5" y1="5" x2="7" y2="10.5" />
    <line x1="10.5" y1="5" x2="9" y2="10.5" />
  </svg>
)

// Close icon
const CloseIcon: React.FC = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <line x1="2" y1="2" x2="8" y2="8" />
    <line x1="8" y1="2" x2="2" y2="8" />
  </svg>
)

interface TabItemProps {
  tab: Tab
  isActive: boolean
  onActivate: () => void
  onClose: (e: React.MouseEvent) => void
}

const TabItem: React.FC<TabItemProps> = memo(({ tab, isActive, onActivate, onClose }) => {
  const { t } = useTranslation()

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation()
    onClose(e)
  }

  const handleMiddleClick = (e: React.MouseEvent) => {
    if (e.button === 1) {
      e.preventDefault()
      onClose(e)
    }
  }

  const isCanvasType = tab.type === 'canvas' || tab.type === 'global-canvas'

  // Translate title for global-canvas tabs
  const displayTitle = tab.type === 'global-canvas' ? t('tabs.allNotes') : tab.title

  return (
    <div
      className={`tab-item ${isActive ? 'active' : ''} ${isCanvasType ? 'canvas-tab' : 'editor-tab'}`}
      onClick={onActivate}
      onMouseDown={handleMiddleClick}
      title={displayTitle}
    >
      <span className="tab-icon">
        {isCanvasType ? <CanvasIcon /> : <FileIcon />}
      </span>
      <span className="tab-title">{displayTitle}</span>
      <button
        className="tab-close"
        onClick={handleClose}
        title={t('common.close')}
      >
        <CloseIcon />
      </button>
    </div>
  )
})

TabItem.displayName = 'TabItem'

export const TabBar: React.FC<TabBarProps> = memo(({ className }) => {
  const { tabs, activeTabId, setActiveTab, closeTab } = useTabStore()

  // Only show TabBar if there are tabs
  if (tabs.length === 0) {
    return null
  }

  return (
    <div className={`tab-bar ${className || ''}`}>
      <div className="tab-bar-content">
        {tabs.map(tab => (
          <TabItem
            key={tab.id}
            tab={tab}
            isActive={tab.id === activeTabId}
            onActivate={() => setActiveTab(tab.id)}
            onClose={() => closeTab(tab.id)}
          />
        ))}
      </div>
    </div>
  )
})

TabBar.displayName = 'TabBar'

export default TabBar
