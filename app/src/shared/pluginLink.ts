// Einordnung von Links, die ein Renderer-Plugin öffnen möchte (z. B. ein Link an einem Excalidraw-Element).
//
// Anlass (Codex F07, docs/codex-collab/excalidraw-vollumfang.md): Excalidraw öffnete Element-Links selbst —
// externe per `window.open` (vom Host verweigert → toter Klick), „lokale“ (`/…`) per `window.open(…, '_self')`,
// was das GANZE App-Fenster wegnavigierte. Das Plugin bricht das jetzt ab und reicht den Link an den Host;
// hier wird entschieden, was daraus wird. Pur, damit die Regeln getestet sind.
//
// Regeln:
//  - `[[Ziel]]`, `[[Ziel|Alias]]`, `[[Ziel#Abschnitt]]` → Notiz/Datei im Vault
//  - `http(s)://…`, `mailto:` → nach außen (System-Browser / Mailprogramm)
//  - `www.…` ohne Schema → wie `https://www.…`
//  - jedes andere Schema (`file:`, `javascript:`, `about:` …) → abgelehnt
//  - sonst: Vault-Pfad oder Notizname (führende `/` werden ignoriert, `..` wird abgelehnt)

export type PluginLinkTarget =
  | { kind: 'note'; target: string; fragment: string }
  | { kind: 'external'; url: string }
  | { kind: 'refused'; reason: string }

const SCHEME = /^([a-z][a-z0-9+.-]*):/i

function splitFragment(s: string): { target: string; fragment: string } {
  const i = s.indexOf('#')
  return i < 0 ? { target: s.trim(), fragment: '' } : { target: s.slice(0, i).trim(), fragment: s.slice(i + 1).trim() }
}

function noteTarget(raw: string): PluginLinkTarget {
  const { target, fragment } = splitFragment(raw)
  const cleaned = target.replace(/^[/\\]+/, '').trim()
  if (!cleaned) return { kind: 'refused', reason: 'leeres Ziel' }
  if (cleaned.split(/[/\\]/).some((seg) => seg === '..')) return { kind: 'refused', reason: 'Pfad verlässt den Vault' }
  return { kind: 'note', target: cleaned, fragment }
}

export function classifyPluginLink(raw: unknown): PluginLinkTarget {
  if (typeof raw !== 'string') return { kind: 'refused', reason: 'kein Text' }
  const link = raw.trim()
  if (!link) return { kind: 'refused', reason: 'leer' }

  const wiki = /^\[\[([^\]]+)\]\]$/.exec(link)
  if (wiki) {
    const inner = wiki[1].split('|')[0]
    return noteTarget(inner)
  }

  const scheme = SCHEME.exec(link)?.[1]?.toLowerCase()
  if (scheme) {
    if (scheme === 'http' || scheme === 'https' || scheme === 'mailto') return { kind: 'external', url: link }
    // Windows-Laufwerk („C:\…“) ist kein Schema, aber auch kein Vault-Pfad.
    return { kind: 'refused', reason: `Schema „${scheme}:“ wird nicht geöffnet` }
  }

  if (/^www\.[^\s/]+\.[^\s/]+/i.test(link)) return { kind: 'external', url: `https://${link}` }

  return noteTarget(link)
}
