import { useState, useEffect, useRef, useMemo } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { Megaphone, DollarSign, MousePointerClick, Eye, TrendingUp, Target, Upload, Inbox, ArrowUpDown } from "lucide-react";
import { Link } from "react-router-dom";
import ExportPdfButton from "@/components/ExportPdfButton";
import ExportCsvButton from "@/components/ExportCsvButton";
import SignalStackInsights from "@/components/SignalStackInsights";
import DeltaIndicator from "@/components/DeltaIndicator";
import { fmtZAR } from "@/hooks/useSellOutData";
import { chartTooltipStyle } from "@/lib/chart-utils";
import { useSellOutData } from "@/hooks/useSellOutData";
import { computeCampaignAttribution, type CampaignFlight } from "@/lib/attribution-utils";

type CampaignRow = {
  flight_start: string | null;
  flight_end: string | null;
  platform: string | null;
  channel: string | null;
  campaign_name: string | null;
  impressions: number | null;
  clicks: number | null;
  spend: number | null;
  conversions: number | null;
  revenue: number | null;
};

type SortKey = "campaign_name" | "spend" | "impressions" | "clicks" | "conversions" | "revenue" | "roas";

const CampaignsPage = () => {
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [platformFilter, setPlatformFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("spend");
  const [sortAsc, setSortAsc] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);
  const { data: sellOutData } = useSellOutData();

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("campaign_data_v2")
        .select("flight_start,flight_end,platform,channel,campaign_name,impressions,clicks,spend,conversions,revenue")
        .limit(1000);
      setCampaigns(data ?? []);
      setLoading(false);
    };
    fetch();
  }, []);

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
    return Object.entries(m).sort(([, a], [, b]) => b.spend - a.spend).map(([platform, v]) => ({
      platform, spend: Math.round(v.spend), impressions: v.impressions, clicks: v.clicks, conversions: v.conversions, revenue: Math.round(v.revenue),
    }));
  }, [filtered]);

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
    return computeCampaignAttribution(flights, sellOutData);
  }, [campaigns, sellOutData]);

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
  };

  const dataSummary = `Campaign Performance: Total Spend ${fmtZAR(totalSpend)}, Impressions ${totalImpressions.toLocaleString()}, Clicks ${totalClicks.toLocaleString()}, CTR ${ctr.toFixed(2)}%, ROAS ${roas.toFixed(1)}x. Platforms: ${platformData.map((p) => `${p.platform}: ${fmtZAR(p.spend)} spend`).join(", ")}. Campaign Attribution: ${attribution.slice(0, 3).map((a) => `${a.campaign_name}: ${fmtZAR(a.incrementalRevenue)} incremental revenue, ${a.liftPct.toFixed(1)}% lift`).join("; ")}.`;

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
        </div>
        <div className="flex items-center gap-3">
          {hasData && (
            <Select value={platformFilter} onValueChange={setPlatformFilter}>
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

      <div ref={reportRef}>
        {loading ? (
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => <Card key={i}><CardContent className="p-4"><Skeleton className="h-16 w-full" /></CardContent></Card>)}
          </div>
        ) : !hasData ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Inbox className="h-10 w-10 mx-auto text-muted-foreground/30 mb-4" />
              <p className="text-muted-foreground mb-3">Upload campaign data to see performance metrics.</p>
              <Link to="/upload"><Button variant="outline" size="sm"><Upload className="h-3.5 w-3.5 mr-1.5" />Go to Upload Hub</Button></Link>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
              {kpis.map((kpi, i) => (
                <motion.div key={kpi.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">{kpi.label}</span>
                        <div className="h-7 w-7 rounded-md bg-chart-4/15 flex items-center justify-center">
                          <kpi.icon className="h-3.5 w-3.5 text-chart-4" />
                        </div>
                      </div>
                      <p className="font-display text-xl font-bold">{kpi.value}</p>
                    </CardContent>
                  </Card>
                </motion.div>
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
              <Card className="mb-6">
                <CardHeader><CardTitle className="font-display text-base">Campaign Performance Over Time</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={timeMap}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="month" className="text-xs fill-muted-foreground" />
                      <YAxis yAxisId="spend" className="text-xs fill-muted-foreground" tickFormatter={(v) => fmtZAR(v)} />
                      <YAxis yAxisId="impressions" orientation="right" className="text-xs fill-muted-foreground" tickFormatter={(v) => v > 1000 ? `${(v / 1000).toFixed(0)}K` : v} />
                      <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number, name: string) => [name === "Impressions" ? v.toLocaleString() : fmtZAR(v), name]} />
                      <Legend />
                      <Line yAxisId="spend" dataKey="spend" stroke="hsl(var(--chart-4))" strokeWidth={2} name="Spend" dot={{ r: 2 }} />
                      <Line yAxisId="spend" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2} name="Revenue" dot={{ r: 2 }} />
                      <Line yAxisId="impressions" dataKey="impressions" stroke="hsl(var(--chart-2))" strokeWidth={1.5} strokeDasharray="4 4" name="Impressions" dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {/* Platform Breakdown */}
            {platformData.length > 0 && (
              <Card className="mb-6">
                <CardHeader><CardTitle className="font-display text-base">Platform Breakdown</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={platformData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="platform" className="text-xs fill-muted-foreground" />
                      <YAxis className="text-xs fill-muted-foreground" tickFormatter={(v) => fmtZAR(v)} />
                      <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number, name: string) => [fmtZAR(v), name]} />
                      <Legend />
                      <Bar dataKey="spend" fill="hsl(var(--chart-4))" radius={[4, 4, 0, 0]} name="Spend" />
                      <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Revenue" />
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
                      {campaignTable.slice(0, 50).map((c, i) => (
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
