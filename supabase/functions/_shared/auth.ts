/* ------------------------------------------------------------------ */
/*  Shared auth helper for all SignalStack Edge Functions              */
/*  Extracts and verifies the user from the Authorization header      */
/* ------------------------------------------------------------------ */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export type AuthResult = { userId: string };

/**
 * Authenticate the request by verifying the JWT via Supabase Auth.
 * Returns { userId } on success or null if auth fails.
 */
export async function authenticateRequest(req: Request): Promise<AuthResult | null> {
  const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase auth configuration missing (SUPABASE_URL/SUPABASE_ANON_KEY).");
  }

  const token = authHeader.slice(7);
  const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error } = await supabaseAuth.auth.getUser(token);
  if (error || !user) return null;
  return { userId: user.id };
}
