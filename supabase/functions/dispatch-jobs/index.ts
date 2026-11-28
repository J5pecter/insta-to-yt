import { handleCors, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { getServiceClient, requireInternalCron } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    requireInternalCron(req);
    const client = getServiceClient();
    const nowIso = new Date().toISOString();

    // 1. Promote due SCHEDULED intents to QUEUED
    const { data: dueIntents } = await client
      .from("publishing_intents")
      .select("id, user_id")
      .eq("status", "SCHEDULED")
      .lte("scheduled_at", nowIso);

    for (const intent of dueIntents ?? []) {
      await client.from("publishing_intents").update({ status: "QUEUED" }).eq("id", intent.id);
      const { data: targets } = await client
        .from("publication_targets")
        .select("id, platform_settings")
        .eq("intent_id", intent.id)
        .eq("status", "SCHEDULED");

      for (const t of targets ?? []) {
        const platform = t.platform_settings?.platform ?? "youtube";
        await client.from("publication_targets").update({ status: "QUEUED" }).eq("id", t.id);
        await client.from("processing_jobs").insert({
          user_id: intent.user_id,
          job_type: platform === "youtube" ? "youtube_upload" : "instagram_upload",
          target_id: t.id,
          intent_id: intent.id,
          payload: { target_id: t.id, intent_id: intent.id, platform },
          status: "QUEUED",
        });
      }
    }

    // 2. Claim next job atomically (1 concurrent job by default for free tier)
    const workerId = `edge_dispatcher_${crypto.randomUUID().slice(0, 8)}`;
    const { data: jobs, error: claimErr } = await client.rpc("claim_next_processing_job", {
      p_worker_id: workerId,
      p_lease_seconds: 120,
    });
    if (claimErr) throw claimErr;

    const job = jobs?.[0];
    if (!job) {
      return jsonResponse(req, { status: "idle", dispatched: 0 });
    }

    const supabaseUrl = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/+$/, "");
    const cronSecret = Deno.env.get("INTERNAL_WORKER_SECRET") ?? "";
    const fnName =
      job.job_type === "youtube_upload"
        ? "process-youtube-upload"
        : job.job_type === "instagram_upload"
        ? "process-instagram-upload"
        : "verify-publication";

    const res = await fetch(`${supabaseUrl}/functions/v1/${fnName}`, {
      method: "POST",
      headers: { "x-internal-cron-secret": cronSecret, "Content-Type": "application/json" },
      body: JSON.stringify({ job_id: job.id, target_id: job.target_id, intent_id: job.intent_id }),
    });

    const out = await res.json().catch(() => ({}));
    return jsonResponse(req, { status: "dispatched", job_id: job.id, fn: fnName, result: out });
  } catch (err) {
    if (err instanceof Response) return err;
    return errorResponse(req, err instanceof Error ? err.message : "Dispatcher error", 500);
  }
});
