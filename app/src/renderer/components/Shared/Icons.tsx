// Zentrale SVG-Icon-Sammlung für UI-Chrome.
// Bewusst inline (keine Library-Abhängigkeit). Alle Icons übernehmen
// stroke="currentColor" und nutzen `width`/`height` Props, damit sie sich
// in jeden Header / Button-Kontext einfügen.

import React from 'react'

interface IconProps {
  size?: number
  className?: string
  // Optionaler Stroke-Override (Default: currentColor).
  stroke?: string
  // Optionales Fill (Default: none).
  fill?: string
}

function svgProps({ size = 16, className, stroke = 'currentColor', fill = 'none' }: IconProps): React.SVGProps<SVGSVGElement> {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill,
    stroke,
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
    className
  }
}

// ─── Workflow Module Icons ────────────────────────────────────────────

export const IconMail: React.FC<IconProps> = (p) => (
  <svg {...svgProps(p)}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M3 7l9 6 9-6" />
  </svg>
)

export const IconFolder: React.FC<IconProps> = (p) => (
  <svg {...svgProps(p)}>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
  </svg>
)

export const IconBrain: React.FC<IconProps> = (p) => (
  <svg {...svgProps(p)}>
    <path d="M9 4a3 3 0 0 0-3 3v1a3 3 0 0 0-2 5 3 3 0 0 0 2 5v1a3 3 0 0 0 3 3" />
    <path d="M15 4a3 3 0 0 1 3 3v1a3 3 0 0 1 2 5 3 3 0 0 1-2 5v1a3 3 0 0 1-3 3" />
    <path d="M9 8h.01M15 8h.01M9 16h.01M15 16h.01" />
  </svg>
)

export const IconDocument: React.FC<IconProps> = (p) => (
  <svg {...svgProps(p)}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="8" y1="13" x2="16" y2="13" />
    <line x1="8" y1="17" x2="13" y2="17" />
  </svg>
)

export const IconUser: React.FC<IconProps> = (p) => (
  <svg {...svgProps(p)}>
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
)

export const IconCalendar: React.FC<IconProps> = (p) => (
  <svg {...svgProps(p)}>
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
)

export const IconGraduation: React.FC<IconProps> = (p) => (
  <svg {...svgProps(p)}>
    <path d="M22 10L12 5 2 10l10 5 10-5z" />
    <path d="M6 12v5a6 3 0 0 0 12 0v-5" />
  </svg>
)

export const IconBox: React.FC<IconProps> = (p) => (
  <svg {...svgProps(p)}>
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
    <line x1="12" y1="22.08" x2="12" y2="12" />
  </svg>
)

// ─── Status- und Action-Icons ─────────────────────────────────────────

export const IconWarning: React.FC<IconProps> = (p) => (
  <svg {...svgProps(p)}>
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
)

export const IconLock: React.FC<IconProps> = (p) => (
  <svg {...svgProps(p)}>
    <rect x="3" y="11" width="18" height="11" rx="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
)

export const IconShield: React.FC<IconProps> = (p) => (
  <svg {...svgProps(p)}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
)

export const IconCloud: React.FC<IconProps> = (p) => (
  <svg {...svgProps(p)}>
    <path d="M17.5 19a4.5 4.5 0 1 0-1.4-8.78A6 6 0 1 0 6 16.5" />
  </svg>
)

export const IconFlag: React.FC<IconProps> = (p) => (
  <svg {...svgProps(p)}>
    <path d="M4 22V4l8 4 8-4v12l-8 4-8-4z" />
  </svg>
)

export const IconRefresh: React.FC<IconProps> = (p) => (
  <svg {...svgProps(p)}>
    <polyline points="23 4 23 10 17 10" />
    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
  </svg>
)

export const IconTag: React.FC<IconProps> = (p) => (
  <svg {...svgProps(p)}>
    <path d="M20.59 13.41 13.41 20.6a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.83z" />
    <line x1="7" y1="7" x2="7.01" y2="7" />
  </svg>
)

export const IconTrash: React.FC<IconProps> = (p) => (
  <svg {...svgProps(p)}>
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6M14 11v6" />
    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
  </svg>
)

export const IconClipboard: React.FC<IconProps> = (p) => (
  <svg {...svgProps(p)}>
    <rect x="8" y="2" width="8" height="4" rx="1" />
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
  </svg>
)
