# SBSM (Sing Box Subscription Manager)

## Introduction
SBSM delivers a lightweight admin console and Cloudflare Worker that manage Sing Box configuration links, groups, and share tokens. The Worker exposes authenticated APIs backed by Cloudflare D1, while the Next.js dashboard gives administrators a clean UI for day-to-day operations.

## Quick Start
1. Install Node.js 18+, pnpm or npm, and the Wrangler CLI (`npm install -g wrangler`).
2. Prepare the Worker:
   ```bash
   cd worker
   npm install
   cp wrangler.toml.example wrangler.toml   # fill in account_id, d1 database_id/bindings
   wrangler secret put ADMIN_USERNAME
   wrangler secret put ADMIN_PASSWORD_HASH  # bcrypt hash recommended
   npm run migrate                          # applies migrations to the bound D1 database
   ```
3. Deploy to Cloudflare:
   ```bash
   npm run deploy
   ```
4. Provision the dashboard on Cloudflare Pages or another static host:
   ```bash
   cd ../frontend
   npm install
   npm run build
   npm run export                           # outputs static assets under out/
   ```
   Upload `out/` to your hosting platform and configure environment variables for the Worker endpoint and admin credentials as needed.
5. Verify the deployment by browsing to the hosted dashboard, authenticating with your configured username/password, and connecting to the newly deployed Worker URL.

## Project Architecture
- `worker/src/` — Cloudflare Worker entrypoint (`index.ts`), HTTP route handlers under `routes/`, database helpers in `db/`, and shared utilities in `lib/`.
- `frontend/src/app/` — Next.js 13+ app router with layouts, routes, and metadata; components and hooks live in `frontend/src/components` and `frontend/src/hooks`.
- `migrations/` — D1 schema definition (`0001_init.sql`) combining VPN link, group, subscription, and configuration tables.
- `docs/` — Design notes, frontend guidance, and operational walkthroughs.

## Screenshots
After running both services, capture dashboard screenshots (e.g., group overview, config detail) and store them under `docs/screenshots/`. Reference them here with Markdown, for example:
```markdown
![Dashboard overview](docs/screenshots/dashboard.png)
```

## Acknowledgements
- [SagerNet / sing-box](https://github.com/SagerNet/sing-box) for the core proxy tooling.
- [Sub-Store](https://github.com/sub-store-org/Sub-Store) for informing early design decisions and user experience.
- Cloudflare Workers and D1 for the edge runtime and database.
- Next.js, Radix UI, and Tailwind CSS for powering the dashboard experience.
