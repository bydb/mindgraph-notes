// Misst die Zeichenbreiten der im Excalidraw-Plugin eingebetteten Schriften (Nunito, Excalifont)
// und schreibt `src/shared/excalidrawFontMetrics.generated.ts`.
//
// Warum ein Electron-Lauf: Excalidraw misst Text mit Canvas `measureText` im Renderer. Der Main
// (wo write_excalidraw die Szene baut) kann das nicht. Die erzeugte Datei trägt deshalb
//   1. eine Breitentabelle je Schrift (Einheiten pro 1000 px, gemessen bei 1000 px), und
//   2. Referenzmessungen GANZER Zeilen in den echten Schriftgrößen — gegen die prüft der Test,
//      dass die Schätzung nie zu schmal und höchstens 8 % zu breit ist (Codex F06).
//
// Geladen werden genau die woff2-Teilsätze, die das Plugin einbettet (Dateinamen und
// unicode-range wie in mindgraph-excalidraw-plugin/build.mjs, EMBEDDED_FONTS), und mit demselben
// Font-String wie Excalidraw (`getFontString`: "<px>px <Familie>, Segoe UI Emoji").
//
// Aufruf (aus app/):
//   npx electron scripts/excalidraw-font-metrics.cjs [<Pfad zum Plugin-Repo>]
// Standard-Pfad: ~/dev/mindgraph-excalidraw-plugin

const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const crypto = require('node:crypto')

const pluginRoot = process.argv.find((a, i) => i >= 2 && !a.startsWith('-') && !a.endsWith('.cjs'))
  || path.join(os.homedir(), 'dev', 'mindgraph-excalidraw-plugin')
const fontsDir = path.join(pluginRoot, 'node_modules/@excalidraw/excalidraw/dist/prod/fonts')
const outFile = path.join(__dirname, '..', 'src/shared/excalidrawFontMetrics.generated.ts')

