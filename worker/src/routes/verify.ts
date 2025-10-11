import { jsonResponse } from '../lib/http';
import { requireAuth } from '../lib/auth';
import type { AuthContext, Env, RouteDefinition } from '../lib/context';

async function handleVerify(
  _request: Request,
  _env: Env,
  _params: Record<string, string>,
  auth: AuthContext,
): Promise<Response> {
  return jsonResponse({ status: 'ok', username: auth.username });
}

export const verifyRoutes: RouteDefinition[] = [
  {
    method: 'GET',
    pattern: new URLPattern({ pathname: '/verify' }),
    handler: requireAuth(handleVerify),
  },
];
