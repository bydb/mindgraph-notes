import { describe, expect, it } from 'vitest'
import {
  addMemorySample, contextBytes, footprintsFromTop, gpuLimitFromLog, memoryBar, fitModelMemory, groupProcesses, kvBytesPerTokenFromShow, latestContextProjection, memoryPicture, reliefPlan, roundTokens, swapUsedBytes, usedBytesFromVmStat
} from './memoryPicture'

const GB = 1024 ** 3

const LOG = [
  'time=2026-11-25T08:53:21.441+01:00 level=INFO source=client.go:544 msg="starting mlx runner subprocess" model=qwen3.8:27b-mlx port=1',
  'time=2026-11-25T08:53:29.777+01:00 level=INFO source=parallel.go:61 msg="MLX automatic parallelism" parallel=1 context_length=262144 projected_context_length=32768 full_context_bytes=5889720320 workspace=4294967296 headroom=6025445376',
  'time=2026-11-25T14:38:41.529+01:00 level=INFO source=client.go:544 msg="starting mlx runner subprocess" model=inkling-2-mini:26b-a5b-nvfp4 port=2',
  'time=2026-11-25T14:38:49.773+01:00 level=INFO source=parallel.go:61 msg="MLX automatic parallelism" parallel=1 context_length=1048576 projected_context_length=65536 full_context_bytes=6696683008 workspace=4294967296 headroom=46830',
  'time=2026-11-25T16:13:30.196+01:00 level=INFO source=client.go:544 msg="starting mlx runner subprocess" model=qwen3.8:27b-mlx port=3',
  'time=2026-11-25T16:13:40.766+01:00 level=INFO source=parallel.go:61 msg="MLX automatic parallelism" parallel=1 context_length=262144 projected_context_length=262144 full_context_bytes=44962545664 workspace=4294967296 headroom=7208157184'
].join('\n')

describe('latestContextProjection', () => {
  it('nimmt die jüngste Zeile des Modells und das gerechnete Fenster, nicht das Modellmaximum', () => {
    expect(latestContextProjection(LOG, 'qwen3.8:27b-mlx')).toEqual({ contextLength: 262144, fullContextBytes: 44962545664, workspaceBytes: 4294967296 })
    expect(latestContextProjection(LOG, 'inkling-2-mini:26b-a5b-nvfp4')).toEqual({ contextLength: 65536, fullContextBytes: 6696683008, workspaceBytes: 4294967296 })
  })

  it('fremdes Modell, leeres Log und unbekanntes Format ergeben nichts', () => {
    expect(latestContextProjection(LOG, 'qwen3.5:4b')).toBeNull()
    expect(latestContextProjection('', 'qwen3.8:27b-mlx')).toBeNull()
    expect(latestContextProjection('msg="starting mlx runner subprocess" model=m\nmsg="MLX automatic parallelism" parallel=1', 'm')).toBeNull()
  })
})

