import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleCors } from "../_shared/cors.ts";

/**
 * Health Check Edge Function
 *
 * Returns the health status of core SignalStack services.
 * Used by uptime monitoring (e.g., Better Uptime, Checkly).
 *
 * GET /functions/v1/health-check → { status, checks, timestamp }
 */
serve(async (req) => {
  const preflightResp = handleCors(req);
  if (preflightResp) return preflightResp;

  const checks: Record<string, { ok: boolean; latencyMs?: number; error?: string }> = {};

  // Check 1: Supabase DB connectivity
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !supabaseKey) throw new Error("Missing Supabase env vars");

    const start = Date.now();
    const sb = createClient(supabaseUrl, supabaseKey);
    const { error } = await sb.from("profiles").select("id").limit(1);
    const latencyMs = Date.now() - start;

    checks.database = error
      ? { ok: false, latencyMs, error: error.message }
      : { ok: true, latencyMs };
  } catch (e) {
    checks.database = { ok: false, error: e instanceof Error ? e.message : "Unknown" };
  }

  // Check 2: OpenRouter API reachability
  try {
    const openrouterKey = Deno.env.get("OPENROUTER");
    if (!openrouterKey) {
      checks.openrouter = { ok: false, error: "OPENROUTER secret not set" };
    } else {
      const start = Date.now();
      const resp = await fetch("https://openrouter.ai/api/v1/models", {
        headers: { Authorization: `Bearer ${openrouterKey}` },
        signal: AbortSignal.timeout(5000),
      });
      const latencyMs = Date.now() - start;
      checks.openrouter = resp.ok
        ? { ok: true, latencyMs }
        : { ok: false, latencyMs, error: `HTTP ${resp.status}` };
    }
  } catch (e) {
    checks.openrouter = { ok: false, error: e instanceof Error ? e.message : "Timeout" };
  }

  // Aggregate
  const allOk = Object.values(checks).every((c) => c.ok);

  const body = {
    status: allOk ? "healthy" : "degraded",
    version: "1.0.0",
    checks,
    timestamp: new Date().toISOString(),
  };

  return new Response(JSON.stringify(body), {
    status: allOk ? 200 : 503,
    headers: {
      ...corsHeaders(req),
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
});
