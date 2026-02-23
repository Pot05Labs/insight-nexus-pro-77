import { useRef, useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useRealtimeSellOut } from "@/hooks/useRealtimeSellOut";
import { useAuth } from "@/contexts/AuthContext";
import { DollarSign, ShoppingCart, Tag, Package, Inbox, Upload, Eye, MousePointerClick, TrendingUp, Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import ExportPdfButton from "@/components/ExportPdfButton";
import PotLabsInsights from "@/components/PotLabsInsights";
import { useSellOutData, fmtZAR, aggregate } from "@/hooks/useSellOutData";
import { supabase } from "@/integrations/supabase/client";
import ActivityPanel from "@/components/ActivityPanel";
import PeriodSelector from "@/components/PeriodSelector";
import DeltaIndicator from "@/components/DeltaIndicator";
import AnomalyDetectionPanel from "@/components/AnomalyDetectionPanel";
import DataQualityPanel from "@/components/DataQualityPanel";
import {
  type PeriodMode,
  getPeriodRanges,
  filterByDateRange,
  filterCampaignsByDateRange,
  computeDelta,
  findLatestDate,
  detectBestPeriodMode,
} from "@/lib/period-utils";

type CampaignRow = {
  flight_start: string | null;
  platform: string | null;
  campaign_name: string | null;
  spend: number | null;
  impressions: number | null;
  clicks: number | null;
  conversions: number | null;
  revenue: number | null;
};

const DashboardHome = () => {
  const reportRef = useRef<HTMLDivElement>(null);
  const { data, loading, refetch } = useSellOutData();
  const { user } = useAuth();
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [campaignLoading, setCampaignLoading] = useState(true);
  const [periodMode, setPeriodMode] = useState<PeriodMode>("MoM");
  const hasData = data.length > 0;
  const hasCampaigns = campaigns.length > 0;

  // Auto-detect best period mode based on data span
  useEffect(() => {
    if (data.length > 0) {
      setPeriodMode(detectBestPeriodMode(data));
    }
  }, [data.length]);

  // Auto-refresh dashboard when sell_out_data changes in real time
  useRealtimeSellOut(user?.id, refetch);

  const fetchCampaigns = async () => {
    setCampaignLoading(true);
    const { data: cd } = await supabase
      .from("campaign_data_v2")
      .select("flight_start,platform,campaign_name,spend,impressions,clicks,conversions,revenue")
      .limit(1000);
    setCampaigns(cd ?? []);
    setCampaignLoading(false);
  };

  useEffect(() => {
    fetchCampaigns();
  }, []);

  // Auto-refresh campaigns via realtime
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("realtime-campaigns-dash")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "campaign_data_v2", filter: `user_id=eq.${user.id}` },
        () => fetchCampaigns()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  // Period comparison
  const periodRanges = useMemo(() => {
    const refDate = findLatestDate(data);
    return getPeriodRanges(refDate, periodMode);
  }, [data, periodMode]);

  const currentSellOut = useMemo(() => filterByDateRange(data, periodRanges.current), [data, periodRanges]);
  const previousSellOut = useMemo(() => filterByDateRange(data, periodRanges.previous), [data, periodRanges]);
  const currentCampaigns = useMemo(() => filterCampaignsByDateRange(campaigns, periodRanges.current), [campaigns, periodRanges]);
  const previousCampaigns = useMemo(() => filterCampaignsByDateRange(campaigns, periodRanges.previous), [campaigns, periodRanges]);

  // --- Sell-out KPIs (all data) ---
  const totalRevenue = data.reduce((s, r) => s + Number(r.revenue ?? 0), 0);
  const totalUnits = data.reduce((s, r) => s + Number(r.units_sold ?? 0), 0);
  const avgOrderValue = totalUnits > 0 ? totalRevenue / totalUnits : 0;
  const uniqueProducts = new Set(data.map((r) => r.product_name_raw).filter(Boolean)).size;

  // --- Period KPIs for deltas ---
  const curRevenue = currentSellOut.reduce((s, r) => s + Number(r.revenue ?? 0), 0);
  const prevRevenue = previousSellOut.reduce((s, r) => s + Number(r.revenue ?? 0), 0);
  const curUnits = currentSellOut.reduce((s, r) => s + Number(r.units_sold ?? 0), 0);
  const prevUnits = previousSellOut.reduce((s, r) => s + Number(r.units_sold ?? 0), 0);
  const curAOV = curUnits > 0 ? curRevenue / curUnits : 0;
  const prevAOV = prevUnits > 0 ? prevRevenue / prevUnits : 0;
  const curProducts = new Set(currentSellOut.map((r) => r.product_name_raw).filter(Boolean)).size;
  const prevProducts = new Set(previousSellOut.map((r) => r.product_name_raw).filter(Boolean)).size;

  const sellOutKpis = [
    { label: "Total Revenue", value: fmtZAR(totalRevenue), icon: DollarSign, delta: computeDelta(curRevenue, prevRevenue) },
    { label: "Units Sold", value: totalUnits.toLocaleString(), icon: ShoppingCart, delta: computeDelta(curUnits, prevUnits) },
    { label: "Avg Order Value", value: fmtZAR(avgOrderValue), icon: Tag, delta: computeDelta(curAOV, prevAOV) },
    { label: "Unique Products", value: uniqueProducts.toString(), icon: Package, delta: computeDelta(curProducts, prevProducts) },
  ];

  // --- Campaign KPIs ---
  const totalSpend = campaigns.reduce((s, r) => s + Number(r.spend ?? 0), 0);
  const totalImpressions = campaigns.reduce((s, r) => s + Number(r.impressions ?? 0), 0);
  const totalClicks = campaigns.reduce((s, r) => s + Number(r.clicks ?? 0), 0);
  const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
  const cpm = totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000 : 0;
  const cpc = totalClicks > 0 ? totalSpend / totalClicks : 0;

  // Campaign period deltas
  const curSpend = currentCampaigns.reduce((s, r) => s + Number(r.spend ?? 0), 0);
  const prevSpend = previousCampaigns.reduce((s, r) => s + Number(r.spend ?? 0), 0);
  const curImpressions = currentCampaigns.reduce((s, r) => s + Number(r.impressions ?? 0), 0);
  const prevImpressions = previousCampaigns.reduce((s, r) => s + Number(r.impressions ?? 0), 0);
  const curClicks = currentCampaigns.reduce((s, r) => s + Number(r.clicks ?? 0), 0);
  const prevClicks = previousCampaigns.reduce((s, r) => s + Number(r.clicks ?? 0), 0);
  const curCTR = curImpressions > 0 ? (curClicks / curImpressions) * 100 : 0;
  const prevCTR = prevImpressions > 0 ? (prevClicks / prevImpressions) * 100 : 0;
  const curCPM = curImpressions > 0 ? (curSpend / curImpressions) * 1000 : 0;
  const prevCPM = prevImpressions > 0 ? (prevSpend / prevImpressions) * 1000 : 0;
  const curCPC = curClicks > 0 ? curSpend / curClicks : 0;
  const prevCPC = prevClicks > 0 ? prevSpend / prevClicks : 0;

  const campaignKpis = [
    { label: "Total Ad Spend", value: fmtZAR(totalSpend), icon: Megaphone, delta: computeDelta(curSpend, prevSpend) },
    { label: "Impressions", value: totalImpressions > 1_000_000 ? `${(totalImpressions / 1_000_000).toFixed(1)}M` : totalImpressions > 1000 ? `${(totalImpressions / 1000).toFixed(0)}K` : totalImpressions.toString(), icon: Eye, delta: computeDelta(curImpressions, prevImpressions) },
    { label: "Clicks", value: totalClicks.toLocaleString(), icon: MousePointerClick, delta: computeDelta(curClicks, prevClicks) },
    { label: "CTR", value: `${ctr.toFixed(2)}%`, icon: TrendingUp, delta: computeDelta(curCTR, prevCTR) },
    { label: "CPM", value: fmtZAR(cpm), icon: DollarSign, delta: computeDelta(curCPM, prevCPM), invertColor: true },
    { label: "CPC", value: fmtZAR(cpc), icon: DollarSign, delta: computeDelta(curCPC, prevCPC), invertColor: true },
  ];

  // Top products by brand
  const revByBrand = aggregate(data, (r) => r.brand ?? "Unknown", (r) => Number(r.revenue ?? 0));
  const brandData = Object.entries(revByBrand)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([brand, revenue]) => ({ brand, revenue: Math.round(revenue) }));

  // Category analysis
  const revByCategory = aggregate(data, (r) => r.category ?? "Unknown", (r) => Number(r.revenue ?? 0));
  const categoryData = Object.entries(revByCategory)
    .sort(([, a], [, b]) => b - a)
    .map(([category, revenue]) => ({ category, revenue: Math.round(revenue) }));

  // Revenue + Spend time series (monthly)
  const monthMapRevenue: Record<string, number> = {};
  data.forEach((r) => {
    const m = (r.date ?? "").slice(0, 7);
    if (m) monthMapRevenue[m] = (monthMapRevenue[m] ?? 0) + Number(r.revenue ?? 0);
  });
  const monthMapSpend: Record<string, number> = {};
  campaigns.forEach((r) => {
    const m = (r.flight_start ?? "").slice(0, 7);
    if (m) monthMapSpend[m] = (monthMapSpend[m] ?? 0) + Number(r.spend ?? 0);
  });
  const allMonths = [...new Set([...Object.keys(monthMapRevenue), ...Object.keys(monthMapSpend)])].sort();
  const timeData = allMonths.map((month) => ({
    month,
    revenue: Math.round(monthMapRevenue[month] ?? 0),
    spend: Math.round(monthMapSpend[month] ?? 0),
  }));

  // Period comparison label
  const periodLabel = `${periodRanges.current.label} vs ${periodRanges.previous.label}`;

  // Data summary for AI
  const dataSummary = `Total Revenue: ${fmtZAR(totalRevenue)}, Units Sold: ${totalUnits.toLocaleString()}, Avg Order Value: ${fmtZAR(avgOrderValue)}, Unique Products: ${uniqueProducts}. Top Brands: ${brandData.slice(0, 5).map((b) => `${b.brand} (${fmtZAR(b.revenue)})`).join(", ")}. Categories: ${categoryData.slice(0, 5).map((c) => `${c.category} (${fmtZAR(c.revenue)})`).join(", ")}. Campaign Spend: ${fmtZAR(totalSpend)}, Impressions: ${totalImpressions.toLocaleString()}, Clicks: ${totalClicks.toLocaleString()}, CTR: ${ctr.toFixed(2)}%. Period: ${periodLabel}.`;

  const chartTooltipStyle = {
    backgroundColor: "hsl(var(--card))",
    border: "1px solid hsl(var(--border))",
    borderRadius: "0.5rem",
    fontSize: "0.75rem",
  };

  const isLoading = loading || campaignLoading;

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground text-sm">Commerce performance overview across all channels.</p>
        </div>
        <div className="flex items-center gap-3">
          {hasData && <PeriodSelector value={periodMode} onChange={setPeriodMode} />}
          <ExportPdfButton targetRef={reportRef} filename="Pot-Labs-Dashboard" />
        </div>
      </div>

      {/* Period comparison label */}
      {hasData && (
        <p className="text-xs text-muted-foreground">
          Comparing <span className="font-semibold text-foreground">{periodRanges.current.label}</span> vs <span className="font-semibold text-foreground">{periodRanges.previous.label}</span>
        </p>
      )}

      <div ref={reportRef}>
        {/* Sell-Out KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {sellOutKpis.map((kpi, i) => (
            <motion.div key={kpi.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">{kpi.label}</span>
                    <div className="h-7 w-7 rounded-md bg-primary/8 flex items-center justify-center">
                      <kpi.icon className="h-3.5 w-3.5 text-primary" />
                    </div>
                  </div>
                  {isLoading ? <Skeleton className="h-8 w-24" /> : (
                    <>
                      <p className="font-display text-2xl font-bold">{kpi.value}</p>
                      <DeltaIndicator delta={kpi.delta} className="mt-1.5" />
                    </>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Campaign Performance KPIs */}
        {(hasCampaigns || campaignLoading) && (
          <>
            <h2 className="font-display text-lg font-semibold mb-3">Campaign Performance</h2>
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
              {campaignKpis.map((kpi, i) => (
                <motion.div key={kpi.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 + i * 0.05 }}>
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">{kpi.label}</span>
                        <div className="h-7 w-7 rounded-md bg-chart-4/15 flex items-center justify-center">
                          <kpi.icon className="h-3.5 w-3.5 text-chart-4" />
                        </div>
                      </div>
                      {campaignLoading ? <Skeleton className="h-8 w-24" /> : (
                        <>
                          <p className="font-display text-xl font-bold">{kpi.value}</p>
                          <DeltaIndicator delta={kpi.delta} invertColor={"invertColor" in kpi && kpi.invertColor} className="mt-1.5" />
                        </>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </>
        )}

        {!isLoading && !hasData && !hasCampaigns && (
          <Card className="mb-6">
            <CardContent className="p-12 text-center">
              <Inbox className="h-10 w-10 mx-auto text-muted-foreground/30 mb-4" />
              <p className="text-muted-foreground mb-3">Upload sell-out or campaign data to see your dashboard.</p>
              <Link to="/upload"><Button variant="outline" size="sm"><Upload className="h-3.5 w-3.5 mr-1.5" />Go to Upload Hub</Button></Link>
            </CardContent>
          </Card>
        )}

        {(hasData || hasCampaigns) && (
          <>
            {/* Top Products by Brand */}
            {brandData.length > 0 && (
              <Card className="mb-6">
                <CardHeader><CardTitle className="font-display text-base">Top-Performing Brands by Revenue</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={brandData} layout="vertical" margin={{ left: 80 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis type="number" className="text-xs fill-muted-foreground" tickFormatter={(v) => fmtZAR(v)} />
                      <YAxis type="category" dataKey="brand" className="text-xs fill-muted-foreground" width={75} />
                      <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number) => [fmtZAR(v), "Revenue"]} />
                      <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} name="Revenue" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {/* Category Analysis */}
            {categoryData.length > 0 && (
              <Card className="mb-6">
                <CardHeader><CardTitle className="font-display text-base">Category Analysis</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={categoryData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="category" className="text-xs fill-muted-foreground" />
                      <YAxis className="text-xs fill-muted-foreground" tickFormatter={(v) => fmtZAR(v)} />
                      <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number) => [fmtZAR(v), "Revenue"]} />
                      <Bar dataKey="revenue" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} name="Revenue" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {/* Revenue vs Spend Time Series (dual axis) */}
            {timeData.length > 0 && (
              <Card className="mb-6">
                <CardHeader><CardTitle className="font-display text-base">Revenue vs Ad Spend Over Time</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={timeData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="month" className="text-xs fill-muted-foreground" />
                      <YAxis yAxisId="revenue" className="text-xs fill-muted-foreground" tickFormatter={(v) => fmtZAR(v)} />
                      <YAxis yAxisId="spend" orientation="right" className="text-xs fill-muted-foreground" tickFormatter={(v) => fmtZAR(v)} />
                      <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number, name: string) => [fmtZAR(v), name]} />
                      <Legend />
                      <Line yAxisId="revenue" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3, fill: "hsl(var(--primary))" }} name="Revenue" />
                      <Line yAxisId="spend" dataKey="spend" stroke="hsl(var(--chart-4))" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 3, fill: "hsl(var(--chart-4))" }} name="Ad Spend" />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {/* Anomaly Detection */}
            {hasData && <AnomalyDetectionPanel data={data} />}

            {/* Data Quality */}
            <div className="mt-6">
              <DataQualityPanel
                sellOutData={data as unknown as Record<string, unknown>[]}
                campaignData={campaigns as unknown as Record<string, unknown>[]}
              />
            </div>

            {/* Strategic Insights */}
            <PotLabsInsights dataSummary={dataSummary} title="Strategic Insights" />

            {/* Activity Log */}
            <ActivityPanel />
          </>
        )}
      </div>
    </div>
  );
};

export default DashboardHome;
