import { describe, it, expect } from 'vitest'
import { explainKnownSwiftProblem, explainSwiftFailure } from './swiftFailure'

// Wortlaut von macOS nach einem Xcode-Update (18.09.2026, Exit 69).
const LICENSE_STDERR = "You have not agreed to the Xcode license agreements. Please run 'sudo xcodebuild -license' from within a Terminal window to review and agree to the Xcode and Apple SDKs license."

describe('explainSwiftFailure', () => {
  it('nennt bei nicht bestätigter Xcode-Lizenz den Befehl und den Ausweg', () => {
    const msg = explainSwiftFailure({ stderr: LICENSE_STDERR, stdout: '', code: 69, signal: null })
    expect(msg).toContain('sudo xcodebuild -license accept')
    expect(msg).toContain('.ics')
  })

  it('erkennt die Lizenzmeldung auch in einer execFile-Fehlermeldung', () => {
    expect(explainKnownSwiftProblem(`Command failed: swift -e import EventKit\n${LICENSE_STDERR}`)).toContain('Xcode-Lizenz')
  })

  it('erkennt fehlende Command Line Tools', () => {
    expect(explainKnownSwiftProblem('spawn swift ENOENT')).toContain('xcode-select --install')
    expect(explainKnownSwiftProblem('xcrun: error: invalid active developer path')).toContain('xcode-select --install')
  })

  it('gibt nie eine leere Meldung zurück', () => {
    expect(explainSwiftFailure({ stderr: '', stdout: '', code: 1, signal: null })).toMatch(/Exit 1/)
    expect(explainSwiftFailure({ stderr: '', stdout: '', code: null, signal: 'SIGTERM' })).toMatch(/beendet/)
  })

  it('zeigt von einem langen Fehler nur die erste Zeile', () => {
    const msg = explainSwiftFailure({ stderr: '\nerror: cannot find type\nzweite Zeile', code: 1, signal: null })
    expect(msg).toContain('error: cannot find type')
    expect(msg).not.toContain('zweite Zeile')
  })

  it('hält eine normale Meldung nicht für ein bekanntes Problem', () => {
    expect(explainKnownSwiftProblem('Kein Standard-Kalender verfügbar')).toBeUndefined()
  })
})
