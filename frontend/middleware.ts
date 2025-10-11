import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

const AUTH_COOKIE_KEYS = ['sbsm_host', 'sbsm_username', 'sbsm_password'] as const;

function hasAuthCookies(request: NextRequest): boolean {
  return AUTH_COOKIE_KEYS.every((key) => {
    const value = request.cookies.get(key)?.value ?? '';
    return value.length > 0;
  });
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const authenticated = hasAuthCookies(request);

  if (!authenticated && pathname !== '/settings') {
    const settingsUrl = request.nextUrl.clone();
    settingsUrl.pathname = '/settings';
    settingsUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(settingsUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
