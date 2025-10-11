# <p align="center">SBSM</p>

### <p align="center"><b>Sing-box 订阅管理器</b></p>

---

**SBSM** 是一个轻量级的管理控制台与基于 Cloudflare Worker 的后端服务，用于管理 [Sing-box](https://github.com/SagerNet/sing-box) 的订阅链接、分组和分享令牌。  
它结合了 **Cloudflare Workers + D1** 构建的边缘 API，与现代化的 **Next.js 管理面板**，为管理员提供完整的自托管解决方案。

---

## 🚀 快速开始

### 1. 环境准备

请确保你已安装以下环境：

* Node.js **v18+**
* `pnpm` 或 `npm`
* [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/)

  ```bash
  npm install -g wrangler
  ```

### 2. 准备与配置 Worker

```bash
cd worker
npm install
cp wrangler.toml.example wrangler.toml
# 填入你的 Cloudflare account_id、D1 database_id 及相关绑定配置
npm run migrate --remote   # 远程执行数据库迁移
```

### 3. 部署到 Cloudflare

```bash
npm run deploy
```

### 4. 访问管理面板

你可以直接使用官方托管版本：
👉 **[sbsm.pages.dev](https://sbsm.pages.dev/)**

或者选择自行部署前端：

#### （可选）自托管前端

```bash
cd ../frontend
npm install
npm run build
npm run export     # 生成静态文件到 /out 目录
```

将 `out/` 文件夹内容上传至任意静态托管平台（如 Cloudflare Pages、Vercel）。
然后访问你自己的部署地址，使用配置好的管理员账号登录，并连接到你的 Worker 接口。

---

## 🧱 项目结构

| 目录                  | 说明                                                                               |
| ------------------- | -------------------------------------------------------------------------------- |
| `worker/src/`       | Cloudflare Worker 入口 (`index.ts`)，包含路由 (`routes/`)、数据库层 (`db/`)、通用工具函数 (`lib/`)。 |
| `frontend/src/app/` | Next.js 13+ 应用路由结构，包含布局、页面与元数据。组件与 Hooks 存放于 `components/` 与 `hooks/`。           |
| `migrations/`       | D1 数据库迁移文件 (`0001_init.sql`)，定义 VPN 链接、分组、订阅与配置相关的数据库表结构。                        |
| `docs/`             | 设计说明、前端开发指南与运维手册。                                                                |

---

## 🖥️ 截图展示

<img width="1512" height="735" alt="Screenshot 2025-10-12 at 06 10 12" src="https://github.com/user-attachments/assets/27c76c00-8ea0-4f24-b287-8e18d218970a" />
<p align="center">浅色模式</p>

<img width="1510" height="734" alt="Screenshot 2025-10-12 at 06 08 15" src="https://github.com/user-attachments/assets/e2ed706c-2b69-429a-b04e-a79428af07f3" />
<p align="center">深色模式</p>

<img width="1510" height="734" alt="Screenshot 2025-10-12 at 06 09 19" src="https://github.com/user-attachments/assets/a0d369cc-70f5-4a0a-b514-4acac2b7028b" />
<p align="center">VPN 节点列表</p>

<img width="1511" height="729" alt="image" src="https://github.com/user-attachments/assets/3002e6fa-1028-49fc-8aa5-0908122d516c" />
<p align="center">VPN 分组管理</p>

<img width="1512" height="731" alt="Screenshot 2025-10-12 at 06 09 44" src="https://github.com/user-attachments/assets/d7820a00-700f-44be-9c95-a3e09be7eab6" />
<p align="center">基础配置</p>

<img width="1512" height="735" alt="Screenshot 2025-10-12 at 06 09 51" src="https://github.com/user-attachments/assets/e63431aa-3a19-47cd-9c5d-de0745088e73" />
<p align="center">Sing-box 配置</p>

<img width="1512" height="733" alt="Screenshot 2025-10-12 at 06 10 03" src="https://github.com/user-attachments/assets/5db75ddf-78bd-4dcd-af9d-d3066baaffd0" />
<p align="center">系统设置</p>

---

## 💡 技术栈

* **Cloudflare Workers + D1** — 边缘运行时与 SQLite 兼容数据库
* **Next.js**, **shadcn/ui**, **Tailwind CSS** — 现代化组件驱动仪表盘
* **Node.js + TypeScript** — 强类型后端逻辑
* **Wrangler CLI** — 一键部署与迁移工具链

---

## 🙌 致谢

* [SagerNet / sing-box](https://github.com/SagerNet/sing-box) — 核心代理框架
* [Sub-Store](https://github.com/sub-store-org/Sub-Store) — 订阅管理界面设计灵感来源
* [Cloudflare Workers](https://workers.cloudflare.com/) 与 [D1](https://developers.cloudflare.com/d1/) — 边缘原生的 API 基础设施
* [Next.js](https://nextjs.org/)、[shadcn/ui](https://ui.shadcn.com/)、[Tailwind CSS](https://tailwindcss.com/) — 驱动前端体验的技术基石
