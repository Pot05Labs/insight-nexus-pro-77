import { useRef, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useRealtimeSellOut } from "@/hooks/useRealtimeSellOut";
import { useRealtimeCampaign } from "@/hooks/useRealtimeCampaign";
import { useAuth } from "@/contexts/AuthContext";
import {
  DollarSign, ShoppingCart, Tag, Package, Eye, MousePointerClick,
  TrendingUp, TrendingDown, Megaphone, Target, Zap, BarChart3,
  CircleDollarSign, Loader2, Database, Lightbulb, Store,
  AlertTriangle, Rocket,
} from "lucide-react";
import { BarChart, Bar, LineChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell } from "recharts";
import ExportPdfButton from "@/components/ExportPdfButton";
import ExportCsvButton from "@/components/ExportCsvButton";
import SignalStackInsights from "@/components/SignalStackInsights";
import DeltaIndicator from "@/components/DeltaIndicator";
import KpiCard from "@/components/KpiCard";
import EmptyState from "@/components/EmptyState";
import { useSellOutData, fmtZAR, aggregate } from "@/hooks/useSellOutData";
import { useCampaignData } from "@/hooks/useCampaignData";
import { usePeriodComparison, type PeriodType } from "@/hooks/usePeriodComparison";
import { seedDemoData } from "@/services/demoDataSeeder";
import { computeCampaignAttribution, type CampaignFlight, type AttributionResult } from "@/lib/attribution-utils";
import ActivityPanel from "@/components/ActivityPanel";
import AnomalyDetectionPanel from "@/components/AnomalyDetectionPanel";
import { chartCursorStyle, chartGridProps, CHART_ANIMATION_MS, CHART_HEIGHT, axisClassName, CHART_PALETTE, LINE_COLORS, topNWithOther } from "@/lib/chart-utils";
import PremiumChartTooltip from "@/components/charts/ChartTooltip";
import DataQualityPanel from "@/components/DataQualityPanel";
import { useToast } from "@/hooks/use-toast";

// ── Helpers for Key Findings ──

interface KeyFinding {
  icon: React.ElementType;
  text: string;
  variant: "positive" | "warning" | "neutral";
}

function formatMonthLabel(yyyyMm: string): string {
  const [y, m] = yyyyMm.split("-");
  const date = new Date(Number(y), Number(m) - 1);
  return date.toLocaleDateString("en-ZA", { month: "short", year: "numeric" });
}

