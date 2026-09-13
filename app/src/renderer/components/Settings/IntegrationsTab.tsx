// Einstellungen → Integrationen (Redesign 2a): eine Dienst-Karte pro externem Dienst.
//
// Jede Karte hat Kopf (Icon · Name · Status-Chip · Handlung), darunter Zeilen mit Auto-Save,
// bei Störung eine Diagnose-Zeile MIT nächstem Schritt, und einen Aufklapper für die lange
// Erklärung. Ist das Modul ausgeschaltet, steht statt der Controls eine gestrichelte Karte
// mit „Modul einschalten" — Einschalten passiert direkt hier, kein Umweg über den Modul-Tab.
//
// Der Verbindungszustand kommt aus useIntegrationStatus (geteilt mit dem Modul-Tab).

import React from 'react'
import { useUIStore } from '../../stores/uiStore'
import { useIsModuleEnabled, setModuleEnabled } from '../../utils/modules'
import { useTranslation } from '../../utils/translations'
import { ExternalLink } from '../Shared/ExternalLink'
import type { ConnState, IntegrationStatus } from './useIntegrationStatus'
import {
  PageHeader, SectionTitle, Card, ServiceHead, IconTile, TILE_GLYPH, Row, Note, Details,
  Toggle, Segmented, Select, Button, TextInput, NumberInput, SecretField, ChipSelect, ModuleOffCard,
  type StatusTone
} from './SettingsUI'

const RESEARCH_COLOR = '#cc4d8f'
const DOCUMENT_COLOR = '#3aa0b0'
const WRITING_COLOR = '#7c5cff'

function connTone(state: ConnState): StatusTone {
  return state === 'connected' ? 'ok' : state === 'checking' ? 'checking' : 'off'
}

