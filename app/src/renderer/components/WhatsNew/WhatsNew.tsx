import React, { useState, useEffect, useMemo } from 'react'
import MarkdownIt from 'markdown-it'
import { useUIStore } from '../../stores/uiStore'
import { useTranslation } from '../../utils/translations'

// Simple markdown renderer for changelog content
const md = new MarkdownIt({
  html: false,
  breaks: true,
  linkify: true
})

export const WhatsNew: React.FC = () => {
  const { whatsNewOpen, setWhatsNewOpen, setLastSeenVersion } = useUIStore()
  const [content, setContent] = useState<string>('')
  const [version, setVersion] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const { t } = useTranslation()

  useEffect(() => {
    if (whatsNewOpen) {
      loadContent()
    }
  }, [whatsNewOpen])

  const loadContent = async () => {
    setLoading(true)
    try {
      const ver = await window.electronAPI.getAppVersion()
      setVersion(ver)

      const changelog = await window.electronAPI.getWhatsNewContent(ver)
      setContent(changelog || '')
    } catch (error) {
      console.error('[WhatsNew] Failed to load content:', error)
      setContent('')
    } finally {
      setLoading(false)
    }
  }

  const handleDismiss = () => {
    // Update lastSeenVersion when closing
    if (version) {
      setLastSeenVersion(version)
    }
    setWhatsNewOpen(false)
  }

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      handleDismiss()
    }
  }

  const renderedContent = useMemo(() => {
    if (!content) return ''
    return md.render(content)
  }, [content])

  if (!whatsNewOpen) return null

  return (
    <div className="whats-new-overlay" onClick={handleOverlayClick}>
      <div className="whats-new-modal">
        <div className="whats-new-header">
          <h2>{t('whatsNew.title')} v{version}</h2>
          <button className="whats-new-close" onClick={handleDismiss} title={t('common.close')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="whats-new-content">
          {loading ? (
            <div className="whats-new-loading">{t('common.loading')}</div>
          ) : content ? (
            <div
              className="whats-new-markdown"
              dangerouslySetInnerHTML={{ __html: renderedContent }}
            />
          ) : (
            <div className="whats-new-empty">{t('whatsNew.noContent')}</div>
          )}
        </div>

        <div className="whats-new-footer">
          <button className="whats-new-dismiss" onClick={handleDismiss}>
            {t('whatsNew.dismiss')}
          </button>
        </div>
      </div>
    </div>
  )
}
