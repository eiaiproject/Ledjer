import * as Sentry from '@sentry/react'

// Headers that must be scrubbed from Sentry error reports and breadcrumbs.
const SENSITIVE_HEADERS = new Set([
  'authorization', 'cookie', 'set-cookie', 'x-auth-token', 'api-key',
]);

if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_APP_VERSION,

    integrations: [
      // Performance tracing - page load, navigation, HTTP requests, Web Vitals
      Sentry.browserTracingIntegration({
        traceFetch: true,
        traceXHR: true,
        enableHTTPTimings: true,
        shouldCreateSpanForRequest: (url: string) =>
          !url.includes('/__webpack_hmr'),
        enableLongTask: true,
        enableLongAnimationFrame: true,
        enableInp: true,
      }),
      // Session Replay - fully masked by default
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
        maskAllInputs: true,
      }),
      // User Feedback - floating button for bug reports
      Sentry.feedbackIntegration({
        autoInject: false,
        showBranding: false,
        colorScheme: 'light',
        buttonLabel: 'Laporkan Masalah',
        formTitle: 'Laporkan Masalah',
        submitButtonLabel: 'Kirim Laporan',
        cancelButtonLabel: 'Batal',
        successMessageText: 'Terima kasih! Laporan Anda telah terkirim.',
        messagePlaceholder: 'Jelaskan masalah yang Anda alami...\n\n(opsional) Langkah apa yang dilakukan sebelum masalah muncul?',
        requireName: false,
        requireEmail: false,
        isRequiredFieldMessage: 'Wajib diisi',
        addScreenshotButtonLabel: 'Lampirkan screenshot',
        removeScreenshotButtonLabel: 'Hapus screenshot',
      }),
    ],

    // Tracing sample rates
    tracesSampleRate: 0.1,
    tracePropagationTargets: ['localhost', /^https:\/\/app\.ledjer\.id/],

    // Session Replay sample rates
    replaysSessionSampleRate: 0.05,
    replaysOnErrorSampleRate: 1,

    // Enable structured log API
    enableLogs: true,

    // Privacy - fine-grained control over data collection (SDK ≥10.57.0)
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: {
        request: false,
        response: false,
      },
      queryParams: false,
      httpBodies: [],
      genAI: {
        inputs: false,
        outputs: false,
      },
      stackFrameVariables: false,
      frameContextLines: 3,
    },

    // Strip sensitive data from error reports (defense-in-depth)
    beforeSend(event) {
      // Remove PII from URLs (tokens, IDs in query params)
      if (event.request?.url) {
        try {
          const url = new URL(event.request.url);
          url.search = '';
          url.hash = '';
          event.request.url = url.toString();
        } catch { /* ignore */ }
      }
      // Scrub sensitive request headers
      if (event.request?.headers) {
        const headers = event.request.headers;
        if (typeof headers === 'object' && headers !== null) {
          for (const key of Object.keys(headers)) {
            const lower = key.toLowerCase();
            if (SENSITIVE_HEADERS.has(lower)) {
              (headers as Record<string, string>)[key] = '[scrubbed]';
            }
          }
        }
      }
      return event;
    },

    // Scrub sensitive data from breadcrumbs (defense-in-depth)
    beforeBreadcrumb(breadcrumb) {
      // Scrub auth headers from HTTP breadcrumbs

      if (breadcrumb.data?.headers) {
        const headers = breadcrumb.data.headers as Record<string, string>;
        for (const key of Object.keys(headers)) {
          if (SENSITIVE_HEADERS.has(key.toLowerCase())) {
            headers[key] = '[scrubbed]';
          }
        }
      }
      // Strip query params from breadcrumb URLs
      if (breadcrumb.data?.url) {
        try {
          const url = new URL(breadcrumb.data.url);
          url.search = '';
          url.hash = '';
          breadcrumb.data.url = url.toString();
        } catch { /* ignore */ }
      }
      return breadcrumb;
    },
  })
}

// Instrument side-effects only; Sentry.init() is called above.
