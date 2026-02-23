import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowUpDown, Inbox } from "lucide-react";
import PotLabsInsights from "@/components/PotLabsInsights";
import PeriodSelector from "@/components/PeriodSelector";
import DeltaIndicator from "@/components/DeltaIndicator";
import { useSellOutData, fmtZAR, aggregate } from "@/hooks/useSellOutData";
import {
  type PeriodMode,
  getPeriodRanges,
  filterByDateRange,
  computeDelta,
  findLatestDate,
  detectBestPeriodMode,
} from "@/lib/period-utils";

type SortKey = "retailer" | "revenue" | "units" | "aov" | "stores" | "index";

const RetailersPage = () => {
  const { data, loading } = useSellOutData();
  const [sortKey, setSortKey] = useState<SortKey>("revenue");
  const [sortAsc, setSortAsc] = useState(false);
  const [periodMode, setPeriodMode] = useState<PeriodMode>("MoM");

  // Auto-detect period mode on first load
  useMemo(() => {
    if (data.length > 0) setPeriodMode(detectBestPeriodMode(data));
  }, [data.length]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  };

  const periodRanges = useMemo(() => {
    const refDate = findLatestDate(data);
    return getPeriodRanges(refDate, periodMode);
  }, [data, periodMode]);

  const currentData = useMemo(() => filterByDateRange(data, periodRanges.current), [data, periodRanges]);
  const previousData = useMemo(() => filterByDateRange(data, periodRanges.previous), [data, periodRanges]);

  // Revenue by retailer (all time for chart)
  const revByRetailer = aggregate(data, (r) => r.retailer ?? "Unknown", (r) => Number(r.revenue ?? 0));
  const chartData = Object.entries(revByRetailer).sort(([, a], [, b]) => b - a)
    .map(([retailer, revenue]) => ({ retailer, revenue: Math.round(revenue) }));

  // Period comparison by retailer
  const curRevByRetailer = aggregate(currentData, (r) => r.retailer ?? "Unknown", (r) => Number(r.revenue ?? 0));
  const prevRevByRetailer = aggregate(previousData, (r) => r.retailer ?? "Unknown", (r) => Number(r.revenue ?? 0));

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
      delta: computeDelta(curRevByRetailer[retailer] ?? 0, prevRevByRetailer[retailer] ?? 0),
    }));
    arr.sort((a, b) => {
      const mul = sortAsc ? 1 : -1;
      if (sortKey === "retailer") return mul * a.retailer.localeCompare(b.retailer);
      return mul * ((a[sortKey] as number) - (b[sortKey] as number));
    });
    return arr;
  }, [data, sortKey, sortAsc, curRevByRetailer, prevRevByRetailer]);

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
  const radarColors = ["hsl(var(--primary))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))", "hsl(175 65% 45%)"];

  const chartTooltipStyle = { backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "0.5rem", fontSize: "0.75rem" };
  const hasData = data.length > 0;
  const dataSummary = `Retailers: ${chartData.slice(0, 5).map((r) => `${r.retailer} (${fmtZAR(r.revenue)})`).join(", ")}. Total retailers: ${chartData.length}. Period: ${periodRanges.current.label} vs ${periodRanges.previous.label}.`;

  if (loading) return <div className="p-8"><Skeleton className="h-96 w-full" /></div>;
  if (!hasData) return <div className="p-8 text-center"><Inbox className="h-10 w-10 mx-auto text-muted-foreground/30 mb-4" /><p className="text-muted-foreground">Upload data to see retailer analytics.</p></div>;

  const SortIcon = ({ col }: { col: SortKey }) => (
    <ArrowUpDown className={`inline h-3 w-3 ml-1 cursor-pointer ${sortKey === col ? "text-primary" : "text-muted-foreground/40"}`} onClick={() => handleSort(col)} />
  );

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold">Retailers</h1>
          <p className="text-muted-foreground text-sm">Retailer channel performance breakdown.</p>
        </div>
        <PeriodSelector value={periodMode} onChange={setPeriodMode} />
      </div>

      <p className="text-xs text-muted-foreground">
        Comparing <span className="font-semibold text-foreground">{periodRanges.current.label}</span> vs <span className="font-semibold text-foreground">{periodRanges.previous.label}</span>
      </p>

      <Card>
        <CardHeader><CardTitle className="font-display text-base">Revenue by Retailer</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="retailer" className="text-xs fill-muted-foreground" />
              <YAxis className="text-xs fill-muted-foreground" tickFormatter={(v) => fmtZAR(v)} />
              <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number) => [fmtZAR(v), "Revenue"]} />
              <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Cross-Retailer Benchmarking Radar */}
      {radarData.length > 0 && radarRetailers.length >= 2 && (
        <Card>
          <CardHeader><CardTitle className="font-display text-base">Cross-Retailer Benchmarking</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={350}>
              <RadarChart data={radarData}>
                <PolarGrid className="stroke-border" />
                <PolarAngleAxis dataKey="dimension" className="text-xs fill-muted-foreground" />
                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} />
                {radarRetailers.map((retailer, i) => (
                  <Radar
                    key={retailer}
                    name={retailer}
                    dataKey={retailer}
                    stroke={radarColors[i % radarColors.length]}
                    fill={radarColors[i % radarColors.length]}
                    fillOpacity={0.1}
                    strokeWidth={2}
                  />
                ))}
                <Legend />
                <Tooltip contentStyle={chartTooltipStyle} />
              </RadarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Retailer Performance Table with Index and Deltas */}
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
                  <TableHead className="text-xs text-right">Trend</TableHead>
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
                    <TableCell className="text-right">
                      <DeltaIndicator delta={r.delta} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <PotLabsInsights dataSummary={dataSummary} />
    </div>
  );
};

export default RetailersPage;
