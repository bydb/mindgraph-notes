// Marketing-Prompt-Bau (Plugin-Vertikale). Reine String-Logik — kein I/O. Erzeugt die beiden
// Ollama-Prompts (WordPress-Blogpost + Instagram-Caption) aus den Veranstaltungsdaten.
// WICHTIG: kein Gendern mit Sternchen/Doppelpunkt/Unterstrich (Projektregel).

export interface MarketingOfferData {
  name: string
  description?: string
  dateStart?: string
  dateEnd?: string
  location?: string
  price?: number
  maxParticipants?: number
  speakers?: string[]
  bookingUrl?: string
}

function buildOfferSummary(offerData: MarketingOfferData): string {
  const details: string[] = []
  if (offerData.description) details.push(`Beschreibung: ${offerData.description}`)
  if (offerData.dateStart) {
    const start = new Date(offerData.dateStart)
    const dateStr = start.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
    const timeStr = start.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
    if (offerData.dateEnd) {
      const end = new Date(offerData.dateEnd)
      const endDateStr = end.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
      const endTimeStr = end.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
      if (dateStr === endDateStr) {
        details.push(`Datum: ${dateStr}, ${timeStr} – ${endTimeStr}`)
      } else {
        details.push(`Datum: ${dateStr} ${timeStr} – ${endDateStr} ${endTimeStr}`)
      }
    } else {
      details.push(`Datum: ${dateStr}, ${timeStr} Uhr`)
    }
  }
  if (offerData.location) details.push(`Ort: ${offerData.location}`)
  if (offerData.price) details.push(`Preis: ${offerData.price} EUR`)
  if (offerData.maxParticipants) details.push(`Max. Teilnehmer: ${offerData.maxParticipants}`)
  if (offerData.speakers?.length) details.push(`Referent(en): ${offerData.speakers.join(', ')}`)
  if (offerData.bookingUrl) details.push(`Anmelde-Link: ${offerData.bookingUrl}`)
  return `Titel: ${offerData.name}\n${details.join('\n')}`
}

export function buildMarketingPrompts(offerData: MarketingOfferData): { wpPrompt: string; igPrompt: string } {
  const offerSummary = buildOfferSummary(offerData)
  const bookingHint = offerData.bookingUrl
    ? ` Binde den Anmelde-Link (${offerData.bookingUrl}) prominent als Button oder Link im Call-to-Action ein.`
    : ''

  const wpPrompt = `Du bist ein professioneller Marketing-Texter für Fortbildungsveranstaltungen. Erstelle einen ansprechenden Blog-Post im HTML-Format. Verwende <h2>, <p>, <ul> Tags. BEGINNE NICHT mit dem Titel als Überschrift — der Titel wird automatisch von WordPress angezeigt. Starte direkt mit dem Einleitungstext. Der Blog-Post MUSS am Ende einen Abschnitt "Veranstaltungsdetails" mit ALLEN folgenden Infos als <p><strong>-Liste enthalten: Datum, Uhrzeit, Ort, Referent(en), Teilnehmerzahl.${bookingHint} WICHTIG: Verwende KEIN Gendern mit Sternchen, Doppelpunkt oder Unterstrich (NICHT Schüler*innen, Lehrer:innen etc.). Nutze stattdessen neutrale Begriffe wie Lehrkräfte, Teilnehmende oder die ausgeschriebene Form. Gib NUR den HTML-Body zurück, keine Erklärungen.

Veranstaltung:
${offerSummary}`

  const igPrompt = `Du bist ein Social-Media-Experte. Erstelle eine ansprechende Instagram-Caption (max. 2000 Zeichen) für folgende Veranstaltung. Die Caption MUSS Datum, Uhrzeit und Ort der Veranstaltung enthalten. Sie soll Aufmerksamkeit erregen und mit relevanten Hashtags enden. Verwende passende Emojis. WICHTIG: Verwende KEIN Gendern mit Sternchen, Doppelpunkt oder Unterstrich (NICHT Schüler*innen, Lehrer:innen etc.). Nutze stattdessen neutrale Begriffe wie Lehrkräfte, Teilnehmende oder die ausgeschriebene Form. Gib NUR die Caption zurück.

Veranstaltung:
${offerSummary}`

  return { wpPrompt, igPrompt }
}
