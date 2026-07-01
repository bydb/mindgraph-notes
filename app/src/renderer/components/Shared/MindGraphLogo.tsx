import React from 'react'

interface MindGraphLogoProps {
  /** Rendered pixel size (viewBox is fixed 32×32). Default 22 (title bar). */
  size?: number
  className?: string
  /** Optional class on the edge <g> — used by the onboarding draw-in animation. */
  edgesClassName?: string
  /** Optional class on the node <g> — used by the onboarding draw-in animation. */
  nodesClassName?: string
}

/**
 * MindGraph-Wortmarke (Petrol-Redesign, Stage 1b): 4-Node-Graph-Tile.
 * Abgerundetes Quadrat, gefüllt mit dem Akzent (`--accent-color`) → recolort automatisch
 * pro Theme/Release. Innen ein weißer Knoten-Graph (Hub + 3 Satelliten). Die Marks nutzen
 * `--accent-on` (weiß hell / #06302e dunkel), damit sie auch auf dem hellen Dark-Mode-Teal
 * lesbar bleiben. Exakte Geometrie aus `docs/design/petrol-handoff/MindGraph Logo.dc.html`
 * (Richtung „1a Tile").
 */
export const MindGraphLogo: React.FC<MindGraphLogoProps> = ({
  size = 22,
  className,
  edgesClassName,
  nodesClassName
}) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true">
    <rect width="32" height="32" rx="8" fill="var(--accent-color)" />
    <g stroke="var(--accent-on)" strokeWidth={1.5} strokeLinecap="round" className={edgesClassName}>
      <line x1="16" y1="16" x2="16" y2="7.5" />
      <line x1="16" y1="16" x2="8" y2="23" />
      <line x1="16" y1="16" x2="24" y2="23" />
      <line x1="8" y1="23" x2="24" y2="23" />
    </g>
    <g fill="var(--accent-on)" className={nodesClassName}>
      <circle cx="16" cy="16" r="3" />
      <circle cx="16" cy="7.5" r="2.3" />
      <circle cx="8" cy="23" r="2.3" />
      <circle cx="24" cy="23" r="2.3" />
    </g>
  </svg>
)
