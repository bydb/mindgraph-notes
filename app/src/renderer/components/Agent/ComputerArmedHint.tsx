import { useUIStore } from '../../stores/uiStore'
import { DEFAULT_COMPUTER_CONTROL, activeComputerVerbs, computerVerbLabel } from '../../../shared/computerControl'

/**
 * Was in DIESEM Lauf möglich ist — an der Stelle, an der der Nutzer entscheidet.
 *
 * Vorher stand hier ein allgemeiner Satz, und die tatsächlich freigegebenen Vorgänge
 * erfuhr man erst im Systemdialog nach dem Absenden (Codex F01/F02). Der Nutzer konnte
 * vor dem Lauf nicht sagen, was passieren kann — genau das war seine Kritik.
 *
 * Ebenso wichtig ist der zweite Satz: Die Freigabe ist eine Möglichkeit, kein Ablaufplan.
 * Ob ein Vorgang stattfindet, entscheidet das Modell aus dem Auftrag. Ohne diesen Hinweis
 * sieht ein überlesener Nebensatz wie ein Fehler der App aus.
 */
export function ComputerArmedHint() {
  const en = useUIStore(s => s.language) === 'en'
  const settings = useUIStore(s => s.agentComputer) ?? DEFAULT_COMPUTER_CONTROL
  const verbs = activeComputerVerbs(settings)

  if (verbs.length === 0) {
    return (
      <div className="ai-bar-cloud-hint">
        {en
          ? 'No operation is enabled yet — Settings → AI → Computer control. Without one, the run starts without computer access.'
          : 'Noch ist kein Vorgang freigegeben — Einstellungen → KI → Rechner-Steuerung. Ohne einen startet der Lauf ohne Rechner-Zugriff.'}
      </div>
    )
  }

  const list = verbs.map(v => computerVerbLabel(v, en ? 'en' : 'de')).join(', ')
  // „Freigegeben", nicht „in diesem Lauf möglich" (Codex Runde 2, F11): Hier stehen die
  // Einstellungen. Ob dieser Rechner den Vorgang wirklich kann (Drucker eingerichtet),
  // prüft erst der Main, und der Dialog beim Start sagt es dann.
  return (
    <div className="ai-bar-cloud-hint">
      {en
        ? `Enabled: ${list}. Whether any of it happens is decided by the model from your instruction — say what you want done. The dialog at the start lists what this computer can actually do; email only ever becomes a visible draft.`
        : `Freigegeben: ${list}. Ob davon etwas geschieht, entscheidet das Modell aus deinem Auftrag — schreib also hinein, was passieren soll. Was dieser Rechner davon wirklich kann, steht im Dialog beim Start; eine Mail entsteht immer nur als sichtbarer Entwurf.`}
    </div>
  )
}
