import type { Env, RouteHandler } from './context';
import { CORS_HEADERS } from './http';

const REALM = 'sing-box-admin';

async function hashPlaintext(password: string): Promise<string> {
  const data = new TextEncoder().encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i += 1) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export async function authenticateBasic(request: Request, env: Env): Promise<string | null> {
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Basic ')) return null;
  let decoded: string;
  try {
    decoded = atob(header.slice(6));
  } catch {
    return null;
  }
  const separatorIndex = decoded.indexOf(':');
  if (separatorIndex === -1) return null;
  const username = decoded.slice(0, separatorIndex);
  const password = decoded.slice(separatorIndex + 1);

  if (!username || password === undefined) return null;
  if (!env.ADMIN_USERNAME || !env.ADMIN_PASSWORD_HASH) {
    console.error('Admin credentials not configured in environment');
    return null;
  }
  if (username !== env.ADMIN_USERNAME) return null;

  const computedHash = await hashPlaintext(password);
  return constantTimeEqual(computedHash, env.ADMIN_PASSWORD_HASH) ? username : null;
}

export function requireAuth(handler: RouteHandler) {
  return async (request: Request, env: Env, params: Record<string, string>): Promise<Response> => {
    const username = await authenticateBasic(request, env);
    if (!username) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: {
          ...CORS_HEADERS,
          'content-type': 'application/json; charset=utf-8',
          'WWW-Authenticate': `Basic realm="${REALM}"`,
        },
      });
    }
    return handler(request, env, params, { username });
  };
}
