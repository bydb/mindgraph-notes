import React, { useState, useCallback, useEffect } from 'react'
import { useUIStore } from '../../stores/uiStore'
import type { UserProfile } from '../../stores/uiStore'
import { WelcomeScreen } from './WelcomeScreen'
import { IntentStep } from './steps/IntentStep'
import { AIStep } from './steps/AIStep'
import { DashboardStep } from './steps/DashboardStep'
import { MissionsStep } from './steps/MissionsStep'
import { EmailSetupStep } from './steps/EmailSetupStep'
import './Onboarding.css'

type OnboardingStep = 'welcome' | 'intent' | 'email-setup' | 'ai' | 'dashboard' | 'missions'

// Profile, für die der Email-Setup-Step im Onboarding eingeblendet wird. Andere
// Profile sollen den Step nicht sehen — sonst kommt der Demo-Pfad bei einem
// Studenten aus dem Tritt, wenn er kein IMAP-Account hat.
const EMAIL_SETUP_PROFILES = new Set(['office', 'professional'])

export const Onboarding: React.FC = () => {
  const { onboardingOpen, setOnboardingOpen, setOnboardingCompleted, setUserProfile, applyProfileDefaults, setWelcomeNotePending } = useUIStore()
  const [step, setStep] = useState<OnboardingStep>('welcome')
  const [vaultPath, setLocalVaultPath] = useState<string | null>(null)
  const [selectedProfile, setSelectedProfile] = useState<UserProfile>(null)
  const [createdStarterVault, setCreatedStarterVault] = useState(false)

  // Reset to first step when onboarding is reopened
  useEffect(() => {
    if (onboardingOpen) {
      setStep('welcome')
      setSelectedProfile(null)
    }
  }, [onboardingOpen])

  const handleSetVaultPath = useCallback((path: string) => {
    setLocalVaultPath(path)
    // Track if starter vault was created (for MissionsStep auto-done)
    setCreatedStarterVault(true)
  }, [])

  const finishWithVault = useCallback(async (path: string) => {
    await window.electronAPI.setLastVault(path)
  }, [])

  const completeOnboarding = useCallback(async () => {
    console.log('[Onboarding] completeOnboarding called, vaultPath:', vaultPath, 'profile:', selectedProfile)
    if (vaultPath) {
      try {
        await finishWithVault(vaultPath)
        console.log('[Onboarding] setLastVault completed for:', vaultPath)
      } catch (error) {
        console.error('[Onboarding] Failed to set vault:', error)
      }
    }
    if (selectedProfile) {
      setUserProfile(selectedProfile)
      applyProfileDefaults(selectedProfile)
    }
    setWelcomeNotePending(true)
    setOnboardingCompleted(true)
    setOnboardingOpen(false)
  }, [vaultPath, selectedProfile, finishWithVault, setOnboardingCompleted, setOnboardingOpen, setUserProfile, applyProfileDefaults, setWelcomeNotePending])

  const handleOpenVaultDirect = useCallback(async () => {
    try {
      const result = await window.electronAPI.openVault()
      if (result) {
        await finishWithVault(result)
        setWelcomeNotePending(true)
        setOnboardingCompleted(true)
        setOnboardingOpen(false)
      }
    } catch (error) {
      console.error('[Onboarding] Failed to open vault:', error)
    }
  }, [finishWithVault, setOnboardingCompleted, setOnboardingOpen, setWelcomeNotePending])

  if (!onboardingOpen) return null

  // Schrittzähler: office/professional durchlaufen zusätzlich den E-Mail-Setup-Step,
  // also 5 statt 4 Schritte. Die Anzeige muss dem realen Pfad folgen.
  const hasEmailStep = !!selectedProfile && EMAIL_SETUP_PROFILES.has(selectedProfile)
  const totalSteps = hasEmailStep ? 5 : 4
  const stepNumbers: Record<Exclude<OnboardingStep, 'welcome'>, number> = {
    intent: 1,
    'email-setup': 2,
    ai: hasEmailStep ? 3 : 2,
    dashboard: hasEmailStep ? 4 : 3,
    missions: hasEmailStep ? 5 : 4
  }

  return (
    <div className="onboarding-overlay">
      <div className="onboarding-container">
        {step === 'welcome' && (
          <WelcomeScreen
            onStartWizard={() => setStep('intent')}
            onOpenVault={handleOpenVaultDirect}
          />
        )}
        {step === 'intent' && (
          <IntentStep
            selectedProfile={selectedProfile}
            onSelectProfile={setSelectedProfile}
            vaultPath={vaultPath}
            setVaultPath={handleSetVaultPath}
            onBack={() => setStep('welcome')}
            onNext={() => {
              // Office-/Professional-User landen erst im E-Mail-Setup; alle
              // anderen Profile springen direkt zum KI-Features-Schritt.
              if (selectedProfile && EMAIL_SETUP_PROFILES.has(selectedProfile)) {
                setStep('email-setup')
              } else {
                setStep('ai')
              }
            }}
            stepNumber={stepNumbers.intent}
            totalSteps={totalSteps}
          />
        )}
        {step === 'email-setup' && (
          <EmailSetupStep
            onBack={() => setStep('intent')}
            onNext={() => setStep('ai')}
            stepNumber={stepNumbers['email-setup']}
            totalSteps={totalSteps}
          />
        )}
        {step === 'ai' && (
          <AIStep
            onBack={() => {
              if (selectedProfile && EMAIL_SETUP_PROFILES.has(selectedProfile)) {
                setStep('email-setup')
              } else {
                setStep('intent')
              }
            }}
            onNext={() => setStep('dashboard')}
            stepNumber={stepNumbers.ai}
            totalSteps={totalSteps}
          />
        )}
        {step === 'dashboard' && (
          <DashboardStep
            profile={selectedProfile}
            onBack={() => setStep('ai')}
            onNext={() => setStep('missions')}
            stepNumber={stepNumbers.dashboard}
            totalSteps={totalSteps}
          />
        )}
        {step === 'missions' && (
          <MissionsStep
            onBack={() => setStep('dashboard')}
            onFinish={completeOnboarding}
            hasStarterVault={createdStarterVault}
            stepNumber={stepNumbers.missions}
            totalSteps={totalSteps}
          />
        )}
      </div>
    </div>
  )
}
