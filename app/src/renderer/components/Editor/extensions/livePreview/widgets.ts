import { WidgetType } from '@codemirror/view'
import { escapeHtml } from '../../../../utils/sanitize'

/**
 * Widget for rendered wikilinks
 */
export class WikilinkWidget extends WidgetType {
  constructor(
    readonly target: string,
    readonly alias: string | null,
    readonly fragment: string | null
  ) {
    super()
  }

  eq(other: WikilinkWidget): boolean {
    return (
      other.target === this.target &&
      other.alias === this.alias &&
      other.fragment === this.fragment
    )
  }

  toDOM(): HTMLElement {
    const span = document.createElement('span')
    span.className = 'lp-wikilink'
    span.textContent = this.alias || this.target
    span.setAttribute('data-target', this.target)
    if (this.fragment) {
      span.setAttribute('data-fragment', this.fragment)
    }
    return span
  }

  ignoreEvent(): boolean {
    return false
  }
}

/**
 * Widget for task checkboxes
 */
export class CheckboxWidget extends WidgetType {
  constructor(
    readonly checked: boolean,
    readonly pos: number
  ) {
    super()
  }

  eq(other: CheckboxWidget): boolean {
    return other.checked === this.checked
  }

  toDOM(): HTMLElement {
    const checkbox = document.createElement('input')
    checkbox.type = 'checkbox'
    checkbox.className = 'lp-checkbox'
    checkbox.checked = this.checked
    checkbox.setAttribute('data-pos', String(this.pos))
    return checkbox
  }

  ignoreEvent(): boolean {
    return false
  }
}

/**
 * Widget for callout icons
 */
export class CalloutIconWidget extends WidgetType {
  private static readonly icons: Record<string, string> = {
    note: '\u{1F4DD}', // 📝
    tip: '\u{1F4A1}', // 💡
    warning: '\u{26A0}\u{FE0F}', // ⚠️
    danger: '\u{1F6A8}', // 🚨
    info: '\u{2139}\u{FE0F}', // ℹ️
    question: '\u{2753}', // ❓
    example: '\u{1F4CB}', // 📋
    quote: '\u{1F4AC}', // 💬
    abstract: '\u{1F4C4}', // 📄
    todo: '\u{2705}', // ✅
    success: '\u{2705}', // ✅
    failure: '\u{274C}', // ❌
    bug: '\u{1F41B}', // 🐛
  }

  constructor(
    readonly type: string,
    readonly title: string | null
  ) {
    super()
  }

  eq(other: CalloutIconWidget): boolean {
    return other.type === this.type && other.title === this.title
  }

  toDOM(): HTMLElement {
    const span = document.createElement('span')
    span.className = `lp-callout-icon lp-callout-${this.type}`
    const icon = CalloutIconWidget.icons[this.type.toLowerCase()] || '\u{1F4DD}'
    span.textContent = `${icon} ${this.title || this.type.charAt(0).toUpperCase() + this.type.slice(1)}`
    span.style.fontWeight = 'bold'
    span.style.marginRight = '8px'
    return span
  }

  ignoreEvent(): boolean {
    return true
  }
}

/**
 * Widget for horizontal rules
 */
export class HorizontalRuleWidget extends WidgetType {
  eq(): boolean {
    return true
  }

  toDOM(): HTMLElement {
    const hr = document.createElement('div')
    hr.className = 'lp-hr'
    return hr
  }

  ignoreEvent(): boolean {
    return true
  }
}

/**
 * Widget for standard markdown links (shows only text)
 */
export class LinkWidget extends WidgetType {
  constructor(
    readonly text: string,
    readonly url: string
  ) {
    super()
  }

  eq(other: LinkWidget): boolean {
    return other.text === this.text && other.url === this.url
  }

  toDOM(): HTMLElement {
    const a = document.createElement('span')
    a.className = 'lp-link'
    a.textContent = this.text
    a.setAttribute('data-url', this.url)
    return a
  }

  ignoreEvent(): boolean {
    return false
  }
}

// Cache for resolved image data URLs to avoid repeated IPC calls
const imageCache = new Map<string, string | null>()

/**
 * Widget for image preview with actual image rendering
 */
export class ImageWidget extends WidgetType {
  private loadId = 0

  constructor(
    readonly url: string,
    readonly width: number | null,
    readonly height: number | null,
    readonly vaultPath: string,
    readonly alt: string | null = null
  ) {
    super()
  }

  eq(other: ImageWidget): boolean {
    return (
      other.url === this.url &&
      other.width === this.width &&
      other.height === this.height &&
      other.vaultPath === this.vaultPath
    )
  }

