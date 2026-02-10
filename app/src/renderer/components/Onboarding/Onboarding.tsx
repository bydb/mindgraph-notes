import React, { useState, useCallback } from 'react'
import { useUIStore } from '../../stores/uiStore'
import { WelcomeScreen } from './WelcomeScreen'
import { VaultStep } from './steps/VaultStep'
import { AISetupStep } from './steps/AISetupStep'
import { FeaturesStep } from './steps/FeaturesStep'
import './Onboarding.css'

type OnboardingStep = 'welcome' | 'vault' | 'ai' | 'features'

export const Onboarding: React.FC = () => {
  const { onboardingOpen, setOnboardingOpen, setOnboardingCompleted } = useUIStore()
  const [step, setStep] = useState<OnboardingStep>('welcome')
  const [vaultPath, setLocalVaultPath] = useState<string | null>(null)

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
    setOnboardingCompleted(true)
    setOnboardingOpen(false)
  }, [vaultPath, finishWithVault, setOnboardingCompleted, setOnboardingOpen])

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
            onStartWizard={() => setStep('vault')}
            onOpenVault={handleOpenVaultDirect}
          />
        )}
        {step === 'vault' && (
          <VaultStep
            vaultPath={vaultPath}
            setVaultPath={setLocalVaultPath}
            onBack={() => setStep('welcome')}
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
