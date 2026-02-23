import { useRef, useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useRealtimeSellOut } from "@/hooks/useRealtimeSellOut";
import { useAuth } from "@/contexts/AuthContext";
import { DollarSign, ShoppingCart, Tag, Package, Inbox, Upload, Eye, MousePointerClick, TrendingUp, Megaphone, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import ExportPdfButton from "@/components/ExportPdfButton";
import PotLabsInsights from "@/components/PotLabsInsights";
import { useSellOutData, fmtZAR, aggregate } from "@/hooks/useSellOutData";
import { supabase } from "@/integrations/supabase/client";
import ActivityPanel from "@/components/ActivityPanel";
import AnomalyDetectionPanel from "@/components/AnomalyDetectionPanel";
import DataQualityPanel from "@/components/DataQualityPanel";

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
  const hasData = data.length > 0;
  const hasCampaigns = campaigns.length > 0;

  // Auto-refresh dashboard when sell_out_data changes in real time
  useRealtimeSellOut(user?.id, refetch);

  const fetchCampaigns = async () => {
    setCampaignLoading(true);
    // Scope campaigns to the same project as sell-out data
    const { data: projects } = await supabase.from("projects").select("id").limit(1);
    const projectId = projects?.[0]?.id;
    let query = supabase
      .from("campaign_data_v2")
      .select("flight_start,platform,campaign_name,spend,impressions,clicks,conversions,revenue");
    if (projectId) query = query.eq("project_id", projectId);
    const { data: cd } = await query.limit(5000);
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

  // --- Sell-out KPIs ---
  const totalRevenue = data.reduce((s, r) => s + Number(r.revenue ?? 0), 0);
  const totalUnits = data.reduce((s, r) => s + Number(r.units_sold ?? 0), 0);
  const avgOrderValue = totalUnits > 0 ? totalRevenue / totalUnits : 0;
  const uniqueProducts = new Set(data.map((r) => r.product_name_raw).filter(Boolean)).size;

  const sellOutKpis = [
    { label: "Total Revenue", value: fmtZAR(totalRevenue), icon: DollarSign },
    { label: "Units Sold", value: totalUnits.toLocaleString(), icon: ShoppingCart },
    { label: "Avg Order Value", value: fmtZAR(avgOrderValue), icon: Tag },
    { label: "Unique Products", value: uniqueProducts.toString(), icon: Package },
  ];

  // --- Campaign KPIs ---
  const totalSpend = campaigns.reduce((s, r) => s + Number(r.spend ?? 0), 0);
  const totalImpressions = campaigns.reduce((s, r) => s + Number(r.impressions ?? 0), 0);
  const totalClicks = campaigns.reduce((s, r) => s + Number(r.clicks ?? 0), 0);
  const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
  const cpm = totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000 : 0;
  const cpc = totalClicks > 0 ? totalSpend / totalClicks : 0;
  const roas = totalSpend > 0 ? totalRevenue / totalSpend : 0;

  const campaignKpis = [
    { label: "Total Ad Spend", value: fmtZAR(totalSpend), icon: Megaphone },
    { label: "Impressions", value: totalImpressions > 1_000_000 ? `${(totalImpressions / 1_000_000).toFixed(1)}M` : totalImpressions > 1000 ? `${(totalImpressions / 1000).toFixed(0)}K` : totalImpressions.toString(), icon: Eye },
    { label: "Clicks", value: totalClicks.toLocaleString(), icon: MousePointerClick },
    { label: "CTR", value: `${ctr.toFixed(2)}%`, icon: TrendingUp },
    { label: "CPM", value: fmtZAR(cpm), icon: DollarSign },
    { label: "CPC", value: fmtZAR(cpc), icon: DollarSign },
  ];

  // Top products by brand — fallback: extract brand from product_name_raw if brand field is null
  const inferBrand = (r: typeof data[0]): string => {
    if (r.brand) return r.brand;
    // Try to extract brand from product name: typically the first word/phrase
    const name = r.product_name_raw?.trim();
    if (!name) return r.retailer ?? "Unknown";
    // Take the first word as brand (covers "Clorets", "Oreo", "Halls", "Cadbury" etc.)
    const firstWord = name.split(/\s+/)[0];
    return firstWord && firstWord.length > 1 ? firstWord : "Unknown";
  };
  const revByBrand = aggregate(data, inferBrand, (r) => Number(r.revenue ?? 0));
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

  // Data summary for AI
  const dataSummary = `Total Revenue: ${fmtZAR(totalRevenue)}, Units Sold: ${totalUnits.toLocaleString()}, Avg Order Value: ${fmtZAR(avgOrderValue)}, Unique Products: ${uniqueProducts}. Top Brands: ${brandData.slice(0, 5).map((b) => `${b.brand} (${fmtZAR(b.revenue)})`).join(", ")}. Categories: ${categoryData.slice(0, 5).map((c) => `${c.category} (${fmtZAR(c.revenue)})`).join(", ")}. Campaign Spend: ${fmtZAR(totalSpend)}, Impressions: ${totalImpressions.toLocaleString()}, Clicks: ${totalClicks.toLocaleString()}, CTR: ${ctr.toFixed(2)}%, ROAS: ${roas.toFixed(1)}x.`;

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
          <h1 className="font-display text-2xl font-bold">Commerce Intelligence Dashboard</h1>
          <p className="text-muted-foreground text-sm">Connecting advertising spend to commercial outcomes.</p>
        </div>
        <div className="flex items-center gap-3">
          <ExportPdfButton targetRef={reportRef} filename="Pot-Labs-Dashboard" />
        </div>
      </div>

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
                    <p className="font-display text-2xl font-bold">{kpi.value}</p>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* ROAS — The Commerce Marriage Metric */}
        {hasCampaigns && totalSpend > 0 && !isLoading && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
            <Card className="mb-6 border-primary/20 bg-primary/3">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Target className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Return on Ad Spend (ROAS)</span>
                  <p className="font-display text-3xl font-bold">{roas.toFixed(1)}x</p>
                </div>
                <div className="ml-auto text-right">
                  <p className="text-xs text-muted-foreground">Every R1 spent returns</p>
                  <p className="text-sm font-semibold text-primary">{fmtZAR(roas)} in revenue</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

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
                        <p className="font-display text-xl font-bold">{kpi.value}</p>
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
            {/* Revenue vs Spend Time Series (dual axis) — promoted higher as key marriage chart */}
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
