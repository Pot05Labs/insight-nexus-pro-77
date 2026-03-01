const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { slideTexts } = await req.json();
    const OPENROUTER_KEY = Deno.env.get("OPENROUTER");
    if (!OPENROUTER_KEY) throw new Error("OPENROUTER secret not set");

    const prompt = `Extract campaign performance data from this South African FMCG post-campaign analysis presentation.

Return ONLY valid JSON:
{
  "rows": [
    {
      "campaignName": "string",
      "platform": "string or empty",
      "channel": "string or empty",
      "spend": number or 0,
      "impressions": number or 0,
      "clicks": number or 0,
      "ctr": number or 0,
      "cpm": number or 0,
      "conversions": number or 0,
      "revenue": number or 0,
      "roas": number or 0,
      "unitsSold": number or 0,
      "flightStart": "YYYY-MM-DD or empty",
      "flightEnd": "YYYY-MM-DD or empty"
    }
  ]
}

Rules:
- Each campaign/platform/time period = separate row
- "R200,000" → 200000 (strip R prefix, remove commas)
- "4.02%" → 4.02 (strip %)
- "2.52x" → 2.52 (strip x)
- Detect platforms: Meta, Google, TikTok, DStv, Checkers, OneCart, Mr D, YouTube
- Extract dates from "October 2025", "Nov-Dec 2025" etc.
- Prefer per-period breakdowns over totals when both exist

PRESENTATION TEXT:
${(slideTexts ?? "").substring(0, 8000)}`;

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
