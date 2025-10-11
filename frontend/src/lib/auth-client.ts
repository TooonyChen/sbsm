'use client';

import { AUTH_COOKIE_KEYS, COOKIE_HOST, COOKIE_PASSWORD, COOKIE_USERNAME, normalizeBackendHost } from './constants';

type AuthCookies = {
  host: string;
  username: string;
  password: string;
};

function buildCookieOptions(): string {
  const base = ['path=/', 'sameSite=Lax', 'max-age=2592000']; // 30 days
  if (typeof window !== 'undefined' && window.location?.protocol === 'https:') {
    base.push('secure');
  }
  return base.join('; ');
}

function setCookie(key: string, value: string) {
  document.cookie = `${key}=${encodeURIComponent(value)}; ${buildCookieOptions()}`;
}

function deleteCookie(key: string) {
  document.cookie = `${key}=; path=/; max-age=0`;
}

function readCookie(key: string): string | null {
  if (typeof document === 'undefined') return null;
  const cookies = document.cookie ? document.cookie.split('; ') : [];
  for (const cookie of cookies) {
    const [name, ...rest] = cookie.split('=');
    if (name === key) {
      return decodeURIComponent(rest.join('='));
    }
  }
  return null;
}

export function getAuthCookies(): AuthCookies {
  return {
    host: readCookie(COOKIE_HOST) ?? '',
    username: readCookie(COOKIE_USERNAME) ?? '',
    password: readCookie(COOKIE_PASSWORD) ?? '',
  };
}

export function hasAuthCookies(): boolean {
  const values = AUTH_COOKIE_KEYS.map((key) => readCookie(key));
  return values.every((value) => value && value.length > 0);
}

export function setAuthCookies(host: string, username: string, password: string) {
  const normalizedHost = normalizeBackendHost(host);
  setCookie(COOKIE_HOST, normalizedHost);
  setCookie(COOKIE_USERNAME, username.trim());
  setCookie(COOKIE_PASSWORD, password);
}

export function clearAuthCookies() {
  for (const key of AUTH_COOKIE_KEYS) {
    deleteCookie(key);
  }
}
