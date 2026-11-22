import { rememberRemoteOllamaModels } from '../../shared/modelCompatibility'
import { withoutCloudModels } from '../../shared/chatModels'
import { useUIStore } from '../stores/uiStore'

/**
 * Lädt die Ollama-Modellliste und meldet Cloud-Modelle mit neutralem Namen (`remote_host`/
 * `remote_model`) an, damit `isCloudModel` sie überall in der Oberfläche als Cloud kennzeichnet
 * (11/2026). Bei „KI nur auf diesem Rechner" fallen Ollama-Cloud-Modelle danach ganz aus der
 * Liste — alle Auswahlen (Einstellungen, Notiz-Chat, Petrol-Chat, Agent, Editor-KI, Onboarding)
 * zeigen sie dann nicht mehr. Alle Stellen, die die Liste laden, sollen diesen Helfer nutzen.
 */
export async function loadOllamaModels(): ReturnType<typeof window.electronAPI.ollamaModels> {
  const models = await window.electronAPI.ollamaModels()
  if (!Array.isArray(models)) return models
  // Erst ALLE anmelden (Kennzeichnung), dann filtern.
  rememberRemoteOllamaModels(models)
  return withoutCloudModels(models, useUIStore.getState().ollama.localOnly === true)
}
