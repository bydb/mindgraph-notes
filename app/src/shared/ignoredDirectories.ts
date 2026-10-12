// Ordner, die der Dateibaum der App komplett ausblendet (Build-Ausgaben, Abhängigkeiten,
// Werkzeug-Ordner). Geteilt, damit alles, was „ist im Vault sichtbar?" beantwortet, dieselbe
// Grenze zieht: der Dateibaum (main/index.ts readDirectoryRecursive) und die Link-Prüfung von
// write_excalidraw (Codex F13 — ein Link in einen ausgeblendeten Ordner wäre nicht klickbar).
export const IGNORED_DIRECTORY_NAMES: ReadonlySet<string> = new Set([
  'node_modules', '.git', '.svn', '.hg', 'dist', 'build', 'out', 'target',
  '.next', '.nuxt', '.turbo', '.cache', '__pycache__', '.pytest_cache',
  '.venv', 'venv', 'env', '.idea', '.vscode'
])
