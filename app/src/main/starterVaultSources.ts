// Welche gebündelten Ordner ein Starter-Vault je Variante bekommt — in dieser Reihenfolge
// kopiert, spätere überschreiben frühere. Pur, getestet (ohne Electron).
//
// `school` (Profil Schulverwaltung, 11/2026): Büro-Vault + eigene Willkommensnotiz. Die Vorlagen
// werden bewusst NICHT doppelt gepflegt; der Overlay-Ordner enthält nur, was sich unterscheidet.
export function starterVaultSources(variant: string): string[] {
  switch (variant) {
    case 'office': return ['starter-vault-office']
    case 'school': return ['starter-vault-office', 'starter-vault-school']
    case 'demo': return ['starter-vault-demo']
    case 'en': return ['starter-vault-en']
    default: return ['starter-vault']
  }
}
