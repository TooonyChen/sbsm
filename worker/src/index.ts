import { convertLinksToOutbounds } from './converter';
import {
  BaseConfigRow,
  ConfigGroupRow,
  Role,
  SbConfigRow,
  UserRow,
  VpnGroupRow,
  VpnLinkRow,
} from './models';
import { cloneTemplate, SingBoxConfig } from './template';

interface Env {
  DB: D1Database;
}

interface AuthContext {
  user: UserRow;
}

type RouteHandler = (
  request: Request,
  env: Env,
  params: Record<string, string>,
  auth: AuthContext,
) => Promise<Response>;

type PublicRouteHandler = (
  request: Request,
  env: Env,
  params: Record<string, string>,
) => Promise<Response>;

interface RouteDefinition {
  method: string;
  pattern: URLPattern;
  handler: PublicRouteHandler;
}

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
};

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization,content-type',
  'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS',
};

function jsonResponse(
  data: unknown,
  status = 200,
  headers: HeadersInit = {},
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...JSON_HEADERS, ...CORS_HEADERS, ...headers },
  });
}

function errorResponse(
  message: string,
  status = 400,
  details?: Record<string, unknown>,
): Response {
  return jsonResponse(
    {
      error: message,
      ...(details ? { details } : {}),
    },
    status,
  );
}

async function readJsonBody<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch (error) {
    console.error('Failed to parse JSON body', error);
    return null;
  }
}

async function authenticate(request: Request, env: Env): Promise<UserRow | null> {
  const header = request.headers.get('authorization') ?? '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const apiKey = match[1].trim();
  if (!apiKey) return null;
  const row = await env.DB.prepare<UserRow>(
    'SELECT id, username, api_key, role, created_at FROM users WHERE api_key = ?',
  )
    .bind(apiKey)
    .first();
  return row ?? null;
}

function requireAuth(
  handler: RouteHandler,
  options?: { requireAdmin?: boolean },
) {
  return async (
    request: Request,
    env: Env,
    params: Record<string, string>,
  ): Promise<Response> => {
    const user = await authenticate(request, env);
    if (!user) {
      return errorResponse('Unauthorized', 401);
    }
    if (options?.requireAdmin && user.role !== 'admin') {
      return errorResponse('Forbidden', 403);
    }
    return handler(request, env, params, { user });
  };
}

function deriveNameFromLink(link: string): string {
  const hashIndex = link.indexOf('#');
  if (hashIndex >= 0 && hashIndex < link.length - 1) {
    try {
      return decodeURIComponent(link.slice(hashIndex + 1));
    } catch {
      return link.slice(hashIndex + 1);
    }
  }
  try {
    const url = new URL(link);
    return url.hostname;
  } catch {
    return link.slice(0, 32);
  }
}

function parseSelectorTags(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const tags = parsed
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter((item) => item.length > 0);
      return Array.from(new Set(tags));
    }
  } catch (error) {
    console.error('Failed to parse selector_tags JSON', error);
  }
  return [];
}

function parseBaseConfig(raw: string): SingBoxConfig {
  try {
    const parsed = JSON.parse(raw) as SingBoxConfig;
    if (parsed && typeof parsed === 'object') {
      if (!Array.isArray(parsed.outbounds)) parsed.outbounds = [];
      return parsed;
    }
  } catch (error) {
    console.error('Failed to parse base_config JSON', error);
  }
  const fallback = cloneTemplate();
  fallback.outbounds = [];
  return fallback;
}

function normalizeConfigInput(input: unknown): SingBoxConfig {
  if (typeof input === 'string') {
    return parseBaseConfig(input);
  }
  if (input && typeof input === 'object') {
    const cloned = JSON.parse(JSON.stringify(input)) as SingBoxConfig;
    if (!cloned.outbounds || !Array.isArray(cloned.outbounds)) {
      cloned.outbounds = [];
    }
    return cloned;
  }
  return cloneTemplate();
}

function stringifyConfig(config: SingBoxConfig): string {
  return JSON.stringify(config);
}

function mergeGeneratedOutbounds(
  config: SingBoxConfig,
  generated: unknown[],
  selectorTags: string[],
): void {
  if (!Array.isArray(config.outbounds)) {
    config.outbounds = [];
  }
  config.outbounds.push(...generated);

  if (selectorTags.length === 0) return;
  const newTags = generated
    .map((item) => (item && typeof item === 'object' ? (item as any).tag : undefined))
    .filter((tag): tag is string => typeof tag === 'string' && tag.length > 0);
  if (newTags.length === 0) return;

  for (const outbound of config.outbounds) {
    if (!outbound || typeof outbound !== 'object') continue;
    const tag = (outbound as any).tag;
    if (typeof tag !== 'string') continue;
    if (!selectorTags.includes(tag)) continue;

    const target = (outbound as any).outbounds;
    if (!Array.isArray(target)) {
      (outbound as any).outbounds = [...newTags];
      continue;
    }
    appendUniqueStrings(target as string[], newTags);
  }
}

function appendUniqueStrings(target: string[], values: string[]): void {
  const seen = new Set<string>(target.filter((item) => typeof item === 'string'));
  for (const value of values) {
    if (!seen.has(value)) {
      target.push(value);
      seen.add(value);
    }
  }
}

