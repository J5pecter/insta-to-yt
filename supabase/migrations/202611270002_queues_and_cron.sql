-- SocialRelay V5 — Transaction-Safe Job Claiming RPC, Realtime, & Cron Scheduling

-- Atomic SKIP LOCKED job claim function (service_role only)
CREATE OR REPLACE FUNCTION public.claim_next_processing_job(
    p_worker_id TEXT,
    p_lease_seconds INTEGER DEFAULT 120
)
RETURNS SETOF public.processing_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_job_id BIGINT;
BEGIN
    SELECT id INTO v_job_id
    FROM public.processing_jobs
    WHERE (
        (status IN ('QUEUED', 'RETRY_PENDING') AND run_at <= now())
        OR (status IN ('UPLOADING', 'PLATFORM_PROCESSING', 'VERIFYING') AND lease_expiry < now())
    )
    ORDER BY run_at ASC, id ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1;

    IF v_job_id IS NULL THEN
        RETURN;
    END IF;

    RETURN QUERY
    UPDATE public.processing_jobs
    SET
        status = 'UPLOADING',
        locked_by = p_worker_id,
        lease_expiry = now() + make_interval(secs => p_lease_seconds),
        attempts = attempts + 1,
        updated_at = now()
    WHERE id = v_job_id
    RETURNING *;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_next_processing_job(TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_next_processing_job(TEXT, INTEGER) TO service_role;

-- Enable Realtime on safe progress tables only (never credentials or tokens)
ALTER PUBLICATION supabase_realtime ADD TABLE public.publication_targets;
ALTER PUBLICATION supabase_realtime ADD TABLE public.processing_jobs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.publishing_intents;
