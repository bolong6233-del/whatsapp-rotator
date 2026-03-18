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

## 数据库结构

- `short_links` - 短链信息
- `whatsapp_numbers` - 绑定的 WhatsApp 号码
- `click_logs` - 点击记录

## 许可证

MIT License
