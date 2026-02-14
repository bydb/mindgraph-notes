import React, { useState, useCallback } from 'react'
import { useUIStore } from '../../stores/uiStore'
import type { UserProfile } from '../../stores/uiStore'
import { WelcomeScreen } from './WelcomeScreen'
import { ProfileStep } from './steps/ProfileStep'
import { VaultStep } from './steps/VaultStep'
import { AISetupStep } from './steps/AISetupStep'
import { FeaturesStep } from './steps/FeaturesStep'
import './Onboarding.css'

type OnboardingStep = 'welcome' | 'profile' | 'vault' | 'ai' | 'features'

export const Onboarding: React.FC = () => {
  const { onboardingOpen, setOnboardingOpen, setOnboardingCompleted, setUserProfile, applyProfileDefaults } = useUIStore()
  const [step, setStep] = useState<OnboardingStep>('welcome')
  const [vaultPath, setLocalVaultPath] = useState<string | null>(null)
  const [selectedProfile, setSelectedProfile] = useState<UserProfile>(null)

  const finishWithVault = useCallback(async (path: string) => {
    // Save as last vault — Sidebar will load it when onboardingCompleted becomes true
    await window.electronAPI.setLastVault(path)
  }, [])

  const completeOnboarding = useCallback(async () => {
    if (vaultPath) {
      try {
        await finishWithVault(vaultPath)
      } catch (error) {
        console.error('[Onboarding] Failed to set vault:', error)
      }
    }
    // Apply profile defaults before completing
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
            onStartWizard={() => setStep('profile')}
            onOpenVault={handleOpenVaultDirect}
          />
        )}
        {step === 'profile' && (
          <ProfileStep
            selectedProfile={selectedProfile}
            onSelectProfile={setSelectedProfile}
            onBack={() => setStep('welcome')}
            onNext={() => setStep('vault')}
          />
        )}
        {step === 'vault' && (
          <VaultStep
            vaultPath={vaultPath}
            setVaultPath={setLocalVaultPath}
            onBack={() => setStep('profile')}
            onNext={() => setStep('ai')}
          />
        )}
        {step === 'ai' && (
          <AISetupStep
            onBack={() => setStep('vault')}
            onNext={() => setStep('features')}
          />
        )}
        {step === 'features' && (
          <FeaturesStep
            onBack={() => setStep('ai')}
            onFinish={completeOnboarding}
          />
        )}
      </div>
    </div>
  )
}
