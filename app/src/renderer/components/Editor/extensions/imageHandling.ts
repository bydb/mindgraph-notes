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

export interface ImageHandlingConfig {
  vaultPath: string
  onImageInserted?: (markdown: string) => void
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

  // Try to get a file path first (drag from Finder)
  const filePath = getFilePathFromDataTransfer(dt)
  if (filePath && isImageFile(filePath)) {
    try {
      const result = await window.electronAPI.copyImageToAttachments(
        config.vaultPath,
        filePath
      )

      if (result.success && result.fileName) {
        insertImageAtCursor(view, event, result.fileName)
        config.onImageInserted?.(generateImageMarkdown(result.fileName))
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
        suggestedName
      )

      if (result.success && result.fileName) {
        insertImageAtCursor(view, event, result.fileName)
        config.onImageInserted?.(generateImageMarkdown(result.fileName))
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

  // Try to get an image file from clipboard
  const imageFile = await extractImageFromDataTransfer(dt)
  if (imageFile) {
    try {
      const base64 = await fileToBase64(imageFile)
      const suggestedName = 'screenshot'

      const result = await window.electronAPI.writeImageFromBase64(
        config.vaultPath,
        base64,
        suggestedName
      )

      if (result.success && result.fileName) {
        insertImageAtPosition(view, view.state.selection.main.head, result.fileName)
        config.onImageInserted?.(generateImageMarkdown(result.fileName))
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

      // Check if there's an image or file being dragged
      const hasImage = dt.types.includes('Files') ||
                       dt.types.includes('text/uri-list')

      if (hasImage) {
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
     * Handle drop event for images - wrap async in sync handler
     */
    drop(event: DragEvent, view: EditorView) {
      const dt = event.dataTransfer
      if (!dt) return false

      // Remove visual feedback
      const target = event.currentTarget as HTMLElement
      target.classList.remove('drag-over')

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
