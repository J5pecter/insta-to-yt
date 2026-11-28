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
      .eq("platform", "youtube")
      .maybeSingle();

    let clientId = Deno.env.get("GOOGLE_CLIENT_ID") ?? "";
    if (credRow?.encrypted_credentials) {
      const cfg = JSON.parse(await decryptSecret(credRow.encrypted_credentials));
      clientId = cfg.client_id;
    }

    if (!clientId) {
      return errorResponse(req, "YouTube OAuth client credentials not configured. Upload client_secret.json in Accounts.", 400);
    }

    const supabaseUrl = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/+$/, "");
    const redirectUri = `${supabaseUrl}/functions/v1/youtube-oauth-callback`;
    const state = await signOAuthState(JSON.stringify({ uid: userId, p: "youtube" }));

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly",
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      state,
    });

    return jsonResponse(req, {
      platform: "youtube",
      auth_url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
      state,
    });
  } catch (err) {
    if (err instanceof Response) return err;
    return errorResponse(req, err instanceof Error ? err.message : "Failed to initiate YouTube OAuth", 400);
  }
});
