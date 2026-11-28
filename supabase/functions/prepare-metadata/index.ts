import { handleCors, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { requireAdminUser } from "../_shared/supabase.ts";
import { convertMetadata } from "../_shared/metadata.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const { userId, client } = await requireAdminUser(req);
    const body = await req.json();
    const meta = convertMetadata(
      String(body.caption ?? ""),
      String(body.mode ?? "first_sentence"),
      String(body.attribution ?? ""),
      Array.isArray(body.default_tags) ? body.default_tags : ["#shorts"]
    );

    if (body.draft_id) {
      await client
        .from("drafts")
        .update({
          title: meta.youtube_title,
          description: meta.youtube_description,
          caption: meta.instagram_caption,
          hashtags: meta.instagram_hashtags,
          updated_at: new Date().toISOString(),
        })
        .eq("id", body.draft_id)
        .eq("user_id", userId);
    }

    return jsonResponse(req, meta);
  } catch (err) {
    if (err instanceof Response) return err;
    return errorResponse(req, err instanceof Error ? err.message : "Metadata preparation failed", 400);
  }
});
