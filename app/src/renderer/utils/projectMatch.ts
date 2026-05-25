// Verschoben nach app/src/shared/projectMatch.ts (Decision #7), damit der
// Main-Workflow-Runner dieselbe deterministische Match-Logik nutzen kann.
// Re-Export hält bestehende Renderer-Importe (InboxPanel) lauffähig.
export { matchEmailToProjects } from '../../shared/projectMatch'
export type { ProjectMatch } from '../../shared/projectMatch'
