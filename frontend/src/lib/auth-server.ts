import { cookies } from 'next/headers';
import { AUTH_COOKIE_KEYS, COOKIE_HOST, COOKIE_PASSWORD, COOKIE_USERNAME } from './constants';

export function readServerAuthCookies() {
  const store = cookies();
  return {
    host: store.get(COOKIE_HOST)?.value ?? '',
    username: store.get(COOKIE_USERNAME)?.value ?? '',
    password: store.get(COOKIE_PASSWORD)?.value ?? '',
  };
}

export function hasServerAuthCookies(): boolean {
  const store = cookies();
  return AUTH_COOKIE_KEYS.every((key) => {
    const value = store.get(key)?.value ?? '';
    return value.length > 0;
  });
}

export function clearServerAuthCookies() {
  const store = cookies();
  for (const key of AUTH_COOKIE_KEYS) {
    store.delete(key);
  }
}
