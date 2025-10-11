import { cloneTemplate, type SingBoxConfig } from '../template';

export function parseSelectorTags(raw: string): string[] {
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

export function parseBaseConfig(raw: string): SingBoxConfig {
  try {
    const parsed = JSON.parse(raw) as SingBoxConfig;
    if (parsed && typeof parsed === 'object') {
      if (!Array.isArray(parsed.outbounds)) parsed.outbounds = [];
      stripUnsupportedOutboundFields(parsed);
      return parsed;
    }
  } catch (error) {
    console.error('Failed to parse base_config JSON', error);
  }
  const fallback = cloneTemplate();
  fallback.outbounds = [];
  stripUnsupportedOutboundFields(fallback);
  return fallback;
}

export function normalizeConfigInput(input: unknown): SingBoxConfig {
  if (typeof input === 'string') {
    return parseBaseConfig(input);
  }
  if (input && typeof input === 'object') {
    const cloned = JSON.parse(JSON.stringify(input)) as SingBoxConfig;
    if (!cloned.outbounds || !Array.isArray(cloned.outbounds)) {
      cloned.outbounds = [];
    }
    stripUnsupportedOutboundFields(cloned);
    return cloned;
  }
  const fallback = cloneTemplate();
  stripUnsupportedOutboundFields(fallback);
  return fallback;
}

export function stringifyConfig(config: SingBoxConfig): string {
  return JSON.stringify(config);
}

export function mergeGeneratedOutbounds(
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

export function appendUniqueStrings(target: string[], values: string[]): void {
  const seen = new Set<string>(target.filter((item) => typeof item === 'string'));
  for (const value of values) {
    if (!seen.has(value)) {
      target.push(value);
      seen.add(value);
    }
  }
}

export function stripUnsupportedOutboundFields(config: SingBoxConfig): void {
  if (!Array.isArray(config.outbounds)) return;
  for (const outbound of config.outbounds) {
    if (!outbound || typeof outbound !== 'object') continue;
    delete (outbound as Record<string, unknown>)['domain_resolver'];
  }
}
