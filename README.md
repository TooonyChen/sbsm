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
   # set up wrangler.toml
   npm run migrate                          # applies migrations to the bound D1 database
   ```
3. Deploy to Cloudflare:
   ```bash
   npm run deploy
   ```
4. Provision the dashboard on Cloudflare Pages or another static host (if you want to self-host the front-end):
   ```bash
   cd ../frontend
   npm install
   npm run build
   npm run export                           # outputs static assets under out/
   ```
   Upload `out/` to your hosting platform.
5. Verify the deployment by browsing to the hosted dashboard, authenticating with your configured username/password, and connecting to the newly deployed Worker URL.

## Project Architecture
- `worker/src/` — Cloudflare Worker entrypoint (`index.ts`), HTTP route handlers under `routes/`, database helpers in `db/`, and shared utilities in `lib/`.
- `frontend/src/app/` — Next.js 13+ app router with layouts, routes, and metadata; components and hooks live in `frontend/src/components` and `frontend/src/hooks`.
- `migrations/` — D1 schema definition (`0001_init.sql`) combining VPN link, group, subscription, and configuration tables.
- `docs/` — Design notes, frontend guidance, and operational walkthroughs.

## Screenshots
```markdown
![Dashboard overview](docs/screenshots/dashboard.png)
```

## Acknowledgements
- [SagerNet / sing-box](https://github.com/SagerNet/sing-box) for the core proxy tooling.
- [Sub-Store](https://github.com/sub-store-org/Sub-Store) for giving me the idea to create this project.
- Cloudflare Workers and D1 for the edge runtime and database.
- Next.js, shadcn/ui, and Tailwind CSS for powering the dashboard experience.
