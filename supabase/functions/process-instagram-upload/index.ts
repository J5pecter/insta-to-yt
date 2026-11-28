import { jsonResponse, errorResponse } from "../_shared/cors.ts";
import { getServiceClient, requireInternalCron } from "../_shared/supabase.ts";
import { decryptSecret } from "../_shared/crypto.ts";

Deno.serve(async (req) => {
  try {
    requireInternalCron(req);
    const { job_id, target_id, intent_id } = await req.json();
    const client = getServiceClient();

    const { data: target } = await client.from("publication_targets").select("*").eq("id", target_id).single();
    const { data: intent } = await client.from("publishing_intents").select("*, drafts(*, media_assets(*))").eq("id", intent_id).single();
    const { data: acc } = await client.from("social_accounts").select("*").eq("id", target.social_account_id).single();
    const { data: tokRow } = await client.schema("private_secrets").from("social_tokens").select("*").eq("social_account_id", target.social_account_id).single();
    if (!target || !intent || !acc || !tokRow) return errorResponse(req, "Missing Instagram target or credentials", 400);

    const accessToken = await decryptSecret(tokRow.encrypted_access_token);
    const graphHost = "https://graph.instagram.com/v21.0";

    // Step 1: Create container if not yet created (reconcile before creating another)
    let containerId = target.remote_container_id;
    if (!containerId) {
      const asset = intent.drafts.media_assets;
      const [bucket, ...pathParts] = asset.storage_path.split("/");
      const { data: signed } = await client.storage.from(bucket).createSignedUrl(pathParts.join("/"), 900);
      if (!signed?.signedUrl) throw new Error("Failed to generate temporary signed URL for Instagram container");

      const cRes = await fetch(`${graphHost}/${acc.external_account_id}/media`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          media_type: "REELS",
          video_url: signed.signedUrl,
          caption: intent.approved_snapshot.caption ?? "",
          access_token: accessToken,
        }),
      });
      const cData = await cRes.json();
      if (!cRes.ok || !cData.id) throw new Error(cData.error?.message || "Failed to create Instagram media container");

      containerId = String(cData.id);
      await client.from("publication_targets").update({ remote_container_id: containerId, status: "PLATFORM_PROCESSING" }).eq("id", target.id);
      await client.from("processing_jobs").update({ status: "QUEUED", progress: 50, run_at: new Date(Date.now() + 10_000).toISOString() }).eq("id", job_id);
      return jsonResponse(req, { status: "container_created", container_id: containerId });
    }

    // Step 2: Check container status
    const stRes = await fetch(`${graphHost}/${containerId}?fields=status_code&access_token=${encodeURIComponent(accessToken)}`);
    const stData = await stRes.json();
    if (stData.status_code === "IN_PROGRESS") {
      await client.from("processing_jobs").update({ status: "QUEUED", progress: 70, run_at: new Date(Date.now() + 10_000).toISOString() }).eq("id", job_id);
      return jsonResponse(req, { status: "in_progress", container_id: containerId });
    }
    if (stData.status_code === "ERROR" || stData.status_code === "EXPIRED") {
      await client.from("publication_targets").update({ status: "FAILED", error_message: `Instagram container ${stData.status_code}` }).eq("id", target.id);
      await client.from("processing_jobs").update({ status: "FAILED", error_message: `Instagram container ${stData.status_code}` }).eq("id", job_id);
      return errorResponse(req, `Instagram container ${stData.status_code}`, 400);
    }

    // Step 3: Publish finished container
    const pubRes = await fetch(`${graphHost}/${acc.external_account_id}/media_publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ creation_id: containerId, access_token: accessToken }),
    });
    const pubData = await pubRes.json();
    if (!pubRes.ok || !pubData.id) throw new Error(pubData.error?.message || "Instagram media_publish failed");

    const mediaRes = await fetch(`${graphHost}/${pubData.id}?fields=permalink&access_token=${encodeURIComponent(accessToken)}`);
    const mediaData = mediaRes.ok ? await mediaRes.json() : {};
    const permalink = mediaData.permalink ?? `https://www.instagram.com/reel/${pubData.id}/`;

    await client.from("publication_targets").update({
      remote_media_id: String(pubData.id),
      published_url: permalink,
      status: "PUBLISHED",
      published_at: new Date().toISOString(),
    }).eq("id", target.id);
    await client.from("processing_jobs").update({ status: "PUBLISHED", progress: 100 }).eq("id", job_id);

    return jsonResponse(req, { status: "published", media_id: pubData.id, permalink });
  } catch (err) {
    if (err instanceof Response) return err;
    return errorResponse(req, err instanceof Error ? err.message : "Instagram publish error", 500);
  }
});
