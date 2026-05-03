import * as path from 'path'
import * as fs from 'fs/promises'
import * as os from 'os'
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

// Unterstützte Whisper-CLIs (in Prüf-Reihenfolge).
// openai-whisper und whisper-ctranslate2 haben kompatible Argumente und können WebM direkt per ffmpeg lesen.
// whisper-cpp ist deutlich schneller, verlangt aber WAV 16kHz mono — für den MVP weggelassen.
const AUTO_DETECT_COMMANDS = ['whisper', 'whisper-ctranslate2'] as const

// Befehle, die der User explizit in den Settings eintragen darf (Schutz vor command injection).
const ALLOWED_COMMAND_NAMES = new Set(['whisper', 'whisper-ctranslate2', 'whisper-cpp', 'whisper-cli'])

export interface WhisperCheckResult {
  available: boolean
  command: string | null  // Resolver Pfad (z. B. /opt/homebrew/bin/whisper)
  binary: string | null   // Name, den wir aufrufen (z. B. whisper)
  error?: string
}

export interface TranscribeOptions {
  /** 'auto' = erstes verfügbares Binary; sonst Binary-Name oder absoluter Pfad */
  command: string
  /** Whisper-Modell (tiny, base, small, medium, large). */
  model: string
  /** Sprachcode (de, en, …) oder 'auto'. */
  language: string
}

function getExtendedPath(): string {
  if (process.platform === 'win32') {
    const homeDir = process.env.USERPROFILE || ''
    const additional = [
      `${homeDir}\\AppData\\Local\\Programs\\Python\\Python311`,
      `${homeDir}\\AppData\\Local\\Programs\\Python\\Python311\\Scripts`,
      `${homeDir}\\AppData\\Local\\Programs\\Python\\Python312`,
      `${homeDir}\\AppData\\Local\\Programs\\Python\\Python312\\Scripts`,
      `${homeDir}\\.cargo\\bin`,
      `${homeDir}\\AppData\\Roaming\\npm`,
      `${homeDir}\\scoop\\shims`
    ].filter(Boolean)
    return [...additional, ...(process.env.PATH || '').split(';')].join(';')
  }
  const homeDir = process.env.HOME || '/Users/' + process.env.USER
  const additional = [
    '/opt/homebrew/bin',
    '/opt/homebrew/sbin',
    '/usr/local/bin',
    '/usr/local/sbin',
    `${homeDir}/.local/bin`,
    `${homeDir}/.cargo/bin`,
    `${homeDir}/.pyenv/shims`,
    `${homeDir}/Library/Python/3.11/bin`,
    `${homeDir}/Library/Python/3.12/bin`
  ]
  return [...additional, ...(process.env.PATH || '/usr/bin:/bin').split(':')].join(':')
}

async function resolveCommand(binary: string): Promise<string | null> {
  const isWindows = process.platform === 'win32'
  const checkCmd = isWindows ? 'where' : 'which'
  try {
    const { stdout } = await execFileAsync(checkCmd, [binary], {
      env: { ...process.env, PATH: getExtendedPath() },
      timeout: 5000
    })
    return stdout.trim().split(/\r?\n/)[0] || null
  } catch {
    return null
  }
}

/**
 * Prüft, welches Whisper-Binary verfügbar ist. Bei `configured === 'auto'` werden alle AUTO_DETECT_COMMANDS probiert.
 * Bei konkretem Namen wird nur dieser geprüft. Bei absolutem Pfad wird die Datei existiert-geprüft.
 */
export async function checkWhisper(configured: string): Promise<WhisperCheckResult> {
  if (configured !== 'auto' && path.isAbsolute(configured)) {
    const binary = path.basename(configured)
    if (!ALLOWED_COMMAND_NAMES.has(binary)) {
      return { available: false, command: null, binary: null, error: `Nicht erlaubtes Whisper-Binary: ${binary}` }
    }
    // Absoluter Pfad — nur existieren + ausführbar prüfen
    try {
      await fs.access(configured, fs.constants.X_OK)
      return { available: true, command: configured, binary }
    } catch {
      return { available: false, command: null, binary: null, error: `Pfad nicht ausführbar: ${configured}` }
    }
  }

  const candidates = configured === 'auto' ? [...AUTO_DETECT_COMMANDS] : [configured]

  for (const binary of candidates) {
    if (!ALLOWED_COMMAND_NAMES.has(binary)) continue
    const resolved = await resolveCommand(binary)
    if (resolved) {
      return { available: true, command: resolved, binary }
    }
  }
  return { available: false, command: null, binary: null }
}

/**
 * Transkribiert eine Audio-Datei (WebM/WAV/MP3 etc.) und gibt den erkannten Text zurück.
 */
async function hasFfmpeg(): Promise<boolean> {
  const isWindows = process.platform === 'win32'
  try {
    await execFileAsync(isWindows ? 'where' : 'which', ['ffmpeg'], {
      env: { ...process.env, PATH: getExtendedPath() },
      timeout: 5000
    })
    return true
  } catch {
    return false
  }
}

