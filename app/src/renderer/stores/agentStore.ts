import { create } from 'zustand'
import type { EdooboxEvent, EdooboxOffer, EdooboxCategory, EdooboxOfferDashboard, EdooboxBooking } from '../../shared/types'
import { useUIStore } from './uiStore'
import { useNotesStore } from './notesStore'

export interface MarketingPublishStatus {
  wordpress?: { postId: number; postUrl: string; status: string; publishedAt: string }
}

interface AgentState {
  events: EdooboxEvent[]
  offers: EdooboxOffer[]
  categories: EdooboxCategory[]
  isConnected: boolean
  isImporting: boolean
  isPushing: boolean
  selectedEventId: string | null

  // Dashboard
  dashboardView: 'events' | 'dashboard' | 'marketing'
  dashboardOffers: EdooboxOfferDashboard[]
  isDashboardLoading: boolean

  // Marketing
  marketingOffers: EdooboxOfferDashboard[]
  isMarketingLoading: boolean
  selectedMarketingOfferId: string | null
  generatedBlogPost: string
  generatedIgCaption: string
  isGenerating: boolean
  isPublishing: boolean
  marketingPublishStatus: Record<string, MarketingPublishStatus> // offerId -> status
  selectedImagePath: string | null

  // Actions
  setSelectedEventId: (id: string | null) => void
  loadEvents: () => Promise<void>
  saveEvents: () => Promise<void>
  checkConnection: () => Promise<boolean>
  parseFormular: () => Promise<void>
  pushEvent: (eventId: string) => Promise<void>
  listOffers: () => Promise<void>
  loadCategories: () => Promise<void>
  updateEvent: (eventId: string, updates: Partial<EdooboxEvent>) => Promise<void>
  deleteEvent: (eventId: string) => Promise<void>

  // Dashboard Actions
  setDashboardView: (view: 'events' | 'dashboard' | 'marketing') => void
  loadDashboard: () => Promise<void>
  loadBookingsForOffer: (offerId: string) => Promise<void>

  // Marketing Actions
  setSelectedMarketingOfferId: (id: string | null) => void
  loadMarketingOffers: () => Promise<void>
  generateContent: (offer: EdooboxOfferDashboard, bookingUrl?: string) => Promise<void>
  setGeneratedBlogPost: (text: string) => void
  setGeneratedIgCaption: (text: string) => void
  publishToWordpress: (offerId: string, title: string, content: string) => Promise<void>
  selectImage: () => Promise<void>
  generateImage: (offer: EdooboxOfferDashboard) => Promise<void>
  isGeneratingImage: boolean
  imagePreviewDataUrl: string | null
  imageGeneratedInfo: string | null
}

