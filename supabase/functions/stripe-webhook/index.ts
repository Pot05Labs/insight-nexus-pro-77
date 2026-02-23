import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
  apiVersion: "2025-08-27.basil",
});

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

serve(async (req) => {
  // Webhooks are POST only
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const signature = req.headers.get("stripe-signature");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

  if (!signature || !webhookSecret) {
    return new Response("Missing signature or webhook secret", { status: 400 });
  }

  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err.message);
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }

  console.log(`[STRIPE-WEBHOOK] Received event: ${event.type}`);

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode !== "subscription") break;

        const customerId = session.customer as string;
        const subscriptionId = session.subscription as string;
        const userId = session.metadata?.user_id;
        const planName = session.metadata?.plan_name || null;

        if (!userId) {
          console.error("No user_id in session metadata");
          break;
        }

        // Fetch subscription to get period end
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const periodEnd = new Date(subscription.current_period_end * 1000).toISOString();

        const { error } = await supabase
          .from("profiles")
          .update({
            stripe_customer_id: customerId,
            subscription_status: "active",
            subscription_plan: planName,
            subscription_period_end: periodEnd,
          })
          .eq("user_id", userId);

        if (error) console.error("Failed to update profile:", error.message);
        else console.log(`[STRIPE-WEBHOOK] Activated subscription for user ${userId}`);
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;
        const status = subscription.status;
        const periodEnd = new Date(subscription.current_period_end * 1000).toISOString();

        const mappedStatus =
          status === "active" ? "active" :
          status === "past_due" ? "past_due" :
          status === "canceled" ? "canceled" : "inactive";

        const { error } = await supabase
          .from("profiles")
          .update({
            subscription_status: mappedStatus,
            subscription_period_end: periodEnd,
          })
          .eq("stripe_customer_id", customerId);

        if (error) console.error("Failed to update subscription:", error.message);
        else console.log(`[STRIPE-WEBHOOK] Updated subscription status to ${mappedStatus}`);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        const { error } = await supabase
          .from("profiles")
          .update({
            subscription_status: "canceled",
            subscription_plan: null,
            subscription_period_end: null,
          })
          .eq("stripe_customer_id", customerId);

        if (error) console.error("Failed to cancel subscription:", error.message);
        else console.log(`[STRIPE-WEBHOOK] Canceled subscription for customer ${customerId}`);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        const { error } = await supabase
          .from("profiles")
          .update({ subscription_status: "past_due" })
          .eq("stripe_customer_id", customerId);

        if (error) console.error("Failed to update payment failure:", error.message);
        else console.log(`[STRIPE-WEBHOOK] Marked subscription as past_due for ${customerId}`);
        break;
      }

      default:
        console.log(`[STRIPE-WEBHOOK] Unhandled event type: ${event.type}`);
    }
  } catch (err) {
    console.error(`[STRIPE-WEBHOOK] Error processing event:`, err);
    return new Response("Webhook handler error", { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  });
});
