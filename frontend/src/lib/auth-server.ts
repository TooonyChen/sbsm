import { cookies } from 'next/headers';
import { AUTH_COOKIE_KEYS, COOKIE_HOST, COOKIE_PASSWORD, COOKIE_USERNAME } from './constants';

export async function readServerAuthCookies(): Promise<{
  host: string;
  username: string;
  password: string;
}> {
  const store = await cookies();
  return {
    host: store.get(COOKIE_HOST)?.value ?? '',
    username: store.get(COOKIE_USERNAME)?.value ?? '',
    password: store.get(COOKIE_PASSWORD)?.value ?? '',
  };
}

export async function hasServerAuthCookies(): Promise<boolean> {
  const store = await cookies();
  return AUTH_COOKIE_KEYS.every((key) => {
    const value = store.get(key)?.value ?? '';
    return value.length > 0;
  });
}

export async function clearServerAuthCookies(): Promise<void> {
  const store = await cookies();
  for (const key of AUTH_COOKIE_KEYS) {
    store.delete(key);
  }
}