describe('Systemangaben lesen', () => {
  const VM = [
    'Mach Virtual Memory Statistics: (page size of 16384 bytes)',
    'Pages free:                               10000.',
    'Pages purgeable:                          1000.',
    'Pages wired down:                         200000.',
    'Anonymous pages:                          1001000.',
    'Pages occupied by compressor:             100000.'
  ].join('\n')

  it('vm_stat: Programme ohne Löschbares, fest belegt und komprimiert', () => {
    expect(usedBytesFromVmStat(VM)).toBe((1000000 + 200000 + 100000) * 16384)
    expect(usedBytesFromVmStat('irgendwas')).toBeNull()
  })

  it('Auslagerung in M und G', () => {
    expect(swapUsedBytes('total = 5120.00M  used = 4257.62M  free = 862.38M  (encrypted)')).toBe(Math.round(4257.62 * 1024 ** 2))
    expect(swapUsedBytes('total = 12.00G  used = 1.50G  free = 10.50G')).toBe(1.5 * GB)
    expect(swapUsedBytes('')).toBeNull()
  })

  it('Prozesse je Programm, Ollama getrennt', () => {
    const ps = [
      '11 2097152 /Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '12 1048576 /Applications/Google Chrome.app/Contents/Frameworks/Google Chrome Framework.framework/Versions/1/Helpers/Google Chrome Helper (Renderer).app/Contents/MacOS/Google Chrome Helper (Renderer)',
      '13  524288 /usr/sbin/mysqld',
      '14  262144 /System/Applications/Calendar.app/Contents/MacOS/Calendar',
      '15  262144 /System/Library/CoreServices/Finder.app/Contents/MacOS/Finder',
      '16 9437184 /Applications/Ollama.app/Contents/Resources/ollama',
      '17   10240 /Applications/Ollama.app/Contents/MacOS/Ollama'
    ].join('\n')
    const { apps, ollamaBytes } = groupProcesses(ps)
    expect(apps[0]).toEqual({ name: 'Google Chrome', bytes: 3 * GB, path: '/Applications/Google Chrome.app' })
    // Systemdienste außerhalb von /Applications und /Users stehen nicht in der Liste.
    expect(apps.map(a => a.name)).toEqual(['Google Chrome', 'Calendar'])
    expect(groupProcesses(ps, '/Applications/Google Chrome.app').apps.map(a => a.name)).toEqual(['Calendar'])
    expect(ollamaBytes).toBe((9437184 + 10240) * 1024)
    // Ausgelagertes zählt mit: der Kalender liegt kaum noch im Arbeitsspeicher, gibt aber 2 GB frei.
    const top = footprintsFromTop('PID    MEM   \n14     2G+   \n11     512M  \n99  kaputt\n')
    expect(top.get(14)).toBe(2 * GB)
    const withTop = groupProcesses(ps, '', top).apps
    expect(withTop.find(a => a.name === 'Calendar')?.bytes).toBe(2 * GB)
    expect(withTop.find(a => a.name === 'Google Chrome')?.bytes).toBe(3 * GB)
  })

  it('nur Programmordner; gleiche Namen an zwei Orten bleiben zwei Einträge (agy F01/F02)', () => {
    const ps = [
      '1 1048576 /Applications/Foo.app/Contents/MacOS/Foo',
      '2 2097152 /Users/x/Applications/Foo.app/Contents/MacOS/Foo',
      '3 1048576 /Users/x/Library/Application Support/Sync/Helper.app/Contents/MacOS/Helper',
      '4 1048576 /Users/x/dev/projekt.app/server',
      '5 1048576 /Users/x/Downloads/Bar.app/Contents/MacOS/Bar',
      '6 1048576 /Users/x/.local/bin/claude'
    ].join('\n')
    expect(groupProcesses(ps).apps).toEqual([
      { name: 'Foo', bytes: 2 * GB, path: '/Users/x/Applications/Foo.app' },
      { name: 'Foo', bytes: 1 * GB, path: '/Applications/Foo.app' }
    ])
  })

  it('Grenze der Grafikeinheit: jüngste Zeile, GiB und MiB', () => {
    const log = [
      'time=1 level=INFO source=sched.go:663 msg="gpu memory" id=0 library=Metal available="20.0 GiB" free="21.0 GiB"',
      'time=2 level=INFO source=sched.go:656 msg="system memory" total="32.0 GiB" free="3.2 GiB"',
      'time=3 level=INFO source=sched.go:663 msg="gpu memory" id=0 library=Metal available="24.5 GiB" free="25.0 GiB"'
    ].join('\n')
    expect(gpuLimitFromLog(log)).toBe(24.5 * GB)
    expect(gpuLimitFromLog('msg="gpu memory" available="512 MiB"')).toBe(512 * 1024 ** 2)
    expect(gpuLimitFromLog('nichts')).toBeNull()
  })
})

