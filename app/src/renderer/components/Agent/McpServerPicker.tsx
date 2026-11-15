import { useEffect, useRef, useState } from 'react'
import type { McpServerSummary } from '../../../shared/types'
import { MCP_MAX_TOOL_TOKENS_PER_RUN } from '../../../shared/mcp'

// Auswahl externer Server (MCP) für den nächsten Agent-Lauf. Gewählt werden nur Kennungen;
// Programm, Adresse, Freigaben und Geheimnisse liest der Main beim Start selbst (E4, E5).
// Server ohne freigegebenes Werkzeug sind sichtbar, aber nicht wählbar — mit dem nächsten Schritt.

interface Props {
  selected: string[]
  onChange: (ids: string[]) => void
  disabled: boolean
  en: boolean
  onOpenSettings: () => void
  /** Während ein Lauf arbeitet: die Server DIESES Laufs, nur Anzeige. */
  runningServers?: string[]
}

export function McpServerPicker({ selected, onChange, disabled, en, onOpenSettings, runningServers }: Props) {
  const [servers, setServers] = useState<McpServerSummary[] | null>(null)
  const [blockers, setBlockers] = useState<Record<string, string>>({})
  const selectedRef = useRef(selected)
  selectedRef.current = selected
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    let alive = true
    const load = () => {
      void window.electronAPI.mcpList().then(res => {
        if (!alive || !res.success) return
        setServers(res.servers ?? [])
        setBlockers(res.blockers ?? {})
        // Gelöschte Server aus der Auswahl entfernen, sonst lehnt der Main den Start ab.
        const known = new Set((res.servers ?? []).map(s => s.id))
        if (selectedRef.current.some(id => !known.has(id))) onChangeRef.current(selectedRef.current.filter(id => known.has(id)))
      })
    }
    load()
    // Eingerichtet wird in den Einstellungen: nach dem Schließen neu laden. Vorher zeigte der Picker
    // „keiner verbunden“, obwohl gerade Plaud verbunden wurde (GUI-Test 15.11.2026).
    window.addEventListener('mindgraph:settingsClosed', load)
    return () => { alive = false; window.removeEventListener('mindgraph:settingsClosed', load) }
  }, [])

  if (!servers) return null
  if (servers.length === 0) {
    return (
      <button type="button" className="agent-card-perm is-setup" onClick={onOpenSettings} disabled={disabled}>
        {en ? 'External services · none connected' : 'Externe Dienste · keiner verbunden'}
        <span className="agent-card-link">{en ? 'Connect a service …' : 'Dienst verbinden …'}</span>
      </button>
    )
  }

  const shown = runningServers ?? selected
  // Summe über alle gewählten Dienste (Codex F45): einzeln unauffällig, zusammen zu groß — das soll
  // vor dem Start sichtbar sein, nicht erst als Fehler.
  const chosen = servers.filter(s => selected.includes(s.id))
  const sum = chosen.reduce((n, s) => n + (s.approvedTokens ?? 0), 0)
  // Unbekannte Größe (ältere Freigaben, Umbenennung) nie als 0 zählen (Codex F47).
  const unknown = !runningServers && chosen.length > 1 && chosen.some(s => s.approvedTokens === null)
  const tooBig = !runningServers && chosen.length > 1 && !unknown && sum > MCP_MAX_TOOL_TOKENS_PER_RUN
  return (
    <>
      {servers.map(s => {
        const on = shown.includes(s.id)
        const usable = s.approvedTools.length > 0 && !blockers[s.id] && !(s.http?.oauth && !s.http.oauth.signedIn) && (s.profile !== 'business-central' || s.readOnlyConfirmed)
        const why = blockers[s.id]
          ?? (s.http?.oauth && !s.http.oauth.signedIn ? (en ? 'Not signed in' : 'Nicht angemeldet')
            : s.approvedTools.length === 0 ? (en ? 'No tool approved yet' : 'Noch kein Werkzeug freigegeben')
            : s.profile === 'business-central' && !s.readOnlyConfirmed ? (en ? 'Read-only configuration not confirmed' : 'Nur-Lese-Konfiguration nicht bestätigt') : '')
        if (!usable && !on) {
          return (
            <button key={s.id} type="button" className="agent-card-perm is-setup" onClick={onOpenSettings} disabled={disabled} title={why}>
              {s.label} · {why}
              <span className="agent-card-link">{en ? 'Settings' : 'Einstellungen'}</span>
            </button>
          )
        }
        return (
          <button
            key={s.id}
            type="button"
            className={`agent-card-perm ${on ? 'is-on' : ''}`}
            onClick={() => onChange(on ? selected.filter(id => id !== s.id) : [...selected, s.id])}
            disabled={disabled || !!runningServers}
            aria-pressed={on}
            title={`${s.transport === 'http' ? (en ? 'Network server' : 'Server über das Netz') : (en ? 'Local program' : 'Lokales Programm')} · ${s.approvedTools.length} ${en ? 'approved tools' : 'freigegebene Werkzeuge'}`}
          >
            <span className="agent-card-switch" aria-hidden="true"><span /></span>
            {s.label}
          </button>
        )
      })}
      {unknown && (
        <span className="agent-card-muted is-warning">
          {en
            ? 'Size of the approved tools unknown for at least one service — open “Show tools” in the settings once. The run checks the limit when it starts.'
            : 'Größe der Freigaben bei mindestens einem Dienst unbekannt — dort einmal „Werkzeuge anzeigen“ öffnen. Der Lauf prüft die Grenze beim Start.'}
        </span>
      )}
      {tooBig && (
        <span className="agent-card-muted is-warning">
          {en
            ? `Together ~${sum.toLocaleString('en-US')} tokens of tool descriptions — more than ${MCP_MAX_TOOL_TOKENS_PER_RUN.toLocaleString('en-US')}. Choose fewer services or approve fewer tools.`
            : `Zusammen ~${sum.toLocaleString('de-DE')} Token Werkzeugbeschreibung — mehr als ${MCP_MAX_TOOL_TOKENS_PER_RUN.toLocaleString('de-DE')}. Weniger Dienste wählen oder weniger Werkzeuge freigeben.`}
        </span>
      )}
    </>
  )
}
