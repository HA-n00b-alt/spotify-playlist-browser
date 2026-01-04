/**
 * Centralized logging utility with Sentry integration
 */

import * as Sentry from '@sentry/nextjs'

export interface LogContext {
  [key: string]: any
}

/**
 * Log an error with context and send to Sentry
 */
export function logError(
  error: Error | unknown,
  context?: LogContext,
  level: Sentry.SeverityLevel = 'error'
) {
  const errorObj = error instanceof Error ? error : new Error(String(error))
  
  // Log to console with context
  console.error(`[ERROR] ${errorObj.message}`, {
    error: errorObj,
    context,
    stack: errorObj.stack,
  })
  
  // Send to Sentry with context
  if (typeof window !== 'undefined' || process.env.NEXT_PUBLIC_SENTRY_DSN) {
    try {
      Sentry.withScope((scope) => {
        // Set severity level
        scope.setLevel(level)
        
        // Add context data
        if (context) {
          Object.entries(context).forEach(([key, value]) => {
            scope.setContext(key, { value })
          })
        }
        
        // Add extra data
        scope.setExtra('errorName', errorObj.name)
        scope.setExtra('errorMessage', errorObj.message)
        if (errorObj.stack) {
          scope.setExtra('errorStack', errorObj.stack)
        }
        
        // Capture the exception
        Sentry.captureException(errorObj)
      })
    } catch (sentryError) {
      // If Sentry fails, at least log it
      console.error('[LOGGER] Failed to send error to Sentry:', sentryError)
    }
  }
}

/**
 * Log an info message with optional context
 */
export function logInfo(message: string, context?: LogContext) {
  console.log(`[INFO] ${message}`, context || {})
  
  // Optionally send to Sentry as breadcrumb
  if (typeof window !== 'undefined' || process.env.NEXT_PUBLIC_SENTRY_DSN) {
    try {
      Sentry.addBreadcrumb({
        message,
        level: 'info',
        data: context,
      })
    } catch (e) {
      // Ignore Sentry errors for info logs
    }
  }
}

/**
 * Log a warning with optional context
 */
export function logWarning(message: string, context?: LogContext) {
  console.warn(`[WARN] ${message}`, context || {})
  
  // Send to Sentry as breadcrumb
  if (typeof window !== 'undefined' || process.env.NEXT_PUBLIC_SENTRY_DSN) {
    try {
      Sentry.addBreadcrumb({
        message,
        level: 'warning',
        data: context,
      })
    } catch (e) {
      // Ignore Sentry errors for warnings
    }
  }
}

/**
 * Wrap an async function to automatically log errors
 */
export function withErrorLogging<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  context?: LogContext | ((...args: Parameters<T>) => LogContext)
): T {
  return (async (...args: Parameters<T>) => {
    try {
      const additionalContext = typeof context === 'function' ? context(...args) : context
      const functionName = fn.name || 'anonymous'
      
      logInfo(`Calling ${functionName}`, {
        ...additionalContext,
        args: args.length > 0 ? 'present' : 'none',
      })
      
      const result = await fn(...args)
      
      logInfo(`${functionName} completed successfully`, {
        ...additionalContext,
        hasResult: result !== undefined,
      })
      
      return result
    } catch (error) {
      const additionalContext = typeof context === 'function' ? context(...args) : context
      const functionName = fn.name || 'anonymous'
      
      logError(error, {
        function: functionName,
        ...additionalContext,
      })
      
      throw error
    }
  }) as T
}

