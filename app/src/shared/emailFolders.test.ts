import { describe, it, expect } from 'vitest'
import { findTrashFolder } from './emailFolders'

describe('findTrashFolder', () => {
  it('SPECIAL-USE schlägt Namen', () => {
    const folders = [
      { path: 'Trash', delimiter: '/' },
      { path: 'INBOX.Muell', delimiter: '.', specialUse: '\\Trash' }
    ]
    expect(findTrashFolder(folders)?.path).toBe('INBOX.Muell')
  })

  it('bekannte deutsche und englische Namen, case-insensitiv', () => {
    expect(findTrashFolder([{ path: 'INBOX.papierkorb' }])?.path).toBe('INBOX.papierkorb')
    expect(findTrashFolder([{ path: 'Deleted Items' }])?.path).toBe('Deleted Items')
    expect(findTrashFolder([{ path: '[Gmail]/Papierkorb' }])?.path).toBe('[Gmail]/Papierkorb')
  })

  it('nicht auswählbare Ordner zählen nicht', () => {
    expect(findTrashFolder([{ path: 'Trash', selectable: false }])).toBeNull()
  })

  it('ohne Papierkorb: null (dann gibt es keinen Löschen-Knopf)', () => {
    expect(findTrashFolder([{ path: 'INBOX' }, { path: 'Archiv' }])).toBeNull()
    expect(findTrashFolder([])).toBeNull()
    expect(findTrashFolder(undefined)).toBeNull()
  })
})