  private get cacheKey(): string {
    return `${this.vaultPath}::${this.url}`
  }

  toDOM(): HTMLElement {
    const container = document.createElement('span')
    container.className = 'lp-image-container'

    // Check cache first for instant rendering
    const cached = imageCache.get(this.cacheKey)
    if (cached) {
      this.renderImage(container, cached)
      return container
    }
    if (cached === null) {
      this.renderError(container, 'Image not found')
      return container
    }

    // Start with a loading placeholder
    const placeholder = document.createElement('span')
    placeholder.className = 'lp-image-loading'
    placeholder.textContent = 'Loading...'
    container.appendChild(placeholder)

    // Load the image asynchronously
    this.loadImage(container)

    return container
  }

  private async loadImage(container: HTMLElement): Promise<void> {
    const currentLoadId = ++this.loadId

    try {
      // For external URLs or data URLs, use directly
      if (this.url.startsWith('http') || this.url.startsWith('data:')) {
        imageCache.set(this.cacheKey, this.url)
        if (currentLoadId === this.loadId) this.renderImage(container, this.url)
        return
      }

      // For absolute paths, try directly
      if (this.url.startsWith('/')) {
        const result = await window.electronAPI.readImageAsDataUrl(this.url)
        if (result.success && result.dataUrl) {
          imageCache.set(this.cacheKey, result.dataUrl)
          if (currentLoadId === this.loadId) this.renderImage(container, result.dataUrl)
          return
        }
      }

      // Try multiple possible locations for relative paths
      const possiblePaths = [
        `${this.vaultPath}/${this.url}`,
        `${this.vaultPath}/.attachments/${this.url}`,
        `${this.vaultPath}/attachments/${this.url}`,
        `${this.vaultPath}/assets/${this.url}`,
        `${this.vaultPath}/images/${this.url}`,
      ]

      for (const imagePath of possiblePaths) {
        const result = await window.electronAPI.readImageAsDataUrl(imagePath)
        if (result.success && result.dataUrl) {
          imageCache.set(this.cacheKey, result.dataUrl)
          if (currentLoadId === this.loadId) this.renderImage(container, result.dataUrl)
          return
        }
      }

      // Fallback: Obsidian-style vault-wide search
      const searchResult = await window.electronAPI.findImageInVault(this.vaultPath, this.url)
      if (searchResult.success && searchResult.path) {
        const fullPath = `${this.vaultPath}/${searchResult.path}`
        const imageResult = await window.electronAPI.readImageAsDataUrl(fullPath)
        if (imageResult.success && imageResult.dataUrl) {
          imageCache.set(this.cacheKey, imageResult.dataUrl)
          if (currentLoadId === this.loadId) this.renderImage(container, imageResult.dataUrl)
          return
        }
      }

      // If no path worked, cache the miss and show error
      imageCache.set(this.cacheKey, null)
      if (currentLoadId === this.loadId) this.renderError(container, 'Image not found')
    } catch (error) {
      console.error('[ImageWidget] Load error:', error)
      if (currentLoadId === this.loadId) this.renderError(container, 'Failed to load image')
    }
  }

  private renderImage(container: HTMLElement, src: string): void {
    container.innerHTML = ''

    const img = document.createElement('img')
    img.src = src
    img.className = 'lp-image'
    if (this.alt) img.alt = this.alt

    if (this.width) {
      img.style.width = `${this.width}px`
    }
    if (this.height) {
      img.style.height = `${this.height}px`
    }

    img.style.maxWidth = '100%'

    container.appendChild(img)
  }

  private renderError(container: HTMLElement, message: string): void {
    container.innerHTML = ''
    const errorEl = document.createElement('span')
    errorEl.className = 'lp-image-error'
    errorEl.textContent = `[Image: ${this.url}] - ${message}`
    container.appendChild(errorEl)
  }

  ignoreEvent(): boolean {
    return true
  }
}

/**
 * Widget for PDF embed preview
 */
export class PdfEmbedWidget extends WidgetType {
  constructor(
    readonly filename: string,
    readonly vaultPath: string
  ) {
    super()
  }

  eq(other: PdfEmbedWidget): boolean {
    return other.filename === this.filename && other.vaultPath === this.vaultPath
  }

  toDOM(): HTMLElement {
    const container = document.createElement('div')
    container.className = 'lp-pdf-embed'

    // Load the PDF asynchronously
    this.loadPdf(container)

    return container
  }

