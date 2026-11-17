/**
 * CodeMirror extension for image drag & drop and paste handling
 */
import { Extension } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import {
  extractImageFromDataTransfer,
  getFilePathFromDataTransfer,
  fileToBase64,
  generateImageMarkdown,
  isImageFile
} from '../../../utils/imageUtils'
import { planFileDrop, parseVaultFilesDrag, VAULT_FILES_DRAG_TYPE, type LinkTargetContext } from '../../../../shared/fileLinkTarget'

export interface ImageHandlingConfig {
  vaultPath: string
  /** Lazy read: getter so dass Setting-Änderungen live wirken, ohne Editor-Rebuild */
  getImagesFolder?: () => string
  onImageInserted?: (markdown: string) => void
  /** Dateiliste + Pfad der Notiz DIESER Editorinstanz (Split: nie global, Codex F09). */
  getFileDropContext?: () => { ctx: LinkTargetContext; currentNotePath: string | null }
  /** Hinweis, wenn Dateien wegen `# | ^ [ ]` im Namen nicht verlinkt wurden. */
  onFileDropSkipped?: (names: string[]) => void
}

/**
 * Handle the async drop operation
 */
async function handleDrop(
  event: DragEvent,
  view: EditorView,
  config: ImageHandlingConfig
): Promise<boolean> {
  const dt = event.dataTransfer
  if (!dt) return false

  const imagesFolder = config.getImagesFolder?.() || '.attachments'

  // Try to get a file path first (drag from Finder)
  const filePath = getFilePathFromDataTransfer(dt)
  if (filePath && isImageFile(filePath)) {
    try {
      const result = await window.electronAPI.copyImageToAttachments(
        config.vaultPath,
        filePath,
        imagesFolder
      )

      if (result.success && (result.relativePath || result.fileName)) {
        // Bei .attachments reicht der Dateiname (Image-Loader probiert .attachments automatisch).
        // Bei jedem anderen images folder (z.B. „300 - Ressourcen/380 - Bilder") muss der volle
        // relativePath im Wikilink stehen, sonst kann der Lesen-Modus-Loader das Bild nicht resolven
        // und das fileTree ist nach dem frischen Copy noch nicht neu eingelesen.
        const linkTarget = (imagesFolder === '.attachments') ? (result.fileName || '') : (result.relativePath || result.fileName || '')
        insertImageAtCursor(view, event, linkTarget)
        config.onImageInserted?.(generateImageMarkdown(linkTarget))
        return true
      } else {
        console.error('[ImageHandling] Copy failed:', result.error)
      }
    } catch (error) {
      console.error('[ImageHandling] Drop error:', error)
    }
    return false
  }

  // Try to get an image file from the DataTransfer
  const imageFile = await extractImageFromDataTransfer(dt)
  if (imageFile) {
    try {
      const base64 = await fileToBase64(imageFile)
      const suggestedName = imageFile.name || 'dropped-image'

      const result = await window.electronAPI.writeImageFromBase64(
        config.vaultPath,
        base64,
        suggestedName,
        imagesFolder
      )

      if (result.success && (result.relativePath || result.fileName)) {
        // Bei .attachments reicht der Dateiname (Image-Loader probiert .attachments automatisch).
        // Bei jedem anderen images folder (z.B. „300 - Ressourcen/380 - Bilder") muss der volle
        // relativePath im Wikilink stehen, sonst kann der Lesen-Modus-Loader das Bild nicht resolven
        // und das fileTree ist nach dem frischen Copy noch nicht neu eingelesen.
        const linkTarget = (imagesFolder === '.attachments') ? (result.fileName || '') : (result.relativePath || result.fileName || '')
        insertImageAtCursor(view, event, linkTarget)
        config.onImageInserted?.(generateImageMarkdown(linkTarget))
        return true
      } else {
        console.error('[ImageHandling] Write failed:', result.error)
      }
    } catch (error) {
      console.error('[ImageHandling] Drop error:', error)
    }
  }

  return false
}

/**
 * Handle the async paste operation
 */
