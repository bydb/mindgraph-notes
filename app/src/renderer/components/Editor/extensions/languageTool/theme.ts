import { EditorView } from '@codemirror/view'

/**
 * LanguageTool theme - CSS-in-JS styles for error underlines
 */
export const languageToolTheme = EditorView.theme({
  // Spelling errors - red wavy underline
  '.lt-error-spelling': {
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='6' height='3'%3E%3Cpath d='M0 3 L2 1 L4 3 L6 1' fill='none' stroke='%23ff453a' stroke-width='1'/%3E%3C/svg%3E")`,
    backgroundPosition: 'bottom',
    backgroundRepeat: 'repeat-x',
    paddingBottom: '2px',
  },

  // Grammar errors - blue wavy underline
  '.lt-error-grammar': {
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='6' height='3'%3E%3Cpath d='M0 3 L2 1 L4 3 L6 1' fill='none' stroke='%230a84ff' stroke-width='1'/%3E%3C/svg%3E")`,
    backgroundPosition: 'bottom',
    backgroundRepeat: 'repeat-x',
    paddingBottom: '2px',
  },

  // Style/typography errors - yellow wavy underline
  '.lt-error-style': {
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='6' height='3'%3E%3Cpath d='M0 3 L2 1 L4 3 L6 1' fill='none' stroke='%23ff9f0a' stroke-width='1'/%3E%3C/svg%3E")`,
    backgroundPosition: 'bottom',
    backgroundRepeat: 'repeat-x',
    paddingBottom: '2px',
  },

  // Typography errors - also yellow
  '.lt-error-typography': {
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='6' height='3'%3E%3Cpath d='M0 3 L2 1 L4 3 L6 1' fill='none' stroke='%23ff9f0a' stroke-width='1'/%3E%3C/svg%3E")`,
    backgroundPosition: 'bottom',
    backgroundRepeat: 'repeat-x',
    paddingBottom: '2px',
  },

  // Hover state for clickable errors
  '.lt-error-spelling:hover, .lt-error-grammar:hover, .lt-error-style:hover, .lt-error-typography:hover': {
    cursor: 'pointer',
    backgroundColor: 'rgba(255, 69, 58, 0.1)',
    borderRadius: '2px',
  },
})
