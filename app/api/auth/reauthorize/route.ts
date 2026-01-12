import { NextResponse } from 'next/server'
import { logInfo, withApiLogging } from '@/lib/logger'

const handleReauthorize = async (request: Request) => {
  // Clear all auth cookies
  const response = NextResponse.redirect(new URL('/api/auth/login', request.url))
  
  response.cookies.delete('access_token')
  response.cookies.delete('refresh_token')
  response.cookies.delete('code_verifier')

  logInfo('Auth reauthorize initiated', { component: 'auth.reauthorize' })
  
  return response
}

export const POST = withApiLogging(handleReauthorize)
export const GET = withApiLogging(handleReauthorize)
