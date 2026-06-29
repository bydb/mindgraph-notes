import { describe, it, expect } from 'vitest'
import { WIDGET_VIEW_SCHEMA, WIDGET_VIEW_KINDS, type WidgetView } from './widgetView'
import { validateAgainst } from './validation'

const ok = (v: WidgetView) => validateAgainst(WIDGET_VIEW_SCHEMA, v, 'widgetView').valid
const bad = (v: unknown) => !validateAgainst(WIDGET_VIEW_SCHEMA, v, 'widgetView').valid

describe('WIDGET_VIEW_SCHEMA — v1-Vokabular', () => {
  it('akzeptiert alle fünf gültigen kinds', () => {
    expect(ok({ kind: 'stats', items: [{ label: 'Offen', value: '3', trend: 'up' }] })).toBe(true)
    expect(ok({ kind: 'list', items: [{ title: 'Notiz', subtitle: 'x', badge: 'neu', status: 'red' }] })).toBe(true)
    expect(ok({ kind: 'keyValue', rows: [{ key: 'Status', value: 'aktiv' }] })).toBe(true)
    expect(ok({ kind: 'progress', value: 2, max: 5, label: 'Fortschritt' })).toBe(true)
    expect(ok({ kind: 'badge', text: 'OK', status: 'green' })).toBe(true)
    expect(WIDGET_VIEW_KINDS).toEqual(['stats', 'list', 'keyValue', 'progress', 'badge'])
  })

  it('lehnt unbekannte kinds ab', () => {
    expect(bad({ kind: 'html', value: '<b>x</b>' })).toBe(true)
    expect(bad({ kind: 'iframe', src: 'x' })).toBe(true)
  })

  it('lehnt Präsentations-/Zusatzfelder ab (additionalProperties:false, I-D2)', () => {
    expect(bad({ kind: 'badge', text: 'x', style: 'position:fixed' })).toBe(true)
    expect(bad({ kind: 'badge', text: 'x', html: '<div>' })).toBe(true)
    expect(bad({ kind: 'badge', text: 'x', className: 'host-chrome' })).toBe(true)
    expect(bad({ kind: 'list', items: [{ title: 'x', src: 'http://evil' }] })).toBe(true)
    expect(bad({ kind: 'stats', items: [{ label: 'x', value: '1', onClick: 'alert(1)' }] })).toBe(true)
  })

  it('erzwingt Pflichtfelder + Längen-/Zahl-Limits', () => {
    expect(bad({ kind: 'stats' })).toBe(true) // items fehlt
    expect(bad({ kind: 'progress', value: 1 })).toBe(true) // max fehlt
    expect(bad({ kind: 'progress', value: 1, max: 0 })).toBe(true) // max muss > 0
    expect(bad({ kind: 'badge', text: 'x'.repeat(81) })).toBe(true) // maxLength
    expect(bad({ kind: 'list', items: [{ title: 1 }] })).toBe(true) // title kein string
  })
})
