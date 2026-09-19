// Sentry must initialize before any other code - keep this import FIRST
import './instrument.ts'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { reactErrorHandler } from '@sentry/react'
import './index.css'
import App from './App.tsx'

// PWA offline shell — register SW untuk installable + cache shell (Fase 6)
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // SW gagal (mis. http tanpa secure context) — app tetap jalan online-only
    });
  });
}

// React 19+ error handling via createRoot options
createRoot(document.getElementById('root')!, {
  onUncaughtError: reactErrorHandler(),
  onCaughtError: reactErrorHandler(),
  onRecoverableError: reactErrorHandler(),
}).render(
  <StrictMode>
    <App />
  </StrictMode>,
)