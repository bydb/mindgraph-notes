import React, { useEffect, useRef } from 'react'
import MarkdownIt from 'markdown-it'
import { sanitizeHtml } from '../../utils/sanitize'
import texmath from 'markdown-it-texmath'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import 'katex/contrib/mhchem/mhchem.js'
import mermaid from 'mermaid'
import { highlightCode } from '../../utils/highlightSetup'
import { useTranslation } from '../../utils/translations'

// Mermaid initialisieren
mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  securityLevel: 'strict',
  fontFamily: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif'
})

// Markdown-it instance mit LaTeX Support
const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  breaks: true,
  highlight: highlightCode
})

// LaTeX/Math Plugin mit KaTeX (inkl. Chemie-Support via mhchem)
md.use(texmath, {
  engine: katex,
  delimiters: 'dollars',  // $...$ für inline, $$...$$ für block
  katexOptions: {
    throwOnError: false,
    trust: false,
    strict: false,
    displayMode: false
  }
})

// Code-Block Renderer für Mermaid
const defaultFence = md.renderer.rules.fence
let mermaidCounter = 0

md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const token = tokens[idx]
  const info = token.info.trim().toLowerCase()
  const code = token.content.trim()

  if (info === 'mermaid') {
    mermaidCounter++
    const id = `flashcard-mermaid-${mermaidCounter}-${Date.now()}`
    return `<div class="mermaid-container"><pre class="mermaid" id="${id}">${code}</pre></div>`
  }

  // Standard-Rendering für andere Code-Blöcke
  if (defaultFence) {
    return defaultFence(tokens, idx, options, env, self)
  }
  return `<pre><code class="language-${info}">${md.utils.escapeHtml(code)}</code></pre>`
}

interface MarkdownContentProps {
  content: string
  className?: string
  vaultPath?: string
}

export const MarkdownContent: React.FC<MarkdownContentProps> = ({ content, className = '', vaultPath }) => {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return

    // Mermaid Diagramme rendern
    const renderMermaid = async () => {
      const mermaidElements = containerRef.current?.querySelectorAll('.mermaid:not([data-processed])')
      if (mermaidElements && mermaidElements.length > 0) {
        try {
          await mermaid.run({
            nodes: mermaidElements as NodeListOf<HTMLElement>
          })
          // Mark as processed
          mermaidElements.forEach(el => el.setAttribute('data-processed', 'true'))
        } catch (error) {
          console.error('[Flashcard] Mermaid render error:', error)
        }
      }
    }

    // Kleine Verzögerung für DOM-Update
    const timeoutId = setTimeout(renderMermaid, 50)
    return () => clearTimeout(timeoutId)
  }, [content])

  // Resolve images from vault after render
  useEffect(() => {
    if (!containerRef.current || !vaultPath) return

    let cancelled = false

    const loadImages = async () => {
      const images = containerRef.current?.querySelectorAll('img')
      if (!images || images.length === 0) return

      for (const img of images) {
        if (cancelled) return
        const src = img.getAttribute('src')
        if (!src || src.startsWith('data:') || src.startsWith('http')) continue

        const possiblePaths = [
          src.startsWith('/') ? src : null,
          `${vaultPath}/${src}`,
          `${vaultPath}/attachments/${src}`,
          `${vaultPath}/.attachments/${src}`,
          `${vaultPath}/assets/${src}`,
          `${vaultPath}/images/${src}`,
        ].filter(Boolean) as string[]

        for (const imagePath of possiblePaths) {
          try {
            const result = await window.electronAPI.readImageAsDataUrl(imagePath)
            if (result.success && result.dataUrl) {
              img.src = result.dataUrl
              break
            }
          } catch {
            // Try next path
          }
        }
      }
    }

    const timer = setTimeout(loadImages, 50)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [content, vaultPath])

  useEffect(() => {
    if (!containerRef.current) return

    const applyCodeCopyButtons = () => {
      const root = containerRef.current
      if (!root) return

      const codeBlocks = root.querySelectorAll('pre > code')
      for (const codeBlock of Array.from(codeBlocks)) {
        const pre = codeBlock.parentElement as HTMLElement | null
        if (!pre || pre.querySelector('.code-copy-btn')) continue

        const copyButton = document.createElement('button')
        copyButton.type = 'button'
        copyButton.className = 'code-copy-btn'
        copyButton.textContent = t('format.copy')
        copyButton.setAttribute('aria-label', t('format.copy'))

        pre.classList.add('code-copy-enabled')
        pre.appendChild(copyButton)
      }
    }

    applyCodeCopyButtons()

    const observer = new MutationObserver(() => applyCodeCopyButtons())
    observer.observe(containerRef.current, { childList: true, subtree: true })

    return () => observer.disconnect()
  }, [content, t])

  const handleContainerClick = async (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement
    const copyButton = target.closest('.code-copy-btn') as HTMLButtonElement | null
    if (!copyButton) return

    e.preventDefault()
    e.stopPropagation()

    const pre = copyButton.closest('pre')
    const code = pre?.querySelector('code')
    const codeText = code?.textContent ?? ''
    if (!codeText) return

    try {
      await navigator.clipboard.writeText(codeText)
      copyButton.textContent = t('settings.sync.copied')
      copyButton.classList.add('copied')

      window.setTimeout(() => {
        copyButton.textContent = t('format.copy')
        copyButton.classList.remove('copied')
      }, 1200)
    } catch (error) {
      console.error('[Flashcard] Copy code block failed:', error)
    }
  }

  // Markdown zu HTML rendern
  const html = md.render(content)

  return (
    <div
      ref={containerRef}
      className={`markdown-content ${className}`}
      onClick={handleContainerClick}
      dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }}
    />
  )
}
