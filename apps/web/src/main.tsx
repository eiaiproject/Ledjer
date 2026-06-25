import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import * as Sentry from '@sentry/react'
import './index.css'
import App from './App.tsx'
import { getSupabaseConfigError } from './lib/supabase.ts'
import { ConfigError } from './components/config-error.tsx'

if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration(),
    ],
    tracesSampleRate: 0.1,  // ponytail: raise to 1.0 for initial launch debugging, then lower
    replaysSessionSampleRate: 0.05,
    replaysOnErrorSampleRate: 1.0,
  });
}

const configError = getSupabaseConfigError()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {configError ? <ConfigError message={configError} /> : <App />}
  </StrictMode>,
)
