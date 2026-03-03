import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowUpDown } from "lucide-react";
import EmptyState from "@/components/EmptyState";
import SignalStackInsights from "@/components/SignalStackInsights";
import ExportCsvButton from "@/components/ExportCsvButton";
import { useSellOutData, fmtZAR, aggregate } from "@/hooks/useSellOutData";
import { chartCursorStyle, chartGridProps, CHART_COLORS, CHART_ANIMATION_MS, CHART_HEIGHT, axisClassName, CHART_PALETTE, chartTooltipStyle } from "@/lib/chart-utils";
import PremiumChartTooltip from "@/components/charts/ChartTooltip";

type SortKey = "retailer" | "revenue" | "units" | "aov" | "stores" | "index";

const RetailersPage = () => {
  const { data, loading } = useSellOutData();
  const [sortKey, setSortKey] = useState<SortKey>("revenue");
  const [sortAsc, setSortAsc] = useState(false);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  };

  // Revenue by retailer (all time for chart)
  const revByRetailer = aggregate(data, (r) => r.retailer ?? "Unknown", (r) => Number(r.revenue ?? 0));
  const chartData = Object.entries(revByRetailer).sort(([, a], [, b]) => b - a).slice(0, 8)
    .map(([retailer, revenue]) => ({ retailer, revenue: Math.round(revenue) }));

  // Table data with benchmarking index (100 = average)
  const tableData = useMemo(() => {
    const map: Record<string, { revenue: number; units: number; stores: Set<string> }> = {};
    data.forEach((r) => {
      const ret = r.retailer ?? "Unknown";
      if (!map[ret]) map[ret] = { revenue: 0, units: 0, stores: new Set() };
      map[ret].revenue += Number(r.revenue ?? 0);
      map[ret].units += Number(r.units_sold ?? 0);
      if (r.store_location) map[ret].stores.add(r.store_location);
    });

    const entries = Object.entries(map);
    const avgRevenue = entries.length > 0 ? entries.reduce((s, [, v]) => s + v.revenue, 0) / entries.length : 1;

    const arr = entries.map(([retailer, v]) => ({
      retailer,
      revenue: v.revenue,
      units: v.units,
      aov: v.units > 0 ? v.revenue / v.units : 0,
      stores: v.stores.size,
      index: Math.round((v.revenue / avgRevenue) * 100),
    }));
    arr.sort((a, b) => {
      const mul = sortAsc ? 1 : -1;
      if (sortKey === "retailer") return mul * a.retailer.localeCompare(b.retailer);
      return mul * ((a[sortKey] as number) - (b[sortKey] as number));
    });
    return arr;
  }, [data, sortKey, sortAsc]);

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

  const radarRetailers = tableData.slice(0, 6).map((r) => r.retailer);
  const radarColors = ["hsl(var(--primary))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))", "hsl(224 15% 45%)"];

  const hasData = data.length > 0;
  const dataSummary = `Retailers: ${chartData.slice(0, 5).map((r) => `${r.retailer} (${fmtZAR(r.revenue)})`).join(", ")}. Total retailers: ${chartData.length}. Benchmarking index: ${tableData.slice(0, 3).map((r) => `${r.retailer} index ${r.index}`).join(", ")}.`;

  if (loading) return <div className="p-8"><Skeleton className="h-96 w-full" /></div>;
  if (!hasData) return <div className="p-8"><EmptyState message="Upload data to see retailer analytics." /></div>;

  const SortIcon = ({ col }: { col: SortKey }) => (
    <ArrowUpDown className={`inline h-3 w-3 ml-1 cursor-pointer ${sortKey === col ? "text-primary" : "text-muted-foreground/40"}`} onClick={() => handleSort(col)} />
  );

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Retailers</h1>
        <p className="text-muted-foreground text-sm">Retailer channel intelligence — distribution effectiveness and choice architecture.</p>
      </div>
      <div className="flex items-center gap-3">
        <ExportCsvButton
          filename="Retailers"
          headers={["Retailer", "Revenue", "Units", "Avg Order Value", "Stores", "Index"]}
          rows={tableData.map((r) => [r.retailer, r.revenue, r.units, r.aov.toFixed(2), r.stores, r.index])}
        />
      </div>

      <Card className="glass-card">
        <CardHeader><CardTitle className="font-display text-base">Revenue by Retailer</CardTitle></CardHeader>
        <CardContent>
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

      {/* Retailer Performance Table */}
      <Card>
        <CardHeader><CardTitle className="font-display text-base">Retailer Performance</CardTitle></CardHeader>
        <CardContent>
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
                {tableData.map((r, i) => (
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
        </CardContent>
      </Card>

      <SignalStackInsights dataSummary={dataSummary} />
    </div>
  );
};

export default RetailersPage;
