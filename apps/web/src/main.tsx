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
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
        maskAllInputs: true,
      }),
    ],
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0.05,
    replaysOnErrorSampleRate: 1.0,
    // Strip sensitive data from error reports
    beforeSend(event) {
      // Remove any PII from URLs (tokens, IDs in query params)
      if (event.request?.url) {
        try {
          const url = new URL(event.request.url);
          url.search = '';
          url.hash = '';
          event.request.url = url.toString();
        } catch { /* ignore */ }
      }
      // Scrub sensitive request headers (Authorization, Cookie)
      if (event.request?.headers) {
        const headers = event.request.headers;
        if (typeof headers === 'object' && headers !== null) {
          const sensitiveHeaders = ['authorization', 'cookie', 'set-cookie', 'x-auth-token', 'api-key'];
          for (const key of Object.keys(headers)) {
            const lower = key.toLowerCase();
            if (sensitiveHeaders.includes(lower)) {
              (headers as Record<string, string>)[key] = '[scrubbed]';
            }
          }
        }
      }
      return event;
    },
  });
}

const configError = getSupabaseConfigError()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {configError ? <ConfigError message={configError} /> : <App />}
  </StrictMode>,
)
