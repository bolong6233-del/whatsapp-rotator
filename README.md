# WhatsApp 轮询分流系统

一个专为广告营销设计的 WhatsApp 短链生成和轮询分流系统。

## 功能特性

- 🔗 **自定义短链** - 创建专属短链后缀，简洁易记
- 🔄 **智能轮询** - 访客点击自动循环分配到不同 WhatsApp 号码
- 📊 **数据统计** - 实时追踪点击量、来源、各号码接待量
- 👥 **多号码管理** - 一个短链绑定多个 WhatsApp 号码
- 🔒 **用户认证** - 安全的账号注册和登录系统

## 技术栈

- **前端框架**: Next.js 14 (App Router)
- **UI 样式**: Tailwind CSS
- **数据库**: Supabase (PostgreSQL)
- **认证**: Supabase Auth
- **部署**: Vercel
- **语言**: TypeScript

## 快速开始

### 1. 克隆项目

```bash
git clone <your-repo-url>
cd whatsapp-rotator
npm install
```

### 2. 配置 Supabase

1. 访问 [https://app.supabase.com](https://app.supabase.com) 创建新项目
2. 进入 **SQL Editor**，执行 `supabase/schema.sql` 中的所有 SQL 语句
3. 在项目设置 **Settings > API** 中获取：
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public key` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role key` → `SUPABASE_SERVICE_ROLE_KEY`

### 3. 配置环境变量

```bash
cp .env.example .env.local
```

编辑 `.env.local` 填入您的 Supabase 配置：

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 4. 启动开发服务器

```bash
npm run dev
```

访问 [http://localhost:3000](http://localhost:3000) 查看应用。

## Vercel 部署

1. 将代码推送到 GitHub 仓库
2. 在 [Vercel](https://vercel.com) 导入该仓库
3. 在 Vercel 项目设置中添加以下环境变量：
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `NEXT_PUBLIC_APP_URL`（填入您的 Vercel 域名，如 `https://your-app.vercel.app`）
4. 点击部署

## 使用指南

### 创建短链

1. 注册并登录账号
2. 点击「创建短链」
3. 输入自定义短链后缀（如 `promo2024`）
4. 添加一个或多个 WhatsApp 号码
5. 保存后即可使用

### 使用短链

将生成的短链（如 `https://your-app.vercel.app/promo2024`）放入广告素材中。
访客点击后会自动轮流跳转到不同的 WhatsApp 号码。

### 查看统计

在「短链详情」页面可以查看：
- 总点击次数
- 每个号码的接待量
- 最近 50 条点击记录（时间、分配号码、IP、来源）

## 海王同步 - Cloudflare Worker 代理接入说明

由于 Vercel 等云平台的出口 IP 会被 Cloudflare 防护拦截（返回 403），海王同步 API 的所有请求已全量切换为通过 Cloudflare Worker 代理转发。

### Worker 代理工作原理

```
新系统 (Vercel) → POST Cloudflare Worker → admin.haiwangweb.com
```

Worker 负责将请求以普通流量形式转发，彻底绕过 Cloudflare 403 拦截。

### 部署你自己的 Worker（可选）

如果需要使用自己的 Worker：

1. 登录 [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages** → **Create Worker**
2. 将以下代码粘贴进去并 **Save and Deploy**：

```javascript
const PROXY_SECRET = "YOUR_SECRET_KEY_HERE"; // 替换为你自己的密钥，并在环境变量 HAIWANG_WORKER_PROXY_SECRET 中填入相同的值

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, x-proxy-secret",
        },
      });
    }
    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405, headers: { "Content-Type": "application/json" },
      });
    }
    const authHeader = request.headers.get("x-proxy-secret");
    if (authHeader !== PROXY_SECRET) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { "Content-Type": "application/json" },
      });
    }
    try {
      const body = await request.json();
      const { url, method, headers, jsonBody } = body;
      if (!url) {
        return new Response(JSON.stringify({ error: "url is required" }), {
          status: 400, headers: { "Content-Type": "application/json" },
        });
      }
      const fetchOptions = { method: method || "GET", headers: headers || {} };
      if (jsonBody) fetchOptions.body = JSON.stringify(jsonBody);
      const response = await fetch(url, fetchOptions);
      const responseBody = await response.text();
      return new Response(responseBody, {
        status: response.status,
        headers: {
          "Content-Type": response.headers.get("Content-Type") || "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500, headers: { "Content-Type": "application/json" },
      });
    }
  },
};
```

3. 在 Vercel 项目设置中添加以下环境变量：

```env
HAIWANG_WORKER_PROXY_URL=https://你的worker名.你的用户名.workers.dev/
HAIWANG_WORKER_PROXY_SECRET=你的密钥
```

### 默认配置

如不设置环境变量，系统将使用内置默认 Worker（`haiwang-proxy.bolong6233.workers.dev`）。



- `short_links` - 短链信息
- `whatsapp_numbers` - 绑定的 WhatsApp 号码
- `click_logs` - 点击记录

## 许可证

MIT License
