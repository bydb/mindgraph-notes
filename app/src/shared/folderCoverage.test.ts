import { describe, expect, it } from 'vitest'
import { COVERAGE_MAX_FILES, coverageMessage, unreadFolderFiles } from './folderCoverage'

const folder = (n: number, extra: Array<{ name: string; kind: string }> = []) => [{
  folder: 'Quellen',
  files: [...Array.from({ length: n }, (_, i) => ({ name: `notiz-${i}.md`, kind: 'md' })), ...extra]
}]

describe('unreadFolderFiles', () => {
  it('nennt, was fehlt', () => {
    const read = new Map([['Quellen', new Set(['notiz-0.md', 'Notiz-1.MD'])]])
    expect(unreadFolderFiles(folder(4), read, { imagesReadable: true })?.map(u => u.name)).toEqual(['notiz-2.md', 'notiz-3.md'])
  })
  it('erkennt Dateien in Unterordnern am reinen Namen', () => {
    const f = [{ folder: 'Quellen', files: [{ name: 'Planung/ablauf.md', kind: 'md' }, { name: 'stand.png', kind: 'image' }] }]
    const read = new Map([['Quellen', new Set(['ablauf.md', './stand.png'])]])
    expect(unreadFolderFiles(f, read, { imagesReadable: true })).toEqual([])
  })
  it('lässt Bilder aus, wenn sie nicht lesbar sind', () => {
    const f = folder(1, [{ name: 'foto.jpg', kind: 'image' }])
    const read = new Map([['Quellen', new Set(['notiz-0.md'])]])
    expect(unreadFolderFiles(f, read, { imagesReadable: false })).toEqual([])
    expect(unreadFolderFiles(f, read, { imagesReadable: true })).toHaveLength(1)
  })
  it('greift nicht bei großen Ordnern, ohne Dateien oder bei ausgewerteten Ordnern', () => {
    expect(unreadFolderFiles(folder(COVERAGE_MAX_FILES + 1), new Map(), { imagesReadable: true })).toBeNull()
    expect(unreadFolderFiles(folder(COVERAGE_MAX_FILES), new Map(), { imagesReadable: true })).toHaveLength(COVERAGE_MAX_FILES)
    expect(unreadFolderFiles([], new Map(), { imagesReadable: true })).toBeNull()
    expect(unreadFolderFiles(folder(3), new Map(), { imagesReadable: true, skipFolders: new Set(['Quellen']) })).toBeNull()
  })
})

describe('coverageMessage', () => {
  it('nennt jede Datei und den Ausweg', () => {
    const msg = coverageMessage([{ folder: 'Quellen', name: 'a.md', kind: 'md' }, { folder: 'Quellen', name: 'b.png', kind: 'image' }], true)
    expect(msg).toContain('Quellen/a.md')
    expect(msg).toContain('describe_image')
    expect(msg).toContain('unverändert noch einmal')
  })
})
