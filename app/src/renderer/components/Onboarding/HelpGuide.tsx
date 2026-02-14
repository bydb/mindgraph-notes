import React from 'react'
import { useUIStore } from '../../stores/uiStore'
import { useShallow } from 'zustand/react/shallow'
import { FeaturesStep } from './steps/FeaturesStep'
import './Onboarding.css'

export const HelpGuide: React.FC = () => {
  const { helpGuideOpen, setHelpGuideOpen } = useUIStore(
    useShallow(s => ({
      helpGuideOpen: s.helpGuideOpen,
      setHelpGuideOpen: s.setHelpGuideOpen
    }))
  )

  if (!helpGuideOpen) return null

  return (
    <div className="onboarding-overlay" onClick={() => setHelpGuideOpen(false)}>
      <div className="onboarding-container" onClick={e => e.stopPropagation()}>
        <FeaturesStep
          onBack={() => setHelpGuideOpen(false)}
          onFinish={() => setHelpGuideOpen(false)}
          showFlashcards
          showSmartConnections
          showNotesChat
          standalone
        />
      </div>
    </div>
  )
}
