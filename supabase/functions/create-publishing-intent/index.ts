import { handleCors, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { requireAdminUser } from "../_shared/supabase.ts";

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const { userId, client } = await requireAdminUser(req);
    const body = await req.json();

    if (!body.rights_confirmed) return errorResponse(req, "Rights confirmation is required.", 400);
    const accountIds: number[] = Array.isArray(body.account_ids) ? body.account_ids : [];
    if (accountIds.length === 0) return errorResponse(req, "Select at least one destination account.", 400);

    const { data: draft } = await client.from("drafts").select("*, media_assets(*)").eq("id", body.draft_id).eq("user_id", userId).maybeSingle();
    if (!draft) return errorResponse(req, "Draft not found.", 404);

    const { data: accounts } = await client.from("social_accounts").select("*").in("id", accountIds).eq("user_id", userId);
    if (!accounts || accounts.length === 0) return errorResponse(req, "No valid destination accounts found.", 400);

    const now = new Date();
    const scheduledAt = body.scheduled_at ? new Date(body.scheduled_at) : null;
    const isScheduled = Boolean(scheduledAt && scheduledAt > now);

    // Update draft metadata
    await client.from("drafts").update({
      title: String(body.title ?? draft.title).slice(0, 100),
      description: String(body.description ?? draft.description),
      caption: String(body.caption ?? body.description ?? draft.caption),
      hashtags: Array.isArray(body.hashtags) ? body.hashtags.slice(0, 30) : draft.hashtags,
      approval_status: "approved",
      updated_at: now.toISOString(),
    }).eq("id", draft.id);

    const snapshot = {
      title: String(body.title ?? draft.title).slice(0, 100),
      description: String(body.description ?? draft.description),
      caption: String(body.caption ?? body.description ?? draft.caption),
      hashtags: Array.isArray(body.hashtags) ? body.hashtags.slice(0, 30) : draft.hashtags,
      privacy: body.privacy ?? "private",
      made_for_kids: Boolean(body.made_for_kids),
      synthetic_content: Boolean(body.synthetic_content),
    };

    const { data: intent, error: intentErr } = await client
      .from("publishing_intents")
      .insert({
        user_id: userId,
        draft_id: draft.id,
        approved_snapshot: snapshot,
        scheduled_at: isScheduled ? scheduledAt!.toISOString() : null,
        status: isScheduled ? "SCHEDULED" : "QUEUED",
      })
      .select("*")
      .single();
    if (intentErr) throw intentErr;

    const fileHash = draft.media_assets?.file_hash ?? String(draft.media_asset_id);
    const bucket = isScheduled ? scheduledAt!.toISOString() : now.toISOString().slice(0, 16);
    const targetsOut = [];

    for (const acc of accounts) {
      const idempotencyKey = (await sha256Hex(`${fileHash}:${acc.id}:${draft.id}:${bucket}`)).slice(0, 48);
      const { data: existing } = await client.from("publication_targets").select("*").eq("idempotency_key", idempotencyKey).maybeSingle();
      if (existing) {
        targetsOut.push({ target_id: existing.id, platform: existing.platform, status: existing.status, deduplicated: true });
        continue;
      }

      const { data: target, error: tErr } = await client
        .from("publication_targets")
        .insert({
          intent_id: intent.id,
          user_id: userId,
          social_account_id: acc.id,
          idempotency_key: idempotencyKey,
          platform_settings: { platform: acc.platform, privacy: snapshot.privacy },
          status: isScheduled ? "SCHEDULED" : "QUEUED",
        })
        .select("*")
        .single();
      if (tErr) throw tErr;

      if (!isScheduled) {
        await client.from("processing_jobs").insert({
          user_id: userId,
          job_type: acc.platform === "youtube" ? "youtube_upload" : "instagram_upload",
          target_id: target.id,
          intent_id: intent.id,
          payload: { target_id: target.id, intent_id: intent.id, platform: acc.platform },
          status: "QUEUED",
        });
      }

      targetsOut.push({ target_id: target.id, platform: acc.platform, account_name: acc.account_name, status: target.status, deduplicated: false });
    }

    // Trigger immediate dispatch for non-scheduled jobs
    if (!isScheduled) {
      const supabaseUrl = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/+$/, "");
      const cronSecret = Deno.env.get("INTERNAL_WORKER_SECRET") ?? "";
      if (cronSecret) {
        fetch(`${supabaseUrl}/functions/v1/dispatch-jobs`, {
          method: "POST",
          headers: { "x-internal-cron-secret": cronSecret, "Content-Type": "application/json" },
          body: JSON.stringify({ intent_id: intent.id }),
        }).catch(() => {});
      }
    }

    return jsonResponse(req, { intent_id: intent.id, status: intent.status, targets: targetsOut });
  } catch (err) {
    if (err instanceof Response) return err;
    return errorResponse(req, err instanceof Error ? err.message : "Failed to create publishing intent", 400);
  }
});
