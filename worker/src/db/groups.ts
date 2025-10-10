import type { Env } from '../lib/context';
import type { VpnGroupRow } from '../models';
import { createInClause } from '../lib/utils';

export async function fetchGroupById(env: Env, groupId: string): Promise<VpnGroupRow | null> {
  return (
    (await env.DB.prepare<VpnGroupRow>(
      `SELECT id, name, description, created_at, updated_at
         FROM vpn_groups
         WHERE id = ?`,
    )
      .bind(groupId)
      .first()) ?? null
  );
}

export async function fetchGroupsByIds(env: Env, ids: string[]): Promise<VpnGroupRow[]> {
  if (ids.length === 0) return [];
  const { clause, bindings } = createInClause(ids);
  const statement = env.DB.prepare<VpnGroupRow>(
    `SELECT id, name, description, created_at, updated_at
       FROM vpn_groups
       WHERE id IN ${clause}`,
  ).bind(...bindings);
  const { results } = await statement.all();
  return results;
}
