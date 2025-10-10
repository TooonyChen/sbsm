# Worker Usage

## Prerequisites

- Install [Wrangler](https://developers.cloudflare.com/workers/wrangler/install-and-update/) (`npm install` inside `worker/` sets it up locally).
- Create a Cloudflare D1 database and note its `database_id`.
- Update `worker/wrangler.toml` with the real `database_id`.

## Local Development

```sh
cd worker
npm install
npm run migrate           # Apply SQL schema in migrations/0001_init.sql
npm run dev -- --local    # Start a local Worker with a local D1 database
```

## Deploy

```sh
cd worker
npm run deploy
```

## API Summary

- `POST /api/users` (admin) – create a user; returns generated UUID `apiKey`.
- `GET /api/users` (admin) – list users. Add `?with_keys=1` to include API keys.
- `POST /api/links` – add a VPN link for the authenticated user (admins may pass `userId`).
- `GET /api/links` – list stored links. Admins can filter with `?user_id=<uuid>`.
- `DELETE /api/links/:id` – remove a stored link (admins can delete any).
- `POST /api/groups` – create a VPN group (optionally with initial `linkIds`).
- `GET /api/groups` – list groups (admins can filter with `?user_id=<uuid>`).
- `POST /api/groups/:id/links` – attach links to the group; send `{ linkIds: [] }`.
- `DELETE /api/groups/:id/links/:linkId` – detach a link.
- `POST /api/base-configs` – create a reusable sing-box base template (`configJson`, `selectorTags`).
- `GET /api/base-configs` – list base templates (admins can filter with `?user_id=<uuid>`).
- `PUT /api/base-configs/:id` – update base template metadata/content.
- `DELETE /api/base-configs/:id` – delete a base template (fails if configs still reference it).
- `POST /api/configs` – create a config instance referencing `baseConfigId`, override `selectorTags`, attach `groupIds`.
- `GET /api/configs` – list config instances (admins can filter by `?user_id=<uuid>`).
- `POST /api/configs/:id/groups` – attach groups or update ordering (body: `{ groupId, position? }`).
- `DELETE /api/configs/:id/groups/:groupId` – detach a group from the config.
- `GET /api/config?config_id=<uuid>` – render a config by merging its base template with attached groups.

Authenticate every request with `Authorization: Bearer <apiKey>`.

Authenticate every request with `Authorization: Bearer <apiKey>`.

### Creating a Base Template

```json
POST /api/base-configs
{
  "name": "singbox-default",
  "configJson": { "...": "full sing-box config skeleton" },
  "selectorTags": ["TCP代理", "UDP代理", "自动选择", "OpenAI", "YouTube", "漏网之鱼"]
}
```

### Creating a Config Instance

```json
POST /api/configs
{
  "name": "desktop-template",
  "baseConfigId": "<base-config-uuid>",
  "selectorTags": [],                 // optional override; empty inherits base
  "groupIds": ["<group-uuid>", "<another-group-uuid>"]
}
```

When you later call `GET /api/config?config_id=<uuid>`, the worker:

1. Loads the base template (`configJson`, `selectorTags`) and applies config-level overrides.
2. Pulls every VPN link in the attached groups (respecting ordering).
3. Converts them to sing-box outbounds and appends them.
4. Extends each selector in the chosen tag list with the new outbound tags (deduplicated).


## Supported Link Types

The converter currently understands:

- `vless://`
- `vmess://`
- `trojan://`
- `ss://`

Unsupported links are skipped (logged server-side) and simply omitted from the output. Extend `worker/src/converter.ts` to add more protocols if needed.
