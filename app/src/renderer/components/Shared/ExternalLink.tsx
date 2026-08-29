import type { ReactNode } from 'react'

// Der einzige zugelassene Weg aus der App ins Netz.
//
// `target="_blank"` ist bewusst KEINE Option mehr: window.open lief bei mainWindow
// über setWindowOpenHandler, und der reichte http(s) an shell.openExternal weiter.
// Der Handler kann aber nicht erkennen, WER das Fenster öffnen wollte — gemessen am
// 29.08.2026 liefern ein Popup aus dem App-Dokument und eines aus einem sandboxed
// iframe identische HandlerDetails, referrer.url ist in beiden Fällen leer. Damit
// konnte die HTML-Vorschau für Vault-Dateien beliebige URLs im Standardbrowser
// öffnen, ohne dass jemand klickt. Der Handler verweigert deshalb jetzt
// bedingungslos (main/index.ts), und der bewusste Weg nach draußen ist der IPC
// `open-external` — den kapselt diese Komponente.
export function ExternalLink({
  href,
  children,
  className,
  title
}: {
  href: string
  children: ReactNode
  className?: string
  title?: string
}) {
  return (
    <a
      href={href}
      className={className}
      title={title}
      onClick={(e) => {
        e.preventDefault()
        window.electronAPI?.openExternal?.(href)
      }}
    >
      {children}
    </a>
  )
}
