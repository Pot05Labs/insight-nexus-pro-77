import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { BarChart, Bar, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowUpDown, Lightbulb, DollarSign, ShoppingCart, Tag, Package, ChevronLeft, ChevronRight } from "lucide-react";
import EmptyState from "@/components/EmptyState";
import SignalStackInsights from "@/components/SignalStackInsights";
import KpiCard from "@/components/KpiCard";
import { useSellOutData, fmtZAR } from "@/hooks/useSellOutData";
import { useCampaignData } from "@/hooks/useCampaignData";
import { usePeriodComparison, type PeriodType } from "@/hooks/usePeriodComparison";
import { useGlobalFilters } from "@/contexts/GlobalFilterContext";
import { useSellOutAggregation } from "@/hooks/useAggregation";
import { useSellOutKPIs } from "@/hooks/useSellOutKPIs";
import { chartCursorStyle, chartGridProps, CHART_COLORS, CHART_ANIMATION_MS, CHART_HEIGHT, axisClassName, CHART_PALETTE, chartTooltipStyle } from "@/lib/chart-utils";
import PremiumChartTooltip from "@/components/charts/ChartTooltip";
import { buildRetailersSummary } from "@/services/insightsSnapshot";

type SortKey = "retailer" | "revenue" | "units" | "aov" | "stores" | "index";

const PAGE_SIZE = 25;

