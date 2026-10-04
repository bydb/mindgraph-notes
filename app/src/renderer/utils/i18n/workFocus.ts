// Übersetzungen zum Schwerpunkt beim Einrichten (docs/codex-collab/schwerpunkt-beim-einrichten.md).
// Wird in utils/translations.ts eingestreut. `en` muss vollständig sein (Typ erzwingt es).
//
// Wortlaut-Regeln aus der Codex-Prüfung: keine erfundenen Minutenzahlen („mehrere Minuten“),
// „Standardmodell“ statt einer Aussage über die Auswahl im Agent-Tab, kein „lokal“ als Garantie.
export const de = {
  'onboarding.focus.title': 'Womit möchtest du hauptsächlich arbeiten?',
  'onboarding.focus.subtitle': 'Bestimmt, womit die App startet. Es wird nichts ausgeschaltet — du kannst das jederzeit unter Einstellungen → Allgemein ändern.',
  'onboarding.focus.notes.title': 'Notizen und Wissen',
  'onboarding.focus.notes.desc': 'Schreiben, verknüpfen, im Graph sehen. Die App startet mit deinen Notizen.',
  'onboarding.focus.agent.title': 'Aufträge an den Agenten',
  'onboarding.focus.agent.desc': 'Der Agent liest deine Unterlagen und legt Ergebnisse zur Prüfung vor. Die App startet im Agent-Tab.',
  'onboarding.focus.finish': 'Fertig',
  'onboarding.focus.saveVaultFailed': 'Der Vault ließ sich nicht als Start-Vault speichern. Bitte noch einmal versuchen oder einen anderen Ordner wählen.',
  'onboarding.missions.agent.title': 'Ersten Auftrag an den Agenten geben',
  'onboarding.missions.agent.desc': 'Öffne den Agent-Tab über den Knopf „Agent“ in der Titelleiste. Beispiele dort zeigen, wie ein guter Auftrag aussieht.',
  'onboarding.focus.hint.title': 'Agent auf diesem Rechner',
  'onboarding.focus.hint.lowRam': 'Mit einem lokalen Modell dauern Aufträge auf diesem Rechner mehrere Minuten. In den Einstellungen unter KI lässt sich auch ein Cloud-Modell einrichten.',
  'onboarding.focus.hint.cloud': 'Das Standardmodell des Agenten rechnet bei {provider}. Auftrag und alles, was der Agent liest, gehen dorthin. Cloud-Läufe mit Vault-Zugriff brauchen deine ausdrückliche Zustimmung.',
  'onboarding.focus.hint.noModel': 'Noch kein Modell gewählt. Ohne Modell kann der Agent nicht starten.',
  'agentCard.modelMissing': 'Kein Modell gewählt',
  'agentCard.setupAi': 'KI einrichten',
} as const

export const en: Record<keyof typeof de, string> = {
  'onboarding.focus.title': 'What will you mainly work on?',
  'onboarding.focus.subtitle': 'Decides what the app starts with. Nothing is turned off — you can change this anytime under Settings → General.',
  'onboarding.focus.notes.title': 'Notes and knowledge',
  'onboarding.focus.notes.desc': 'Write, link, see it in the graph. The app starts with your notes.',
  'onboarding.focus.agent.title': 'Tasks for the agent',
  'onboarding.focus.agent.desc': 'The agent reads your documents and presents results for review. The app starts in the Agent tab.',
  'onboarding.focus.finish': 'Done',
  'onboarding.focus.saveVaultFailed': 'The vault could not be saved as start vault. Please try again or choose another folder.',
  'onboarding.missions.agent.title': 'Give the agent its first task',
  'onboarding.missions.agent.desc': 'Open the Agent tab with the “Agent” button in the title bar. Examples there show what a good task looks like.',
  'onboarding.focus.hint.title': 'Agent on this computer',
  'onboarding.focus.hint.lowRam': 'With a local model, tasks take several minutes on this computer. A cloud model can also be set up under Settings → AI.',
  'onboarding.focus.hint.cloud': 'The agent\'s default model runs at {provider}. The task and everything the agent reads go there. Cloud runs with vault access need your explicit consent.',
  'onboarding.focus.hint.noModel': 'No model selected yet. Without a model the agent cannot start.',
  'agentCard.modelMissing': 'No model selected',
  'agentCard.setupAi': 'Set up AI',
}