export const useAgentStore = create<AgentState>()((set, get) => ({
  events: [],
  offers: [],
  categories: [],
  isConnected: false,
  isImporting: false,
  isPushing: false,
  selectedEventId: null,

  // Dashboard
  dashboardView: 'events',
  dashboardOffers: [],
  isDashboardLoading: false,

  // Marketing
  marketingOffers: [],
  isMarketingLoading: false,
  selectedMarketingOfferId: null,
  generatedBlogPost: '',
  generatedIgCaption: '',
  isGenerating: false,
  isPublishing: false,
  marketingPublishStatus: {},
  selectedImagePath: null,
  isGeneratingImage: false,
  imagePreviewDataUrl: null,
  imageGeneratedInfo: null,

  setSelectedEventId: (id) => set({ selectedEventId: id }),

  loadEvents: async () => {
    const vaultPath = useNotesStore.getState().vaultPath
    if (!vaultPath) return
    const events = await window.electronAPI.edooboxLoadEvents(vaultPath)
    set({ events })
  },

  saveEvents: async () => {
    const vaultPath = useNotesStore.getState().vaultPath
    if (!vaultPath) return
    await window.electronAPI.edooboxSaveEvents(vaultPath, get().events)
  },

  checkConnection: async () => {
    const { baseUrl, apiVersion } = useUIStore.getState().edoobox
    const result = await window.electronAPI.edooboxCheck(baseUrl, apiVersion)
    set({ isConnected: result.success })
    return result.success
  },

  parseFormular: async () => {
    set({ isImporting: true })
    try {
      const result = await window.electronAPI.edooboxParseFormular()
      if (!result) {
        set({ isImporting: false })
        return
      }
      const { event, warnings } = result
      const eventWithWarnings = { ...event, warnings }
      set((state) => ({
        events: [eventWithWarnings, ...state.events],
        selectedEventId: eventWithWarnings.id,
        isImporting: false
      }))
      const vaultPath = useNotesStore.getState().vaultPath
      if (vaultPath) {
        await window.electronAPI.edooboxSaveEvents(vaultPath, [eventWithWarnings, ...get().events.filter(e => e.id !== eventWithWarnings.id)])
      }
    } catch {
      set({ isImporting: false })
    }
  },

  pushEvent: async (eventId: string) => {
    set({ isPushing: true })
    try {
      const event = get().events.find(e => e.id === eventId)
      if (!event) return

      const { baseUrl, apiVersion } = useUIStore.getState().edoobox
      const result = await window.electronAPI.edooboxImportEvent(baseUrl, apiVersion, event)

      set((state) => ({
        events: state.events.map(e =>
          e.id === eventId
            ? {
                ...e,
                status: result.success ? 'pushed' as const : 'error' as const,
                edooboxOfferId: result.offerId,
                pushedAt: result.success ? new Date().toISOString() : undefined,
                error: result.error
              }
            : e
        ),
        isPushing: false
      }))
      await get().saveEvents()
    } catch (error) {
      set((state) => ({
        events: state.events.map(e =>
          e.id === eventId ? { ...e, status: 'error' as const, error: error instanceof Error ? error.message : 'Unbekannter Fehler' } : e
        ),
        isPushing: false
      }))
      await get().saveEvents()
    }
  },

  listOffers: async () => {
    const { baseUrl, apiVersion } = useUIStore.getState().edoobox
    const result = await window.electronAPI.edooboxListOffers(baseUrl, apiVersion)
    if (result.success && result.offers) {
      set({ offers: result.offers })
    }
  },

  loadCategories: async () => {
    const { baseUrl, apiVersion } = useUIStore.getState().edoobox
    const result = await window.electronAPI.edooboxListCategories(baseUrl, apiVersion)
    if (result.success && result.categories) {
      set({ categories: result.categories })
    }
  },

  updateEvent: async (eventId: string, updates: Partial<EdooboxEvent>) => {
    set((state) => ({
      events: state.events.map(e =>
        e.id === eventId ? { ...e, ...updates } : e
      )
    }))
    await get().saveEvents()
  },

  deleteEvent: async (eventId: string) => {
    set((state) => ({
      events: state.events.filter(e => e.id !== eventId),
      selectedEventId: state.selectedEventId === eventId ? null : state.selectedEventId
    }))
    await get().saveEvents()
  },

  // Dashboard
  setDashboardView: (view) => set({ dashboardView: view }),

  loadDashboard: async () => {
    set({ isDashboardLoading: true })
    try {
      const { baseUrl, apiVersion } = useUIStore.getState().edoobox
      const result = await window.electronAPI.edooboxListOffersDashboard(baseUrl, apiVersion)
      if (result.success && result.offers) {
        set({ dashboardOffers: result.offers, isDashboardLoading: false })
      } else {
        set({ isDashboardLoading: false })
      }
    } catch {
      set({ isDashboardLoading: false })
    }
  },

  loadBookingsForOffer: async (offerId: string) => {
    const { baseUrl, apiVersion } = useUIStore.getState().edoobox
    const result = await window.electronAPI.edooboxListBookings(baseUrl, apiVersion, offerId)
    if (result.success && result.bookings) {
      set((state) => ({
        dashboardOffers: state.dashboardOffers.map(o =>
          o.id === offerId ? { ...o, bookings: result.bookings as EdooboxBooking[] } : o
        )
      }))
    }
  },

  // Marketing Actions
  setSelectedMarketingOfferId: (id) => set({ selectedMarketingOfferId: id, generatedBlogPost: '', generatedIgCaption: '', selectedImagePath: null, imagePreviewDataUrl: null, imageGeneratedInfo: null }),

  loadMarketingOffers: async () => {
    set({ isMarketingLoading: true })
    try {
      const { baseUrl, apiVersion } = useUIStore.getState().edoobox
      const result = await window.electronAPI.edooboxListOffersDashboard(baseUrl, apiVersion)
      if (result.success && result.offers) {
        set({ marketingOffers: result.offers, isMarketingLoading: false })
      } else {
        set({ isMarketingLoading: false })
      }
    } catch {
      set({ isMarketingLoading: false })
    }
  },

  generateContent: async (offer: EdooboxOfferDashboard, bookingUrl?: string) => {
    set({ isGenerating: true })
    try {
      const { ollama } = useUIStore.getState()
      const model = ollama.selectedModel || 'llama3.2'
      const result = await window.electronAPI.marketingGenerateContent({
        name: offer.name,
        description: offer.description || '',
        dateStart: offer.dateStart,
        dateEnd: offer.dateEnd,
        location: offer.location,
        maxParticipants: offer.maxParticipants,
        speakers: offer.leaders,
        bookingUrl
      }, model)
      if (result.success) {
        set({
          generatedBlogPost: result.blogPost || '',
          generatedIgCaption: result.igCaption || '',
          isGenerating: false
        })
      } else {
        set({ isGenerating: false })
      }
    } catch {
      set({ isGenerating: false })
    }
  },

  setGeneratedBlogPost: (text) => set({ generatedBlogPost: text }),
  setGeneratedIgCaption: (text) => set({ generatedIgCaption: text }),

  publishToWordpress: async (offerId: string, title: string, content: string) => {
    set({ isPublishing: true })
    try {
      const { wordpressUrl, wordpressUser, defaultPostStatus } = useUIStore.getState().marketing
      const { selectedImagePath } = get()

      // Upload image as featured media if available, with caption for AI-generated images
      let featuredMediaId: number | undefined
      if (selectedImagePath) {
        const { imageGeneratedInfo } = get()
        const caption = imageGeneratedInfo ? 'Bild generiert mit Google Imagen 4.0' : undefined
        const uploadResult = await window.electronAPI.marketingUploadImage(wordpressUrl, wordpressUser, selectedImagePath, caption)
        if (uploadResult.success && uploadResult.mediaId) {
          featuredMediaId = uploadResult.mediaId
        }
      }

      // Prepend image caption to content if AI-generated image
      let finalContent = content
      const { imageGeneratedInfo } = get()
      if (imageGeneratedInfo && featuredMediaId) {
        finalContent = `<p class="imagen-caption" style="font-size:0.85em;color:#666;margin-top:-0.5em;margin-bottom:1.5em;font-style:italic;">${imageGeneratedInfo}</p>\n${content}`
      }

      const result = await window.electronAPI.marketingPublishWordpress(wordpressUrl, wordpressUser, title, finalContent, defaultPostStatus, featuredMediaId)
      if (result.success) {
        set((state) => ({
          marketingPublishStatus: {
            ...state.marketingPublishStatus,
            [offerId]: {
              ...state.marketingPublishStatus[offerId],
              wordpress: { postId: result.postId!, postUrl: result.postUrl!, status: result.status!, publishedAt: new Date().toISOString() }
            }
          },
          isPublishing: false
        }))
      } else {
        set({ isPublishing: false })
      }
    } catch {
      set({ isPublishing: false })
    }
  },

  selectImage: async () => {
    const result = await window.electronAPI.marketingSelectImage()
    if (result) {
      // Load as data URL for preview
      const base64Result = await window.electronAPI.marketingReadImageBase64(result)
      const dataUrl = base64Result ? `data:image/${result.split('.').pop() === 'png' ? 'png' : 'jpeg'};base64,${base64Result}` : null
      set({ selectedImagePath: result, imagePreviewDataUrl: dataUrl })
    }
  },

  generateImage: async (offer: EdooboxOfferDashboard) => {
    const { googleImagenApiKey } = useUIStore.getState().marketing
    if (!googleImagenApiKey) return
    set({ isGeneratingImage: true })
    try {
      // Erst Ollama einen passenden Bild-Prompt generieren lassen
      const { ollama } = useUIStore.getState()
      const model = ollama.selectedModel || 'llama3.2'
      const metaPrompt = `Write a short English image generation prompt (MAX 50 words, one paragraph) for a photo about: "${offer.name}". The image must visually match the topic. Photorealistic style, no text in image. Return ONLY the prompt, nothing else.`

      const ollamaResult = await window.electronAPI.ollamaGenerate({
        model,
        prompt: metaPrompt,
        action: 'custom' as const,
        originalText: offer.name,
        customPrompt: metaPrompt
      })

      const fallbackPrompt = `Professional photo for educational workshop about ${offer.name.slice(0, 80)}. Realistic, modern classroom or conference setting, natural lighting, no text in image.`
      let rawPrompt = ollamaResult.success && ollamaResult.result
        ? ollamaResult.result
        : fallbackPrompt
      // Clean up: remove preamble, quotes, markdown, newlines, trim to safe length
      rawPrompt = rawPrompt
        .replace(/^(Here['']?s?|Sure|Of course|The prompt)[^:]*:\s*/i, '')
        .replace(/["""*\n\r]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 250)
      const imagePrompt = rawPrompt || fallbackPrompt

      // Try generation, retry once with fallback prompt if it fails
      let result = await window.electronAPI.marketingGenerateImage(imagePrompt, googleImagenApiKey)
      if (!result.success && imagePrompt !== fallbackPrompt) {
        console.log('[marketing] Image generation failed, retrying with fallback prompt')
        result = await window.electronAPI.marketingGenerateImage(fallbackPrompt, googleImagenApiKey)
      }
      if (result.success && result.imagePath) {
        const dataUrl = result.imageBase64 ? `data:image/png;base64,${result.imageBase64}` : null
        const now = new Date()
        const info = `Google Imagen 4.0 · ${now.toLocaleDateString('de-DE')} ${now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} · Prompt: "${imagePrompt.slice(0, 100)}${imagePrompt.length > 100 ? '...' : ''}"`
        set({ selectedImagePath: result.imagePath, imagePreviewDataUrl: dataUrl, imageGeneratedInfo: info, isGeneratingImage: false })
      } else {
        set({ isGeneratingImage: false })
      }
    } catch {
      set({ isGeneratingImage: false })
    }
  }
}))
