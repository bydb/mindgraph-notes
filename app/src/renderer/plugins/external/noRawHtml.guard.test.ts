import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// Guard (ADR §4 I-D1): der externe-Widget-Renderpfad darf NIEMALS rohes Plugin-HTML in den
// Host-DOM schreiben. Kein `dangerouslySetInnerHTML`, kein Vault-/Email-Sanitizer (sanitizeHtml/
// sanitizeEmailHtml). Plugin-Strings sind ausschließlich React-Text-Nodes. Scannt den ganzen
// external/-Ordner, damit auch ein künftiges Widget die Invariante nicht versehentlich bricht.
describe('externe Widgets — kein roher HTML-Pfad', () => {
  it('kein dangerouslySetInnerHTML / sanitizeHtml / sanitizeEmailHtml in renderer/plugins/external', () => {
    const dir = 'src/renderer/plugins/external'
    const files = readdirSync(dir).filter((f) => (f.endsWith('.ts') || f.endsWith('.tsx')) && !f.endsWith('.test.ts'))
    expect(files.length).toBeGreaterThan(0)
    for (const f of files) {
      const src = readFileSync(join(dir, f), 'utf8')
      // Echte VERWENDUNG verbieten (nicht bloße Erwähnung im Doc-Kommentar):
      expect(src, `${f}: dangerouslySetInnerHTML verboten`).not.toMatch(/dangerouslySetInnerHTML\s*[=:]/)
      expect(src, `${f}: sanitizeHtml(...) verboten`).not.toMatch(/\bsanitize(Html|EmailHtml)\s*\(/)
      expect(src, `${f}: Import aus utils/sanitize verboten`).not.toMatch(/from\s+['"][^'"]*utils\/sanitize['"]/)
    }
  })
})
