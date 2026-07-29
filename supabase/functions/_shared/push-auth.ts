/**
 * Auth + database helpers shared by the push edge functions.
 */
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

export interface Caller {
  userId: string;
  isAdmin: boolean;
}

/** Service-role client — bypasses RLS for backend-owned tables. */
export function adminClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

/**
 * Validates the caller's JWT in code (functions deploy with verify_jwt = false)
 * and resolves whether they hold the admin role.
 */
export async function requireUser(req: Request): Promise<Caller | null> {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);

  const anon = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { auth: { persistSession: false } },
  );

  let userId: string | null = null;
  const { data: claimsData } = await anon.auth.getClaims(token);
  if (claimsData?.claims?.sub) {
    userId = String(claimsData.claims.sub);
  } else {
    const { data: userData } = await anon.auth.getUser(token);
    userId = userData?.user?.id ?? null;
  }
  if (!userId) return null;

  const admin = adminClient();
  const { data: roles } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);

  return {
    userId,
    isAdmin: (roles ?? []).some((r: { role: string }) => r.role === "admin"),
  };
}

/** Writes an audit row; never throws so a log failure can't break a send. */
export async function logDelivery(
  admin: SupabaseClient,
  row: Record<string, unknown>,
): Promise<void> {
  try {
    await admin.from("notification_delivery_logs").insert(row);
  } catch (err) {
    console.log("[push] falha ao gravar log", String(err));
  }
}

export function jsonResponse(
  body: unknown,
  status: number,
  headers: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}
