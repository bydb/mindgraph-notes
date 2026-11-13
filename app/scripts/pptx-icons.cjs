/* Erzeugt app/src/shared/pptxIcons.generated.ts — die Symbole für write_pptx.
 *
 * Aufruf:  node app/scripts/pptx-icons.cjs <Pfad zu lucide-static/icon-nodes.json>
 *   Quelle holen (ohne Abhängigkeit im Projekt):
 *     cd /tmp/x && npm pack lucide-static@0.469.0 && tar xzf lucide-static-*.tgz
 *     node app/scripts/pptx-icons.cjs /tmp/x/package/icon-nodes.json
 *
 * Lucide (ISC-Lizenz) zeichnet Linien-Symbole auf 24 × 24. PowerPoint kennt keine
 * SVG-Pfade, aber Freihandformen (custGeom) mit moveTo/lnTo/cubicBezTo. Dieses Skript
 * rechnet jede Form (path, circle, rect, line, polyline, polygon, ellipse) in absolute
 * M/L/C/Z-Befehle um; Bögen werden zu Bézierkurven. Koordinaten × 100 als Ganzzahlen.
 * Die App liest nur die erzeugte Tabelle — Lucide ist keine Laufzeit-Abhängigkeit.
 */
const fs = require('fs')
const path = require('path')

// Deutscher Name (so nennt ihn der Skill) → Lucide-Name.
const ICONS = {
  sprechblase: 'message-circle', gespraech: 'messages-square', lupe: 'search', laptop: 'laptop', monitor: 'monitor',
  teilen: 'share-2', roboter: 'bot', dokument: 'file-text', ordner: 'folder-open', werkzeug: 'wrench', koffer: 'briefcase',
  schild: 'shield', 'schild-haken': 'shield-check', zahnrad: 'settings', person: 'user', gruppe: 'users', haken: 'check',
  kreuz: 'x', warnung: 'triangle-alert', ausrufezeichen: 'circle-alert', frage: 'circle-help', schloss: 'lock',
  schluessel: 'key-round', wolke: 'cloud', globus: 'globe', buch: 'book-open', uhr: 'clock', sanduhr: 'hourglass',
  ziel: 'target', stift: 'pencil', auge: 'eye', liste: 'list-checks', tabelle: 'table', diagramm: 'chart-column',
  trend: 'trending-up', blitz: 'zap', hand: 'hand', kaffee: 'coffee', kalender: 'calendar', mail: 'mail',
  gluehbirne: 'lightbulb', kreislauf: 'refresh-cw', zitat: 'quote', stecker: 'plug', flagge: 'flag', stern: 'star',
  herz: 'heart', bausteine: 'blocks', puzzle: 'puzzle', gehirn: 'brain', datenbank: 'database', chip: 'cpu', bild: 'image',
  schule: 'graduation-cap', haus: 'house', rakete: 'rocket', waage: 'scale', kompass: 'compass', download: 'download',
  link: 'link', filter: 'filter', verbot: 'ban', daumen: 'thumbs-up', euro: 'euro', karte: 'map', schere: 'scissors',
  pfeil: 'arrow-right', ebenen: 'layers', code: 'code', klemmbrett: 'clipboard-check', fernglas: 'binoculars',
  ablauf: 'workflow', abspielen: 'play'
}

