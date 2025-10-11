import type { Env } from '../lib/context';
import type { VpnGroupSubscriptionRow, VpnLinkRow } from '../models';
import { deriveNameFromLink } from './utils';
import { fetchGroupSubscription } from '../db/groups';

const SUBSCRIPTION_CACHE_TTL_SECONDS = 300;
export const DEFAULT_EXCLUDE_KEYWORDS = ['流量', '套餐', '到期', '剩余'];

function cleanKeywords(input: string[]): string[] {
  const trimmed = input
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  const unique = Array.from(new Set(trimmed));
  return unique.length > 0 ? unique : [...DEFAULT_EXCLUDE_KEYWORDS];
}

export function parseExcludeKeywords(raw: string | null | undefined): string[] {
  if (!raw) return [...DEFAULT_EXCLUDE_KEYWORDS];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return cleanKeywords(parsed.map((value) => String(value)));
    }
  } catch {
    // fall through
  }
  return [...DEFAULT_EXCLUDE_KEYWORDS];
}

export function normalizeExcludeKeywordsInput(input: unknown): string[] {
  if (Array.isArray(input)) {
    return cleanKeywords(input.map((value) => String(value)));
  }
  if (typeof input === 'string') {
    const splits = input
      .split(/[\n,]/)
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
    return cleanKeywords(splits);
  }
  return [...DEFAULT_EXCLUDE_KEYWORDS];
}

interface ResolveOptions {
  forceRefresh?: boolean;
}

interface ResolveResult {
  links: VpnLinkRow[];
  metadata: VpnGroupSubscriptionRow | null;
  refreshed: boolean;
}

export async function resolveSubscriptionLinks(
  env: Env,
  groupId: string,
  options: ResolveOptions = {},
): Promise<ResolveResult> {
  const info = await fetchGroupSubscription(env, groupId);
  if (!info) {
    return { links: [], metadata: null, refreshed: false };
  }

  const excludeKeywords = parseExcludeKeywords(info.exclude_keywords);
  const now = Math.floor(Date.now() / 1000);
  const forceRefresh = options.forceRefresh === true;
  const shouldRefresh =
    forceRefresh ||
    !info.last_fetched_at ||
    now - info.last_fetched_at >= SUBSCRIPTION_CACHE_TTL_SECONDS;

  let refreshed = false;
  let payload = info.cached_payload;
  let metadata = info;
  let filteredLinks: VpnLinkRow[] = [];

  if (shouldRefresh) {
    try {
      const response = await fetch(info.subscription_url);
      if (!response.ok) {
        throw new Error(`Subscription responded with ${response.status}`);
      }
      const body = await response.text();
      payload = body;
      const refreshedLinks = convertPayloadToLinks(body, groupId, excludeKeywords);
      const nodeCount = refreshedLinks.length;
      await env.DB.prepare(
        `UPDATE vpn_group_subscriptions
            SET cached_payload = ?, cached_node_count = ?, last_fetched_at = ?, last_error = NULL
          WHERE group_id = ?`,
      )
        .bind(body, nodeCount, now, groupId)
        .run();
      metadata = {
        ...info,
        cached_payload: body,
        cached_node_count: nodeCount,
        last_fetched_at: now,
        last_error: null,
        updated_at: now,
      };
      refreshed = true;
      filteredLinks = refreshedLinks;
    } catch (error) {
      console.error('Failed to refresh subscription group', {
        groupId,
        message: (error as Error).message,
      });
      await env.DB.prepare(
        `UPDATE vpn_group_subscriptions
            SET last_error = ?, updated_at = strftime('%s','now')
          WHERE group_id = ?`,
      )
        .bind((error as Error).message, groupId)
        .run();
      metadata = {
        ...info,
        last_error: (error as Error).message,
        updated_at: Math.floor(Date.now() / 1000),
      };
    }
  }

  if (!payload) {
    return { links: [], metadata, refreshed };
  }

  if (filteredLinks.length === 0) {
    filteredLinks = convertPayloadToLinks(payload, groupId, excludeKeywords);
  }
  if (metadata && metadata.cached_node_count !== filteredLinks.length) {
    metadata = {
      ...metadata,
      cached_node_count: filteredLinks.length,
    };
    await env.DB.prepare(
      `UPDATE vpn_group_subscriptions SET cached_node_count = ? WHERE group_id = ?`,
    )
      .bind(filteredLinks.length, groupId)
      .run();
  }
  return { links: filteredLinks, metadata, refreshed };
}

export function convertPayloadToLinks(
  payload: string,
  groupId: string,
  excludeKeywords: string[] = [],
): VpnLinkRow[] {
  const entries = extractSubscriptionEntries(payload, excludeKeywords);

  const timestamp = Math.floor(Date.now() / 1000);
  return entries.map((entry, index) => ({
    id: `subscription:${groupId}:${index}`,
    name: deriveNameFromLink(entry),
    raw_link: entry,
    created_at: timestamp,
    updated_at: timestamp,
  }));
}

function extractSubscriptionEntries(payload: string, excludeKeywords: string[]): string[] {
  const decoded = decodeSubscriptionPayload(payload);
  const keywords = cleanKeywords(excludeKeywords);
  return decoded
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => {
      if (!line.length) return false;
      if (keywords.length === 0) return true;
      const derivedName = deriveNameFromLink(line);
      return !keywords.some(
        (keyword) =>
          keyword.length > 0 &&
          (derivedName.includes(keyword) || line.includes(keyword)),
      );
    });
}

function decodeSubscriptionPayload(payload: string): string {
  const trimmed = payload.trim();
  if (!trimmed) return '';
  try {
    return decodeBase64(trimmed);
  } catch {
    return trimmed;
  }
}

function decodeBase64(data: string): string {
  const normalized = data.replace(/\s+/g, '');
  const sanitized = normalized.replace(/-/g, '+').replace(/_/g, '/');
  const padding = sanitized.length % 4;
  const padded =
    padding === 0 ? sanitized : sanitized + '='.repeat((4 - padding) % 4);
  try {
    return atob(padded);
  } catch (error) {
    throw new Error(`Failed to decode base64 payload: ${(error as Error).message}`);
  }
}
