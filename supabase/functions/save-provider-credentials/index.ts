import { handleCors, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { requireAdminUser } from "../_shared/supabase.ts";
import { encryptSecret, maskSecret } from "../_shared/crypto.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const { userId, client } = await requireAdminUser(req);
    const body = await req.json();
    const platform = String(body.platform ?? "").toLowerCase();
    const supabaseUrl = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/+$/, "");

    if (platform === "youtube") {
      const parsed = typeof body.content === "string" ? JSON.parse(body.content) : body.content;
      const clientType = parsed?.web ? "web" : parsed?.installed ? "installed" : null;
      if (!clientType) return errorResponse(req, "Expected 'web' or 'installed' Google OAuth JSON.", 400);

      const block = parsed[clientType];
      const clientId = String(block?.client_id ?? "").trim();
      const clientSecret = String(block?.client_secret ?? "").trim();
      const authUri = String(block?.auth_uri ?? "https://accounts.google.com/o/oauth2/auth");
      const tokenUri = String(block?.token_uri ?? "https://oauth2.googleapis.com/token");

      if (!clientId.endsWith(".apps.googleusercontent.com")) {
        return errorResponse(req, "Invalid Google Client ID.", 400);
      }
      if (!clientSecret) return errorResponse(req, "Missing client_secret.", 400);
      if (!authUri.startsWith("https://accounts.google.com/") || !tokenUri.startsWith("https://oauth2.googleapis.com/")) {
        return errorResponse(req, "Untrusted Google OAuth endpoints.", 400);
      }

      const encrypted = await encryptSecret(JSON.stringify({ client_id: clientId, client_secret: clientSecret, auth_uri: authUri, token_uri: tokenUri }));
      const masked = maskSecret(clientId, 10, 28);

      const { error } = await client
        .schema("private_secrets")
        .from("provider_credentials")
        .upsert({ user_id: userId, platform: "youtube", encrypted_credentials: encrypted, masked_identifier: masked, updated_at: new Date().toISOString() }, { onConflict: "user_id,platform" });

      if (error) return errorResponse(req, error.message, 500);

      return jsonResponse(req, {
        status: "success",
        credentials: {
          configured: true,
          client_id_masked: masked,
          expected_callback_url: `${supabaseUrl}/functions/v1/youtube-oauth-callback`,
        },
      });
    }

    if (platform === "instagram") {
      const appId = String(body.app_id ?? "").trim();
      const appSecret = String(body.app_secret ?? "").trim();
      const loginMode = body.login_mode === "facebook_login" ? "facebook_login" : "instagram_login";

      if (!/^\d+$/.test(appId)) return errorResponse(req, "Instagram App ID must be numeric.", 400);
      if (appSecret.length < 16) return errorResponse(req, "Instagram App Secret is too short.", 400);

      const encrypted = await encryptSecret(JSON.stringify({ app_id: appId, app_secret: appSecret, login_mode: loginMode }));
      const masked = maskSecret(appId, 4, 4);

      const { error } = await client
        .schema("private_secrets")
        .from("provider_credentials")
        .upsert({ user_id: userId, platform: "instagram", encrypted_credentials: encrypted, masked_identifier: masked, updated_at: new Date().toISOString() }, { onConflict: "user_id,platform" });

      if (error) return errorResponse(req, error.message, 500);

      return jsonResponse(req, {
        status: "success",
        credentials: {
          configured: true,
          app_id_masked: masked,
          login_mode: loginMode,
          expected_callback_url: `${supabaseUrl}/functions/v1/instagram-oauth-callback`,
        },
      });
    }

    return errorResponse(req, "Unsupported platform.", 400);
  } catch (err) {
    if (err instanceof Response) return err;
    return errorResponse(req, err instanceof Error ? err.message : "Failed to save credentials", 400);
  }
});
