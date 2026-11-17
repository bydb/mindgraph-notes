import type { FileEntry } from '../../shared/types'
import { resolveFileLink, type FileLinkResolution } from '../../shared/resolveFileLink'
import { useNotesStore } from '../stores/notesStore'
import { useTabStore } from '../stores/tabStore'

function flattenEntries(tree: readonly FileEntry[], out: FileEntry[] = []): FileEntry[] {
  for (const e of tree) {
    if (e.isDirectory) flattenEntries(e.children ?? [], out)
    else out.push(e)
  }
  return out
}

/**
 * Öffnet die Datei hinter einem Wikilink wie ein Klick im Dateibaum (PDF, Bild, Office,
 * Plugin-Datei, EPUB). Für Notizen ist `findNoteForWikilink` zuständig — diese Funktion
 * ist der Weg, wenn dort nichts gefunden wurde. Gibt das Ergebnis zurück, damit der
 * Aufrufer „mehrdeutig“ anzeigen kann.
 */
export function openVaultFileLink(linkText: string, fileTree: readonly FileEntry[]): FileLinkResolution {
  const entries = flattenEntries(fileTree)
  const res = resolveFileLink(linkText, entries.map(e => e.path))
  if (res.status !== 'found') return res
  const entry = entries.find(e => e.path === res.path)
  if (!entry) return { status: 'none' }
  const notes = useNotesStore.getState()
  switch (entry.fileType) {
    case 'pdf': notes.selectPdf(entry.path); break
    case 'image': notes.selectImage(entry.path); break
    case 'excel':
    case 'word':
    case 'powerpoint': notes.selectOffice(entry.path, entry.fileType); break
    case 'plugin':
      if (entry.pluginEditor) {
        useTabStore.getState().openPluginEditorTab(entry.pluginEditor.pluginId, entry.path, entry.pluginEditor.editorId, entry.name)
      }
      break
    case 'epub':
      if (notes.vaultPath) void window.electronAPI.openPath(`${notes.vaultPath}/${entry.path}`)
      break
    default:
      return { status: 'none' }
  }
  return res
}