async function handlePaste(
  event: ClipboardEvent,
  view: EditorView,
  config: ImageHandlingConfig
): Promise<boolean> {
  const dt = event.clipboardData
  if (!dt) return false

  const imagesFolder = config.getImagesFolder?.() || '.attachments'

  // Try to get an image file from clipboard
  const imageFile = await extractImageFromDataTransfer(dt)
  if (imageFile) {
    try {
      const base64 = await fileToBase64(imageFile)
      const suggestedName = 'screenshot'

      const result = await window.electronAPI.writeImageFromBase64(
        config.vaultPath,
        base64,
        suggestedName,
        imagesFolder
      )

      if (result.success && (result.relativePath || result.fileName)) {
        const linkTarget = (imagesFolder === '.attachments') ? (result.fileName || '') : (result.relativePath || result.fileName || '')
        insertImageAtPosition(view, view.state.selection.main.head, linkTarget)
        config.onImageInserted?.(generateImageMarkdown(linkTarget))
        return true
      } else {
        console.error('[ImageHandling] Paste failed:', result.error)
      }
    } catch (error) {
      console.error('[ImageHandling] Paste error:', error)
    }
  }

  return false
}

/**
 * CodeMirror extension that handles image drag & drop and paste
 */
export function imageHandlingExtension(config: ImageHandlingConfig): Extension {
  return EditorView.domEventHandlers({
    /**
     * Handle dragover to allow drop
     */
    dragover(event: DragEvent) {
      const dt = event.dataTransfer
      if (!dt) return false

      // Check if there's a wikilink being dragged (from SmartConnections etc.)
      // oder Dateien aus dem Dateibaum
      const hasWikilink = dt.types.includes('application/x-mindgraph-wikilink') || dt.types.includes(VAULT_FILES_DRAG_TYPE)

      // Check if there's an image or file being dragged
      const hasImage = dt.types.includes('Files') ||
                       dt.types.includes('text/uri-list')

      if (hasWikilink || hasImage) {
        event.preventDefault()
        dt.dropEffect = 'copy'

        // Add visual feedback
        const target = event.currentTarget as HTMLElement
        target.classList.add('drag-over')

        return true
      }

      return false
    },

    /**
     * Handle dragleave to remove visual feedback
     */
    dragleave(event: DragEvent) {
      const target = event.currentTarget as HTMLElement
      target.classList.remove('drag-over')
      return false
    },

    /**
     * Handle drop event for images and wikilinks - wrap async in sync handler
     */
    drop(event: DragEvent, view: EditorView) {
      const dt = event.dataTransfer
      if (!dt) return false

      // Remove visual feedback
      const target = event.currentTarget as HTMLElement
      target.classList.remove('drag-over')

      // Dateien aus dem Dateibaum → Link bzw. Einbettung. VOR dem Finder-Zweig (sonst würde
      // ein internes Bild kopiert) und auch bei Ablehnung vollständig übernehmen — sonst
      // fügt CodeMirror den rohen text/plain-Pfad ein (Codex F06/F17).
      if (dt.types.includes(VAULT_FILES_DRAG_TYPE)) {
        event.preventDefault()
        event.stopPropagation()
        const paths = parseVaultFilesDrag(dt.getData(VAULT_FILES_DRAG_TYPE))
        const dropCtx = config.getFileDropContext?.()
        if (paths.length > 0 && dropCtx) {
          const plan = planFileDrop(paths, dropCtx.ctx, dropCtx.currentNotePath)
          if (plan.skipped.length > 0) config.onFileDropSkipped?.(plan.skipped)
          if (plan.markdown) insertFileDropAtCursor(view, event, plan.markdown, plan.block)
        }
        return true
      }

      // Check if this is a wikilink drop (from SmartConnections etc.)
      const wikilinkTitle = dt.getData('application/x-mindgraph-wikilink')
      if (wikilinkTitle) {
        event.preventDefault()
        event.stopPropagation()
        insertWikilinkAtCursor(view, event, wikilinkTitle)
        return true
      }

      // Check if this might be an image drop
      const filePath = getFilePathFromDataTransfer(dt)
      const hasFiles = dt.types.includes('Files')

      if ((filePath && isImageFile(filePath)) || hasFiles) {
        event.preventDefault()
        event.stopPropagation()

        // Handle async operation without returning the promise
        handleDrop(event, view, config)
        return true
      }

      return false
    },

    /**
     * Handle paste event for images from clipboard - wrap async in sync handler
     */
    paste(event: ClipboardEvent, view: EditorView) {
      const dt = event.clipboardData
      if (!dt) return false

      // Check if clipboard has image data
      const hasImage = Array.from(dt.items).some(
        item => item.type.startsWith('image/')
      )

      if (hasImage) {
        event.preventDefault()
        event.stopPropagation()

        // Handle async operation without returning the promise
        handlePaste(event, view, config)
        return true
      }

      return false
    }
  })
}

