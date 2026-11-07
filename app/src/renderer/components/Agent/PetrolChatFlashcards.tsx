// Lernkarten aus einer Chat-Antwort (Schülertest 07.11.2026). Erzeugt über den vorhandenen
// Karten-Erzeuger (`flashcards-generate`, eine Karte = ein Fakt), zeigt die Karten als Vorschau im
// Gespräch — streichen ist möglich —, legt die übernommenen lernbereit an und startet auf Wunsch
// sofort die Abfrage. Modellweg = der des Chats (die Antwort kam von dort).

import React, { useEffect, useRef, useState } from 'react'
import { useTranslation } from '../../utils/translations'
import { useFlashcardStore, createFlashcardFromQuiz } from '../../stores/flashcardStore'
import { chatAnswerCardSource, chatCardSourceLabel } from '../../utils/chatFlashcards'
import type { Flashcard } from '../../../shared/types'

const MAX_CARDS = 12

interface Props {
  question: string
  answer: string
  model: string
  backend: 'ollama' | 'lm-studio'
  cloud: { model: string; provider: 'openrouter' | 'llmbase' } | null
  vaultPath: string
  onClose: () => void
}

type Draft = { front: string; back: string; topic: string; keep: boolean }

export const PetrolChatFlashcards: React.FC<Props> = ({ question, answer, model, backend, cloud, vaultPath, onClose }) => {
  const { t } = useTranslation()
  const [phase, setPhase] = useState<'loading' | 'preview' | 'saving' | 'saved' | 'error'>('loading')
  const [cards, setCards] = useState<Draft[]>([])
  const [error, setError] = useState('')
  const [saved, setSaved] = useState<Flashcard[]>([])
  const alive = useRef(true)
  // Genau eine Anfrage je Vorschau — React ruft Effekte im Entwicklungsmodus doppelt auf, und jede
  // Anfrage kostet bei Cloud-Modellen Geld (zwei Aufrufe im ersten GUI-Test).
  const requested = useRef(false)

  useEffect(() => {
    alive.current = true
    if (requested.current) return () => { alive.current = false }
    requested.current = true
    if (!cloud && backend === 'lm-studio') {
      setError(t('petrolChat.cardsNoLmStudio'))
      setPhase('error')
      return
    }
    const source = chatAnswerCardSource(question, answer)
    window.electronAPI.flashcardsGenerate(model, source, MAX_CARDS, chatCardSourceLabel(question), cloud)
      .then((r) => {
        if (!alive.current) return
        if (r.success && r.cards?.length) {
          setCards(r.cards.map((c) => ({ front: c.front, back: c.back, topic: c.topic, keep: true })))
          setPhase('preview')
        } else {
          setError(r.error || t('petrolChat.cardsFailed'))
          setPhase('error')
        }
      })
      .catch((e) => {
        if (!alive.current) return
        setError(e instanceof Error ? e.message : t('petrolChat.cardsFailed'))
        setPhase('error')
      })
    return () => { alive.current = false }
    // Einmal je geöffneter Vorschau.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const kept = cards.filter((c) => c.keep)

  const accept = async () => {
    if (!kept.length) return
    setPhase('saving')
    const store = useFlashcardStore.getState()
    const label = chatCardSourceLabel(question)
    // Der Schüler hat die Karten gerade gesehen und ausgewählt: lernbereit statt „ausstehend“.
    const created = kept.map((c) => ({ ...createFlashcardFromQuiz(c.front, c.back, c.topic || label, label), status: 'active' as const }))
    try {
      // Erst laden (Merge mit dem Vault-Stand), dann anhängen und speichern — wie im Karten-Panel.
      await store.loadFlashcards(vaultPath)
      store.addFlashcards(created)
      await store.saveFlashcards(vaultPath)
      if (!alive.current) return
      setSaved(created)
      setPhase('saved')
    } catch (e) {
      if (!alive.current) return
      setError(e instanceof Error ? e.message : t('petrolChat.cardsFailed'))
      setPhase('error')
    }
  }

  return (
    <div className="petrol-cards" role="group" aria-label={t('petrolChat.cardsTitle')}>
      {phase === 'loading' && <div className="petrol-cards-status">{t('petrolChat.cardsLoading')}</div>}
      {phase === 'error' && (
        <div className="petrol-cards-status is-error">
          <span>{error}</span>
          <button type="button" className="agent-card-btn" onClick={onClose}>{t('petrolChat.cardsClose')}</button>
        </div>
      )}
      {(phase === 'preview' || phase === 'saving') && (
        <>
          <div className="petrol-cards-head">
            <span className="petrol-cards-title">{t('petrolChat.cardsPreview', { n: cards.length })}</span>
            <span className="petrol-cards-hint">{t('petrolChat.cardsHint')}</span>
          </div>
          <ol className="petrol-cards-list">
            {cards.map((c, i) => (
              <li key={i} className={`petrol-card ${c.keep ? '' : 'is-off'}`}>
                <div className="petrol-card-front">{c.front}</div>
                <div className="petrol-card-back">{c.back}</div>
                <button
                  type="button"
                  className="petrol-card-toggle"
                  aria-pressed={!c.keep}
                  title={c.keep ? t('petrolChat.cardsDrop') : t('petrolChat.cardsKeep')}
                  aria-label={c.keep ? t('petrolChat.cardsDrop') : t('petrolChat.cardsKeep')}
                  onClick={() => setCards(cards.map((x, k) => (k === i ? { ...x, keep: !x.keep } : x)))}
                >
                  {c.keep
                    ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                    : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12l5 5L20 6" /></svg>}
                </button>
              </li>
            ))}
          </ol>
          <div className="petrol-turn-actions">
            <button type="button" className="agent-card-btn" onClick={onClose} disabled={phase === 'saving'}>{t('petrolChat.cardsDiscard')}</button>
            <button type="button" className="agent-card-btn is-primary" onClick={() => void accept()} disabled={!kept.length || phase === 'saving'}>
              {t('petrolChat.cardsAccept', { n: kept.length })}
            </button>
          </div>
        </>
      )}
      {phase === 'saved' && (
        <div className="petrol-cards-status">
          <span>{t('petrolChat.cardsSaved', { n: saved.length })}</span>
          <div className="petrol-turn-actions">
            <button type="button" className="agent-card-btn" onClick={onClose}>{t('petrolChat.cardsClose')}</button>
            <button type="button" className="agent-card-btn is-primary" onClick={() => useFlashcardStore.getState().startStudySession(saved)}>{t('petrolChat.cardsStudy')}</button>
          </div>
        </div>
      )}
    </div>
  )
}
