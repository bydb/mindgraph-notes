import React from 'react'
import type { VaultFileKind } from '../../../shared/fileLinkTarget'

/** Kleines Symbol je Dateiart für Link-Vorschlagslisten (statt Emoji). */
export const FileKindIcon: React.FC<{ kind: VaultFileKind | 'create' }> = ({ kind }) => {
  const common = { width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }
  switch (kind) {
    case 'create':
      return <svg {...common}><path d="M8 3v10M3 8h10" /></svg>
    case 'image':
      return <svg {...common}><rect x="2" y="3" width="12" height="10" rx="1.5" /><circle cx="6" cy="6.5" r="1.2" /><path d="M2.5 12l3.5-3.5 2.5 2.5 2-2 3 3" /></svg>
    case 'pdf':
      return <svg {...common}><path d="M4 1.5h5.5L13 5v9.5H4z" /><path d="M9.5 1.5V5H13" /><path d="M6 9h5M6 11.5h3.5" strokeWidth={2} /></svg>
    case 'office':
      return <svg {...common}><rect x="2.5" y="2.5" width="11" height="11" rx="1.5" /><path d="M2.5 6.5h11M2.5 10h11M6.5 6.5v7" /></svg>
    case 'note':
      return <svg {...common}><path d="M4 1.5h5.5L13 5v9.5H4z" /><path d="M9.5 1.5V5H13" /><path d="M6 8h5M6 10.5h5" /></svg>
    default:
      return <svg {...common}><path d="M4 1.5h5.5L13 5v9.5H4z" /><path d="M9.5 1.5V5H13" /></svg>
  }
}
