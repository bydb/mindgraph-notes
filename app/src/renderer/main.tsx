import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ensureRendererPlugins } from './plugins/slots'
import { ensurePluginWorkflowActions } from './plugins/workflowActions'

// Renderer-Plugins eager initialisieren: lädt alle `renderer/index.tsx` und damit deren
// Modul-Seiteneffekte (z.B. edoobox-Bridge-Provider), bevor Core-Konsumenten sie abfragen.
ensureRendererPlugins()
// Plugin-Workflow-Bausteine in die Registry einspielen, bevor die Palette zum ersten Mal rendert.
ensurePluginWorkflowActions()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
