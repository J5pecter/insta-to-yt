import { handleCors, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { requireAdminUser } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const { userId, client } = await requireAdminUser(req);
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const action = body.action ?? "readiness";
    const supabaseUrl = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/+$/, "");

    if (action === "test" && body.account_id) {
      const { data: acc } = await client
        .from("social_accounts")
        .select("*")
        .eq("id", body.account_id)
        .eq("user_id", userId)
        .maybeSingle();
      if (!acc) return errorResponse(req, "Account not found", 404);
      const isExpired = acc.token_expiry ? new Date(acc.token_expiry) < new Date() : false;
      return jsonResponse(req, {
        id: acc.id,
        platform: acc.platform,
        account_name: acc.account_name,
        healthy: !isExpired && acc.connection_status === "connected",
        status: isExpired ? "expired" : acc.connection_status,
      });
    }

    if (action === "disconnect" && body.account_id) {
      await client.from("social_accounts").delete().eq("id", body.account_id).eq("user_id", userId);
      return jsonResponse(req, { status: "success" });
    }

    // Default: global readiness
    const [{ data: creds }, { data: accounts }] = await Promise.all([
      client.schema("private_secrets").from("provider_credentials").select("platform, masked_identifier").eq("user_id", userId),
      client.from("social_accounts").select("*").eq("user_id", userId),
    ]);

    const ytCred = (creds ?? []).find((c: any) => c.platform === "youtube");
    const igCred = (creds ?? []).find((c: any) => c.platform === "instagram");
    const ytAccs = (accounts ?? []).filter((a: any) => a.platform === "youtube");
    const igAccs = (accounts ?? []).filter((a: any) => a.platform === "instagram");
    const ready = ytAccs.some((a: any) => a.connection_status === "connected") || igAccs.some((a: any) => a.connection_status === "connected");

    const guidance = [];
    if (!ytCred) guidance.push({ platform: "youtube", title: "YouTube OAuth not configured", action: "Open Accounts -> YouTube Setup Wizard." });
    if (!igCred) guidance.push({ platform: "instagram", title: "Instagram App not configured", action: "Open Accounts -> Instagram Setup Wizard." });

    return jsonResponse(req, {
      state: ready ? "ready_to_publish" : "initial_setup_required",
      label: ready ? "Cloud ready to publish" : "Initial setup required",
      ready,
      youtube: {
        credentials: {
          configured: Boolean(ytCred),
          client_id_masked: ytCred?.masked_identifier ?? null,
          expected_callback_url: `${supabaseUrl}/functions/v1/youtube-oauth-callback`,
        },
        connected_count: ytAccs.length,
        accounts: ytAccs,
      },
      instagram: {
        credentials: {
          configured: Boolean(igCred),
          app_id_masked: igCred?.masked_identifier ?? null,
          login_mode: "instagram_login",
          expected_callback_url: `${supabaseUrl}/functions/v1/instagram-oauth-callback`,
        },
        connected_count: igAccs.length,
        accounts: igAccs,
      },
      guidance,
    });
  } catch (err) {
    if (err instanceof Response) return err;
    return errorResponse(req, err instanceof Error ? err.message : "Account action failed", 400);
  }
});
