import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkles, Loader2, Lightbulb, Users, TrendingUp, DollarSign, ShoppingCart, Tag } from "lucide-react";
import EmptyState from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import KpiCard from "@/components/KpiCard";
import { useSellOutData, fmtZAR } from "@/hooks/useSellOutData";
import { useCampaignData } from "@/hooks/useCampaignData";
import { usePeriodComparison, type PeriodType } from "@/hooks/usePeriodComparison";
import { useGlobalFilters } from "@/contexts/GlobalFilterContext";
import { useSellOutKPIs } from "@/hooks/useSellOutKPIs";
import { useSellOutAggregation } from "@/hooks/useAggregation";
import SignalStackInsights from "@/components/SignalStackInsights";
import { chartCursorStyle, chartGridProps, CHART_ANIMATION_MS, CHART_HEIGHT, axisClassName, renderPieLabel, DONUT_COLORS, CHART_PALETTE, topNWithOther } from "@/lib/chart-utils";
import PremiumChartTooltip from "@/components/charts/ChartTooltip";
import { streamAiChat } from "@/services/aiChatStream";
import { buildBehaviourSummary } from "@/services/insightsSnapshot";
import { computeClientKPIs, computeClientAgg } from "@/lib/client-aggregation";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const FULL_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

interface Segment {
  title: string;
  desc: string;
  activation: string;
}

/**
 * Parse AI output into structured segments.
 * The AI returns blocks like:
 *   **Segment Name**: Description with **inner bold** terms...
 *   Activation: Strategy text...
 *
 * We split on top-level segment headers (line-starting **Name**:) and group
 * all body text into each segment, separating "Activation:" blocks.
 */
function parseSegmentBlocks(text: string): Segment[] {
  const segments: Segment[] = [];
  // Match segment headers: lines starting with ** and ending with **:
  // Use a capturing split so we get both headers and body text
  const headerPattern = /(?:^|\n)\s*\*\*([^*\n]{3,80})\*\*\s*[:\u2014\u2013-]\s*/g;
  const headers: { title: string; index: number }[] = [];
  let m: RegExpExecArray | null;

  while ((m = headerPattern.exec(text)) !== null) {
    headers.push({ title: m[1].trim(), index: m.index + m[0].length });
  }

  for (let i = 0; i < headers.length; i++) {
    const title = headers[i].title;
    const bodyStart = headers[i].index;
    const bodyEnd = i + 1 < headers.length ? headers[i + 1].index - (text.substring(0, headers[i + 1].index).match(/\n\s*\*\*[^*]{3,80}\*\*\s*[:\u2014\u2013-]\s*$/)?.[0]?.length ?? 0) : text.length;
    const body = text.substring(bodyStart, bodyEnd).trim();

    // Split body on "Activation:" line
    const actMatch = body.match(/\n\s*\*?\*?Activation\*?\*?\s*[:\u2014\u2013-]\s*/i);
    let desc: string;
    let activation: string;
    if (actMatch && actMatch.index !== undefined) {
      desc = body.substring(0, actMatch.index).trim();
      activation = body.substring(actMatch.index + actMatch[0].length).trim();
    } else {
      desc = body;
      activation = "";
    }

    // Clean up any remaining markdown bold markers for display
    const clean = (s: string) => s.replace(/\*\*/g, "").trim();
    if (title && desc) {
      segments.push({ title: clean(title), desc: clean(desc), activation: clean(activation) });
    }
  }

  return segments;
}

