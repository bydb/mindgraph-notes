import { describe, it, expect } from 'vitest'
import { sealUiSecrets, openUiSecrets, hasPlaintextSecrets, clearUiSecret, uiSecretStatus, isSealedKeyGroup, type SecretCipher } from './uiSettingsSecrets'

const fake = (available = true, broken = false): SecretCipher => ({
  available: () => available,
  encrypt: (p) => Buffer.from('enc:' + p).toString('base64'),
  decrypt: (s) => {
    if (broken) throw new Error('Schlüsselbund gesperrt')
    const t = Buffer.from(s, 'base64').toString()
    if (!t.startsWith('enc:')) throw new Error('unlesbar')
    return t.slice(4)
  }
})

/** Ein Speichervorgang wie im Main: flacher Merge, dann versiegeln. */
const save = (disk: Record<string, unknown>, fromRenderer: Record<string, unknown>, cipher: SecretCipher) =>
  sealUiSecrets({ ...disk, ...fromRenderer }, disk, cipher)

describe('sealUiSecrets / openUiSecrets', () => {
  it('schreibt keinen Klartext-Schlüssel auf die Platte', () => {
    const sealed = save({}, {
      readwise: { enabled: true, apiKey: 'rw-geheim', syncFolder: 'x' },
      languageTool: { mode: 'api', apiKey: 'lt-geheim', apiUsername: 'a@b.de' },
      theme: 'dark'
    }, fake())
    const json = JSON.stringify(sealed)
    expect(json).not.toContain('rw-geheim')
    expect(json).not.toContain('lt-geheim')
    expect(sealed.theme).toBe('dark')
    expect((sealed.readwise as Record<string, unknown>).syncFolder).toBe('x')
    expect(uiSecretStatus(sealed, fake())).toEqual({ readwise: 'encrypted', languageTool: 'encrypted' })
  })

  it('liefert dem Renderer nach dem Laden wieder den Klartext, ohne apiKeyEnc', () => {
    const opened = openUiSecrets(save({}, { readwise: { apiKey: 'rw', enabled: true } }, fake()), fake())
    expect(opened.readwise).toEqual({ apiKey: 'rw', enabled: true })
  })

  it('erkennt alte Klartext-Dateien und migriert sie beim Speichern', () => {
    const alt = { languageTool: { apiKey: 'lt-alt' } }
    expect(hasPlaintextSecrets(alt)).toBe(true)
    expect(uiSecretStatus(alt, fake()).languageTool).toBe('plaintext')
    const migriert = sealUiSecrets(alt, alt, fake())
    expect(JSON.stringify(migriert)).not.toContain('lt-alt')
    expect(hasPlaintextSecrets(migriert)).toBe(false)
    expect(openUiSecrets(migriert, fake()).languageTool).toEqual({ apiKey: 'lt-alt' })
  })

  it('neuer Schlüssel ersetzt den alten', () => {
    const disk = save({}, { readwise: { apiKey: 'alt' } }, fake())
    const neu = save(disk, { readwise: { apiKey: 'neu' } }, fake())
    expect(openUiSecrets(neu, fake()).readwise).toEqual({ apiKey: 'neu' })
  })

  it('F01: unlesbarer Schlüssel überlebt das nächste Speichern einer anderen Einstellung', () => {
    const disk = save({}, { readwise: { apiKey: 'rw', syncFolder: 'a' } }, fake())
    const geladen = openUiSecrets(disk, fake(true, true))
    expect(geladen.readwise).toEqual({ apiKey: '', syncFolder: 'a' })
    expect(uiSecretStatus(disk, fake(true, true)).readwise).toBe('unreadable')
    const nachSave = save(disk, { ...geladen, theme: 'dark', readwise: { apiKey: '', syncFolder: 'b' } }, fake(true, true))
    expect((nachSave.readwise as Record<string, unknown>).syncFolder).toBe('b')
    expect(openUiSecrets(nachSave, fake()).readwise).toEqual({ apiKey: 'rw', syncFolder: 'b' })
  })

  it('F05: zweites Fenster lädt erfolgreich, erstes Fenster speichert danach sein leeres Feld — Schlüssel bleibt', () => {
    const disk = save({}, { readwise: { apiKey: 'rw' } }, fake())
    // Hauptfenster startet mit gesperrtem Schlüsselbund
    const haupt = openUiSecrets(disk, fake(true, true))
    // Schnellerfassung lädt später erfolgreich (kein Einfluss mehr auf das Speichern)
    expect(openUiSecrets(disk, fake()).readwise).toEqual({ apiKey: 'rw' })
    // Hauptfenster-Autosave mit seinem leeren Feld, jetzt bei lesbarem Schlüsselbund
    const nachSave = save(disk, { ...haupt, theme: 'dark' }, fake())
    expect(openUiSecrets(nachSave, fake()).readwise).toEqual({ apiKey: 'rw' })
  })

  it('F01: auch ohne verfügbare Verschlüsselung geht die Chiffre nicht verloren', () => {
    const disk = save({}, { languageTool: { apiKey: 'lt' } }, fake())
    const geladen = openUiSecrets(disk, fake(false))
    expect(uiSecretStatus(disk, fake(false)).languageTool).toBe('unreadable')
    const nachSave = save(disk, geladen, fake(false))
    expect(openUiSecrets(nachSave, fake()).languageTool).toEqual({ apiKey: 'lt' })
  })

  it('F06: ausdrückliches Löschen entfernt auch eine unlesbare Chiffre, ein späteres leeres Speichern holt sie nicht zurück', () => {
    const disk = save({}, { readwise: { apiKey: 'rw', syncFolder: 'a' } }, fake())
    const geloescht = clearUiSecret(disk, 'readwise')
    expect(geloescht.readwise).toEqual({ apiKey: '', syncFolder: 'a' })
    expect(uiSecretStatus(geloescht, fake(true, true)).readwise).toBe('none')
    const nachSave = save(geloescht, { readwise: { apiKey: '', syncFolder: 'a' } }, fake())
    expect(uiSecretStatus(nachSave, fake()).readwise).toBe('none')
  })

  it('gewöhnliches Speichern mit leerem Feld löscht einen lesbaren Schlüssel nicht', () => {
    const disk = save({}, { readwise: { apiKey: 'rw' } }, fake())
    const nachSave = save(disk, { readwise: { apiKey: '' } }, fake())
    expect(uiSecretStatus(nachSave, fake()).readwise).toBe('encrypted')
  })

  it('ohne Verschlüsselung bleibt ein neuer Schlüssel im Klartext und wird so gemeldet', () => {
    const s = save({}, { readwise: { apiKey: 'rw' } }, fake(false))
    expect(s.readwise).toEqual({ apiKey: 'rw' })
    expect(uiSecretStatus(s, fake(false)).readwise).toBe('plaintext')
  })

  it('F07: Status richtet sich nach der Datei, nicht nach der Fähigkeit des Systems', () => {
    // Migration fehlgeschlagen: Datei hat weiter Klartext, obwohl verschlüsselt werden könnte.
    expect(uiSecretStatus({ readwise: { apiKey: 'rw' } }, fake()).readwise).toBe('plaintext')
  })

  it('fasst fremde Formen nicht an', () => {
    const s = { readwise: 'kaputt', languageTool: null, other: { apiKey: 'bleibt' } }
    expect(sealUiSecrets(s, s, fake())).toEqual(s)
    expect(openUiSecrets(s, fake())).toEqual(s)
    expect(clearUiSecret(s, 'readwise')).toEqual(s)
    expect(hasPlaintextSecrets(s)).toBe(false)
    expect(uiSecretStatus(s, fake())).toEqual({ readwise: 'none', languageTool: 'none' })
  })

  it('akzeptiert nur bekannte Gruppen für den Löschbefehl', () => {
    expect(isSealedKeyGroup('readwise')).toBe(true)
    expect(isSealedKeyGroup('__proto__')).toBe(false)
    expect(isSealedKeyGroup(undefined)).toBe(false)
  })
})
