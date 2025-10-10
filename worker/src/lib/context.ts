export interface Env {
  DB: D1Database;
  ADMIN_USERNAME: string;
  ADMIN_PASSWORD_HASH: string;
}

export interface AuthContext {
  username: string;
}

export type RouteHandler = (
  request: Request,
  env: Env,
  params: Record<string, string>,
  auth: AuthContext,
) => Promise<Response>;

export type PublicRouteHandler = (
  request: Request,
  env: Env,
  params: Record<string, string>,
) => Promise<Response>;

export interface RouteDefinition {
  method: string;
  pattern: URLPattern;
  handler: PublicRouteHandler;
}