describe('kvBytesPerTokenFromShow', () => {
  it('Liste je Schicht: nur Schichten mit Aufmerksamkeit zählen, Bild-Teil nicht', () => {
    const show = { model_info: {
      'general.architecture': 'qwen35',
      'qwen35.attention.head_count': 16,
      'qwen35.attention.head_count_kv': [0, 0, 0, 4, 0, 0, 0, 4],
      'qwen35.attention.key_length': 256,
      'qwen35.attention.value_length': 256,
      'qwen35.block_count': 8,
      'qwen35.embedding_length': 2560,
      'qwen35.vision.attention.head_count': 16,
      'qwen35.vision.block_count': 24
    } }
    expect(kvBytesPerTokenFromShow(show)).toBe(8 * (256 + 256) * 2)
  })

  it('ein Wert für alle Schichten, Vektorlänge aus Breite und Köpfen', () => {
    const show = { model_info: { 'llama.block_count': 32, 'llama.attention.head_count': 32, 'llama.attention.head_count_kv': 8, 'llama.embedding_length': 4096 } }
    expect(kvBytesPerTokenFromShow(show)).toBe(32 * 8 * (128 + 128) * 2)
  })

  it('MLX-Modell ohne Kopf-Angaben und kaputte Antworten ergeben nichts', () => {
    expect(kvBytesPerTokenFromShow({ model_info: { 'qwen3_5.block_count': 64, 'qwen3_5.embedding_length': 5120 } })).toBeNull()
    expect(kvBytesPerTokenFromShow({ model_info: { 'x.attention.head_count_kv': [0, 0], 'x.attention.key_length': 64, 'x.attention.value_length': 64 } })).toBeNull()
    expect(kvBytesPerTokenFromShow(null)).toBeNull()
    expect(kvBytesPerTokenFromShow({})).toBeNull()
  })
})

describe('memoryPicture', () => {
  const projection = { contextLength: 32768, fullContextBytes: 5889720320, workspaceBytes: 4 * GB }

  it('nicht geladen: Gewichte plus Rechenpuffer, Rest in Token', () => {
    const p = memoryPicture({ totalBytes: 32 * GB, usedBytes: 7 * GB, modelBytes: 17 * GB, loadedBytes: null, projection })
    expect(p.loaded).toBe(false)
    expect(p.modelBytes).toBe(17 * GB)
    expect(p.bufferBytes).toBe(4 * GB)
    expect(p.freeBytes).toBe(4 * GB)
    expect(p.tokensFit).toBe(Math.floor((4 * GB) / (5889720320 / 32768)))
    expect(roundTokens(p.tokensFit as number)).toBe(23000)
    expect(contextBytes(p, 32768)).toBe(5889720320)
  })

  it('Alltag: schon das Modell passt nicht — frei negativ, null Token', () => {
    const p = memoryPicture({ totalBytes: 32 * GB, usedBytes: 20 * GB, modelBytes: 17 * GB, loadedBytes: null, projection })
    expect(p.freeBytes).toBe(-9 * GB)
    expect(p.tokensFit).toBe(0)
  })

  it('geladen: der Modellanteil wird aus der Messung herausgerechnet, kein doppelter Abzug', () => {
    const p = memoryPicture({ totalBytes: 32 * GB, usedBytes: 26 * GB, modelBytes: 17 * GB, loadedBytes: 18 * GB, projection })
    expect(p.loaded).toBe(true)
    expect(p.otherBytes).toBe(8 * GB)
    expect(p.modelBytes).toBe(18 * GB)
    expect(p.bufferBytes).toBe(0)
    expect(p.freeBytes).toBe(6 * GB)
  })

  it('geladen ohne eigene Messung: der Rechenpuffer zählt nicht mehr mit (agy F03)', () => {
    const p = memoryPicture({ totalBytes: 32 * GB, usedBytes: 26 * GB, modelBytes: 17 * GB, loadedBytes: 17.2 * GB, projection })
    expect(p.bufferBytes).toBe(0)
    expect(p.baseModelBytes).toBe(17 * GB)
    // Vorher: 21 + 5,5 − 17,2 = 9,3 GB „Kontext“ — der Puffer steckte im Kontext-Abschnitt.
    expect(memoryBar(p, 32768).contextBytes).toBeCloseTo(17 * GB + 5889720320 - 17.2 * GB, -3)
    const idle = memoryPicture({ totalBytes: 32 * GB, usedBytes: 9 * GB, modelBytes: 17 * GB, loadedBytes: null, projection })
    expect(idle.baseModelBytes).toBe(21 * GB)
  })

  it('geladen mit unplausiblem Anteil: System fällt nie unter den Mindestwert', () => {
    const p = memoryPicture({ totalBytes: 32 * GB, usedBytes: 18 * GB, modelBytes: 17 * GB, loadedBytes: 22 * GB, projection })
    expect(p.otherBytes).toBe(2 * GB)
    expect(p.modelBytes).toBe(16 * GB)
  })

  it('Modellaufbau als Rückfall: kein Rechenpuffer, Quelle benannt; die Vorausrechnung gewinnt', () => {
    const a = memoryPicture({ totalBytes: 32 * GB, usedBytes: 20 * GB, modelBytes: 3 * GB, loadedBytes: null, projection: null, architectureBytesPerToken: 32768 })
    expect(a.modelBytes).toBe(3 * GB)
    expect(a.tokenSource).toBe('architecture')
    expect(a.tokensFit).toBe((9 * GB) / 32768)
    const b = memoryPicture({ totalBytes: 32 * GB, usedBytes: 7 * GB, modelBytes: 17 * GB, loadedBytes: null, projection, architectureBytesPerToken: 32768 })
    expect(b.tokenSource).toBe('projection')
    expect(b.bytesPerToken).toBe(5889720320 / 32768)
  })

  it('ohne Vorausrechnung keine Token-Zahl, ohne Modellgröße kein freier Rest', () => {
    const a = memoryPicture({ totalBytes: 32 * GB, usedBytes: 7 * GB, modelBytes: 17 * GB, loadedBytes: null, projection: null })
    expect(a.freeBytes).toBe(8 * GB)
    expect(a.tokensFit).toBeNull()
    expect(a.tokenSource).toBeNull()
    expect(contextBytes(a, 32768)).toBeNull()
    const b = memoryPicture({ totalBytes: 32 * GB, usedBytes: 7 * GB, modelBytes: null, loadedBytes: null, projection })
    expect(b.freeBytes).toBeNull()
    expect(b.tokensFit).toBeNull()
  })
})

