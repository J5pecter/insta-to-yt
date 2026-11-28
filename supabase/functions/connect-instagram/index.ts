import { handleCors, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { requireAdminUser } from "../_shared/supabase.ts";
import { decryptSecret, signOAuthState } from "../_shared/crypto.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const { userId, client } = await requireAdminUser(req);
    const { data: credRow } = await client
      .schema("private_secrets")
      .from("provider_credentials")
      .select("encrypted_credentials")
      .eq("user_id", userId)
      .eq("platform", "instagram")
      .maybeSingle();

    let appId = Deno.env.get("INSTAGRAM_APP_ID") ?? "";
    let loginMode = "instagram_login";
    if (credRow?.encrypted_credentials) {
      const cfg = JSON.parse(await decryptSecret(credRow.encrypted_credentials));
      appId = cfg.app_id;
      loginMode = cfg.login_mode ?? "instagram_login";
    }

    if (!appId) {
      return errorResponse(req, "Instagram App ID and Secret are not configured. Use the Setup Wizard in Accounts.", 400);
    }

    const supabaseUrl = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/+$/, "");
    const redirectUri = `${supabaseUrl}/functions/v1/instagram-oauth-callback`;
    const state = await signOAuthState(JSON.stringify({ uid: userId, p: "instagram", mode: loginMode }));

    if (loginMode === "instagram_login") {
      const params = new URLSearchParams({
        enable_fb_login: "0",
        force_authentication: "1",
        client_id: appId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: "instagram_business_basic,instagram_business_content_publish",
        state,
      });
      return jsonResponse(req, {
        platform: "instagram",
        auth_url: `https://www.instagram.com/oauth/authorize?${params.toString()}`,
        state,
      });
    }

    const params = new URLSearchParams({
      client_id: appId,
      redirect_uri: redirectUri,
      scope: "instagram_basic,instagram_content_publish,pages_show_list,pages_read_engagement",
      response_type: "code",
      state,
    });
    return jsonResponse(req, {
      platform: "instagram",
      auth_url: `https://www.facebook.com/v21.0/dialog/oauth?${params.toString()}`,
      state,
    });
  } catch (err) {
    if (err instanceof Response) return err;
    return errorResponse(req, err instanceof Error ? err.message : "Failed to initiate Instagram OAuth", 400);
  }
});