// Aus build.mjs (EMBEDDED_FONTS) übernommen — nur die Teilsätze, die Zeichen des erlaubten
// Vorrats tragen. Ändert das Plugin seine Einbettung, muss diese Liste mitgezogen werden.
const FACES = {
  Nunito: {
    id: 6,
    weight: '500',
    faces: [
      { file: 'Nunito/Nunito-Regular-XRXI3I6Li01BKofiOc5wtlZ2di8HDIkhdTo3j6zbXWjgevT5.woff2',
        range: 'U+0100-02AF, U+0304, U+0308, U+0329, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF' },
      { file: 'Nunito/Nunito-Regular-XRXI3I6Li01BKofiOc5wtlZ2di8HDIkhdTQ3j6zbXWjgeg.woff2',
        range: 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD' },
    ],
  },
  Excalifont: {
    id: 5,
    weight: 'normal',
    faces: [
      { file: 'Excalifont/Excalifont-Regular-a88b72a24fb54c9f94e3b5fdaa7481c9.woff2',
        range: 'U+20-7e,U+a0-a3,U+a5-a6,U+a8-ab,U+ad-b1,U+b4,U+b6-b8,U+ba-ff,U+131,U+152-153,U+2bc,U+2c6,U+2da,U+2dc,U+304,U+308,U+2013-2014,U+2018-201a,U+201c-201e,U+2020,U+2022,U+2024-2026,U+2030,U+2039-203a,U+20ac,U+2122,U+2212' },
      { file: 'Excalifont/Excalifont-Regular-be310b9bcd4f1a43f571c46df7809174.woff2',
        range: 'U+100-130,U+132-137,U+139-149,U+14c-151,U+154-17e,U+192,U+1fc-1ff,U+218-21b,U+237,U+1e80-1e85,U+1ef2-1ef3,U+2113' },
    ],
  },
}

// Erlaubter Kandidaten-Vorrat (Plan, Abschnitt „Zeichenvorrat"): sichtbare lateinische Zeichen,
// Latin Extended-A, typografische Zeichen und das Euro-Zeichen. Bewusst OHNE Steuer-/Format-
// zeichen (weiches Trennzeichen, Null-Breite-Zeichen, Richtungsmarken). Je Schrift bleibt davon,
// was ihr eingebetteter unicode-range abdeckt.
function candidates() {
  const cps = []
  for (let c = 0x20; c <= 0x7e; c++) cps.push(c)
  for (let c = 0xa0; c <= 0xff; c++) if (c !== 0xad) cps.push(c)
  for (let c = 0x100; c <= 0x17f; c++) cps.push(c)
  for (let c = 0x2010; c <= 0x2027; c++) cps.push(c)
  cps.push(0x2030, 0x2032, 0x2033, 0x2039, 0x203a, 0x20ac)
  return cps
}

function parseRanges(range) {
  return range.split(',').map((p) => p.trim().replace(/^u\+/i, '')).filter(Boolean).map((p) => {
    const [a, b] = p.split('-')
    return [parseInt(a, 16), parseInt(b ?? a, 16)]
  })
}

function covered(cp, faces) {
  return faces.some((f) => parseRanges(f.range).some(([lo, hi]) => cp >= lo && cp <= hi))
}

// Referenzzeilen: kurz, lang, Umlaute, ß, Ziffern, Striche, Großbuchstabenfolgen, Komposita,
// Kerning-anfällige Paare (AV, To, Wa, „Ty“), typografische Anführungszeichen.
const SAMPLE_LINES = [
  'Mindmap',
  'Projektplanung',
  'Ziele und Messgrößen',
  'Lizenzverlängerungsverfahren',
  'Größe, Maß und Fußnoten',
  'ÄÖÜ äöü ß – Übersicht',
  'AVAWAY To Wa Ty Yo „Tür“',
  'WWW MMM QQQ www mmm',
  'iiii llll 1111 ....',
  '2026-10-12: 3 Termine, 45 €',
  'Rückmeldung der Schülerinnen',
  'Fortbildung „Digitale Werkzeuge“',
  'Datenschutz & Urheberrecht (DSGVO)',
  'Kostenvoranschlag ≈ Angebot',
  'Lernende sammeln Ideen …',
  'Œuvre, Ł, ą, č, ğ, ő, ű',
  'Kernaussage: Weniger ist mehr!',
  'Teilnehmende 15/20 (75 %)',
]

const FONT_SIZES = [16, 20, 24]

// Kopplung an den Plugin-Build (Codex F17): jede hier gemessene Datei samt unicode-range muss
// wörtlich in build.mjs (EMBEDDED_FONTS) stehen — sonst misst das Skript andere Schriften, als
// das Plugin ausliefert, und die Tabelle wäre still falsch.
function assertMatchesPluginBuild() {
  const buildSrc = fs.readFileSync(path.join(pluginRoot, 'build.mjs'), 'utf8')
  const missing = []
  for (const [family, def] of Object.entries(FACES)) {
    for (const f of def.faces) {
      const file = f.file.split('/').pop()
      if (!buildSrc.includes(file)) missing.push(`${family}: Datei ${file}`)
      if (!buildSrc.includes(f.range)) missing.push(`${family}: unicode-range ${f.range.slice(0, 40)}…`)
    }
    if (def.weight !== 'normal' && !buildSrc.includes(`weight: '${def.weight}'`)) missing.push(`${family}: Gewicht ${def.weight}`)
  }
  if (missing.length) throw new Error(`build.mjs des Plugins bettet anders ein als dieses Skript misst:\n  ${missing.join('\n  ')}`)
}

function sha12(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0, 12)
}

