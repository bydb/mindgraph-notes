// Bild-Generierung (image-generation-Modul) — Karte im KI-Tab unter „Cloud-Anbieter".
//
// Der Google-AI-Studio-Key wird via safeStorage im Main-Prozess verschlüsselt abgelegt
// (IPC image-gen-save/load/delete-key) — NICHT im uiStore/localStorage. Der Schalter im
// Kopf ist der Modul-Schalter (derselbe wie im Modul-Tab); aus = nur der Kopf sichtbar.
// Auto-Save: der Key wird beim Verlassen des Felds gespeichert, der verwaiste
// „Key speichern"-Kasten (Review-Befund 1c) ist weg.

import React, { useEffect, useState } from 'react'
import { useTranslation } from '../../utils/translations'
import { useIsModuleEnabled, setModuleEnabled } from '../../utils/modules'
import { Card, ServiceHead, IconTile, TILE_GLYPH, Row, Note, SecretField } from './SettingsUI'

export const ImageGenerationSection: React.FC = () => {
  const { t } = useTranslation()
  const enabled = useIsModuleEnabled('image-generation')
  const [saved, setSaved] = useState(false)
  const [suffix, setSuffix] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Hinterlegten Key beim Mounten laden — nur um „gespeichert" + Endung anzuzeigen.
  useEffect(() => {
    window.electronAPI.imageGenLoadKey()
      .then(key => {
        setSaved(!!key)
        setSuffix(key ? key.slice(-4) : null)
      })
      .catch(() => {})
  }, [])

  const save = async (key: string) => {
    setError(null)
    setBusy(true)
    try {
      const res = await window.electronAPI.imageGenSaveKey(key)
      if (res.success) {
        setSaved(true)
        setSuffix(key.slice(-4))
        // Wer „Bilder möglich“ anzeigt (Agent-Tab), fragt erst NACH der Änderung neu —
        // ein Schließen der Einstellungen kann vor dem Abschluss liegen.
        window.dispatchEvent(new CustomEvent('mindgraph:imageKeyChanged'))
      } else {
        setError(res.error || t('settings.ai.imageGen.saveFailed'))
      }
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    setError(null)
    const res = await window.electronAPI.imageGenDeleteKey()
    if (res.success) {
      setSaved(false)
      setSuffix(null)
      window.dispatchEvent(new CustomEvent('mindgraph:imageKeyChanged'))
    }
  }

  return (
    <Card>
      <ServiceHead
        icon={<IconTile bg="#7c5cff">{TILE_GLYPH.image}</IconTile>}
        name={t('settings.cloud.imageGen.name')}
        desc={t('settings.cloud.imageGen.desc')}
        status={!enabled ? null : saved ? { tone: 'ok', label: t('settings.cloud.ready') } : { tone: 'warn', label: t('settings.cloud.keyMissing') }}
        dimmed={!enabled}
        plain={!enabled}
        toggle={{
          checked: enabled,
          onChange: v => { void setModuleEnabled('image-generation', v).catch(err => console.error('[settings] image-generation:', err)) },
          ariaLabel: t('settings.cloud.imageGen.name')
        }}
      />
      {enabled && (
        <>
          <Row label={t('settings.cloud.imageGen.keyLabel')} hint={t('settings.cloud.apiKeyHint')}>
            <SecretField saved={saved} suffix={suffix} onSave={save} onRemove={remove} placeholder="AIzaSy..." busy={busy} />
          </Row>
          {error && <Note tone="danger">{error}</Note>}
        </>
      )}
    </Card>
  )
}
