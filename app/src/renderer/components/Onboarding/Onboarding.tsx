import React, { useState, useCallback, useEffect } from 'react'
import { useUIStore } from '../../stores/uiStore'
import type { UserProfile } from '../../stores/uiStore'
import { WelcomeScreen } from './WelcomeScreen'
import { IntentStep } from './steps/IntentStep'
import { AIStep } from './steps/AIStep'
import { MissionsStep } from './steps/MissionsStep'
import './Onboarding.css'

type OnboardingStep = 'welcome' | 'intent' | 'ai' | 'missions'

export const Onboarding: React.FC = () => {
  const { onboardingOpen, setOnboardingOpen, setOnboardingCompleted, setUserProfile, applyProfileDefaults } = useUIStore()
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
    setOnboardingCompleted(true)
    setOnboardingOpen(false)
  }, [vaultPath, selectedProfile, finishWithVault, setOnboardingCompleted, setOnboardingOpen, setUserProfile, applyProfileDefaults])

  const handleOpenVaultDirect = useCallback(async () => {
    try {
      const result = await window.electronAPI.openVault()
      if (result) {
        await finishWithVault(result)
        setOnboardingCompleted(true)
        setOnboardingOpen(false)
      }
    } catch (error) {
      console.error('[Onboarding] Failed to open vault:', error)
    }
  }, [finishWithVault, setOnboardingCompleted, setOnboardingOpen])

  if (!onboardingOpen) return null

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
            onNext={() => setStep('ai')}
          />
        )}
        {step === 'ai' && (
          <AIStep
            onBack={() => setStep('intent')}
            onNext={() => setStep('missions')}
          />
        )}
        {step === 'missions' && (
          <MissionsStep
            onBack={() => setStep('ai')}
            onFinish={completeOnboarding}
            hasStarterVault={createdStarterVault}
          />
        )}
      </div>
    </div>
  )
}
