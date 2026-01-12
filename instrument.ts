// This file configures the initialization of Sentry on the server and edge.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from '@sentry/nextjs'

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Server-side initialization
    Sentry.init({
      dsn: process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN,
      enableLogs: true,
      integrations: [
        Sentry.consoleLoggingIntegration({ levels: ['log', 'warn', 'error'] }),
      ],
      
      // Adjust this value in production, or use tracesSampler for greater control
      tracesSampleRate: 1.0,
      
      // Setting this option to true will print useful information to the console while you're setting up Sentry.
      debug: false,
    })
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    // Edge runtime initialization
    Sentry.init({
      dsn: process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN,
      enableLogs: true,
      integrations: [
        Sentry.consoleLoggingIntegration({ levels: ['log', 'warn', 'error'] }),
      ],
      
      // Adjust this value in production, or use tracesSampler for greater control
      tracesSampleRate: 1.0,
      
      // Setting this option to true will print useful information to the console while you're setting up Sentry.
      debug: false,
    })
  }
}


