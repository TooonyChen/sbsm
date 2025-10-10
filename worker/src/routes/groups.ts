import { jsonResponse, errorResponse, readJsonBody } from '../lib/http';
import { requireAuth } from '../lib/auth';
import type { AuthContext, Env, RouteDefinition } from '../lib/context';
import type { VpnGroupRow } from '../models';
import { fetchLinksByIds } from '../db/links';
import { fetchGroupById } from '../db/groups';

async function handleCreateGroup(
  request: Request,
  env: Env,
  _params: Record<string, string>,
  _auth: AuthContext,
): Promise<Response> {
  const body = await readJsonBody<{
    name?: string;
    description?: string;
    linkIds?: string[];
  }>(request);
  if (!body) return errorResponse('Invalid JSON payload', 400);

  const name = body.name?.trim();
  if (!name) return errorResponse('`name` is required', 422);

  const id = crypto.randomUUID();
  const description = body.description?.trim() ?? null;

  const insert = await env.DB.prepare(
    `INSERT INTO vpn_groups (id, name, description) VALUES (?, ?, ?)`,
  )
    .bind(id, name, description)
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
  _auth: AuthContext,
): Promise<Response> {
  const url = new URL(request.url);
  if (url.searchParams.has('user_id')) {
    console.warn('user_id filter ignored in single-admin mode');
  }

  const { results } = await env.DB.prepare<VpnGroupRow>(
    `SELECT id, name, description, created_at, updated_at
       FROM vpn_groups
       ORDER BY created_at DESC`,
  ).all();
  return jsonResponse(results);
}

async function handleAddGroupLinks(
  request: Request,
  env: Env,
  params: Record<string, string>,
  _auth: AuthContext,
): Promise<Response> {
  const groupId = params.id;
  if (!groupId) return errorResponse('Missing group id', 400);

  const group = await fetchGroupById(env, groupId);
  if (!group) return errorResponse('Group not found', 404);

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
  _auth: AuthContext,
): Promise<Response> {
  const groupId = params.id;
  const linkId = params.linkId;
  if (!groupId || !linkId) return errorResponse('Missing group or link id', 400);

  const group = await fetchGroupById(env, groupId);
  if (!group) return errorResponse('Group not found', 404);

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

export const groupRoutes: RouteDefinition[] = [
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
];
