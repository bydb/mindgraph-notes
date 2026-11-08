import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from '../../utils/translations'
import { Card, ServiceHead, IconTile, TILE_GLYPH, Row, Note, Details, Toggle, Button, SectionTitle } from './SettingsUI'
import { deriveBrandTokens, isHexColor, type BrandProfile } from '../../../shared/brand'
import type { PaletteSuggestion } from '../../../shared/brandPalette'
import type { NoteAgentSkill } from '../../../shared/types'
import './BrandSection.css'

// Hausdesign-Builder (docs/codex-collab/skill-builder-hausdesign.md). Bewusst EIN Knopf „Anlegen“
// statt Auto-Save je Feld: Speichern erzeugt Präsentation, Briefkopf und Skill im Vault — ein
// halb getippter Name darf nicht schon in Dateien landen (wie bei den E-Mail-Relevanzregeln).

interface Draft {
  name: string
  subline: string
  logoHasName: boolean
  primary: string
  secondary: string
  dark: string
  address: string
  phone: string
  email: string
  web: string
  withLetter: boolean
}

interface PickedLogo {
  token: string
  dataUrl: string
  width: number
  height: number
  suggestion: PaletteSuggestion
}

const DEFAULT_PRIMARY = '#1f6f6a'
const DEFAULT_DARK = '#222b3a'

function draftFromProfile(p: BrandProfile): Draft {
  return {
    name: p.name,
    subline: p.subline ?? '',
    logoHasName: p.logoHasName,
    primary: p.colors.primary,
    secondary: p.colors.secondary ?? '',
    dark: p.colors.dark,
    address: p.contact.address ?? '',
    phone: p.contact.phone ?? '',
    email: p.contact.email ?? '',
    web: p.contact.web ?? '',
    withLetter: !!p.letterFile
  }
}

function ColorField({ id, value, onChange, optional }: { id: string; value: string; onChange: (v: string) => void; optional?: boolean }) {
  const valid = isHexColor(value)
  return (
    <span className="brand-color">
      <input
        type="color"
        aria-label={id}
        value={valid ? value : '#ffffff'}
        onChange={e => onChange(e.target.value)}
        className="brand-color-swatch"
      />
      <input
        id={id}
        type="text"
        className={`sui-input brand-color-hex${value && !valid ? ' is-invalid' : ''}`}
        value={value}
        placeholder={optional ? '—' : '#RRGGBB'}
        spellCheck={false}
        maxLength={7}
        onChange={e => onChange(e.target.value.trim())}
      />
    </span>
  )
}

