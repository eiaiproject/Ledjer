import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { getSupabaseConfigError } from './lib/supabase.ts'
import { ConfigError } from './components/config-error.tsx'

const configError = getSupabaseConfigError()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {configError ? <ConfigError message={configError} /> : <App />}
  </StrictMode>,
)
