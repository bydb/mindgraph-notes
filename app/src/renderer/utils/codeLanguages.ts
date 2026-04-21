// Mapping von Datei-Extension auf highlight.js Sprachnamen.
// Nur Sprachen aufnehmen, die in highlightSetup.ts registriert sind.

const EXTENSION_MAP: Record<string, string> = {
  // JavaScript / TypeScript Familie
  js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript',
  ts: 'typescript', tsx: 'typescript',

  // Python
  py: 'python', pyw: 'python',

  // Web
  html: 'xml', htm: 'xml', xml: 'xml', svg: 'xml',
  css: 'css', scss: 'css', sass: 'css', less: 'css',

  // Daten
  json: 'json', jsonc: 'json',
  yaml: 'yaml', yml: 'yaml',

  // Shell
  sh: 'bash', bash: 'bash', zsh: 'bash', fish: 'bash',

  // Markdown
  md: 'markdown', markdown: 'markdown', mdx: 'markdown',

  // SQL
  sql: 'sql',

  // JVM
  java: 'java', kt: 'kotlin', kts: 'kotlin',

  // C / C++ / C#
  c: 'cpp', h: 'cpp', cpp: 'cpp', cxx: 'cpp', cc: 'cpp', hpp: 'cpp', hxx: 'cpp',
  cs: 'csharp',

  // System / Modern
  go: 'go', rs: 'rust', php: 'php', rb: 'ruby', swift: 'swift',

  // Diffs / Patches
  diff: 'diff', patch: 'diff'
}

// Dateien ohne sinnvolle Extension (z. B. Dockerfile) an hljs-Sprache mappen.
const FILENAME_MAP: Record<string, string> = {
  'dockerfile': 'bash',
  'makefile': 'bash',
  '.bashrc': 'bash',
  '.zshrc': 'bash',
  '.gitignore': 'plaintext',
  '.env': 'bash'
}

export function detectLanguage(relativePath: string): string | null {
  const base = relativePath.split(/[/\\]/).pop() || relativePath
  const lower = base.toLowerCase()

  // Exakte Filenames prüfen (Dockerfile, Makefile)
  if (FILENAME_MAP[lower]) return FILENAME_MAP[lower]

  const dotIdx = base.lastIndexOf('.')
  if (dotIdx <= 0) return null

  const ext = base.slice(dotIdx + 1).toLowerCase()
  return EXTENSION_MAP[ext] || null
}

// Liste aller Extensions, die als Code-Files im FileTree auftauchen sollen.
export const CODE_FILE_EXTENSIONS: string[] = Array.from(new Set([
  ...Object.keys(EXTENSION_MAP),
  'txt', 'log', 'conf', 'ini', 'toml', 'env'
])).sort()

// Ordner die beim Vault-Laden komplett übersprungen werden (Code-Viewer).
export const IGNORED_DIRECTORIES = new Set([
  'node_modules',
  '.git',
  '.svn',
  '.hg',
  'dist',
  'build',
  'out',
  'target',
  '.next',
  '.nuxt',
  '.turbo',
  '.cache',
  '__pycache__',
  '.pytest_cache',
  '.venv',
  'venv',
  'env',
  '.idea',
  '.vscode',
  '.DS_Store'
])

export function isIgnoredDirectory(name: string): boolean {
  return IGNORED_DIRECTORIES.has(name)
}

export function isCodeFile(relativePath: string): boolean {
  const base = relativePath.split(/[/\\]/).pop() || relativePath
  const lower = base.toLowerCase()
  if (FILENAME_MAP[lower]) return true
  const dotIdx = base.lastIndexOf('.')
  if (dotIdx <= 0) return false
  const ext = base.slice(dotIdx + 1).toLowerCase()
  return ext in EXTENSION_MAP || CODE_FILE_EXTENSIONS.includes(ext)
}
