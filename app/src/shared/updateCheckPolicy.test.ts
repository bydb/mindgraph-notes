import { describe, it, expect } from 'vitest'
import { isUpdateCheckDisabledByEnv } from './updateCheckPolicy'

describe('isUpdateCheckDisabledByEnv', () => {
  it('schaltet bei 1/true/yes/ja ab', () => {
    for (const v of ['1', 'true', 'TRUE', ' yes ', 'ja']) expect(isUpdateCheckDisabledByEnv({ MINDGRAPH_DISABLE_UPDATE_CHECK: v }), v).toBe(true)
  })
  it('lässt die Prüfung sonst an', () => {
    for (const v of [undefined, '', '0', 'false', 'nein']) expect(isUpdateCheckDisabledByEnv({ MINDGRAPH_DISABLE_UPDATE_CHECK: v }), String(v)).toBe(false)
    expect(isUpdateCheckDisabledByEnv({})).toBe(false)
  })
})
