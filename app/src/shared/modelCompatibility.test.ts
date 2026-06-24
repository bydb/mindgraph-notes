// Regressionstests für die Modell-Kompatibilitäts-Logik. Pur, kein I/O.
// Schwerpunkt sind die zwei Sicherheitsgrenzen:
//   - isHardLocked: sperrt ein Modul NUR bei damageRelevant + red. Ein neu
//     gepulltes (untested) Modell darf NIE still gesperrt werden.
//   - isCloudModel: Privacy-Hard-Lock im Workflow-Runner (keine personenbez.
//     Daten in die Cloud) — hängt am Tag-Suffix, nicht am Endpunkt.
// getModelVendor ist bereits in modelVendor.test.ts abgedeckt → hier ausgespart.
import { describe, it, expect } from 'vitest'
import {
  getModelVerdict,
  greenModelsForModule,
  isHardLocked,
  isCloudModel,
  isMlxModel,
  getModelRamGb,
  checkModelRamFit,
  MODULES,
  MODEL_COMPATIBILITY
} from './modelCompatibility'

describe('getModelVerdict', () => {
  it('liefert den exakten Matrix-Eintrag', () => {
    expect(getModelVerdict('llama3.1:8b', 'dashboard-snapshot').verdict).toBe('red')
    expect(getModelVerdict('ministral-3:8b', 'brain').verdict).toBe('green')
  })

  it('unbekanntes Modell → untested (nicht null/Fehler)', () => {
    const v = getModelVerdict('irgendwas-neu:1b', 'brain')
    expect(v.verdict).toBe('untested')
    expect(v.reasons).toEqual([])
  })

  it('Modul ohne Einträge (smart-connections) → jedes Modell untested', () => {
    expect(getModelVerdict('ministral-3:8b', 'smart-connections').verdict).toBe('untested')
  })
})

describe('isHardLocked — Sicherheitsgrenze', () => {
  it('sperrt llama3.1:8b im damageRelevant-Dashboard (red)', () => {
    // Dokumentierte Sicherheitseigenschaft: llama3.1 fällt auf Prompt-Injection
    // rein, Notiz-Inhalt ist UNTRUSTED → Hard-Lock.
    expect(isHardLocked('llama3.1:8b', 'dashboard-snapshot')).toBe(true)
  })

  it('sperrt NICHT bei red in einem nicht-damageRelevant-Modul (brain)', () => {
    // llama3.1:8b ist in brain ebenfalls red — aber brain ist nicht
    // schadensrelevant, also kein Code-Lock.
    expect(getModelVerdict('llama3.1:8b', 'brain').verdict).toBe('red')
    expect(isHardLocked('llama3.1:8b', 'brain')).toBe(false)
  })

  it('sperrt NICHT bei yellow in einem damageRelevant-Modul', () => {
    // llama3.1:8b ist in task-extraction (damageRelevant) nur yellow → kein Lock.
    expect(getModelVerdict('llama3.1:8b', 'task-extraction').verdict).toBe('yellow')
    expect(isHardLocked('llama3.1:8b', 'task-extraction')).toBe(false)
  })

  it('sperrt NIE ein untested (neu gepulltes) Modell — auch in damageRelevant-Modulen', () => {
    // Kritisch: ein unbekanntes Modell darf nicht still blockiert werden.
    expect(isHardLocked('brandneu:7b', 'dashboard-snapshot')).toBe(false)
    expect(isHardLocked('brandneu:7b', 'task-extraction')).toBe(false)
  })

  it('sperrt NIE ein green Modell', () => {
    expect(isHardLocked('ministral-3:8b', 'dashboard-snapshot')).toBe(false)
  })

  it('Invariante: ein Lock setzt zwingend damageRelevant + red voraus', () => {
    // Prüft alle Matrix-Einträge gegen die Definition — fängt versehentliche
    // Locks (oder ausgefallene Locks) bei künftigen Matrix-Edits ab.
    for (const { id, damageRelevant } of MODULES) {
      const moduleMap = MODEL_COMPATIBILITY.modules[id]
      for (const [model, v] of Object.entries(moduleMap)) {
        const expected = damageRelevant && v.verdict === 'red'
        expect(isHardLocked(model, id)).toBe(expected)
      }
    }
  })
})

describe('greenModelsForModule', () => {
  it('liefert nur tatsächlich grüne Modelle (Selbst-Konsistenz)', () => {
    for (const model of greenModelsForModule('dashboard-snapshot')) {
      expect(getModelVerdict(model, 'dashboard-snapshot').verdict).toBe('green')
    }
  })

  it('schließt red/yellow aus (llama3.1 red, qwen3.5:cloud yellow im Dashboard)', () => {
    const green = greenModelsForModule('dashboard-snapshot')
    expect(green).not.toContain('llama3.1:8b')
    expect(green).not.toContain('qwen3.5:cloud')
    expect(green).toContain('ministral-3:8b')
  })

  it('Modul ohne Einträge → leeres Array', () => {
    expect(greenModelsForModule('smart-connections')).toEqual([])
  })
})

