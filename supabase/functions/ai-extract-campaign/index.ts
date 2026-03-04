import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function authenticateUser(req: Request): Promise<string | null> {
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
  return user.id;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const userId = await authenticateUser(req);
    if (!userId) {
      return new Response(
        JSON.stringify({ error: "Unauthorized. Please log in." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { slideTexts, fileName } = await req.json();
    const OPENROUTER_KEY = Deno.env.get("OPENROUTER");
    if (!OPENROUTER_KEY) throw new Error("OPENROUTER secret not set");

    const fileContext = fileName ? `\nFILE NAME: ${fileName}\n` : "";

    const prompt = `You are a data extraction specialist for South African FMCG retail media campaigns. Extract ALL campaign performance metrics from this post-campaign analysis (PCA) presentation.
${fileContext}
IMPORTANT: This is a PowerPoint PCA where metrics are spread across text boxes on slides (NOT in tables). You must carefully read label-value pairs like:
  "TOTAL SPEND" (next text) "R200,000"
  "Average CTR" (next text) "4.02%"

Return ONLY valid JSON:
{
  "rows": [
    {
      "campaignName": "string — campaign name from title slide or context",
      "platform": "string — the ad platform (Checkers, Woolworths, Pick n Pay, Meta, Google, TikTok, DStv, YouTube, OneCart, Mr D, Takealot). Infer from context: 'Onsite' = retailer media, 'CPM' without platform = retail media",
      "channel": "string — Onsite, Social, Search, Display, Video, Programmatic, or empty",
      "spend": "number — total media spend for this period in ZAR (strip R prefix and commas)",
      "impressions": "number — total impressions served",
      "clicks": "number — total clicks. If not explicitly stated, CALCULATE: clicks = impressions × (CTR / 100)",
      "ctr": "number — click-through rate as percentage (e.g. 4.02 not 0.0402)",
      "cpm": "number — cost per mille in ZAR",
      "conversions": "number — purchases or conversion events, or 0",
      "revenue": "number — attributed sales/revenue in ZAR. This is the TOTAL SALES figure, not just ad platform revenue",
      "roas": "number — return on ad spend as multiplier (e.g. 2.52)",
      "totalUnitsAttributed": "number — total units sold attributed to the campaign",
      "totalSalesAttributed": "number — same as revenue, total sales value attributed",
      "flightStart": "YYYY-MM-DD — campaign start date",
      "flightEnd": "YYYY-MM-DD — campaign end date (last day of the period)"
    }
  ]
}

EXTRACTION RULES:
1. Create ONE ROW per time period (e.g. one for October, one for November). Prefer monthly breakdowns over totals when both exist.
2. ZAR values: "R200,000" → 200000, "R503,122.07" → 503122.07 (strip R, remove commas)
3. Percentages: "4.02%" → 4.02 (strip %)
4. Multipliers: "2.52x" → 2.52 (strip x)
5. Dates: "October 2025" → flightStart: "2025-10-01", flightEnd: "2025-10-31"
6. CALCULATE missing fields: If CTR and impressions exist but clicks are missing, compute clicks = impressions × CTR / 100
7. If impressions are only available as a total (not split per month), divide proportionally by spend ratio or units ratio
8. Platform inference: "Onsite CPM", "retail media" → the retailer name is the platform (Checkers, Woolworths, etc.)
9. Include ALL numeric metrics you can find — do not leave fields as 0 if data exists in the text
10. If the same metric appears multiple times (e.g. revenue on overview slide AND conclusion slide), use the most specific/detailed value

PRESENTATION TEXT:
${(slideTexts ?? "").substring(0, 12000)}`;

    // Primary: Gemini Pro (best extraction quality)
    let res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://signalstack.africa",
        "X-Title": "SignalStack Campaign Extraction",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [{ role: "user", content: prompt }],
        temperature: 0,
      }),
    });

    // Fallback: Gemini Flash
    if (!res.ok) {
      res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENROUTER_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://signalstack.africa",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [{ role: "user", content: prompt }],
          temperature: 0,
        }),
      });
      if (!res.ok) throw new Error("Both models failed");
    }

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content ?? "";
    const clean = text.replace(/```json\s*|```\s*/g, "").trim();

    // Validate
    const parsed = JSON.parse(clean);
    if (!Array.isArray(parsed.rows)) throw new Error("No rows array in response");

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