const RetailersPage = () => {
  // Raw data — kept for period comparison, radar chart, table (store counts), AI summary
  const { data: rawData, loading: rawLoading } = useSellOutData();
  const { data: campaigns } = useCampaignData();
  const { filters, filterSellOut } = useGlobalFilters();
  const [sortKey, setSortKey] = useState<SortKey>("revenue");
  const [sortAsc, setSortAsc] = useState(false);
  const periodType: PeriodType = "MoM";
  const [page, setPage] = useState(0);

  // ── Server-side aggregation hooks ──────────────────────────────────
  const { data: retailerChartAgg, isLoading: chartAggLoading } = useSellOutAggregation("retailer", filters, 8);
  const { data: retailerFullAgg, isLoading: fullAggLoading } = useSellOutAggregation("retailer", filters, 100);
  const { data: kpis, isLoading: kpisLoading } = useSellOutKPIs(filters);

  const aggLoading = chartAggLoading || fullAggLoading || kpisLoading;

  // Apply global filters to raw data (still needed for period comparison, radar, AI summary)
  const data = useMemo(() => filterSellOut(rawData), [rawData, filterSellOut]);

  // Period-over-period comparison (needs raw row-level data)
  const comparison = usePeriodComparison(data, campaigns, periodType);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
    setPage(0);
  };

  // ── KPI values from server-side KPIs ──────────────────────────────
  const totalRevenue = kpis?.total_revenue ?? 0;
  const totalUnits = kpis?.total_units ?? 0;
  const avgOrderValue = totalUnits > 0 ? totalRevenue / totalUnits : 0;
  const uniqueProductCount = kpis?.distinct_products ?? 0;

  const kpiCards = useMemo(() => [
    { label: "Total Revenue", value: fmtZAR(totalRevenue), icon: DollarSign, delta: comparison.revenue.deltaPct },
    { label: "Units Sold", value: totalUnits.toLocaleString(), icon: ShoppingCart, delta: comparison.units.deltaPct },
    { label: "Avg Order Value", value: fmtZAR(avgOrderValue), icon: Tag, delta: comparison.aov.deltaPct },
    { label: "Unique Products", value: uniqueProductCount.toString(), icon: Package, delta: comparison.products.deltaPct },
  ], [totalRevenue, totalUnits, avgOrderValue, uniqueProductCount, comparison]);

  // ── Chart data from server-side aggregation (top 8 retailers) ─────
  const chartData = useMemo(() => {
    if (!retailerChartAgg) return [];
    return retailerChartAgg.map((r) => ({
      retailer: r.group_key,
      revenue: Math.round(r.total_revenue),
    }));
  }, [retailerChartAgg]);

  // ── Table data — uses server agg for revenue/units, raw data for store counts ──
  const tableData = useMemo(() => {
    if (!retailerFullAgg) return [];

    // Build store count map from raw data (still needs row-level data)
    const storeCounts: Record<string, Set<string>> = {};
    data.forEach((r) => {
      const ret = r.retailer ?? "Unknown";
      storeCounts[ret] ??= new Set<string>();
      if (r.store_location) storeCounts[ret].add(r.store_location);
    });

    const avgRevenue = retailerFullAgg.length > 0
      ? retailerFullAgg.reduce((s, r) => s + r.total_revenue, 0) / retailerFullAgg.length
      : 1;

    const arr = retailerFullAgg.map((r) => ({
      retailer: r.group_key,
      revenue: r.total_revenue,
      units: r.total_units,
      aov: r.total_units > 0 ? r.total_revenue / r.total_units : 0,
      stores: storeCounts[r.group_key]?.size ?? 0,
      index: Math.round((r.total_revenue / avgRevenue) * 100),
    }));

    arr.sort((a, b) => {
      const mul = sortAsc ? 1 : -1;
      if (sortKey === "retailer") return mul * a.retailer.localeCompare(b.retailer);
      return mul * ((a[sortKey] as number) - (b[sortKey] as number));
    });
    return arr;
  }, [retailerFullAgg, data, sortKey, sortAsc]);

  // Radar data for benchmarking (top 6 retailers, normalized dimensions)
  const radarData = useMemo(() => {
    if (tableData.length < 2) return [];
    const top = tableData.slice(0, 6);
    const maxRev = Math.max(...top.map((r) => r.revenue), 1);
    const maxUnits = Math.max(...top.map((r) => r.units), 1);
    const maxAOV = Math.max(...top.map((r) => r.aov), 1);
    const maxStores = Math.max(...top.map((r) => r.stores), 1);

    const dimensions = ["Revenue", "Units", "AOV", "Store Reach"];
    return dimensions.map((dim) => {
      const entry: Record<string, string | number> = { dimension: dim };
      top.forEach((r) => {
        if (dim === "Revenue") entry[r.retailer] = Math.round((r.revenue / maxRev) * 100);
        else if (dim === "Units") entry[r.retailer] = Math.round((r.units / maxUnits) * 100);
        else if (dim === "AOV") entry[r.retailer] = Math.round((r.aov / maxAOV) * 100);
        else entry[r.retailer] = Math.round((r.stores / maxStores) * 100);
      });
      return entry;
    });
  }, [tableData]);

  const radarRetailers = useMemo(() => tableData.slice(0, 6).map((r) => r.retailer), [tableData]);
  const radarColors = ["hsl(var(--primary))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))", "hsl(224 15% 45%)"];

  const hasData = (retailerChartAgg && retailerChartAgg.length > 0) || data.length > 0;
  const dataSummary = useMemo(() => buildRetailersSummary(data)?.summary ?? "", [data]);

  // Data context line
  const uniqueRetailers = useMemo(() => kpis?.distinct_retailers ?? new Set(data.map((r) => r.retailer).filter(Boolean)).size, [kpis, data]);
  const uniqueStores = useMemo(() => new Set(data.map((r) => r.store_location).filter(Boolean)).size, [data]);
  const dateRange = useMemo(() => {
    const dates = data.map((r) => r.date).filter(Boolean).sort();
    if (dates.length === 0) return "";
    const fmt = (d: string) => new Date(d).toLocaleDateString("en-ZA", { month: "short", year: "numeric" });
    const first = fmt(dates[0]!);
    const last = fmt(dates[dates.length - 1]!);
    return first === last ? first : `${first} \u2013 ${last}`;
  }, [data]);

  // Key finding: top retailer by revenue
  const keyFinding = useMemo(() => {
    if (chartData.length === 0 || totalRevenue === 0) return null;
    const top = chartData[0];
    const pct = ((top.revenue / totalRevenue) * 100).toFixed(1);
    return `Market leader: ${top.retailer} at ${fmtZAR(top.revenue)} \u2014 ${pct}% revenue share`;
  }, [chartData, totalRevenue]);

  const loading = rawLoading || aggLoading;

  if (loading && !hasData) return <div className="p-8"><Skeleton className="h-96 w-full" /></div>;
  if (!hasData && !loading) return <div className="p-8"><EmptyState message="Upload data to see retailer analytics." /></div>;

  const SortIcon = ({ col }: { col: SortKey }) => (
    <ArrowUpDown className={`inline h-3 w-3 ml-1 cursor-pointer ${sortKey === col ? "text-primary" : "text-muted-foreground/40"}`} onClick={() => handleSort(col)} />
  );

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header with period selector */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold">Retailers</h1>
          <p className="text-muted-foreground text-sm">Retailer channel intelligence — distribution effectiveness and choice architecture.</p>
          {hasData && dateRange && (
            <p className="text-sm text-muted-foreground mt-1">
              {uniqueRetailers.toLocaleString()} retailers &middot; {uniqueStores.toLocaleString()} stores &middot; {dateRange}
            </p>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map((kpi, i) => (
          <KpiCard
            key={kpi.label}
            label={kpi.label}
            value={kpi.value}
            icon={kpi.icon}
            loading={kpisLoading}
            delay={i * 0.06}
            delta={kpi.delta}
            periodLabel={comparison.previousLabel}
          />
        ))}
      </div>

      {keyFinding && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-accent/5 border border-accent/20 text-sm">
          <Lightbulb className="h-4 w-4 text-accent shrink-0" />
          <span className="text-foreground/80">{keyFinding}</span>
        </div>
      )}

      <Card className="glass-card">
        <CardHeader><CardTitle className="font-display text-base">Revenue by Retailer</CardTitle></CardHeader>
        <CardContent>
          {chartAggLoading ? (
            <Skeleton className="h-[300px] w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={CHART_HEIGHT.full}>
              <BarChart data={chartData}>
                <CartesianGrid {...chartGridProps} />
                <XAxis dataKey="retailer" className={axisClassName} angle={-20} textAnchor="end" height={50} interval={0} />
                <YAxis className={axisClassName} tickFormatter={(v) => fmtZAR(v)} />
                <Tooltip content={<PremiumChartTooltip />} cursor={chartCursorStyle} />
                <Bar dataKey="revenue" radius={[4, 4, 0, 0]} animationDuration={CHART_ANIMATION_MS}>
                  {chartData.map((_, i) => <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Cross-Retailer Benchmarking Radar */}
      {radarData.length > 0 && radarRetailers.length >= 2 && (
        <Card className="glass-card">
          <CardHeader><CardTitle className="font-display text-base">Cross-Retailer Benchmarking</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={CHART_HEIGHT.full + 50}>
              <RadarChart data={radarData}>
                <PolarGrid className="stroke-border" strokeOpacity={0.5} />
                <PolarAngleAxis dataKey="dimension" className="text-xs fill-muted-foreground" />
                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} />
                {radarRetailers.map((retailer, i) => (
                  <Radar
                    key={retailer}
                    name={retailer}
                    dataKey={retailer}
                    stroke={CHART_COLORS[i % CHART_COLORS.length]}
                    fill={CHART_COLORS[i % CHART_COLORS.length]}
                    fillOpacity={0.1}
                    strokeWidth={2}
                    animationDuration={CHART_ANIMATION_MS}
                  />
                ))}
                <Legend />
                <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number) => [`${v.toFixed(0)}/100`, "Index"]} />
              </RadarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Retailer Performance Table with Pagination */}
      <Card>
        <CardHeader><CardTitle className="font-display text-base">Retailer Performance</CardTitle></CardHeader>
        <CardContent>
          {fullAggLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : (
            <>
              <div className="rounded-lg border overflow-auto max-h-[500px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Retailer <SortIcon col="retailer" /></TableHead>
                      <TableHead className="text-xs text-right">Revenue <SortIcon col="revenue" /></TableHead>
                      <TableHead className="text-xs text-right">Units <SortIcon col="units" /></TableHead>
                      <TableHead className="text-xs text-right">Avg Order Value <SortIcon col="aov" /></TableHead>
                      <TableHead className="text-xs text-right">Stores <SortIcon col="stores" /></TableHead>
                      <TableHead className="text-xs text-right">Index <SortIcon col="index" /></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tableData.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((r, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-sm font-medium">{r.retailer}</TableCell>
                        <TableCell className="text-sm text-right font-medium">{fmtZAR(r.revenue)}</TableCell>
                        <TableCell className="text-sm text-right">{r.units.toLocaleString()}</TableCell>
                        <TableCell className="text-sm text-right">{fmtZAR(r.aov)}</TableCell>
                        <TableCell className="text-sm text-right">{r.stores}</TableCell>
                        <TableCell className="text-sm text-right">
                          <span className={r.index >= 100 ? "text-emerald-600 dark:text-emerald-400 font-semibold" : r.index >= 80 ? "text-foreground" : "text-red-600 dark:text-red-400"}>
                            {r.index}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {tableData.length > PAGE_SIZE && (
                <div className="flex items-center justify-between px-4 py-3 border-t">
                  <span className="text-xs text-muted-foreground">
                    Showing {page * PAGE_SIZE + 1}&ndash;{Math.min((page + 1) * PAGE_SIZE, tableData.length)} of {tableData.length}
                  </span>
                  <div className="flex gap-1">
                    <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="outline" size="sm" disabled={(page + 1) * PAGE_SIZE >= tableData.length} onClick={() => setPage(p => p + 1)}>
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <SignalStackInsights dataSummary={dataSummary} />
    </div>
  );
};

export default RetailersPage;
