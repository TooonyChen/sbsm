'use client';

import { clearAuthCookies, getAuthCookies, hasAuthCookies } from './auth-client';
import { normalizeBackendHost } from './constants';

export type ApiRequestOptions = RequestInit & {
  parseJson?: boolean;
};

export interface ApiError extends Error {
  status: number;
  details?: unknown;
}

function buildAuthorizationHeader(username: string, password: string): string {
  const token = btoa(`${username}:${password}`);
  return `Basic ${token}`;
}

export async function apiFetch<T = unknown>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  if (!hasAuthCookies()) {
    throw Object.assign(new Error('Authentication details missing — please configure them in Settings.'), { status: 401 });
  }

  const { host, username, password } = getAuthCookies();
  if (!host || !username || !password) {
    clearAuthCookies();
    throw Object.assign(new Error('Incomplete authentication cookies'), { status: 401 });
  }

  const url = new URL(path, normalizeBackendHost(host) + '/');
  const headers = new Headers(options.headers ?? {});
  headers.set('authorization', buildAuthorizationHeader(username, password));
  if (!headers.has('accept')) headers.set('accept', 'application/json');
  if (options.body && !(options.body instanceof FormData)) {
    if (!headers.has('content-type')) {
      headers.set('content-type', 'application/json');
    }
  }

  const response = await fetch(url.toString(), {
    ...options,
    headers,
  });

  if (response.status === 401) {
    clearAuthCookies();
  }

  if (!response.ok) {
    let errorMessage = `Request failed with status ${response.status}`;
    let details: unknown;
    try {
      const data = await response.json();
      if (typeof data?.error === 'string') {
        errorMessage = data.error;
      }
      if (data?.details) {
        details = data.details;
      }
    } catch {
      // ignore parse errors
    }
    const error = Object.assign(new Error(errorMessage), {
      status: response.status,
      details,
    }) as ApiError;
    throw error;
  }

  const shouldParse = options.parseJson !== false;
  if (shouldParse) {
    return (await response.json()) as T;
  }
  return (await response.text()) as unknown as T;
}
