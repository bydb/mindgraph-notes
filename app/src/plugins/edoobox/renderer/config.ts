// edoobox-Vertikale: schmaler Zugriff auf die generisch (pluginConfig) gespeicherte Config.
// Typ + Defaults liegen — wie bei Antares — im Kern (uiStore), damit auch die noch im Kern
// liegenden Settings-Tabs sie nutzen können, ohne aus src/plugins/ zu importieren (Deletion-Test).

import { getPluginConfig } from '../../../renderer/plugins/config'
import {
  EDOOBOX_DEFAULTS, MARKETING_DEFAULTS,
  type EdooboxSettings, type MarketingSettings,
} from '../../../renderer/stores/uiStore'

/** Nicht-reaktiver Read (für Stores/Aufrufpfade). */
export function getEdooboxConfig(): EdooboxSettings {
  return getPluginConfig('edoobox', EDOOBOX_DEFAULTS)
}
export function getMarketingConfig(): MarketingSettings {
  return getPluginConfig('marketing', MARKETING_DEFAULTS)
}
