// This file configures the initialization of Sentry on the server and edge.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from '@sentry/nextjs'

const NOISY_WARNINGS = [
  'DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.',
  'ExperimentalWarning: vm.USE_MAIN_CONTEXT_DEFAULT_LOADER is an experimental feature and might change at any time',
]

const isNoisyWarningEvent = (event: Sentry.Event): boolean => {
  const message = event.message || event.logentry?.message || ''
  if (NOISY_WARNINGS.some((warning) => message.includes(warning))) {
    return true
  }
  const originalMessage =
    event.extra && typeof event.extra['originalException'] === 'string'
      ? event.extra['originalException']
      : ''
  if (originalMessage && NOISY_WARNINGS.some((warning) => originalMessage.includes(warning))) {
    return true
  }
  const exceptionValues = event.exception?.values || []
  return exceptionValues.some((entry) => {
    const value = entry?.value || ''
    return NOISY_WARNINGS.some((warning) => value.includes(warning))
  })
}

const isNoisyWarningMessage = (message?: string | null): boolean => {
  if (!message) return false
  return NOISY_WARNINGS.some((warning) => message.includes(warning))
}

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Server-side initialization
    Sentry.init({
      dsn: process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN,
      enableLogs: true,
      ignoreErrors: [
        'DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.',
        'ExperimentalWarning: vm.USE_MAIN_CONTEXT_DEFAULT_LOADER is an experimental feature and might change at any time',
      ],
      integrations: [
        Sentry.consoleLoggingIntegration({ levels: ['log', 'warn', 'error'] }),
      ],
      beforeBreadcrumb(breadcrumb) {
        if (breadcrumb.category === 'console' && isNoisyWarningMessage(breadcrumb.message)) {
          return null
        }
        return breadcrumb
      },
      beforeSend(event) {
        if (isNoisyWarningEvent(event)) {
          return null
        }
        return event
      },
      
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
      ignoreErrors: [
        'DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.',
        'ExperimentalWarning: vm.USE_MAIN_CONTEXT_DEFAULT_LOADER is an experimental feature and might change at any time',
      ],
      integrations: [
        Sentry.consoleLoggingIntegration({ levels: ['log', 'warn', 'error'] }),
      ],
      beforeBreadcrumb(breadcrumb) {
        if (breadcrumb.category === 'console' && isNoisyWarningMessage(breadcrumb.message)) {
          return null
        }
        return breadcrumb
      },
      beforeSend(event) {
        if (isNoisyWarningEvent(event)) {
          return null
        }
        return event
      },
      
      // Adjust this value in production, or use tracesSampler for greater control
      tracesSampleRate: 1.0,
      
      // Setting this option to true will print useful information to the console while you're setting up Sentry.
      debug: false,
    })
  }
}
