import { useUIStore } from '../../stores/uiStore'
import { IconTile, TILE_GLYPH } from './SettingsUI'
import { DEFAULT_SHELL_GUARDRAILS, describeShellGuardrails, type ShellReadScope } from '../../../shared/shellGuardrails'

// Schutzgrenzen der Agent-Shell. Der Renderer wählt nur; erzwungen wird im Main über die
// Betriebssystem-Sandbox (main/noteAgent/shellSandbox.ts). Was hier NICHT einstellbar ist,
// ist Absicht: Schreiben bleibt immer auf den Arbeitsordner des Laufs beschränkt, und es gibt
// keinen ungeschützten Modus — kann der Schutz nicht aktiviert werden, startet die Shell nicht.
//
// Eigene Karte mit Akzentkante statt Fließtext zwischen zwei Diensten: die erste Fassung
// ging im KI-Tab real unter (13.09.2026), obwohl es die sicherheitsrelevanteste Einstellung ist.
export function AgentShellSection() {
  const en = useUIStore(s => s.language) === 'en'
  const agentShell = useUIStore(s => s.agentShell) ?? DEFAULT_SHELL_GUARDRAILS
  const setAgentShell = useUIStore(s => s.setAgentShell)
  const enforceable = navigator.platform.toLowerCase().includes('mac')

  return (
    <section className="settings-guard-card" aria-labelledby="agent-shell-guard-title">
      <div className="settings-guard-head">
        <IconTile bg="#5b6470">{TILE_GLYPH.terminal}</IconTile>
        <div className="settings-guard-head-body">
          <h4 id="agent-shell-guard-title" className="settings-guard-title">
            {en ? 'Agent shell: protection limits' : 'Agent-Shell: Schutzgrenzen'}
          </h4>
          <p className="settings-guard-summary">
            {en
              ? 'Enforced by the operating system for every command, interpreter and child process. A model cannot loosen them.'
              : 'Vom Betriebssystem erzwungen, für jeden Befehl, jeden Interpreter und jeden Unterprozess. Ein Modell kann sie nicht lockern.'}
          </p>
        </div>
        <span className={`settings-guard-pill ${enforceable ? 'is-on' : 'is-off'}`}>
          {enforceable ? (en ? 'Protection active' : 'Schutz aktiv') : (en ? 'Not enforceable here' : 'Hier nicht erzwingbar')}
        </span>
      </div>

      <div className="settings-guard-active">
        <span className="settings-guard-active-label">{en ? 'Active limits' : 'Aktive Grenzen'}</span>
        <span className="settings-guard-active-value">{describeShellGuardrails(agentShell, en ? 'en' : 'de')}</span>
      </div>

      <div className="settings-row">
        <div className="settings-row-info">
          <label htmlFor="agent-shell-read-scope">{en ? 'Readable by the shell' : 'Lesbar für die Shell'}</label>
          <span className="settings-hint">
            {en
              ? 'System paths for interpreters and libraries always stay readable. Your home folder, other volumes and the vault’s .mindgraph data never are — even with “whole vault”.'
              : 'Systempfade für Interpreter und Bibliotheken bleiben immer lesbar. Dein Benutzerordner, andere Laufwerke und die .mindgraph-Daten des Vaults nie — auch nicht bei „gesamter Vault“.'}
          </span>
        </div>
        <select
          id="agent-shell-read-scope"
          value={agentShell.readScope}
          onChange={e => setAgentShell({ readScope: (e.target.value === 'vault' ? 'vault' : 'attachments') as ShellReadScope })}
        >
          <option value="attachments">{en ? 'Attachments only (recommended)' : 'Nur Anhänge (empfohlen)'}</option>
          <option value="vault">{en ? 'Whole vault' : 'Gesamter Vault'}</option>
        </select>
      </div>

      <div className="settings-row">
        <div className="settings-row-info">
          <label htmlFor="agent-shell-network">{en ? 'Network for the shell' : 'Netzwerk für die Shell'}</label>
          <span className="settings-hint">
            {en
              ? 'Blocked: no downloads, no package installs, no access to local services. “Shell offline” does not make a cloud model local — command output still goes to the provider.'
              : 'Gesperrt: keine Downloads, keine Paketinstallation, kein Zugriff auf lokale Dienste. „Shell offline“ macht ein Cloud-Modell nicht lokal — Befehlsausgaben gehen weiterhin an den Anbieter.'}
          </span>
        </div>
        <input
          id="agent-shell-network"
          type="checkbox"
          checked={agentShell.network}
          onChange={e => setAgentShell({ network: e.target.checked })}
        />
      </div>

      <div className="settings-guard-fixed">
        <span className="settings-guard-fixed-title">{en ? 'Fixed, not configurable' : 'Fest, nicht einstellbar'}</span>
        <ul>
          <li>{en ? 'Writing only inside the run’s work folder. You accept results yourself, as before.' : 'Schreiben nur im Arbeitsordner des Laufs. Ergebnisse übernimmst du wie bisher selbst.'}</li>
          <li>{en ? 'Home folder, other volumes and .mindgraph (emails, contacts, sync) are never readable.' : 'Benutzerordner, andere Laufwerke und .mindgraph (E-Mails, Kontakte, Sync) sind nie lesbar.'}</li>
          <li>{en ? 'A self-test runs before every approval. If it fails, the shell does not start. There is no unprotected mode.' : 'Vor jeder Freigabe läuft ein Selbsttest. Schlägt er fehl, startet die Shell nicht. Einen ungeschützten Modus gibt es nicht.'}</li>
        </ul>
      </div>

      {!enforceable && (
        <div className="settings-guard-warning">
          {en
            ? 'On this system the limits cannot be enforced yet (macOS only for now). The shell therefore does not start here — there is no unprotected fallback.'
            : 'Auf diesem System lassen sich die Grenzen noch nicht erzwingen (derzeit nur macOS). Die Shell startet hier deshalb nicht — einen ungeschützten Ersatzweg gibt es nicht.'}
        </div>
      )}
    </section>
  )
}
