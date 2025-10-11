<p align="right">English | <a href="/README_CN.md">简体中文</a></p>

# <p align="center">SBSM</p>

### <p align="center"><b>Sing-box Subscription Manager</b></p>

---

**SBSM** is a lightweight admin console and Cloudflare Worker based for managing [Sing-box](https://github.com/SagerNet/sing-box) subscription links, groups, and share tokens.
It combines an edge-deployed API (via **Cloudflare Workers + D1**) with a modern **Next.js dashboard** for administrators.

---

## 🚀 Quick Start

### 1. Environment Setup

Make sure you have:

* Node.js **v18+**
* `pnpm` or `npm`
* [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/)

  ```bash
  npm install -g wrangler
  ```

### 2. Prepare and Configure the Worker

```bash
cd worker
npm install
cp wrangler.toml.example wrangler.toml
# Fill in your Cloudflare account_id, D1 database_id, and bindings
npm run migrate --remote   # Apply migrations to the D1 database
```

### 3. Deploy to Cloudflare

```bash
npm run deploy
```

### 4. Access the Dashboard

Use the hosted dashboard at
👉 **[sbsm.pages.dev](https://sbsm.pages.dev/)**

Or, if you prefer to self-host the frontend:

#### Self-hosting (Optional)

```bash
cd ../frontend
npm install
npm run build
npm run export     # Static output under /out
```

Upload the contents of `out/` to your hosting platform (e.g., Cloudflare Pages, Vercel).
Then visit your deployed dashboard, log in with your configured credentials, and connect it to the Worker endpoint.

---

## 🧱 Project Architecture

| Directory           | Description                                                                                                                   |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `worker/src/`       | Cloudflare Worker entrypoint (`index.ts`), route handlers (`routes/`), database layer (`db/`), and shared utilities (`lib/`). |
| `frontend/src/app/` | Next.js 13+ app router, layouts, routes, and metadata. Components and hooks live under `components/` and `hooks/`.            |
| `migrations/`       | D1 schema migrations (`0001_init.sql`) defining VPN link, group, subscription, and configuration tables.                      |
| `docs/`             | Design notes, frontend guidelines, and operational walkthroughs.                                                              |

---

## 🖥️ Screenshot

<img width="1512" height="735" alt="Screenshot 2025-10-12 at 06 10 12" src="https://github.com/user-attachments/assets/27c76c00-8ea0-4f24-b287-8e18d218970a" />
<p align="center">Light Mode</p>

<img width="1510" height="734" alt="Screenshot 2025-10-12 at 06 08 15" src="https://github.com/user-attachments/assets/e2ed706c-2b69-429a-b04e-a79428af07f3" />
<p align="center">Dark Mode</p>

<img width="1510" height="734" alt="Screenshot 2025-10-12 at 06 09 19" src="https://github.com/user-attachments/assets/a0d369cc-70f5-4a0a-b514-4acac2b7028b" />
<p align="center">VPN nodes</p>

<img width="1511" height="729" alt="image" src="https://github.com/user-attachments/assets/3002e6fa-1028-49fc-8aa5-0908122d516c" />
<p align="center">VPN groups</p>

<img width="1512" height="731" alt="Screenshot 2025-10-12 at 06 09 44" src="https://github.com/user-attachments/assets/d7820a00-700f-44be-9c95-a3e09be7eab6" />
<p align="center">Base Configs</p>

<img width="1512" height="735" alt="Screenshot 2025-10-12 at 06 09 51" src="https://github.com/user-attachments/assets/e63431aa-3a19-47cd-9c5d-de0745088e73" />
<p align="center">Sing-box Configs</p>

<img width="1512" height="733" alt="Screenshot 2025-10-12 at 06 10 03" src="https://github.com/user-attachments/assets/5db75ddf-78bd-4dcd-af9d-d3066baaffd0" />
<p align="center">Settings</p>

---

## 💡 Tech Stack

* **Cloudflare Workers + D1** — Edge runtime and SQLite-compatible DB.
* **Next.js**, **shadcn/ui**, **Tailwind CSS** — Modern, component-driven dashboard.
* **Node.js + TypeScript** — Strongly typed backend logic.
* **Wrangler CLI** — One-command deploy and migration workflow.

---

## 🙌 Acknowledgements

* [SagerNet / sing-box](https://github.com/SagerNet/sing-box) — Core proxy foundation.
* [Sub-Store](https://github.com/sub-store-org/Sub-Store) — Inspiration for subscription management design.
* [Cloudflare Workers](https://workers.cloudflare.com/) & [D1](https://developers.cloudflare.com/d1/) — Edge-native API infrastructure.
* [Next.js](https://nextjs.org/), [shadcn/ui](https://ui.shadcn.com/), [Tailwind CSS](https://tailwindcss.com/) — Powering the frontend experience.

