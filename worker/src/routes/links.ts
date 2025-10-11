import { jsonResponse, errorResponse, readJsonBody } from '../lib/http';
import { requireAuth } from '../lib/auth';
import { deriveNameFromLink } from '../lib/utils';
import type { AuthContext, Env, RouteDefinition } from '../lib/context';
import type { VpnLinkRow } from '../models';

async function handleCreateLink(
  request: Request,
  env: Env,
  _params: Record<string, string>,
  _auth: AuthContext,
): Promise<Response> {
  const body = await readJsonBody<{
    url?: string;
    name?: string;
  }>(request);
  if (!body) return errorResponse('Invalid JSON payload', 400);

  const rawLink = body.url?.trim();
  if (!rawLink) return errorResponse('`url` is required', 422);

  const id = crypto.randomUUID();
  const providedName = body.name?.trim();
  const name =
    providedName && providedName.length > 0 ? providedName : deriveNameFromLink(rawLink).trim();

  const insert = await env.DB.prepare(
    `INSERT INTO vpn_links (id, name, raw_link) VALUES (?, ?, ?)`,
  )
    .bind(id, name, rawLink)
    .run();

  if (!insert.success) {
    console.error('Failed to insert vpn_link', insert.error);
    return errorResponse('Failed to store link', 500);
  }

  const { results } = await env.DB.prepare<VpnLinkRow>(
    `SELECT id, name, raw_link, created_at, updated_at
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
  _auth: AuthContext,
): Promise<Response> {
  const url = new URL(request.url);
  if (url.searchParams.has('user_id')) {
    console.warn('user_id filter ignored in single-admin mode');
  }

  const { results } = await env.DB.prepare<VpnLinkRow>(
    `SELECT id, name, raw_link, created_at, updated_at
       FROM vpn_links
       ORDER BY created_at DESC`,
  ).all();
  return jsonResponse(results);
}

async function handleDeleteLink(
  _request: Request,
  env: Env,
  params: Record<string, string>,
  _auth: AuthContext,
): Promise<Response> {
  const linkId = params.id;
  if (!linkId) return errorResponse('Missing link id', 400);

  const link = await env.DB.prepare<VpnLinkRow>(
    `SELECT id, name, raw_link, created_at, updated_at
       FROM vpn_links WHERE id = ?`,
  )
    .bind(linkId)
    .first();

  if (!link) {
    return errorResponse('Link not found', 404);
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

async function handleUpdateLink(
  request: Request,
  env: Env,
  params: Record<string, string>,
  _auth: AuthContext,
): Promise<Response> {
  const linkId = params.id;
  if (!linkId) return errorResponse('Missing link id', 400);

  const existing = await env.DB.prepare<VpnLinkRow>(
    `SELECT id, name, raw_link, created_at, updated_at FROM vpn_links WHERE id = ?`,
  )
    .bind(linkId)
    .first();
  if (!existing) return errorResponse('Link not found', 404);

  const body = await readJsonBody<{
    url?: string;
    name?: string | null;
  }>(request);
  if (!body) return errorResponse('Invalid JSON payload', 400);

  const rawLink = body.url !== undefined ? body.url.trim() : existing.raw_link;
  if (!rawLink) return errorResponse('`url` is required', 422);

  let name: string;
  if (body.name !== undefined) {
    const trimmed = body.name?.trim() ?? '';
    if (trimmed.length === 0) {
      name = deriveNameFromLink(rawLink).trim();
    } else {
      name = trimmed;
    }
  } else {
    name = existing.name.trim().length > 0 ? existing.name : deriveNameFromLink(rawLink).trim();
  }

  const update = await env.DB.prepare(
    `UPDATE vpn_links SET name = ?, raw_link = ?, updated_at = strftime('%s','now') WHERE id = ?`,
  )
    .bind(name, rawLink, linkId)
    .run();

  if (!update.success) {
    console.error('Failed to update vpn_link', update.error);
    return errorResponse('Failed to update link', 500);
  }

  const updated = await env.DB.prepare<VpnLinkRow>(
    `SELECT id, name, raw_link, created_at, updated_at FROM vpn_links WHERE id = ?`,
  )
    .bind(linkId)
    .first();

  if (!updated) return errorResponse('Link not found after update', 500);

  return jsonResponse(updated);
}

export const linkRoutes: RouteDefinition[] = [
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
    method: 'PUT',
    pattern: new URLPattern({ pathname: '/api/links/:id' }),
    handler: requireAuth(handleUpdateLink),
  },
];