// ── SVG-Pfad → absolute M/L/C/Z ─────────────────────────────────────────────
function arcToCubics(x1, y1, rx, ry, phiDeg, fa, fs_, x2, y2) {
  // Umrechnung nach SVG-Spezifikation (Anhang F.6): Endpunkt- → Mittelpunktform.
  if (rx === 0 || ry === 0) return [['L', x2, y2]]
  const phi = (phiDeg * Math.PI) / 180
  const cosP = Math.cos(phi), sinP = Math.sin(phi)
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2
  const x1p = cosP * dx + sinP * dy, y1p = -sinP * dx + cosP * dy
  rx = Math.abs(rx); ry = Math.abs(ry)
  const lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry)
  if (lam > 1) { const s = Math.sqrt(lam); rx *= s; ry *= s }
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p
  let co = Math.sqrt(Math.max(0, num / den))
  if (fa === fs_) co = -co
  const cxp = (co * rx * y1p) / ry, cyp = (-co * ry * x1p) / rx
  const cx = cosP * cxp - sinP * cyp + (x1 + x2) / 2, cy = sinP * cxp + cosP * cyp + (y1 + y2) / 2
  const ang = (ux, uy, vx, vy) => {
    const d = Math.hypot(ux, uy) * Math.hypot(vx, vy)
    let a = Math.acos(Math.max(-1, Math.min(1, (ux * vx + uy * vy) / d)))
    if (ux * vy - uy * vx < 0) a = -a
    return a
  }
  const t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry)
  let dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry)
  if (!fs_ && dt > 0) dt -= 2 * Math.PI
  if (fs_ && dt < 0) dt += 2 * Math.PI
  const n = Math.max(1, Math.ceil(Math.abs(dt) / (Math.PI / 2) - 1e-9))
  const step = dt / n
  const k = (4 / 3) * Math.tan(step / 4)
  const out = []
  const pt = (t) => {
    const c = Math.cos(t), s = Math.sin(t)
    return {
      x: cx + rx * c * cosP - ry * s * sinP, y: cy + rx * c * sinP + ry * s * cosP,
      dx: -rx * s * cosP - ry * c * sinP, dy: -rx * s * sinP + ry * c * cosP
    }
  }
  for (let i = 0; i < n; i++) {
    const a = pt(t1 + i * step), b = pt(t1 + (i + 1) * step)
    out.push(['C', a.x + k * a.dx, a.y + k * a.dy, b.x - k * b.dx, b.y - k * b.dy, b.x, b.y])
  }
  return out
}

function parsePath(d) {
  const tokens = d.match(/[a-zA-Z]|-?(?:\d*\.\d+|\d+\.?)(?:e[-+]?\d+)?/g) || []
  const out = []
  let i = 0, cmd = '', x = 0, y = 0, sx = 0, sy = 0, px = null, py = null, prev = ''
  const num = () => Number(tokens[i++])
  // Bogen-Flags stehen oft ohne Trennzeichen ("a2 2 0 012 2"): einzeln lesen.
  const flag = () => {
    const t = tokens[i]
    if (t.length > 1 && /^[01]/.test(t)) { tokens[i] = t.slice(1); return Number(t[0]) }
    i++
    return Number(t)
  }
  while (i < tokens.length) {
    if (/^[a-zA-Z]$/.test(tokens[i])) cmd = tokens[i++]
    const rel = cmd === cmd.toLowerCase()
    const C = cmd.toUpperCase()
    const ox = rel ? x : 0, oy = rel ? y : 0
    if (C === 'M') { x = ox + num(); y = oy + num(); sx = x; sy = y; out.push(['M', x, y]); cmd = rel ? 'l' : 'L' }
    else if (C === 'L') { x = ox + num(); y = oy + num(); out.push(['L', x, y]) }
    else if (C === 'H') { x = ox + num(); out.push(['L', x, y]) }
    else if (C === 'V') { y = oy + num(); out.push(['L', x, y]) }
    else if (C === 'C') { const a = [num(), num(), num(), num(), num(), num()]; out.push(['C', ox + a[0], oy + a[1], ox + a[2], oy + a[3], ox + a[4], oy + a[5]]); px = ox + a[2]; py = oy + a[3]; x = ox + a[4]; y = oy + a[5] }
    else if (C === 'S') {
      const a = [num(), num(), num(), num()]
      const c1x = prev === 'C' ? 2 * x - px : x, c1y = prev === 'C' ? 2 * y - py : y
      out.push(['C', c1x, c1y, ox + a[0], oy + a[1], ox + a[2], oy + a[3]]); px = ox + a[0]; py = oy + a[1]; x = ox + a[2]; y = oy + a[3]
    }
    else if (C === 'Q' || C === 'T') {
      let qx, qy
      if (C === 'Q') { qx = ox + num(); qy = oy + num() } else { qx = prev === 'Q' ? 2 * x - px : x; qy = prev === 'Q' ? 2 * y - py : y }
      const ex = ox + num(), ey = oy + num()
      out.push(['C', x + (2 / 3) * (qx - x), y + (2 / 3) * (qy - y), ex + (2 / 3) * (qx - ex), ey + (2 / 3) * (qy - ey), ex, ey])
      px = qx; py = qy; x = ex; y = ey
    }
    else if (C === 'A') {
      const rx = num(), ry = num(), rot = num(), fa = flag(), fsw = flag(), ex = ox + num(), ey = oy + num()
      for (const seg of arcToCubics(x, y, rx, ry, rot, fa, fsw, ex, ey)) out.push(seg)
      x = ex; y = ey
    }
    else if (C === 'Z') { out.push(['Z']); x = sx; y = sy }
    else throw new Error('unbekannter Pfadbefehl ' + cmd)
    prev = C === 'S' ? 'C' : C === 'T' ? 'Q' : C
  }
  return out
}