const BehaviourPage = () => {
  // Raw data kept for period comparison, AI summary, and AI segmentation context
  const { data, loading: rawLoading } = useSellOutData();
  const { data: campaigns } = useCampaignData();
  const { filters, filterSellOut } = useGlobalFilters();
  const [segments, setSegments] = useState<Segment[]>([]);
  const [segLoading, setSegLoading] = useState(false);
  const periodType: PeriodType = "MoM";

  // Server-side aggregated data via RPC hooks
  const { data: kpis, isLoading: kpisLoading } = useSellOutKPIs(filters);
  const { data: dowAgg, isLoading: dowLoading } = useSellOutAggregation("day_of_week", filters, 7);
  const { data: categoryAgg, isLoading: categoryLoading } = useSellOutAggregation("category", filters, 6);

  // Filtered raw data kept for period comparison and AI
  const filteredData = useMemo(() => filterSellOut(data), [data, filterSellOut]);

  // Period-over-period comparison (still uses raw data)
  const comparison = usePeriodComparison(filteredData, campaigns, periodType);

  // ── Client-side fallback when RPCs are unavailable ──
  const clientKpis = useMemo(() => computeClientKPIs(filteredData), [filteredData]);
  const clientDowAgg = useMemo(() => computeClientAgg(filteredData, "day_of_week", 7), [filteredData]);
  const clientCategoryAgg = useMemo(() => computeClientAgg(filteredData, "category", 6), [filteredData]);

  // Effective data: prefer RPC, fall back to client-side
  const effectiveKpis = kpis ?? clientKpis;
  const effectiveDowAgg = dowAgg ?? clientDowAgg;
  const effectiveCategoryAgg = categoryAgg ?? clientCategoryAgg;

  // Determine overall loading and data availability
  const isLoading = kpisLoading || dowLoading || categoryLoading;
  const hasData = data.length > 0 || (kpis?.row_count ?? 0) > 0;

  // ── Day-of-week chart data (with fallback) ──

  const dayData = useMemo(() => {
    const dowMap: Record<string, number> = {};
    for (const row of effectiveDowAgg) {
      dowMap[row.group_key] = row.total_revenue;
    }
    return DAYS.map((day, i) => ({
      day,
      revenue: Math.round(dowMap[String(i)] ?? 0),
    }));
  }, [effectiveDowAgg]);

  // ── Category donut (with fallback) ──

  const compData = useMemo(() => {
    const mapped = effectiveCategoryAgg.map((row) => ({
      name: row.group_key,
      value: Math.round(row.total_revenue),
    }));
    return topNWithOther(mapped, 5, "value", "name");
  }, [effectiveCategoryAgg]);

  // ── Date range from filtered raw data (for display) ──

  const dateRange = useMemo(() => {
    const dates = filteredData.map((r) => r.date).filter(Boolean).sort();
    if (dates.length === 0) return "";
    const fmt = (d: string) => new Date(d).toLocaleDateString("en-ZA", { month: "short", year: "numeric" });
    const first = fmt(dates[0]!);
    const last = fmt(dates[dates.length - 1]!);
    return first === last ? first : `${first} \u2013 ${last}`;
  }, [filteredData]);

  // ── Key finding from server-side day-of-week data ──

  const keyFinding = useMemo(() => {
    const totalTransactions = dayData.reduce((s, d) => s + d.revenue, 0);
    if (totalTransactions === 0) return null;
    const peak = dayData.reduce((a, b) => (b.revenue > a.revenue ? b : a), dayData[0]);
    const peakIdx = DAYS.indexOf(peak.day);
    const dayName = peakIdx >= 0 ? FULL_DAYS[peakIdx] : peak.day;
    const pct = ((peak.revenue / totalTransactions) * 100).toFixed(1);
    return `Peak trading day: ${dayName} generates ${pct}% of revenue`;
  }, [dayData]);

  // ── KPI values (server-side RPC with client-side fallback) ──
  const totalRevenue = effectiveKpis.total_revenue;
  const totalUnits = effectiveKpis.total_units;
  const avgOrderValue = totalUnits > 0 ? totalRevenue / totalUnits : 0;

  // AI summary still uses filtered raw data
  const dataSummary = useMemo(() => buildBehaviourSummary(filteredData)?.summary ?? "", [filteredData]);

  // ── AI Segment generation ──

  const generateSegments = async () => {
    setSegLoading(true);
    setSegments([]);
    const summary = `Day of week sales: ${dayData.map((d) => `${d.day}: ${fmtZAR(d.revenue)}`).join(", ")}. Categories: ${compData.map((c) => `${c.name} (${fmtZAR(c.value)})`).join(", ")}. Total rows: ${effectiveKpis.row_count || filteredData.length}.`;
    let full = "";
    await streamAiChat({
      messages: [{
        role: "user",
        content: `Based on this South African FMCG commerce data, identify 3-4 distinct customer behavioural segments through the lens of behavioural economics (Rory Sutherland). For each segment:
- Give a creative name that captures the behavioural driver
- Describe the purchase pattern and the nudges/context effects that influence their buying behaviour
- Suggest a specific activation strategy using choice architecture, reframing, or contextual nudges (e.g., gondola placement, bundling, social proof, default options)

Format as: **Segment Name**: Description with activation strategy.\n\nData:\n${summary}`,
      }],
      context: "segmentation",
      onDelta: (t) => { full += t; },
      onDone: () => {
        const segs = parseSegmentBlocks(full);
        setSegments(segs.length > 0 ? segs : [{ title: "Analysis", desc: full, activation: "" }]);
        setSegLoading(false);
      },
      onError: () => { setSegments([{ title: "Error", desc: "Unable to generate segments.", activation: "" }]); setSegLoading(false); },
    });
  };

  // ── Render ──

  if (isLoading && rawLoading) return <div className="p-8"><Skeleton className="h-96 w-full" /></div>;
  if (!hasData && !rawLoading && !isLoading && data.length === 0) return <div className="p-8"><EmptyState message="Upload data to see behavioural analytics." /></div>;

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header row */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Behaviour</h1>
          <p className="text-muted-foreground text-sm">
            Behavioural intelligence — understanding the nudges that drive purchase decisions.
          </p>
          {dateRange && (
            <p className="text-sm text-muted-foreground mt-1">
              {(effectiveKpis.row_count || filteredData.length).toLocaleString()} transactions &middot; {dateRange}
            </p>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <KpiCard
          label="Total Revenue"
          value={fmtZAR(totalRevenue)}
          icon={DollarSign}
          delta={comparison.revenue.deltaPct}
          periodLabel={comparison.previousLabel}
          loading={kpisLoading}
        />
        <KpiCard
          label="Units Sold"
          value={totalUnits.toLocaleString()}
          icon={ShoppingCart}
          delta={comparison.units.deltaPct}
          periodLabel={comparison.previousLabel}
          loading={kpisLoading}
        />
        <KpiCard
          label="Avg Order Value"
          value={fmtZAR(avgOrderValue)}
          icon={Tag}
          delta={comparison.aov.deltaPct}
          periodLabel={comparison.previousLabel}
          loading={kpisLoading}
        />
      </div>

      {/* Key Finding */}
      {keyFinding && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-accent/5 border border-accent/20 text-sm">
          <Lightbulb className="h-4 w-4 text-accent shrink-0" />
          <span className="text-foreground/80">{keyFinding}</span>
        </div>
      )}

      {/* Charts -- 2-column grid */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Order Composition */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="font-display text-base">Order Composition</CardTitle>
            <CardDescription className="text-xs">Revenue share by product category</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            {categoryLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={CHART_HEIGHT.half}>
                <PieChart>
                  <Pie data={compData} cx="50%" cy="50%" innerRadius={55} outerRadius={105} dataKey="value" nameKey="name" label={renderPieLabel} labelLine={false} className="text-[10px]" animationDuration={CHART_ANIMATION_MS}>
                    {compData.map((entry, i) => <Cell key={entry.name} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />)}
                  </Pie>
                  <Tooltip content={<PremiumChartTooltip />} />
                  <text x="50%" y="46%" textAnchor="middle" className="fill-muted-foreground" style={{ fontSize: "10px" }}>Total</text>
                  <text x="50%" y="56%" textAnchor="middle" className="fill-foreground font-bold" style={{ fontSize: "14px" }}>{fmtZAR(compData.reduce((s, c) => s + c.value, 0))}</text>
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Sales by Day of Week */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="font-display text-base">Sales by Day of Week</CardTitle>
            <CardDescription className="text-xs">Revenue distribution across trading days</CardDescription>
          </CardHeader>
          <CardContent>
            {dowLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={CHART_HEIGHT.half}>
                <BarChart data={dayData}>
                  <CartesianGrid {...chartGridProps} />
                  <XAxis dataKey="day" className={axisClassName} />
                  <YAxis className={axisClassName} tickFormatter={(v) => fmtZAR(v)} />
                  <Tooltip content={<PremiumChartTooltip />} cursor={chartCursorStyle} />
                  <Bar dataKey="revenue" radius={[4, 4, 0, 0]} animationDuration={CHART_ANIMATION_MS}>
                    {dayData.map((_, i) => <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Customer Segments -- AI powered */}
      <Card className="glass-card border-accent/10">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-accent/10 flex items-center justify-center">
                <Users className="h-4 w-4 text-accent" />
              </div>
              <div>
                <CardTitle className="font-display text-base">Customer Segments</CardTitle>
                <CardDescription className="text-xs">AI-powered behavioural segmentation</CardDescription>
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={generateSegments} disabled={segLoading} className="text-xs gap-1.5">
              {segLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
              {segLoading ? "Analysing..." : "Generate Segments"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {segments.length > 0 ? (
            <div className="space-y-3">
              {segments.map((seg, i) => (
                <div key={i} className="rounded-lg border border-border/50 bg-card/50 p-4 transition-colors hover:bg-accent/5">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 h-7 w-7 shrink-0 rounded-lg bg-accent/10 flex items-center justify-center">
                      <span className="text-xs font-bold text-accent">{i + 1}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-display text-sm font-semibold mb-1.5">{seg.title}</p>
                      <p className="text-xs text-muted-foreground leading-relaxed">{seg.desc}</p>
                      {seg.activation && (
                        <div className="mt-3 pt-3 border-t border-border/30">
                          <div className="flex items-center gap-1.5 mb-1">
                            <TrendingUp className="h-3 w-3 text-accent/70" />
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-accent/70">Activation</span>
                          </div>
                          <p className="text-xs text-muted-foreground leading-relaxed">{seg.activation}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="h-12 w-12 rounded-full bg-muted/50 flex items-center justify-center mb-3">
                <Users className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground/70 mb-1">No segments generated yet</p>
              <p className="text-xs text-muted-foreground max-w-sm">
                Click "Generate Segments" to identify customer behavioural patterns using AI-powered analysis.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* SignalStack Intelligence */}
      <SignalStackInsights
        dataSummary={dataSummary}
        title="Behavioural Insights"
      />
    </div>
  );
};

export default BehaviourPage;
