import { handleCors, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { requireAdminUser } from "../_shared/supabase.ts";
import { parseInstagramUrl } from "../_shared/ssrf.ts";
import { convertMetadata } from "../_shared/metadata.ts";

const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB Supabase Free limit
const STORAGE_HARD_STOP_BYTES = 850 * 1024 * 1024; // 85% of 1 GB free bucket

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const { userId, client } = await requireAdminUser(req);
    const body = await req.json();

    if (!body.rights_confirmed) {
      return errorResponse(req, "Rights confirmation is required before importing media.", 400);
    }

    // Check 85% free-tier storage hard-stop
    const { data: assets } = await client.from("media_assets").select("size_bytes").eq("user_id", userId).neq("status", "deleted");
    const totalUsed = (assets ?? []).reduce((acc: number, row: any) => acc + (row.size_bytes ?? 0), 0);
    if (totalUsed >= STORAGE_HARD_STOP_BYTES) {
      return errorResponse(req, "Free-tier storage hard limit (85% of 1 GB) reached. Run storage cleanup before importing.", 413);
    }

    // Mode 1: Direct authorized upload registration (from Supabase Storage)
    if (body.storage_path) {
      const sizeBytes = Number(body.size_bytes ?? 0);
      if (sizeBytes <= 0 || sizeBytes > MAX_FILE_BYTES) {
        return errorResponse(req, "File size exceeds the 50 MB free-tier limit.", 413);
      }

      const { data: src, error: srcErr } = await client
        .from("source_media")
        .insert({
          user_id: userId,
          source_platform: "direct_upload",
          original_caption: body.caption ?? "",
          rights_status: "creator_authorized",
        })
        .select("id")
        .single();
      if (srcErr) throw srcErr;

      const { data: asset, error: assetErr } = await client
        .from("media_assets")
        .insert({
          user_id: userId,
          source_media_id: src.id,
          storage_path: body.storage_path,
          file_hash: body.file_hash ?? crypto.randomUUID(),
          mime_type: body.mime_type ?? "video/mp4",
          size_bytes: sizeBytes,
          width: body.width ?? 1080,
          height: body.height ?? 1920,
          duration: body.duration ?? 0,
          status: "ready",
        })
        .select("id")
        .single();
      if (assetErr) throw assetErr;

      const meta = convertMetadata(body.caption ?? "", "first_sentence");
      const { data: draft, error: draftErr } = await client
        .from("drafts")
        .insert({
          user_id: userId,
          media_asset_id: asset.id,
          title: meta.youtube_title,
          description: meta.youtube_description,
          caption: meta.instagram_caption,
          hashtags: meta.instagram_hashtags,
        })
        .select("*")
        .single();
      if (draftErr) throw draftErr;

      return jsonResponse(req, {
        draft_id: draft.id,
        media_asset_id: asset.id,
        source_media_id: src.id,
        title: draft.title,
        description: draft.description,
        caption: draft.caption,
        hashtags: draft.hashtags,
      });
    }

    // Mode 2: Instagram URL validation & authorized Graph API check
    const { normalizedUrl, shortcode } = parseInstagramUrl(String(body.url ?? ""));
    return errorResponse(
      req,
      `Validated Instagram link (${shortcode}). Direct server-side downloading of arbitrary Instagram URLs is restricted by Meta; upload the authorized MP4 file using the file fallback below.`,
      422
    );
  } catch (err) {
    if (err instanceof Response) return err;
    return errorResponse(req, err instanceof Error ? err.message : "Import failed", 400);
  }
});
