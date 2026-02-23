import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { Inbox } from "lucide-react";
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

const GeographyPage = () => {
  const { data, loading } = useSellOutData();
  const [periodMode, setPeriodMode] = useState<PeriodMode>("MoM");
  const hasData = data.length > 0;

  useMemo(() => {
    if (data.length > 0) setPeriodMode(detectBestPeriodMode(data));
  }, [data.length]);

  const periodRanges = useMemo(() => {
    const refDate = findLatestDate(data);
    return getPeriodRanges(refDate, periodMode);
  }, [data, periodMode]);

  const currentData = useMemo(() => filterByDateRange(data, periodRanges.current), [data, periodRanges]);
  const previousData = useMemo(() => filterByDateRange(data, periodRanges.previous), [data, periodRanges]);

  // Top 5 stores
  const revByStore = aggregate(data, (r) => r.store_location ?? "Unknown", (r) => Number(r.revenue ?? 0));
  const storeData = Object.entries(revByStore).sort(([, a], [, b]) => b - a).slice(0, 5)
    .map(([store, revenue]) => ({ store, revenue: Math.round(revenue) }));

  // Revenue by province/region
  const revByRegion = aggregate(data, (r) => r.region ?? "Unknown", (r) => Number(r.revenue ?? 0));
  const curRevByRegion = aggregate(currentData, (r) => r.region ?? "Unknown", (r) => Number(r.revenue ?? 0));
  const prevRevByRegion = aggregate(previousData, (r) => r.region ?? "Unknown", (r) => Number(r.revenue ?? 0));

  const regionData = Object.entries(revByRegion).sort(([, a], [, b]) => b - a)
    .map(([region, revenue]) => ({
      region,
      revenue: Math.round(revenue),
      current: Math.round(curRevByRegion[region] ?? 0),
      previous: Math.round(prevRevByRegion[region] ?? 0),
    }));

  // Regional comparison chart
  const regionCompare = regionData.map((r) => ({
    region: r.region,
    current: r.current,
    previous: r.previous,
  }));

  // Province performance table with deltas
  const unitsByRegion = aggregate(data, (r) => r.region ?? "Unknown", (r) => Number(r.units_sold ?? 0));
  const provinceTable = regionData.map((r) => ({
    region: r.region,
    revenue: r.revenue,
    units: unitsByRegion[r.region] ?? 0,
    aov: (unitsByRegion[r.region] ?? 0) > 0 ? r.revenue / unitsByRegion[r.region] : 0,
    delta: computeDelta(r.current, r.previous),
  }));

  const chartTooltipStyle = { backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "0.5rem", fontSize: "0.75rem" };

  const dataSummary = `Top Stores: ${storeData.map((s) => `${s.store} (${fmtZAR(s.revenue)})`).join(", ")}. Regions: ${regionData.map((r) => `${r.region} (${fmtZAR(r.revenue)})`).join(", ")}. Period: ${periodRanges.current.label} vs ${periodRanges.previous.label}.`;

  if (loading) return <div className="p-8"><Skeleton className="h-96 w-full" /></div>;
  if (!hasData) return <div className="p-8 text-center"><Inbox className="h-10 w-10 mx-auto text-muted-foreground/30 mb-4" /><p className="text-muted-foreground">Upload data to see geographic analytics.</p></div>;

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold">Geography</h1>
          <p className="text-muted-foreground text-sm">Regional and store-level performance analysis.</p>
        </div>
        <PeriodSelector value={periodMode} onChange={setPeriodMode} />
      </div>

      <p className="text-xs text-muted-foreground">
        Comparing <span className="font-semibold text-foreground">{periodRanges.current.label}</span> vs <span className="font-semibold text-foreground">{periodRanges.previous.label}</span>
      </p>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="font-display text-base">Top 5 Stores by Revenue</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={storeData} layout="vertical" margin={{ left: 100 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis type="number" className="text-xs fill-muted-foreground" tickFormatter={(v) => fmtZAR(v)} />
                <YAxis type="category" dataKey="store" className="text-[10px] fill-muted-foreground" width={95} />
                <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number) => [fmtZAR(v), "Revenue"]} />
                <Bar dataKey="revenue" fill="hsl(var(--chart-5))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="font-display text-base">Revenue by Province</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={regionData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="region" className="text-xs fill-muted-foreground" />
                <YAxis className="text-xs fill-muted-foreground" tickFormatter={(v) => fmtZAR(v)} />
                <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number) => [fmtZAR(v), "Revenue"]} />
                <Bar dataKey="revenue" fill="hsl(var(--chart-3))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Province Period Comparison */}
      {regionCompare.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="font-display text-base">Province Revenue — Period Comparison</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={regionCompare}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="region" className="text-xs fill-muted-foreground" />
                <YAxis className="text-xs fill-muted-foreground" tickFormatter={(v) => fmtZAR(v)} />
                <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number, name: string) => [fmtZAR(v), name]} />
                <Legend />
                <Bar dataKey="current" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name={periodRanges.current.label} />
                <Bar dataKey="previous" fill="hsl(var(--chart-3))" radius={[4, 4, 0, 0]} name={periodRanges.previous.label} opacity={0.5} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Province Performance Table */}
      <Card>
        <CardHeader><CardTitle className="font-display text-base">Province Performance</CardTitle></CardHeader>
        <CardContent>
          <div className="rounded-lg border overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Province</TableHead>
                  <TableHead className="text-xs text-right">Revenue</TableHead>
                  <TableHead className="text-xs text-right">Units</TableHead>
                  <TableHead className="text-xs text-right">AOV</TableHead>
                  <TableHead className="text-xs text-right">Trend</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {provinceTable.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-sm font-medium">{r.region}</TableCell>
                    <TableCell className="text-sm text-right font-medium">{fmtZAR(r.revenue)}</TableCell>
                    <TableCell className="text-sm text-right">{r.units.toLocaleString()}</TableCell>
                    <TableCell className="text-sm text-right">{fmtZAR(r.aov)}</TableCell>
                    <TableCell className="text-right"><DeltaIndicator delta={r.delta} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <PotLabsInsights dataSummary={dataSummary} title="Geographic Insights" />
    </div>
  );
};

export default GeographyPage;