app.whenReady().then(async () => {
  assertMatchesPluginBuild()
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } })
  await win.loadURL('data:text/html;charset=utf-8,<!doctype html><html><body></body></html>')

  const result = { fonts: {}, samples: [] }
  for (const [family, def] of Object.entries(FACES)) {
    const faces = def.faces.map((f) => ({
      b64: fs.readFileSync(path.join(fontsDir, f.file)).toString('base64'),
      range: f.range,
    }))
    const cps = candidates().filter((cp) => covered(cp, def.faces))
    // Ohne „≈“ (nicht im Vorrat) — die Referenzzeile darf nur erlaubte Zeichen tragen.
    // Referenzzeilen nur aus Zeichen mit Glyph (wird nach der Messung erneut gefiltert).
    const lines = SAMPLE_LINES.filter((l) => [...l].every((ch) => cps.includes(ch.codePointAt(0))))
    const measured = await win.webContents.executeJavaScript(`(async () => {
      const faces = ${JSON.stringify(faces)};
      for (const f of faces) {
        const bytes = Uint8Array.from(atob(f.b64), (c) => c.charCodeAt(0));
        const ff = new FontFace(${JSON.stringify(family)}, bytes.buffer, { unicodeRange: f.range, weight: ${JSON.stringify(def.weight)} });
        await ff.load();
        document.fonts.add(ff);
      }
      const ctx = document.createElement('canvas').getContext('2d');
      const fontString = (px) => px + 'px ${family}, Segoe UI Emoji';
      // Glyph-Prüfung (Codex F17): unicode-range sagt nur, welche Datei für ein Zeichen geladen
      // wird, nicht, dass sie einen Glyph dafür hat. Fehlt er, zeichnet Chromium aus der
      // Ersatzschrift — dann unterscheiden sich die Breiten mit zwei verschiedenen Ersatzschriften.
      const width = (font, ch) => { ctx.font = font; return ctx.measureText(ch).width; };
      const widths = {};
      const noGlyph = [];
      for (const cp of ${JSON.stringify(cps)}) {
        const ch = String.fromCodePoint(cp);
        const a = width('1000px ${family}, monospace', ch);
        const b = width('1000px ${family}, serif', ch);
        if (Math.abs(a - b) > 0.01) { noGlyph.push(cp); continue; }
        widths[cp] = width(fontString(1000), ch);
      }
      const samples = [];
      for (const px of ${JSON.stringify(FONT_SIZES)}) {
        ctx.font = fontString(px);
        for (const line of ${JSON.stringify(lines)}) samples.push({ px, line, width: ctx.measureText(line).width });
      }
      return { widths, samples, noGlyph, loaded: [...document.fonts].filter((f) => f.family === ${JSON.stringify(family)}).map((f) => f.status) };
    })()`)
    if (measured.loaded.some((s) => s !== 'loaded')) throw new Error(`${family}: Schrift nicht geladen (${measured.loaded.join(',')})`)
    if (measured.noGlyph.length) console.log(`  ${family}: ohne Glyph ausgeschlossen: ${measured.noGlyph.map((c) => 'U+' + c.toString(16).toUpperCase()).join(' ')}`)
    result.fonts[family] = {
      id: def.id,
      widths: measured.widths,
      files: def.faces.map((f) => `${f.file.split('/').pop().slice(0, 40)}… sha256:${sha12(path.join(fontsDir, f.file))}`)
    }
    for (const s of measured.samples) {
      if ([...s.line].every((ch) => measured.widths[ch.codePointAt(0)] !== undefined)) result.samples.push({ family, ...s })
    }
  }

  const round = (n) => Math.round(n * 1000) / 1000
  const lines = []
  lines.push('// ERZEUGT von app/scripts/excalidraw-font-metrics.cjs — nicht von Hand ändern.')
  lines.push('// Zeichenbreiten der im Excalidraw-Plugin eingebetteten Schriften, gemessen mit Canvas')
  lines.push('// `measureText` bei 1000 px (Einheiten = px pro 1000 px Schriftgröße), plus Referenzmessungen')
  lines.push('// ganzer Zeilen für den Test in excalidrawMindmap.test.ts.')
  const exVersion = JSON.parse(fs.readFileSync(path.join(pluginRoot, 'node_modules/@excalidraw/excalidraw/package.json'), 'utf8')).version
  const pluginVersion = JSON.parse(fs.readFileSync(path.join(pluginRoot, 'manifest.json'), 'utf8')).version
  lines.push(`// Quelle: Plugin ${pluginVersion} (@excalidraw/excalidraw ${exVersion}), Electron ${process.versions.electron}.`)
  for (const [family, f] of Object.entries(result.fonts)) for (const file of f.files) lines.push(`//   ${family}: ${file}`)
  lines.push('')
  lines.push(`export const EXCALIDRAW_FONT_SOURCE = { plugin: '${pluginVersion}', excalidraw: '${exVersion}' } as const`)
  lines.push('')
  lines.push('export const EXCALIDRAW_CHAR_WIDTHS: Record<\'Nunito\' | \'Excalifont\', Record<number, number>> = {')
  for (const [family, f] of Object.entries(result.fonts)) {
    const entries = Object.entries(f.widths).map(([cp, w]) => `${cp}:${round(w)}`)
    lines.push(`  ${family}: {`)
    for (let i = 0; i < entries.length; i += 12) lines.push(`    ${entries.slice(i, i + 12).join(', ')},`)
    lines.push('  },')
  }
  lines.push('}')
  lines.push('')
  lines.push('export const EXCALIDRAW_LINE_SAMPLES: ReadonlyArray<{ family: \'Nunito\' | \'Excalifont\'; px: number; line: string; width: number }> = [')
  for (const s of result.samples) lines.push(`  { family: '${s.family}', px: ${s.px}, line: ${JSON.stringify(s.line)}, width: ${round(s.width)} },`)
  lines.push(']')
  lines.push('')
  fs.writeFileSync(outFile, lines.join('\n'))
  console.log(`Geschrieben: ${outFile}`)
  for (const [family, f] of Object.entries(result.fonts)) console.log(`  ${family}: ${Object.keys(f.widths).length} Zeichen`)
  console.log(`  Referenzzeilen: ${result.samples.length}`)
  app.quit()
}).catch((e) => {
  console.error(e)
  app.exit(1)
})
