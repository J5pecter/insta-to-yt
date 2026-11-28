import { getServiceClient } from "../_shared/supabase.ts";
import { decryptSecret, encryptSecret, verifyOAuthState } from "../_shared/crypto.ts";

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const appRedirect = (Deno.env.get("APP_FRONTEND_URL") ?? "https://j5pecter.github.io/insta-to-yt/").replace(/\/+$/, "");

  if (error) return Response.redirect(`${appRedirect}/?tab=accounts&error=${encodeURIComponent(error)}`, 302);
  if (!code || !state) return Response.redirect(`${appRedirect}/?tab=accounts&error=missing_code_or_state`, 302);

  const verified = await verifyOAuthState(state);
  if (!verified) return Response.redirect(`${appRedirect}/?tab=accounts&error=invalid_or_expired_state`, 302);

  try {
    const { uid } = JSON.parse(verified);
    const client = getServiceClient();

    const { data: credRow } = await client
      .schema("private_secrets")
      .from("provider_credentials")
      .select("encrypted_credentials")
      .eq("user_id", uid)
      .eq("platform", "youtube")
      .maybeSingle();

    let clientId = Deno.env.get("GOOGLE_CLIENT_ID") ?? "";
    let clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "";
    if (credRow?.encrypted_credentials) {
      const cfg = JSON.parse(await decryptSecret(credRow.encrypted_credentials));
      clientId = cfg.client_id;
      clientSecret = cfg.client_secret;
    }

    const supabaseUrl = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/+$/, "");
    const redirectUri = `${supabaseUrl}/functions/v1/youtube-oauth-callback`;

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      throw new Error(tokenData.error_description || "Token exchange failed");
    }

    const chRes = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const chData = await chRes.json();
    const channel = chData?.items?.[0];
    if (!channel) throw new Error("No YouTube channel found for this Google account");

    const expiry = tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString() : null;

    const { data: acc, error: accErr } = await client
      .from("social_accounts")
      .upsert(
        {
          user_id: uid,
          platform: "youtube",
          external_account_id: channel.id,
          account_name: channel.snippet.title,
          permissions: ["youtube.upload", "youtube.readonly"],
          token_expiry: expiry,
          connection_status: "connected",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,platform,external_account_id" }
      )
      .select("id")
      .single();

    if (accErr) throw accErr;

    const encAccess = await encryptSecret(tokenData.access_token);
    const encRefresh = tokenData.refresh_token ? await encryptSecret(tokenData.refresh_token) : null;

    // Preserve existing refresh_token if Google omitted a replacement
    const { data: existingToken } = await client
      .schema("private_secrets")
      .from("social_tokens")
      .select("encrypted_refresh_token")
      .eq("social_account_id", acc.id)
      .maybeSingle();

    await client.schema("private_secrets").from("social_tokens").upsert(
      {
        social_account_id: acc.id,
        encrypted_access_token: encAccess,
        encrypted_refresh_token: encRefresh ?? existingToken?.encrypted_refresh_token ?? null,
        expires_at: expiry,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "social_account_id" }
    );

    return Response.redirect(`${appRedirect}/?tab=accounts&connected=youtube`, 302);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "oauth_error";
    return Response.redirect(`${appRedirect}/?tab=accounts&error=${encodeURIComponent(msg)}`, 302);
  }
});
