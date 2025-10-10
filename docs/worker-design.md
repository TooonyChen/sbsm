# Cloudflare Worker Architecture

## Overview

- Persist VPN subscription links in Cloudflare D1 per user.
- Convert stored links into sing-box outbounds and merge with the `sb.json` template.
- Expose authenticated HTTP APIs:
  - Administrative endpoints to manage users and their links.
  - User-facing endpoint to fetch the generated sing-box configuration.
- Authenticate requests by requiring a UUID API key (admin keys carry elevated privileges).

## D1 Schema

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  api_key TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK(role IN ('admin', 'user')),
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE TABLE vpn_links (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  raw_link TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE TABLE vpn_groups (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  config_json TEXT NOT NULL,
  selector_tags TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE TABLE sb_configs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  base_config_id TEXT NOT NULL REFERENCES sb_base_configs(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  description TEXT,
  selector_tags TEXT NOT NULL DEFAULT '[]', -- overrides; empty => inherit from base config
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE TABLE sb_config_groups (
  config_id TEXT NOT NULL REFERENCES sb_configs(id) ON DELETE CASCADE,
  group_id TEXT NOT NULL REFERENCES vpn_groups(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (config_id, group_id)
);
```

## API Surface

| Method | Path | Auth | Description |
| ------ | ---- | ---- | ----------- |
| `POST` | `/api/users` | Admin | Create a new user; auto-generate UUID `id`/`api_key`. |
| `GET`  | `/api/users` | Admin | List users and metadata (optionally include API keys). |
| `POST` | `/api/links` | Admin/User | Create a VPN link for the authenticated user (admins can target any user). |
| `GET`  | `/api/links` | Admin/User | Return stored VPN links (admins can filter by `user_id`). |
| `DELETE` | `/api/links/:id` | Admin/User | Remove a link (admins can remove any). |
| `POST` | `/api/groups` | Admin/User | Create a VPN group and optionally seed link membership. |
| `GET`  | `/api/groups` | Admin/User | List groups for the requester (admins can filter by `user_id`). |
| `POST` | `/api/groups/:id/links` | Admin/User | Attach one or more links to an existing group. |
| `DELETE` | `/api/groups/:id/links/:linkId` | Admin/User | Remove a link from a group. |
| `POST` | `/api/base-configs` | Admin/User | Create reusable sing-box base templates (JSON + selector tags). |
| `GET`  | `/api/base-configs` | Admin/User | List base templates (admins can filter by `user_id`). |
| `PUT`  | `/api/base-configs/:id` | Admin/User | Update base template metadata/content. |
| `DELETE` | `/api/base-configs/:id` | Admin/User | Remove a base template (blocked while configs reference it). |
| `POST` | `/api/configs` | Admin/User | Create a config instance bound to `baseConfigId` with optional selector overrides and groups. |
| `GET`  | `/api/configs` | Admin/User | List config instances (admins can filter by `user_id`). |
| `POST` | `/api/configs/:id/groups` | Admin/User | Attach/detach groups to a template and control order. |
| `DELETE` | `/api/configs/:id/groups/:groupId` | Admin/User | Remove a group from a template. |
| `GET` | `/api/config` | Admin/User | Return rendered sing-box config by merging template + group links (`config_id` required). |

- Authentication: `Authorization: Bearer <uuid-api-key>` header. Missing/invalid keys yield `401`.
- Role enforcement: `admin` role can manage all users/links; `user` role limited to own records.

## Config Generation

1. Identify the target template via `config_id` (admins may render templates owning to other users).
2. Resolve the associated base template from `sb_base_configs`, parse its `config_json`, and use it as the starting structure.
3. Determine selector tags: if the config instance has a non-empty `selector_tags` override, use it; otherwise inherit the list from the base template.
4. Load all VPN groups attached to the config (`sb_config_groups`), respecting stored order, and collect their VPN links.
5. Convert the links into sing-box `outbounds` via the converter.
6. Append generated outbounds and extend each selector in the chosen tag list, deduplicating outbound tags while preserving original order.
7. Return the merged configuration to the caller.

## Implementation Notes

- Worker stack: TypeScript + Wrangler (module syntax). Base templates now live in D1; seed defaults via migrations or admin endpoints as needed.
- Use `nanoid` or `uuid` for ID generation (via `crypto.randomUUID()` in Workers runtime).
- Centralize request parsing, response helpers, and error handling (e.g. `JsonResponse`).
- Provide unit-style tests using `wrangler d1 execute --local` during development if desired.
- Consider storing hashed `api_key` (SHA-256) to avoid leaking raw keys if the DB is compromised.
- Add rate limiting / logging later if needed; initial version can omit.