describe('eigene Messung', () => {
  // Werte vom 25.11.2026, qwen3.8:27b-mlx, Größe laut /api/ps.
  const real = [
    { tokens: 22, bytes: 17.22 * GB },
    { tokens: 7022, bytes: 17.71 * GB },
    { tokens: 16725, bytes: 18.41 * GB },
    { tokens: 28056, bytes: 19.14 * GB }
  ]

  it('Gerade durch die Wertepaare: rund 73 KB je Token, 17,2 GB leer', () => {
    const m = fitModelMemory(real)
    expect(m).not.toBeNull()
    expect((m as { bytesPerToken: number }).bytesPerToken / 1024).toBeGreaterThan(68)
    expect((m as { bytesPerToken: number }).bytesPerToken / 1024).toBeLessThan(76)
    expect((m as { baseBytes: number }).baseBytes / GB).toBeCloseTo(17.2, 1)
  })

  it('zu wenig Paare, zu kleine Spanne und gleichbleibende Größe (GGUF) ergeben nichts', () => {
    expect(fitModelMemory(real.slice(0, 2))).toBeNull()
    expect(fitModelMemory([{ tokens: 100, bytes: 17 * GB }, { tokens: 900, bytes: 17.1 * GB }, { tokens: 2000, bytes: 17.2 * GB }])).toBeNull()
    expect(fitModelMemory([{ tokens: 100, bytes: 4 * GB }, { tokens: 9000, bytes: 4 * GB }, { tokens: 20000, bytes: 4 * GB }])).toBeNull()
  })

  it('ein Ausreißer kippt die Gerade nicht; streuende Paare ergeben nichts (agy F04)', () => {
    // Kurzer Aufruf, gepaart mit der Größe eines langen Laufs davor.
    const withOutlier = fitModelMemory([...real, { tokens: 3000, bytes: 19.1 * GB }])
    expect(withOutlier).not.toBeNull()
    expect((withOutlier as { bytesPerToken: number }).bytesPerToken / 1024).toBeGreaterThan(60)
    expect((withOutlier as { bytesPerToken: number }).bytesPerToken / 1024).toBeLessThan(85)
    expect((withOutlier as { maxTokens: number }).maxTokens).toBe(28056)
    expect(fitModelMemory([{ tokens: 100, bytes: 20 * GB }, { tokens: 3000, bytes: 17 * GB }, { tokens: 5000, bytes: 21 * GB }])).toBeNull()
    expect(fitModelMemory([{ tokens: Number.NaN, bytes: 1 }, { tokens: 1, bytes: Number.NaN }, { tokens: 5, bytes: 5 }])).toBeNull()
  })

  it('je 1 000-Token-Stufe bleibt das jüngste Paar; Unsinn wird nicht aufgenommen', () => {
    const a = addMemorySample([{ tokens: 7022, bytes: 1 }], { tokens: 7900, bytes: 2 })
    expect(a).toEqual([{ tokens: 7900, bytes: 2 }])
    expect(addMemorySample(a, { tokens: 0, bytes: 5 })).toBe(a)
    let many: Array<{ tokens: number; bytes: number }> = []
    for (let i = 1; i <= 60; i++) many = addMemorySample(many, { tokens: i * 1000, bytes: i })
    expect(many).toHaveLength(40)
    expect(many[0].tokens).toBe(21000)
  })

  it('die Messung gewinnt: kein Rechenpuffer, Modell mit leerem Kontext als Größe', () => {
    const measured = fitModelMemory(real)
    const p = memoryPicture({ totalBytes: 32 * GB, usedBytes: 12 * GB, modelBytes: 16.9 * GB, loadedBytes: null,
      projection: { contextLength: 32768, fullContextBytes: 5889720320, workspaceBytes: 4 * GB }, measured })
    expect(p.tokenSource).toBe('measured')
    expect(p.bufferBytes).toBe(0)
    expect((p.modelBytes as number) / GB).toBeCloseTo(17.2, 1)
    expect(p.tokensFit as number).toBeGreaterThan(32768)
  })
})

