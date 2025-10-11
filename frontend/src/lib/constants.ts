export const COOKIE_HOST = 'sbsm_host';
export const COOKIE_USERNAME = 'sbsm_username';
export const COOKIE_PASSWORD = 'sbsm_password';

export const AUTH_COOKIE_KEYS = [COOKIE_HOST, COOKIE_USERNAME, COOKIE_PASSWORD] as const;

export function normalizeBackendHost(host: string): string {
  const trimmed = host.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed.replace(/\/+$/, '');
  }
  return `https://${trimmed.replace(/\/+$/, '')}`;
}