function createInClause(ids: string[]): { clause: string; bindings: string[] } {
  const unique = Array.from(new Set(ids.filter((id) => typeof id === 'string' && id.length)));
  if (unique.length === 0) {
    return { clause: '(NULL)', bindings: [] };
  }
  const placeholders = unique.map(() => '?').join(', ');
  return { clause: `(${placeholders})`, bindings: unique };
}

async function fetchLinksByIds(
  env: Env,
  ids: string[],
): Promise<VpnLinkRow[]> {
  if (ids.length === 0) return [];
  const { clause, bindings } = createInClause(ids);
  const statement = env.DB.prepare<VpnLinkRow>(
    `SELECT id, user_id, name, raw_link, created_at, updated_at
       FROM vpn_links
       WHERE id IN ${clause}`,
  ).bind(...bindings);
  const { results } = await statement.all();
  return results;
}

async function fetchGroupById(env: Env, groupId: string): Promise<VpnGroupRow | null> {
  return (
    (await env.DB.prepare<VpnGroupRow>(
      `SELECT id, user_id, name, description, created_at, updated_at
         FROM vpn_groups
         WHERE id = ?`,
    )
      .bind(groupId)
      .first()) ?? null
  );
}

async function fetchConfigById(env: Env, configId: string): Promise<SbConfigRow | null> {
  return (
    (await env.DB.prepare<SbConfigRow>(
      `SELECT id, user_id, base_config_id, name, description, selector_tags, created_at, updated_at
         FROM sb_configs
         WHERE id = ?`,
    )
      .bind(configId)
      .first()) ?? null
  );
}

async function fetchBaseConfigById(
  env: Env,
  baseConfigId: string,
): Promise<BaseConfigRow | null> {
  return (
    (await env.DB.prepare<BaseConfigRow>(
      `SELECT id, user_id, name, description, config_json, selector_tags, created_at, updated_at
         FROM sb_base_configs
         WHERE id = ?`,
    )
      .bind(baseConfigId)
      .first()) ?? null
  );
}

function ensureCanAccessResource(auth: AuthContext, ownerId: string): boolean {
  return auth.user.role === 'admin' || auth.user.id === ownerId;
}

async function handleCreateUser(
  request: Request,
  env: Env,
  _params: Record<string, string>,
  _auth: AuthContext,
): Promise<Response> {
  const body = await readJsonBody<{ username?: string; role?: Role }>(request);
  if (!body) return errorResponse('Invalid JSON payload', 400);

  const username = body.username?.trim();
  if (!username) return errorResponse('`username` is required', 422);

  const role: Role = body.role === 'admin' ? 'admin' : 'user';
  const id = crypto.randomUUID();
  const apiKey = crypto.randomUUID();

  const insert = await env.DB.prepare(
    'INSERT INTO users (id, username, api_key, role) VALUES (?, ?, ?, ?)',
  )
    .bind(id, username, apiKey, role)
    .run();

  if (!insert.success) {
    if ((insert.error ?? '').includes('UNIQUE')) {
      return errorResponse('Username already exists', 409);
    }
    console.error('Failed to insert user', insert.error);
    return errorResponse('Failed to create user', 500);
  }

  return jsonResponse(
    {
      id,
      username,
      role,
      apiKey,
    },
    201,
  );
}

async function handleListUsers(
  request: Request,
  env: Env,
  _params: Record<string, string>,
  _auth: AuthContext,
): Promise<Response> {
  const url = new URL(request.url);
  const includeKeys = url.searchParams.get('with_keys') === '1';
  const { results } = await env.DB.prepare<UserRow>(
    'SELECT id, username, api_key, role, created_at FROM users ORDER BY created_at DESC',
  ).all();

  return jsonResponse(
    results.map((row) => ({
      id: row.id,
      username: row.username,
      role: row.role,
      createdAt: row.created_at,
      ...(includeKeys ? { apiKey: row.api_key } : {}),
    })),
  );
}

async function handleCreateLink(
  request: Request,
  env: Env,
  _params: Record<string, string>,
  auth: AuthContext,
): Promise<Response> {
  const body = await readJsonBody<{
    url?: string;
    name?: string;
    userId?: string;
  }>(request);
  if (!body) return errorResponse('Invalid JSON payload', 400);

  const rawLink = body.url?.trim();
  if (!rawLink) return errorResponse('`url` is required', 422);
  const targetUserId =
    auth.user.role === 'admin' && body.userId ? body.userId : auth.user.id;

  if (auth.user.role !== 'admin' && body.userId && body.userId !== auth.user.id) {
    return errorResponse('Forbidden', 403);
  }

  const id = crypto.randomUUID();
  const name = (body.name ?? deriveNameFromLink(rawLink)).trim();

  const insert = await env.DB.prepare(
    `INSERT INTO vpn_links (id, user_id, name, raw_link) VALUES (?, ?, ?, ?)`,
  )
    .bind(id, targetUserId, name, rawLink)
    .run();

  if (!insert.success) {
    console.error('Failed to insert vpn_link', insert.error);
    return errorResponse('Failed to store link', 500);
  }

  const { results } = await env.DB.prepare<VpnLinkRow>(
    `SELECT id, user_id, name, raw_link, created_at, updated_at
       FROM vpn_links WHERE id = ?`,
  )
    .bind(id)
    .all();

  return jsonResponse(results[0], 201);
}

