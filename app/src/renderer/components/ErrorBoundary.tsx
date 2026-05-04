import React from 'react'

interface Props {
  children: React.ReactNode
  fallback?: React.ReactNode
  label?: string
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error(`[ErrorBoundary${this.props.label ? ` ${this.props.label}` : ''}]`, error, info)
  }

  reset = () => this.setState({ error: null })

  render() {
    if (!this.state.error) return this.props.children
    if (this.props.fallback) return this.props.fallback
    return (
      <div style={{
        padding: '12px 14px',
        margin: 8,
        border: '1px solid var(--border-color, #ddd)',
        borderRadius: 8,
        background: 'var(--bg-secondary, #fafafa)',
        color: 'var(--text-secondary, #666)',
        fontSize: 13
      }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>
          {this.props.label || 'Widget'} konnte nicht gerendert werden
        </div>
        <div style={{ marginBottom: 8, fontFamily: 'ui-monospace, monospace', fontSize: 12, opacity: 0.8 }}>
          {this.state.error.message}
        </div>
        <button onClick={this.reset} style={{
          padding: '4px 10px',
          fontSize: 12,
          border: '1px solid var(--border-color, #ddd)',
          borderRadius: 4,
          background: 'transparent',
          cursor: 'pointer'
        }}>Erneut versuchen</button>
      </div>
    )
  }
}
