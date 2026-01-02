import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const response = NextResponse.redirect(new URL('/', request.url))
  
  // Clear all auth cookies
  response.cookies.delete('access_token')
  response.cookies.delete('refresh_token')
  response.cookies.delete('code_verifier')
  
  return response
}

export async function GET(request: Request) {
  // Also support GET for convenience
  return POST(request)
}

