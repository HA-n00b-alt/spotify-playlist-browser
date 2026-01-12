import { NextResponse } from 'next/server'
import { logInfo, withApiLogging } from '@/lib/logger'

const handleLogout = async (request: Request) => {
  const response = NextResponse.redirect(new URL('/', request.url))
  
  // Clear all auth cookies
  response.cookies.delete('access_token')
  response.cookies.delete('refresh_token')
  response.cookies.delete('code_verifier')

  logInfo('Auth logout', { component: 'auth.logout' })

  return response
}

export const POST = withApiLogging(handleLogout)
export const GET = withApiLogging(handleLogout)
