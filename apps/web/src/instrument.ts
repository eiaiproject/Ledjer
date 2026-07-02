import * as Sentry from '@sentry/react'

if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_APP_VERSION,

    integrations: [
      // Performance tracing — page load, navigation, HTTP requests, Web Vitals
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
      // Session Replay — fully masked by default
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
        maskAllInputs: true,
      }),
    ],

    // Tracing sample rates
    tracesSampleRate: 0.1,
    tracePropagationTargets: ['localhost', /^https:\/\/app\.ledjer\.id/],

    // Session Replay sample rates
    replaysSessionSampleRate: 0.05,
    replaysOnErrorSampleRate: 1.0,

    // Enable structured log API
    enableLogs: true,

    // Privacy — fine-grained control over data collection (SDK ≥10.57.0)
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

    // Scrub sensitive data from breadcrumbs (defense-in-depth)
    beforeBreadcrumb(breadcrumb) {
      // Scrub auth headers from HTTP breadcrumbs
      const sensitiveKeys = new Set([
        'authorization',
        'cookie',
        'set-cookie',
        'x-auth-token',
        'api-key',
      ]);
      if (breadcrumb.data?.headers) {
        const headers = breadcrumb.data.headers as Record<string, string>;
        for (const key of Object.keys(headers)) {
          if (sensitiveKeys.has(key.toLowerCase())) {
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

export {}
