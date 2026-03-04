import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// --- CORS ---
const ALLOWED_ORIGINS = [
  "https://signalstack.africa",
  "https://www.signalstack.africa",
];

function getAllowedOrigin(req: Request): string {
  const origin = req.headers.get("origin") ?? "";
  // Allow Lovable preview URLs and localhost for development
  if (
    ALLOWED_ORIGINS.includes(origin) ||
    origin.includes(".lovable.app") ||
    origin.includes(".lovableproject.com") ||
    origin.startsWith("http://localhost")
  ) {
    return origin;
  }
  return ALLOWED_ORIGINS[0];
}

function corsHeaders(req: Request) {
  return {
    "Access-Control-Allow-Origin": getAllowedOrigin(req),
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

// --- Model Routing ---
// Use OpenRouter auto-routing to pick the best available model per request.
// Fallback to Gemini Flash if auto-routing itself fails.
const MODEL_ROUTES: Record<string, { primary: string; fallback: string; maxTokens: number }> = {
  insights:     { primary: "openrouter/auto",          fallback: "google/gemini-2.5-flash", maxTokens: 2000 },
  report:       { primary: "openrouter/auto",          fallback: "google/gemini-2.5-flash", maxTokens: 3000 },
  query:        { primary: "google/gemini-2.5-flash",  fallback: "google/gemini-2.5-flash", maxTokens: 500  },
  extraction:   { primary: "google/gemini-2.5-flash",  fallback: "google/gemini-2.5-flash", maxTokens: 1000 },
  schema:       { primary: "google/gemini-2.5-flash",  fallback: "google/gemini-2.5-flash", maxTokens: 500  },
  anomaly:      { primary: "google/gemini-2.5-flash",  fallback: "google/gemini-2.5-flash", maxTokens: 1000 },
  segmentation: { primary: "google/gemini-2.5-flash",  fallback: "google/gemini-2.5-flash", maxTokens: 1500 },
  learning:     { primary: "google/gemini-2.5-flash",  fallback: "google/gemini-2.5-flash", maxTokens: 1000 },
};

// --- Rate Limiting (in-memory, per-instance) ---
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 30; // requests per window
const RATE_WINDOW_MS = 60_000; // 1 minute

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(userId);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

// --- System Prompts ---
const INSIGHTS_SYSTEM = `You are SignalStack by Pot Labs — a retail signal intelligence AI for South African FMCG commerce. You unify multi-retailer performance data and overlay campaign data to deliver decision-ready intelligence, helping brand teams and agencies prove retail media impact at checkout, not just on clicks.

You serve the South African FMCG ecosystem: retailers include Pick n Pay, Checkers/Shoprite Group, Woolworths, Spar, Makro, Game, Clicks, Dis-Chem. Advertising platforms: Meta, Google, TikTok, DStv/Multichoice, OOH, in-store (gondola ends, shelf talkers, loyalty programmes). Provinces: Gauteng, Western Cape, KwaZulu-Natal, Eastern Cape, Free State, Limpopo, Mpumalanga, North West, Northern Cape. Seasonal periods: Festive season (Nov-Jan), Back-to-School (Jan-Feb), Easter, Heritage Month (Sep).

All monetary values are in South African Rand (ZAR). Always use the R prefix (e.g., R1,250,000). Never use $ or other currency symbols.

Key metrics: ROAS, iROAS (incremental ROAS), mROAS (marginal ROAS), ROI, CPS (Cost Per Sale), Revenue, Units Sold, Gross Margin, CTR, CPC, CPM, Conversion Rate, AOV (Average Order Value).

## YOUR STRATEGIC FRAMEWORKS

You ALWAYS apply three proven strategic frameworks to your analysis:

### 1. System 1 Thinking (Jon Evans)
The vast majority of purchase decisions are made by System 1 — fast, intuitive, emotional processing. When analysing brand or campaign performance:
- **Mental Availability**: Is the brand building memory structures that make it come to mind in buying situations? Broad reach builds mental availability; over-targeting limits growth.
- **Distinctive Brand Assets**: Are consistent visual and verbal cues (colours, logos, taglines, packaging) being deployed? Distinctiveness beats differentiation.
- **Emotional Resonance vs Rational Messaging**: Campaigns that trigger emotion and build brand associations outperform rational persuasion. System 2 (deliberative, logical) messaging fights human nature.
- **Reach over Targeting**: Growth comes from reaching light and non-buyers, not just retargeting loyalists. Broad reach builds category penetration.

### 2. Strategic Thinking (Julian Cole)
ALWAYS structure your analysis using this three-part narrative arc:
- **WHAT** (The Data Insight): What does the data specifically tell us? Lead with the most surprising or actionable finding. Use exact numbers in ZAR.
- **SO WHAT** (The Strategic Implication): Why does this matter? Connect to brand health, competitive position, mental availability, or consumer behaviour. This is where strategy lives.
- **NOW WHAT** (The Actionable Recommendation): What should the brand team DO? Be specific: name channels, budgets, creative direction, retailer activations, or media weight shifts.

### 3. Behavioural Economics (Rory Sutherland)
When analysing consumer behaviour and recommending optimisations:
- **Choice Architecture**: How are products positioned in-store and online? Shelf placement, gondola ends, digital real estate, and default options shape decisions more than advertising.
- **Nudges**: Small contextual changes — signage, bundling, social proof, anchoring, scarcity cues — drive disproportionate results. Always look for these leverage points.
- **Reframing**: Sometimes the best response to underperformance is not more spend but reframing the proposition, changing the context, or repositioning relative to alternatives.
- **Perceived Value**: Perceived value often matters more than actual value. Premiumisation signals, packaging, and reference pricing shape willingness to pay.
- **Counterintuitive Solutions**: The most efficient solution is rarely the most obvious. Question assumptions. A small change in display, naming, or bundling can outperform a large media spend increase.

## RESPONSE FORMAT

Structure ALL responses as:
1. **Headline Finding** — One bold sentence with the key insight
2. **WHAT** — The data tells us... (specific numbers, ZAR values, percentages)
3. **SO WHAT** — This matters because... (strategic implication connecting to brand growth, mental availability, or behavioural economics)
4. **NOW WHAT** — The recommended action is... (specific, actionable — name channels, retailers, budget shifts, creative direction)

Use markdown formatting. Be direct and strategic — think like a senior strategist, not just an analyst. Reference South African retailers and ZAR values throughout.

If no data context is provided, give best-practice guidance grounded in these frameworks and note the user should upload data for personalised insights.`;

const QUERY_SYSTEM = `You are SignalStack by Pot Labs — a retail signal intelligence AI that translates natural language questions into data queries for South African FMCG retail analytics. All monetary values are in South African Rand (ZAR, R prefix).

You have access to the following database tables:

**sell_out_data**: retailer, brand, sub_brand, product_name_raw, sku, category, format_size, region, store_location, date, units_sold, units_supplied, revenue, cost
**campaign_data_v2**: platform, channel, campaign_name, flight_start, flight_end, spend, impressions, clicks, ctr, cpm, conversions, revenue, total_sales_attributed, total_units_attributed
**computed_metrics**: metric_name, metric_value, dimensions (jsonb), computed_at

IMPORTANT: All tables use soft deletes. The frontend will automatically add a deleted_at IS NULL filter to every query.

CRITICAL TENANT SCOPING: Never generate queries that could return data from other users. The frontend automatically adds user_id and deleted_at filtering — do NOT include user_id, project_id, or deleted_at in your generated filters. The frontend strips these columns from AI-generated filters as a security measure. Focus only on data-relevant filters (retailer, brand, date, etc.).

When the user asks a question:
1. Determine which table(s) to query
2. Generate a valid Supabase JS query using the supabase client (e.g. supabase.from("sell_out_data").select("product_name_raw, revenue").order("revenue", {ascending: false}).limit(5))
3. Return your response as JSON with this structure:
{"table":"table_name","select":"columns","filters":[],"order":{"column":"col","ascending":false},"limit":10,"explanation":"Brief explanation of what this query does"}

Filters should be objects like: {"column":"retailer","operator":"eq","value":"Amazon"}
Supported operators: eq, neq, gt, gte, lt, lte, like, ilike
Forbidden filter columns (handled by frontend): user_id, project_id, deleted_at

Always include an explanation framed as: WHAT this query reveals, SO WHAT it means strategically, and NOW WHAT to do with this insight. If the question is ambiguous, make reasonable assumptions and state them.`;

// --- Auth Helper ---
async function authenticateUser(req: Request): Promise<{ userId: string } | null> {
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

// --- Intelligence Injection ---
async function fetchIntelligenceContext(userId: string): Promise<string> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !supabaseServiceKey || userId === "anon") return "";

  try {
    const sb = createClient(supabaseUrl, supabaseServiceKey);

    // Find user's most recent project
    const { data: projects } = await sb
      .from("projects")
      .select("id")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1);

    const projectId = projects?.[0]?.id;
    if (!projectId) return "";

    // Fetch learned intelligence for this project
    const { data: intelligence } = await sb
      .from("client_intelligence")
      .select("intelligence_type, content, confidence")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .gte("confidence", 0.3)
      .order("last_updated_at", { ascending: false })
      .limit(10);

    if (!intelligence || intelligence.length === 0) return "";

    const ctx = intelligence
      .map((i: { intelligence_type: string; content: unknown; confidence: number }) =>
        `[${i.intelligence_type} | confidence: ${i.confidence}] ${JSON.stringify(i.content)}`
      )
      .join("\n\n");

    return `\n\nLEARNED CLIENT INTELLIGENCE (from previous uploads — use this to give specific, data-backed advice):\n${ctx}`;
  } catch (err) {
    console.warn("[ai-chat] Intelligence fetch failed (non-blocking):", err);
    return "";
  }
}

