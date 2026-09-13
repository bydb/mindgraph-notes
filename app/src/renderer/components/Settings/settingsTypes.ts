// Gemeinsame Typen der Einstellungen — von Settings.tsx und den ausgelagerten Seiten genutzt.
import type { TranslationKey } from '../../utils/translations'

export type TabTFn = (key: TranslationKey, params?: Record<string, string | number>) => string

// `plugin:<pluginId>` = dynamischer Settings-Tab eines Plugins mit settings.section-Beitrag (z.B. plugin:antares).
export type Tab = 'vault' | 'general' | 'editor' | 'templates' | 'integrations' | 'shortcuts' | 'dataview' | 'sync' | 'dailyNote' | 'remarkable' | 'email' | 'agents' | 'transport' | 'dashboard' | 'modules' | 'ai' | 'speech' | 'telegram' | 'credentials' | 'brain' | 'skills' | `plugin:${string}`