  private async loadPdf(container: HTMLElement): Promise<void> {
    console.log('[PdfEmbed] Loading PDF:', this.filename, 'vaultPath:', this.vaultPath)

    // Possible paths for the PDF
    const possiblePaths = [
      `${this.vaultPath}/${this.filename}`,
      `${this.vaultPath}/.attachments/${this.filename}`,
      `${this.vaultPath}/attachments/${this.filename}`,
    ]

    let pdfBase64: string | null = null
    let foundPath: string | null = null

    for (const testPath of possiblePaths) {
      console.log('[PdfEmbed] Trying path:', testPath)
      try {
        // Try to read the PDF as base64
        pdfBase64 = await window.electronAPI.readFileBinary(testPath)
        foundPath = testPath
        console.log('[PdfEmbed] Found PDF at:', testPath)
        break
      } catch (e) {
        console.log('[PdfEmbed] Not found at:', testPath, e)
        // File not found, try next path
      }
    }

    if (!pdfBase64) {
      // Try vault-wide search for the PDF
      console.log('[PdfEmbed] Trying vault-wide search for:', this.filename)
      const searchResult = await window.electronAPI.findImageInVault(this.vaultPath, this.filename)
      console.log('[PdfEmbed] Search result:', searchResult)
      if (searchResult.success && searchResult.path) {
        try {
          pdfBase64 = await window.electronAPI.readFileBinary(searchResult.path)
          foundPath = searchResult.path
          console.log('[PdfEmbed] Found via search:', searchResult.path)
        } catch (e) {
          console.log('[PdfEmbed] Failed to read from search path:', e)
          // Failed to read
        }
      }
    }

    if (pdfBase64 && foundPath) {
      console.log('[PdfEmbed] PDF base64 length:', pdfBase64.length)

      // Create PDF preview header
      const header = document.createElement('div')
      header.className = 'lp-pdf-header'
      header.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M4 1C3.45 1 3 1.45 3 2V14C3 14.55 3.45 15 4 15H12C12.55 15 13 14.55 13 14V5.41C13 5.15 12.89 4.9 12.71 4.71L10.29 2.29C10.1 2.11 9.85 2 9.59 2H4Z" fill="#ffebee" stroke="#e53935" strokeWidth="0.8"/>
          <text x="8" y="11" text-anchor="middle" font-size="5" font-weight="bold" fill="#e53935">PDF</text>
        </svg>
        <span class="lp-pdf-filename">${escapeHtml(this.filename)}</span>
      `
      container.appendChild(header)

      try {
        // Convert base64 to blob URL for the iframe
        const byteCharacters = atob(pdfBase64)
        console.log('[PdfEmbed] Decoded bytes:', byteCharacters.length)
        const byteNumbers = new Array(byteCharacters.length)
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i)
        }
        const byteArray = new Uint8Array(byteNumbers)
        const blob = new Blob([byteArray], { type: 'application/pdf' })
        console.log('[PdfEmbed] Blob created, size:', blob.size)
        const blobUrl = URL.createObjectURL(blob)
        console.log('[PdfEmbed] Blob URL:', blobUrl)

        // Create iframe for PDF display
        const iframe = document.createElement('iframe')
        iframe.className = 'lp-pdf-frame'
        iframe.src = blobUrl
        iframe.style.width = '100%'
        iframe.style.height = '70vh'
        iframe.style.minHeight = '500px'
        iframe.style.border = 'none'
        container.appendChild(iframe)
        console.log('[PdfEmbed] iframe added to container')
      } catch (e) {
        console.error('[PdfEmbed] Error creating PDF view:', e)
        container.innerHTML += `<div class="lp-pdf-error">Error: ${escapeHtml(String(e))}</div>`
      }
    } else {
      // PDF not found
      container.innerHTML = `
        <div class="lp-pdf-error">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M4 1C3.45 1 3 1.45 3 2V14C3 14.55 3.45 15 4 15H12C12.55 15 13 14.55 13 14V5.41C13 5.15 12.89 4.9 12.71 4.71L10.29 2.29C10.1 2.11 9.85 2 9.59 2H4Z" fill="#ffebee" stroke="#e53935" strokeWidth="0.8"/>
            <text x="8" y="11" text-anchor="middle" font-size="5" font-weight="bold" fill="#e53935">PDF</text>
          </svg>
          <span>PDF nicht gefunden: ${escapeHtml(this.filename)}</span>
        </div>
      `
    }
  }

  ignoreEvent(): boolean {
    return true
  }
}

/**
 * Widget for tags
 */
export class TagWidget extends WidgetType {
  constructor(readonly tag: string) {
    super()
  }

  eq(other: TagWidget): boolean {
    return other.tag === this.tag
  }

  toDOM(): HTMLElement {
    const span = document.createElement('span')
    span.className = 'lp-tag'
    span.textContent = this.tag
    return span
  }

  ignoreEvent(): boolean {
    return false
  }
}
