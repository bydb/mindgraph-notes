/**
 * LanguageTool Extension Types
 */

// Re-export the shared types for convenience
export interface LanguageToolMatch {
  message: string
  shortMessage: string
  offset: number
  length: number
  replacements: Array<{ value: string }>
  rule: {
    id: string
    category: { id: string; name: string }
  }
}

export interface LanguageToolResponse {
  matches: LanguageToolMatch[]
  language: {
    name: string
    code: string
    detectedLanguage?: {
      name: string
      code: string
    }
  }
}

// Error categories for styling
export type ErrorCategory = 'spelling' | 'grammar' | 'style' | 'typography'

// Map LanguageTool category IDs to our categories
export function getCategoryType(categoryId: string): ErrorCategory {
  const lowerCat = categoryId.toLowerCase()

  if (lowerCat.includes('typo') || lowerCat.includes('spell') || lowerCat === 'misspelling') {
    return 'spelling'
  }
  if (lowerCat.includes('grammar') || lowerCat.includes('syntax')) {
    return 'grammar'
  }
  if (lowerCat.includes('style') || lowerCat.includes('redundancy') || lowerCat.includes('misc')) {
    return 'style'
  }
  if (lowerCat.includes('typography') || lowerCat.includes('punctuation')) {
    return 'typography'
  }

  // Default to grammar for unknown categories
  return 'grammar'
}

// Extension state
export interface LanguageToolState {
  matches: LanguageToolMatch[]
  isChecking: boolean
  lastCheckedContent: string
}

// Popup match data (stored in decoration attributes)
export interface LanguageToolPopupMatch {
  message: string
  shortMessage: string
  replacements: Array<{ value: string }>
  category: ErrorCategory
  ruleId: string
  from: number
  to: number
}
