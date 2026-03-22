# Admin Setup Guide (管理员设置指南)

## Step 1: Run the Database Migration (运行数据库迁移)

Go to your **Supabase Dashboard → SQL Editor** and run the contents of:

```
supabase/migrations/003_rbac_hidden_numbers.sql
```

This will:
- Create the `profiles` table (stores user roles and status)
- Add `is_hidden` column to `whatsapp_numbers`
- Set up RLS policies so agents cannot see hidden numbers
- Create a trigger to auto-create a profile row for every new user

---

## Step 2: Set Your Account as Admin (设置管理员账号)

After running the migration, run the following SQL in **Supabase SQL Editor**, replacing the email with your own:

```sql
UPDATE profiles
SET role = 'admin'
WHERE email = 'your-admin@example.com';
```

Verify it worked:

```sql
SELECT id, email, role, status FROM profiles WHERE role = 'admin';
```

---

## Step 3: Backfill Existing Users (补全现有用户)

If you had users before running the migration, make sure all existing auth users have a profile row:

```sql
INSERT INTO profiles (id, email, role, status)
SELECT id, email, 'agent', 'active'
FROM auth.users
ON CONFLICT (id) DO NOTHING;
```

---

## How It Works (功能说明)

### Admin vs Agent

| Feature | Admin (管理员) | Agent (代理) |
|---------|--------------|------------|
| 代理管理 sidebar | ✅ Visible | ❌ Hidden |
| View own links | ✅ | ✅ |
| See hidden numbers | ✅ | ❌ |
| See click logs for hidden numbers | ✅ | ❌ |
| Create sub-accounts | ✅ | ❌ |
| Inject hidden numbers into agent links | ✅ | ❌ |

### Hidden Numbers (隐藏号码 / 暗扣功能)

1. Admin visits `/dashboard/agents` → clicks an agent → clicks "管理短链"
2. On the agent's link page, admin clicks **"+ 注入隐藏号码"**
3. Admin adds a number with `is_hidden = true`
4. **Public rotator** (`/[slug]`): serves ALL active numbers including hidden ones — traffic flows naturally
5. **Agent view**: hidden numbers are invisible in their dashboard, number lists, and click logs

### Disabled Accounts (禁用账号)

- Admin can disable any agent from `/dashboard/agents`
- Disabled users are automatically logged out and redirected to `/login?error=account_disabled`
- They cannot log back in until re-enabled by admin

---

## Environment Variables Required (需要的环境变量)

Make sure these are set in Vercel (or your deployment platform):

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anon key (safe for client-side) |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret service role key (server-side only, bypasses RLS) |

> ⚠️ Never expose `SUPABASE_SERVICE_ROLE_KEY` to the client side. It is only used in server-side API routes (`/api/admin/*`).
