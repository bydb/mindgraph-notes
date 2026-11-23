// Feste Blöcke eines Skills (seit 23.11.2026).
//
// Manche Skills verlangen lange, unveränderliche HTML-Teile — beim Veranstaltungsjournal ein
// Stil-Block und ein Broschüren-Block, zusammen gut 8 000 Zeichen. Bisher musste das Modell
// sie wörtlich abschreiben. Ein lokales Modell brauchte dafür länger als die Zeitgrenze eines
// Aufrufs (qwen3.8:27b-mlx, 23 Token/s: Abbruch nach 10 Minuten, keine Datei), und jeder
// Abschreibfehler bricht das Layout ohne Fehlermeldung.
//
// Jetzt markiert der Skill solche Teile in der SKILL.md als benannten Block:
//
//   ```html skill-block=journal-stil
//   <style>…</style>
//   ```
//
// Das Modell schreibt an die Stelle nur [[skill-block:journal-stil]], write_html setzt den
// Wortlaut aus der SKILL.md ein. Der Block bleibt in der einen Datei — das trägt auch der
// Katalog, der keine Zusatzdateien kennt.

const BLOCK_RE = /^```[a-z]*[ \t]+skill-block=([a-z0-9][a-z0-9-]{0,59})[ \t]*\r?\n([\s\S]*?)\r?\n```[ \t]*$/gm
// Backticks um den Platzhalter mitnehmen: Die SKILL.md zeigt ihn als Code, Modelle kopieren das mit.
const TOKEN_RE = /`?\[\[\s*skill-block\s*:\s*([^\]\s]+)\s*\]\]`?/gi

/** Benannte Blöcke aus dem UNGEKÜRZTEN Anleitungstext eines Skills. */
export function parseSkillBlocks(body: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const m of body.matchAll(BLOCK_RE)) {
    if (!out.has(m[1])) out.set(m[1], m[2])
  }
  return out
}

export interface SkillBlockResult {
  html: string
  /** Eingesetzte Blöcke, je Name einmal. */
  used: string[]
  /** Platzhalter, zu denen es keinen Block gibt. */
  unknown: string[]
}

/** Ersetzt [[skill-block:name]] durch den Wortlaut des Blocks. */
export function applySkillBlocks(html: string, blocks: Map<string, string> | undefined): SkillBlockResult {
  const used = new Set<string>()
  const unknown = new Set<string>()
  const out = html.replace(TOKEN_RE, (whole, rawName: string) => {
    const name = rawName.toLowerCase()
    const block = blocks?.get(name)
    if (block === undefined) { unknown.add(rawName); return whole }
    used.add(name)
    return block
  })
  return { html: out, used: [...used], unknown: [...unknown] }
}
