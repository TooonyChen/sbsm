# SBSM Usage

## Prerequisites

- Install [Wrangler](https://developers.cloudflare.com/workers/wrangler/install-and-update/) (`npm install` inside `worker/`).
- Create a Cloudflare D1 database and note the `database_id`.
- Edit `worker/wrangler.toml`:
  - Set `database_id` under `[[d1_databases]]`.
  - Provide `ADMIN_USERNAME` (plain text) and `ADMIN_PASSWORD_HASH` (SHA-256 hex of your admin password).

To hash a password locally:

```sh
echo -n 'your-password' | shasum -a 256
```

Use the resulting hex string (without the trailing `-`).

## Local Development

```sh
cd worker
npm install
npm run migrate           # apply migrations/0001_init.sql to local D1
npm run dev -- --local    # start the SBSM dev server with local bindings
```

## Deploy

```sh
cd worker
npm run deploy
```

## Authentication

- Administrative endpoints require HTTP Basic Auth. Set `Authorization: Basic <base64("username:password")>`.
- `/api/config` accepts either Basic Auth or a valid `share` token when sharing is enabled for the requested config.

## API Summary

- `POST /api/links` – create a VPN link (`{ url, name? }`).
- `GET /api/links` – list links.
- `DELETE /api/links/:id` – delete a link.
- `POST /api/groups` – create a group (`{ name, description?, linkIds? }`).
- `GET /api/groups` – list groups.
- `POST /api/groups/:id/links` – attach links (`{ linkIds: [] }`).
- `DELETE /api/groups/:id/links/:linkId` – detach a link.
- `POST /api/base-configs` – store a base template (`{ name, description?, configJson, selectorTags? }`).
- `GET /api/base-configs` – list base templates.
- `PUT /api/base-configs/:id` – update template fields.
- `DELETE /api/base-configs/:id` – remove a base template (fails if configs reference it).
- `POST /api/configs` – create a config instance (`{ name, baseConfigId, description?, selectorTags?, groupIds?, shareEnabled?, shareToken? }`).
- `GET /api/configs` – list configs (includes share status/token for admin use).
- `POST /api/configs/:id/groups` – attach groups (`{ groupId, position? }`).
- `DELETE /api/configs/:id/groups/:groupId` – remove a group attachment.
- `POST /api/configs/:id/share` – enable/disable sharing or regenerate tokens (`{ shareEnabled?, regenerate?, shareToken? }`).
- `GET /api/config?config_id=<uuid>[&share=<token>]` – render the final sing-box config.

## Example Workflow

1. **Create a base template**

   ```http
   POST /api/base-configs
   Authorization: Basic <...>
   Content-Type: application/json

   {
     "name": "default-singbox",
     "configJson": { "log": {}, "dns": {}, "outbounds": [], "route": {} },
     "selectorTags": ["TCP代理", "UDP代理", "自动选择"]
   }
   ```

2. **Create links, groups, and configs**

   - Add links with `POST /api/links`.
   - Create a group referencing those link IDs (`POST /api/groups`).
   - Create a config referencing the base template and group IDs.

   ```http
   POST /api/configs
   Authorization: Basic <...>
   Content-Type: application/json

   {
     "name": "friends-config",
     "baseConfigId": "<base-config-uuid>",
     "groupIds": ["<group-uuid>"],
     "shareEnabled": true
   }
   ```

   The response includes `share_token` when sharing is enabled. Share the URL
   `https://<worker-domain>/api/config?config_id=<uuid>&share=<token>` with trusted friends.

3. **Rotate a share token**

   ```http
   POST /api/configs/<config-uuid>/share
   Authorization: Basic <...>
   Content-Type: application/json

   {
     "shareEnabled": true,
     "regenerate": true
   }
   ```

   The response returns the new token; previous URLs stop working immediately.

## Supported Link Types

- `vless://`
- `vmess://`
- `trojan://`
- `ss://`

Unsupported links are logged and skipped. Extend `worker/src/converter.ts` if you need additional protocols.