describe('reliefPlan', () => {
  const base = { totalBytes: 32 * GB, bufferBytes: 0, loaded: false, tokenSource: 'measured' as const, tokensFit: 0, gpuLimitBytes: null, measured: null }
  const apps = [
    { name: 'Browser', bytes: 3 * GB, path: '/Applications/Browser.app' },
    { name: 'claude', bytes: 2 * GB },
    { name: 'Kalender', bytes: 1 * GB, path: '/Applications/Kalender.app' },
    { name: 'Notizen', bytes: 0.5 * GB, path: '/Applications/Notizen.app' }
  ]

  it('nimmt die größten beendbaren Programme, bis die Lücke gedeckt ist', () => {
    const picture = { ...base, otherBytes: 15 * GB, modelBytes: 17 * GB, baseModelBytes: 17 * GB, freeBytes: 0, bytesPerToken: GB / 16384 }
    const plan = reliefPlan(picture, apps, 32768)
    expect(plan).toMatchObject({ needBytes: 19 * GB, allowedOtherBytes: 13 * GB, deficitBytes: 2 * GB, impossible: null, tight: false })
    expect((plan as { picks: Array<{ name: string }> }).picks.map(p => p.name)).toEqual(['Browser'])
  })

  it('überspringt Programme ohne Bündel und sagt, wenn es nicht reicht', () => {
    const picture = { ...base, otherBytes: 18 * GB, modelBytes: 17 * GB, baseModelBytes: 17 * GB, freeBytes: -3 * GB, bytesPerToken: GB / 16384 }
    const plan = reliefPlan(picture, apps, 32768)
    expect((plan as { picks: Array<{ name: string }> }).picks.map(p => p.name)).toEqual(['Browser', 'Kalender', 'Notizen'])
    expect(plan).toMatchObject({ deficitBytes: 5 * GB, pickedBytes: 4.5 * GB })
  })

  it('passt schon: nichts vorzuschlagen; ohne Zahlen kein Plan', () => {
    const fits = { ...base, otherBytes: 10 * GB, modelBytes: 17 * GB, baseModelBytes: 17 * GB, freeBytes: 5 * GB, bytesPerToken: GB / 16384 }
    expect(reliefPlan(fits, apps, 32768)).toMatchObject({ deficitBytes: 0, picks: [], tight: false, freeBytes: 3 * GB })
    expect(reliefPlan({ ...fits, bytesPerToken: null }, apps, 32768)).toBeNull()
    expect(reliefPlan({ ...fits, modelBytes: null }, apps, 32768)).toBeNull()
  })

  it('zu groß für den Rechner oder die Grafikeinheit: kein Schließvorschlag (agy F06/F08)', () => {
    const picture = { ...base, otherBytes: 9 * GB, modelBytes: 17 * GB, baseModelBytes: 17 * GB, freeBytes: 6 * GB, bytesPerToken: GB / 16384 }
    // 262 144 Token = 16 GB Kontext → 33 GB Bedarf auf 32 GB.
    expect(reliefPlan(picture, apps, 262144)).toMatchObject({ impossible: 'memory', picks: [], pickedBytes: 0, allowedOtherBytes: -1 * GB })
    // 131 072 Token = 8 GB → 25 GB: in den Arbeitsspeicher ginge es, auf die Grafikeinheit (24,5 GB) nicht.
    expect(reliefPlan({ ...picture, gpuLimitBytes: 24.5 * GB }, apps, 131072)).toMatchObject({ impossible: 'gpu', picks: [] })
    expect(reliefPlan(picture, apps, 131072)).toMatchObject({ impossible: null, deficitBytes: 2 * GB })
  })

  it('passt, aber knapp', () => {
    const picture = { ...base, otherBytes: 12.5 * GB, modelBytes: 17 * GB, baseModelBytes: 17 * GB, freeBytes: 2.5 * GB, bytesPerToken: GB / 16384 }
    expect(reliefPlan(picture, apps, 32768)).toMatchObject({ deficitBytes: 0, tight: true, freeBytes: 0.5 * GB })
  })

  it('geladen: Plan und Balken nennen dieselbe Lücke (agy F03)', () => {
    // Modell hält schon mehr als Grundbedarf plus volles Fenster.
    const big = { ...base, loaded: true, otherBytes: 12.5 * GB, modelBytes: 20 * GB, baseModelBytes: 17 * GB, freeBytes: -0.5 * GB, bytesPerToken: GB / 16384 }
    const plan = reliefPlan(big, apps, 32768)
    expect(plan).toMatchObject({ needBytes: 20 * GB, deficitBytes: 0.5 * GB })
    expect(memoryBar(big, 32768).overBytes).toBe((plan as { deficitBytes: number }).deficitBytes)
  })
})

