import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  // Clear all auth cookies
  const response = NextResponse.redirect(new URL('/api/auth/login', request.url))
  
  response.cookies.delete('access_token')
  response.cookies.delete('refresh_token')
  response.cookies.delete('code_verifier')
  
  return response
}

export async function GET(request: Request) {
  // Also support GET for convenience
  return POST(request)
}

