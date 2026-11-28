import { jsonResponse, errorResponse } from "../_shared/cors.ts";
import { getServiceClient, requireInternalCron } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  try {
    requireInternalCron(req);
    const { intent_id } = await req.json();
    const client = getServiceClient();

    const { data: targets } = await client.from("publication_targets").select("*").eq("intent_id", intent_id);
    if (!targets || targets.length === 0) return errorResponse(req, "No targets found", 404);

    const allPublished = targets.every((t: any) => t.status === "PUBLISHED");
    const anyPublished = targets.some((t: any) => t.status === "PUBLISHED");
    const anyFailed = targets.some((t: any) => t.status === "FAILED");

    const intentStatus = allPublished
      ? "PUBLISHED"
      : anyPublished && anyFailed
      ? "PARTIALLY_PUBLISHED"
      : anyFailed
      ? "FAILED"
      : "VERIFYING";

    await client.from("publishing_intents").update({ status: intentStatus }).eq("id", intent_id);
    return jsonResponse(req, { intent_id, status: intentStatus, targets });
  } catch (err) {
    if (err instanceof Response) return err;
    return errorResponse(req, err instanceof Error ? err.message : "Verification error", 500);
  }
});