// --- Main Handler ---
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }

  try {
    // Auth check
    const auth = await authenticateUser(req);
    if (!auth) {
      return new Response(JSON.stringify({ error: "Unauthorized. Please log in." }), {
        status: 401,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Rate limit check
    if (!checkRateLimit(auth.userId)) {
      return new Response(JSON.stringify({ error: "Rate limited — max 30 requests per minute. Please wait." }), {
        status: 429,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const { messages, context } = await req.json();
    const OPENROUTER_KEY = Deno.env.get("OPENROUTER");
    if (!OPENROUTER_KEY) {
      throw new Error("OPENROUTER secret is not configured. Set it in Supabase Edge Function secrets.");
    }

    // Fetch learned intelligence and append to system prompt
    const intelligenceCtx = await fetchIntelligenceContext(auth.userId);
    const basePrompt = context === "query" ? QUERY_SYSTEM : INSIGHTS_SYSTEM;
    const systemPrompt = basePrompt + intelligenceCtx;

    // Select model based on context
    const route = MODEL_ROUTES[context ?? "insights"] ?? MODEL_ROUTES.insights;
    let model = route.primary;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://signalstack.africa",
        "X-Title": "SignalStack",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        stream: true,
        max_tokens: route.maxTokens,
      }),
    });

    // Auto-fallback: if primary model fails for any non-auth reason, try fallback
    if (!response.ok && response.status !== 401 && response.status !== 402) {
      const primaryErr = await response.text().catch(() => "");
      console.warn(`[ai-chat] Primary model ${model} failed (${response.status}): ${primaryErr.slice(0, 300)}. Trying fallback: ${route.fallback}`);
      model = route.fallback;

      const fallbackResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENROUTER_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://signalstack.africa",
          "X-Title": "SignalStack",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            ...messages,
          ],
          stream: true,
        }),
      });

      if (!fallbackResponse.ok) {
        const t = await fallbackResponse.text().catch(() => "");
        console.error(`[ai-chat] Fallback model ${model} also failed (${fallbackResponse.status}): ${t.slice(0, 300)}`);
        return new Response(JSON.stringify({ error: `Both AI models failed. Primary (${route.primary}): ${response.status}. Fallback (${model}): ${fallbackResponse.status}. ${t.slice(0, 100)}` }), {
          status: 503,
          headers: { ...corsHeaders(req), "Content-Type": "application/json" },
        });
      }

      return new Response(fallbackResponse.body, {
        headers: { ...corsHeaders(req), "Content-Type": "text/event-stream" },
      });
    }

    if (!response.ok) {
      const t = await response.text().catch(() => "");
      console.error(`[ai-chat] OpenRouter auth error (${response.status}): ${t.slice(0, 300)}`);
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "OpenRouter credits exhausted. Top up your OpenRouter account at openrouter.ai." }), {
          status: 402,
          headers: { ...corsHeaders(req), "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "OpenRouter API key invalid or expired. Check the OPENROUTER secret in Supabase Edge Function settings." }), {
        status: 401,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders(req), "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("ai-chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
