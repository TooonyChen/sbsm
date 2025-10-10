export interface SingBoxConfig {
  log: Record<string, unknown>;
  dns: Record<string, unknown>;
  ntp: Record<string, unknown>;
  certificate: Record<string, unknown>;
  endpoints: unknown[];
  inbounds: unknown[];
  outbounds: unknown[];
  route: Record<string, unknown>;
  services: unknown[];
  experimental: Record<string, unknown>;
}

export const baseSingBoxTemplate: SingBoxConfig = {
  log: {},
  dns: {},
  ntp: {},
  certificate: {},
  endpoints: [],
  inbounds: [],
  outbounds: [],
  route: {},
  services: [],
  experimental: {},
};

export function cloneTemplate(): SingBoxConfig {
  return structuredClone(baseSingBoxTemplate);
}
