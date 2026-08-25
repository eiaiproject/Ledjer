// Sentry must initialize before any other code - keep this import FIRST
import './instrument.ts'
import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { reactErrorHandler } from '@sentry/react'
import './index.css'
import App from './App.tsx'
import { setupOfflineSync } from '@/lib/pwa/offline-drafts'

// P4.3: Wire up offline draft sync
export function PwaBootstrap() {
  useEffect(() => {
    const cleanup = setupOfflineSync();
    return cleanup;
  }, []);
  return null;
}

// P4.3: Register service worker for PWA support (caching, offline, push)
if ('serviceWorker' in navigator) {
  const swUrl = '/sw.js';
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(swUrl).then((registration) => {
      // Check for updates on page load
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // New version available - show update notification
              console.log('Update tersedia. Refresh untuk versi terbaru.');
            }
          });
        }
      });
    }).catch(() => {
      // Service worker registration failed - app works without it
      console.warn('Service worker registration failed');
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
    <PwaBootstrap />
    <App />
  </StrictMode>,
)
