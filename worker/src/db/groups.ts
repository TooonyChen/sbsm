import type { Env } from '../lib/context';
import type { VpnGroupRow, VpnGroupSubscriptionRow } from '../models';
import { createInClause } from '../lib/utils';

export async function fetchGroupById(env: Env, groupId: string): Promise<VpnGroupRow | null> {
  return (
    (await env.DB.prepare<VpnGroupRow>(
      `SELECT id, name, description, type, created_at, updated_at
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
    `SELECT id, name, description, type, created_at, updated_at
       FROM vpn_groups
       WHERE id IN ${clause}`,
  ).bind(...bindings);
  const { results } = await statement.all();
  return results;
}

export async function fetchGroupSubscription(
  env: Env,
  groupId: string,
): Promise<VpnGroupSubscriptionRow | null> {
  return (
    (await env.DB.prepare<VpnGroupSubscriptionRow>(
      `SELECT group_id,
              subscription_url,
              cached_payload,
              cached_node_count,
              last_fetched_at,
              last_error,
              exclude_keywords,
              created_at,
              updated_at
         FROM vpn_group_subscriptions
        WHERE group_id = ?`,
    )
      .bind(groupId)
      .first()) ?? null
  );
}
