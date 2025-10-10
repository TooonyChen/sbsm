import type { Env } from '../lib/context';
import type { VpnLinkRow } from '../models';
import { createInClause } from '../lib/utils';

export async function fetchLinksByIds(env: Env, ids: string[]): Promise<VpnLinkRow[]> {
  if (ids.length === 0) return [];
  const { clause, bindings } = createInClause(ids);
  const statement = env.DB.prepare<VpnLinkRow>(
    `SELECT id, name, raw_link, created_at, updated_at
       FROM vpn_links
       WHERE id IN ${clause}`,
  ).bind(...bindings);
  const { results } = await statement.all();
  return results;
}