async function handleListLinks(
  request: Request,
  env: Env,
  _params: Record<string, string>,
  auth: AuthContext,
): Promise<Response> {
  const url = new URL(request.url);
  const targetUserIdParam = url.searchParams.get('user_id');
  let targetUserId: string | null = auth.user.id;

  if (auth.user.role === 'admin') {
    targetUserId = targetUserIdParam ?? null;
  }

  const statement =
    targetUserId === null
      ? env.DB.prepare<VpnLinkRow>(
          `SELECT id, user_id, name, raw_link, created_at, updated_at
             FROM vpn_links
             ORDER BY created_at DESC`,
        )
      : env.DB.prepare<VpnLinkRow>(
          `SELECT id, user_id, name, raw_link, created_at, updated_at
             FROM vpn_links
             WHERE user_id = ?
             ORDER BY created_at DESC`,
        ).bind(targetUserId);

  const { results } = await statement.all();
  return jsonResponse(results);
}

async function handleDeleteLink(
  _request: Request,
  env: Env,
  params: Record<string, string>,
  auth: AuthContext,
): Promise<Response> {
  const linkId = params.id;
  if (!linkId) return errorResponse('Missing link id', 400);

  const link = await env.DB.prepare<VpnLinkRow>(
    `SELECT id, user_id, name, raw_link, created_at, updated_at
       FROM vpn_links WHERE id = ?`,
  )
    .bind(linkId)
    .first();

  if (!link) {
    return errorResponse('Link not found', 404);
  }

  if (auth.user.role !== 'admin' && link.user_id !== auth.user.id) {
    return errorResponse('Forbidden', 403);
  }

  const deleteResult = await env.DB.prepare(
    `DELETE FROM vpn_links WHERE id = ?`,
  )
    .bind(linkId)
    .run();

  if (!deleteResult.success) {
    console.error('Failed to delete vpn_link', deleteResult.error);
    return errorResponse('Failed to delete link', 500);
  }

  return jsonResponse({ success: true });
}

async function handleCreateGroup(
  request: Request,
  env: Env,
  _params: Record<string, string>,
  auth: AuthContext,
): Promise<Response> {
  const body = await readJsonBody<{
    name?: string;
    description?: string;
    linkIds?: string[];
    userId?: string;
  }>(request);
  if (!body) return errorResponse('Invalid JSON payload', 400);

  const name = body.name?.trim();
  if (!name) return errorResponse('`name` is required', 422);

  const targetUserId =
    auth.user.role === 'admin' && body.userId ? body.userId : auth.user.id;

  if (auth.user.role !== 'admin' && body.userId && body.userId !== auth.user.id) {
    return errorResponse('Forbidden', 403);
  }

  const id = crypto.randomUUID();
  const description = body.description?.trim() ?? null;

  const insert = await env.DB.prepare(
    `INSERT INTO vpn_groups (id, user_id, name, description) VALUES (?, ?, ?, ?)`,
  )
    .bind(id, targetUserId, name, description)
    .run();

  if (!insert.success) {
    console.error('Failed to insert vpn_group', insert.error);
    return errorResponse('Failed to create group', 500);
  }

  const linkIds =
    Array.isArray(body.linkIds) && body.linkIds.length > 0
      ? Array.from(new Set(body.linkIds.filter((item) => typeof item === 'string' && item.length)))
      : [];

  if (linkIds.length > 0) {
    const links = await fetchLinksByIds(env, linkIds);
    const foundIds = new Set(links.map((link) => link.id));
    const missing = linkIds.filter((id) => !foundIds.has(id));
    if (missing.length > 0) {
      return errorResponse('Some linkIds were not found', 404, { linkIds: missing });
    }

    const invalidLinks = links.filter((link) => !ensureCanAccessResource(auth, link.user_id));
    if (invalidLinks.length > 0) {
      return errorResponse('One or more links cannot be attached to this group', 403, {
        linkIds: invalidLinks.map((link) => link.id),
      });
    }

    const mismatchedOwners = links.filter((link) => link.user_id !== targetUserId);
    if (mismatchedOwners.length > 0) {
      return errorResponse('All links must belong to the same user as the group', 422, {
        linkIds: mismatchedOwners.map((link) => link.id),
      });
    }

    const statements = linkIds.map((linkId) =>
      env.DB.prepare(
        `INSERT OR IGNORE INTO vpn_group_links (group_id, link_id) VALUES (?, ?)`,
      ).bind(id, linkId),
    );
    if (statements.length > 0) {
      await env.DB.batch(statements);
    }
  }

  const group = await fetchGroupById(env, id);
  return jsonResponse(group, 201);
}

