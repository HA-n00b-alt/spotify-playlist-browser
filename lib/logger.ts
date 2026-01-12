/**
 * Centralized structured logger with Sentry integration.
 */

import pino from 'pino'
import * as Sentry from '@sentry/nextjs'
import type { NextRequest } from 'next/server'

export interface LogContext {
  [key: string]: unknown
}

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const isBrowser = typeof window !== 'undefined'
const level = process.env.LOG_LEVEL || 'info'
const base = {
  service: 'spotify-playlist-browser',
  env: process.env.VERCEL_ENV || process.env.NODE_ENV || 'development',
}

const logger = pino(
  isBrowser
    ? { level, browser: { asObject: true } }
    : { level, base, timestamp: pino.stdTimeFunctions.isoTime }
)

const shouldSendToSentry = Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN)

const sendToSentry = (message: string, level: Sentry.SeverityLevel, context?: LogContext, error?: Error) => {
  if (!shouldSendToSentry) return
  try {
    Sentry.withScope((scope) => {
      scope.setLevel(level)
      if (context) {
        scope.setContext('log', context)
      }
      if (error) {
        scope.setExtra('errorName', error.name)
        scope.setExtra('errorMessage', error.message)
        if (error.stack) {
          scope.setExtra('errorStack', error.stack)
        }
        Sentry.captureException(error)
        return
      }
      Sentry.captureMessage(message)
    })
  } catch {
    // Avoid recursive logging if Sentry fails.
  }
}

export function logError(
  error: Error | unknown,
  context?: LogContext,
  levelOverride: Sentry.SeverityLevel = 'error'
) {
  const errorObj = error instanceof Error ? error : new Error(String(error))
  logger.error(
    {
      context,
      errorName: errorObj.name,
      errorMessage: errorObj.message,
      stack: errorObj.stack,
    },
    errorObj.message
  )
  sendToSentry(errorObj.message, levelOverride, context, errorObj)
}

export function logInfo(message: string, context?: LogContext) {
  logger.info({ context }, message)
  sendToSentry(message, 'info', context)
}

export function logWarning(message: string, context?: LogContext) {
  logger.warn({ context }, message)
  sendToSentry(message, 'warning', context)
}

export function logDebug(message: string, context?: LogContext) {
  logger.debug({ context }, message)
}

export function logRequest({
  method,
  path,
  status,
  durationMs,
  context,
}: {
  method: string
  path: string
  status: number
  durationMs: number
  context?: LogContext
}) {
  const level: LogLevel = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info'
  const payload = { method, path, status, durationMs, ...context }
  if (level === 'error') {
    logger.error(payload, 'API request completed')
    sendToSentry('API request completed', 'error', payload)
    return
  }
  if (level === 'warn') {
    logger.warn(payload, 'API request completed')
    sendToSentry('API request completed', 'warning', payload)
    return
  }
  logger.info(payload, 'API request completed')
  sendToSentry('API request completed', 'info', payload)
}

export function withApiLogging<T extends (request: Request | NextRequest, context?: any) => Promise<Response>>(handler: T): T {
  return (async (request: Request | NextRequest, context?: any) => {
    const start = Date.now()
    const url = new URL(request.url)
    try {
      const response = await handler(request, context)
      const durationMs = Date.now() - start
      logRequest({
        method: request.method,
        path: url.pathname,
        status: response.status,
        durationMs,
      })
      return response
    } catch (error) {
      const durationMs = Date.now() - start
      logRequest({
        method: request.method,
        path: url.pathname,
        status: 500,
        durationMs,
        context: { error: error instanceof Error ? error.message : String(error) },
      })
      throw error
    }
  }) as T
}

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
