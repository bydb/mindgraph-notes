import { isHumanFavorite, isMlxModel } from '../../../shared/modelCompatibility'

// Echte Inline-SVG-Marker statt Emoji (🍎/⭐) — passt zum cleanen Look und
// rendert auf jeder Plattform identisch.

export function AppleLogo({ size = 13 }: { size?: number }) {
  // Klassisches Apple-Logo (monochrom, currentColor).
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.05 12.04c-.03-2.7 2.2-3.99 2.3-4.06-1.25-1.84-3.2-2.09-3.9-2.12-1.66-.17-3.24.97-4.08.97-.84 0-2.14-.95-3.52-.92-1.81.03-3.48 1.05-4.41 2.67-1.88 3.27-.48 8.11 1.35 10.77.9 1.3 1.97 2.76 3.38 2.71 1.36-.05 1.87-.88 3.51-.88 1.64 0 2.1.88 3.53.85 1.46-.03 2.38-1.32 3.27-2.63 1.03-1.51 1.46-2.97 1.48-3.05-.03-.01-2.84-1.09-2.87-4.32M14.4 4.5c.74-.9 1.24-2.15 1.1-3.4-1.07.04-2.36.71-3.13 1.61-.69.79-1.29 2.06-1.13 3.27 1.19.09 2.41-.6 3.16-1.48" />
    </svg>
  )
}

export function StarIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2l2.9 6.26 6.1.53-4.6 4.04 1.37 6.17L12 16.9l-5.77 3.1L7.6 12.83 3 8.79l6.1-.53z" />
    </svg>
  )
}

interface Props {
  model: string
  size?: number
}

/** Apple-Logo (MLX/Apple-Silicon) + Stern (Entwickler-Favorit) als Icons. */
export function ModelMarkers({ model, size = 13 }: Props) {
  const mlx = isMlxModel(model)
  const fav = isHumanFavorite(model)
  if (!mlx && !fav) return null
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
      {mlx && (
        <span title="Apple-Silicon-optimiert (MLX)" style={{ display: 'inline-flex', color: 'var(--text-secondary)' }}>
          <AppleLogo size={size} />
        </span>
      )}
      {fav && (
        <span title="Entwickler-Favorit" style={{ display: 'inline-flex', color: '#e0a106' }}>
          <StarIcon size={Math.round(size * 0.92)} />
        </span>
      )}
    </span>
  )
}
