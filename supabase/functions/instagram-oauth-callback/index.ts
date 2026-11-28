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
    const { uid, mode } = JSON.parse(verified);
    const client = getServiceClient();

    const { data: credRow } = await client
      .schema("private_secrets")
      .from("provider_credentials")
      .select("encrypted_credentials")
      .eq("user_id", uid)
      .eq("platform", "instagram")
      .maybeSingle();

    let appId = Deno.env.get("INSTAGRAM_APP_ID") ?? "";
    let appSecret = Deno.env.get("INSTAGRAM_APP_SECRET") ?? "";
    if (credRow?.encrypted_credentials) {
      const cfg = JSON.parse(await decryptSecret(credRow.encrypted_credentials));
      appId = cfg.app_id;
      appSecret = cfg.app_secret;
    }

    const supabaseUrl = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/+$/, "");
    const redirectUri = `${supabaseUrl}/functions/v1/instagram-oauth-callback`;

    let accessToken = "";
    let expiresIn = 5184000;
    let igAccountId = "";
    let igAccountName = "";

    if (mode === "instagram_login") {
      const tokenRes = await fetch("https://api.instagram.com/oauth/access_token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: appId,
          client_secret: appSecret,
          grant_type: "authorization_code",
          redirect_uri: redirectUri,
          code,
        }),
      });
      const tokenData = await tokenRes.json();
      if (!tokenRes.ok || !tokenData.access_token) throw new Error(tokenData.error_message || "Instagram Login failed");

      const longRes = await fetch(
        `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${encodeURIComponent(appSecret)}&access_token=${encodeURIComponent(tokenData.access_token)}`
      );
      const longData = longRes.ok ? await longRes.json() : {};
      accessToken = longData.access_token ?? tokenData.access_token;
      expiresIn = longData.expires_in ?? 5184000;

      const meRes = await fetch(`https://graph.instagram.com/v21.0/me?fields=user_id,username,name&access_token=${encodeURIComponent(accessToken)}`);
      const meData = meRes.ok ? await meRes.json() : {};
      igAccountId = String(meData.user_id ?? tokenData.user_id);
      igAccountName = meData.username ?? meData.name ?? "Instagram Creator";
    } else {
      const tokenRes = await fetch(
        `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${encodeURIComponent(appId)}&client_secret=${encodeURIComponent(appSecret)}&redirect_uri=${encodeURIComponent(redirectUri)}&code=${encodeURIComponent(code)}`
      );
      const tokenData = await tokenRes.json();
      if (!tokenRes.ok || !tokenData.access_token) throw new Error("Facebook token exchange failed");
      accessToken = tokenData.access_token;

      const pagesRes = await fetch(
        `https://graph.facebook.com/v21.0/me/accounts?fields=instagram_business_account{id,username,name}&access_token=${encodeURIComponent(accessToken)}`
      );
      const pagesData = await pagesRes.json();
      const page = (pagesData.data ?? []).find((p: any) => p.instagram_business_account);
      if (!page) throw new Error("No Instagram Professional account linked to Facebook Pages");
      igAccountId = String(page.instagram_business_account.id);
      igAccountName = page.instagram_business_account.username ?? page.instagram_business_account.name;
    }

    const expiry = new Date(Date.now() + expiresIn * 1000).toISOString();
    const { data: acc, error: accErr } = await client
      .from("social_accounts")
      .upsert(
        {
          user_id: uid,
          platform: "instagram",
          external_account_id: igAccountId,
          account_name: igAccountName,
          permissions: ["instagram_business_basic", "instagram_business_content_publish"],
          token_expiry: expiry,
          connection_status: "connected",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,platform,external_account_id" }
      )
      .select("id")
      .single();

    if (accErr) throw accErr;

    await client.schema("private_secrets").from("social_tokens").upsert(
      {
        social_account_id: acc.id,
        encrypted_access_token: await encryptSecret(accessToken),
        expires_at: expiry,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "social_account_id" }
    );

    return Response.redirect(`${appRedirect}/?tab=accounts&connected=instagram`, 302);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "oauth_error";
    return Response.redirect(`${appRedirect}/?tab=accounts&error=${encodeURIComponent(msg)}`, 302);
  }
});
