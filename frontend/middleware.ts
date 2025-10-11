import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

const AUTH_COOKIE_KEYS = ['sbsm_host', 'sbsm_username', 'sbsm_password'] as const;
const PUBLIC_PATHS = ['/login'];

function hasAuthCookies(request: NextRequest): boolean {
  return AUTH_COOKIE_KEYS.every((key) => {
    const value = request.cookies.get(key)?.value ?? '';
    return value.length > 0;
  });
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const authenticated = hasAuthCookies(request);

  if (!authenticated && !PUBLIC_PATHS.includes(pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (authenticated && pathname === '/login') {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/dashboard';
    redirectUrl.searchParams.delete('redirect');
    return NextResponse.redirect(redirectUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
