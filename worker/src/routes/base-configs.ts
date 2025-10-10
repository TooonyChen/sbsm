import { jsonResponse, errorResponse, readJsonBody } from '../lib/http';
import { requireAuth } from '../lib/auth';
import {
  normalizeConfigInput,
  stringifyConfig,
  parseSelectorTags,
  parseBaseConfig,
} from '../lib/config';
import type { AuthContext, Env, RouteDefinition } from '../lib/context';
import type { BaseConfigRow } from '../models';
import { fetchBaseConfigById } from '../db/configs';
import { cloneTemplate } from '../template';

function formatBaseConfig(row: BaseConfigRow) {
  return {
    id: row.id,
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
  _auth: AuthContext,
): Promise<Response> {
  const body = await readJsonBody<{
    name?: string;
    description?: string;
    configJson?: unknown;
    selectorTags?: string[];
  }>(request);
  if (!body) return errorResponse('Invalid JSON payload', 400);

  const name = body.name?.trim();
  if (!name) return errorResponse('`name` is required', 422);

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
    `INSERT INTO sb_base_configs (id, name, description, config_json, selector_tags)
     VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(id, name, body.description ?? null, nowJson, selectorJson)
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
  _auth: AuthContext,
): Promise<Response> {
  const url = new URL(request.url);
  if (url.searchParams.has('user_id')) {
    console.warn('user_id filter ignored in single-admin mode');
  }

  const { results } = await env.DB.prepare<BaseConfigRow>(
    `SELECT id, name, description, config_json, selector_tags, created_at, updated_at
       FROM sb_base_configs
       ORDER BY created_at DESC`,
  ).all();
  return jsonResponse(results.map(formatBaseConfig));
}

async function handleGetBaseConfig(
  _request: Request,
  env: Env,
  params: Record<string, string>,
  _auth: AuthContext,
): Promise<Response> {
  const baseConfigId = params.id;
  if (!baseConfigId) return errorResponse('Missing base config id', 400);
  const row = await fetchBaseConfigById(env, baseConfigId);
  if (!row) return errorResponse('Base config not found', 404);
  return jsonResponse(formatBaseConfig(row));
}

async function handleUpdateBaseConfig(
  request: Request,
  env: Env,
  params: Record<string, string>,
  _auth: AuthContext,
): Promise<Response> {
  const baseConfigId = params.id;
  if (!baseConfigId) return errorResponse('Missing base config id', 400);
  const row = await fetchBaseConfigById(env, baseConfigId);
  if (!row) return errorResponse('Base config not found', 404);

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
    const newName = String(body.name).trim();
    if (newName.length === 0) return errorResponse('`name` cannot be empty', 422);
    updates.push('name = ?');
    bindings.push(newName);
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
  _auth: AuthContext,
): Promise<Response> {
  const baseConfigId = params.id;
  if (!baseConfigId) return errorResponse('Missing base config id', 400);

  const row = await fetchBaseConfigById(env, baseConfigId);
  if (!row) return errorResponse('Base config not found', 404);

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

export const baseConfigRoutes: RouteDefinition[] = [
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
];