export function BrandSection({ vaultPath, skills, onChanged }: { vaultPath: string; skills: NoteAgentSkill[]; onChanged: () => void }) {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<BrandProfile | null>(null)
  const [folderRel, setFolderRel] = useState('')
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [picked, setPicked] = useState<PickedLogo | null>(null)
  const [busy, setBusy] = useState<'pick' | 'save' | 'remove' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [confirmRemove, setConfirmRemove] = useState(false)

  const letterSkills = useMemo(
    () => skills.filter(s => s.enabled && !/^hausdesign(-\d)?$/.test(s.folderName) && (/briefkopf/i.test(s.folderName) || /briefkopf/i.test(s.name))),
    [skills]
  )

  const load = useCallback(async () => {
    setLoading(true)
    const res = await window.electronAPI.brandGet(vaultPath)
    if (res.success && res.exists && res.profile) {
      setProfile(res.profile)
      setFolderRel(res.folderRel ?? '')
      setLogoUrl(res.logoDataUrl ?? null)
    } else {
      setProfile(null)
      setFolderRel('')
      setLogoUrl(null)
      if (!res.success && res.error) setError(res.error)
    }
    setLoading(false)
  }, [vaultPath])

  useEffect(() => { void load() }, [load])

  const pickLogo = async () => {
    setError(null)
    setStatus(null)
    setBusy('pick')
    try {
      const res = await window.electronAPI.brandPickLogo()
      if (res.canceled) return
      if (!res.success || !res.token || !res.dataUrl || !res.suggestion) {
        setError(res.error || 'Logo konnte nicht gelesen werden')
        return
      }
      const pl: PickedLogo = { token: res.token, dataUrl: res.dataUrl, width: res.width ?? 1, height: res.height ?? 1, suggestion: res.suggestion }
      setPicked(pl)
      const s = pl.suggestion
      setDraft(prev => {
        const base: Draft = prev ?? (profile ? draftFromProfile(profile) : {
          name: '', subline: '', logoHasName: false, primary: DEFAULT_PRIMARY, secondary: '', dark: DEFAULT_DARK,
          address: '', phone: '', email: '', web: '', withLetter: letterSkills.length === 0
        })
        return {
          ...base,
          primary: s.primary ?? base.primary,
          secondary: s.secondary ?? '',
          dark: s.dark ?? base.dark,
          // Breites Logo: meist steht der Name schon darin.
          logoHasName: prev ? base.logoHasName : pl.width / pl.height >= 1.4
        }
      })
    } finally {
      setBusy(null)
    }
  }

  const startEdit = () => {
    if (!profile) return
    setDraft(draftFromProfile(profile))
    setPicked(null)
    setStatus(null)
    setError(null)
  }

  const cancel = () => {
    setDraft(null)
    setPicked(null)
    setError(null)
  }

  const colorsValid = draft
    ? isHexColor(draft.primary) && isHexColor(draft.dark) && (draft.secondary === '' || isHexColor(draft.secondary))
    : false

  const save = async () => {
    if (!draft || !colorsValid || !draft.name.trim()) return
    setBusy('save')
    setError(null)
    try {
      const res = await window.electronAPI.brandSave(vaultPath, {
        name: draft.name,
        subline: draft.subline,
        logoHasName: draft.logoHasName,
        contact: { address: draft.address, phone: draft.phone, email: draft.email, web: draft.web },
        colors: { primary: draft.primary, dark: draft.dark, ...(draft.secondary ? { secondary: draft.secondary } : {}) },
        withLetter: draft.withLetter,
        enabled: profile ? profile.enabled : true
      }, picked?.token)
      if (!res.success) {
        setError(res.error || 'Speichern fehlgeschlagen')
        return
      }
      setDraft(null)
      setPicked(null)
      setStatus(t('settings.brand.saved', { folder: res.folderRel ?? '' }))
      await load()
      onChanged()
    } finally {
      setBusy(null)
    }
  }

  const toggleEnabled = async (next: boolean) => {
    setError(null)
    const res = await window.electronAPI.brandSetEnabled(vaultPath, next)
    if (!res.success) setError(res.error || 'Speichern fehlgeschlagen')
    await load()
  }

  const remove = async () => {
    setBusy('remove')
    setError(null)
    try {
      const res = await window.electronAPI.brandRemove(vaultPath)
      if (!res.success) {
        setError(res.error || 'Entfernen fehlgeschlagen')
        return
      }
      setConfirmRemove(false)
      setStatus(res.keptFolder ? t('settings.brand.removedKept') : t('settings.brand.removed'))
      await load()
      onChanged()
    } finally {
      setBusy(null)
    }
  }

  const tokens = useMemo(() => {
    if (!draft || !colorsValid) return null
    return deriveBrandTokens({ primary: draft.primary, dark: draft.dark, ...(draft.secondary ? { secondary: draft.secondary } : {}) })
  }, [draft, colorsValid])

  const shownLogo = picked?.dataUrl ?? logoUrl
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft(d => (d ? { ...d, [k]: v } : d))

  const logoTile = shownLogo
    ? <span className="brand-logo-tile" aria-hidden="true"><img src={shownLogo} alt="" /></span>
    : <IconTile>{TILE_GLYPH.image}</IconTile>

  if (loading) return null

  return (
    <>
      <SectionTitle title={t('settings.brand.title')} />
      <Card anchor="skills-brand">
        <ServiceHead
          icon={logoTile}
          name={profile && !draft ? profile.name : t('settings.brand.title')}
          desc={profile && !draft ? (profile.letterFile ? t('settings.brand.whereList') : t('settings.brand.whereListNoLetter')) : t('settings.brand.desc')}
          status={draft ? { tone: 'checking', label: t('settings.brand.draft') } : profile ? { tone: profile.enabled ? 'ok' : 'off', label: profile.enabled ? t('settings.brand.active') : t('settings.brand.inactive') } : null}
          actions={
            draft ? undefined : profile ? (
              <>
                <Button onClick={startEdit}>{t('settings.brand.edit')}</Button>
                <Button variant="link" onClick={() => setConfirmRemove(true)}>{t('settings.brand.remove')}</Button>
              </>
            ) : (
              <Button variant="primary" onClick={() => void pickLogo()} disabled={busy !== null}>
                {busy === 'pick' ? t('settings.brand.picking') : t('settings.brand.pick')}
              </Button>
            )
          }
          toggle={profile && !draft ? { checked: profile.enabled, onChange: next => void toggleEnabled(next), ariaLabel: t('settings.brand.toggleAria') } : undefined}
        />

        {confirmRemove && profile && (
          <Note tone="warn">
            {t('settings.brand.removeConfirm', { folder: folderRel })}
            <span className="brand-actions">
              <Button danger onClick={() => void remove()} disabled={busy !== null}>{t('settings.brand.removeYes')}</Button>
              <Button variant="link" onClick={() => setConfirmRemove(false)}>{t('settings.brand.cancel')}</Button>
            </span>
          </Note>
        )}

        {profile && !draft && (
          <Row label={t('settings.brand.files')} hint={t('settings.brand.filesHint')}>
            <span className="brand-files">
              {[profile.deckFile, ...(profile.letterFile ? [profile.letterFile] : [])].map(f => (
                <code key={f}>{folderRel}/{f}</code>
              ))}
            </span>
          </Row>
        )}

        {draft && (
          <>
            <Row label={t('settings.brand.logo')} hint={picked ? `${picked.width} × ${picked.height} px` : undefined}>
              <Button onClick={() => void pickLogo()} disabled={busy !== null}>
                {busy === 'pick' ? t('settings.brand.picking') : t('settings.brand.pickAgain')}
              </Button>
            </Row>
            <Row label={t('settings.brand.name')} hint={t('settings.brand.nameHint')} htmlFor="brand-name">
              <input id="brand-name" type="text" className="sui-input brand-wide" value={draft.name} maxLength={80}
                placeholder={t('settings.brand.namePlaceholder')} onChange={e => set('name', e.target.value)} />
            </Row>
            <Row label={t('settings.brand.logoHasName')} hint={t('settings.brand.logoHasNameHint')} htmlFor="brand-logo-has-name">
              <Toggle id="brand-logo-has-name" checked={draft.logoHasName} onChange={v => set('logoHasName', v)} />
            </Row>

            <Row label={t('settings.brand.colors')} hint={t('settings.brand.colorsHint')} stacked>
              {picked && picked.suggestion.swatches.length > 0 && (
                <div className="brand-swatches">
                  <span className="brand-swatches-label">{t('settings.brand.fromLogo')}</span>
                  {picked.suggestion.swatches.map(sw => (
                    <button key={sw.hex} type="button" className="brand-swatch" title={sw.hex}
                      onClick={() => sw.neutral ? set('dark', sw.hex) : set('primary', sw.hex)}>
                      <span style={{ background: sw.hex }} />{sw.hex}
                    </button>
                  ))}
                </div>
              )}
              {picked && !picked.suggestion.primary && <Note tone="warn">{t('settings.brand.noPrimary')}</Note>}
            </Row>
            <Row label={t('settings.brand.primary')} hint={t('settings.brand.primaryHint')} htmlFor="brand-primary">
              <ColorField id="brand-primary" value={draft.primary} onChange={v => set('primary', v)} />
            </Row>
            <Row label={t('settings.brand.secondary')} hint={t('settings.brand.secondaryHint')} htmlFor="brand-secondary">
              <ColorField id="brand-secondary" value={draft.secondary} optional onChange={v => set('secondary', v)} />
            </Row>
            <Row label={t('settings.brand.dark')} hint={t('settings.brand.darkHint')} htmlFor="brand-dark">
              <ColorField id="brand-dark" value={draft.dark} onChange={v => set('dark', v)} />
            </Row>
            {!colorsValid && <Note tone="danger">{t('settings.brand.invalidHex')}</Note>}

            <Row label={t('settings.brand.letter')} hint={t('settings.brand.letterHint')} htmlFor="brand-letter">
              <Toggle id="brand-letter" checked={draft.withLetter} onChange={v => set('withLetter', v)} />
            </Row>
            {letterSkills.length > 0 && (
              <Note tone="muted">{t('settings.brand.letterExisting', { names: letterSkills.map(s => s.name).join(', ') })}</Note>
            )}
            {draft.withLetter && (
              <Details title={t('settings.brand.contact')}>
                <Row label={t('settings.brand.subline')} hint={t('settings.brand.sublineHint')} htmlFor="brand-subline">
                  <input id="brand-subline" type="text" className="sui-input brand-wide" value={draft.subline} maxLength={100} onChange={e => set('subline', e.target.value)} />
                </Row>
                <Row label={t('settings.brand.address')} htmlFor="brand-address">
                  <textarea id="brand-address" className="sui-textarea brand-wide" rows={3} value={draft.address} maxLength={160} onChange={e => set('address', e.target.value)} />
                </Row>
                <Row label={t('settings.brand.phone')} htmlFor="brand-phone">
                  <input id="brand-phone" type="text" className="sui-input" value={draft.phone} maxLength={40} onChange={e => set('phone', e.target.value)} />
                </Row>
                <Row label={t('settings.brand.email')} htmlFor="brand-email">
                  <input id="brand-email" type="email" className="sui-input" value={draft.email} maxLength={100} onChange={e => set('email', e.target.value)} />
                </Row>
                <Row label={t('settings.brand.web')} htmlFor="brand-web">
                  <input id="brand-web" type="text" className="sui-input" value={draft.web} maxLength={100} onChange={e => set('web', e.target.value)} />
                </Row>
              </Details>
            )}

            {tokens && (
              <Row label={t('settings.brand.preview')} stacked>
                <div
                  className="brand-preview"
                  style={{
                    ['--b-fill' as string]: tokens.fill,
                    ['--b-text' as string]: tokens.text,
                    ['--b-tint' as string]: tokens.tint,
                    ['--b-dark' as string]: tokens.dark,
                    ['--b-ondark' as string]: tokens.onDark
                  }}
                >
                  <figure className="brand-pv brand-pv-slide">
                    <div className="brand-pv-frame">
                      <span className="brand-pv-bar" />
                      <div className="brand-pv-logo-row">
                        {shownLogo && <img src={shownLogo} alt="" className={draft.logoHasName ? 'is-large' : ''} />}
                        {!draft.logoHasName && <span className="brand-pv-wordmark">{draft.name || '…'}</span>}
                      </div>
                      <span className="brand-pv-kicker">{t('settings.brand.previewKicker')}</span>
                      <span className="brand-pv-title">{t('settings.brand.previewSlideTitle')}</span>
                    </div>
                    <figcaption>{t('settings.brand.previewSlide')}</figcaption>
                  </figure>
                  <figure className="brand-pv brand-pv-dark">
                    <div className="brand-pv-frame">
                      <span className="brand-pv-kicker">{t('settings.brand.previewKicker')}</span>
                      <span className="brand-pv-title">{t('settings.brand.previewSlideTitle')}</span>
                    </div>
                    <figcaption>{t('settings.brand.previewDark')}</figcaption>
                  </figure>
                  <figure className="brand-pv brand-pv-mindmap">
                    <div className="brand-pv-frame">
                      <span className="brand-pv-node is-center">{t('settings.brand.previewMindmapCenter')}</span>
                      <span className="brand-pv-node is-branch">{t('settings.brand.previewMindmapBranch')}</span>
                      <span className="brand-pv-node is-branch">{t('settings.brand.previewMindmapBranch')}</span>
                    </div>
                    <figcaption>{t('settings.brand.previewMindmap')}</figcaption>
                  </figure>
                  <figure className="brand-pv brand-pv-html">
                    <div className="brand-pv-frame">
                      {shownLogo && <img src={shownLogo} alt="" />}
                      <span className="brand-pv-h1">{t('settings.brand.previewHtmlTitle')}</span>
                      <span className="brand-pv-abstract">Lorem ipsum dolor sit amet, <span className="brand-pv-link">{t('settings.brand.previewHtmlLink')}</span>.</span>
                    </div>
                    <figcaption>{t('settings.brand.previewHtml')}</figcaption>
                  </figure>
                </div>
                {tokens.notes.includes('text-darkened') && <Note tone="muted">{t('settings.brand.noteText', { hex: tokens.text })}</Note>}
                {tokens.notes.includes('fill-darkened') && <Note tone="muted">{t('settings.brand.noteFill', { hex: tokens.fill })}</Note>}
                {tokens.notes.includes('dark-darkened') && <Note tone="muted">{t('settings.brand.noteDark', { hex: tokens.dark })}</Note>}
              </Row>
            )}

            <Note tone="muted">{t('settings.brand.offline')}</Note>
            <div className="brand-actions brand-actions-end">
              <Button variant="link" onClick={cancel}>{t('settings.brand.cancel')}</Button>
              <Button variant="primary" onClick={() => void save()} disabled={busy !== null || !colorsValid || !draft.name.trim() || (!profile && !picked)}>
                {busy === 'save' ? t('settings.brand.saving') : profile ? t('settings.brand.update') : t('settings.brand.save')}
              </Button>
            </div>
          </>
        )}

        {status && <Note tone="ok">{status}</Note>}
        {error && <Note tone="danger">{error}</Note>}
      </Card>
    </>
  )
}
