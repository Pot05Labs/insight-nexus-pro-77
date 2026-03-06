import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { Lightbulb, Loader2, Wrench, DollarSign, ShoppingCart, MapPin } from "lucide-react";
import SignalStackInsights from "@/components/SignalStackInsights";
import EmptyState from "@/components/EmptyState";
import KpiCard from "@/components/KpiCard";
import { useSellOutData, fmtZAR, aggregate } from "@/hooks/useSellOutData";
import { useCampaignData } from "@/hooks/useCampaignData";
import { usePeriodComparison, type PeriodType } from "@/hooks/usePeriodComparison";
import { useGlobalFilters } from "@/contexts/GlobalFilterContext";
import { chartCursorStyle, chartGridProps, CHART_ANIMATION_MS, CHART_HEIGHT, axisClassName, CHART_PALETTE } from "@/lib/chart-utils";
import { resolveProvince, VALID_PROVINCE_SET } from "@/lib/sa-store-provinces";
import PremiumChartTooltip from "@/components/charts/ChartTooltip";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { buildGeographySummary } from "@/services/insightsSnapshot";
import { repairProvinceMappings } from "@/services/provinceRepair";
import { getCurrentProjectContext } from "@/services/projectContext";

const GeographyPage = () => {
  const { data, loading, refetch } = useSellOutData();
  const { data: campaigns } = useCampaignData();
  const { filterSellOut } = useGlobalFilters();
  const { toast } = useToast();
  const [repairing, setRepairing] = useState(false);
  const periodType: PeriodType = "MoM";

  // Apply global filters
  const filteredData = useMemo(() => filterSellOut(data), [data, filterSellOut]);

  // Period-over-period comparison
  const comparison = usePeriodComparison(filteredData, campaigns, periodType);

  const hasData = filteredData.length > 0;

  // ── Pre-compute province for every row ONCE, keyed by row id ──────
  // This avoids calling inferRegion 4+ times per row across filter/aggregate/table.
  const rowProvinceMap = useMemo(() => {
    const map = new Map<string, string | null>();

    for (const r of filteredData) {
      map.set(
        r.id,
        resolveProvince({
          region: r.region,
          storeLocation: r.store_location,
        }),
      );
    }

    return map;
  }, [filteredData]);

  // Helper to get cached province for a row
  const getProvince = (r: typeof filteredData[0]): string | null => rowProvinceMap.get(r.id) ?? null;

  // ── Top 5 stores by revenue (uses all rows with store_location) ──
  const storeData = useMemo(() => {
    const storesOnly = filteredData.filter((r) => r.store_location && r.store_location.trim() !== "");
    const revByStore = aggregate(storesOnly, (r) => r.store_location!.trim(), (r) => Number(r.revenue ?? 0));
    return Object.entries(revByStore)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([store, revenue]) => ({ store, revenue: Math.round(revenue) }));
  }, [filteredData]);

  // ── Province data (only rows with resolved province) ──────────────
  const mappedData = useMemo(
    () => filteredData.filter((r) => getProvince(r) !== null),
    [filteredData, rowProvinceMap],
  );

  const regionData = useMemo(() => {
    const revByRegion = aggregate(mappedData, (r) => getProvince(r)!, (r) => Number(r.revenue ?? 0));
    return Object.entries(revByRegion)
      // HARD FILTER: only valid SA provinces pass through (bulletproof safety gate)
      .filter(([region]) => VALID_PROVINCE_SET.has(region))
      .sort(([, a], [, b]) => b - a)
      .map(([region, revenue]) => ({ region, revenue: Math.round(revenue) }));
  }, [mappedData, rowProvinceMap]);

  // ── Province performance table (revenue + units + AOV) ────────────
  const provinceTable = useMemo(() => {
    const unitsByRegion = aggregate(mappedData, (r) => getProvince(r)!, (r) => Number(r.units_sold ?? 0));
    return regionData.map((r) => ({
      region: r.region,
      revenue: r.revenue,
      units: Math.round(unitsByRegion[r.region] ?? 0),
      aov: (unitsByRegion[r.region] ?? 0) > 0 ? r.revenue / unitsByRegion[r.region] : 0,
    }));
  }, [regionData, mappedData, rowProvinceMap]);

  // ── Context stats ─────────────────────────────────────────────────
  const uniqueRegions = useMemo(
    () => new Set(mappedData.map((r) => getProvince(r)).filter(Boolean)).size,
    [mappedData, rowProvinceMap],
  );

  const uniqueStores = useMemo(
    () => new Set(filteredData.map((r) => r.store_location).filter(Boolean)).size,
    [filteredData],
  );

  const dateRange = useMemo(() => {
    const dates = filteredData.map((r) => r.date).filter(Boolean).sort();
    if (dates.length === 0) return "";
    const fmt = (d: string) =>
      new Date(d).toLocaleDateString("en-ZA", { month: "short", year: "numeric" });
    const first = fmt(dates[0]!);
    const last = fmt(dates[dates.length - 1]!);
    return first === last ? first : `${first} \u2013 ${last}`;
  }, [filteredData]);

  // ── Key finding ───────────────────────────────────────────────────
  const totalRevenue = useMemo(
    () => regionData.reduce((s, r) => s + r.revenue, 0),
    [regionData],
  );

  const keyFinding = useMemo(() => {
    if (regionData.length === 0 || totalRevenue === 0) return null;
    const top = regionData[0];
    const pct = ((top.revenue / totalRevenue) * 100).toFixed(1);
    return `Strongest region: ${top.region} at ${fmtZAR(top.revenue)} \u2014 ${pct}% of national revenue`;
  }, [regionData, totalRevenue]);

  // ── KPI values ──────────────────────────────────────────────────
  const totalUnits = useMemo(
    () => filteredData.reduce((s, r) => s + Number(r.units_sold ?? 0), 0),
    [filteredData],
  );

  // ── AI data summary ───────────────────────────────────────────────
  const dataSummary = useMemo(() => buildGeographySummary(filteredData)?.summary ?? "", [filteredData]);

  const handleRepairProvinceMapping = async () => {
    setRepairing(true);
    try {
      const context = await getCurrentProjectContext();
      if (!context) {
        toast({
          title: "No active project",
          description: "Load a project before repairing province mappings.",
          variant: "destructive",
        });
        return;
      }

      const result = await repairProvinceMappings(context.projectId);
      await refetch();

      toast({
        title: "Province mapping repaired",
        description: `Scanned ${result.scanned} rows, updated ${result.updated}, left ${result.unresolved} unresolved, ${result.conflicts} conflicts preserved.`,
      });
    } catch (error) {
      toast({
        title: "Repair failed",
        description: error instanceof Error ? error.message : "Unable to repair province mappings.",
        variant: "destructive",
      });
    } finally {
      setRepairing(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────

  if (loading) return <div className="p-8"><Skeleton className="h-96 w-full" /></div>;
  if (data.length === 0) return <div className="p-8"><EmptyState message="Upload data to see geographic analytics." /></div>;

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Geography</h1>
          <p className="text-muted-foreground text-sm">
            Geographic performance — provincial context effects and store-level analysis.
          </p>
          {hasData && dateRange && (
            <p className="text-sm text-muted-foreground mt-1">
              {uniqueRegions.toLocaleString()} provinces &middot;{" "}
              {uniqueStores.toLocaleString()} stores &middot; {dateRange}
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
        />
        <KpiCard
          label="Units Sold"
          value={totalUnits.toLocaleString()}
          icon={ShoppingCart}
          delta={comparison.units.deltaPct}
          periodLabel={comparison.previousLabel}
        />
        <KpiCard
          label="Provinces with Data"
          value={uniqueRegions.toString()}
          icon={MapPin}
        />
      </div>

      {/* Key Finding */}
      {keyFinding && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-accent/5 border border-accent/20 text-sm">
          <Lightbulb className="h-4 w-4 text-accent shrink-0" />
          <span className="text-foreground/80">{keyFinding}</span>
        </div>
      )}

      {/* Charts — 2-column grid */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Top 5 Stores */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="font-display text-base">Top 5 Stores by Revenue</CardTitle>
            <CardDescription className="text-xs">Highest-performing store locations</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={CHART_HEIGHT.half}>
              <BarChart data={storeData} layout="vertical" margin={{ left: 100 }}>
                <CartesianGrid {...chartGridProps} />
                <XAxis type="number" className={axisClassName} tickFormatter={(v) => fmtZAR(v)} />
                <YAxis type="category" dataKey="store" className="text-[10px] fill-muted-foreground" width={95} />
                <Tooltip content={<PremiumChartTooltip />} cursor={chartCursorStyle} />
                <Bar dataKey="revenue" radius={[0, 4, 4, 0]} animationDuration={CHART_ANIMATION_MS}>
                  {storeData.map((_, i) => (
                    <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Revenue by Province */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="font-display text-base">Revenue by Province</CardTitle>
            <CardDescription className="text-xs">Revenue distribution across South African provinces</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={CHART_HEIGHT.half}>
              <BarChart data={regionData}>
                <CartesianGrid {...chartGridProps} />
                <XAxis
                  dataKey="region"
                  className={axisClassName}
                  angle={-20}
                  textAnchor="end"
                  height={50}
                  interval={0}
                />
                <YAxis className={axisClassName} tickFormatter={(v) => fmtZAR(v)} />
                <Tooltip content={<PremiumChartTooltip />} cursor={chartCursorStyle} />
                <Bar dataKey="revenue" radius={[4, 4, 0, 0]} animationDuration={CHART_ANIMATION_MS}>
                  {regionData.map((_, i) => (
                    <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Province Performance Table */}
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-base">Province Performance</CardTitle>
          <CardDescription className="text-xs">Revenue, units, and average order value by province</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Province</TableHead>
                  <TableHead className="text-xs text-right">Revenue</TableHead>
                  <TableHead className="text-xs text-right">Units</TableHead>
                  <TableHead className="text-xs text-right">AOV</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {provinceTable.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-sm font-medium">{r.region}</TableCell>
                    <TableCell className="text-sm text-right font-medium">{fmtZAR(r.revenue)}</TableCell>
                    <TableCell className="text-sm text-right">{r.units.toLocaleString()}</TableCell>
                    <TableCell className="text-sm text-right">{fmtZAR(r.aov)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <SignalStackInsights dataSummary={dataSummary} title="Geographic Insights" />
    </div>
  );
};

export default GeographyPage;
