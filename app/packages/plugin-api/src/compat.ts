// Compat-Modul-IDs — die Module der Modell-Kompatibilitäts-Matrix, gegen die ein Plugin
// (über `hardLockModule` bzw. `host.llm.generate({ module })`) den isHardLocked-Check des
// Kerns adressiert. Hier liegt der kanonische Vertrag; die Verdict-MATRIX selbst bleibt
// App-intern — `app/src/shared/modelCompatibility.ts` importiert diesen Typ zurück.
export type CompatModuleId =
  | 'brain'
  | 'task-extraction'
  | 'mail-summary'
  | 'dashboard-snapshot'
  | 'smart-connections'
  | 'project-status'
  | 'note-agent'
