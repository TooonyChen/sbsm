import { jsonResponse, errorResponse, readJsonBody, CORS_HEADERS } from '../lib/http';
import { requireAuth } from '../lib/auth';
import {
  mergeGeneratedOutbounds,
  parseBaseConfig,
  parseSelectorTags,
} from '../lib/config';
import type { AuthContext, Env, RouteDefinition } from '../lib/context';
import type { SbConfigRow, VpnLinkRow } from '../models';
import { fetchLinksByIds } from '../db/links';
import { fetchGroupById, fetchGroupsByIds } from '../db/groups';
import {
  fetchBaseConfigById,
  fetchConfigById,
  fetchConfigGroups,
} from '../db/configs';
import { convertLinksToOutbounds } from '../converter';
import { authenticateBasic } from '../lib/auth';

async function handleCreateConfig(
  request: Request,
  env: Env,
  _params: Record<string, string>,
  _auth: AuthContext,
): Promise<Response> {
  const body = await readJsonBody<{
    name?: string;
    description?: string;
    baseConfigId?: string;
    selectorTags?: string[];
    groupIds?: string[];
    shareEnabled?: boolean;
    shareToken?: string;
  }>(request);
  if (!body) return errorResponse('Invalid JSON payload', 400);

  const name = body.name?.trim();
  if (!name) return errorResponse('`name` is required', 422);

  const description = body.description?.trim() ?? null;
  const baseConfigId = body.baseConfigId?.trim();
  if (!baseConfigId) return errorResponse('`baseConfigId` is required', 422);

  const baseConfigRow = await fetchBaseConfigById(env, baseConfigId);
  if (!baseConfigRow) return errorResponse('Base config not found', 404);

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
  const shareEnabled = body.shareEnabled === true;
  const shareToken = shareEnabled
    ? body.shareToken?.trim() || crypto.randomUUID()
    : null;

  const insert = await env.DB.prepare(
    `INSERT INTO sb_configs (id, base_config_id, name, description, selector_tags, share_token, share_enabled)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, baseConfigId, name, description, selectorJson, shareToken, shareEnabled ? 1 : 0)
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
      base_config_id: config.base_config_id,
      name: config.name,
      description: config.description,
      selector_tags: selectorTags,
      share_enabled: shareEnabled,
      share_token: shareToken,
      created_at: config.created_at,
      updated_at: config.updated_at,
    },
    201,
  );
}

function formatConfigRow(row: SbConfigRow & { base_config_name: string | null }) {
  return {
    id: row.id,
    base_config_id: row.base_config_id,
    base_config_name: row.base_config_name,
    name: row.name,
    description: row.description,
    selector_tags: parseSelectorTags(row.selector_tags),
    share_enabled: Boolean(row.share_enabled),
    share_token: row.share_token,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function handleListConfigs(
  request: Request,
  env: Env,
  _params: Record<string, string>,
  _auth: AuthContext,
): Promise<Response> {
  const url = new URL(request.url);
  if (url.searchParams.has('user_id')) {
    console.warn('user_id filter ignored in single-admin mode');
  }

  const { results } = await env.DB.prepare<
    SbConfigRow & { base_config_name: string | null }
  >(
    `SELECT sc.id,
            sc.base_config_id,
            sc.name,
            sc.description,
            sc.selector_tags,
            sc.share_token,
            sc.share_enabled,
            sc.created_at,
            sc.updated_at,
            bc.name AS base_config_name
       FROM sb_configs sc
       LEFT JOIN sb_base_configs bc ON bc.id = sc.base_config_id
       ORDER BY sc.created_at DESC`,
  ).all();
  return jsonResponse(results.map(formatConfigRow));
}

async function handleAttachConfigGroup(
  request: Request,
  env: Env,
  params: Record<string, string>,
  _auth: AuthContext,
): Promise<Response> {
  const configId = params.id;
  if (!configId) return errorResponse('Missing config id', 400);

  const config = await fetchConfigById(env, configId);
  if (!config) return errorResponse('Config not found', 404);

  const body = await readJsonBody<{ groupId?: string; position?: number }>(request);
  if (!body) return errorResponse('Invalid JSON payload', 400);
  const groupId = body.groupId?.trim();
  if (!groupId) return errorResponse('`groupId` is required', 422);

  const group = await fetchGroupById(env, groupId);
  if (!group) return errorResponse('Group not found', 404);

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
  _auth: AuthContext,
): Promise<Response> {
  const configId = params.id;
  const groupId = params.groupId;
  if (!configId || !groupId) return errorResponse('Missing config or group id', 400);

  const config = await fetchConfigById(env, configId);
  if (!config) return errorResponse('Config not found', 404);

  const group = await fetchGroupById(env, groupId);
  if (!group) return errorResponse('Group not found', 404);

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

async function handleUpdateConfigShare(
  request: Request,
  env: Env,
  params: Record<string, string>,
  _auth: AuthContext,
): Promise<Response> {
  const configId = params.id;
  if (!configId) return errorResponse('Missing config id', 400);
  const config = await fetchConfigById(env, configId);
  if (!config) return errorResponse('Config not found', 404);

  const body = await readJsonBody<{
    shareEnabled?: boolean;
    regenerate?: boolean;
    shareToken?: string;
  }>(request);
  if (!body) return errorResponse('Invalid JSON payload', 400);

  const enable = body.shareEnabled ?? Boolean(config.share_enabled);
  let shareToken = config.share_token;
  if (enable) {
    if (body.shareToken) {
      const trimmed = body.shareToken.trim();
      if (trimmed.length === 0) {
        return errorResponse('`shareToken` cannot be empty when provided', 422);
      }
      shareToken = trimmed;
    }
    if (body.regenerate || !shareToken) {
      shareToken = crypto.randomUUID();
    }
  } else {
    shareToken = null;
  }

  const update = await env.DB.prepare(
    `UPDATE sb_configs
        SET share_enabled = ?,
            share_token = ?,
            updated_at = strftime('%s','now')
      WHERE id = ?`,
  )
    .bind(enable ? 1 : 0, shareToken, configId)
    .run();

  if (!update.success) {
    console.error('Failed to update config share settings', update.error);
    return errorResponse('Failed to update share settings', 500);
  }

  return jsonResponse({ shareEnabled: enable, shareToken });
}

async function handleGetConfig(
  request: Request,
  env: Env,
  _params: Record<string, string>,
  _auth: AuthContext,
): Promise<Response> {
  const url = new URL(request.url);
  const configId = url.searchParams.get('config_id');
  if (!configId) return errorResponse('`config_id` query parameter is required', 422);

  const configRow = await fetchConfigById(env, configId);
  if (!configRow) return errorResponse('Config not found', 404);
  const shareToken = url.searchParams.get('share');

  let authenticated = false;
  if (shareToken && configRow.share_enabled && configRow.share_token) {
    if (shareToken === configRow.share_token) {
      authenticated = true;
    } else {
      return errorResponse('Invalid share token', 403);
    }
  }

  if (!authenticated) {
    const username = await authenticateBasic(request, env);
    if (!username) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: {
          ...CORS_HEADERS,
          'content-type': 'application/json; charset=utf-8',
          'WWW-Authenticate': 'Basic realm="sing-box-admin"',
        },
      });
    }
  }

  if (!configRow.base_config_id) {
    return errorResponse('Config is missing base_config_id', 500);
  }

  const baseConfigRow = await fetchBaseConfigById(env, configRow.base_config_id);
  if (!baseConfigRow) return errorResponse('Base config not found', 404);

  const overrideSelectorTags = parseSelectorTags(configRow.selector_tags);
  const baseSelectorTags = parseSelectorTags(baseConfigRow.selector_tags);
  const selectorTags =
    overrideSelectorTags.length > 0 ? overrideSelectorTags : baseSelectorTags;
  const renderConfig = parseBaseConfig(baseConfigRow.config_json);

  const groupRows = await fetchConfigGroups(env, configId);
  if (groupRows.length === 0) {
    return jsonResponse(renderConfig);
  }

  const allLinks: VpnLinkRow[] = [];
  for (const row of groupRows) {
    const group = await fetchGroupById(env, row.group_id);
    if (!group) {
      continue;
    }
    const { results: links } = await env.DB.prepare(
      `SELECT l.id, l.name, l.raw_link, l.created_at, l.updated_at
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

export const configRoutes: RouteDefinition[] = [
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
    method: 'POST',
    pattern: new URLPattern({ pathname: '/api/configs/:id/share' }),
    handler: requireAuth(handleUpdateConfigShare),
  },
  {
    method: 'GET',
    pattern: new URLPattern({ pathname: '/api/config' }),
    handler: handleGetConfig,
  },
];
