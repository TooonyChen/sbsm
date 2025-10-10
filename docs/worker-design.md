# SBSM (Sing Box Subscription Manager)

## Overview

- Persist VPN links, groups, base templates, and rendered configs in Cloudflare D1 (all entities identified by UUID so they can be shared directly).
- Protect administrative APIs with HTTP Basic Auth (single admin account). Credentials are supplied via Wrangler `vars`.
- Allow optional public sharing of a config via a separate `share_token` that can be rotated per config.
- When `/api/config` is requested, merge the stored base template with all VPN links belonging to the attached groups and emit a sing-box configuration.

## D1 Schema

```sql
CREATE TABLE vpn_links (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  raw_link TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE TABLE vpn_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE TABLE vpn_group_links (
  group_id TEXT NOT NULL REFERENCES vpn_groups(id) ON DELETE CASCADE,
  link_id TEXT NOT NULL REFERENCES vpn_links(id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, link_id)
);

CREATE TABLE sb_base_configs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  config_json TEXT NOT NULL,
  selector_tags TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE TABLE sb_configs (
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

CREATE TABLE sb_config_groups (
  config_id TEXT NOT NULL REFERENCES sb_configs(id) ON DELETE CASCADE,
  group_id TEXT NOT NULL REFERENCES vpn_groups(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (config_id, group_id)
);

CREATE INDEX IF NOT EXISTS idx_sb_config_groups_position ON sb_config_groups(config_id, position);
```

## API Surface

| Method | Path | Auth | Description |
| ------ | ---- | ---- | ----------- |
| `POST` | `/api/links` | Basic | Create a VPN link. |
| `GET`  | `/api/links` | Basic | List links. |
| `DELETE` | `/api/links/:id` | Basic | Delete a link. |
| `POST` | `/api/groups` | Basic | Create a group (optional list of link IDs). |
| `GET`  | `/api/groups` | Basic | List groups. |
| `POST` | `/api/groups/:id/links` | Basic | Attach links to a group. |
| `DELETE` | `/api/groups/:id/links/:linkId` | Basic | Remove a link from a group. |
| `POST` | `/api/base-configs` | Basic | Create a base template (store JSON + selector tags). |
| `GET`  | `/api/base-configs` | Basic | List base templates. |
| `PUT`  | `/api/base-configs/:id` | Basic | Update template metadata/content. |
| `DELETE` | `/api/base-configs/:id` | Basic | Delete a base template (fails if configs reference it). |
| `POST` | `/api/configs` | Basic | Create a config instance; optional groups + share settings. |
| `GET`  | `/api/configs` | Basic | List configs (includes share status/token). |
| `POST` | `/api/configs/:id/groups` | Basic | Attach groups to a config (ordered). |
| `DELETE` | `/api/configs/:id/groups/:groupId` | Basic | Remove a group from a config. |
| `POST` | `/api/configs/:id/share` | Basic | Enable/disable sharing and regenerate tokens. |
| `GET` | `/api/config` | Basic or Share Token | Render config (`config_id` required; `share` token optional). |

- All administrative endpoints require a valid Basic Auth header (`Authorization: Basic …`) that matches the configured admin credentials.
- `/api/config` accepts either Basic Auth or a valid `share` query parameter matching the stored `share_token` when sharing is enabled.

## Config Generation

1. Fetch the requested config (`sb_configs`) and its associated base template (`sb_base_configs`).
2. Determine selector tags—use config-level overrides when present, otherwise inherit from the base template.
3. Resolve all attached groups (`sb_config_groups` ordered by `position`) and collect their links (`vpn_links` via `vpn_group_links`).
4. Convert each VPN link into a sing-box outbound using the converter.
5. Append generated outbounds to the base template, expanding any configured selector tags with the outbound tags (deduplicated).
6. Return the merged configuration as JSON.

## Implementation Notes

- Admin credentials are injected via Wrangler `vars` (`ADMIN_USERNAME` and `ADMIN_PASSWORD_HASH`, SHA-256 hex of the password). Without them the Worker refuses authentication.
- Share tokens are UUID strings; regenerating a token invalidates previous share URLs immediately.
- All IDs remain UUIDs so you can safely share `config_id`/`share_token` combinations with friends.
- Utilities for HTTP handling, Basic Auth, and D1 helpers live under `worker/src/lib` and `worker/src/db`, keeping route modules concise.
- Consider rate limiting or logging if the API is exposed beyond personal use.
