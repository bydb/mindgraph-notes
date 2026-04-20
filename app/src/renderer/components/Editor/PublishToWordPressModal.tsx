import React, { useCallback, useEffect, useMemo, useState } from 'react'
import MarkdownIt from 'markdown-it'
import taskLists from 'markdown-it-task-lists'
import footnote from 'markdown-it-footnote'
import type { Note, FileEntry } from '../../../shared/types'
import { useUIStore } from '../../stores/uiStore'
import { useTranslation } from '../../utils/translations'
import { parseFrontmatter } from '../../utils/metadataExtractor'
import { findImageInVault, isImageFile } from '../../utils/imageUtils'
import { sanitizeHtml } from '../../utils/sanitize'

interface PublishToWordPressModalProps {
  note: Note
  vaultPath: string
  fileTree: FileEntry[]
  onClose: () => void
}

interface WpResult {
  success: boolean
  postUrl?: string
  status?: 'draft' | 'publish' | 'pending'
  error?: string
}

function stripFrontmatter(content: string): string {
  return content.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, '')
}

function firstString(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (Array.isArray(value)) {
    const first = value.find(v => typeof v === 'string' && v.trim())
    return typeof first === 'string' ? first.trim() : null
  }
  return null
}

function resolveVaultImage(fileName: string, vaultPath: string, fileTree: FileEntry[]): string | null {
  const base = fileName.split('|')[0].trim()
  if (!base) return null
  if (base.startsWith('http://') || base.startsWith('https://') || base.startsWith('data:')) {
    return null
  }
  if (base.startsWith('.attachments/') || base.startsWith('.attachments\\')) {
    return `${vaultPath}/${base}`
  }
  if (base.includes('/') || base.includes('\\')) {
    return `${vaultPath}/${base}`
  }
  const rel = findImageInVault(base, fileTree)
  return rel ? `${vaultPath}/${rel}` : null
}

