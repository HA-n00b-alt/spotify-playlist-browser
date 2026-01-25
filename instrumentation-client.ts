// This file configures the initialization of Sentry on the client.
// It's loaded when the app starts in the browser.
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

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enableLogs: true,
  ignoreErrors: [
    'DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.',
    'ExperimentalWarning: vm.USE_MAIN_CONTEXT_DEFAULT_LOADER is an experimental feature and might change at any time',
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
  
  replaysOnErrorSampleRate: 1.0,
  
  // This sets the sample rate to be 10%. You may want this to be 100% while
  // in development and sample at a lower rate in production
  replaysSessionSampleRate: 0.1,
  
  // You can remove this option if you're not planning to use the Sentry Session Replay feature:
  integrations: [
    Sentry.consoleLoggingIntegration({ levels: ['log', 'warn', 'error'] }),
    Sentry.replayIntegration({
      // Additional Replay configuration goes in here, for example:
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],
})

// Export router transition hook for navigation instrumentation
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
