import { describe, expect, it } from 'vitest'
import { MODULES as CORE_MODULES, useUIStore } from '../stores/uiStore'
import { MODULES, isModuleEnabled } from './modules'

describe('Plugin-Module aus Manifesten', () => {
  it('ergänzt Plugin-Module, ohne sie in der Kernliste hartzuverdrahten', () => {
    expect(CORE_MODULES.map((module) => module.id)).not.toContain('antares')
    expect(CORE_MODULES.map((module) => module.id)).not.toContain('mz-suite')
    expect(CORE_MODULES.map((module) => module.id)).not.toContain('remarkable')

    expect(MODULES.map((module) => module.id)).toEqual(
      expect.arrayContaining(['antares', 'mz-suite', 'remarkable'])
    )
    expect(new Set(MODULES.map((module) => module.id)).size).toBe(MODULES.length)
  })

  it('liest Plugin-Flags über die im Manifest deklarierten Pfade', () => {
    const state = useUIStore.getState()
    // Alle Vertikalen lesen ihr Enabled-Flag jetzt aus der generischen pluginConfig (A-pre Schritt 3).
    state.setBooleanSettingPath('pluginConfig.antares.enabled', true)
    state.setBooleanSettingPath('pluginConfig.edoobox.enabled', true)
    state.setBooleanSettingPath('pluginConfig.remarkable.enabled', true)

    expect(isModuleEnabled('antares')).toBe(true)
    expect(isModuleEnabled('mz-suite')).toBe(true)
    expect(isModuleEnabled('remarkable')).toBe(true)

    state.setBooleanSettingPath('pluginConfig.antares.enabled', false)
    state.setBooleanSettingPath('pluginConfig.edoobox.enabled', false)
    state.setBooleanSettingPath('pluginConfig.marketing.enabled', false)
    state.setBooleanSettingPath('pluginConfig.remarkable.enabled', false)
  })
})
