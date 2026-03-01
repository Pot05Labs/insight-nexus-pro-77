const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { headers, sampleRows, localMapping, localDataType, localConfidence } = await req.json();
    const OPENROUTER_KEY = Deno.env.get("OPENROUTER");
    if (!OPENROUTER_KEY) throw new Error("OPENROUTER secret not set");

    const prompt = `You are a data classification engine for South African FMCG retail analytics.

Given these spreadsheet column headers and 3 sample rows, return a JSON mapping of canonical field names to source column names.

SOURCE COLUMNS: ${JSON.stringify(headers)}
SAMPLE DATA: ${JSON.stringify(sampleRows)}
LOCAL MAPPING ATTEMPT (confidence ${localConfidence}): ${JSON.stringify(localMapping)}
LOCAL DATA TYPE GUESS: ${localDataType}

SELL-OUT fields: date, product_name_raw, sku, retailer, store_location, region, category, brand, sub_brand, format_size, revenue, actual_revenue, units_sold, units_supplied, cost, order_id
CAMPAIGN fields: flight_start, flight_end, platform, channel, campaign_name, spend, impressions, clicks, ctr, cpm, conversions, revenue, roas, total_sales_attributed, total_units_attributed

South African context:
- "Merchandise Sales" → actual_revenue (preferred over "Ordered Value" for revenue)
- "Date Delivery" → date, "Vendor" → retailer, "Subs Product" → sub_brand
- Currency is ZAR with "R" prefix

RESPOND WITH ONLY JSON:
{
  "data_type": "sell_out" | "campaign" | "mixed",
  "confidence": 0.0-1.0,
  "column_mapping": { "canonical_field": "Exact Source Column Name", ... },
  "unmapped_columns": ["col1", ...]
}

Values in column_mapping must be EXACT source column names (case-sensitive).`;

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://signalstack.africa",
        "X-Title": "SignalStack Schema Detection",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: prompt }],
        temperature: 0,
      }),
    });

    if (!res.ok) throw new Error(`OpenRouter: ${res.status}`);

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content ?? "";
    const clean = text.replace(/```json\s*|```\s*/g, "").trim();

    // Validate the response is valid JSON with expected structure
    const parsed = JSON.parse(clean);
    if (!parsed.column_mapping || typeof parsed.column_mapping !== "object") {
      throw new Error("Invalid LLM response structure");
    }

    // Verify all mapped values are actual source column names
    for (const [canonical, sourceCol] of Object.entries(parsed.column_mapping)) {
      if (!headers.includes(sourceCol)) {
        delete parsed.column_mapping[canonical];  // Remove hallucinated mappings
      }
    }

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