/**
 * Insert wikilink at the drop position
 */
function insertWikilinkAtCursor(view: EditorView, event: DragEvent, title: string): void {
  const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
  const insertPos = pos !== null ? pos : view.state.selection.main.head
  const wikilink = `[[${title}]]`

  view.dispatch({
    changes: { from: insertPos, to: insertPos, insert: wikilink },
    selection: { anchor: insertPos + wikilink.length }
  })

  view.focus()
}

/** Liegt `pos` innerhalb eines `[[…]]`/`![[…]]`, die Position direkt dahinter — nie verschachteln. */
function posOutsideWikilink(line: { from: number; text: string }, pos: number): number {
  const re = /!?\[\[[^\]\n]*\]\]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(line.text)) !== null) {
    const start = line.from + m.index
    const end = start + m[0].length
    if (pos > start && pos < end) return end
  }
  return pos
}

/**
 * Dateilinks aus dem Dateibaum einfügen: Einbettungen und mehrere Dateien als eigener
 * Block, ein einzelner Link im Fließtext mit Leerzeichen-Trennung.
 */
function insertFileDropAtCursor(view: EditorView, event: DragEvent, markdown: string, block: boolean): void {
  const at = view.posAtCoords({ x: event.clientX, y: event.clientY })
  const doc = view.state.doc
  const pos = posOutsideWikilink(doc.lineAt(at !== null ? at : view.state.selection.main.head), at !== null ? at : view.state.selection.main.head)
  let insert = markdown
  if (block) {
    const line = doc.lineAt(pos)
    if (line.text.trim().length === 0) insert = markdown
    else if (pos === line.from) insert = `${markdown}\n\n`
    else if (pos === line.to) insert = `\n\n${markdown}`
    else insert = `\n\n${markdown}\n\n`
  } else {
    const before = pos > 0 ? doc.sliceString(pos - 1, pos) : ''
    const after = pos < doc.length ? doc.sliceString(pos, pos + 1) : ''
    insert = `${before && !/\s/.test(before) ? ' ' : ''}${markdown}${after && !/\s/.test(after) ? ' ' : ''}`
  }
  view.dispatch({
    changes: { from: pos, to: pos, insert },
    selection: { anchor: pos + insert.length }
  })
  view.focus()
}

/**
 * Insert image markdown at the drop position
 */
function insertImageAtCursor(view: EditorView, event: DragEvent, fileName: string): void {
  const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
  if (pos !== null) {
    insertImageAtPosition(view, pos, fileName)
  } else {
    // Fallback to cursor position
    insertImageAtPosition(view, view.state.selection.main.head, fileName)
  }
}

/**
 * Insert image markdown at a specific position
 */
function insertImageAtPosition(view: EditorView, pos: number, fileName: string): void {
  const imageMarkdown = generateImageMarkdown(fileName)

  // Add newlines if needed for block-level image
  const doc = view.state.doc
  const line = doc.lineAt(pos)
  const lineContent = line.text.trim()

  let insert = imageMarkdown

  // If the line is not empty, insert on a new line
  if (lineContent.length > 0) {
    // Check if we're at the end of the line
    if (pos === line.to) {
      insert = '\n\n' + imageMarkdown
    } else {
      insert = '\n\n' + imageMarkdown + '\n'
    }
  } else {
    // Line is empty, just insert the image
    insert = imageMarkdown + '\n'
  }

  view.dispatch({
    changes: { from: pos, to: pos, insert },
    selection: { anchor: pos + insert.length }
  })

  view.focus()
}