export const IntegrationsTab: React.FC<{
  status: IntegrationStatus
  onGoToModules: () => void
}> = ({ status, onGoToModules }) => {
  const { t } = useTranslation()
  const connLabel = (s: ConnState) =>
    s === 'connected' ? t('settings.connected') : s === 'checking' ? t('settings.checkingConnection') : t('settings.notConnected')
  const conn = (s: ConnState) => ({ tone: connTone(s), label: connLabel(s) })

  const zoteroOn = useIsModuleEnabled('zotero')
  const researchOn = useIsModuleEnabled('semantic-scholar')
  const doclingOn = useIsModuleEnabled('docling')
  const ocrOn = useIsModuleEnabled('vision-ocr')
  const ltOn = useIsModuleEnabled('language-tool')
  const readwiseOn = useIsModuleEnabled('readwise')

  const docling = useUIStore(s => s.docling)
  const setDocling = useUIStore(s => s.setDocling)
  const visionOcr = useUIStore(s => s.visionOcr)
  const setVisionOcr = useUIStore(s => s.setVisionOcr)
  const languageTool = useUIStore(s => s.languageTool)
  const setLanguageTool = useUIStore(s => s.setLanguageTool)
  const readwise = useUIStore(s => s.readwise)
  const setReadwise = useUIStore(s => s.setReadwise)

  const enable = (id: string) => { void setModuleEnabled(id, true).catch(err => console.error('[settings] Modul einschalten:', err)) }

  const zoteroIcon = <IconTile bg="#cc2936" text="Z" serif />
  const researchIcon = <IconTile bg={RESEARCH_COLOR}>{TILE_GLYPH.search}</IconTile>
  const doclingIcon = <IconTile bg={DOCUMENT_COLOR}>{TILE_GLYPH.doc}</IconTile>
  const ocrIcon = <IconTile bg={DOCUMENT_COLOR}>{TILE_GLYPH.doc}</IconTile>
  const ltIcon = <IconTile bg={WRITING_COLOR}>{TILE_GLYPH.pen}</IconTile>
  const readwiseIcon = <IconTile bg={RESEARCH_COLOR}>{TILE_GLYPH.book}</IconTile>

  const ocrModelKnown = !!visionOcr.model && (status.visionOcrModels.length === 0 || status.visionOcrModels.some(m => m.name === visionOcr.model))
  const ltMode = languageTool.mode || 'local'

  return (
    <div className="settings-section">
      <PageHeader
        title={t('settings.tab.integrations')}
        subtitle={<>{t('settings.integ.subtitle')} <button type="button" className="sui-link" onClick={onGoToModules}>{t('settings.integ.subtitleLink')}</button></>}
      />

      {/* ── Forschung & Wissen ─────────────────────────────────────────── */}
      <SectionTitle title={t('settings.integ.groupResearch')} />

      {!zoteroOn ? (
        <ModuleOffCard icon={zoteroIcon} name={t('settings.integ.zotero.name')} onEnable={() => enable('zotero')} anchor="integration-zotero" />
      ) : (
        <Card anchor="integration-zotero">
          <ServiceHead
            icon={zoteroIcon}
            name={t('settings.integ.zotero.name')}
            desc={<>{t('settings.integ.zotero.desc')} · <kbd className="sui-kbd">⌘⇧Z</kbd></>}
            status={conn(status.zotero)}
            actions={<Button onClick={() => void status.checkZotero()} disabled={status.zotero === 'checking'}>{t('settings.integ.check')}</Button>}
          />
          {status.zotero === 'disconnected' && (
            <Note tone="warn" action={t('settings.integ.recheck')} onAction={() => void status.checkZotero()}>
              <b>{t('settings.integ.zotero.diagnosisTitle')}</b> {t('settings.integ.zotero.diagnosisBody')}
            </Note>
          )}
          <Details title={t('settings.integ.zotero.howTitle')}>
            <p>{t('settings.integ.zotero.howBody')}</p>
          </Details>
        </Card>
      )}

      {!researchOn ? (
        <ModuleOffCard icon={researchIcon} name={t('settings.integ.research.name')} onEnable={() => enable('semantic-scholar')} anchor="integration-research" />
      ) : (
        <Card anchor="integration-research">
          <ServiceHead
            icon={researchIcon}
            name={t('settings.integ.research.name')}
            desc={t('settings.integ.research.desc')}
            status={conn(status.openAlex)}
            actions={<Button onClick={() => void status.checkOpenAlex()} disabled={status.openAlex === 'checking'}>{t('settings.integ.check')}</Button>}
          />
          {status.openAlexMessage && status.openAlex !== 'checking' && (
            <Note tone={status.openAlex === 'connected' ? (status.openAlexKeySaved ? 'ok' : 'muted') : 'warn'}>
              {status.openAlexMessage}
            </Note>
          )}
          <Row
            label={t('settings.integrations.openAlexApiKey')}
            hint={<>{t('settings.integ.research.keyHint')} <ExternalLink href="https://openalex.org/settings/api">openalex.org</ExternalLink></>}
          >
            <SecretField
              saved={status.openAlexKeySaved}
              suffix={status.openAlexKeySuffix}
              onSave={status.saveOpenAlexKey}
              onRemove={status.deleteOpenAlexKey}
              placeholder="OPENALEX_API_KEY"
            />
          </Row>
          <Row label={t('settings.integrations.openAlexMailto')} hint={t('settings.integ.research.mailtoHint')}>
            <TextInput
              type="email"
              value={status.openAlexMailtoSaved ?? ''}
              onCommit={v => void status.saveOpenAlexMailto(v)}
              placeholder="mail@example.com"
              showAutoSaveHint
            />
          </Row>
        </Card>
      )}

      {!readwiseOn ? (
        <ModuleOffCard icon={readwiseIcon} name={t('settings.integ.readwise.name')} onEnable={() => enable('readwise')} anchor="integration-readwise" />
      ) : (
        <Card anchor="integration-readwise">
          <ServiceHead
            icon={readwiseIcon}
            name={t('settings.integ.readwise.name')}
            desc={t('settings.integ.readwise.desc')}
            status={readwise.apiKey ? conn(status.readwise) : { tone: 'warn', label: t('settings.integ.readwise.noKey') }}
            actions={readwise.apiKey ? <Button onClick={() => void status.checkReadwise()} disabled={status.readwise === 'checking'}>{t('settings.integ.check')}</Button> : undefined}
          />
          {readwise.apiKey && status.readwise === 'disconnected' && (
            <Note tone="warn" action={t('settings.integ.recheck')} onAction={() => void status.checkReadwise()}>
              {t('settings.integ.readwise.diagnosis')}
            </Note>
          )}
          <Row
            label={t('settings.readwise.apiKey')}
            hint={<>{t('settings.integ.readwise.keyHint')} <ExternalLink href="https://readwise.io/access_token">readwise.io</ExternalLink></>}
          >
            <SecretField
              saved={!!readwise.apiKey}
              suffix={readwise.apiKey ? readwise.apiKey.slice(-4) : null}
              onSave={key => { setReadwise({ apiKey: key }); void status.checkReadwise(key) }}
              onRemove={() => { setReadwise({ apiKey: '' }); void status.checkReadwise('') }}
              placeholder={t('settings.readwise.apiKeyHint')}
            />
          </Row>
          <Row label={t('settings.readwise.syncFolder')} hint={t('settings.integ.readwise.folderHint')}>
            <TextInput value={readwise.syncFolder} onCommit={v => setReadwise({ syncFolder: v })} placeholder="500 - Readwise" />
          </Row>
          <Row label={t('settings.readwise.categories')} hint={t('settings.integ.readwise.categoriesHint')}>
            <ChipSelect
              options={(['books', 'articles', 'tweets', 'podcasts', 'supplementals'] as const).map(c => ({ value: c, label: t(`settings.readwise.category.${c}`) }))}
              selected={c => readwise.syncCategories?.[c] !== false}
              onToggle={(c, next) => setReadwise({ syncCategories: { ...readwise.syncCategories, [c]: next } })}
            />
          </Row>
          <Row label={t('settings.readwise.autoSync')} htmlFor="readwise-autosync">
            <Toggle id="readwise-autosync" checked={readwise.autoSync} onChange={v => setReadwise({ autoSync: v })} />
          </Row>
          <Row label={t('settings.readwise.autoSyncInterval')} disabled={!readwise.autoSync}>
            <Select
              value={readwise.autoSyncInterval}
              onChange={e => setReadwise({ autoSyncInterval: parseInt(e.target.value, 10) })}
              disabled={!readwise.autoSync}
            >
              {[15, 30, 60, 120].map(m => <option key={m} value={m}>{m} {t('settings.readwise.minutes')}</option>)}
            </Select>
          </Row>
          <Row
            label={t('settings.readwise.syncNow')}
            hint={
              <>
                {t('settings.readwise.lastSync')}: {readwise.lastSyncedAt ? new Date(readwise.lastSyncedAt).toLocaleString() : t('settings.readwise.never')}
                {readwise.lastSyncedAt && (
                  <> · <button type="button" className="sui-link" onClick={() => setReadwise({ lastSyncedAt: '' })} disabled={status.readwiseSyncing}>{t('settings.readwise.resetSync')}</button></>
                )}
              </>
            }
          >
            <Button
              variant="primary"
              onClick={() => void status.triggerReadwiseSync()}
              disabled={!readwise.apiKey || status.readwiseSyncing || status.readwise !== 'connected'}
            >
              {status.readwiseSyncing ? t('settings.readwise.syncing') : (readwise.lastSyncedAt ? t('settings.readwise.syncNow') : t('settings.readwise.fullSync'))}
            </Button>
          </Row>
          {status.readwiseSyncing && status.readwiseSyncProgress && (
            <Note tone="muted">
              {status.readwiseSyncProgress.title}
              {status.readwiseSyncProgress.total > 0 && ` (${status.readwiseSyncProgress.current}/${status.readwiseSyncProgress.total})`}
            </Note>
          )}
          {status.readwiseSyncResult && (
            <Note tone={status.readwiseSyncResult.startsWith('Fehler') ? 'danger' : 'ok'}>{status.readwiseSyncResult}</Note>
          )}
        </Card>
      )}

      {/* ── Dokument-Verarbeitung ──────────────────────────────────────── */}
      <SectionTitle title={t('settings.integ.groupDocuments')} />

      {!doclingOn ? (
        <ModuleOffCard icon={doclingIcon} name={t('settings.integ.docling.name')} onEnable={() => enable('docling')} anchor="integration-docling" />
      ) : (
        <Card anchor="integration-docling">
          <ServiceHead
            icon={doclingIcon}
            name={t('settings.integ.docling.name')}
            desc={t('settings.integ.docling.desc')}
            status={{
              tone: connTone(status.docling),
              label: status.docling === 'connected' && status.doclingVersion ? `${t('settings.connected')} · v${status.doclingVersion}` : connLabel(status.docling)
            }}
            actions={<Button onClick={() => void status.checkDocling()} disabled={status.docling === 'checking'}>{t('settings.integ.check')}</Button>}
          />
          {status.docling === 'disconnected' && (
            <Note tone="warn" action={t('settings.integ.recheck')} onAction={() => void status.checkDocling()}>
              <b>{t('settings.integ.docling.diagnosis', { url: docling.url || 'http://localhost:5001' })}</b> {t('settings.integ.docling.diagnosisBody')}
            </Note>
          )}
          <Row label={t('settings.docling.url')} hint={t('settings.integ.docling.urlHint')}>
            <TextInput
              type="url"
              value={docling.url}
              onCommit={v => { setDocling({ url: v }); void status.checkDocling(v) }}
              placeholder="http://localhost:5001"
            />
          </Row>
          <Row label={t('settings.docling.ocrEnabled')} htmlFor="docling-ocr">
            <Toggle id="docling-ocr" checked={docling.ocrEnabled} onChange={v => setDocling({ ocrEnabled: v })} />
          </Row>
          <Row label={t('settings.docling.ocrLanguages')} disabled={!docling.ocrEnabled}>
            <TextInput
              narrow
              value={docling.ocrLanguages.join(', ')}
              onCommit={v => setDocling({ ocrLanguages: v.split(',').map(s => s.trim()).filter(Boolean) })}
              placeholder="de, en"
              disabled={!docling.ocrEnabled}
            />
          </Row>
          <Details title={t('settings.integ.docling.installTitle')}>
            <p><code>docker run -p 5001:5001 ds4sd/docling-serve</code></p>
            <p>{t('settings.docling.usage')}</p>
          </Details>
        </Card>
      )}

      {!ocrOn ? (
        <ModuleOffCard icon={ocrIcon} name={t('settings.integ.ocr.name')} onEnable={() => enable('vision-ocr')} anchor="integration-vision-ocr" />
      ) : (
        <Card anchor="integration-vision-ocr">
          <ServiceHead
            icon={ocrIcon}
            name={t('settings.integ.ocr.name')}
            desc={t('settings.integ.ocr.desc')}
            status={ocrModelKnown ? { tone: 'ok', label: t('settings.integ.ocr.ready') } : { tone: 'warn', label: t('settings.integ.ocr.pickModel') }}
            actions={<Button onClick={status.loadVisionOcrModels}>{t('settings.integ.ocr.reload')}</Button>}
          />
          <Row label={t('settings.visionOcr.model')} hint={t('settings.visionOcr.modelHint')}>
            <Select value={visionOcr.model} onChange={e => setVisionOcr({ model: e.target.value })}>
              <option value="">{t('settings.selectModel')}</option>
              {visionOcr.model && !status.visionOcrModels.some(m => m.name === visionOcr.model) && (
                <option value={visionOcr.model}>{visionOcr.model}</option>
              )}
              {status.visionOcrModels.map(m => <option key={m.name} value={m.name}>{m.name}</option>)}
            </Select>
          </Row>
          {status.visionOcrModels.length === 0 && (
            <Note tone="muted">{t('settings.integ.ocr.noModels')}</Note>
          )}
          <Row label={t('settings.integ.ocr.width')} hint={t('settings.integ.ocr.widthHint')}>
            <Segmented
              options={[400, 600, 800, 1200].map(w => ({ value: w, label: String(w) }))}
              value={visionOcr.pageWidth}
              onChange={w => setVisionOcr({ pageWidth: w })}
              ariaLabel={t('settings.integ.ocr.width')}
            />
          </Row>
        </Card>
      )}

      {/* ── Schreiben ──────────────────────────────────────────────────── */}
      <SectionTitle title={t('settings.integ.groupWriting')} />

      {!ltOn ? (
        <ModuleOffCard icon={ltIcon} name={t('settings.integ.lt.name')} onEnable={() => enable('language-tool')} anchor="integration-languagetool" />
      ) : (
        <Card anchor="integration-languagetool">
          <ServiceHead
            icon={ltIcon}
            name={t('settings.integ.lt.name')}
            desc={t('settings.integ.lt.desc')}
            status={conn(status.languageTool)}
            actions={<Button onClick={() => void status.checkLanguageTool()} disabled={status.languageTool === 'checking'}>{t('settings.integ.check')}</Button>}
          />
          {status.languageTool === 'disconnected' && (
            <Note tone="warn" action={t('settings.integ.recheck')} onAction={() => void status.checkLanguageTool()}>
              {ltMode === 'local'
                ? t('settings.integ.lt.diagnosisLocal', { url: languageTool.url || 'http://localhost:8010' })
                : t('settings.integ.lt.diagnosisApi')}
            </Note>
          )}
          <Row label={t('settings.languagetool.mode')}>
            <Segmented
              options={[{ value: 'local' as const, label: t('settings.integ.lt.modeLocal') }, { value: 'api' as const, label: t('settings.integ.lt.modeApi') }]}
              value={ltMode}
              onChange={m => setLanguageTool({ mode: m })}
              ariaLabel={t('settings.languagetool.mode')}
            />
          </Row>
          {ltMode === 'local' ? (
            <Row label={t('settings.languagetool.url')}>
              <TextInput type="url" value={languageTool.url} onCommit={v => setLanguageTool({ url: v })} placeholder="http://localhost:8010" />
            </Row>
          ) : (
            <>
              <Row label={t('settings.languagetool.apiUsername')}>
                <TextInput type="email" value={languageTool.apiUsername || ''} onCommit={v => setLanguageTool({ apiUsername: v })} placeholder={t('settings.languagetool.apiUsernamePlaceholder')} />
              </Row>
              <Row label={t('settings.languagetool.apiKey')}>
                <SecretField
                  saved={!!languageTool.apiKey}
                  suffix={languageTool.apiKey ? languageTool.apiKey.slice(-4) : null}
                  onSave={k => setLanguageTool({ apiKey: k })}
                  onRemove={() => setLanguageTool({ apiKey: '' })}
                  placeholder={t('settings.languagetool.apiKeyPlaceholder')}
                />
              </Row>
            </>
          )}
          <Row label={t('settings.languagetool.language')}>
            <Select value={languageTool.language} onChange={e => setLanguageTool({ language: e.target.value })}>
              <option value="auto">{t('settings.languagetool.languageAuto')}</option>
              <option value="de-DE">Deutsch</option>
              <option value="en-US">English (US)</option>
              <option value="en-GB">English (UK)</option>
              <option value="fr">Français</option>
              <option value="es">Español</option>
              <option value="it">Italiano</option>
              <option value="pt-PT">Português</option>
              <option value="nl">Nederlands</option>
              <option value="pl-PL">Polski</option>
            </Select>
          </Row>
          <Row label={t('settings.languagetool.autoCheck')} htmlFor="lt-autocheck">
            <Toggle id="lt-autocheck" checked={languageTool.autoCheck} onChange={v => setLanguageTool({ autoCheck: v })} />
          </Row>
          <Row label={t('settings.integ.lt.delay')} hint={t('settings.integ.lt.delayHint')} disabled={!languageTool.autoCheck}>
            <NumberInput
              value={languageTool.autoCheckDelay}
              onCommit={v => setLanguageTool({ autoCheckDelay: v })}
              min={500}
              max={5000}
              step={100}
              unit="ms"
              disabled={!languageTool.autoCheck}
            />
          </Row>
          <Details title={t('settings.integ.lt.howTitle')}>
            <p><b>LanguageTool</b> {t('settings.languagetool.description')}</p>
            {ltMode === 'local'
              ? <p>{t('settings.languagetool.installHint')} <code>docker run -d -p 8010:8010 erikvl87/languagetool</code></p>
              : <p>{t('settings.languagetool.apiHint')}</p>}
          </Details>
        </Card>
      )}
    </div>
  )
}
