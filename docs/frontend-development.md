# Frontend Implementation Plan

## Overview
- Build a Cloudflare Pages-ready Next.js (App Router) app under `frontend/`.
- UI layer uses shadcn/ui components exclusively; new components added via `pnpm dlx shadcn@latest add <component>`.
- Turbopack is the default dev server (`pnpm dev --turbo`).
- Authentication relies on HTTP Basic credentials and a per-user backend URL, stored in cookies for client-side reuse.

## Routes & Navigation
- `/login`: Public page with a `Card` from shadcn/ui that accepts backend URL, username, password. On success, persist credentials and redirect to `/dashboard`.
- Authenticated routes use a shared layout with the shadcn dashboard template.
  - `/dashboard`: Overview screen (stats placeholders + quick actions).
  - `/nodes`: CRUD interface for VPN links.
  - `/groups`: Manage group metadata and link membership.
  - `/base`: Manage base sing-box templates.
  - `/config`: Manage rendered configs and share tokens.
  - `/settings`: Same form as `/login`, allowing credential updates.
- Implement `middleware.ts` to redirect unauthenticated users to `/login`.

## State & Data Layer
- Store backend URL, username, password in HTTP-only cookies (e.g., `sbsm_host`, `sbsm_user`, `sbsm_pass`).
- Create a client-side API helper that injects Basic Auth headers and backend origin when calling the worker.
- Each CRUD page fetches data via server actions or React Query-style client hooks. Start with client components using `useEffect` + fetch.
- Handle API errors with shadcn `Alert` components.

## UI Components
- Shared layout imports the shadcn dashboard template: sidebar + header + content shell.
- Add navigation items (Nodes, Groups, Base Configs, Configs, Settings) with active state highlighting.
- CRUD pages:
  - Tables use `Table`, `DataTable` components; modals use `Dialog`; forms use `Form`, `Input`, `Textarea`, `Select`, `Checkbox` as needed.
  - Success/failure notifications use the `Alert` component in-page.
- For confirmations (delete actions), employ `AlertDialog`.

## Credential Handling & Security
- Basic Auth header = base64(`${username}:${password}`); ensure blank values block submission.
- Wrap fetches with AbortController & consistent error mapping (e.g., 401 -> redirect to `/login`).
- Cookies stored via `setCookie` helper; path `/`, secure flag when running on HTTPS.
- Clear cookies on logout or when `/settings` updates credentials.

## Task Breakdown
1. Build auth utilities (cookie helpers, API client, middleware).
2. Implement `/login` UI + credential storage.
3. Scaffold dashboard layout and sidebar navigation.
4. Build CRUD pages incrementally: nodes → groups → base configs → configs.
5. Add `/settings` form and credential reset logic.
6. Wire alerts for create/update/delete feedback.
7. Document local dev commands (`pnpm dev --turbo`, `pnpm lint`, `pnpm test` when added).
