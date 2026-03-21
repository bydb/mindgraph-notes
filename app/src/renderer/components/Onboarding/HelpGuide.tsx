import React from 'react'
import { useUIStore } from '../../stores/uiStore'
import { useShallow } from 'zustand/react/shallow'
import { MissionsStep } from './steps/MissionsStep'
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
        <MissionsStep
          onBack={() => setHelpGuideOpen(false)}
          onFinish={() => setHelpGuideOpen(false)}
          standalone
        />
      </div>
    </div>
  )
}
