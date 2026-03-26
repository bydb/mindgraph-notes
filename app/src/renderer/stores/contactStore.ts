import { create } from 'zustand'
import type { AggregatedContact } from '../../shared/types'
import { useEmailStore } from './emailStore'
import { useAgentStore } from './agentStore'
import { useNotesStore } from './notesStore'

interface ContactState {
  contacts: AggregatedContact[]
  isBuilding: boolean
  buildContacts: () => void
  searchContacts: (query: string) => AggregatedContact[]
  getContactByEmail: (email: string) => AggregatedContact | undefined
}

const normalizeEmail = (email: string) => email.trim().toLowerCase()

export const useContactStore = create<ContactState>()((set, get) => ({
  contacts: [],
  isBuilding: false,

  buildContacts: () => {
    set({ isBuilding: true })

    try {
      const contactMap = new Map<string, AggregatedContact>()

      const getOrCreate = (email: string, name: string): AggregatedContact => {
        const key = normalizeEmail(email)
        if (contactMap.has(key)) return contactMap.get(key)!
        const contact: AggregatedContact = {
          id: key,
          name: name || email,
          email: key,
          aliases: [],
          sources: [],
          emailCount: 0
        }
        contactMap.set(key, contact)
        return contact
      }

      // Source 1: Emails
      const { emails } = useEmailStore.getState()
      for (const email of emails) {
        if (email.from.address) {
          const contact = getOrCreate(email.from.address, email.from.name)
          contact.emailCount++
          if (!contact.sources.includes('email')) contact.sources.push('email')
          if (email.from.name && contact.name !== email.from.name && !contact.aliases.includes(email.from.name)) {
            if (contact.name === contact.email) contact.name = email.from.name
            else contact.aliases.push(email.from.name)
          }
          if (!contact.lastEmailDate || email.date > contact.lastEmailDate) {
            contact.lastEmailDate = email.date
          }
        }
        for (const to of email.to) {
          if (to.address) {
            const contact = getOrCreate(to.address, to.name)
            contact.emailCount++
            if (!contact.sources.includes('email')) contact.sources.push('email')
            if (to.name && contact.name !== to.name && !contact.aliases.includes(to.name)) {
              if (contact.name === contact.email) contact.name = to.name
              else contact.aliases.push(to.name)
            }
            if (!contact.lastEmailDate || email.date > contact.lastEmailDate) {
              contact.lastEmailDate = email.date
            }
          }
        }
      }

      // Source 2: edoobox bookings
      const { dashboardOffers } = useAgentStore.getState()
      for (const offer of dashboardOffers) {
        if (!offer.bookings) continue
        for (const booking of offer.bookings) {
          if (!booking.userEmail) continue
          const contact = getOrCreate(booking.userEmail, booking.userName)
          if (!contact.sources.includes('edoobox')) contact.sources.push('edoobox')
          if (booking.userName && contact.name !== booking.userName && !contact.aliases.includes(booking.userName)) {
            // Prefer edoobox name over email name
            if (!contact.sources.includes('email') || contact.name === contact.email) {
              contact.name = booking.userName
            } else {
              contact.aliases.push(booking.userName)
            }
          }
          if (!contact.edooboxBookings) contact.edooboxBookings = []
          const alreadyTracked = contact.edooboxBookings.some(b => b.offerId === String(offer.id))
          if (!alreadyTracked) {
            contact.edooboxBookings.push({
              offerId: String(offer.id),
              offerName: offer.name,
              status: booking.status
            })
          }
        }
      }

      // Source 3: Vault wikilinks (lightweight scan of note titles/content)
      const { notes } = useNotesStore.getState()
      const emailRegex = /[\w.-]+@[\w.-]+\.\w{2,}/g
      for (const note of Object.values(notes)) {
        if (!note.content) continue
        const matches = note.content.match(emailRegex)
        if (matches) {
          for (const match of matches) {
            const contact = getOrCreate(match, '')
            if (!contact.sources.includes('vault')) contact.sources.push('vault')
            if (!contact.vaultMentions) contact.vaultMentions = []
            if (!contact.vaultMentions.includes(note.path)) {
              contact.vaultMentions.push(note.path)
            }
          }
        }
      }

      set({ contacts: Array.from(contactMap.values()), isBuilding: false })
    } catch (error) {
      console.error('[ContactStore] Failed to build contacts:', error)
      set({ isBuilding: false })
    }
  },

  searchContacts: (query: string) => {
    const q = query.toLowerCase()
    if (!q) return get().contacts.slice(0, 20)
    return get().contacts.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q) ||
      c.aliases.some(a => a.toLowerCase().includes(q))
    ).slice(0, 20)
  },

  getContactByEmail: (email: string) => {
    const key = normalizeEmail(email)
    return get().contacts.find(c => c.email === key)
  }
}))
