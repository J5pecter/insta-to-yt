-- SocialRelay V5 — PostgreSQL Schema, Private Secrets Schema, RLS & Private Storage Buckets
-- Strictly enforces ownership, zero public access, and non-exposed credential tables.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Dedicated private schema for encrypted OAuth credentials & tokens (never exposed via Data API)
CREATE SCHEMA IF NOT EXISTS private_secrets;
REVOKE ALL ON SCHEMA private_secrets FROM PUBLIC, anon, authenticated;

-- 1. Profiles
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name TEXT,
    timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Admin Memberships (write-protected: service_role only)
CREATE TABLE IF NOT EXISTS public.admin_memberships (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Helper function (SECURITY INVOKER by default, checks active admin membership)
CREATE OR REPLACE FUNCTION public.is_active_admin(uid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.admin_memberships
        WHERE user_id = uid AND role = 'admin' AND status = 'active'
    );
$$;
REVOKE ALL ON FUNCTION public.is_active_admin(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_active_admin(UUID) TO authenticated, service_role;

-- 3. Social Accounts (publicly visible metadata only, NO tokens)
CREATE TABLE IF NOT EXISTS public.social_accounts (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    platform TEXT NOT NULL CHECK (platform IN ('youtube', 'instagram')),
    external_account_id TEXT NOT NULL,
    account_name TEXT NOT NULL,
    permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
    token_expiry TIMESTAMPTZ,
    connection_status TEXT NOT NULL DEFAULT 'connected' CHECK (connection_status IN ('connected', 'expired', 'revoked', 'error')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, platform, external_account_id)
);

-- 4. Provider Credentials (private_secrets schema — never exposed to browser)
CREATE TABLE IF NOT EXISTS private_secrets.provider_credentials (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    platform TEXT NOT NULL CHECK (platform IN ('youtube', 'instagram')),
    encrypted_credentials TEXT NOT NULL,
    masked_identifier TEXT,
    credential_version INTEGER NOT NULL DEFAULT 1,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, platform)
);

-- 5. Social Tokens (private_secrets schema — never exposed to browser)
CREATE TABLE IF NOT EXISTS private_secrets.social_tokens (
    id BIGSERIAL PRIMARY KEY,
    social_account_id BIGINT NOT NULL UNIQUE REFERENCES public.social_accounts(id) ON DELETE CASCADE,
    encrypted_access_token TEXT NOT NULL,
    encrypted_refresh_token TEXT,
    expires_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Source Media
CREATE TABLE IF NOT EXISTS public.source_media (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    source_platform TEXT NOT NULL DEFAULT 'instagram',
    source_url TEXT,
    external_media_id TEXT,
    source_account TEXT,
    original_caption TEXT,
    rights_status TEXT NOT NULL DEFAULT 'creator_authorized',
    rights_reference TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. Media Assets
CREATE TABLE IF NOT EXISTS public.media_assets (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    source_media_id BIGINT REFERENCES public.source_media(id) ON DELETE SET NULL,
    storage_path TEXT NOT NULL,
    thumbnail_path TEXT,
    file_hash TEXT NOT NULL,
    mime_type TEXT NOT NULL DEFAULT 'video/mp4',
    duration DOUBLE PRECISION,
    width INTEGER,
    height INTEGER,
    size_bytes BIGINT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('ready', 'incompatible', 'archived', 'deleted')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_media_assets_hash ON public.media_assets(user_id, file_hash);

-- 8. Drafts
CREATE TABLE IF NOT EXISTS public.drafts (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    media_asset_id BIGINT NOT NULL REFERENCES public.media_assets(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT 'Untitled Video',
    description TEXT NOT NULL DEFAULT '',
    caption TEXT NOT NULL DEFAULT '',
    hashtags JSONB NOT NULL DEFAULT '[]'::jsonb,
    metadata_version INTEGER NOT NULL DEFAULT 1,
    approval_status TEXT NOT NULL DEFAULT 'pending_review' CHECK (approval_status IN ('pending_review', 'approved', 'published', 'archived')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 9. Publishing Profiles (Presets)
CREATE TABLE IF NOT EXISTS public.publishing_profiles (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT 'Instagram to YouTube + Instagram',
    settings JSONB NOT NULL DEFAULT '{
        "visibility": "private",
        "title_mode": "first_sentence",
        "made_for_kids": false,
        "synthetic_content": false,
        "source_attribution": true,
        "rights_confirmation_required": true
    }'::jsonb,
    is_default BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 10. Publishing Intents
CREATE TABLE IF NOT EXISTS public.publishing_intents (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    draft_id BIGINT NOT NULL REFERENCES public.drafts(id) ON DELETE CASCADE,
    approved_snapshot JSONB NOT NULL,
    scheduled_at TIMESTAMPTZ,
    approved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    status TEXT NOT NULL DEFAULT 'CREATED' CHECK (status IN (
        'CREATED','VALIDATING','IMPORTING','MEDIA_READY','METADATA_READY',
        'AWAITING_APPROVAL','SCHEDULED','QUEUED','UPLOADING','PLATFORM_PROCESSING',
        'VERIFYING','PUBLISHED','PARTIALLY_PUBLISHED','RETRY_PENDING','AUTH_REQUIRED',
        'QUOTA_BLOCKED','INCOMPATIBLE_MEDIA','RECONCILIATION_REQUIRED','FAILED','CANCELLED'
    ))
);
CREATE INDEX IF NOT EXISTS ix_intents_scheduled ON public.publishing_intents(status, scheduled_at);

-- 11. Publication Targets (Idempotent per destination)
CREATE TABLE IF NOT EXISTS public.publication_targets (
    id BIGSERIAL PRIMARY KEY,
    intent_id BIGINT NOT NULL REFERENCES public.publishing_intents(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    social_account_id BIGINT NOT NULL REFERENCES public.social_accounts(id) ON DELETE RESTRICT,
    idempotency_key TEXT NOT NULL UNIQUE,
    platform_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    remote_upload_session_reference TEXT,
    remote_byte_offset BIGINT NOT NULL DEFAULT 0,
    remote_container_id TEXT,
    remote_media_id TEXT,
    published_url TEXT,
    status TEXT NOT NULL DEFAULT 'QUEUED',
    error_message TEXT,
    published_at TIMESTAMPTZ
);

-- 12. Processing Jobs (Durable Queue)
CREATE TABLE IF NOT EXISTS public.processing_jobs (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    job_type TEXT NOT NULL,
    target_id BIGINT REFERENCES public.publication_targets(id) ON DELETE CASCADE,
    intent_id BIGINT REFERENCES public.publishing_intents(id) ON DELETE CASCADE,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'QUEUED',
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 5,
    run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    lease_expiry TIMESTAMPTZ,
    locked_by TEXT,
    progress INTEGER NOT NULL DEFAULT 0,
    error_code TEXT,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_jobs_poll ON public.processing_jobs(status, run_at, lease_expiry);

-- 13. Automations & Runs
CREATE TABLE IF NOT EXISTS public.automations (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    workflow_definition JSONB NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.automation_runs (
    id BIGSERIAL PRIMARY KEY,
    automation_id BIGINT NOT NULL REFERENCES public.automations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    execution_status TEXT NOT NULL DEFAULT 'running',
    log_output JSONB NOT NULL DEFAULT '[]'::jsonb,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ
);

-- 14. Notifications, Usage, Audit Logs, Settings, Cleanup Records
CREATE TABLE IF NOT EXISTS public.notifications (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'info',
    message TEXT NOT NULL,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.usage_records (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    metric_type TEXT NOT NULL,
    measured_value BIGINT NOT NULL,
    measurement_source TEXT NOT NULL DEFAULT 'estimated',
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    entity_type TEXT,
    entity_id TEXT,
    sanitized_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.application_settings (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    setting_key TEXT NOT NULL,
    setting_value JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, setting_key)
);

CREATE TABLE IF NOT EXISTS public.cleanup_records (
    id BIGSERIAL PRIMARY KEY,
    media_asset_id BIGINT REFERENCES public.media_assets(id) ON DELETE SET NULL,
    cleanup_reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'completed',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- ROW LEVEL SECURITY (RLS) ON ALL EXPOSED TABLES
-- ============================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.source_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.publishing_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.publishing_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.publication_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processing_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.application_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cleanup_records ENABLE ROW LEVEL SECURITY;

-- Policies: Strictly owner + active admin
CREATE POLICY profiles_owner ON public.profiles FOR ALL TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY admin_memberships_read_self ON public.admin_memberships FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY social_accounts_owner ON public.social_accounts FOR ALL TO authenticated USING (auth.uid() = user_id AND public.is_active_admin(auth.uid())) WITH CHECK (auth.uid() = user_id AND public.is_active_admin(auth.uid()));
CREATE POLICY source_media_owner ON public.source_media FOR ALL TO authenticated USING (auth.uid() = user_id AND public.is_active_admin(auth.uid())) WITH CHECK (auth.uid() = user_id AND public.is_active_admin(auth.uid()));
CREATE POLICY media_assets_owner ON public.media_assets FOR ALL TO authenticated USING (auth.uid() = user_id AND public.is_active_admin(auth.uid())) WITH CHECK (auth.uid() = user_id AND public.is_active_admin(auth.uid()));
CREATE POLICY drafts_owner ON public.drafts FOR ALL TO authenticated USING (auth.uid() = user_id AND public.is_active_admin(auth.uid())) WITH CHECK (auth.uid() = user_id AND public.is_active_admin(auth.uid()));
CREATE POLICY profiles_pub_owner ON public.publishing_profiles FOR ALL TO authenticated USING (auth.uid() = user_id AND public.is_active_admin(auth.uid())) WITH CHECK (auth.uid() = user_id AND public.is_active_admin(auth.uid()));
CREATE POLICY intents_owner ON public.publishing_intents FOR ALL TO authenticated USING (auth.uid() = user_id AND public.is_active_admin(auth.uid())) WITH CHECK (auth.uid() = user_id AND public.is_active_admin(auth.uid()));
CREATE POLICY targets_read_owner ON public.publication_targets FOR SELECT TO authenticated USING (auth.uid() = user_id AND public.is_active_admin(auth.uid()));
CREATE POLICY jobs_read_owner ON public.processing_jobs FOR SELECT TO authenticated USING (auth.uid() = user_id AND public.is_active_admin(auth.uid()));
CREATE POLICY automations_owner ON public.automations FOR ALL TO authenticated USING (auth.uid() = user_id AND public.is_active_admin(auth.uid())) WITH CHECK (auth.uid() = user_id AND public.is_active_admin(auth.uid()));
CREATE POLICY automation_runs_read ON public.automation_runs FOR SELECT TO authenticated USING (auth.uid() = user_id AND public.is_active_admin(auth.uid()));
CREATE POLICY notifications_owner ON public.notifications FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY usage_read_owner ON public.usage_records FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY audit_read_owner ON public.audit_logs FOR SELECT TO authenticated USING (auth.uid() = user_id AND public.is_active_admin(auth.uid()));
CREATE POLICY settings_owner ON public.application_settings FOR ALL TO authenticated USING (auth.uid() = user_id AND public.is_active_admin(auth.uid())) WITH CHECK (auth.uid() = user_id AND public.is_active_admin(auth.uid()));

-- Private Storage Buckets (50 MB max individual file, zero public access)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES
    ('source-videos', 'source-videos', false, 52428800),
    ('publishing-videos', 'publishing-videos', false, 52428800),
    ('thumbnails', 'thumbnails', false, 5242880),
    ('temporary-media', 'temporary-media', false, 52428800),
    ('authorized-exports', 'authorized-exports', false, 52428800)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY storage_owner_select ON storage.objects FOR SELECT TO authenticated
USING (bucket_id IN ('source-videos','publishing-videos','thumbnails','temporary-media','authorized-exports') AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY storage_owner_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id IN ('source-videos','publishing-videos','thumbnails','temporary-media','authorized-exports') AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY storage_owner_delete ON storage.objects FOR DELETE TO authenticated
USING (bucket_id IN ('source-videos','publishing-videos','thumbnails','temporary-media','authorized-exports') AND auth.uid()::text = (storage.foldername(name))[1]);
