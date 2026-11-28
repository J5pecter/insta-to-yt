import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export function getServiceClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!url || !serviceKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.");
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function requireAdminUser(req: Request): Promise<{ userId: string; email: string; client: SupabaseClient }> {
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    throw new Response(JSON.stringify({ detail: "Missing Authorization header" }), { status: 401 });
  }

  const client = getServiceClient();
  const { data, error } = await client.auth.getUser(token);
  if (error || !data?.user) {
    throw new Response(JSON.stringify({ detail: "Invalid or expired session token" }), { status: 401 });
  }

  const { data: membership } = await client
    .from("admin_memberships")
    .select("role, status")
    .eq("user_id", data.user.id)
    .maybeSingle();

  if (!membership || membership.role !== "admin" || membership.status !== "active") {
    throw new Response(JSON.stringify({ detail: "Administrator membership required" }), { status: 403 });
  }

  return { userId: data.user.id, email: data.user.email ?? "", client };
}

export function requireInternalCron(req: Request): void {
  const expected = Deno.env.get("INTERNAL_WORKER_SECRET") ?? "";
  const provided = req.headers.get("x-internal-cron-secret") ?? "";
  if (!expected || provided !== expected) {
    throw new Response(JSON.stringify({ detail: "Forbidden internal worker call" }), { status: 403 });
  }
}
