import { useState, useRef, useMemo } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart, Bar, LineChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";
import { Megaphone, DollarSign, MousePointerClick, Eye, TrendingUp, Target, ArrowUpDown, Lightbulb, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import ExportPdfButton from "@/components/ExportPdfButton";
import ExportCsvButton from "@/components/ExportCsvButton";
import SignalStackInsights from "@/components/SignalStackInsights";
import DeltaIndicator from "@/components/DeltaIndicator";
import KpiCard from "@/components/KpiCard";
import EmptyState from "@/components/EmptyState";
import { fmtZAR, useSellOutData } from "@/hooks/useSellOutData";
import { useCampaignData } from "@/hooks/useCampaignData";
import { chartCursorStyle, chartGridProps, CHART_ANIMATION_MS, CHART_HEIGHT, axisClassName, LINE_COLORS } from "@/lib/chart-utils";
import PremiumChartTooltip from "@/components/charts/ChartTooltip";
import { computeCampaignAttribution, type CampaignFlight } from "@/lib/attribution-utils";
import { buildCampaignsSummary } from "@/services/insightsSnapshot";

type SortKey = "campaign_name" | "spend" | "impressions" | "clicks" | "conversions" | "revenue" | "roas";

const CampaignsPage = () => {
  const { data: campaigns, loading } = useCampaignData();
  const [platformFilter, setPlatformFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("spend");
  const [sortAsc, setSortAsc] = useState(false);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 25;
  const reportRef = useRef<HTMLDivElement>(null);
  const { data: sellOutData } = useSellOutData();

  const platforms = useMemo(() => [...new Set(campaigns.map((c) => c.platform).filter(Boolean))].sort() as string[], [campaigns]);
  const filtered = platformFilter === "all" ? campaigns : campaigns.filter((c) => c.platform === platformFilter);
  const hasData = campaigns.length > 0;

  // KPIs
  const totalSpend = filtered.reduce((s, r) => s + Number(r.spend ?? 0), 0);
  const totalImpressions = filtered.reduce((s, r) => s + Number(r.impressions ?? 0), 0);
  const totalClicks = filtered.reduce((s, r) => s + Number(r.clicks ?? 0), 0);
  const totalConversions = filtered.reduce((s, r) => s + Number(r.conversions ?? 0), 0);
  const totalRevenue = filtered.reduce((s, r) => s + Number(r.revenue ?? 0), 0);
  const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
  const roas = totalSpend > 0 ? totalRevenue / totalSpend : 0;

  const kpis = [
    { label: "Total Ad Spend", value: fmtZAR(totalSpend), icon: Megaphone },
    { label: "Impressions", value: totalImpressions > 1e6 ? `${(totalImpressions / 1e6).toFixed(1)}M` : totalImpressions > 1000 ? `${(totalImpressions / 1000).toFixed(0)}K` : totalImpressions.toString(), icon: Eye },
    { label: "Clicks", value: totalClicks.toLocaleString(), icon: MousePointerClick },
    { label: "CTR", value: `${ctr.toFixed(2)}%`, icon: TrendingUp },
    { label: "Conversions", value: totalConversions.toLocaleString(), icon: Target },
    { label: "ROAS", value: `${roas.toFixed(1)}x`, icon: DollarSign },
  ];

  // Performance over time (monthly)
  const timeMap = useMemo(() => {
    const m: Record<string, { spend: number; impressions: number; clicks: number; revenue: number }> = {};
    filtered.forEach((r) => {
      const month = (r.flight_start ?? "").slice(0, 7);
      if (!month) return;
      if (!m[month]) m[month] = { spend: 0, impressions: 0, clicks: 0, revenue: 0 };
      m[month].spend += Number(r.spend ?? 0);
      m[month].impressions += Number(r.impressions ?? 0);
      m[month].clicks += Number(r.clicks ?? 0);
      m[month].revenue += Number(r.revenue ?? 0);
    });
    return Object.entries(m).sort(([a], [b]) => a.localeCompare(b)).map(([month, v]) => ({
      month, spend: Math.round(v.spend), impressions: v.impressions, clicks: v.clicks, revenue: Math.round(v.revenue),
    }));
  }, [filtered]);

  // Platform breakdown
  const platformData = useMemo(() => {
    const m: Record<string, { spend: number; impressions: number; clicks: number; conversions: number; revenue: number }> = {};
    filtered.forEach((r) => {
      const p = r.platform ?? "Unknown";
      if (!m[p]) m[p] = { spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0 };
      m[p].spend += Number(r.spend ?? 0);
      m[p].impressions += Number(r.impressions ?? 0);
      m[p].clicks += Number(r.clicks ?? 0);
      m[p].conversions += Number(r.conversions ?? 0);
      m[p].revenue += Number(r.revenue ?? 0);
    });
    return Object.entries(m).sort(([, a], [, b]) => b.spend - a.spend).slice(0, 6).map(([platform, v]) => ({
      platform, spend: Math.round(v.spend), impressions: v.impressions, clicks: v.clicks, conversions: v.conversions, revenue: Math.round(v.revenue),
    }));
  }, [filtered]);

  // Extract distinct brands from sell-out data for scoped attribution
  const sellOutBrands = useMemo(() => {
    const brands = new Set<string>();
    for (const row of sellOutData) {
      if (row.brand) brands.add(row.brand);
    }
    return Array.from(brands);
  }, [sellOutData]);

  // Campaign Attribution
  const attribution = useMemo(() => {
    if (sellOutData.length === 0 || campaigns.length === 0) return [];
    const flights: CampaignFlight[] = campaigns
      .filter((c) => c.campaign_name && c.flight_start)
      .map((c) => ({
        campaign_name: c.campaign_name!,
        platform: c.platform ?? "Unknown",
        flight_start: c.flight_start!,
        flight_end: c.flight_end ?? c.flight_start!,
        spend: Number(c.spend ?? 0),
      }));
    return computeCampaignAttribution(flights, sellOutData, sellOutBrands.length > 1 ? sellOutBrands : undefined);
  }, [campaigns, sellOutData, sellOutBrands]);

  // Flight calendar
  const flightData = useMemo(() => {
    const m: Record<string, { start: string; end: string; platform: string }> = {};
    filtered.forEach((r) => {
      const name = r.campaign_name ?? "Unnamed";
      if (!m[name]) {
        m[name] = { start: r.flight_start ?? "", end: r.flight_end ?? r.flight_start ?? "", platform: r.platform ?? "" };
      } else {
        if (r.flight_start && r.flight_start < m[name].start) m[name].start = r.flight_start;
        if (r.flight_end && r.flight_end > m[name].end) m[name].end = r.flight_end;
        if (!m[name].end && r.flight_start && r.flight_start > m[name].end) m[name].end = r.flight_start;
      }
    });
    return Object.entries(m)
      .filter(([, v]) => v.start)
      .sort(([, a], [, b]) => a.start.localeCompare(b.start))
      .slice(0, 20)
      .map(([name, v]) => ({ name, ...v }));
  }, [filtered]);

  // Campaign-level table
  const campaignTable = useMemo(() => {
    const m: Record<string, { spend: number; impressions: number; clicks: number; conversions: number; revenue: number; platform: string }> = {};
    filtered.forEach((r) => {
      const name = r.campaign_name ?? "Unnamed";
      if (!m[name]) m[name] = { spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0, platform: r.platform ?? "" };
      m[name].spend += Number(r.spend ?? 0);
      m[name].impressions += Number(r.impressions ?? 0);
      m[name].clicks += Number(r.clicks ?? 0);
      m[name].conversions += Number(r.conversions ?? 0);
      m[name].revenue += Number(r.revenue ?? 0);
    });
    const arr = Object.entries(m).map(([campaign_name, v]) => ({
      campaign_name, ...v, roas: v.spend > 0 ? v.revenue / v.spend : 0,
    }));
    arr.sort((a, b) => {
      const av = a[sortKey] ?? 0, bv = b[sortKey] ?? 0;
      if (typeof av === "string" && typeof bv === "string") return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortAsc ? Number(av) - Number(bv) : Number(bv) - Number(av);
    });
    return arr;
  }, [filtered, sortKey, sortAsc]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
    setPage(0);
  };

  const filteredAttribution = useMemo(
    () => (platformFilter === "all" ? attribution : attribution.filter((row) => row.platform === platformFilter)),
    [attribution, platformFilter],
  );

  const dataSummary = useMemo(
    () => buildCampaignsSummary(sellOutData, filtered, filteredAttribution)?.summary ?? "",
    [sellOutData, filtered, filteredAttribution],
  );

  // Data context line
  const uniqueCampaigns = useMemo(() => new Set(campaigns.map((c) => c.campaign_name).filter(Boolean)).size, [campaigns]);
  const uniquePlatforms = useMemo(() => new Set(campaigns.map((c) => c.platform).filter(Boolean)).size, [campaigns]);
  const campaignDateRange = useMemo(() => {
    const dates = campaigns.map((c) => c.flight_start).filter(Boolean).sort() as string[];
    if (dates.length === 0) return "";
    const fmt = (d: string) => new Date(d).toLocaleDateString("en-ZA", { month: "short", year: "numeric" });
    const first = fmt(dates[0]);
    const last = fmt(dates[dates.length - 1]);
    return first === last ? first : `${first} \u2013 ${last}`;
  }, [campaigns]);

  // Key finding: best campaign by ROAS (only where spend > 0)
  const campaignKeyFinding = useMemo(() => {
    const withRoas = campaignTable.filter((c) => c.spend > 0 && c.roas > 0);
    if (withRoas.length === 0) return null;
    const best = withRoas.reduce((a, b) => (b.roas > a.roas ? b : a), withRoas[0]);
    return `Top performer: ${best.campaign_name} with ${best.roas.toFixed(1)}x ROAS on ${best.platform || "Unknown"}`;
  }, [campaignTable]);

  // Flight calendar helpers
  const allDates = flightData.flatMap((f) => [f.start, f.end].filter(Boolean));
  const calMin = allDates.length > 0 ? allDates.sort()[0] : "";
  const calMax = allDates.length > 0 ? allDates.sort().at(-1)! : "";
  const calRange = calMin && calMax ? (new Date(calMax).getTime() - new Date(calMin).getTime()) / 86400000 : 1;

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold">Campaigns</h1>
          <p className="text-muted-foreground text-sm">Campaign attribution — connecting advertising investment to commercial outcomes.</p>
          {hasData && campaignDateRange && (
            <p className="text-sm text-muted-foreground mt-1">
              {uniqueCampaigns.toLocaleString()} campaigns &middot; {uniquePlatforms.toLocaleString()} platforms &middot; {campaignDateRange}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {hasData && (
            <Select value={platformFilter} onValueChange={(v) => { setPlatformFilter(v); setPage(0); }}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Platform" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Platforms</SelectItem>
                {platforms.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <ExportCsvButton
            filename="Campaigns"
            headers={["Campaign", "Platform", "Spend", "Impressions", "Clicks", "Conversions", "Revenue", "ROAS"]}
            rows={campaignTable.map((c) => [c.campaign_name, c.platform, c.spend, c.impressions, c.clicks, c.conversions, c.revenue, c.roas.toFixed(1)])}
          />
          <ExportPdfButton targetRef={reportRef} filename="SignalStack-Campaigns" />
        </div>
      </div>

      {campaignKeyFinding && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-accent/5 border border-accent/20 text-sm">
          <Lightbulb className="h-4 w-4 text-accent shrink-0" />
          <span className="text-foreground/80">{campaignKeyFinding}</span>
        </div>
      )}

      <div ref={reportRef}>
        {loading ? (
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => <Card key={i}><CardContent className="p-4"><Skeleton className="h-16 w-full" /></CardContent></Card>)}
          </div>
        ) : !hasData ? (
          <EmptyState message="Upload campaign data to see performance metrics." />
        ) : (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
              {kpis.map((kpi, i) => (
                <KpiCard key={kpi.label} label={kpi.label} value={kpi.value} icon={kpi.icon} delay={i * 0.05} colorClass="bg-chart-4/15 text-chart-4" />
              ))}
            </div>

            {/* Campaign Attribution — promoted as key feature */}
            {attribution.length > 0 && (
              <Card className="mb-6">
                <CardHeader><CardTitle className="font-display text-base">Campaign Attribution — Incremental Revenue</CardTitle></CardHeader>
                <CardContent>
                  <div className="rounded-lg border overflow-auto max-h-[400px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Campaign</TableHead>
                          <TableHead className="text-xs">Platform</TableHead>
                          <TableHead className="text-xs text-right">Spend</TableHead>
                          <TableHead className="text-xs text-right">Baseline Rev</TableHead>
                          <TableHead className="text-xs text-right">Flight Rev</TableHead>
                          <TableHead className="text-xs text-right">Incremental Rev</TableHead>
                          <TableHead className="text-xs text-right">Lift</TableHead>
                          <TableHead className="text-xs text-right">iROAS</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {attribution.slice(0, 20).map((a, i) => (
                          <TableRow key={i}>
                            <TableCell className="text-sm font-medium max-w-[180px] truncate">{a.campaign_name}</TableCell>
                            <TableCell><Badge variant="outline" className="text-[10px]">{a.platform}</Badge></TableCell>
                            <TableCell className="text-sm text-right">{fmtZAR(a.spend)}</TableCell>
                            <TableCell className="text-sm text-right text-muted-foreground">{fmtZAR(a.baselineRevenue)}</TableCell>
                            <TableCell className="text-sm text-right">{fmtZAR(a.flightRevenue)}</TableCell>
                            <TableCell className="text-sm text-right font-medium">
                              <span className={a.incrementalRevenue > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}>
                                {a.incrementalRevenue > 0 ? "+" : ""}{fmtZAR(a.incrementalRevenue)}
                              </span>
                            </TableCell>
                            <TableCell className="text-right">
                              <DeltaIndicator delta={a.liftPct} />
                            </TableCell>
                            <TableCell className="text-sm text-right font-semibold">
                              <span className={a.incrementalROAS > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}>
                                {a.incrementalROAS.toFixed(1)}x
                              </span>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-2">
                    Attribution uses pre-campaign baseline comparison. Incremental Revenue = Flight Revenue - (Daily Baseline x Flight Days). iROAS = Incremental Revenue / Spend.
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Performance Over Time */}
            {timeMap.length > 0 && (
              <Card className="glass-card mb-6">
                <CardHeader><CardTitle className="font-display text-base">Campaign Performance Over Time</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={CHART_HEIGHT.full}>
                    <LineChart data={timeMap}>
                      <defs>
                        <linearGradient id="areaSpendCamp" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={LINE_COLORS.spend} stopOpacity={0.10} />
                          <stop offset="100%" stopColor={LINE_COLORS.spend} stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="areaRevenueCamp" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={LINE_COLORS.revenue} stopOpacity={0.10} />
                          <stop offset="100%" stopColor={LINE_COLORS.revenue} stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="areaImpressionsCamp" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={LINE_COLORS.impressions} stopOpacity={0.08} />
                          <stop offset="100%" stopColor={LINE_COLORS.impressions} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid {...chartGridProps} />
                      <XAxis dataKey="month" className={axisClassName} />
                      <YAxis yAxisId="spend" className={axisClassName} tickFormatter={(v) => fmtZAR(v)} />
                      <YAxis yAxisId="impressions" orientation="right" className={axisClassName} tickFormatter={(v) => v > 1000 ? `${(v / 1000).toFixed(0)}K` : v} />
                      <Tooltip content={<PremiumChartTooltip formatter={(v, name) => name === "Impressions" ? v.toLocaleString() : fmtZAR(v)} />} />
                      <Legend />
                      <Area yAxisId="spend" dataKey="spend" fill="url(#areaSpendCamp)" stroke="none" animationDuration={CHART_ANIMATION_MS} />
                      <Area yAxisId="spend" dataKey="revenue" fill="url(#areaRevenueCamp)" stroke="none" animationDuration={CHART_ANIMATION_MS} />
                      <Area yAxisId="impressions" dataKey="impressions" fill="url(#areaImpressionsCamp)" stroke="none" animationDuration={CHART_ANIMATION_MS} />
                      <Line yAxisId="spend" dataKey="spend" stroke={LINE_COLORS.spend} strokeWidth={2} name="Spend" dot={{ r: 2 }} animationDuration={CHART_ANIMATION_MS} />
                      <Line yAxisId="spend" dataKey="revenue" stroke={LINE_COLORS.revenue} strokeWidth={2.5} name="Revenue" dot={{ r: 2 }} animationDuration={CHART_ANIMATION_MS} />
                      <Line yAxisId="impressions" dataKey="impressions" stroke={LINE_COLORS.impressions} strokeWidth={1.5} strokeDasharray="4 4" name="Impressions" dot={false} animationDuration={CHART_ANIMATION_MS} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {/* Platform Breakdown */}
            {platformData.length > 0 && (
              <Card className="glass-card mb-6">
                <CardHeader><CardTitle className="font-display text-base">Platform Breakdown</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={CHART_HEIGHT.half}>
                    <BarChart data={platformData}>
                      <CartesianGrid {...chartGridProps} />
                      <XAxis dataKey="platform" className={axisClassName} />
                      <YAxis className={axisClassName} tickFormatter={(v) => fmtZAR(v)} />
                      <Tooltip content={<PremiumChartTooltip />} cursor={chartCursorStyle} />
                      <Legend />
                      <Bar dataKey="spend" fill={LINE_COLORS.spend} radius={[4, 4, 0, 0]} name="Spend" animationDuration={CHART_ANIMATION_MS} />
                      <Bar dataKey="revenue" fill={LINE_COLORS.revenue} radius={[4, 4, 0, 0]} name="Revenue" animationDuration={CHART_ANIMATION_MS} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {/* Campaign Flight Calendar */}
            {flightData.length > 0 && (
              <Card className="mb-6">
                <CardHeader><CardTitle className="font-display text-base">Campaign Flight Calendar</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                      <span>{calMin}</span><span>{calMax}</span>
                    </div>
                    {flightData.map((f, i) => {
                      const startPct = calRange > 0 ? ((new Date(f.start).getTime() - new Date(calMin).getTime()) / 86400000 / calRange) * 100 : 0;
                      const endDate = f.end || f.start;
                      const durPct = calRange > 0 ? Math.max(((new Date(endDate).getTime() - new Date(f.start).getTime()) / 86400000 / calRange) * 100, 1) : 100;
                      return (
                        <div key={i} className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground w-40 truncate shrink-0" title={f.name}>{f.name}</span>
                          <div className="flex-1 h-5 rounded bg-muted/30 relative">
                            <div
                              className="absolute top-0 h-full rounded bg-chart-4/60"
                              style={{ left: `${startPct}%`, width: `${durPct}%` }}
                            />
                          </div>
                          <Badge variant="outline" className="text-[10px] shrink-0">{f.platform}</Badge>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Campaign Performance Table */}
            <Card className="mb-6">
              <CardHeader><CardTitle className="font-display text-base">Campaign Performance Table</CardTitle></CardHeader>
              <CardContent>
                <div className="rounded-lg border overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {([
                          ["campaign_name", "Campaign"],
                          ["spend", "Spend"],
                          ["impressions", "Impressions"],
                          ["clicks", "Clicks"],
                          ["conversions", "Conversions"],
                          ["revenue", "Revenue"],
                          ["roas", "ROAS"],
                        ] as [SortKey, string][]).map(([key, label]) => (
                          <TableHead
                            key={key}
                            className={`cursor-pointer select-none ${key !== "campaign_name" ? "text-right" : ""}`}
                            onClick={() => toggleSort(key)}
                          >
                            <span className="inline-flex items-center gap-1">
                              {label}
                              {sortKey === key && <ArrowUpDown className="h-3 w-3" />}
                            </span>
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {campaignTable.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((c, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium max-w-[200px] truncate">{c.campaign_name}</TableCell>
                          <TableCell className="text-right">{fmtZAR(c.spend)}</TableCell>
                          <TableCell className="text-right">{c.impressions.toLocaleString()}</TableCell>
                          <TableCell className="text-right">{c.clicks.toLocaleString()}</TableCell>
                          <TableCell className="text-right">{c.conversions.toLocaleString()}</TableCell>
                          <TableCell className="text-right font-medium">{fmtZAR(c.revenue)}</TableCell>
                          <TableCell className="text-right">{c.roas.toFixed(1)}x</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {campaignTable.length > PAGE_SIZE && (
                  <div className="flex items-center justify-between px-4 py-3 border-t">
                    <span className="text-xs text-muted-foreground">
                      Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, campaignTable.length)} of {campaignTable.length}
                    </span>
                    <div className="flex gap-1">
                      <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                        <ChevronLeft className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="outline" size="sm" disabled={(page + 1) * PAGE_SIZE >= campaignTable.length} onClick={() => setPage(p => p + 1)}>
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Pot Labs Insights */}
            <SignalStackInsights dataSummary={dataSummary} title="Campaign Intelligence" />
          </>
        )}
      </div>
    </div>
  );
};

export default CampaignsPage;
