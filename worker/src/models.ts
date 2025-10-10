export type Role = 'admin' | 'user';

export interface UserRow {
  id: string;
  username: string;
  api_key: string;
  role: Role;
  created_at: number;
}

export interface VpnLinkRow {
  id: string;
  user_id: string;
  name: string;
  raw_link: string;
  created_at: number;
  updated_at: number;
}

export interface VpnGroupRow {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  created_at: number;
  updated_at: number;
}

export interface BaseConfigRow {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  config_json: string;
  selector_tags: string;
  created_at: number;
  updated_at: number;
}

export interface SbConfigRow {
  id: string;
  user_id: string;
  base_config_id: string;
  name: string;
  description: string | null;
  selector_tags: string;
  created_at: number;
  updated_at: number;
}

export interface ConfigGroupRow {
  config_id: string;
  group_id: string;
  position: number;
}
