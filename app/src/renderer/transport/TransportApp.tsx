import React from 'react'
import TransportCapture from './TransportCapture'
import './TransportApp.css'

export default function TransportApp(): React.ReactElement {
  return (
    <div className="transport-app">
      <div className="transport-titlebar">
        <span className="transport-title">Quick Capture</span>
      </div>
      <TransportCapture />
    </div>
  )
}
