export interface VpnLinkRow {
  id: string;
  name: string;
  raw_link: string;
  created_at: number;
  updated_at: number;
}

export interface VpnGroupRow {
  id: string;
  name: string;
  description: string | null;
  created_at: number;
  updated_at: number;
}

export interface BaseConfigRow {
  id: string;
  name: string;
  description: string | null;
  config_json: string;
  selector_tags: string;
  created_at: number;
  updated_at: number;
}

export interface SbConfigRow {
  id: string;
  base_config_id: string;
  name: string;
  description: string | null;
  selector_tags: string;
  share_token: string | null;
  share_enabled: number;
  created_at: number;
  updated_at: number;
}

export interface ConfigGroupRow {
  config_id: string;
  group_id: string;
  position: number;
}
