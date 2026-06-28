// Sentry must initialize before any other code — keep this import FIRST
import './instrument.ts'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { reactErrorHandler } from '@sentry/react'
import './index.css'
import App from './App.tsx'
import { getSupabaseConfigError } from './lib/supabase.ts'
import { ConfigError } from './components/config-error.tsx'

const configError = getSupabaseConfigError()

// React 19+ error handling via createRoot options
createRoot(document.getElementById('root')!, {
  onUncaughtError: reactErrorHandler(),
  onCaughtError: reactErrorHandler(),
  onRecoverableError: reactErrorHandler(),
}).render(
  <StrictMode>
    {configError ? <ConfigError message={configError} /> : <App />}
  </StrictMode>,
)
