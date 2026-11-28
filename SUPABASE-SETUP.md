# SocialRelay V5 — Supabase + GitHub Pages Architecture & Setup Guide

SocialRelay V5 runs 100% serverlessly on **GitHub Pages** (React SPA frontend) + **Supabase Free Plan** (Auth, PostgreSQL + RLS, Private Storage, Edge Functions, Queues, Cron, and Realtime), with zero Oracle Cloud VMs and zero mandatory subscriptions.

---

## 1. Supabase Free-Tier Allowances & Protections
- **PostgreSQL**: 500 MB
- **File Storage**: 1 GB (50 MB max individual file enforced in `supabase/config.toml`, `import-instagram`, and `apps/web`)
- **Edge Functions**: 500,000 invocations/month (150s wall-clock, ~2s CPU per request)
- **Storage Guardrails**: 70% warning threshold, 85% (`850 MB`) hard-stop before imports

---

## 2. One-Time Setup Commands

### Step 1: Create `socialrelay-production` Supabase Project
Create a new free-tier project named **`socialrelay-production`** in the [Supabase Dashboard](https://supabase.com/dashboard). *(Keep it completely separate from any other projects.)*

### Step 2: Link & Push Database Migrations + Edge Functions
```bash
supabase link --project-ref <YOUR_PROJECT_REF>
supabase db push

# Set required backend-only Edge Function secrets (never put these in GitHub or VITE_ vars)
supabase secrets set \
  TOKEN_ENCRYPTION_MASTER_KEY="$(openssl rand -base64 32)" \
  OAUTH_STATE_SECRET="$(openssl rand -hex 32)" \
  INTERNAL_WORKER_SECRET="$(openssl rand -hex 32)" \
  APP_FRONTEND_URL="https://j5pecter.github.io/insta-to-yt/"

# Deploy all Edge Functions
supabase functions deploy --no-verify-jwt youtube-oauth-callback
supabase functions deploy --no-verify-jwt instagram-oauth-callback
supabase functions deploy
```

### Step 3: Create Your Administrator Account
1. In **Supabase Dashboard → Authentication → Users**, click **Add User** (public signup is disabled in `supabase/config.toml`).
2. Copy the created user's UUID and insert into `public.admin_memberships` via SQL Editor:
   ```sql
   INSERT INTO public.admin_memberships (user_id, role, status)
   VALUES ('<USER_UUID>', 'admin', 'active');
   ```

### Step 4: Connect GitHub Pages to Supabase
In your GitHub repository **Settings → Secrets and variables → Actions → Variables**, add:
- `VITE_SUPABASE_URL` = `https://<YOUR_PROJECT_REF>.supabase.co`
- `VITE_SUPABASE_PUBLISHABLE_KEY` = `<YOUR_SUPABASE_PUBLISHABLE_KEY>`

Then re-run **Deploy to GitHub Pages**.

### Step 5: Register OAuth Callback URLs
- **YouTube (Google Cloud Console)**: `https://<YOUR_PROJECT_REF>.supabase.co/functions/v1/youtube-oauth-callback`
- **Instagram (Meta for Developers)**: `https://<YOUR_PROJECT_REF>.supabase.co/functions/v1/instagram-oauth-callback`
