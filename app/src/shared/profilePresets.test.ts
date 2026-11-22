import { describe, it, expect } from 'vitest'
import { buildProfilePatch, PROFILE_PRESETS, onboardingAiCapabilities, type ProfileId } from './profilePresets'

// Zustand mit ein paar Fremdwerten, die beim Verschmelzen erhalten bleiben müssen.
const state = (): Record<string, unknown> => ({
  email: { enabled: false, accounts: ['a'] },
  dashboard: { enabled: false, widgets: ['focus'] },
  languageTool: { enabled: true, mode: 'api', url: '' },
  readwise: { enabled: true, syncFolder: 'R' },
  docling: { enabled: true, url: 'x' },
  visionOcr: { enabled: false, model: 'm' },
  transport: { enabled: true, showTitlebarButton: true, shortcut: 'k' },
  telegramBot: { enabled: true, allowedChatIds: [1] },
  speech: { enabled: true, ttsEngine: 'elevenlabs', ttsVoice: 'v' },
  ollama: {
    enabled: true, selectedModel: 'qwen3', localOnly: false, defaultCloudProvider: 'llmbase',
    openrouter: { enabled: true, hasApiKey: true, model: 'x' },
    llmbase: { enabled: true, hasApiKey: true, model: 'y' },
  },
  pluginConfig: {
    antares: { enabled: true, baseUrl: 'https://a', context: 'XX/NN' },
    edoobox: { enabled: true, baseUrl: 'https://e' },
    faktura: { enabled: true },
  },
})

// Wörtliche Abschrift des alten `switch` in uiStore.applyProfileDefaults (vor 11/2026):
// die bestehenden Profile dürfen sich durch den Umbau NICHT ändern.
const legacy = (s: Record<string, any>): Record<string, Record<string, unknown>> => ({
  office: {
    flashcardsEnabled: false, pdfCompanionEnabled: false, smartConnectionsEnabled: false, notesChatEnabled: true,
    editorDefaultView: 'preview', showFormattingToolbar: true, showRawEditor: false,
    email: { ...s.email, enabled: true }, dashboard: { ...s.dashboard, enabled: true },
  },
  student: {
    flashcardsEnabled: true, pdfCompanionEnabled: true, smartConnectionsEnabled: false, notesChatEnabled: true,
    visionOcr: { ...s.visionOcr, enabled: true }, editorDefaultView: 'preview', showFormattingToolbar: true, showRawEditor: false,
  },
  researcher: {
    flashcardsEnabled: true, pdfCompanionEnabled: true, semanticScholarEnabled: true, zoteroEnabled: true,
    smartConnectionsEnabled: false, notesChatEnabled: true, visionOcr: { ...s.visionOcr, enabled: true }, editorDefaultView: 'preview',
  },
  professional: {
    flashcardsEnabled: false, pdfCompanionEnabled: false, smartConnectionsEnabled: false, notesChatEnabled: true, editorDefaultView: 'preview',
  },
  writer: {
    flashcardsEnabled: false, smartConnectionsEnabled: false, notesChatEnabled: true, showFormattingToolbar: true,
    editorShowWordCount: true, editorDefaultView: 'preview',
  },
  developer: {
    flashcardsEnabled: false, smartConnectionsEnabled: true, notesChatEnabled: true, showRawEditor: false, editorDefaultView: 'preview',
  },
  viewer: {
    smartConnectionsEnabled: false, notesChatEnabled: false, flashcardsEnabled: false, semanticScholarEnabled: false,
    zoteroEnabled: false, pdfCompanionEnabled: false,
    languageTool: { ...s.languageTool, enabled: false }, email: { ...s.email, enabled: false },
    pluginConfig: {
      ...s.pluginConfig,
      antares: { ...(s.pluginConfig.antares ?? {}), enabled: false },
      edoobox: { ...(s.pluginConfig.edoobox ?? {}), enabled: false },
      marketing: { ...(s.pluginConfig.marketing ?? {}), enabled: false },
      remarkable: { ...(s.pluginConfig.remarkable ?? {}), enabled: false },
    },
    readwise: { ...s.readwise, enabled: false }, docling: { ...s.docling, enabled: false },
    visionOcr: { ...s.visionOcr, enabled: false }, dashboard: { ...s.dashboard, enabled: false },
    transport: { ...s.transport, enabled: false, showTitlebarButton: false },
    editorDefaultView: 'preview', showFormattingToolbar: false, showRawEditor: false,
  },
})

