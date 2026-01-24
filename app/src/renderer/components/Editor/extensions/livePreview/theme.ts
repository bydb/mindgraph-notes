import { EditorView } from '@codemirror/view'

/**
 * Live Preview theme - CSS-in-JS styles for formatted markdown elements
 */
export const livePreviewTheme = EditorView.theme({
  // Headers
  '.lp-header-1': {
    fontSize: '2em',
    fontWeight: 'bold',
    lineHeight: '1.3',
  },
  '.lp-header-2': {
    fontSize: '1.5em',
    fontWeight: 'bold',
    lineHeight: '1.3',
  },
  '.lp-header-3': {
    fontSize: '1.25em',
    fontWeight: 'bold',
    lineHeight: '1.3',
  },
  '.lp-header-4': {
    fontSize: '1.1em',
    fontWeight: 'bold',
    lineHeight: '1.3',
  },
  '.lp-header-5': {
    fontSize: '1em',
    fontWeight: 'bold',
    lineHeight: '1.3',
  },
  '.lp-header-6': {
    fontSize: '0.9em',
    fontWeight: 'bold',
    lineHeight: '1.3',
  },

  // Inline formatting
  '.lp-bold': {
    fontWeight: 'bold',
  },
  '.lp-italic': {
    fontStyle: 'italic',
  },
  '.lp-strikethrough': {
    textDecoration: 'line-through',
  },
  '.lp-inline-code': {
    fontFamily: '"JetBrains Mono", "SF Mono", Monaco, Menlo, monospace',
    fontSize: '0.9em',
    backgroundColor: 'var(--bg-tertiary)',
    padding: '2px 6px',
    borderRadius: '4px',
  },

  // Links
  '.lp-link': {
    color: 'var(--accent-color)',
    textDecoration: 'none',
    cursor: 'pointer',
    '&:hover': {
      textDecoration: 'underline',
    },
  },

  // Wikilinks
  '.lp-wikilink': {
    color: 'var(--accent-color)',
    textDecoration: 'none',
    cursor: 'pointer',
    '&:hover': {
      textDecoration: 'underline',
    },
  },

  // Tags
  '.lp-tag': {
    display: 'inline-block',
    backgroundColor: 'var(--accent-color)',
    color: 'white',
    padding: '1px 6px',
    borderRadius: '4px',
    fontSize: '0.85em',
    fontWeight: '500',
  },

  // Blockquotes
  '.lp-blockquote': {
    borderLeft: '3px solid var(--accent-color)',
    paddingLeft: '12px',
    color: 'var(--text-secondary)',
  },

  // Callouts container
  '.lp-callout': {
    display: 'block',
    backgroundColor: 'rgba(10, 132, 255, 0.1)',
    borderLeft: '4px solid var(--accent-color)',
    borderRadius: '4px',
    padding: '8px 12px',
    margin: '4px 0',
  },
  '.lp-callout-note': {
    borderLeftColor: '#0a84ff',
    backgroundColor: 'rgba(10, 132, 255, 0.1)',
  },
  '.lp-callout-tip': {
    borderLeftColor: '#30d158',
    backgroundColor: 'rgba(48, 209, 88, 0.1)',
  },
  '.lp-callout-warning': {
    borderLeftColor: '#ff9f0a',
    backgroundColor: 'rgba(255, 159, 10, 0.1)',
  },
  '.lp-callout-danger': {
    borderLeftColor: '#ff453a',
    backgroundColor: 'rgba(255, 69, 58, 0.1)',
  },
  '.lp-callout-info': {
    borderLeftColor: '#64d2ff',
    backgroundColor: 'rgba(100, 210, 255, 0.1)',
  },
  '.lp-callout-question': {
    borderLeftColor: '#bf5af2',
    backgroundColor: 'rgba(191, 90, 242, 0.1)',
  },
  '.lp-callout-example': {
    borderLeftColor: '#ac8e68',
    backgroundColor: 'rgba(172, 142, 104, 0.1)',
  },
  '.lp-callout-quote': {
    borderLeftColor: '#8e8e93',
    backgroundColor: 'rgba(142, 142, 147, 0.1)',
  },

  // Horizontal rules
  '.lp-hr': {
    display: 'block',
    height: '2px',
    backgroundColor: 'var(--border-color)',
    border: 'none',
    margin: '16px 0',
  },

  // Task checkboxes
  '.lp-checkbox': {
    display: 'inline-block',
    width: '16px',
    height: '16px',
    verticalAlign: 'middle',
    marginRight: '6px',
    cursor: 'pointer',
    accentColor: 'var(--accent-color)',
  },
  '.lp-task-checked': {
    textDecoration: 'line-through',
    color: 'var(--text-secondary)',
  },

  // Hidden syntax markers
  '.lp-hidden': {
    display: 'none',
  },
})
