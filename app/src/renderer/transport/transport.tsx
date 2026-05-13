import React from 'react'
import ReactDOM from 'react-dom/client'
import TransportApp from './TransportApp'
import { initializeUISettings } from '../stores/uiStore'

async function bootstrap(): Promise<void> {
  await initializeUISettings()

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <TransportApp />
    </React.StrictMode>
  )
}

void bootstrap()
