import { CORS_HEADERS, errorResponse } from './lib/http';
import type { Env, RouteDefinition } from './lib/context';
import { linkRoutes } from './routes/links';
import { groupRoutes } from './routes/groups';
import { baseConfigRoutes } from './routes/base-configs';
import { configRoutes } from './routes/configs';
import { verifyRoutes } from './routes/verify';

const routes: RouteDefinition[] = [
  {
    method: 'OPTIONS',
    pattern: new URLPattern({ pathname: '*' }),
    handler: (request) =>
      new Response(null, {
        status: 204,
        headers: {
          ...CORS_HEADERS,
          'access-control-allow-origin':
            request.headers.get('origin') ?? CORS_HEADERS['access-control-allow-origin'],
        },
      }),
  },
  ...linkRoutes,
  ...groupRoutes,
  ...baseConfigRoutes,
  ...configRoutes,
  ...verifyRoutes,
];

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = request.url;
    for (const route of routes) {
      if (route.method !== request.method) continue;
      const match = route.pattern.exec(url);
      if (!match) continue;

      const params = match.pathname?.groups ?? {};
      try {
        return await route.handler(request, env, params);
      } catch (error) {
        console.error('Unhandled route error', error);
        return errorResponse('Internal Server Error', 500);
      }
    }

    return errorResponse('Not Found', 404);
  },
};