export async function transcribeFile(audioPath: string, opts: TranscribeOptions): Promise<string> {
  const check = await checkWhisper(opts.command)
  if (!check.available || !check.binary) {
    throw new Error(check.error ?? 'Whisper ist nicht installiert')
  }

  // Whisper ruft intern ffmpeg auf, um Audio zu dekodieren. Fehlt ffmpeg, läuft
  // whisper durch, produziert aber eine leere Textdatei ohne Fehler — wir geben
  // stattdessen einen klaren Hinweis aus.
  if (!(await hasFfmpeg())) {
    throw new Error('ffmpeg ist nicht installiert. Bitte `brew install ffmpeg` ausführen.')
  }

  // Eigenes Temp-Output-Verzeichnis, damit wir hinterher sauber aufräumen können
  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mindgraph-whisper-'))
  try {
    const args = [
      audioPath,
      '--model', opts.model,
      '--output_format', 'txt',
      '--output_dir', outDir
    ]
    if (opts.language && opts.language !== 'auto') {
      args.push('--language', opts.language)
    }

    const bin = check.command ?? check.binary
    const started = Date.now()
    console.log(`[whisper] starting: ${bin} ${args.join(' ')}`)

    try {
      const { stdout, stderr } = await execFileAsync(bin, args, {
        env: { ...process.env, PATH: getExtendedPath() },
        timeout: 5 * 60 * 1000,
        maxBuffer: 50 * 1024 * 1024
      })
      const ms = Date.now() - started
      const stderrFull = (stderr ?? '').trim()
      console.log(`[whisper] finished in ${ms}ms; stdout len: ${(stdout ?? '').length}`)
      if (stderrFull) console.log(`[whisper] stderr:\n${stderrFull}`)
      if (stdout && stdout.trim().length > 0) console.log(`[whisper] stdout tail: ${stdout.trim().slice(-200)}`)
    } catch (err) {
      const e = err as { code?: number; stderr?: string; stdout?: string; message?: string }
      const stderr = (e.stderr ?? '').trim()
      const stdout = (e.stdout ?? '').trim()
      console.error(`[whisper] exec failed (code=${e.code ?? '?'}): ${e.message ?? ''}; stderr: ${stderr.slice(-500)}; stdout: ${stdout.slice(-200)}`)
      // Häufig: fehlende Sprach-Modelle werden per whisper beim ersten Lauf gezogen — dann ist stderr informativ.
      throw new Error(stderr.split('\n').filter(Boolean).pop() || e.message || 'Whisper-Aufruf fehlgeschlagen')
    }

    // Transkript-Datei finden (Basename + .txt)
    const base = path.basename(audioPath, path.extname(audioPath))
    const txtPath = path.join(outDir, `${base}.txt`)
    try {
      const transcript = await fs.readFile(txtPath, 'utf-8')
      const trimmed = transcript.trim()
      console.log(`[whisper] transcript file=${txtPath}, chars=${trimmed.length}, preview="${trimmed.slice(0, 120)}"`)
      return trimmed
    } catch (err) {
      // Output-Datei nicht gefunden — whisper ist ohne Fehler zurückgekommen, aber hat nichts geschrieben.
      const files = await fs.readdir(outDir).catch(() => [] as string[])
      console.error(`[whisper] no .txt in ${outDir}; files: ${files.join(', ')}`)
      throw new Error(err instanceof Error ? `Transkript nicht gefunden: ${err.message}` : 'Transkript-Datei fehlt')
    }
  } finally {
    try {
      await fs.rm(outDir, { recursive: true, force: true })
    } catch { /* ignore */ }
  }
}

/**
 * Transkribiert einen Audio-Buffer (WebM o.ä.) direkt.
 * Bei leerem Transkript/Fehler wird die Audio-Datei nur mit MINDGRAPH_KEEP_STT_AUDIO=1
 * für Debug-Zwecke behalten. Standardmäßig löschen wir sie aus Datenschutzgründen.
 */
export async function transcribeBuffer(audio: ArrayBuffer | Buffer, extension: string, opts: TranscribeOptions): Promise<string> {
  const safeExt = extension.replace(/[^a-z0-9]/gi, '').slice(0, 6) || 'webm'
  const tmp = path.join(os.tmpdir(), `mindgraph-stt-${Date.now()}.${safeExt}`)
  const buf = Buffer.isBuffer(audio) ? audio : Buffer.from(audio)
  await fs.writeFile(tmp, buf)
  console.log(`[whisper] saved recording to ${tmp} (${buf.byteLength} bytes)`)
  let keepFile = process.env.MINDGRAPH_KEEP_STT_AUDIO === '1'
  try {
    const result = await transcribeFile(tmp, opts)
    if (!result) {
      if (keepFile) {
        console.warn(`[whisper] empty transcript — keeping audio at ${tmp} for inspection`)
      } else {
        console.warn('[whisper] empty transcript')
      }
    }
    return result
  } catch (err) {
    if (keepFile) console.warn(`[whisper] transcription failed — keeping audio at ${tmp} for inspection`)
    throw err
  } finally {
    if (!keepFile) {
      try { await fs.unlink(tmp) } catch { /* ignore */ }
    }
  }
}