async function handleListGroups(
  request: Request,
  env: Env,
  _params: Record<string, string>,
  auth: AuthContext,
): Promise<Response> {
  const url = new URL(request.url);
  const filterUserId =
    auth.user.role === 'admin' ? url.searchParams.get('user_id') ?? null : auth.user.id;

  const statement =
    filterUserId === null
      ? env.DB.prepare<VpnGroupRow>(
          `SELECT id, user_id, name, description, created_at, updated_at
             FROM vpn_groups
             ORDER BY created_at DESC`,
        )
      : env.DB.prepare<VpnGroupRow>(
          `SELECT id, user_id, name, description, created_at, updated_at
             FROM vpn_groups
             WHERE user_id = ?
             ORDER BY created_at DESC`,
        ).bind(filterUserId);

  const { results } = await statement.all();
  return jsonResponse(results);
}

async function handleAddGroupLinks(
  request: Request,
  env: Env,
  params: Record<string, string>,
  auth: AuthContext,
): Promise<Response> {
  const groupId = params.id;
  if (!groupId) return errorResponse('Missing group id', 400);

  const group = await fetchGroupById(env, groupId);
  if (!group) return errorResponse('Group not found', 404);
  if (!ensureCanAccessResource(auth, group.user_id)) return errorResponse('Forbidden', 403);

  const body = await readJsonBody<{ linkIds?: string[] }>(request);
  if (!body) return errorResponse('Invalid JSON payload', 400);

  const linkIds =
    Array.isArray(body.linkIds) && body.linkIds.length > 0
      ? Array.from(new Set(body.linkIds.filter((item) => typeof item === 'string' && item.length)))
      : [];
  if (linkIds.length === 0) {
    return errorResponse('`linkIds` must include at least one id', 422);
  }

  const links = await fetchLinksByIds(env, linkIds);
  const foundIds = new Set(links.map((link) => link.id));
  const missing = linkIds.filter((id) => !foundIds.has(id));
  if (missing.length > 0) {
    return errorResponse('Some linkIds were not found', 404, { linkIds: missing });
  }

  const invalidLinks = links.filter((link) => !ensureCanAccessResource(auth, link.user_id));
  if (invalidLinks.length > 0) {
    return errorResponse('One or more links cannot be attached to this group', 403, {
      linkIds: invalidLinks.map((link) => link.id),
    });
  }

  const mismatchedOwners = links.filter((link) => link.user_id !== group.user_id);
  if (mismatchedOwners.length > 0) {
    return errorResponse('All links must belong to the group owner', 422, {
      linkIds: mismatchedOwners.map((link) => link.id),
    });
  }

  const statements = linkIds.map((linkId) =>
    env.DB.prepare(
      `INSERT OR IGNORE INTO vpn_group_links (group_id, link_id) VALUES (?, ?)`,
    ).bind(groupId, linkId),
  );
  await env.DB.batch(statements);

  return jsonResponse({ success: true });
}

async function handleRemoveGroupLink(
  _request: Request,
  env: Env,
  params: Record<string, string>,
  auth: AuthContext,
): Promise<Response> {
  const groupId = params.id;
  const linkId = params.linkId;
  if (!groupId || !linkId) return errorResponse('Missing group or link id', 400);

  const group = await fetchGroupById(env, groupId);
  if (!group) return errorResponse('Group not found', 404);
  if (!ensureCanAccessResource(auth, group.user_id)) return errorResponse('Forbidden', 403);
  if (group.user_id !== config.user_id) {
    return errorResponse('Group belongs to a different user than the config', 422);
  }

  const remove = await env.DB.prepare(
    `DELETE FROM vpn_group_links WHERE group_id = ? AND link_id = ?`,
  )
    .bind(groupId, linkId)
    .run();

  if (!remove.success) {
    console.error('Failed to delete vpn_group_link', remove.error);
    return errorResponse('Failed to remove link from group', 500);
  }

  return jsonResponse({ success: true });
}