export const PublishToWordPressModal: React.FC<PublishToWordPressModalProps> = ({ note, vaultPath, fileTree, onClose }) => {
  const { t } = useTranslation()
  const marketing = useUIStore(s => s.marketing)

  const frontmatter = useMemo(() => parseFrontmatter(note.content), [note.content])
  const defaultTitle = (firstString(frontmatter.title) ?? note.title ?? '').trim()

  const [title, setTitle] = useState(defaultTitle)
  const [status, setStatus] = useState<'draft' | 'publish'>(marketing.defaultPostStatus)
  const [isPublishing, setIsPublishing] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const [result, setResult] = useState<WpResult | null>(null)

  const md = useMemo(() => {
    const instance = new MarkdownIt({ html: false, linkify: true, breaks: false, typographer: true })
    instance.use(taskLists, { enabled: false })
    instance.use(footnote)
    return instance
  }, [])

  const bodyMarkdown = useMemo(() => stripFrontmatter(note.content), [note.content])

  const previewHtml = useMemo(() => {
    const rawHtml = md.render(bodyMarkdown)
    return sanitizeHtml(rawHtml)
  }, [md, bodyMarkdown])

  const notConfigured = !marketing.wordpressUrl || !marketing.wordpressUser

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && !isPublishing) onClose()
  }, [isPublishing, onClose])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isPublishing) onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isPublishing, onClose])

  const handlePublish = useCallback(async () => {
    if (!title.trim() || isPublishing) return
    setIsPublishing(true)
    setResult(null)

    try {
      const imageMap = new Map<string, string>()

      const obsidianMatches = Array.from(bodyMarkdown.matchAll(/!\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g))
      const standardMatches = Array.from(bodyMarkdown.matchAll(/!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g))

      const candidates: string[] = []
      for (const m of obsidianMatches) candidates.push(m[1])
      for (const m of standardMatches) {
        const url = m[1]
        if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) continue
        if (!isImageFile(url.split('/').pop() || url)) continue
        candidates.push(url)
      }

      const uniqueCandidates = Array.from(new Set(candidates))
      for (let i = 0; i < uniqueCandidates.length; i++) {
        const ref = uniqueCandidates[i]
        setProgress(t('publishWp.uploadingImage').replace('{current}', String(i + 1)).replace('{total}', String(uniqueCandidates.length)))
        const absPath = resolveVaultImage(ref, vaultPath, fileTree)
        if (!absPath) continue
        const upload = await window.electronAPI.marketingUploadImage(marketing.wordpressUrl, marketing.wordpressUser, absPath)
        if (upload.success && upload.imageUrl) {
          imageMap.set(ref, upload.imageUrl)
        }
      }

      setProgress(t('publishWp.converting'))

      let processedMarkdown = bodyMarkdown.replace(/!\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g, (_match, fileRef: string, sizePart?: string) => {
        const remoteUrl = imageMap.get(fileRef)
        if (!remoteUrl) return ''
        const alt = fileRef.split('/').pop()?.replace(/\.[^.]+$/, '') || ''
        const sizeMatch = sizePart?.match(/^(\d+)(?:x(\d+))?$/)
        if (sizeMatch) {
          const w = sizeMatch[1]
          const h = sizeMatch[2]
          const attrs = h ? `width="${w}" height="${h}"` : `width="${w}"`
          return `<img src="${remoteUrl}" alt="${alt}" ${attrs} />`
        }
        return `![${alt}](${remoteUrl})`
      })

      processedMarkdown = processedMarkdown.replace(/(!\[[^\]]*\]\()([^)\s]+)((?:\s+"[^"]*")?\))/g, (match, pre: string, url: string, post: string) => {
        const remote = imageMap.get(url)
        return remote ? `${pre}${remote}${post}` : match
      })

      const rawHtml = md.render(processedMarkdown)
      const finalHtml = sanitizeHtml(rawHtml)

      setProgress(t('publishWp.publishing'))

      const res = await window.electronAPI.marketingPublishWordpress(
        marketing.wordpressUrl,
        marketing.wordpressUser,
        title.trim(),
        finalHtml,
        status
      )

      if (res.success) {
        setResult({ success: true, postUrl: res.postUrl, status: res.status as 'draft' | 'publish' | 'pending' })
      } else {
        setResult({ success: false, error: res.error || t('publishWp.unknownError') })
      }
    } catch (err) {
      setResult({ success: false, error: err instanceof Error ? err.message : t('publishWp.unknownError') })
    } finally {
      setIsPublishing(false)
      setProgress(null)
    }
  }, [title, status, isPublishing, bodyMarkdown, md, vaultPath, fileTree, marketing.wordpressUrl, marketing.wordpressUser, t])

  return (
    <div className="ai-image-dialog-overlay" onClick={() => { if (!isPublishing) onClose() }}>
      <div className="ai-image-dialog publish-wp-dialog" onClick={e => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <div className="ai-image-dialog-header">
          <h3>{t('publishWp.title')}</h3>
          <button className="close-btn" onClick={onClose} disabled={isPublishing} title={t('panel.close')}>&times;</button>
        </div>

        {notConfigured ? (
          <div className="ai-image-dialog-disabled">
            {t('publishWp.notConfigured')}
          </div>
        ) : result?.success ? (
          <div className="ai-image-dialog-content">
            <p>{result.status === 'publish' ? t('publishWp.successPublished') : t('publishWp.successDraft')}</p>
            {result.postUrl && (
              <p>
                <a href={result.postUrl} target="_blank" rel="noreferrer">{result.postUrl}</a>
              </p>
            )}
            <div className="ai-image-dialog-footer">
              <button className="generate-btn" onClick={onClose}>{t('publishWp.close')}</button>
            </div>
          </div>
        ) : (
          <div className="ai-image-dialog-content">
            <div className="ai-image-field">
              <label>{t('publishWp.postTitle')}</label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder={t('publishWp.postTitlePlaceholder')}
                className="settings-input"
                disabled={isPublishing}
              />
            </div>

            <div className="ai-image-field">
              <label>{t('publishWp.status')}</label>
              <div className="publish-wp-status-group">
                <label className="publish-wp-status-option">
                  <input
                    type="radio"
                    name="publish-wp-status"
                    checked={status === 'draft'}
                    onChange={() => setStatus('draft')}
                    disabled={isPublishing}
                  />
                  <span>{t('publishWp.statusDraft')}</span>
                </label>
                <label className="publish-wp-status-option">
                  <input
                    type="radio"
                    name="publish-wp-status"
                    checked={status === 'publish'}
                    onChange={() => setStatus('publish')}
                    disabled={isPublishing}
                  />
                  <span>{t('publishWp.statusPublish')}</span>
                </label>
              </div>
            </div>

            <div className="ai-image-field">
              <label>{t('publishWp.preview')}</label>
              <div
                className="publish-wp-preview"
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            </div>

            {result && !result.success && (
              <div className="publish-wp-error">{result.error}</div>
            )}

            {progress && (
              <div className="publish-wp-progress">{progress}</div>
            )}

            <div className="ai-image-dialog-footer">
              <button className="cancel-btn" onClick={onClose} disabled={isPublishing}>
                {t('publishWp.cancel')}
              </button>
              <button
                className="generate-btn"
                onClick={handlePublish}
                disabled={isPublishing || !title.trim()}
              >
                {isPublishing ? t('publishWp.publishing') : t('publishWp.publish')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
