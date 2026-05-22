import React, { useState, useCallback, useEffect } from 'react'
import { useUIStore } from '../../stores/uiStore'
import type { UserProfile } from '../../stores/uiStore'
import { useCoachStore } from '../../stores/coachStore'
import { WelcomeScreen } from './WelcomeScreen'
import { IntentStep } from './steps/IntentStep'
import { AIStep } from './steps/AIStep'
import { DashboardStep } from './steps/DashboardStep'
import { MissionsStep } from './steps/MissionsStep'
import { OllamaSetupStep } from './steps/OllamaSetupStep'
import { CoachStep } from './Coach/CoachStep'
import './Onboarding.css'

type OnboardingStep = 'welcome' | 'ai-setup' | 'coach' | 'intent' | 'ai' | 'dashboard' | 'missions'

export const Onboarding: React.FC = () => {
  const { onboardingOpen, setOnboardingOpen, setOnboardingCompleted, setUserProfile, applyProfileDefaults, coach } = useUIStore()
  const resetCoachStore = useCoachStore(s => s.reset)
  const [step, setStep] = useState<OnboardingStep>('welcome')
  const [vaultPath, setLocalVaultPath] = useState<string | null>(null)
  const [selectedProfile, setSelectedProfile] = useState<UserProfile>(null)
  const [createdStarterVault, setCreatedStarterVault] = useState(false)

  // Reset to first step when onboarding is reopened
  useEffect(() => {
    if (onboardingOpen) {
      setStep('welcome')
      setSelectedProfile(null)
      resetCoachStore()
    }
  }, [onboardingOpen, resetCoachStore])

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

  const handleStartCoach = useCallback(async () => {
    // Bevor wir in den Coach-Chat springen, prüfen wir, ob überhaupt ein
    // Backend da ist. Sonst landet der User in einer Fehlermeldung.
    try {
      const pre = await window.electronAPI.coachPrecheck()
      if (pre.backend === 'none') {
        setStep('ai-setup')
        return
      }
    } catch {
      // Precheck-Fehler: lieber den Setup-Pfad anbieten als blind weiterspringen
      setStep('ai-setup')
      return
    }
    setStep('coach')
  }, [])

  const handleSkipCoach = useCallback(() => {
    setStep('intent')
  }, [])

  // Aus dem AI-Setup heraus: Backend ist jetzt da → in den Coach
  const handleBackendReady = useCallback(() => {
    setStep('coach')
  }, [])

  // Aus dem AI-Setup heraus: bewusst ohne KI → klassischer Wizard
  const handleSkipAISetup = useCallback(() => {
    setStep('intent')
  }, [])

  const handleCoachFinish = useCallback(() => {
    // Coach hat (möglicherweise) Vault + Profile vorbelegt. Übergabe an IntentStep:
    if (coach.suggestedProfile) {
      setSelectedProfile(coach.suggestedProfile)
    }
    setStep('intent')
  }, [coach.suggestedProfile])

  if (!onboardingOpen) return null

  return (
    <div className="onboarding-overlay">
      <div className="onboarding-container">
        {step === 'welcome' && (
          <WelcomeScreen
            onStartCoach={handleStartCoach}
            onStartWizard={() => setStep('intent')}
            onOpenVault={handleOpenVaultDirect}
          />
        )}
        {step === 'ai-setup' && (
          <OllamaSetupStep
            onBackendReady={handleBackendReady}
            onSkip={handleSkipAISetup}
            onBack={() => setStep('welcome')}
          />
        )}
        {step === 'coach' && (
          <CoachStep
            vaultPath={vaultPath}
            onVaultChosen={handleSetVaultPath}
            onSkipToClassic={handleSkipCoach}
            onFinish={handleCoachFinish}
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
            coachPreFilled={coach.suggestedProfile !== null || vaultPath !== null}
          />
        )}
        {step === 'ai' && (
          <AIStep
            onBack={() => setStep('intent')}
            onNext={() => setStep('dashboard')}
          />
        )}
        {step === 'dashboard' && (
          <DashboardStep
            profile={selectedProfile}
            onBack={() => setStep('ai')}
            onNext={() => setStep('missions')}
          />
        )}
        {step === 'missions' && (
          <MissionsStep
            onBack={() => setStep('dashboard')}
            onFinish={completeOnboarding}
            hasStarterVault={createdStarterVault}
          />
        )}
      </div>
    </div>
  )
}
