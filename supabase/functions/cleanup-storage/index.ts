import { handleCors, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { getServiceClient, requireAdminUser } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const cronSecret = Deno.env.get("INTERNAL_WORKER_SECRET") ?? "";
    const providedSecret = req.headers.get("x-internal-cron-secret") ?? "";
    let userIdFilter: string | null = null;

    if (!cronSecret || providedSecret !== cronSecret) {
      const auth = await requireAdminUser(req);
      userIdFilter = auth.userId;
    }

    const client = getServiceClient();
    const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

    // Protect active/scheduled media assets
    const { data: activeDrafts } = await client
      .from("publishing_intents")
      .select("drafts(media_asset_id)")
      .in("status", ["CREATED", "VALIDATING", "IMPORTING", "SCHEDULED", "QUEUED", "UPLOADING", "PLATFORM_PROCESSING", "VERIFYING"]);
    const protectedAssetIds = new Set((activeDrafts ?? []).map((d: any) => d.drafts?.media_asset_id).filter(Boolean));

    let query = client.from("media_assets").select("id, storage_path").lt("created_at", cutoff).eq("status", "ready");
    if (userIdFilter) query = query.eq("user_id", userIdFilter);
    const { data: oldAssets } = await query;

    let cleaned = 0;
    for (const asset of oldAssets ?? []) {
      if (protectedAssetIds.has(asset.id)) continue;
      if (asset.storage_path?.startsWith("temporary-media/")) {
        const objectPath = asset.storage_path.replace(/^temporary-media\//, "");
        await client.storage.from("temporary-media").remove([objectPath]);
        await client.from("media_assets").update({ status: "deleted" }).eq("id", asset.id);
        await client.from("cleanup_records").insert({ media_asset_id: asset.id, cleanup_reason: "24h_temp_retention", status: "completed" });
        cleaned++;
      }
    }

    return jsonResponse(req, { status: "success", cleaned_files: cleaned });
  } catch (err) {
    if (err instanceof Response) return err;
    return errorResponse(req, err instanceof Error ? err.message : "Cleanup failed", 500);
  }
});
