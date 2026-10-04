import React, { useState, useCallback, useEffect } from 'react'
import { useUIStore } from '../../stores/uiStore'
import type { UserProfile } from '../../stores/uiStore'
import { WelcomeScreen } from './WelcomeScreen'
import { IntentStep } from './steps/IntentStep'
import { AIStep } from './steps/AIStep'
import { DashboardStep } from './steps/DashboardStep'
import { MissionsStep } from './steps/MissionsStep'
import { EmailSetupStep } from './steps/EmailSetupStep'
import { FocusStep } from './steps/FocusStep'
import { useTranslation } from '../../utils/translations'
import type { WorkFocus } from '../../../shared/workFocus'
import './Onboarding.css'

type OnboardingStep = 'welcome' | 'focus' | 'focus-direct' | 'intent' | 'email-setup' | 'ai' | 'dashboard' | 'missions'

// Profile, für die der Email-Setup-Step im Onboarding eingeblendet wird. Andere
// Profile sollen den Step nicht sehen — sonst kommt der Demo-Pfad bei einem
// Studenten aus dem Tritt, wenn er kein IMAP-Account hat.
const EMAIL_SETUP_PROFILES = new Set(['office', 'professional'])

export const Onboarding: React.FC = () => {
  const { onboardingOpen, setOnboardingOpen, setOnboardingCompleted, setUserProfile, applyProfileDefaults, setWelcomeNotePending, setWorkFocus } = useUIStore()
  const { t } = useTranslation()
  const [step, setStep] = useState<OnboardingStep>('welcome')
  // Schwerpunkt: vorausgewählt aus dem Store (erneutes Onboarding behält ihn), gespeichert
  // erst beim Abschluss (docs/codex-collab/schwerpunkt-beim-einrichten.md §4, Codex F14/F21).
  const [selectedFocus, setSelectedFocus] = useState<WorkFocus>('notes')
  // Direktweg „Vault öffnen“: Pfad nur halten, bis der Schwerpunkt bestätigt ist (Codex F19).
  const [pendingDirectVault, setPendingDirectVault] = useState<string | null>(null)
  const [finishError, setFinishError] = useState<string | null>(null)
  const [finishing, setFinishing] = useState(false)
  const [vaultPath, setLocalVaultPath] = useState<string | null>(null)
  const [selectedProfile, setSelectedProfile] = useState<UserProfile>(null)
  const [createdStarterVault, setCreatedStarterVault] = useState(false)

  // Reset to first step when onboarding is reopened
  useEffect(() => {
    if (onboardingOpen) {
      setStep('welcome')
      setSelectedProfile(null)
      setSelectedFocus(useUIStore.getState().workFocus)
      setPendingDirectVault(null)
      setFinishError(null)
      // Vault-Wahl aus einem früheren Durchlauf gilt nicht weiter — sonst speichert „Fertig“
      // den alten Vault erneut als Start-Vault (Codex F32).
      setLocalVaultPath(null)
      setCreatedStarterVault(false)
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
        // Nicht still weitermachen: sonst startet die App beim nächsten Mal mit einem
        // anderen Vault als dem gerade eingerichteten (Codex F26).
        console.error('[Onboarding] Failed to set vault:', error)
        setFinishError(t('onboarding.focus.saveVaultFailed'))
        return
      }
    }
    setFinishError(null)
    setWorkFocus(selectedFocus)
    if (selectedProfile) {
      setUserProfile(selectedProfile)
      applyProfileDefaults(selectedProfile)
    }
    setWelcomeNotePending(true)
    setOnboardingCompleted(true)
    setOnboardingOpen(false)
  }, [vaultPath, selectedProfile, selectedFocus, finishWithVault, setOnboardingCompleted, setOnboardingOpen, setUserProfile, applyProfileDefaults, setWelcomeNotePending, setWorkFocus, t])

  const handleOpenVaultDirect = useCallback(async () => {
    try {
      const result = await window.electronAPI.openVault()
      if (result) {
        setPendingDirectVault(result)
        setFinishError(null)
        setStep('focus-direct')
      }
    } catch (error) {
      console.error('[Onboarding] Failed to open vault:', error)
    }
  }, [])

  // Erst hier wird der Direktweg wirksam: letzter Vault, Schwerpunkt, Abschluss.
  const finishDirect = useCallback(async () => {
    if (!pendingDirectVault || finishing) return
    setFinishing(true)
    try {
      await finishWithVault(pendingDirectVault)
    } catch (error) {
      console.error('[Onboarding] Failed to set vault:', error)
      setFinishError(t('onboarding.focus.saveVaultFailed'))
      setFinishing(false)
      return
    }
    setFinishing(false)
    setWorkFocus(selectedFocus)
    setWelcomeNotePending(true)
    setOnboardingCompleted(true)
    setOnboardingOpen(false)
  }, [pendingDirectVault, finishing, selectedFocus, finishWithVault, setWorkFocus, setWelcomeNotePending, setOnboardingCompleted, setOnboardingOpen, t])

  if (!onboardingOpen) return null

  // Schrittzähler: office/professional durchlaufen zusätzlich den E-Mail-Setup-Step,
  // also 5 statt 4 Schritte. Die Anzeige muss dem realen Pfad folgen.
  const hasEmailStep = !!selectedProfile && EMAIL_SETUP_PROFILES.has(selectedProfile)
  const totalSteps = hasEmailStep ? 6 : 5
  const stepNumbers: Record<Exclude<OnboardingStep, 'welcome' | 'focus-direct'>, number> = {
    focus: 1,
    intent: 2,
    'email-setup': 3,
    ai: hasEmailStep ? 4 : 3,
    dashboard: hasEmailStep ? 5 : 4,
    missions: hasEmailStep ? 6 : 5
  }

  return (
    <div className="onboarding-overlay">
      <div className="onboarding-container">
        {step === 'welcome' && (
          <WelcomeScreen
            onStartWizard={() => setStep('focus')}
            onOpenVault={handleOpenVaultDirect}
          />
        )}
        {step === 'focus' && (
          <FocusStep
            value={selectedFocus}
            onChange={setSelectedFocus}
            onBack={() => setStep('welcome')}
            onNext={() => setStep('intent')}
            stepNumber={stepNumbers.focus}
            totalSteps={totalSteps}
          />
        )}
        {step === 'focus-direct' && (
          <FocusStep
            value={selectedFocus}
            onChange={setSelectedFocus}
            onBack={() => { setPendingDirectVault(null); setFinishError(null); setStep('welcome') }}
            onNext={finishDirect}
            showAgentHint
            nextLabel={t('onboarding.focus.finish')}
            error={finishError}
            busy={finishing}
          />
        )}
        {step === 'intent' && (
          <IntentStep
            selectedProfile={selectedProfile}
            onSelectProfile={setSelectedProfile}
            vaultPath={vaultPath}
            setVaultPath={handleSetVaultPath}
            onBack={() => setStep('focus')}
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
            showAgentHint={selectedFocus === 'agent'}
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
        {step === 'missions' && finishError && (
          <div className="onboarding-ai-hint onboarding-error" role="alert">{finishError}</div>
        )}
        {step === 'missions' && (
          <MissionsStep
            onBack={() => setStep('dashboard')}
            onFinish={completeOnboarding}
            hasStarterVault={createdStarterVault}
            agentFocus={selectedFocus === 'agent'}
            stepNumber={stepNumbers.missions}
            totalSteps={totalSteps}
          />
        )}
      </div>
    </div>
  )
}
