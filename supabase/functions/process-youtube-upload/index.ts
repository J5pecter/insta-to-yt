import { jsonResponse, errorResponse } from "../_shared/cors.ts";
import { getServiceClient, requireInternalCron } from "../_shared/supabase.ts";
import { decryptSecret, encryptSecret } from "../_shared/crypto.ts";

const CHUNK_BYTES = 5 * 1024 * 1024; // 5 MB resumable chunks (safe within 256 MB Edge memory)

Deno.serve(async (req) => {
  try {
    requireInternalCron(req);
    const { job_id, target_id, intent_id } = await req.json();
    const client = getServiceClient();

    const { data: target } = await client.from("publication_targets").select("*").eq("id", target_id).single();
    const { data: intent } = await client.from("publishing_intents").select("*, drafts(*, media_assets(*))").eq("id", intent_id).single();
    if (!target || !intent) return errorResponse(req, "Target or intent missing", 404);

    if (target.status === "PUBLISHED") {
      await client.from("processing_jobs").update({ status: "PUBLISHED", progress: 100 }).eq("id", job_id);
      return jsonResponse(req, { status: "already_published" });
    }

    const { data: tokRow } = await client.schema("private_secrets").from("social_tokens").select("*").eq("social_account_id", target.social_account_id).single();
    if (!tokRow) {
      await client.from("publication_targets").update({ status: "AUTH_REQUIRED", error_message: "Missing OAuth token" }).eq("id", target.id);
      return errorResponse(req, "Missing YouTube OAuth token", 401);
    }

    let accessToken = await decryptSecret(tokRow.encrypted_access_token);
    if (tokRow.expires_at && new Date(tokRow.expires_at) <= new Date(Date.now() + 60_000) && tokRow.encrypted_refresh_token) {
      const { data: credRow } = await client.schema("private_secrets").from("provider_credentials").select("encrypted_credentials").eq("user_id", target.user_id).eq("platform", "youtube").maybeSingle();
      if (credRow) {
        const cfg = JSON.parse(await decryptSecret(credRow.encrypted_credentials));
        const refreshToken = await decryptSecret(tokRow.encrypted_refresh_token);
        const refRes = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: cfg.client_id,
            client_secret: cfg.client_secret,
            refresh_token: refreshToken,
            grant_type: "refresh_token",
          }),
        });
        const refData = await refRes.json();
        if (refRes.ok && refData.access_token) {
          accessToken = refData.access_token;
          await client.schema("private_secrets").from("social_tokens").update({
            encrypted_access_token: await encryptSecret(accessToken),
            expires_at: new Date(Date.now() + (refData.expires_in ?? 3600) * 1000).toISOString(),
          }).eq("social_account_id", target.social_account_id);
        }
      }
    }

    const asset = intent.drafts.media_assets;
    const totalBytes = asset.size_bytes;
    let sessionUri = target.remote_upload_session_reference ? await decryptSecret(target.remote_upload_session_reference) : "";

    if (!sessionUri) {
      const snap = intent.approved_snapshot;
      const initRes = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json; charset=UTF-8",
          "X-Upload-Content-Length": String(totalBytes),
          "X-Upload-Content-Type": asset.mime_type || "video/mp4",
        },
        body: JSON.stringify({
          snippet: {
            title: snap.title,
            description: snap.description,
            tags: (snap.hashtags ?? []).map((t: string) => t.replace(/^#/, "")),
            categoryId: "24",
          },
          status: {
            privacyStatus: snap.privacy ?? "private",
            selfDeclaredMadeForKids: Boolean(snap.made_for_kids),
          },
        }),
      });

      if (initRes.status === 403) {
        await client.from("publication_targets").update({ status: "QUOTA_BLOCKED", error_message: "YouTube daily quota exceeded" }).eq("id", target.id);
        await client.from("processing_jobs").update({ status: "QUOTA_BLOCKED", error_message: "YouTube daily quota exceeded" }).eq("id", job_id);
        return errorResponse(req, "YouTube quota exceeded", 429);
      }

      sessionUri = initRes.headers.get("location") ?? "";
      if (!initRes.ok || !sessionUri) throw new Error(`Failed to initiate YouTube resumable session (${initRes.status})`);

      await client.from("publication_targets").update({
        remote_upload_session_reference: await encryptSecret(sessionUri),
        status: "UPLOADING",
      }).eq("id", target.id);
    }

    // Download next bounded chunk from private Supabase Storage via signed URL + Range header
    const [bucket, ...pathParts] = asset.storage_path.split("/");
    const objectPath = pathParts.join("/");
    const { data: signed } = await client.storage.from(bucket).createSignedUrl(objectPath, 300);
    if (!signed?.signedUrl) throw new Error("Failed to sign private storage object");

    const start = target.remote_byte_offset ?? 0;
    const end = Math.min(start + CHUNK_BYTES - 1, totalBytes - 1);
    const chunkRes = await fetch(signed.signedUrl, { headers: { Range: `bytes=${start}-${end}` } });
    const chunkBuf = await chunkRes.arrayBuffer();

    const putRes = await fetch(sessionUri, {
      method: "PUT",
      headers: {
        "Content-Length": String(chunkBuf.byteLength),
        "Content-Range": `bytes ${start}-${end}/${totalBytes}`,
      },
      body: chunkBuf,
    });

    if (putRes.status === 308) {
      const nextOffset = end + 1;
      const pct = Math.round((nextOffset / totalBytes) * 100);
      await client.from("publication_targets").update({ remote_byte_offset: nextOffset }).eq("id", target.id);
      await client.from("processing_jobs").update({ status: "QUEUED", progress: pct, run_at: new Date().toISOString() }).eq("id", job_id);
      return jsonResponse(req, { status: "chunk_uploaded", next_offset: nextOffset, percent: pct });
    }

    if (putRes.ok) {
      const ytOut = await putRes.json();
      const videoId = ytOut.id;
      const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;
      await client.from("publication_targets").update({
        remote_media_id: videoId,
        published_url: ytUrl,
        status: "PUBLISHED",
        published_at: new Date().toISOString(),
      }).eq("id", target.id);
      await client.from("processing_jobs").update({ status: "PUBLISHED", progress: 100 }).eq("id", job_id);
      await client.from("publishing_intents").update({ status: "PUBLISHED" }).eq("id", intent.id);
      return jsonResponse(req, { status: "published", video_id: videoId, url: ytUrl });
    }

    throw new Error(`YouTube chunk upload failed with HTTP ${putRes.status}`);
  } catch (err) {
    if (err instanceof Response) return err;
    return errorResponse(req, err instanceof Error ? err.message : "YouTube upload error", 500);
  }
});
