import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { authenticateRequest } from "../_shared/auth.ts";

/**
 * Check Subscription Edge Function
 *
 * Verifies the authenticated user's Stripe subscription status.
 * Returns { subscribed, product_id, subscription_end }.
 *
 * Gracefully returns { subscribed: false } when:
 *   - STRIPE_SECRET_KEY is not configured
 *   - User has no Stripe customer record
 *   - No active subscription exists
 */

Deno.serve(async (req) => {
  const preflightResp = handleCors(req);
  if (preflightResp) return preflightResp;

  const respond = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });

  try {
    // ── Auth ──
    const auth = await authenticateRequest(req);
    if (!auth) {
      return respond({ error: "Authorization required" }, 401);
    }

    // ── Stripe key check ──
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      console.warn("[check-subscription] STRIPE_SECRET_KEY not set — returning unsubscribed");
      return respond({ subscribed: false });
    }

    // ── Look up user email ──
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    const token = (req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "").slice(7);
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !userData?.user?.email) {
      return respond({ subscribed: false });
    }

    const email = userData.user.email;

    // ── Stripe lookup ──
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const customers = await stripe.customers.list({ email, limit: 1 });

    if (customers.data.length === 0) {
      return respond({ subscribed: false });
    }

    const customerId = customers.data[0].id;
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "active",
      limit: 1,
    });

    const hasActiveSub = subscriptions.data.length > 0;
    let productId = null;
    let subscriptionEnd = null;

    if (hasActiveSub) {
      const subscription = subscriptions.data[0];
      subscriptionEnd = new Date(subscription.current_period_end * 1000).toISOString();
      productId = subscription.items.data[0].price.product;
    }

    return respond({
      subscribed: hasActiveSub,
      product_id: productId,
      subscription_end: subscriptionEnd,
    });
  } catch (error: unknown) {
    console.error("[check-subscription] Error:", error);
    return respond({
      error: error instanceof Error ? error.message : "Unknown error",
    }, 500);
  }
});
