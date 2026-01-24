/**
 * Image handling utilities for MindGraph Notes
 */

// Supported image MIME types
const SUPPORTED_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/svg+xml'
]

// Supported image extensions
const SUPPORTED_IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg']

/**
 * Check if a MIME type is a supported image type
 */
export function isSupportedImageType(mimeType: string): boolean {
  return SUPPORTED_IMAGE_TYPES.includes(mimeType.toLowerCase())
}

/**
 * Check if a file extension is a supported image extension
 */
export function isSupportedImageExtension(ext: string): boolean {
  const normalizedExt = ext.toLowerCase().startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`
  return SUPPORTED_IMAGE_EXTENSIONS.includes(normalizedExt)
}

/**
 * Check if a filename has a supported image extension
 */
export function isImageFile(filename: string): boolean {
  const ext = filename.toLowerCase().split('.').pop()
  return ext ? isSupportedImageExtension(`.${ext}`) : false
}

/**
 * Parsed image data from markdown syntax
 */
export interface ParsedImage {
  fileName: string
  width: number | null
  height: number | null
  alt: string | null
  isObsidian: boolean
}

/**
 * Generate Obsidian-style image markdown
 * @param fileName - The filename in .attachments
 * @param width - Optional width in pixels
 * @param height - Optional height in pixels
 */
export function generateImageMarkdown(fileName: string, width?: number, height?: number): string {
  if (width && height) {
    return `![[${fileName}|${width}x${height}]]`
  } else if (width) {
    return `![[${fileName}|${width}]]`
  }
  return `![[${fileName}]]`
}

/**
 * Parse Obsidian-style image syntax: ![[image.png]], ![[image.png|300]], ![[image.png|300x200]]
 */
export function parseObsidianImageSyntax(markdown: string): ParsedImage | null {
  // Match ![[filename]] or ![[filename|size]] or ![[filename|widthxheight]]
  const match = markdown.match(/^!\[\[([^\]|]+)(?:\|(\d+)(?:x(\d+))?)?\]\]$/)
  if (!match) return null

  const fileName = match[1]
  const widthStr = match[2]
  const heightStr = match[3]

  // Only return if it's actually an image file
  if (!isImageFile(fileName)) return null

  return {
    fileName,
    width: widthStr ? parseInt(widthStr, 10) : null,
    height: heightStr ? parseInt(heightStr, 10) : null,
    alt: null,
    isObsidian: true
  }
}

/**
 * Parse Obsidian-style embed syntax for any file type: ![[file.pdf]], ![[file.png|300]]
 * Unlike parseObsidianImageSyntax, this doesn't filter by file type
 */
export function parseObsidianEmbedSyntax(markdown: string): ParsedImage | null {
  // Match ![[filename]] or ![[filename|size]] or ![[filename|widthxheight]]
  const match = markdown.match(/^!\[\[([^\]|]+)(?:\|(\d+)(?:x(\d+))?)?\]\]$/)
  if (!match) return null

  const fileName = match[1]
  const widthStr = match[2]
  const heightStr = match[3]

  return {
    fileName,
    width: widthStr ? parseInt(widthStr, 10) : null,
    height: heightStr ? parseInt(heightStr, 10) : null,
    alt: null,
    isObsidian: true
  }
}

/**
 * Parse standard markdown image syntax: ![alt](url) or ![alt|300](url)
 */
export function parseStandardImageSyntax(markdown: string): ParsedImage | null {
  // Match ![alt](url) with optional |width in alt
  const match = markdown.match(/^!\[([^\]]*)\]\(([^)]+)\)$/)
  if (!match) return null

  const altPart = match[1]
  const url = match[2]

  // Parse alt text and optional width: "alt|300" or "alt|300x200"
  const altMatch = altPart.match(/^(.*)(?:\|(\d+)(?:x(\d+))?)?$/)
  const alt = altMatch?.[1] || null
  const widthStr = altMatch?.[2]
  const heightStr = altMatch?.[3]

  // Extract filename from URL
  const fileName = url.split('/').pop() || url

  // Only return if it looks like an image
  if (!isImageFile(fileName) && !url.startsWith('data:image')) return null

  return {
    fileName,
    width: widthStr ? parseInt(widthStr, 10) : null,
    height: heightStr ? parseInt(heightStr, 10) : null,
    alt,
    isObsidian: false
  }
}

/**
 * Parse any image syntax (Obsidian or standard)
 */
export function parseImageSyntax(markdown: string): ParsedImage | null {
  return parseObsidianImageSyntax(markdown) || parseStandardImageSyntax(markdown)
}

/**
 * Resolve image path to absolute path
 * @param imagePath - Can be filename only, relative path, or .attachments/filename
 * @param vaultPath - The vault root path
 */
export function resolveImagePath(imagePath: string, vaultPath: string): string {
  // If it's already an absolute path, return as-is
  if (imagePath.startsWith('/')) {
    return imagePath
  }

  // If it starts with .attachments, prepend vault path
  if (imagePath.startsWith('.attachments/') || imagePath.startsWith('.attachments\\')) {
    return `${vaultPath}/${imagePath}`
  }

  // Otherwise, assume it's just a filename in .attachments
  return `${vaultPath}/.attachments/${imagePath}`
}

/**
 * Extract image from a DataTransfer object (drag & drop or paste)
 * @returns The first supported image File, or null
 */
export async function extractImageFromDataTransfer(dt: DataTransfer): Promise<File | null> {
  // First, check for files (dropped files)
  if (dt.files.length > 0) {
    for (const file of Array.from(dt.files)) {
      if (isSupportedImageType(file.type)) {
        return file
      }
    }
  }

  // Then check items (clipboard data)
  if (dt.items) {
    for (const item of Array.from(dt.items)) {
      if (item.kind === 'file' && isSupportedImageType(item.type)) {
        const file = item.getAsFile()
        if (file) return file
      }
    }
  }

  return null
}

/**
 * Get file path from DataTransfer (for drag from Finder)
 * This checks for text/uri-list or text/plain containing file:// URLs
 */
export function getFilePathFromDataTransfer(dt: DataTransfer): string | null {
  // Check for file:// URL in uri-list
  const uriList = dt.getData('text/uri-list')
  if (uriList) {
    const lines = uriList.split('\n').filter(l => !l.startsWith('#'))
    for (const uri of lines) {
      if (uri.startsWith('file://')) {
        return decodeURIComponent(uri.replace('file://', ''))
      }
    }
  }

  // Check plain text
  const plainText = dt.getData('text/plain')
  if (plainText && plainText.startsWith('file://')) {
    return decodeURIComponent(plainText.replace('file://', ''))
  }

  return null
}

/**
 * Convert a File to Base64 data URL
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
      } else {
        reject(new Error('Failed to read file as base64'))
      }
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

/**
 * Generate a suggested filename based on context
 */
export function generateImageFileName(prefix: string = 'image'): string {
  const timestamp = Date.now()
  return `${prefix}-${timestamp}`
}

/**
 * FileEntry type for tree traversal (matches shared/types.ts)
 */
interface FileEntry {
  name: string
  path: string
  isDirectory: boolean
  children?: FileEntry[]
  fileType?: 'markdown' | 'pdf' | 'image'
}

/**
 * Search the entire vault for an image file by name (Obsidian-style search)
 * Obsidian finds images anywhere in the vault, not just in specific folders.
 *
 * @param fileName - The image filename to search for (e.g., "photo.png")
 * @param fileTree - The vault's file tree
 * @returns The relative path to the image, or null if not found
 */
export function findImageInVault(fileName: string, fileTree: FileEntry[]): string | null {
  // Normalize the filename for comparison
  const searchName = fileName.toLowerCase()

  // Extract just the filename if a path was provided
  const justFileName = searchName.split('/').pop() || searchName

  // Recursive search function
  function searchTree(entries: FileEntry[]): string | null {
    for (const entry of entries) {
      if (entry.isDirectory && entry.children) {
        // Recursively search directories
        const found = searchTree(entry.children)
        if (found) return found
      } else if (entry.fileType === 'image') {
        // Check if this is the image we're looking for
        const entryFileName = entry.name.toLowerCase()
        if (entryFileName === justFileName) {
          return entry.path
        }
      }
    }
    return null
  }

  return searchTree(fileTree)
}

/**
 * Search for all images matching a pattern in the vault
 * Useful for autocomplete suggestions
 */
export function findImagesInVault(pattern: string, fileTree: FileEntry[], limit: number = 10): string[] {
  const results: string[] = []
  const searchPattern = pattern.toLowerCase()

  function searchTree(entries: FileEntry[]): void {
    if (results.length >= limit) return

    for (const entry of entries) {
      if (results.length >= limit) return

      if (entry.isDirectory && entry.children) {
        searchTree(entry.children)
      } else if (entry.fileType === 'image') {
        const fileName = entry.name.toLowerCase()
        if (fileName.includes(searchPattern)) {
          results.push(entry.path)
        }
      }
    }
  }

  searchTree(fileTree)
  return results
}
