# Repository Guidelines

## Project Structure & Module Organization
- `worker/src/index.ts` registers Cloudflare Worker routing; feature handlers live under `worker/src/routes/*` and call helpers in `worker/src/db`.
- Shared utilities (e.g., `worker/src/lib/*`, `worker/src/converter.ts`) and types (`worker/src/models.ts`) support the worker layer.
- The Next.js frontend sits in `frontend/src`, with layouts under `frontend/src/app` and UI primitives in `frontend/src/components`.
- Database migrations reside in `migrations/` (e.g., `0001_init.sql`); project notes and diagrams belong in `docs/`.

## Build, Test, and Development Commands
- `cd worker && npm install` sets up Wrangler tooling.
- `npm run dev` in `worker/` runs `wrangler dev` against the local D1 instance (ensure credentials in `wrangler.toml`).
- `npm run migrate` applies SQL migrations to the `sing_box` D1 database.
- `npm run deploy` publishes the Worker using the configured Cloudflare environment.
- `cd frontend && npm install && npm run dev` starts the dashboard locally; `npm run format` applies Prettier.

## Coding Style & Naming Conventions
- TypeScript (ES2022, strict mode). Use async/await, explicit return types for exports, and camelCase/PascalCase per symbol type.
- Keep imports grouped: platform APIs, external libs, then internal modules.
- Run Prettier (`npm run format`) before submitting changes; prefer ASCII unless the file already uses Unicode.

## Testing Guidelines
- No automated suite yet; validate flows manually via `wrangler dev` plus HTTP clients (Basic Auth, share-token generation).
- When adding tests, place Worker-compatible harnesses under `worker/tests/` and document the run command here.
- Validate schema changes with `npm run migrate` against a fresh D1 instance.

## Commit & Pull Request Guidelines
- Use imperative present-tense commit messages (`Add share token endpoint`); keep each commit focused.
- PRs should include purpose, impacted routes/DB tables, manual verification steps, backward-compatibility notes, and relevant doc/issue links.

## Security & Configuration Tips
- Update `ADMIN_USERNAME` and `ADMIN_PASSWORD_HASH` in `worker/wrangler.toml` before local runs; treat them as secrets.
- Regenerate compromised `config.share_token` values via the dedicated handler or `crypto.randomUUID()`.
- Never commit real Cloudflare IDs, passwords, or production secrets; use `wrangler secret put` for sensitive values.
