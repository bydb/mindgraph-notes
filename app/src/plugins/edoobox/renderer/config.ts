// edoobox-Vertikale: schmaler Zugriff auf die generisch (pluginConfig) gespeicherte Config.
// Typ + Defaults liegen — wie bei Antares — im Kern (uiStore), damit auch die noch im Kern
// liegenden Settings-Tabs sie nutzen können, ohne aus src/plugins/ zu importieren (Deletion-Test).

import { getPluginConfig } from '../../../renderer/plugins/config'
import {
  EDOOBOX_DEFAULTS, WORDPRESS_DEFAULTS,
  type EdooboxSettings, type WordpressSettings,
} from '../../../renderer/stores/uiStore'

/** Nicht-reaktiver Read (für Stores/Aufrufpfade). */
export function getEdooboxConfig(): EdooboxSettings {
  return getPluginConfig('edoobox', EDOOBOX_DEFAULTS)
}
/** Config des (eigenständigen) WordPress-Plugins — vom Marketing-Tab nur MITGELESEN. */
export function getWordpressConfig(): WordpressSettings {
  return getPluginConfig('wordpress', WORDPRESS_DEFAULTS)
}
