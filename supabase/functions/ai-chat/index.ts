import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const INSIGHTS_SYSTEM = `You are the Commerce Intelligence Harmoniser by Pot Labs — a specialist AI for FMCG retail analytics, sell-out data harmonisation, campaign performance analysis, and commerce metrics.

You help analysts and brand managers understand their data across retail channels (Amazon, Walmart, Target, DTC) and advertising platforms (Meta, Google, TikTok, Amazon Ads).

Key metrics you specialise in: ROAS, iROAS (incremental ROAS), mROAS (marginal ROAS), ROI, CPS (Cost Per Sale), ACoS (Advertising Cost of Sales), Revenue, Units Sold, Returns Rate, Gross Margin, CTR, CPC, CPM, Conversion Rate.

When the user provides data context, use it to give specific, data-driven answers with exact numbers and percentages. Structure your response with:
- A concise headline finding
- Supporting data points
- Actionable recommendations
- Use markdown formatting for readability

If no data context is provided, give best-practice guidance and note the user should upload data for personalised insights.`;

const QUERY_SYSTEM = `You are the Commerce Intelligence Harmoniser by Pot Labs — a specialist AI that translates natural language questions into data queries for FMCG retail analytics.

You have access to the following database tables:

**sell_out_data**: retailer, brand, sub_brand, product_name_raw, sku, category, format_size, region, store_location, date, units_sold, units_supplied, revenue, cost
**campaign_data_v2**: platform, channel, campaign_name, flight_start, flight_end, spend, impressions, clicks, ctr, cpm, conversions, revenue, total_sales_attributed, total_units_attributed
**harmonized_sales**: channel, product_name, sku, date, units_sold, revenue, cost, returns
**computed_metrics**: metric_name, metric_value, dimensions (jsonb), computed_at

When the user asks a question:
1. Determine which table(s) to query
2. Generate a valid Supabase JS query using the supabase client (e.g. supabase.from("sell_out_data").select("product_name_raw, revenue").order("revenue", {ascending: false}).limit(5))
3. Return your response as JSON with this structure:
{"table":"table_name","select":"columns","filters":[],"order":{"column":"col","ascending":false},"limit":10,"explanation":"Brief explanation of what this query does"}

Filters should be objects like: {"column":"retailer","operator":"eq","value":"Amazon"}
Supported operators: eq, neq, gt, gte, lt, lte, like, ilike

Always include an explanation. If the question is ambiguous, make reasonable assumptions and state them.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, context } = await req.json();
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");

    const systemPrompt = context === "query" ? QUERY_SYSTEM : INSIGHTS_SYSTEM;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited — please wait and try again." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402 || response.status === 401) {
        return new Response(JSON.stringify({ error: "OpenAI API key issue. Check configuration." }), {
          status: response.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("OpenAI error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI service error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("ai-chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
