import { handleCors, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { requireAdminUser } from "../_shared/supabase.ts";

const FREE_STORAGE_LIMIT_BYTES = 1024 * 1024 * 1024; // 1 GB Supabase Free Plan

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const { userId, client } = await requireAdminUser(req);

    const [{ data: assets }, { data: jobs }, { data: accounts }] = await Promise.all([
      client.from("media_assets").select("size_bytes").eq("user_id", userId).neq("status", "deleted"),
      client.from("processing_jobs").select("status").eq("user_id", userId),
      client.from("social_accounts").select("connection_status").eq("user_id", userId),
    ]);

    const usedBytes = (assets ?? []).reduce((sum: number, a: any) => sum + (a.size_bytes ?? 0), 0);
    const usedMb = Math.round((usedBytes / (1024 * 1024)) * 100) / 100;
    const usagePercent = Math.round((usedBytes / FREE_STORAGE_LIMIT_BYTES) * 1000) / 10;

    const pendingJobs = (jobs ?? []).filter((j: any) => ["QUEUED", "UPLOADING", "PLATFORM_PROCESSING", "VERIFYING"].includes(j.status)).length;
    const failedJobs = (jobs ?? []).filter((j: any) => j.status === "FAILED").length;

    return jsonResponse(req, {
      status: usagePercent >= 85 ? "storage_limit_warning" : "healthy",
      architecture: "supabase_serverless",
      timestamp: new Date().toISOString(),
      database: { engine: "Supabase PostgreSQL", status: "connected" },
      storage: {
        used_mb: usedMb,
        limit_mb: 1024,
        usage_percent: usagePercent,
        status: usagePercent >= 85 ? "hard_limit_reached" : usagePercent >= 70 ? "warning" : "sufficient",
      },
      queue: {
        pending_jobs: pendingJobs,
        failed_jobs: failedJobs,
      },
      accounts: {
        connected: (accounts ?? []).filter((a: any) => a.connection_status === "connected").length,
      },
    });
  } catch (err) {
    if (err instanceof Response) return err;
    return errorResponse(req, err instanceof Error ? err.message : "Health check failed", 500);
  }
});