describe('isCloudModel — Privacy-Grenze', () => {
  it('erkennt :cloud und -cloud am Tag-Ende', () => {
    expect(isCloudModel('qwen3.5:cloud')).toBe(true)
    expect(isCloudModel('gpt-oss:120b-cloud')).toBe(true)
  })

  it('lokale Modelle sind kein Cloud-Modell (Suffix nur am Ende zählt)', () => {
    expect(isCloudModel('qwen3.5:4b')).toBe(false)
    expect(isCloudModel('ministral-3:8b')).toBe(false)
    // "cloud" mitten im Namen oder am Anfang zählt nicht — es geht um den Tag-Suffix.
    expect(isCloudModel('cloudburst:7b')).toBe(false)
    expect(isCloudModel('')).toBe(false)
  })
})

describe('isMlxModel', () => {
  it('erkennt -mlx-Suffix in allen Varianten', () => {
    expect(isMlxModel('qwen3.6:27b-mlx')).toBe(true)
    expect(isMlxModel('qwen3.5:9b-mlx-bf16')).toBe(true)
    expect(isMlxModel('gemma4:12b-mlx')).toBe(true)
  })

  it('Nicht-MLX-Modelle → false', () => {
    expect(isMlxModel('qwen3.6:latest')).toBe(false)
    expect(isMlxModel('ministral-3:8b')).toBe(false)
    expect(isMlxModel('')).toBe(false)
  })
})

describe('getModelRamGb', () => {
  it('bevorzugt den gemessenen Matrix-Wert', () => {
    expect(getModelRamGb('ministral-3:8b')).toBe(6)
    expect(getModelRamGb('qwen3.5:4b')).toBe(4)
    expect(getModelRamGb('qwen3.6:27b-mlx')).toBe(22)
  })

  it('fällt für unbekannte Modelle auf die Namens-Heuristik zurück', () => {
    // ~Q4-Default: params * 0.7 + 1 GB Overhead
    expect(getModelRamGb('testmodell:7b')).toBe(5.9)
    // bf16/fp16 → 2.0 Bytes/Param
    expect(getModelRamGb('testmodell:7b-bf16')).toBe(15)
    // q8 → 1.1
    expect(getModelRamGb('testmodell:10b-q8')).toBe(12)
  })

  it('null wenn weder Matrix noch Parameterzahl im Namen', () => {
    expect(getModelRamGb('namenlos')).toBeNull()
    expect(getModelRamGb('')).toBeNull()
  })
})

describe('checkModelRamFit — Weak-HW-Warnung', () => {
  it('Cloud-Modell passt immer (kein lokaler RAM)', () => {
    expect(checkModelRamFit('qwen3.5:cloud', 8).fits).toBe(true)
  })

  it('unbekannter Gesamt-RAM → keine Warnung', () => {
    expect(checkModelRamFit('qwen3.6:27b-mlx', null).fits).toBe(true)
    expect(checkModelRamFit('qwen3.6:27b-mlx', 0).fits).toBe(true)
  })

  it('unbekannter Modell-RAM → keine Warnung', () => {
    expect(checkModelRamFit('namenlos', 8).fits).toBe(true)
  })

  it('8-GB-Empfehlung qwen3.5:4b (~4 GB) passt auf 8 GB (2 GB Reserve)', () => {
    expect(checkModelRamFit('qwen3.5:4b', 8).fits).toBe(true)
  })

  it('große Modelle passen NICHT auf 8 GB → Warnung', () => {
    expect(checkModelRamFit('gemma4:latest', 8).fits).toBe(false)     // 10 GB
    expect(checkModelRamFit('qwen3.6:27b-mlx', 8).fits).toBe(false)   // 22 GB
  })

  it('Schwelle ist STRIKT ram < total - 2: ministral 6 GB auf 8 GB warnt (randvoller RAM → Swap)', () => {
    // Grenzfall, der den freeze auslöst: das Modell füllt den RAM exakt bis auf die
    // 2-GB-Reserve. 6 < 8-2 ist false → Warnung (bewusst kein <=).
    const fit = checkModelRamFit('ministral-3:8b', 8)
    expect(fit.fits).toBe(false)
    expect(fit.modelRamGb).toBe(6)
    // auf 16 GB passt es klar
    expect(checkModelRamFit('ministral-3:8b', 16).fits).toBe(true)
  })
})