const DashboardHome = () => {
  const reportRef = useRef<HTMLDivElement>(null);
  const { data, loading, refetch } = useSellOutData();
  const { data: campaigns, loading: campaignLoading, refetch: refetchCampaigns } = useCampaignData();
  const { user } = useAuth();
  const { toast } = useToast();
  const [periodType, setPeriodType] = useState<PeriodType>("MoM");
  const [demoLoading, setDemoLoading] = useState(false);
  const hasData = data.length > 0;
  const hasCampaigns = campaigns.length > 0;

  // Period-over-Period comparison
  const comparison = usePeriodComparison(data, campaigns, periodType);

  // Auto-refresh dashboard when sell_out_data or campaign_data_v2 changes in real time
  useRealtimeSellOut(user?.id, refetch);
  useRealtimeCampaign(user?.id, refetchCampaigns);

  const handleLoadDemo = async () => {
    setDemoLoading(true);
    try {
      const result = await seedDemoData();
      toast({ title: "Demo data loaded", description: `${result.sellOutRows} sell-out rows + ${result.campaignRows} campaign rows inserted.` });
      refetch();
      refetchCampaigns();
    } catch (err: any) {
      toast({ title: "Failed to load demo data", description: err.message, variant: "destructive" });
    } finally {
      setDemoLoading(false);
    }
  };

  // --- Sell-out KPIs ---
  const totalRevenue = data.reduce((s, r) => s + Number(r.revenue ?? 0), 0);
  const totalUnits = data.reduce((s, r) => s + Number(r.units_sold ?? 0), 0);
  const avgOrderValue = totalUnits > 0 ? totalRevenue / totalUnits : 0;
  const uniqueProducts = new Set(data.map((r) => r.product_name_raw).filter(Boolean)).size;

  const sellOutKpis = [
    { label: "Total Revenue", value: fmtZAR(totalRevenue), icon: DollarSign, delta: comparison.revenue.deltaPct },
    { label: "Units Sold", value: totalUnits.toLocaleString(), icon: ShoppingCart, delta: comparison.units.deltaPct },
    { label: "Avg Order Value", value: fmtZAR(avgOrderValue), icon: Tag, delta: comparison.aov.deltaPct },
    { label: "Unique Products", value: uniqueProducts.toString(), icon: Package, delta: comparison.products.deltaPct },
  ];

  // --- Campaign KPIs ---
  const totalSpend = campaigns.reduce((s, r) => s + Number(r.spend ?? 0), 0);
  const totalImpressions = campaigns.reduce((s, r) => s + Number(r.impressions ?? 0), 0);
  const totalClicks = campaigns.reduce((s, r) => s + Number(r.clicks ?? 0), 0);
  const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
  const cpm = totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000 : 0;
  const cpc = totalClicks > 0 ? totalSpend / totalClicks : 0;
  const roas = totalSpend > 0 ? totalRevenue / totalSpend : 0;

  // Canonical metrics from build spec
  const totalConversions = campaigns.reduce((s, r) => s + Number(r.conversions ?? 0), 0);
  const totalCampaignRevenue = campaigns.reduce((s, r) => s + Number(r.revenue ?? 0), 0);
  const eCPM = totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000 : 0;
  const cps = totalConversions > 0 ? totalSpend / totalConversions : 0;

  // Campaign attribution — campaign-period vs baseline
  const attributionResults = useMemo<AttributionResult[]>(() => {
    if (!hasCampaigns || data.length === 0) return [];
    const flights: CampaignFlight[] = campaigns
      .filter((c) => c.campaign_name && c.flight_start)
      .map((c) => ({
        campaign_name: c.campaign_name!,
        platform: c.platform ?? "Unknown",
        flight_start: c.flight_start!,
        flight_end: c.flight_end ?? c.flight_start!,
        spend: Number(c.spend ?? 0),
      }));
    return computeCampaignAttribution(flights, data);
  }, [campaigns, data, hasCampaigns]);

  const totalIncrementalRevenue = attributionResults.reduce((s, r) => s + r.incrementalRevenue, 0);
  const iROAS = totalSpend > 0 ? totalIncrementalRevenue / totalSpend : 0;

  const campaignKpis = [
    { label: "Total Ad Spend", value: fmtZAR(totalSpend), icon: Megaphone },
    { label: "Impressions", value: totalImpressions > 1_000_000 ? `${(totalImpressions / 1_000_000).toFixed(1)}M` : totalImpressions > 1000 ? `${(totalImpressions / 1000).toFixed(0)}K` : totalImpressions.toString(), icon: Eye },
    { label: "Clicks", value: totalClicks.toLocaleString(), icon: MousePointerClick },
    { label: "CTR", value: `${ctr.toFixed(2)}%`, icon: TrendingUp },
    { label: "eCPM", value: fmtZAR(eCPM), icon: DollarSign },
    { label: "CPS", value: fmtZAR(cps), icon: CircleDollarSign },
  ];

  // Top products by brand — fallback: extract brand from product_name_raw if brand field is null
  const inferBrand = (r: typeof data[0]): string => {
    if (r.brand) return r.brand;
    const name = r.product_name_raw?.trim();
    if (!name) return r.retailer ?? "Unknown";
    const firstWord = name.split(/\s+/)[0];
    return firstWord && firstWord.length > 1 ? firstWord : "Unknown";
  };
  const revByBrand = aggregate(data, inferBrand, (r) => Number(r.revenue ?? 0));
  const brandDataRaw = Object.entries(revByBrand)
    .sort(([, a], [, b]) => b - a)
    .map(([brand, revenue]) => ({ brand, revenue: Math.round(revenue) }));
  const brandData = topNWithOther(brandDataRaw, 6, "revenue", "brand");

  // Category analysis
  const revByCategory = aggregate(data, (r) => r.category ?? "Unknown", (r) => Number(r.revenue ?? 0));
  const categoryDataRaw = Object.entries(revByCategory)
    .sort(([, a], [, b]) => b - a)
    .map(([category, revenue]) => ({ category, revenue: Math.round(revenue) }));
  const categoryData = topNWithOther(categoryDataRaw, 6, "revenue", "category");

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

  // ── Data Context Line ──
  const dataContext = useMemo(() => {
    if (!hasData) return null;
    const retailers = new Set(data.map((r) => r.retailer).filter(Boolean));
    const dates = data.map((r) => r.date).filter(Boolean) as string[];
    if (dates.length === 0) return null;
    dates.sort();
    const minDate = formatMonthLabel(dates[0].slice(0, 7));
    const maxDate = formatMonthLabel(dates[dates.length - 1].slice(0, 7));
    return {
      retailerCount: retailers.size,
      transactionCount: data.length,
      dateRange: minDate === maxDate ? minDate : `${minDate} \u2013 ${maxDate}`,
    };
  }, [data, hasData]);

  // ── Auto-Computed Key Findings ──
  const keyFindings = useMemo<KeyFinding[]>(() => {
    if (!hasData) return [];
    const findings: KeyFinding[] = [];

    // (a) Top retailer by revenue share
    const revByRetailer = aggregate(data, (r) => r.retailer ?? "Unknown", (r) => Number(r.revenue ?? 0));
    const sortedRetailers = Object.entries(revByRetailer).sort(([, a], [, b]) => b - a);
    if (sortedRetailers.length > 0 && totalRevenue > 0) {
      const [topRetailer, topRetailerRev] = sortedRetailers[0];
      const pct = ((topRetailerRev / totalRevenue) * 100).toFixed(0);
      findings.push({
        icon: Store,
        text: `${topRetailer} drives ${pct}% of revenue (${fmtZAR(topRetailerRev)})`,
        variant: "neutral",
      });
    }

    // (b) Top category
    if (categoryDataRaw.length > 0 && totalRevenue > 0) {
      const topCat = categoryDataRaw[0];
      const pct = ((topCat.revenue / totalRevenue) * 100).toFixed(0);
      findings.push({
        icon: Package,
        text: `${topCat.category} leads at ${fmtZAR(topCat.revenue)} (${pct}% of total)`,
        variant: "neutral",
      });
    }

    // (c) Revenue trend — last 3 months
    const revenueMonths = Object.entries(monthMapRevenue).sort(([a], [b]) => a.localeCompare(b));
    if (revenueMonths.length >= 3) {
      const last3 = revenueMonths.slice(-3);
      let consecutiveUp = 0;
      let consecutiveDown = 0;
      for (let i = 1; i < last3.length; i++) {
        if (last3[i][1] > last3[i - 1][1]) {
          consecutiveUp++;
          consecutiveDown = 0;
        } else if (last3[i][1] < last3[i - 1][1]) {
          consecutiveDown++;
          consecutiveUp = 0;
        }
      }
      if (consecutiveUp >= 2) {
        findings.push({
          icon: TrendingUp,
          text: `Revenue trending up for ${consecutiveUp} consecutive months`,
          variant: "positive",
        });
      } else if (consecutiveDown >= 2) {
        findings.push({
          icon: TrendingDown,
          text: `Revenue trending down for ${consecutiveDown} consecutive months`,
          variant: "warning",
        });
      } else if (revenueMonths.length >= 2) {
        const lastMonth = revenueMonths[revenueMonths.length - 1];
        findings.push({
          icon: TrendingUp,
          text: `${formatMonthLabel(lastMonth[0])} revenue: ${fmtZAR(lastMonth[1])}`,
          variant: "neutral",
        });
      }
    } else if (revenueMonths.length >= 1) {
      const lastMonth = revenueMonths[revenueMonths.length - 1];
      findings.push({
        icon: TrendingUp,
        text: `${formatMonthLabel(lastMonth[0])} revenue: ${fmtZAR(lastMonth[1])}`,
        variant: "neutral",
      });
    }

    // (d) Best growth — per-retailer revenue current vs previous period
    if (sortedRetailers.length > 1) {
      const currentRetailerRev: Record<string, number> = {};
      const previousRetailerRev: Record<string, number> = {};

      // Use the last 2 sorted months as a proxy for current vs previous
      if (revenueMonths.length >= 2) {
        const currentMonth = revenueMonths[revenueMonths.length - 1][0];
        const previousMonth = revenueMonths[revenueMonths.length - 2][0];
        for (const r of data) {
          const m = (r.date ?? "").slice(0, 7);
          const retailer = r.retailer ?? "Unknown";
          const rev = Number(r.revenue ?? 0);
          if (m === currentMonth) currentRetailerRev[retailer] = (currentRetailerRev[retailer] ?? 0) + rev;
          if (m === previousMonth) previousRetailerRev[retailer] = (previousRetailerRev[retailer] ?? 0) + rev;
        }

        let bestGrowthName = "";
        let bestGrowthPct = 0;
        let worstDeclineName = "";
        let worstDeclinePct = 0;

        for (const [retailer, curRev] of Object.entries(currentRetailerRev)) {
          const prevRev = previousRetailerRev[retailer] ?? 0;
          if (prevRev > 0) {
            const changePct = ((curRev - prevRev) / prevRev) * 100;
            if (changePct > bestGrowthPct) {
              bestGrowthPct = changePct;
              bestGrowthName = retailer;
            }
            if (changePct < worstDeclinePct) {
              worstDeclinePct = changePct;
              worstDeclineName = retailer;
            }
          }
        }

        if (bestGrowthName && bestGrowthPct > 5) {
          findings.push({
            icon: Rocket,
            text: `Fastest growth: ${bestGrowthName} up ${bestGrowthPct.toFixed(0)}% month-on-month`,
            variant: "positive",
          });
        }

        // (e) Warning — declining retailer/brand
        if (worstDeclineName && worstDeclinePct < -5) {
          findings.push({
            icon: AlertTriangle,
            text: `Watch: ${worstDeclineName} down ${Math.abs(worstDeclinePct).toFixed(0)}% month-on-month`,
            variant: "warning",
          });
        }
      }
    }

    return findings.slice(0, 5);
  }, [data, hasData, totalRevenue, categoryDataRaw, monthMapRevenue]);

  // ── Chart Insight Annotations ──
  const revenueSpendAnnotation = useMemo(() => {
    if (totalSpend > 0 && totalRevenue > 0) {
      return `Overall ROAS: ${roas.toFixed(1)}x \u2014 ${fmtZAR(totalRevenue)} earned for every R1 spent on ads`;
    }
    return null;
  }, [totalRevenue, totalSpend, roas]);

  const brandAnnotation = useMemo(() => {
    if (brandDataRaw.length > 0 && totalRevenue > 0) {
      const topBrand = brandDataRaw[0];
      const pct = ((topBrand.revenue / totalRevenue) * 100).toFixed(0);
      return `${topBrand.brand} leads with ${pct}% of total revenue`;
    }
    return null;
  }, [brandDataRaw, totalRevenue]);

  const categoryAnnotation = useMemo(() => {
    if (categoryDataRaw.length > 0 && totalRevenue > 0) {
      const topCat = categoryDataRaw[0];
      const pct = ((topCat.revenue / totalRevenue) * 100).toFixed(0);
      return `${topCat.category} dominates at ${pct}% share`;
    }
    return null;
  }, [categoryDataRaw, totalRevenue]);

  // Rich multi-section data summary for AI insights
  const dataSummary = useMemo(() => {
    const sections: string[] = [];

    // Sell-out summary
    if (hasData) {
      const retailers = [...new Set(data.map(r => r.retailer).filter(Boolean))];
      const regions = [...new Set(data.map(r => r.region).filter(Boolean))];
      const dateRange = data.length > 0
        ? `${data.reduce((min, r) => r.date && r.date < min ? r.date : min, data[0]?.date ?? "")} to ${data.reduce((max, r) => r.date && r.date > max ? r.date : max, data[0]?.date ?? "")}`
        : "N/A";
      sections.push(
        `[SELL-OUT PERFORMANCE]\nTotal Revenue: ${fmtZAR(totalRevenue)} | Units Sold: ${totalUnits.toLocaleString()} | AOV: ${fmtZAR(avgOrderValue)} | Unique Products: ${uniqueProducts}\nDate Range: ${dateRange}\nRetailers (${retailers.length}): ${retailers.slice(0, 8).join(", ")}${retailers.length > 8 ? ` +${retailers.length - 8} more` : ""}\nRegions: ${regions.slice(0, 9).join(", ") || "N/A"}`
      );

      // Brands
      if (brandData.length > 0) {
        sections.push(
          `[TOP BRANDS BY REVENUE]\n${brandData.map((b, i) => `${i + 1}. ${b.brand}: ${fmtZAR(b.revenue)}`).join("\n")}`
        );
      }

      // Categories
      if (categoryData.length > 0) {
        sections.push(
          `[CATEGORY BREAKDOWN]\n${categoryData.map(c => `${c.category}: ${fmtZAR(c.revenue)}`).join(" | ")}`
        );
      }
    }

    // Campaign summary
    if (hasCampaigns) {
      const platforms = [...new Set(campaigns.map(c => c.platform).filter(Boolean))];
      sections.push(
        `[CAMPAIGN PERFORMANCE]\nTotal Ad Spend: ${fmtZAR(totalSpend)} | Impressions: ${totalImpressions.toLocaleString()} | Clicks: ${totalClicks.toLocaleString()}\nCTR: ${ctr.toFixed(2)}% | eCPM: ${fmtZAR(eCPM)} | CPC: ${fmtZAR(cpc)} | CPS: ${fmtZAR(cps)}\nROAS: ${roas.toFixed(1)}x | iROAS: ${iROAS.toFixed(1)}x\nPlatforms: ${platforms.join(", ") || "N/A"}\nConversions: ${totalConversions.toLocaleString()} | Campaign Revenue: ${fmtZAR(totalCampaignRevenue)}`
      );
    }

    // Attribution
    if (attributionResults.length > 0) {
      sections.push(
        `[CAMPAIGN ATTRIBUTION — TOP PERFORMERS]\n${attributionResults.slice(0, 5).map((r, i) => `${i + 1}. ${r.campaign_name} (${r.platform}): ${r.liftPct.toFixed(0)}% lift, ${fmtZAR(r.incrementalRevenue)} incremental revenue, ${r.incrementalROAS.toFixed(1)}x iROAS`).join("\n")}\nTotal Incremental Revenue: ${fmtZAR(totalIncrementalRevenue)}`
      );
    }

    // Period comparison
    if (comparison.revenue.deltaPct !== 0) {
      sections.push(
        `[${periodType} COMPARISON]\nRevenue: ${comparison.revenue.deltaPct > 0 ? "+" : ""}${comparison.revenue.deltaPct.toFixed(1)}% | Units: ${comparison.units.deltaPct > 0 ? "+" : ""}${comparison.units.deltaPct.toFixed(1)}% | AOV: ${comparison.aov.deltaPct > 0 ? "+" : ""}${comparison.aov.deltaPct.toFixed(1)}%`
      );
    }

    return sections.join("\n\n");
  }, [data, campaigns, brandData, categoryData, attributionResults, comparison, periodType,
      totalRevenue, totalUnits, avgOrderValue, uniqueProducts, totalSpend, totalImpressions,
      totalClicks, ctr, eCPM, cpc, cps, roas, iROAS, totalConversions, totalCampaignRevenue,
      totalIncrementalRevenue, hasData, hasCampaigns]);

  const isLoading = loading || campaignLoading;

  // ── Finding row style helper ──
  const findingRowClass = (variant: KeyFinding["variant"]) => {
    switch (variant) {
      case "positive":
        return "bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200/50 dark:border-emerald-800/30";
      case "warning":
        return "bg-amber-50 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-800/30";
      default:
        return "bg-muted border border-border/50";
    }
  };

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* ── 1. TITLE + CONTEXT LINE ── */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold">Retail Signal Intelligence</h1>
          <p className="text-muted-foreground text-sm">Multi-retailer performance + campaign data — unified.</p>
          {hasData && dataContext && (
            <p className="text-sm text-muted-foreground mt-1">
              {dataContext.retailerCount} {dataContext.retailerCount === 1 ? "retailer" : "retailers"} &middot; {dataContext.transactionCount.toLocaleString()} transactions &middot; {dataContext.dateRange}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex flex-col items-end gap-1">
            <Select value={periodType} onValueChange={(v) => setPeriodType(v as PeriodType)}>
              <SelectTrigger className="w-28 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="WoW">Week-on-Week</SelectItem>
                <SelectItem value="MoM">Month-on-Month</SelectItem>
                <SelectItem value="YoY">Year-on-Year</SelectItem>
              </SelectContent>
            </Select>
            {/* ── 2. PERIOD COMPARISON CONTEXT ── */}
            {hasData && comparison.currentLabel && comparison.previousLabel && (
              <span className="text-xs text-muted-foreground">
                Comparing: {comparison.currentLabel} vs {comparison.previousLabel}
              </span>
            )}
          </div>
          <ExportCsvButton
            filename="Dashboard"
            headers={["Metric", "Value"]}
            rows={[
              ["Total Revenue", totalRevenue],
              ["Units Sold", totalUnits],
              ["Avg Order Value", avgOrderValue],
              ["Unique Products", uniqueProducts],
              ["Total Ad Spend", totalSpend],
              ["Impressions", totalImpressions],
              ["Clicks", totalClicks],
              ["CTR %", ctr],
              ["ROAS", roas],
              ["iROAS", iROAS],
              ["eCPM", eCPM],
              ["Cost per Sale", cps],
            ]}
          />
          <ExportPdfButton targetRef={reportRef} filename="SignalStack-Dashboard" />
        </div>
      </div>

      <div ref={reportRef}>
        {/* ── 2. SELL-OUT KPI CARDS (with period labels) ── */}
        {(hasData || isLoading) && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {sellOutKpis.map((kpi, i) => (
              <KpiCard
                key={kpi.label}
                label={kpi.label}
                value={kpi.value}
                icon={kpi.icon}
                loading={isLoading}
                delay={i * 0.06}
                delta={kpi.delta}
                periodLabel={comparison.previousLabel}
              />
            ))}
          </div>
        )}

        {/* ── EMPTY STATE ── */}
        {!isLoading && !hasData && !hasCampaigns && (
          <div className="mb-6 space-y-4">
            <EmptyState message="Upload sell-out or campaign data to see your dashboard." />
            <div className="flex justify-center">
              <Button variant="outline" size="sm" onClick={handleLoadDemo} disabled={demoLoading}>
                {demoLoading ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Database className="h-3.5 w-3.5 mr-1.5" />}
                {demoLoading ? "Loading demo data..." : "Load Demo Data"}
              </Button>
            </div>
          </div>
        )}

        {/* ── 3. KEY FINDINGS (auto-computed, no AI) ── */}
        {hasData && !isLoading && keyFindings.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
            <Card className="mb-6">
              <CardHeader className="pb-3">
                <CardTitle className="font-display text-base flex items-center gap-2">
                  <div className="h-6 w-6 rounded-md bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                    <Lightbulb className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                  </div>
                  Key Findings
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-2">
                  {keyFindings.map((finding, i) => {
                    const FindingIcon = finding.icon;
                    return (
                      <div
                        key={i}
                        className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${findingRowClass(finding.variant)}`}
                      >
                        <FindingIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span>{finding.text}</span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {(hasData || hasCampaigns) && (
          <>
            {/* ── 4. REVENUE VS SPEND OVER TIME (the "money chart") ── */}
            {timeData.length > 0 && (
              <Card className="mb-6 glass-card">
                <CardHeader><CardTitle className="font-display text-base">Revenue vs Ad Spend Over Time</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={CHART_HEIGHT.full}>
                    <LineChart data={timeData}>
                      <defs>
                        <linearGradient id="areaRevenue" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={LINE_COLORS.revenue} stopOpacity={0.12} />
                          <stop offset="100%" stopColor={LINE_COLORS.revenue} stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="areaSpend" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={LINE_COLORS.spend} stopOpacity={0.1} />
                          <stop offset="100%" stopColor={LINE_COLORS.spend} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid {...chartGridProps} />
                      <XAxis dataKey="month" className={axisClassName} />
                      <YAxis yAxisId="revenue" className={axisClassName} tickFormatter={(v) => fmtZAR(v)} />
                      <YAxis yAxisId="spend" orientation="right" className={axisClassName} tickFormatter={(v) => fmtZAR(v)} />
                      <Tooltip content={<PremiumChartTooltip />} />
                      <Legend />
                      <Area yAxisId="revenue" dataKey="revenue" fill="url(#areaRevenue)" stroke="none" animationDuration={CHART_ANIMATION_MS} />
                      <Area yAxisId="spend" dataKey="spend" fill="url(#areaSpend)" stroke="none" animationDuration={CHART_ANIMATION_MS} />
                      <Line yAxisId="revenue" dataKey="revenue" stroke={LINE_COLORS.revenue} strokeWidth={2.5} dot={{ r: 3, fill: LINE_COLORS.revenue }} name="Revenue" animationDuration={CHART_ANIMATION_MS} />
                      <Line yAxisId="spend" dataKey="spend" stroke={LINE_COLORS.spend} strokeWidth={2} strokeDasharray="5 5" dot={{ r: 3, fill: LINE_COLORS.spend }} name="Ad Spend" animationDuration={CHART_ANIMATION_MS} />
                    </LineChart>
                  </ResponsiveContainer>
                  {revenueSpendAnnotation && (
                    <p className="text-xs text-muted-foreground mt-2">{revenueSpendAnnotation}</p>
                  )}
                </CardContent>
              </Card>
            )}

            {/* ── 5. TOP BRANDS BY REVENUE ── */}
            {brandData.length > 0 && (
              <Card className="mb-6 glass-card">
                <CardHeader><CardTitle className="font-display text-base">Top-Performing Brands by Revenue</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={CHART_HEIGHT.full}>
                    <BarChart data={brandData} layout="vertical" margin={{ left: 80 }}>
                      <CartesianGrid {...chartGridProps} />
                      <XAxis type="number" className={axisClassName} tickFormatter={(v) => fmtZAR(v)} />
                      <YAxis type="category" dataKey="brand" className={axisClassName} width={75} />
                      <Tooltip content={<PremiumChartTooltip />} cursor={chartCursorStyle} />
                      <Bar dataKey="revenue" radius={[0, 4, 4, 0]} name="Revenue" animationDuration={CHART_ANIMATION_MS}>
                        {brandData.map((_, i) => <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  {brandAnnotation && (
                    <p className="text-xs text-muted-foreground mt-2">{brandAnnotation}</p>
                  )}
                </CardContent>
              </Card>
            )}

            {/* ── 6. CATEGORY ANALYSIS ── */}
            {categoryData.length > 0 && (
              <Card className="mb-6 glass-card">
                <CardHeader><CardTitle className="font-display text-base">Category Analysis</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={CHART_HEIGHT.half}>
                    <BarChart data={categoryData}>
                      <CartesianGrid {...chartGridProps} />
                      <XAxis dataKey="category" className={axisClassName} angle={-20} textAnchor="end" height={50} interval={0} />
                      <YAxis className={axisClassName} tickFormatter={(v) => fmtZAR(v)} />
                      <Tooltip content={<PremiumChartTooltip />} cursor={chartCursorStyle} />
                      <Bar dataKey="revenue" radius={[4, 4, 0, 0]} name="Revenue" animationDuration={CHART_ANIMATION_MS}>
                        {categoryData.map((_, i) => <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  {categoryAnnotation && (
                    <p className="text-xs text-muted-foreground mt-2">{categoryAnnotation}</p>
                  )}
                </CardContent>
              </Card>
            )}

            {/* ── 7. CAMPAIGN SECTION (visually separated) ── */}
            {(hasCampaigns || campaignLoading) && (
              <>
                <div className="flex items-center gap-2 mt-8 mb-4">
                  <div className="h-7 w-7 rounded-md bg-chart-4/15 flex items-center justify-center">
                    <Megaphone className="h-4 w-4 text-chart-4" />
                  </div>
                  <h2 className="font-display text-lg font-semibold">Campaign Performance</h2>
                </div>

                {/* Campaign KPI cards */}
                <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
                  {campaignKpis.map((kpi, i) => (
                    <KpiCard key={kpi.label} label={kpi.label} value={kpi.value} icon={kpi.icon} loading={campaignLoading} delay={0.3 + i * 0.05} colorClass="bg-chart-4/15 text-chart-4" />
                  ))}
                </div>

                {/* Campaign Efficiency — ROAS, iROAS, eCPM, CPS */}
                {hasCampaigns && totalSpend > 0 && !isLoading && (
                  <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                      <Card className="border-primary/20 bg-primary/3">
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">ROAS</span>
                            <div className="h-7 w-7 rounded-md bg-primary/10 flex items-center justify-center">
                              <Target className="h-3.5 w-3.5 text-primary" />
                            </div>
                          </div>
                          <p className="font-display text-2xl font-bold">{roas.toFixed(1)}x</p>
                          <p className="text-[10px] text-muted-foreground">Revenue / Spend</p>
                        </CardContent>
                      </Card>
                      <Card className="border-chart-2/20 bg-chart-2/3">
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">iROAS</span>
                            <div className="h-7 w-7 rounded-md bg-chart-2/10 flex items-center justify-center">
                              <Zap className="h-3.5 w-3.5 text-chart-2" />
                            </div>
                          </div>
                          <p className="font-display text-2xl font-bold">{iROAS.toFixed(1)}x</p>
                          <p className="text-[10px] text-muted-foreground">Incremental Revenue / Spend</p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">eCPM</span>
                            <div className="h-7 w-7 rounded-md bg-chart-4/10 flex items-center justify-center">
                              <BarChart3 className="h-3.5 w-3.5 text-chart-4" />
                            </div>
                          </div>
                          <p className="font-display text-2xl font-bold">{fmtZAR(eCPM)}</p>
                          <p className="text-[10px] text-muted-foreground">Effective Cost per 1K Impressions</p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Cost per Sale</span>
                            <div className="h-7 w-7 rounded-md bg-chart-3/10 flex items-center justify-center">
                              <CircleDollarSign className="h-3.5 w-3.5 text-chart-3" />
                            </div>
                          </div>
                          <p className="font-display text-2xl font-bold">{fmtZAR(cps)}</p>
                          <p className="text-[10px] text-muted-foreground">Spend / Conversions</p>
                        </CardContent>
                      </Card>
                    </div>
                  </motion.div>
                )}

                {/* Campaign Impact — Revenue Lift vs Baseline */}
                {attributionResults.length > 0 && !isLoading && (
                  <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
                    <Card className="mb-6">
                      <CardHeader>
                        <CardTitle className="font-display text-base">Campaign Impact — Revenue Lift vs Baseline</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="rounded-lg border overflow-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b bg-muted/50">
                                <th className="text-left p-3 text-xs font-semibold">Campaign</th>
                                <th className="text-left p-3 text-xs font-semibold">Platform</th>
                                <th className="text-right p-3 text-xs font-semibold">Baseline Revenue</th>
                                <th className="text-right p-3 text-xs font-semibold">Flight Revenue</th>
                                <th className="text-right p-3 text-xs font-semibold">Lift</th>
                                <th className="text-right p-3 text-xs font-semibold">iROAS</th>
                              </tr>
                            </thead>
                            <tbody>
                              {attributionResults.slice(0, 10).map((r) => (
                                <tr key={r.campaign_name} className="border-b last:border-0 hover:bg-muted/30">
                                  <td className="p-3 font-medium truncate max-w-[200px]">{r.campaign_name}</td>
                                  <td className="p-3 text-muted-foreground">{r.platform}</td>
                                  <td className="p-3 text-right">{fmtZAR(r.baselineRevenue)}</td>
                                  <td className="p-3 text-right">{fmtZAR(r.flightRevenue)}</td>
                                  <td className="p-3 text-right">
                                    <DeltaIndicator delta={r.liftPct} />
                                  </td>
                                  <td className="p-3 text-right font-semibold">{r.incrementalROAS.toFixed(1)}x</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                )}
              </>
            )}

            {/* ── 8. ANOMALY DETECTION ── */}
            {hasData && <AnomalyDetectionPanel data={data} />}

            {/* ── 9. DATA QUALITY SCORE ── */}
            <div className="mt-6">
              <DataQualityPanel
                sellOutData={data as unknown as Record<string, unknown>[]}
                campaignData={campaigns as unknown as Record<string, unknown>[]}
              />
            </div>

            {/* ── 10. AI STRATEGIC INSIGHTS (button-triggered) ── */}
            <SignalStackInsights dataSummary={dataSummary} title="Strategic Insights" />

            {/* ── 11. ACTIVITY PANEL ── */}
            <ActivityPanel />
          </>
        )}
      </div>
    </div>
  );
};

export default DashboardHome;
