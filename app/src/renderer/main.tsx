import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ensureRendererPlugins } from './plugins/slots'

// Renderer-Plugins eager initialisieren: lädt alle `renderer/index.tsx` und damit deren
// Modul-Seiteneffekte (z.B. edoobox-Bridge-Provider), bevor Core-Konsumenten sie abfragen.
ensureRendererPlugins()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