describe('buildProfilePatch — bestehende Profile unverändert', () => {
  for (const id of ['office', 'student', 'researcher', 'professional', 'writer', 'developer', 'viewer'] as ProfileId[]) {
    it(`${id} ist wertgleich zum alten switch`, () => {
      const s = state()
      expect(buildProfilePatch(s, id)).toEqual(legacy(s)[id])
    })
  }

  it('verändert den übergebenen Zustand nicht', () => {
    const s = state()
    const before = JSON.stringify(s)
    buildProfilePatch(s, 'school-admin')
    expect(JSON.stringify(s)).toBe(before)
  })
})

describe('buildProfilePatch — Schulverwaltung', () => {
  const p = buildProfilePatch(state(), 'school-admin') as Record<string, any>

  it('schaltet Verbindungen nach außen und Nischenmodule aus', () => {
    for (const k of ['webResearchEnabled', 'imageGenerationEnabled', 'agentShellEnabled', 'workflowCanvasEnabled',
      'semanticScholarEnabled', 'zoteroEnabled', 'pdfCompanionEnabled', 'flashcardsEnabled', 'smartConnectionsEnabled']) {
      expect(p[k], k).toBe(false)
    }
    expect(p.languageTool.enabled).toBe(false)
    expect(p.readwise.enabled).toBe(false)
    expect(p.telegramBot.enabled).toBe(false)
    expect(p.speech.ttsEngine).toBe('system')
    for (const id of ['antares', 'edoobox', 'marketing', 'remarkable']) expect(p.pluginConfig[id].enabled, id).toBe(false)
  })

  it('KI nur lokal, kein Cloud-Standardweg, Cloud-Anbieter aus — übrige KI-Felder bleiben', () => {
    expect(p.ollama.localOnly).toBe(true)
    expect(p.ollama.defaultCloudProvider).toBeNull()
    expect(p.ollama.openrouter).toEqual({ enabled: false, hasApiKey: true, model: 'x' })
    expect(p.ollama.llmbase.enabled).toBe(false)
    expect(p.ollama.selectedModel).toBe('qwen3')
  })

  it('Kern bleibt an: Mail, Dashboard, Notiz-Chat; Lesen als Standard wie office', () => {
    expect(p.email).toEqual({ enabled: true, accounts: ['a'] })
    expect(p.dashboard.enabled).toBe(true)
    expect(p.notesChatEnabled).toBe(true)
    expect(p.editorDefaultView).toBe('preview')
    expect(p.showFormattingToolbar).toBe(true)
    expect(p.showRawEditor).toBe(false)
  })

  it('fremde Plugin-Configs und Antares-Adresse bleiben erhalten', () => {
    expect(p.pluginConfig.faktura).toEqual({ enabled: true })
    expect(p.pluginConfig.antares.baseUrl).toBe('https://a')
  })

  it('lässt die Update-Prüfung unangetastet', () => {
    expect('updateCheckOnStart' in PROFILE_PRESETS['school-admin']).toBe(false)
  })
})

describe('onboardingAiCapabilities', () => {
  it('Schulverwaltung (nur lokal): keine Lernkarten-Werbung, dafür Mail-Hilfe', () => {
    expect(onboardingAiCapabilities(true)).toEqual(['mail', 'chat', 'tools'])
    expect(PROFILE_PRESETS['school-admin'].flashcardsEnabled).toBe(false)
  })
  it('andere Profile: unverändert wie bisher', () => {
    expect(onboardingAiCapabilities(false)).toEqual(['quiz', 'chat', 'tools'])
  })
})