describe('memoryBar', () => {
  const picture = { totalBytes: 32 * GB, otherBytes: 9 * GB, modelBytes: 17 * GB, bufferBytes: 0, loaded: false, baseModelBytes: 17 * GB,
    freeBytes: 6 * GB, bytesPerToken: GB / 16384, tokenSource: 'measured' as const, tokensFit: 98304, gpuLimitBytes: null, measured: null }

  it('der Kontext-Abschnitt wächst mit dem Fenster; was nicht passt, ragt hinaus', () => {
    expect(memoryBar(picture, 32768)).toMatchObject({ contextBytes: 2 * GB, freeBytes: 4 * GB, overBytes: 0, scaleBytes: 32 * GB })
    expect(memoryBar(picture, 131072)).toMatchObject({ contextBytes: 8 * GB, freeBytes: 0, overBytes: 2 * GB, scaleBytes: 34 * GB })
  })

  it('geladen: nur was bis zum vollen Fenster dazukommt', () => {
    const loaded = { ...picture, loaded: true, modelBytes: 18 * GB }
    expect(memoryBar(loaded, 32768).contextBytes).toBe(1 * GB)
    expect(memoryBar({ ...loaded, modelBytes: 20 * GB }, 32768).contextBytes).toBe(0)
  })

  it('ohne Kosten je Token oder Modellgröße kein Kontext-Abschnitt', () => {
    expect(memoryBar({ ...picture, bytesPerToken: null }, 32768).contextBytes).toBe(0)
    expect(memoryBar({ ...picture, modelBytes: null }, 32768)).toMatchObject({ contextBytes: 0, modelBytes: 0 })
  })
})
