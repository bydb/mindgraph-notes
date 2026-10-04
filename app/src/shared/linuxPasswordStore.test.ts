import { describe, it, expect } from 'vitest'
import { passwordStoreOverride } from './linuxPasswordStore'

describe('passwordStoreOverride', () => {
  it('gibt unter Hyprland libsecret vor', () => {
    expect(passwordStoreOverride('linux', { XDG_CURRENT_DESKTOP: 'Hyprland' }, [])).toBe('gnome-libsecret')
  })

  it('gibt ohne Desktop-Angabe libsecret vor', () => {
    expect(passwordStoreOverride('linux', {}, [])).toBe('gnome-libsecret')
  })

  it('lässt bekannte Desktops in Ruhe', () => {
    expect(passwordStoreOverride('linux', { XDG_CURRENT_DESKTOP: 'GNOME' }, [])).toBeNull()
    expect(passwordStoreOverride('linux', { XDG_CURRENT_DESKTOP: 'ubuntu:GNOME' }, [])).toBeNull()
    expect(passwordStoreOverride('linux', { XDG_CURRENT_DESKTOP: 'KDE' }, [])).toBeNull()
    expect(passwordStoreOverride('linux', { XDG_CURRENT_DESKTOP: 'X-Cinnamon' }, [])).toBeNull()
  })

  it('wertet DESKTOP_SESSION als Rückfall aus', () => {
    expect(passwordStoreOverride('linux', { DESKTOP_SESSION: 'plasma-kde' }, [])).toBeNull()
  })

  it('respektiert einen selbst gesetzten Schalter', () => {
    expect(passwordStoreOverride('linux', { XDG_CURRENT_DESKTOP: 'Hyprland' }, ['app', '--password-store=basic'])).toBeNull()
    expect(passwordStoreOverride('linux', { XDG_CURRENT_DESKTOP: 'Hyprland' }, ['app', '--password-store', 'kwallet5'])).toBeNull()
  })

  it('greift nur unter Linux', () => {
    expect(passwordStoreOverride('darwin', {}, [])).toBeNull()
    expect(passwordStoreOverride('win32', {}, [])).toBeNull()
  })
})
