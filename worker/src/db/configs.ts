import type { Env } from '../lib/context';
import type { BaseConfigRow, ConfigGroupRow, SbConfigRow } from '../models';

export async function fetchConfigById(env: Env, configId: string): Promise<SbConfigRow | null> {
  return (
    (await env.DB.prepare<SbConfigRow>(
      `SELECT id, base_config_id, name, description, selector_tags, share_token, share_enabled, created_at, updated_at
         FROM sb_configs
         WHERE id = ?`,
    )
      .bind(configId)
      .first()) ?? null
  );
}

export async function fetchBaseConfigById(
  env: Env,
  baseConfigId: string,
): Promise<BaseConfigRow | null> {
  return (
    (await env.DB.prepare<BaseConfigRow>(
      `SELECT id, name, description, config_json, selector_tags, created_at, updated_at
         FROM sb_base_configs
         WHERE id = ?`,
    )
      .bind(baseConfigId)
      .first()) ?? null
  );
}

export async function fetchConfigGroups(
  env: Env,
  configId: string,
): Promise<ConfigGroupRow[]> {
  const { results } = await env.DB.prepare<ConfigGroupRow>(
    `SELECT config_id, group_id, position
       FROM sb_config_groups
       WHERE config_id = ?
       ORDER BY position ASC, group_id ASC`,
  )
    .bind(configId)
    .all();
  return results;
}