function formatBaseConfig(row: BaseConfigRow) {
  return {
    id: row.id,
    user_id: row.user_id,
    name: row.name,
    description: row.description,
    selector_tags: parseSelectorTags(row.selector_tags),
    config: parseBaseConfig(row.config_json),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function handleCreateBaseConfig(
  request: Request,
  env: Env,
  _params: Record<string, string>,
  auth: AuthContext,
): Promise<Response> {
  const body = await readJsonBody<{
    name?: string;
    description?: string;
    configJson?: unknown;
    selectorTags?: string[];
    userId?: string;
  }>(request);
  if (!body) return errorResponse('Invalid JSON payload', 400);

  const name = body.name?.trim();
  if (!name) return errorResponse('`name` is required', 422);

  const targetUserId =
    auth.user.role === 'admin' && body.userId ? body.userId : auth.user.id;
  if (auth.user.role !== 'admin' && body.userId && body.userId !== auth.user.id) {
    return errorResponse('Forbidden', 403);
  }

  const template = normalizeConfigInput(
    body.configJson ?? (body as any).baseConfig ?? cloneTemplate(),
  );
  const selectorTags =
    Array.isArray(body.selectorTags) && body.selectorTags.length
      ? Array.from(
          new Set(
            body.selectorTags
              .map((tag) => (typeof tag === 'string' ? tag.trim() : ''))
              .filter((tag) => tag.length > 0),
          ),
        )
      : [];

  const id = crypto.randomUUID();
  const nowJson = stringifyConfig(template);
  const selectorJson = JSON.stringify(selectorTags);

  const insert = await env.DB.prepare(
    `INSERT INTO sb_base_configs (id, user_id, name, description, config_json, selector_tags)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, targetUserId, name, body.description ?? null, nowJson, selectorJson)
    .run();

  if (!insert.success) {
    console.error('Failed to insert sb_base_configs', insert.error);
    return errorResponse('Failed to create base config', 500);
  }

  const row = await fetchBaseConfigById(env, id);
  if (!row) return errorResponse('Failed to load base config after creation', 500);
  return jsonResponse(formatBaseConfig(row), 201);
}

async function handleListBaseConfigs(
  request: Request,
  env: Env,
  _params: Record<string, string>,
  auth: AuthContext,
): Promise<Response> {
  const url = new URL(request.url);
  const filterUserId =
    auth.user.role === 'admin' ? url.searchParams.get('user_id') ?? null : auth.user.id;

  const statement =
    filterUserId === null
      ? env.DB.prepare<BaseConfigRow>(
          `SELECT id, user_id, name, description, config_json, selector_tags, created_at, updated_at
             FROM sb_base_configs
             ORDER BY created_at DESC`,
        )
      : env.DB.prepare<BaseConfigRow>(
          `SELECT id, user_id, name, description, config_json, selector_tags, created_at, updated_at
             FROM sb_base_configs
             WHERE user_id = ?
             ORDER BY created_at DESC`,
        ).bind(filterUserId);

  const { results } = await statement.all();
  return jsonResponse(results.map(formatBaseConfig));
}

async function handleGetBaseConfig(
  _request: Request,
  env: Env,
  params: Record<string, string>,
  auth: AuthContext,
): Promise<Response> {
  const baseConfigId = params.id;
  if (!baseConfigId) return errorResponse('Missing base config id', 400);
  const row = await fetchBaseConfigById(env, baseConfigId);
  if (!row) return errorResponse('Base config not found', 404);
  if (!ensureCanAccessResource(auth, row.user_id)) return errorResponse('Forbidden', 403);
  return jsonResponse(formatBaseConfig(row));
}

async function handleUpdateBaseConfig(
  request: Request,
  env: Env,
  params: Record<string, string>,
  auth: AuthContext,
): Promise<Response> {
  const baseConfigId = params.id;
  if (!baseConfigId) return errorResponse('Missing base config id', 400);
  const row = await fetchBaseConfigById(env, baseConfigId);
  if (!row) return errorResponse('Base config not found', 404);
  if (!ensureCanAccessResource(auth, row.user_id)) return errorResponse('Forbidden', 403);

  const body = await readJsonBody<{
    name?: string;
    description?: string | null;
    configJson?: unknown;
    selectorTags?: string[];
  }>(request);
  if (!body) return errorResponse('Invalid JSON payload', 400);

  const updates: string[] = [];
  const bindings: unknown[] = [];

  if (body.name != null) {
    const name = String(body.name).trim();
    if (name.length === 0) return errorResponse('`name` cannot be empty', 422);
    updates.push('name = ?');
    bindings.push(name);
  }
  if (body.description !== undefined) {
    updates.push('description = ?');
    bindings.push(body.description === null ? null : String(body.description));
  }
  if (body.configJson !== undefined) {
    const template = normalizeConfigInput(body.configJson);
    updates.push('config_json = ?');
    bindings.push(stringifyConfig(template));
  }
  if (body.selectorTags !== undefined) {
    const selectorTags = Array.isArray(body.selectorTags)
      ? Array.from(
          new Set(
            body.selectorTags
              .map((tag) => (typeof tag === 'string' ? tag.trim() : ''))
              .filter((tag) => tag.length > 0),
          ),
        )
      : [];
    updates.push('selector_tags = ?');
    bindings.push(JSON.stringify(selectorTags));
  }

  if (updates.length === 0) {
    return jsonResponse(formatBaseConfig(row));
  }

  updates.push(`updated_at = strftime('%s','now')`);
  const statement = env.DB.prepare(
    `UPDATE sb_base_configs SET ${updates.join(', ')} WHERE id = ?`,
  ).bind(...bindings, baseConfigId);
  const result = await statement.run();

  if (!result.success) {
    console.error('Failed to update sb_base_configs', result.error);
    return errorResponse('Failed to update base config', 500);
  }

  const updated = await fetchBaseConfigById(env, baseConfigId);
  if (!updated) return errorResponse('Failed to load base config after update', 500);
  return jsonResponse(formatBaseConfig(updated));
}

async function handleDeleteBaseConfig(
  _request: Request,
  env: Env,
  params: Record<string, string>,
  auth: AuthContext,
): Promise<Response> {
  const baseConfigId = params.id;
  if (!baseConfigId) return errorResponse('Missing base config id', 400);

  const row = await fetchBaseConfigById(env, baseConfigId);
  if (!row) return errorResponse('Base config not found', 404);
  if (!ensureCanAccessResource(auth, row.user_id)) return errorResponse('Forbidden', 403);

  const inUse = await env.DB.prepare<{ count: number }>(
    `SELECT COUNT(1) AS count FROM sb_configs WHERE base_config_id = ?`,
  )
    .bind(baseConfigId)
    .first();

  if ((inUse?.count ?? 0) > 0) {
    return errorResponse('Base config is still referenced by existing configs', 409, {
      configCount: inUse?.count ?? 0,
    });
  }

  const result = await env.DB.prepare(
    `DELETE FROM sb_base_configs WHERE id = ?`,
  )
    .bind(baseConfigId)
    .run();

  if (!result.success) {
    console.error('Failed to delete sb_base_configs', result.error);
    return errorResponse('Failed to delete base config', 500);
  }

  return jsonResponse({ success: true });
}

async function handleCreateConfig(
  request: Request,
  env: Env,
  _params: Record<string, string>,
  auth: AuthContext,
): Promise<Response> {
  const body = await readJsonBody<{
    name?: string;
    description?: string;
    baseConfigId?: string;
    selectorTags?: string[];
    groupIds?: string[];
    userId?: string;
  }>(request);
  if (!body) return errorResponse('Invalid JSON payload', 400);

  const name = body.name?.trim();
  if (!name) return errorResponse('`name` is required', 422);

  const targetUserId =
    auth.user.role === 'admin' && body.userId ? body.userId : auth.user.id;
  if (auth.user.role !== 'admin' && body.userId && body.userId !== auth.user.id) {
    return errorResponse('Forbidden', 403);
  }

  const description = body.description?.trim() ?? null;
  const baseConfigId = body.baseConfigId?.trim();
  if (!baseConfigId) return errorResponse('`baseConfigId` is required', 422);

  const baseConfigRow = await fetchBaseConfigById(env, baseConfigId);
  if (!baseConfigRow) return errorResponse('Base config not found', 404);

  if (auth.user.role !== 'admin' && baseConfigRow.user_id !== auth.user.id) {
    return errorResponse('Forbidden', 403);
  }
  if (baseConfigRow.user_id !== targetUserId) {
    return errorResponse('Base config must belong to the same user as the config', 422);
  }

  const selectorTags =
    Array.isArray(body.selectorTags) && body.selectorTags.length
      ? Array.from(
          new Set(
            body.selectorTags
              .map((tag) => (typeof tag === 'string' ? tag.trim() : ''))
              .filter((tag) => tag.length > 0),
          ),
        )
      : [];

  const id = crypto.randomUUID();
  const selectorJson = JSON.stringify(selectorTags);

  const insert = await env.DB.prepare(
    `INSERT INTO sb_configs (id, user_id, base_config_id, name, description, selector_tags)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, targetUserId, baseConfigId, name, description, selectorJson)
    .run();

  if (!insert.success) {
    console.error('Failed to insert sb_config', insert.error);
    return errorResponse('Failed to create config', 500);
  }

  const groupIds =
    Array.isArray(body.groupIds) && body.groupIds.length
      ? Array.from(new Set(body.groupIds.filter((item) => typeof item === 'string' && item.length)))
      : [];

  if (groupIds.length > 0) {
    const groups = await fetchGroupsByIds(env, groupIds);
    const foundIds = new Set(groups.map((group) => group.id));
    const missing = groupIds.filter((gid) => !foundIds.has(gid));
    if (missing.length > 0) {
      return errorResponse('Some groupIds were not found', 404, { groupIds: missing });
    }
    const invalidGroups = groups.filter(
      (group) => !ensureCanAccessResource(auth, group.user_id),
    );
    if (invalidGroups.length > 0) {
      return errorResponse('One or more groups cannot be attached to this config', 403, {
        groupIds: invalidGroups.map((group) => group.id),
      });
    }

    const mismatchedGroups = groups.filter(
      (group) => group.user_id !== targetUserId,
    );
    if (mismatchedGroups.length > 0) {
      return errorResponse('All groups must belong to the config owner', 422, {
        groupIds: mismatchedGroups.map((group) => group.id),
      });
    }

    const statements = groupIds.map((groupId, index) =>
      env.DB.prepare(
        `INSERT INTO sb_config_groups (config_id, group_id, position)
         VALUES (?, ?, ?)
         ON CONFLICT(config_id, group_id) DO UPDATE SET position = excluded.position`,
      ).bind(id, groupId, index),
    );
    await env.DB.batch(statements);
  }

  const config = await fetchConfigById(env, id);
  if (!config) {
    return errorResponse('Failed to load config after creation', 500);
  }

  return jsonResponse(
    {
      id: config.id,
      user_id: config.user_id,
      base_config_id: config.base_config_id,
      name: config.name,
      description: config.description,
      selector_tags: selectorTags,
      created_at: config.created_at,
      updated_at: config.updated_at,
    },
    201,
  );
}

async function fetchGroupsByIds(env: Env, ids: string[]): Promise<VpnGroupRow[]> {
  if (ids.length === 0) return [];
  const { clause, bindings } = createInClause(ids);
  const statement = env.DB.prepare<VpnGroupRow>(
    `SELECT id, user_id, name, description, created_at, updated_at
       FROM vpn_groups
       WHERE id IN ${clause}`,
  ).bind(...bindings);
  const { results } = await statement.all();
  return results;
}

async function handleListConfigs(
  request: Request,
  env: Env,
  _params: Record<string, string>,
  auth: AuthContext,
): Promise<Response> {
  const url = new URL(request.url);
  const filterUserId =
    auth.user.role === 'admin' ? url.searchParams.get('user_id') ?? null : auth.user.id;

  const statement =
    filterUserId === null
      ? env.DB.prepare<
          SbConfigRow & { base_config_name: string | null }
        >(
          `SELECT sc.id,
                  sc.user_id,
                  sc.base_config_id,
                  sc.name,
                  sc.description,
                  sc.selector_tags,
                  sc.created_at,
                  sc.updated_at,
                  bc.name AS base_config_name
             FROM sb_configs sc
             LEFT JOIN sb_base_configs bc ON bc.id = sc.base_config_id
             ORDER BY sc.created_at DESC`,
        )
      : env.DB.prepare<
          SbConfigRow & { base_config_name: string | null }
        >(
          `SELECT sc.id,
                  sc.user_id,
                  sc.base_config_id,
                  sc.name,
                  sc.description,
                  sc.selector_tags,
                  sc.created_at,
                  sc.updated_at,
                  bc.name AS base_config_name
             FROM sb_configs sc
             LEFT JOIN sb_base_configs bc ON bc.id = sc.base_config_id
             WHERE sc.user_id = ?
             ORDER BY sc.created_at DESC`,
        ).bind(filterUserId);

  const { results } = await statement.all();
  const response = results.map((row) => ({
    id: row.id,
    user_id: row.user_id,
    base_config_id: row.base_config_id,
    base_config_name: row.base_config_name,
    name: row.name,
    description: row.description,
    selector_tags: parseSelectorTags(row.selector_tags),
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));
  return jsonResponse(response);
}

async function handleAttachConfigGroup(
  request: Request,
  env: Env,
  params: Record<string, string>,
  auth: AuthContext,
): Promise<Response> {
  const configId = params.id;
  if (!configId) return errorResponse('Missing config id', 400);

  const config = await fetchConfigById(env, configId);
  if (!config) return errorResponse('Config not found', 404);
  if (!ensureCanAccessResource(auth, config.user_id)) return errorResponse('Forbidden', 403);

  const body = await readJsonBody<{ groupId?: string; position?: number }>(request);
  if (!body) return errorResponse('Invalid JSON payload', 400);
  const groupId = body.groupId?.trim();
  if (!groupId) return errorResponse('`groupId` is required', 422);

  const group = await fetchGroupById(env, groupId);
  if (!group) return errorResponse('Group not found', 404);
  if (!ensureCanAccessResource(auth, group.user_id)) return errorResponse('Forbidden', 403);
  if (group.user_id !== config.user_id) {
    return errorResponse('Group belongs to a different user than the config', 422);
  }

  let position = Number.isInteger(body.position) ? (body.position as number) : null;
  if (position === null) {
    const maxRow = await env.DB.prepare<{ max_position: number }>(
      `SELECT COALESCE(MAX(position), -1) AS max_position
         FROM sb_config_groups
         WHERE config_id = ?`,
    )
      .bind(configId)
      .first();
    position = (maxRow?.max_position ?? -1) + 1;
  }

  const upsert = await env.DB.prepare(
    `INSERT INTO sb_config_groups (config_id, group_id, position)
     VALUES (?, ?, ?)
     ON CONFLICT(config_id, group_id) DO UPDATE SET position = excluded.position`,
  )
    .bind(configId, groupId, position)
    .run();

  if (!upsert.success) {
    console.error('Failed to upsert sb_config_group', upsert.error);
    return errorResponse('Failed to attach group', 500);
  }

  return jsonResponse({ success: true });
}

async function handleRemoveConfigGroup(
  _request: Request,
  env: Env,
  params: Record<string, string>,
  auth: AuthContext,
): Promise<Response> {
  const configId = params.id;
  const groupId = params.groupId;
  if (!configId || !groupId) return errorResponse('Missing config or group id', 400);

  const config = await fetchConfigById(env, configId);
  if (!config) return errorResponse('Config not found', 404);
  if (!ensureCanAccessResource(auth, config.user_id)) return errorResponse('Forbidden', 403);

  const group = await fetchGroupById(env, groupId);
  if (!group) return errorResponse('Group not found', 404);
  if (!ensureCanAccessResource(auth, group.user_id)) return errorResponse('Forbidden', 403);

  const remove = await env.DB.prepare(
    `DELETE FROM sb_config_groups WHERE config_id = ? AND group_id = ?`,
  )
    .bind(configId, groupId)
    .run();

  if (!remove.success) {
    console.error('Failed to delete sb_config_group', remove.error);
    return errorResponse('Failed to detach group', 500);
  }

  return jsonResponse({ success: true });
}

async function handleGetConfig(
  request: Request,
  env: Env,
  _params: Record<string, string>,
  auth: AuthContext,
): Promise<Response> {
  const url = new URL(request.url);
  const configId = url.searchParams.get('config_id');
  if (!configId) return errorResponse('`config_id` query parameter is required', 422);

  const configRow = await fetchConfigById(env, configId);
  if (!configRow) return errorResponse('Config not found', 404);
  if (!ensureCanAccessResource(auth, configRow.user_id)) return errorResponse('Forbidden', 403);

  if (!configRow.base_config_id) {
    return errorResponse('Config is missing base_config_id', 500);
  }

  const baseConfigRow = await fetchBaseConfigById(env, configRow.base_config_id);
  if (!baseConfigRow) return errorResponse('Base config not found', 404);
  if (baseConfigRow.user_id !== configRow.user_id) {
    return errorResponse('Base config belongs to a different user than the config', 422);
  }

  const overrideSelectorTags = parseSelectorTags(configRow.selector_tags);
  const baseSelectorTags = parseSelectorTags(baseConfigRow.selector_tags);
  const selectorTags =
    overrideSelectorTags.length > 0 ? overrideSelectorTags : baseSelectorTags;
  const renderConfig = parseBaseConfig(baseConfigRow.config_json);

  const { results: groupRows } = await env.DB.prepare<ConfigGroupRow>(
    `SELECT config_id, group_id, position
       FROM sb_config_groups
       WHERE config_id = ?
       ORDER BY position ASC, group_id ASC`,
  )
    .bind(configId)
    .all();

  if (groupRows.length === 0) {
    return jsonResponse(renderConfig);
  }

  const allLinks: VpnLinkRow[] = [];
  for (const row of groupRows) {
    const group = await fetchGroupById(env, row.group_id);
    if (!group || group.user_id !== configRow.user_id) {
      continue;
    }
    const { results: links } = await env.DB.prepare<VpnLinkRow>(
      `SELECT l.id, l.user_id, l.name, l.raw_link, l.created_at, l.updated_at
         FROM vpn_links l
         INNER JOIN vpn_group_links gl ON gl.link_id = l.id
         WHERE gl.group_id = ?
         ORDER BY l.created_at ASC`,
    )
      .bind(row.group_id)
      .all();
    allLinks.push(...links);
  }

  if (allLinks.length === 0) {
    return jsonResponse(renderConfig);
  }

  const outbounds = await convertLinksToOutbounds(allLinks);
  mergeGeneratedOutbounds(renderConfig, outbounds, selectorTags);
  return jsonResponse(renderConfig);
}

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
  {
    method: 'POST',
    pattern: new URLPattern({ pathname: '/api/users' }),
    handler: requireAuth(handleCreateUser, { requireAdmin: true }),
  },
  {
    method: 'GET',
    pattern: new URLPattern({ pathname: '/api/users' }),
    handler: requireAuth(handleListUsers, { requireAdmin: true }),
  },
  {
    method: 'POST',
    pattern: new URLPattern({ pathname: '/api/links' }),
    handler: requireAuth(handleCreateLink),
  },
  {
    method: 'GET',
    pattern: new URLPattern({ pathname: '/api/links' }),
    handler: requireAuth(handleListLinks),
  },
  {
    method: 'DELETE',
    pattern: new URLPattern({ pathname: '/api/links/:id' }),
    handler: requireAuth(handleDeleteLink),
  },
  {
    method: 'POST',
    pattern: new URLPattern({ pathname: '/api/groups' }),
    handler: requireAuth(handleCreateGroup),
  },
  {
    method: 'GET',
    pattern: new URLPattern({ pathname: '/api/groups' }),
    handler: requireAuth(handleListGroups),
  },
  {
    method: 'POST',
    pattern: new URLPattern({ pathname: '/api/groups/:id/links' }),
    handler: requireAuth(handleAddGroupLinks),
  },
  {
    method: 'DELETE',
    pattern: new URLPattern({ pathname: '/api/groups/:id/links/:linkId' }),
    handler: requireAuth(handleRemoveGroupLink),
  },
  {
    method: 'POST',
    pattern: new URLPattern({ pathname: '/api/base-configs' }),
    handler: requireAuth(handleCreateBaseConfig),
  },
  {
    method: 'GET',
    pattern: new URLPattern({ pathname: '/api/base-configs' }),
    handler: requireAuth(handleListBaseConfigs),
  },
  {
    method: 'GET',
    pattern: new URLPattern({ pathname: '/api/base-configs/:id' }),
    handler: requireAuth(handleGetBaseConfig),
  },
  {
    method: 'PUT',
    pattern: new URLPattern({ pathname: '/api/base-configs/:id' }),
    handler: requireAuth(handleUpdateBaseConfig),
  },
  {
    method: 'DELETE',
    pattern: new URLPattern({ pathname: '/api/base-configs/:id' }),
    handler: requireAuth(handleDeleteBaseConfig),
  },
  {
    method: 'POST',
    pattern: new URLPattern({ pathname: '/api/configs' }),
    handler: requireAuth(handleCreateConfig),
  },
  {
    method: 'GET',
    pattern: new URLPattern({ pathname: '/api/configs' }),
    handler: requireAuth(handleListConfigs),
  },
  {
    method: 'POST',
    pattern: new URLPattern({ pathname: '/api/configs/:id/groups' }),
    handler: requireAuth(handleAttachConfigGroup),
  },
  {
    method: 'DELETE',
    pattern: new URLPattern({ pathname: '/api/configs/:id/groups/:groupId' }),
    handler: requireAuth(handleRemoveConfigGroup),
  },
  {
    method: 'GET',
    pattern: new URLPattern({ pathname: '/api/config' }),
    handler: requireAuth(handleGetConfig),
  },
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
