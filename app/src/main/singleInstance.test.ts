import { describe, expect, it, vi } from 'vitest'
import { focusExistingWindow, type FocusableWindow } from './singleInstance'

function fakeWindow(state: { destroyed?: boolean; minimized?: boolean; visible?: boolean }): FocusableWindow & { calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    isDestroyed: () => !!state.destroyed,
    isMinimized: () => !!state.minimized,
    restore: () => { calls.push('restore') },
    isVisible: () => state.visible !== false,
    show: () => { calls.push('show') },
    focus: () => { calls.push('focus') }
  }
}

describe('focusExistingWindow (Instanzsperre, Codex F25)', () => {
  it('sichtbares Fenster: nur fokussieren', () => {
    const w = fakeWindow({})
    const create = vi.fn()
    expect(focusExistingWindow(w, create)).toBe('focused')
    expect(w.calls).toEqual(['focus'])
    expect(create).not.toHaveBeenCalled()
  })

  it('minimiertes oder verstecktes Fenster: wiederherstellen und zeigen, dann fokussieren', () => {
    const w = fakeWindow({ minimized: true, visible: false })
    expect(focusExistingWindow(w, vi.fn())).toBe('focused')
    expect(w.calls).toEqual(['restore', 'show', 'focus'])
  })

  it('kein oder zerstörtes Fenster: neues erzeugen', () => {
    const create = vi.fn()
    expect(focusExistingWindow(null, create)).toBe('created')
    expect(focusExistingWindow(fakeWindow({ destroyed: true }), create)).toBe('created')
    expect(create).toHaveBeenCalledTimes(2)
  })
})
