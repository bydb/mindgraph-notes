import hljs from 'highlight.js/lib/core'
import javascript from 'highlight.js/lib/languages/javascript'
import typescript from 'highlight.js/lib/languages/typescript'
import python from 'highlight.js/lib/languages/python'
import css from 'highlight.js/lib/languages/css'
import xml from 'highlight.js/lib/languages/xml'
import json from 'highlight.js/lib/languages/json'
import bash from 'highlight.js/lib/languages/bash'
import markdown from 'highlight.js/lib/languages/markdown'
import yaml from 'highlight.js/lib/languages/yaml'
import sql from 'highlight.js/lib/languages/sql'
import java from 'highlight.js/lib/languages/java'
import csharp from 'highlight.js/lib/languages/csharp'
import cpp from 'highlight.js/lib/languages/cpp'
import go from 'highlight.js/lib/languages/go'
import rust from 'highlight.js/lib/languages/rust'
import php from 'highlight.js/lib/languages/php'
import ruby from 'highlight.js/lib/languages/ruby'
import swift from 'highlight.js/lib/languages/swift'
import kotlin from 'highlight.js/lib/languages/kotlin'
import diff from 'highlight.js/lib/languages/diff'

hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('js', javascript)
hljs.registerLanguage('jsx', javascript)
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('ts', typescript)
hljs.registerLanguage('tsx', typescript)
hljs.registerLanguage('python', python)
hljs.registerLanguage('py', python)
hljs.registerLanguage('css', css)
hljs.registerLanguage('xml', xml)
hljs.registerLanguage('html', xml)
hljs.registerLanguage('json', json)
hljs.registerLanguage('bash', bash)
hljs.registerLanguage('sh', bash)
hljs.registerLanguage('shell', bash)
hljs.registerLanguage('zsh', bash)
hljs.registerLanguage('markdown', markdown)
hljs.registerLanguage('md', markdown)
hljs.registerLanguage('yaml', yaml)
hljs.registerLanguage('yml', yaml)
hljs.registerLanguage('sql', sql)
hljs.registerLanguage('java', java)
hljs.registerLanguage('csharp', csharp)
hljs.registerLanguage('cs', csharp)
hljs.registerLanguage('cpp', cpp)
hljs.registerLanguage('c', cpp)
hljs.registerLanguage('go', go)
hljs.registerLanguage('rust', rust)
hljs.registerLanguage('rs', rust)
hljs.registerLanguage('php', php)
hljs.registerLanguage('ruby', ruby)
hljs.registerLanguage('rb', ruby)
hljs.registerLanguage('swift', swift)
hljs.registerLanguage('kotlin', kotlin)
hljs.registerLanguage('kt', kotlin)
hljs.registerLanguage('diff', diff)

const LANGUAGE_ALIASES: Record<string, string> = {
  'node': 'javascript',
  'nodejs': 'javascript',
  'mjs': 'javascript',
  'cjs': 'javascript',
  'cts': 'typescript',
  'mts': 'typescript',
  'shellscript': 'bash',
  'console': 'bash',
  'c++': 'cpp',
  'cxx': 'cpp',
  'cc': 'cpp',
  'hpp': 'cpp',
  'h++': 'cpp',
  'c#': 'csharp',
  'csx': 'csharp',
  'plain': 'plaintext',
  'text': 'plaintext',
  'txt': 'plaintext',
}

function resolveLanguage(lang: string): string | null {
  if (!lang) return null

  // markdown-it kann zusätzliche Metadaten hinter der Sprache liefern,
  // z. B. "ts title=demo.ts" oder "python {1,3}".
  const normalized = lang.trim().toLowerCase()
  const firstToken = normalized.split(/\s+/)[0]
  const cleanedToken = firstToken.replace(/[{},;]+$/g, '')
  const resolved = LANGUAGE_ALIASES[cleanedToken] ?? cleanedToken

  return hljs.getLanguage(resolved) ? resolved : null
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Wrap highlighted HTML into per-line spans so CSS counters can render
 * line numbers.  Handles hljs spans that cross line boundaries by
 * closing them at the end of each line and reopening on the next.
 */
function wrapLines(html: string): string {
  const lines = html.split('\n')
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()

  const openTags: string[] = []

  return lines.map(line => {
    const prefix = openTags.join('')

    // Track span open/close within this line
    const tagRe = /<(\/?)span([^>]*)>/g
    let m
    while ((m = tagRe.exec(line)) !== null) {
      if (m[1] === '/') {
        openTags.pop()
      } else {
        openTags.push(`<span${m[2]}>`)
      }
    }

    const suffix = '</span>'.repeat(openTags.length)
    return `<span class="code-line">${prefix}${line}${suffix}</span>`
  }).join('')
}

export function highlightCode(str: string, lang: string): string {
  const language = resolveLanguage(lang)
  let highlighted: string

  if (language) {
    try {
      highlighted = hljs.highlight(str, { language }).value
    } catch {
      highlighted = escapeHtml(str)
    }
  } else {
    highlighted = escapeHtml(str)
  }

  return wrapLines(highlighted)
}
