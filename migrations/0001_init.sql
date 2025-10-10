-- Initial schema for sing-box worker

CREATE TABLE IF NOT EXISTS vpn_links (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  raw_link TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS vpn_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS vpn_group_links (
  group_id TEXT NOT NULL REFERENCES vpn_groups(id) ON DELETE CASCADE,
  link_id TEXT NOT NULL REFERENCES vpn_links(id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, link_id)
);

CREATE TABLE IF NOT EXISTS sb_base_configs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  config_json TEXT NOT NULL,
  selector_tags TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS sb_configs (
  id TEXT PRIMARY KEY,
  base_config_id TEXT NOT NULL REFERENCES sb_base_configs(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  description TEXT,
  selector_tags TEXT NOT NULL DEFAULT '[]',
  share_token TEXT,
  share_enabled INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS sb_config_groups (
  config_id TEXT NOT NULL REFERENCES sb_configs(id) ON DELETE CASCADE,
  group_id TEXT NOT NULL REFERENCES vpn_groups(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (config_id, group_id)
);

CREATE INDEX IF NOT EXISTS idx_sb_config_groups_position ON sb_config_groups(config_id, position);
