// safeStorage als Schlüssel für gespeicherte Petrol-Gespräche (Rev. 2 Punkt 2, Rev. 8 Schritt 2).
//
// Unter Linux meldet Chromium auf unbekannten Desktops (Hyprland, Sway) den Klartext-Speicher
// `basic_text`. Dann wird NICHT gespeichert — die App setzt dafür zwar `--password-store`
// (shared/linuxPasswordStore.ts), aber greift das nicht, soll kein Gespräch im Klartext landen.

import { app, safeStorage } from 'electron'
import path from 'path'
import { PetrolChatStorage, type ChatCrypto, type ChatStorageUnavailable } from './storage'

export function electronChatCrypto(): ChatCrypto {
  return {
    unavailableReason(): ChatStorageUnavailable | null {
      if (!safeStorage.isEncryptionAvailable()) return 'no-encryption'
      if (process.platform === 'linux') {
        try {
          if (safeStorage.getSelectedStorageBackend() === 'basic_text') return 'basic-text'
        } catch {
          return 'basic-text'
        }
      }
      return null
    },
    encrypt: plain => safeStorage.encryptString(plain),
    decrypt: data => safeStorage.decryptString(data)
  }
}

let storage: PetrolChatStorage | null = null

/** Eine Ablage je Prozess, unter `userData/petrol-chats` (erst nach app.ready aufrufen). */
export function petrolChatStorage(): PetrolChatStorage {
  if (!storage) storage = new PetrolChatStorage(path.join(app.getPath('userData'), 'petrol-chats'), electronChatCrypto())
  return storage
}
