# Repository Guidelines

## Project Structure & Module Organization
- `worker/src/index.ts` wires Cloudflare Worker request handling; feature handlers live under `worker/src/routes` (e.g., `configs.ts`, `groups.ts`, `links.ts`) and call query helpers in `worker/src/db`.
- Shared utilities (`converter.ts`, `template.ts`, auth helpers in `worker/src/lib`) and type models (`worker/src/models.ts`) support the route layer.
- Database migrations reside in `migrations/0001_init.sql`; design notes and usage walkthroughs are in `docs/`.
- Keep new assets, diagrams, or supporting files inside `docs/` unless they ship with the Worker runtime.

## Build, Test, and Development Commands
- `npm install` (inside `worker/`) sets up Wrangler and type tooling.
- `npm run dev` runs `wrangler dev` against the local D1 instance (requires `wrangler.toml` credentials and migrations applied).
- `npm run migrate` applies `migrations/0001_init.sql` to the `sing_box` D1 database.
- `npm run deploy` deploys the Worker to Cloudflare using Wrangler environment settings.
- `npm run format` runs Prettier across TypeScript sources.

## Coding Style & Naming Conventions
- TypeScript only, targeting ES2022 with strict compiler flags (`worker/tsconfig.json`); prefer async/await and explicit return types for exported functions.
- Use PascalCase for classes/types, camelCase for functions and variables, screaming snake case for environment-bound constants.
- Run Prettier before opening a PR; keep imports sorted logically (platform, external, internal).
- Authentication secrets (`ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`) must be updated in `worker/wrangler.toml` before local runs or deploys.

## Testing Guidelines
- No automated test suite exists yet; replicate share-token and Basic Auth flows manually via `wrangler dev` plus HTTP clients (e.g., `curl` with `-u user:pass`).
- When adding tests, prefer Worker-compatible harnesses or integration scripts under a future `worker/tests/` directory and document the run command in this guide.
- Validate migrations by running `npm run migrate` in a fresh D1 instance before merging schema changes.

## Commit & Pull Request Guidelines
- Write commit messages in imperative present tense (`Add share token endpoint`); keep scope focused.
- For pull requests, include: purpose summary, list of modified routes or DB tables, manual verification steps, and any backward-compatibility notes.
- Link related design docs or issues when available; attach example API payloads or `curl` snippets for new endpoints.

## Security & Configuration Tips
- Regenerate `config.share_token` via the dedicated handler or `crypto.randomUUID()` helper whenever links are compromised; never expose admin credentials in shared configs.
- Protect Wrangler secrets by using `wrangler secret put` in CI/CD; avoid committing real D1 `database_id` values or password hashes to source control.