function ellipsePath(cx, cy, rx, ry) {
  return parsePath(`M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0z`)
}

function nodeToCmds([tag, a]) {
  const n = (v) => Number(v ?? 0)
  if (tag === 'path') return parsePath(a.d)
  if (tag === 'circle') return ellipsePath(n(a.cx), n(a.cy), n(a.r), n(a.r))
  if (tag === 'ellipse') return ellipsePath(n(a.cx), n(a.cy), n(a.rx), n(a.ry))
  if (tag === 'line') return [['M', n(a.x1), n(a.y1)], ['L', n(a.x2), n(a.y2)]]
  if (tag === 'polyline' || tag === 'polygon') {
    const p = a.points.trim().split(/[\s,]+/).map(Number)
    const out = []
    for (let k = 0; k < p.length; k += 2) out.push([k === 0 ? 'M' : 'L', p[k], p[k + 1]])
    if (tag === 'polygon') out.push(['Z'])
    return out
  }
  if (tag === 'rect') {
    const x = n(a.x), y = n(a.y), w = n(a.width), h = n(a.height)
    const rx = Math.min(n(a.rx ?? a.ry), w / 2), ry = Math.min(n(a.ry ?? a.rx), h / 2)
    if (!rx || !ry) return parsePath(`M${x} ${y}h${w}v${h}h${-w}z`)
    return parsePath(`M${x + rx} ${y}h${w - 2 * rx}a${rx} ${ry} 0 0 1 ${rx} ${ry}v${h - 2 * ry}a${rx} ${ry} 0 0 1 ${-rx} ${ry}h${-(w - 2 * rx)}a${rx} ${ry} 0 0 1 ${-rx} ${-ry}v${-(h - 2 * ry)}a${rx} ${ry} 0 0 1 ${rx} ${-ry}z`)
  }
  throw new Error('unbekanntes Element ' + tag)
}

function main() {
  const src = process.argv[2]
  if (!src) { console.error('Aufruf: node app/scripts/pptx-icons.cjs <icon-nodes.json>'); process.exit(1) }
  const nodes = JSON.parse(fs.readFileSync(src, 'utf8'))
  let version = 'unbekannt'
  try { version = JSON.parse(fs.readFileSync(path.join(path.dirname(src), 'package.json'), 'utf8')).version } catch { /* ohne Versionsangabe */ }
  const r = (v) => Math.round(v * 100)
  const lines = []
  for (const [name, lucide] of Object.entries(ICONS)) {
    const icon = nodes[lucide]
    if (!icon) throw new Error(`Lucide kennt "${lucide}" nicht (für ${name})`)
    const cmds = icon.flatMap(nodeToCmds)
    for (const c of cmds) for (const v of c.slice(1)) if (!Number.isFinite(v) || v < -1 || v > 25) throw new Error(`${name}: Koordinate außerhalb 0–24 (${v})`)
    const s = cmds.map(c => (c[0] === 'Z' ? 'Z' : c[0] + c.slice(1).map(r).join(','))).join(' ')
    lines.push(`  ${JSON.stringify(name)}: ${JSON.stringify(s)}`)
  }
  const out =
    `// ERZEUGT von app/scripts/pptx-icons.cjs — nicht von Hand ändern.\n` +
    `// Quelle: Lucide ${version} (ISC-Lizenz, https://lucide.dev). Linien-Symbole auf 24 × 24,\n` +
    `// Koordinaten × 100. Befehle: M x,y · L x,y · C x1,y1,x2,y2,x,y · Z.\n\n` +
    `export const PPTX_ICON_GRID = 2400\n\n` +
    `export const PPTX_ICON_LUCIDE: Record<string, string> = ${JSON.stringify(ICONS, null, 2).replace(/"/g, "'")}\n\n` +
    `export const PPTX_ICON_PATHS: Record<string, string> = {\n${lines.join(',\n')}\n}\n`
  const target = path.join(__dirname, '..', 'src', 'shared', 'pptxIcons.generated.ts')
  fs.writeFileSync(target, out)
  console.log('geschrieben:', target, Object.keys(ICONS).length, 'Symbole,', out.length, 'Zeichen')
}

main()
